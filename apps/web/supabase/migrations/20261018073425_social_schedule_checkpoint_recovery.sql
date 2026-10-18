
-- History-only recovery: an expired claim can never authorize another provider POST.
-- CAS remains bound to the same claim/version; only persisted evidence chooses state.
create function public.social_schedule_recover_checkpoint(p_claim jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare project uuid;j public.social_schedule_jobs;r public.social_publications;old_state text;next_state text;
begin
 perform public.social_schedule_fields(p_claim,array['jobId','claimId','version']);
 select project_id into project from public.social_schedule_jobs where id=(p_claim->>'jobId')::uuid;
 if project is null then raise exception 'SOCIAL_SCHEDULE_NOT_FOUND' using errcode='P0002';end if;
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
 return public.social_schedule_receipt(jsonb_build_object('jobId',j.id));
end $fn$;
revoke all on function public.social_schedule_recover_checkpoint(jsonb) from public,anon,authenticated;
grant execute on function public.social_schedule_recover_checkpoint(jsonb) to service_role;
