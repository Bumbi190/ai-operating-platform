begin;
-- Bounded saved-draft recovery protocol. Existing access, lifecycle, stop,
-- claim, cancellation, plan and budget admission rules remain canonical.
create or replace function public.website_build_lock_writer(p_writer jsonb,p_allow_pause boolean default false) returns public.website_build_sessions language plpgsql security invoker set search_path='' as $$
declare r public.runs; s public.website_build_sessions;
begin
 perform 1 from public.projects where id=(p_writer->>'projectId')::uuid for update;
 if not found or exists(select 1 from public.project_lifecycle where project_id=(p_writer->>'projectId')::uuid and state<>'active') then raise exception 'WEBSITE_WRITER_FENCED' using errcode='40001'; end if;
 begin
  select * into r from public.runs where id=(p_writer->>'runId')::uuid for update nowait;
 exception when lock_not_available then
  raise exception 'WEBSITE_WRITER_BUSY' using errcode='40001';
 end;
 if not found or r.project_id is distinct from (p_writer->>'projectId')::uuid or r.claim_id is distinct from (p_writer->>'claimId')::uuid or r.status<>'running' or r.lease_until is null or r.lease_until<=clock_timestamp() or r.kind is distinct from 'website.static.build.v1' then raise exception 'WEBSITE_WRITER_FENCED' using errcode='40001'; end if;
 if coalesce((r.context->>'atlasLifecycleVersion')::bigint,0) is distinct from coalesce((select version from public.project_lifecycle where project_id=r.project_id),0) then raise exception 'WEBSITE_WRITER_FENCED' using errcode='40001'; end if;
 if r.cancel_requested then raise exception 'WEBSITE_RUN_CANCELLED' using errcode='57014'; end if;
 select * into s from public.website_build_sessions where id=(p_writer->>'sessionId')::uuid and project_id=r.project_id for update;
 if not found or s.current_run_id is distinct from r.id or s.generation is distinct from (p_writer->>'generation')::bigint or (r.input->>'generation')::bigint is distinct from s.generation then raise exception 'WEBSITE_WRITER_FENCED' using errcode='40001'; end if;
 if s.control_requested='cancel' then raise exception 'WEBSITE_RUN_CANCELLED' using errcode='57014'; end if;
 -- Old deployments must fail before snapshot acquisition, never regenerate.
 if (r.input ? 'recovery' or r.input ? 'recoveryNoPaid') and p_writer->'recoveryVersion' is distinct from '1'::jsonb then raise exception 'RECOVERY_WORKER_REQUIRED' using errcode='22023'; end if;
 if not p_allow_pause and s.control_requested='pause' then raise exception 'WEBSITE_BUILD_PAUSING' using errcode='55000'; end if;
 return s;
end $$;

create or replace function public.website_build_enqueue(p_session_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.website_build_sessions; rid uuid:=gen_random_uuid(); nextgen bigint; no_paid boolean;
begin
 perform public.website_build_studio_require_active((select project_id from public.website_build_sessions where id=p_session_id));
 select * into strict s from public.website_build_sessions where id=p_session_id for update;
 if s.current_run_id is not null then return s.current_run_id; end if;
 if s.control_requested is not null or s.status in ('paused','cancelled','cancelling') then raise exception 'CONTROL_PENDING' using errcode='55000'; end if;
 if exists(select 1 from public.website_build_studio_intents where project_id=s.project_id) and not exists(select 1 from public.project_budgets where project_id=s.project_id and monthly_sek is not null) then raise exception 'PROJECT_BUDGET_REQUIRED' using errcode='55000'; end if;
 -- Preserve no-paid intent across pause/resume, failure and feedback successors.
 -- It is deliberately sticky; this incident does not authorize paid revisions.
 select r.input ? 'recovery' or r.input ? 'recoveryNoPaid' into no_paid from public.runs r where r.project_id=s.project_id and r.kind='website.static.build.v1' and r.input->>'sessionId'=s.id::text and r.input->>'generation'=s.generation::text order by r.created_at desc,r.id limit 1;
 nextgen:=s.generation+1;
 insert into public.runs(id,project_id,workflow_id,kind,status,input,context,policy_class) values(rid,s.project_id,null,'website.static.build.v1','pending',jsonb_build_object('projectId',s.project_id,'sessionId',s.id,'generation',nextgen,'feedbackSequence',s.feedback_seq)||case when coalesce(no_paid,false) then '{"recoveryNoPaid":true}'::jsonb else '{}'::jsonb end,jsonb_build_object('atlasLifecycleVersion',coalesce((select version from public.project_lifecycle where project_id=s.project_id),0),'websiteBuildIdempotencyKey','website:'||s.id||':'||nextgen),'non_destructive');
 update public.website_build_sessions set current_run_id=rid,generation=nextgen,status='queued',stage='Väntar på byggjobbet',state_version=state_version+1,updated_at=now() where id=s.id;
 return rid;
end $$;
commit;
