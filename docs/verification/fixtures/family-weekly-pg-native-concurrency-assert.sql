\set ON_ERROR_STOP on
-- Disposable PostgreSQL 16/17 ONLY, no network, port or production writes.
-- dblink opens two real local sessions inside the disposable container.
-- Both sessions use service_role when executing the production-shaped
-- family_weekly_enqueue_once / admit_once SQL. The third "lock" session
-- intentionally holds the same project advisory xact lock to guarantee
-- that BOTH worker sessions are simultaneously in flight, not merely
-- two sequential API calls. No models, cron or social accounts are called.
create extension if not exists dblink;

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

-- Exclude only the unrelated synthetic base fixture run from the native
-- claim; the new job MUST be created by the real Family enqueue RPC.
set role service_role;
update public.runs set status='cancelled'
 where id='66666666-6666-4666-8666-666666666666';
reset role;

do $$
declare
 v_project constant uuid:='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid;
 v_lock text:='family-weekly:'||v_project::text;
 v_a text; v_b text;
 v_queued int;
 v_existing int;
begin
 perform public.dblink_connect('fwa','host=/var/run/postgresql dbname=postgres user=postgres');
 perform public.dblink_connect('fwb','host=/var/run/postgresql dbname=postgres user=postgres');
 perform public.dblink_connect('fwl','host=/var/run/postgresql dbname=postgres user=postgres');
 perform public.dblink_exec('fwa','set role service_role');
 perform public.dblink_exec('fwb','set role service_role');

 -- This lock cannot be released until both remote workers have been
 -- scheduled and observed busy. No reliance on millisecond racing.
 perform public.dblink_exec('fwl','begin');
 perform public.dblink_exec('fwl',
   format('DO $q$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L,0)); END $q$;',v_lock));
 if public.dblink_send_query('fwa','select public.family_weekly_enqueue_once()::text AS result')<>1
  or public.dblink_send_query('fwb','select public.family_weekly_enqueue_once()::text AS result')<>1 then
  raise exception 'CONCURRENT_ENQUEUE_REQUEST_WAS_NOT_STARTED';
 end if;
 perform pg_catalog.pg_sleep(0.2);
 if public.dblink_is_busy('fwa')<>1 or public.dblink_is_busy('fwb')<>1 then
  raise exception 'CONCURRENT_ENQUEUE_REQUEST_DID_NOT_WAIT_ON_PROJECT_LOCK';
 end if;
 perform public.dblink_exec('fwl','commit');
 select result into strict v_a from public.dblink_get_result('fwa') as t(result text);
 select result into strict v_b from public.dblink_get_result('fwb') as t(result text);
 v_queued:=((v_a::jsonb->>'status'='queued')::int
   +(v_b::jsonb->>'status'='queued')::int);
 v_existing:=((v_a::jsonb->>'status'='already_queued')::int
   +(v_b::jsonb->>'status'='already_queued')::int);
 if v_queued<>1 or v_existing<>1
  or (select count(*) from public.family_weekly_run_plans)<>1
  or (select count(*) from public.runs where kind='family_weekly_editorial_drafts'
      and status='pending')<>1
  or (select count(*) from public.family_weekly_model_attempts)<>0
  or coalesce(v_a::jsonb->'publicationAuthority','false'::jsonb)='true'::jsonb
  or coalesce(v_b::jsonb->'publicationAuthority','false'::jsonb)='true'::jsonb then
  raise exception 'CONCURRENT_ENQUEUE_DUPLICATED_OR_GRANTED_AUTHORITY: %, %',v_a,v_b;
 end if;
 perform public.dblink_disconnect('fwa');
 perform public.dblink_disconnect('fwb');
 perform public.dblink_disconnect('fwl');
end $$;

-- Canonical Omnira claim_runs is installed verbatim from checked-in
-- migration. This SELECT is its own statement/transaction, so the run
-- claim is visible to the two later concurrent admission sessions.
set role service_role;
select 'FAMILY_WEEKLY_CANONICAL_CONCURRENT_CLAIMED_RUN='||id as result
from public.claim_runs(5,600);
reset role;

do $$
declare
 v_project constant uuid:='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid;
 v_owner constant uuid:='77777777-7777-4777-8777-777777777777'::uuid;
 v_conversation constant uuid:='55555555-5555-4555-8555-555555555555'::uuid;
 v_plan public.family_weekly_run_plans%rowtype;
 v_claim uuid;
 v_lock text:='family-weekly:'||v_project::text;
 v_sql text;
 v_a text; v_b text;
 v_admitted int; v_denied int;
begin
 select * into strict v_plan from public.family_weekly_run_plans
  where project_id=v_project and week_start='2027-01-04';
 select r.claim_id into strict v_claim from public.runs r
  where r.id=v_plan.run_id and r.status='running'
    and r.attempts=1 and r.max_attempts=1
    and r.lease_until>clock_timestamp();
 if v_claim is null then raise exception 'CONCURRENT_NATIVE_CLAIM_MISSING';end if;
 if not public.family_weekly_authority_current(
  v_owner,v_plan.run_id,v_claim,v_plan.consent_event_id,
  v_conversation,'2027-01-04'
 ) then raise exception 'CONCURRENT_NATIVE_CLAIM_HAS_NO_AUTHORITY';end if;
 v_sql:=format(
  'select public.family_weekly_admit_once(%L::uuid,%L::date,%L::uuid,%L::uuid,%L::bigint,%L::uuid)::text AS result',
  v_owner,'2027-01-04',v_plan.run_id,v_claim,v_plan.consent_event_id,
  v_conversation
 );
 perform public.dblink_connect('fwa','host=/var/run/postgresql dbname=postgres user=postgres');
 perform public.dblink_connect('fwb','host=/var/run/postgresql dbname=postgres user=postgres');
 perform public.dblink_connect('fwl','host=/var/run/postgresql dbname=postgres user=postgres');
 perform public.dblink_exec('fwa','set role service_role');
 perform public.dblink_exec('fwb','set role service_role');
 perform public.dblink_exec('fwl','begin');
 perform public.dblink_exec('fwl',
   format('DO $q$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(%L,0)); END $q$;',v_lock));
 if public.dblink_send_query('fwa',v_sql)<>1
 or public.dblink_send_query('fwb',v_sql)<>1 then
  raise exception 'CONCURRENT_ADMISSION_REQUEST_WAS_NOT_STARTED';
 end if;
 perform pg_catalog.pg_sleep(0.2);
 if public.dblink_is_busy('fwa')<>1 or public.dblink_is_busy('fwb')<>1 then
  raise exception 'CONCURRENT_ADMISSION_REQUEST_DID_NOT_WAIT_ON_PROJECT_LOCK';
 end if;
 perform public.dblink_exec('fwl','commit');
 select result into strict v_a from public.dblink_get_result('fwa') as t(result text);
 select result into strict v_b from public.dblink_get_result('fwb') as t(result text);
 v_admitted:=((v_a::jsonb->>'status'='admitted')::int
   +(v_b::jsonb->>'status'='admitted')::int);
 v_denied:=((v_a::jsonb->>'status'='blocked')::int
   +(v_b::jsonb->>'status'='blocked')::int);
 if v_admitted<>1 or v_denied<>1
 or (select count(*) from public.family_weekly_model_attempts)<>1
 or (select count(*) from public.family_weekly_model_attempts
     where project_id=v_project and owner_id=v_owner
       and week_start='2027-01-04' and run_id=v_plan.run_id
       and claim_id=v_claim)<>1
 or (v_a::jsonb->>'status'='admitted' and v_a::jsonb->'publicationAuthority' is distinct from 'false'::jsonb)
 or (v_b::jsonb->>'status'='admitted' and v_b::jsonb->'publicationAuthority' is distinct from 'false'::jsonb)
 then
   raise exception 'CONCURRENT_ADMISSION_DUPLICATED_OR_GRANTED_AUTHORITY: %, %',v_a,v_b;
 end if;
 perform public.dblink_disconnect('fwa');
 perform public.dblink_disconnect('fwb');
 perform public.dblink_disconnect('fwl');
end $$;

-- An owner revoke must still fence a previously claimed and admitted
-- attempt, without erasing either durable uniqueness ledger.
set role authenticated;
set "request.jwt.claim.sub"='77777777-7777-4777-8777-777777777777';
insert into public.family_weekly_auto_consent_events(
 project_id,owner_id,action,valid_until
) values(
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 '77777777-7777-4777-8777-777777777777','revoke',null
);
reset role;

set role service_role;
do $$
declare
 v_plan public.family_weekly_run_plans%rowtype;
 v_claim uuid;
 v_after_revoke jsonb;
 v_new_queue jsonb;
begin
 select * into strict v_plan from public.family_weekly_run_plans;
 select claim_id into strict v_claim from public.runs where id=v_plan.run_id;
 if public.family_weekly_authority_current(
   v_plan.owner_id,v_plan.run_id,v_claim,v_plan.consent_event_id,
   v_plan.conversation_id,v_plan.week_start
 ) then raise exception 'CONCURRENT_REVOKED_OWNER_STILL_AUTHORIZED';end if;
 v_after_revoke:=public.family_weekly_admit_once(
   v_plan.owner_id,v_plan.week_start,v_plan.run_id,v_claim,
   v_plan.consent_event_id,v_plan.conversation_id
 );
 v_new_queue:=public.family_weekly_enqueue_once();
 if v_after_revoke->>'status'<>'blocked'
 or v_new_queue->>'status'<>'already_queued'
 or (select count(*) from public.family_weekly_run_plans)<>1
 or (select count(*) from public.family_weekly_model_attempts)<>1
 or (select count(*) from public.social_weekly_preparations)<>0 then
   raise exception 'CONCURRENT_REVOKE_DID_NOT_FENCE_FURTHER_ACTIONS';
 end if;
end $$;
reset role;
select 'FAMILY_WEEKLY_PARALLEL_ENQUEUE_PAID_FENCE_AND_REVOKE_PASS' as result;
