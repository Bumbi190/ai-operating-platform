\set ON_ERROR_STOP on
-- Disposable PostgreSQL only. The real claim_runs body is loaded from
-- the latest canonical source migration and handles the queued run itself.
-- Sunday January 3 2027 is simulated ONLY in the in-memory copies of
-- the proposed enqueue/admission RPCs, never in the canonical claim_runs.
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
-- The narrow base fixture contains a separate synthetic pending run.
-- Exclude that unrelated row so we verify exactly the Sunday-created run.
update public.runs set status='cancelled'
 where id='66666666-6666-4666-8666-666666666666';

do $$
declare
 v_project constant uuid:='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid;
 v_owner constant uuid:='77777777-7777-4777-8777-777777777777'::uuid;
 v_conversation constant uuid:='55555555-5555-4555-8555-555555555555'::uuid;
 v_enqueue jsonb;
 v_run uuid;
 v_event bigint;
 v_claimed public.runs%rowtype;
 v_n integer;
 v_paid jsonb;
 v_denied jsonb;
begin
 v_enqueue:=public.family_weekly_enqueue_once();
 if v_enqueue->>'status'<>'queued' or
    v_enqueue->>'weekStart'<>'2027-01-04' or
    v_enqueue->'publicationAuthority' is distinct from 'false'::jsonb then
  raise exception 'NATIVE_CLAIM_QUEUE_CREATION_FAILED: %',v_enqueue;
 end if;
 v_run:=(v_enqueue->>'runId')::uuid;
 select consent_event_id into strict v_event
 from public.family_weekly_run_plans where run_id=v_run;

 -- An unclaimed pending Family run MUST obey both existing STOP authorities.
 update public.projects set execution_paused=true where id=v_project;
 select count(*) into v_n from public.claim_runs(5,600);
 if v_n<>0 then raise exception 'NATIVE_CLAIM_IGNORED_PROJECT_STOP';end if;
 update public.projects set execution_paused=false where id=v_project;

 update public.platform_config set automation_paused=true where id=1;
 select count(*) into v_n from public.claim_runs(5,600);
 if v_n<>0 then raise exception 'NATIVE_CLAIM_IGNORED_GLOBAL_STOP';end if;
 update public.platform_config set automation_paused=false where id=1;

 -- This is the actual canonical worker claim, not a synthetic UPDATE.
 select * into strict v_claimed from public.claim_runs(5,600);
 if v_claimed.id is distinct from v_run or
    v_claimed.kind<>'family_weekly_editorial_drafts' or
    v_claimed.status<>'running' or
    v_claimed.claim_id is null or
    v_claimed.attempts<>1 or v_claimed.max_attempts<>1 or
    v_claimed.lease_until<=clock_timestamp() or
    v_claimed.idempotency_key is not null or
    v_claimed.workflow_instance_id is not null then
  raise exception 'NATIVE_CLAIM_BOUND_RUN_INVALID';
 end if;

 if not public.family_weekly_authority_current(
  v_owner,v_run,v_claimed.claim_id,v_event,v_conversation,'2027-01-04'
 ) then raise exception 'NATIVE_CLAIM_NOT_ACCEPTED_BY_FAMILY_AUTHORITY';end if;

 select count(*) into v_n from public.claim_runs(5,600);
 if v_n<>0 then raise exception 'NATIVE_CLAIM_DUPLICATED_RUNNING_RUN';end if;

 -- Global STOP after the claim denies any paid provider admission.
 update public.platform_config set automation_paused=true where id=1;
 v_denied:=public.family_weekly_admit_once(
  v_owner,'2027-01-04',v_run,v_claimed.claim_id,v_event,v_conversation
 );
 if v_denied->>'status'<>'blocked' or
    (select count(*) from public.family_weekly_model_attempts)<>0 then
  raise exception 'NATIVE_CLAIM_STOP_BEFORE_MODEL_NOT_ENFORCED';
 end if;
 update public.platform_config set automation_paused=false where id=1;

 v_paid:=public.family_weekly_admit_once(
  v_owner,'2027-01-04',v_run,v_claimed.claim_id,v_event,v_conversation
 );
 if v_paid->>'status'<>'admitted' or
    v_paid->'publicationAuthority' is distinct from 'false'::jsonb then
  raise exception 'NATIVE_CLAIM_MODEL_ADMISSION_NOT_VERIFIED: %',v_paid;
 end if;
 v_denied:=public.family_weekly_admit_once(
  v_owner,'2027-01-04',v_run,v_claimed.claim_id,v_event,v_conversation
 );
 if v_denied->>'status'<>'blocked' or
    (select count(*) from public.family_weekly_model_attempts)<>1 then
  raise exception 'NATIVE_CLAIM_SECOND_PAID_ATTEMPT_ACCEPTED';
 end if;

 -- Lease expiry must fence stale claims independently of paid ledger.
 update public.runs set lease_until=clock_timestamp()-interval '1 second'
 where id=v_run;
 if public.family_weekly_authority_current(
  v_owner,v_run,v_claimed.claim_id,v_event,v_conversation,'2027-01-04'
 ) then raise exception 'NATIVE_CLAIM_EXPIRED_LEASE_HAS_AUTHORITY';end if;
 -- Restore only within disposable fixture for the separate revoke check.
 update public.runs set lease_until=clock_timestamp()+interval '10 minutes'
 where id=v_run;
 if not public.family_weekly_authority_current(
  v_owner,v_run,v_claimed.claim_id,v_event,v_conversation,'2027-01-04'
 ) then raise exception 'NATIVE_CLAIM_LEASE_RENEWAL_UNEXPECTEDLY_BLOCKED';end if;
end $$;
reset role;

-- Owner revoke is a real RLS-protected INSERT, NOT service-role grant minting.
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
 v_row public.family_weekly_run_plans%rowtype;
 v_claim uuid;
begin
 select * into strict v_row from public.family_weekly_run_plans;
 select claim_id into strict v_claim from public.runs where id=v_row.run_id;
 if public.family_weekly_authority_current(
  v_row.owner_id,v_row.run_id,v_claim,v_row.consent_event_id,
  v_row.conversation_id,'2027-01-04'
 ) then raise exception 'NATIVE_CLAIM_REVOKED_OWNER_STILL_AUTHORIZED';end if;
 if (select count(*) from public.family_weekly_run_plans)<>1 or
    (select count(*) from public.family_weekly_model_attempts)<>1 then
  raise exception 'NATIVE_CLAIM_DURABLE_IDEMPOTENCY_LOST';
 end if;
end $$;
reset role;
select 'FAMILY_WEEKLY_CANONICAL_CLAIM_RUNS_WITH_STOP_REVOKE_PASS' as result;
