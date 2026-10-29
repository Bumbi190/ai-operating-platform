\set ON_ERROR_STOP on
-- Synthetic, disposable Postgres only. The local v_local timestamp inside
-- the TWO proposed SQL RPC bodies is replaced in the test runner's IN-MEMORY
-- COPY with 2027-01-03 15:10 Europe/Stockholm. Production code is unchanged.
-- This verifies actual accepted January enqueue and paid admission, not just
-- an early-window rejection.

set role authenticated;
set "request.jwt.claim.sub"='77777777-7777-4777-8777-777777777777';
insert into public.family_weekly_auto_consent_events(
 project_id,owner_id,action,valid_until
) values(
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 '77777777-7777-4777-8777-777777777777',
 'enable',clock_timestamp()+interval '80 days'
);
reset role;
set role service_role;
do $$
declare
 v_project constant uuid:='77cda551-57c9-4dc0-b019-1bb6438777f7';
 v_owner constant uuid:='77777777-7777-4777-8777-777777777777';
 v_conv constant uuid:='55555555-5555-4555-8555-555555555555';
 v_claim constant uuid:='88888888-8888-4888-8888-888888888888';
 v_run uuid;
 v_event bigint;
 v_queued jsonb;
 v_second jsonb;
 v_admitted jsonb;
 v_denied jsonb;
 v_saved jsonb;
begin
 -- The cost-free Sunday enqueue also respects native STOP sources.
 update public.projects set execution_paused=true where id=v_project;
 v_queued:=public.family_weekly_enqueue_once();
 if v_queued->>'status' is distinct from 'blocked' then
  raise exception 'PAUSED_PROJECT_QUEUED_RUN';
 end if;
 update public.projects set execution_paused=false where id=v_project;
 update public.platform_config set automation_paused=true;
 v_queued:=public.family_weekly_enqueue_once();
 if v_queued->>'status' is distinct from 'blocked' then
  raise exception 'GLOBAL_STOP_QUEUED_RUN';
 end if;
 update public.platform_config set automation_paused=false;
 insert into public.project_lifecycle(project_id,state) values(v_project,'hibernate');
 v_queued:=public.family_weekly_enqueue_once();
 if v_queued->>'status' is distinct from 'blocked' then
  raise exception 'INACTIVE_PROJECT_QUEUED_RUN';
 end if;
 delete from public.project_lifecycle where project_id=v_project;
 v_queued:=public.family_weekly_enqueue_once();
 if v_queued->>'status' is distinct from 'queued' or
  v_queued->>'weekStart' is distinct from '2027-01-04' or
  v_queued->'publicationAuthority' is distinct from 'false'::jsonb then
  raise exception 'JANUARY_SUNDAY_QUEUE_NOT_CREATED: %',v_queued;
 end if;
 v_run:=(v_queued->>'runId')::uuid;
 select consent_event_id into v_event
  from public.family_weekly_run_plans where run_id=v_run;
 if v_event is null then raise exception 'PERSISTED_CONSENT_NOT_FOUND';end if;
 if (select count(*) from public.family_weekly_run_plans where project_id=v_project and week_start='2027-01-04')<>1 then
  raise exception 'MORE_THAN_ONE_QUEUE_PLAN';
 end if;
 if not exists (
  select 1 from public.runs
  where id=v_run and project_id=v_project
   and kind='family_weekly_editorial_drafts' and workflow_id is null
   and workflow_instance_id is null and idempotency_key is null
   and max_attempts=1 and attempts=0 and status='pending'
   and input->>'ownerId'=v_owner::text
   and input->>'conversationId'=v_conv::text
   and input->>'eventId'=v_event::text
   and input->>'weekStart'='2027-01-04'
 ) then raise exception 'QUEUED_NATIVE_RUN_SHAPE_INVALID';end if;
 v_second:=public.family_weekly_enqueue_once();
 if v_second->>'status' is distinct from 'already_queued' then
  raise exception 'SECOND_QUEUE_WAS_NOT_BLOCKED: %',v_second;
 end if;
 if (select count(*) from public.family_weekly_run_plans)<>1 then
  raise exception 'QUEUE_PLAN_DUPLICATED';
 end if;
 -- Simulate the canonical existing claim_runs transition, not invent an
 -- owner/run grant. The registered plan is checked against this same row.
 update public.runs set status='running',claim_id=v_claim,attempts=1,
  lease_until=clock_timestamp()+interval '25 minutes' where id=v_run;
 if not public.family_weekly_authority_current(
  v_owner,v_run,v_claim,v_event,v_conv,'2027-01-04'
 ) then raise exception 'QUEUED_RUN_CLAIM_NOT_VERIFIED';end if;
 -- A STOP arriving after claim but before provider admission must also
 -- block cost even while the clock is still in the Sunday window.
 update public.platform_config set automation_paused=true;
 v_denied:=public.family_weekly_admit_once(
  v_owner,'2027-01-04',v_run,v_claim,v_event,v_conv
 );
 if v_denied->>'status' is distinct from 'blocked' or
  (select count(*) from public.family_weekly_model_attempts)<>0 then
  raise exception 'STOP_DID_NOT_BLOCK_PAID_ADMISSION';
 end if;
 update public.platform_config set automation_paused=false;
 v_admitted:=public.family_weekly_admit_once(
  v_owner,'2027-01-04',v_run,v_claim,v_event,v_conv
 );
 if v_admitted->>'status' is distinct from 'admitted' or
  v_admitted->'publicationAuthority' is distinct from 'false'::jsonb then
  raise exception 'PAID_ADMISSION_FAILED: %',v_admitted;
 end if;
 v_denied:=public.family_weekly_admit_once(
  v_owner,'2027-01-04',v_run,v_claim,v_event,v_conv
 );
 if v_denied->>'status' is distinct from 'blocked' then
  raise exception 'SECOND_PAID_ATTEMPT_NOT_BLOCKED';
 end if;
 if (select count(*) from public.family_weekly_model_attempts)<>1 then
  raise exception 'MODEL_ATTEMPTS_DUPLICATED';
 end if;
 v_saved:=public.family_weekly_save_editorial_if_current(
  v_owner,v_run,v_claim,v_event,v_conv,
  jsonb_build_object('projectId',v_project,'conversationId',v_conv,
   'weekStart','2027-01-04','contextHash',repeat('a',64),
   'generation',1,'drafts','[]'::jsonb)
 );
 if v_saved->>'status' is distinct from 'editorial_review_required' or
  v_saved->'publicationAuthority' is distinct from 'false'::jsonb then
  raise exception 'REVIEW_ONLY_SAVE_FAILED';
 end if;
 insert into public.family_weekly_review_notices(
  project_id,owner_id,preparation_id,week_start,draft_count
 ) values(v_project,v_owner,(v_saved->>'preparationId')::uuid,'2027-01-04',2);
 if (select count(*) from public.family_weekly_review_notices)<>1 then
  raise exception 'REVIEW_NOTICE_NOT_PERSISTED';
 end if;
end $$;

-- A later explicit owner revoke does not erase the immutable one-per-week
-- attempt or queue; it simply blocks further authority.
reset role;
set role authenticated;
set "request.jwt.claim.sub"='77777777-7777-4777-8777-777777777777';
insert into public.family_weekly_auto_consent_events(
 project_id,owner_id,action,valid_until
) values(
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 '77777777-7777-4777-8777-777777777777',
 'revoke',null
);
reset role;
set role service_role;
do $$
declare
 v_owner constant uuid:='77777777-7777-4777-8777-777777777777';
 v_run uuid;
 v_event bigint;
begin
 select run_id,consent_event_id into v_run,v_event
  from public.family_weekly_run_plans limit 1;
 if public.family_weekly_authority_current(
  v_owner,v_run,'88888888-8888-4888-8888-888888888888',
  v_event,'55555555-5555-4555-8555-555555555555','2027-01-04'
 ) then raise exception 'OLD_CLAIM_AFTER_REVOKE_STILL_ACTIVE';end if;
 if (select count(*) from public.family_weekly_run_plans)<>1 or
  (select count(*) from public.family_weekly_model_attempts)<>1 then
  raise exception 'PERMANENT_DUPLICATE_FENCE_LOST_AFTER_REVOKE';
 end if;
end $$;
reset role;
select 'FAMILY_WEEKLY_SYNTHETIC_SUNDAY_QUEUE_ONCE_AND_MODEL_ONCE_PASS' as result;
