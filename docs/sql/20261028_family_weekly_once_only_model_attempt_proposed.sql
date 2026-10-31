-- PROPOSED / UNAPPLIED. Must pass migration-guard registration, pgTAP role
-- replay and owner/session tests before promotion into canonical migrations.
--
-- Exactly one MAY-HAVE-COST provider invocation per local Stockholm target
-- week. Marked BEFORE the external model request, never reclaimed by a
-- retrying cron/lease reaper. Even a failed/timeout provider call consumes it.
-- The separate public.runs claim_id fence is still mandatory.
-- Do not confuse this ledger with a content/scheduling/publication approval.

create table public.family_weekly_model_attempts (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 owner_id uuid not null references auth.users(id) on delete restrict,
 week_start date not null,
 consent_event_id bigint not null references public.family_weekly_auto_consent_events(event_id) on delete restrict,
 run_id uuid not null unique references public.runs(id) on delete restrict,
 claim_id uuid not null,
 conversation_id uuid not null references public.conversations(id) on delete restrict,
 admission_state text not null default 'may_have_incurred_cost'
  check (admission_state='may_have_incurred_cost'),
 can_publish boolean not null default false check(can_publish=false),
 can_schedule boolean not null default false check(can_schedule=false),
 admitted_at timestamptz not null default clock_timestamp(),
 constraint family_weekly_model_attempt_one_per_week unique(project_id,week_start),
 constraint family_weekly_model_attempt_only_project check(
  project_id='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid
 ),
 constraint family_weekly_model_attempt_start check(week_start>='2027-01-04'::date),
 constraint family_weekly_model_attempt_monday check(extract(isodow from week_start)=1)
);

-- NOTE: no UPDATE/DELETE/TRUNCATE grants and no client-facing policies.
alter table public.family_weekly_model_attempts enable row level security;
revoke all on public.family_weekly_model_attempts from public,anon,authenticated,service_role;
grant select,insert on public.family_weekly_model_attempts to service_role;
create index family_weekly_model_attempt_owner_idx
 on public.family_weekly_model_attempts(owner_id,week_start desc);

-- A real claimed run must be owned by the same project, an exact owner-scoped
-- project conversation, and the explicit "family_weekly_editorial_drafts" kind.
-- This is not an authorization token generator: it checks actual persisted
-- rows in Omnira's existing runs/claim_id + conversations + consent ledger.
create function public.family_weekly_authority_current(
 p_owner_id uuid,
 p_run_id uuid,
 p_claim_id uuid,
 p_consent_event_id bigint,
 p_conversation_id uuid,
 p_week_start date
) returns boolean
language sql volatile security invoker set search_path='' as $$
 select exists (
  select 1
  from public.projects p
  join public.runs r on r.project_id=p.id
  join public.conversations c on c.id=p_conversation_id
  where p.id='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid
    and p.owner_id=p_owner_id
    -- Mirror the native social_content_active STOP gate BEFORE any paid
    -- admission, not only when finally saving the editorial drafts.
    and p.execution_paused=false
    and not exists(select 1 from public.project_lifecycle l
      where l.project_id=p.id and l.state<>'active')
    and not exists(select 1 from public.platform_config cfg
      where cfg.automation_paused)
    and c.user_id=p_owner_id and c.project_id=p.id
    and r.id=p_run_id and r.claim_id=p_claim_id
    and r.status='running' and r.cancel_requested=false
    and r.lease_until>clock_timestamp()
    and r.attempts=1 and r.max_attempts=1
    and r.kind='family_weekly_editorial_drafts'
    and r.input->>'ownerId'=p_owner_id::text
    and r.input->>'conversationId'=p_conversation_id::text
    and r.input->>'weekStart'=p_week_start::text
    and r.input->>'eventId'=p_consent_event_id::text
    -- Unbound runs MUST have no idempotency_key by canonical runs constraints.
    -- The durable family_weekly_run_plans UNIQUE(project,week) row is the
    -- only legitimate scheduling/idempotency proof for this workflow.
    and r.idempotency_key is null
    and r.workflow_instance_id is null
    and exists(
      select 1 from public.family_weekly_run_plans q
      where q.project_id=p.id and q.owner_id=p_owner_id
        and q.conversation_id=p_conversation_id
        and q.run_id=p_run_id and q.week_start=p_week_start
        and q.consent_event_id=p_consent_event_id
    )
    and exists(
      select 1 from public.family_weekly_auto_consent_events e
      where e.project_id=p.id and e.owner_id=p_owner_id
        and e.event_id=p_consent_event_id
        and e.action='enable'
        and e.valid_until>clock_timestamp()
        and e.event_id=(
          select max(e2.event_id)
          from public.family_weekly_auto_consent_events e2
          where e2.project_id=p.id
        )
    )
 )
$$;
revoke all on function public.family_weekly_authority_current(uuid,uuid,uuid,bigint,uuid,date)
 from public,anon,authenticated;
grant execute on function public.family_weekly_authority_current(uuid,uuid,uuid,bigint,uuid,date)
 to service_role;

-- Admission occurs BEFORE provider dispatch, in a single transaction.
-- Concurrent admission requests for same local week serialize via the unique
-- constraint and cannot get a second charged attempt on any future retry.
create function public.family_weekly_admit_once(
 p_owner_id uuid,
 p_week_start date,
 p_run_id uuid,
 p_claim_id uuid,
 p_consent_event_id bigint,
 p_conversation_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_project constant uuid:='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid;
 v_local timestamp;
 v_id uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('family-weekly:'||v_project::text,0)
 );
 v_local:=clock_timestamp() at time zone 'Europe/Stockholm';
 if v_local::date<'2027-01-03'::date
  or extract(isodow from v_local)<>7
  or extract(hour from v_local)<>15
  or p_week_start<>v_local::date+1 then
  return jsonb_build_object('status','blocked');
 end if;
 if not public.family_weekly_authority_current(
  p_owner_id,p_run_id,p_claim_id,p_consent_event_id,p_conversation_id,p_week_start
 ) then
  return jsonb_build_object('status','blocked');
 end if;
 -- Run ID, conversation, consent and project are DB-verified above.
 insert into public.family_weekly_model_attempts(
  project_id,owner_id,week_start,consent_event_id,
  run_id,claim_id,conversation_id
 ) values(
  v_project,p_owner_id,p_week_start,p_consent_event_id,
  p_run_id,p_claim_id,p_conversation_id
 ) on conflict do nothing returning id into v_id;
 if v_id is null then
  return jsonb_build_object('status','blocked');
 end if;
 return jsonb_build_object(
  'status','admitted','attemptId',v_id,'ownerId',p_owner_id,
  'projectId',v_project,'weekStart',p_week_start,
  'runId',p_run_id,'claimId',p_claim_id,
  'conversationId',p_conversation_id,'eventId',p_consent_event_id,
  'publicationAuthority',false
 );
end $$;
revoke all on function public.family_weekly_admit_once(uuid,date,uuid,uuid,bigint,uuid)
 from public,anon,authenticated;
grant execute on function public.family_weekly_admit_once(uuid,date,uuid,uuid,bigint,uuid)
 to service_role;

-- The sole authorized automatic draft writer.
-- Advisory xact lock is the SAME lock taken by the consent INSERT trigger.
-- Revocation and saved editorial drafts therefore have a deterministic order:
-- either revocation commits first and this refuses, or save commits first.
-- This cannot claim to prevent an already in-flight model request billing.
create function public.family_weekly_save_editorial_if_current(
 p_owner_id uuid,
 p_run_id uuid,
 p_claim_id uuid,
 p_consent_event_id bigint,
 p_conversation_id uuid,
 p_input jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_project constant uuid:='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid;
 v_attempt public.family_weekly_model_attempts%rowtype;
 v_week date;
begin
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('family-weekly:'||v_project::text,0)
 );
 if jsonb_typeof(p_input) is distinct from 'object'
  or p_input->>'projectId' is distinct from v_project::text
  or p_input->>'conversationId' is distinct from p_conversation_id::text
  or coalesce(p_input->>'weekStart','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
  then raise exception 'FAMILY_WEEKLY_SAVE_NOT_AUTHORIZED' using errcode='42501';
 end if;
 v_week:=(p_input->>'weekStart')::date;
 select * into v_attempt from public.family_weekly_model_attempts
 where project_id=v_project and week_start=v_week
  and owner_id=p_owner_id and run_id=p_run_id and claim_id=p_claim_id
  and consent_event_id=p_consent_event_id
  and conversation_id=p_conversation_id;
 if not found or not public.family_weekly_authority_current(
  p_owner_id,p_run_id,p_claim_id,p_consent_event_id,p_conversation_id,v_week
 ) then
  raise exception 'FAMILY_WEEKLY_SAVE_NOT_AUTHORIZED' using errcode='42501';
 end if;
 -- All consent, run/claim and message checks above remain frozen under this
 -- transaction's advisory lock. Native save performs its OWN source-hash,
 -- revision, image account, duplicate, owner and schedule-slot validation.
 return public.social_weekly_save(
  jsonb_build_object('userId',p_owner_id,
   'allowedProjectIds',jsonb_build_array(v_project)),
  p_input
 );
end $$;
revoke all on function public.family_weekly_save_editorial_if_current(uuid,uuid,uuid,bigint,uuid,jsonb)
 from public,anon,authenticated;
grant execute on function public.family_weekly_save_editorial_if_current(uuid,uuid,uuid,bigint,uuid,jsonb)
 to service_role;

-- Never add pg_cron here: future job creator must be separately reviewed, must
-- use an actual claimed public.runs row (not fabricate RUN_BOUND), and must
-- honor the top-level runtime OFF flag. Keep social schedule approval separate.
