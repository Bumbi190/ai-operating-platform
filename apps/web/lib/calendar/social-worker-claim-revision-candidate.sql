-- ISOLATED SQL REVIEW ONLY: not a migration, no provider calls.
-- Restricted service-role helpers use trusted owner/project data, not client JWTs.
create or replace function public.calendar_social_worker_try_source_lock_probe(p_project uuid)
returns boolean language plpgsql security definer set search_path='' as $fn$
declare owner uuid; selected uuid;
begin
 select p.owner_id into owner from public.projects p where p.id=p_project;
 if not found then raise exception 'UNKNOWN_SOCIAL_PROJECT' using errcode='23503';end if;
 select r.project_id into selected from public.calendar_source_revision_probe r
 where r.project_id=p_project and r.owner_user_id=owner
 for update skip locked;
 if found then return true;end if;
 if not exists(select 1 from public.calendar_source_revision_probe r
               where r.project_id=p_project and r.owner_user_id=owner)
 then raise exception 'MISSING_SOURCE_REVISION' using errcode='23514';end if;
 return false;
end $fn$;
revoke all on function public.calendar_social_worker_try_source_lock_probe(uuid) from public,anon,authenticated,service_role;
grant execute on function public.calendar_social_worker_try_source_lock_probe(uuid) to service_role;

create or replace function public.calendar_social_worker_source_bump_probe(p_project uuid)
returns bigint language plpgsql security definer set search_path='' as $fn$
declare owner uuid; v_next bigint;
begin
 select p.owner_id into owner from public.projects p where p.id=p_project;
 if not found then raise exception 'UNKNOWN_SOCIAL_PROJECT' using errcode='23503';end if;
 update public.calendar_source_revision_probe set revision=revision+1
 where project_id=p_project and owner_user_id=owner
 returning revision into v_next;
 if not found then raise exception 'MISSING_SOURCE_REVISION' using errcode='23514';end if;
 return v_next;
end $fn$;
revoke all on function public.calendar_social_worker_source_bump_probe(uuid) from public,anon,authenticated,service_role;
grant execute on function public.calendar_social_worker_source_bump_probe(uuid) to service_role;

create or replace function public.social_schedule_claim(p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare candidate record;j public.social_schedule_jobs;r public.social_publications;t timestamptz=public.social_schedule_now();refusal text;old_state text;
begin
 perform public.social_schedule_fields(p_input,array['workerId','now','dryRun','projectIds']);
 if coalesce(p_input->>'workerId','') !~ '^[A-Za-z0-9_-]{1,100}$' or jsonb_typeof(p_input->'dryRun') is distinct from 'boolean' or jsonb_typeof(p_input->'projectIds') is distinct from 'array' or jsonb_array_length(p_input->'projectIds')>100 or abs(extract(epoch from ((p_input->>'now')::timestamptz-t)))>5 then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 if p_input->'dryRun'='true'::jsonb then return null;end if;
 for candidate in select id,project_id from public.social_schedule_jobs where project_id::text in(select jsonb_array_elements_text(p_input->'projectIds')) and scheduled_at<=t and (state in ('queued','waiting') or state='claimed' and lease_expires_at<=t)
 and not(state='waiting' and coalesce(reason,'')='release_required' and t<=expires_at and not exists(select 1 from public.social_monthly_release_evidence e join public.social_schedule_decisions a on a.id=public.social_schedule_jobs.approval_id where e.project_id=public.social_schedule_jobs.project_id and e.release_month=public.social_schedule_jobs.release_month and e.catalog_sha256=item->'releaseCondition'->>'catalogSha256' and e.kind='owner_verified_access' and e.verified_by=a.actor and e.verified_at between t-interval '24 hours' and t))
 order by scheduled_at,case when state='waiting' then 1 else 0 end,updated_at,id limit 50 loop
  -- Same lock order as owner mutations: project, then job. A busy project is skipped.
  -- Source version is locked before project/job rows. Busy sources are skipped.
  if not public.calendar_social_worker_try_source_lock_probe(candidate.project_id)
  then continue;end if;
  perform 1 from public.projects where id=candidate.project_id for update skip locked;if not found then continue;end if;
  select * into j from public.social_schedule_jobs where id=candidate.id and (state in ('queued','waiting') or state='claimed' and lease_expires_at<=t) for update skip locked;
  if not found then continue;end if;
  select * into r from public.social_publications where id=j.publication_id for update;
  if r.state in ('published','failed','uncertain','creating','publishing') then
   if r.state in ('creating','publishing') then
    old_state=r.state;
    update public.social_publications set state='uncertain',version=version+1,updated_at=t,failure_code='receipt_unavailable',capability_hash=null,capability_expires_at=null where id=r.id returning * into r;
    insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor,actor_kind,job_id,details) values(r.id,r.project_id,'uncertain',old_state,'uncertain',r.version,null,'worker',j.id,jsonb_build_object('reason','lease_expired','workerId',p_input->>'workerId'));
   end if;
   update public.social_schedule_jobs set state=r.state,version=version+1,reason=case when r.state='uncertain' then 'receipt_unavailable' else null end,lease_expires_at=null,updated_at=t where id=j.id;
   insert into public.social_schedule_events(project_id,job_id,batch_revision_id,event,actor_kind,worker_id,details) values(j.project_id,j.id,j.batch_revision_id,'lease_recovered','worker',p_input->>'workerId',jsonb_build_object('state',r.state));
   perform public.calendar_social_worker_source_bump_probe(candidate.project_id);
   continue;
  end if;
  if t>j.expires_at then
   update public.social_schedule_jobs set state='missed',version=version+1,reason='time_window_expired',lease_expires_at=null,updated_at=t where id=j.id;
   insert into public.social_schedule_events(project_id,job_id,batch_revision_id,event,actor_kind,worker_id) values(j.project_id,j.id,j.batch_revision_id,'missed','worker',p_input->>'workerId');
   perform public.calendar_social_worker_source_bump_probe(candidate.project_id);
   continue;
  end if;
  begin perform public.social_schedule_authority(j,false);
  exception when others then
   refusal=case when sqlerrm like '%SOCIAL_SCHEDULE_STOPPED%' then 'stopped' else 'review_required' end;
   update public.social_schedule_jobs set state='blocked',version=version+1,reason=refusal,lease_expires_at=null,updated_at=t where id=j.id;
   insert into public.social_schedule_events(project_id,job_id,batch_revision_id,event,actor_kind,worker_id,details) values(j.project_id,j.id,j.batch_revision_id,'blocked','worker',p_input->>'workerId',jsonb_build_object('reason',refusal));
   perform public.calendar_social_worker_source_bump_probe(candidate.project_id);
   continue;
  end;
  update public.social_schedule_jobs set state='claimed',version=version+1,claim_id=gen_random_uuid(),worker_id=p_input->>'workerId',lease_expires_at=t+interval '90 seconds',reason=null,updated_at=t where id=j.id returning * into j;
  insert into public.social_schedule_events(project_id,job_id,batch_revision_id,event,actor_kind,worker_id,details) values(j.project_id,j.id,j.batch_revision_id,'claimed','worker',j.worker_id,jsonb_build_object('claimId',j.claim_id,'version',j.version));
  perform public.calendar_social_worker_source_bump_probe(candidate.project_id);
  return jsonb_build_object('jobId',j.id,'claimId',j.claim_id,'version',j.version,'leaseExpiresAt',j.lease_expires_at,'snapshot',public.social_schedule_snapshot(j));
 end loop;
 return null;
end $fn$;
revoke all on function public.social_schedule_claim(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.social_schedule_claim(jsonb) to service_role;
