\set ON_ERROR_STOP on
-- Disposable PostgreSQL 16/17 ONLY. Exercises real concurrent owner
-- revocation vs a worker's first *potentially charged* AI admission.
-- All connections use the container-local Unix socket; no provider, API,
-- production database, network ports or social scheduler are contacted.
-- Actual canonical claim_runs and the proposed Family enqueue/admit RPCs
-- are loaded separately by run-family-weekly-pg-smoke.ps1.
create extension if not exists dblink;

-- Establish a current, time-bounded owner consent. The actual authenticated
-- role inserts via the proposed RLS and append-only trigger, not a fake
-- service_role-issued authorization.
set role authenticated;
set "request.jwt.claim.sub"='77777777-7777-4777-8777-777777777777';
insert into public.family_weekly_auto_consent_events(
 project_id,owner_id,action,valid_until
) values (
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 '77777777-7777-4777-8777-777777777777',
 'enable',clock_timestamp()+interval '80 days'
);
reset role;

-- Keep the unrelated baseline synthetic run out of the real claim queue.
set role service_role;
update public.runs set status='cancelled'
where id='66666666-6666-4666-8666-666666666666';
select 'FAMILY_WEEKLY_REVOKE_RACE_QUEUED='||
 (public.family_weekly_enqueue_once()->>'status') as result;
reset role;

-- The real claim runs in a SEPARATE transaction. Subsequent dblink sessions
-- see its committed claim_id and the durable one-per-week queue entry.
set role service_role;
select 'FAMILY_WEEKLY_REVOKE_RACE_NATIVE_CLAIM='||id as result
from public.claim_runs(5,600);
reset role;

do $$
declare
 v_project constant uuid:='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid;
 v_owner constant uuid:='77777777-7777-4777-8777-777777777777'::uuid;
 v_plan public.family_weekly_run_plans%rowtype;
 v_claim uuid;
 v_lock text:='family-weekly:'||v_project::text;
 v_admit_sql text;
 v_revoke_sql text;
 v_revoke_event text;
 v_admission text;
 v_revoke_pid integer;
 v_admit_pid integer;
 v_revoker_waiting boolean;
 v_both_waiting integer;
 v_admit_after jsonb;
begin
 select * into strict v_plan from public.family_weekly_run_plans
 where project_id=v_project and week_start='2027-01-04';
 select r.claim_id into strict v_claim
 from public.runs r
 where r.id=v_plan.run_id
 and r.status='running'
 and r.attempts=1 and r.max_attempts=1
 and r.lease_until>clock_timestamp();
 if v_claim is null or
 not public.family_weekly_authority_current(
  v_owner,v_plan.run_id,v_claim,v_plan.consent_event_id,
  v_plan.conversation_id,v_plan.week_start
 ) then raise exception 'REVOKE_RACE_NO_NATIVE_CLAIM_AUTHORITY';end if;

 if has_function_privilege(
   'authenticated',
   'public.family_weekly_admit_once(uuid,date,uuid,uuid,bigint,uuid)',
   'EXECUTE'
 ) or has_function_privilege(
   'authenticated','public.family_weekly_enqueue_once()','EXECUTE'
 ) then raise exception 'REVOKE_RACE_CLIENT_CAN_INVOKE_WORKER_RPC';end if;

 v_revoke_sql:=format(
  'insert into public.family_weekly_auto_consent_events(project_id,owner_id,action,valid_until) values (%L::uuid,%L::uuid,''revoke'',null) returning event_id::text as result',
  v_project,v_owner
 );
 v_admit_sql:=format(
  'select public.family_weekly_admit_once(%L::uuid,%L::date,%L::uuid,%L::uuid,%L::bigint,%L::uuid)::text as result',
  v_owner,v_plan.week_start,v_plan.run_id,v_claim,
  v_plan.consent_event_id,v_plan.conversation_id
 );

 perform public.dblink_connect('fwr','host=/var/run/postgresql dbname=postgres user=postgres');
 perform public.dblink_connect('fwa','host=/var/run/postgresql dbname=postgres user=postgres');
 perform public.dblink_connect('fwl','host=/var/run/postgresql dbname=postgres user=postgres');

 perform public.dblink_exec('fwr','set role authenticated');
 perform public.dblink_exec('fwr',
   'set "request.jwt.claim.sub"=''77777777-7777-4777-8777-777777777777''');
 perform public.dblink_exec('fwa','set role service_role');
 select pid into strict v_revoke_pid
 from public.dblink('fwr','select pg_backend_pid()') as t(pid integer);
 select pid into strict v_admit_pid
 from public.dblink('fwa','select pg_backend_pid()') as t(pid integer);

 -- Hold the exact lock used by consent trigger and paid admission.
 -- Start the owner's REVOKE first, verify it waits on the lock, then
 -- start the paid admission second and verify it also waits.
 perform public.dblink_exec('fwl','begin');
 perform public.dblink_exec('fwl',
  format('DO $q$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L,0)); END $q$;',v_lock)
 );
 if public.dblink_send_query('fwr',v_revoke_sql)<>1 then
  raise exception 'REVOKE_RACE_OWNER_REQUEST_NOT_STARTED';
 end if;
 perform pg_catalog.pg_sleep(0.25);
 select (wait_event_type='Lock' and wait_event='advisory')
 into strict v_revoker_waiting from pg_catalog.pg_stat_activity
 where pid=v_revoke_pid;
 if public.dblink_is_busy('fwr')<>1 or v_revoker_waiting is not true then
  raise exception 'REVOKE_RACE_OWNER_DID_NOT_WAIT_FIRST';
 end if;

 if public.dblink_send_query('fwa',v_admit_sql)<>1 then
  raise exception 'REVOKE_RACE_PAID_REQUEST_NOT_STARTED';
 end if;
 perform pg_catalog.pg_sleep(0.25);
 select count(*) into v_both_waiting from pg_catalog.pg_stat_activity
 where pid in (v_revoke_pid,v_admit_pid)
 and wait_event_type='Lock' and wait_event='advisory';
 if v_both_waiting<>2 or public.dblink_is_busy('fwa')<>1
 or public.dblink_is_busy('fwr')<>1 then
  raise exception 'REVOKE_RACE_WORKERS_NOT_BOTH_WAITING count=%',v_both_waiting;
 end if;

 -- The genuine advisory lock queue must serialize revoke ahead of admit.
 -- After revocation commits, the other worker must NOT receive permission
 -- for any provider request, even though it started before the revoke.
 perform public.dblink_exec('fwl','commit');
 select result into strict v_revoke_event
 from public.dblink_get_result('fwr') as t(result text);
 select result into strict v_admission
 from public.dblink_get_result('fwa') as t(result text);
 if v_revoke_event is null
 or coalesce(v_admission::jsonb->>'status','')<>'blocked' then
  raise exception 'REVOKE_RACE_PAID_ADMISSION_NOT_BLOCKED: %',v_admission;
 end if;
 if (select action from public.family_weekly_auto_consent_events
   where project_id=v_project order by event_id desc limit 1)<>'revoke'
 or (select count(*) from public.family_weekly_model_attempts)<>0
 or (select count(*) from public.family_weekly_run_plans)<>1
 or (select count(*) from public.social_weekly_preparations)<>0
 or public.family_weekly_authority_current(
  v_owner,v_plan.run_id,v_claim,v_plan.consent_event_id,
  v_plan.conversation_id,v_plan.week_start
 ) then raise exception 'REVOKE_RACE_REVOKE_DID_NOT_FENCE_COST_AND_DRAFTS';end if;

 -- A later attempt cannot resurrect cost authority or create a duplicate
 -- run, even though the canonical claim is still leased and running.
 v_admit_after:=public.family_weekly_admit_once(
  v_owner,v_plan.week_start,v_plan.run_id,v_claim,
  v_plan.consent_event_id,v_plan.conversation_id
 );
 if v_admit_after->>'status'<>'blocked'
 or (public.family_weekly_enqueue_once())->>'status'<>'already_queued'
 or (select count(*) from public.family_weekly_model_attempts)<>0 then
  raise exception 'REVOKE_RACE_LATER_ATTEMPT_REGAINED_AUTHORITY';
 end if;

 perform public.dblink_disconnect('fwr');
 perform public.dblink_disconnect('fwa');
 perform public.dblink_disconnect('fwl');
end $$;
reset role;
select 'FAMILY_WEEKLY_OWNER_REVOKE_WINS_BEFORE_PAID_ADMISSION_PASS' as result;
