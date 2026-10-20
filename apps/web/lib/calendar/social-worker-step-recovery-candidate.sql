-- Isolated calendar+social worker transactional candidate; NEVER a migration.
-- All original state machine and in-flight safety checks are kept intact.
create or replace function public.calendar_social_worker_source_lock_probe(p_project uuid)
returns bigint language plpgsql security definer set search_path='' as $fn$
declare p_owner uuid; current_revision bigint;
begin
 select p.owner_id into p_owner from public.projects p where p.id=p_project;
 if not found then raise exception 'UNKNOWN_SOCIAL_PROJECT' using errcode='23503'; end if;
 select r.revision into current_revision from public.calendar_source_revision_probe r
 where r.owner_user_id=p_owner and r.project_id=p_project for update;
 if not found then raise exception 'MISSING_SOURCE_REVISION' using errcode='23514'; end if;
 return current_revision;
end $fn$;
revoke all on function public.calendar_social_worker_source_lock_probe(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.calendar_social_worker_source_lock_probe(uuid) to service_role;

-- This bump comes from the preceding worker-claim test-only prototype and
-- preserves owner/project scope. It is intentionally not newly granted here.
create or replace function public.social_schedule_locked_claim(p_claim jsonb) returns public.social_schedule_jobs language plpgsql security invoker set search_path='' as $fn$
declare j public.social_schedule_jobs;project uuid;
begin
 perform public.social_schedule_fields(p_claim,array['jobId','claimId','version']);
 select project_id into project from public.social_schedule_jobs where id=(p_claim->>'jobId')::uuid;
 if project is null then raise exception 'SOCIAL_SCHEDULE_NOT_FOUND' using errcode='P0002';end if;
 -- Calendar source version lock MUST precede project and job row locks.
 perform public.calendar_social_worker_source_lock_probe(project);
 perform 1 from public.projects where id=project for update;
 select * into j from public.social_schedule_jobs where id=(p_claim->>'jobId')::uuid for update;
 if j.state<>'claimed' or j.claim_id is distinct from (p_claim->>'claimId')::uuid or j.version<>(p_claim->>'version')::integer or j.lease_expires_at<=public.social_schedule_now() then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 return j;
end $fn$;

create or replace function public.social_schedule_step(p_claim jsonb,p_step jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare j public.social_schedule_jobs;r public.social_publications;a public.social_schedule_decisions;action text=p_step->>'action';old_state text;next_state text;snapshot jsonb;job_state text;checkpoint_reason text;
begin
 perform public.social_schedule_fields(p_step,array['action'],array['expectedVersion','capabilityHash','containerId','providerId','permalink','failureCode','reason']);
 if action not in ('prepare','claim_create','container_ready','claim_publish','complete','fail','uncertain','confirm_published','checkpoint') then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 j=public.social_schedule_locked_claim(p_claim);
 select * into r from public.social_publications where id=j.publication_id and job_id=j.id and project_id=j.project_id for update;
 if action='prepare' then
  perform public.social_schedule_fields(p_step,array['action']);
  snapshot=public.social_schedule_authority(j,true);
  if r.id is null then
   select * into a from public.social_schedule_decisions where id=j.approval_id and project_id=j.project_id;
   insert into public.social_publications(project_id,post_id,revision_id,sha256,decision_id,binding_id,channel,account_id,account_label,request_input,idempotency_key,requested_by,authority_source,job_id)
   values(j.project_id,j.post_id,j.revision_id,j.revision_sha256,(j.item->>'decisionId')::uuid,(j.item->>'bindingId')::uuid,j.channel,j.item->>'accountId',snapshot->'revision'->'binding'->>'label',jsonb_build_object('jobId',j.id,'approvalId',j.approval_id,'manifestSha256',snapshot->>'manifestSha256'),'schedule-'||j.id,a.actor,'scheduled',j.id) returning * into r;
   insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor,actor_kind,job_id,details) values(r.id,r.project_id,'requested',null,r.state,r.version,null,'worker',j.id,jsonb_build_object('approvalId',j.approval_id,'workerId',j.worker_id));
  end if;
 elsif action='checkpoint' then
  if p_step?'reason' and coalesce(p_step->>'reason','') not in ('release_required','stopped','review_required','disabled','budget_exhausted') then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
  if r.state in ('creating','publishing') then
   old_state=r.state;
   update public.social_publications set state='uncertain',version=version+1,updated_at=public.social_schedule_now(),failure_code='receipt_unavailable',capability_hash=null,capability_expires_at=null where id=r.id returning * into r;
   insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor,actor_kind,job_id,details) values(r.id,r.project_id,'uncertain',old_state,'uncertain',r.version,null,'worker',j.id,jsonb_build_object('workerId',j.worker_id,'reason','checkpoint_lost'));
  end if;
 else
  if r.id is null or jsonb_typeof(p_step->'expectedVersion') is distinct from 'number' then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
  if r.version<>(p_step->>'expectedVersion')::integer then return public.social_schedule_receipt(jsonb_build_object('jobId',j.id));end if;
  old_state=r.state;
  next_state=case
   when action='claim_create' and r.state='requested' then case when r.channel='instagram' then 'creating' else 'publishing' end
   when action='container_ready' and r.channel='instagram' and r.state='creating' then 'processing'
   when action='claim_publish' and r.channel='instagram' and r.state='processing' and r.container_id is not null then 'publishing'
   when action='complete' and r.state='publishing' then 'published'
   when action='fail' and r.state in ('creating','processing','publishing') then 'failed'
   when action='uncertain' and r.state in ('creating','publishing') then 'uncertain'
   when action='confirm_published' and r.channel='instagram' and r.container_id is not null and r.state in ('processing','publishing','uncertain') then 'published'
   else null end;
  if next_state is null then return public.social_schedule_receipt(jsonb_build_object('jobId',j.id));end if;
  if action in ('claim_create','claim_publish') then snapshot=public.social_schedule_authority(j,true);end if;
  if action='claim_create' then
   if coalesce(p_step->>'capabilityHash','') !~ '^[a-f0-9]{64}$' then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
   r.capability_hash=p_step->>'capabilityHash';r.capability_expires_at=least(public.social_schedule_now()+interval '15 minutes',j.expires_at);
  end if;
  if action='container_ready' then
   if coalesce(p_step->>'containerId','') !~ '^[0-9]{1,80}$' then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;r.container_id=p_step->>'containerId';
  end if;
  if action='complete' then
   if coalesce(p_step->>'providerId','') !~ '^[0-9]{1,80}(_[0-9]{1,80})?$' or p_step->>'permalink' is not null and not(case when r.channel='instagram' then p_step->>'permalink' ~ '^https://www[.]instagram[.]com/[^[:space:]]+$' else p_step->>'permalink' ~ '^https://www[.]facebook[.]com/[^[:space:]]+$' end) then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
   r.provider_id=p_step->>'providerId';r.permalink=p_step->>'permalink';r.confirmation='provider_id';r.failure_code=null;
  end if;
  if action='confirm_published' then r.confirmation='container_status';r.failure_code=null;end if;
  if action in ('fail','uncertain') then
   if coalesce(p_step->>'failureCode','') not in ('provider_denied','provider_unavailable','invalid_response','receipt_unavailable') then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;r.failure_code=p_step->>'failureCode';
  end if;
  if next_state in ('published','failed','uncertain') then r.capability_hash=null;r.capability_expires_at=null;end if;
  update public.social_publications set state=next_state,version=version+1,updated_at=public.social_schedule_now(),container_id=r.container_id,provider_id=r.provider_id,permalink=r.permalink,failure_code=r.failure_code,confirmation=r.confirmation,capability_hash=r.capability_hash,capability_expires_at=r.capability_expires_at where id=r.id returning * into r;
  insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor,actor_kind,job_id,details)
  values(r.id,r.project_id,action,old_state,r.state,r.version,null,'worker',j.id,jsonb_build_object('approvalId',j.approval_id,'workerId',j.worker_id,'releaseEvidenceId',snapshot->>'releaseEvidenceId'));
 end if;
 checkpoint_reason=p_step->>'reason';
 job_state=case when r.state in ('published','failed','uncertain') then r.state
  when action='checkpoint' and checkpoint_reason in ('stopped','review_required','disabled') then 'blocked'
  when action='checkpoint' and public.social_schedule_now()>j.expires_at then 'missed'
  when action='checkpoint' then 'waiting' else 'claimed' end;
 update public.social_schedule_jobs set publication_id=r.id,state=job_state,version=version+1,reason=checkpoint_reason,lease_expires_at=case when job_state='claimed' then lease_expires_at else null end,updated_at=public.social_schedule_now() where id=j.id returning * into j;
 insert into public.social_schedule_events(project_id,job_id,batch_revision_id,event,actor_kind,worker_id,details)
 values(j.project_id,j.id,j.batch_revision_id,action,'worker',j.worker_id,jsonb_build_object('state',j.state,'publicationId',r.id,'publicationVersion',r.version,'reason',checkpoint_reason,'releaseEvidenceId',snapshot->>'releaseEvidenceId'));
 perform public.calendar_social_worker_source_bump_probe(j.project_id);
 return public.social_schedule_receipt(jsonb_build_object('jobId',j.id));
end $fn$;

create or replace function public.social_schedule_recover_checkpoint(p_claim jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare project uuid;j public.social_schedule_jobs;r public.social_publications;old_state text;next_state text;
begin
 perform public.social_schedule_fields(p_claim,array['jobId','claimId','version']);
 select project_id into project from public.social_schedule_jobs where id=(p_claim->>'jobId')::uuid;
 if project is null then raise exception 'SOCIAL_SCHEDULE_NOT_FOUND' using errcode='P0002';end if;
 -- Block before project row lock while an atomic calendar batch is active.
 perform public.calendar_social_worker_source_lock_probe(project);
 perform 1 from public.projects where id=project for update;
 select * into j from public.social_schedule_jobs where id=(p_claim->>'jobId')::uuid for update;
 if j.claim_id is distinct from (p_claim->>'claimId')::uuid or j.version<>(p_claim->>'version')::integer then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 if j.state in ('published','failed','uncertain','blocked','cancelled','missed') then return public.social_schedule_receipt(jsonb_build_object('jobId',j.id));end if;
 if j.state<>'claimed' then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 select * into r from public.social_publications where id=j.publication_id and project_id=j.project_id and job_id=j.id for update;
 if r.state in ('creating','publishing') then
  old_state=r.state;
  update public.social_publications set state='uncertain',version=version+1,updated_at=public.social_schedule_now(),failure_code='receipt_unavailable',capability_hash=null,capability_expires_at=null where id=r.id returning * into r;
  insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor,actor_kind,job_id,details)
  values(r.id,r.project_id,'uncertain',old_state,'uncertain',r.version,null,'worker',j.id,jsonb_build_object('workerId',j.worker_id,'reason','checkpoint_recovery'));
 end if;
 next_state=case when r.state in ('published','failed','uncertain') then r.state when public.social_schedule_now()>j.expires_at then 'missed' else 'waiting' end;
 update public.social_schedule_jobs set state=next_state,version=version+1,reason=case when next_state='uncertain' then 'receipt_unavailable' when next_state='missed' then 'time_window_expired' else null end,lease_expires_at=null,updated_at=public.social_schedule_now() where id=j.id;
 insert into public.social_schedule_events(project_id,job_id,batch_revision_id,event,actor_kind,worker_id,details)
 values(j.project_id,j.id,j.batch_revision_id,'checkpoint_recovered','worker',j.worker_id,jsonb_build_object('claimId',j.claim_id,'state',next_state,'publicationId',r.id));
 perform public.calendar_social_worker_source_bump_probe(j.project_id);
 return public.social_schedule_receipt(jsonb_build_object('jobId',j.id));
end $fn$;
revoke all on function public.social_schedule_locked_claim(jsonb),
 public.social_schedule_step(jsonb,jsonb),
 public.social_schedule_recover_checkpoint(jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.social_schedule_locked_claim(jsonb),
 public.social_schedule_step(jsonb,jsonb),
 public.social_schedule_recover_checkpoint(jsonb) to service_role;
