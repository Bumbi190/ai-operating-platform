-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3B1B2 · M4-A — Survival v1 thresholds become OWNER-APPROVED canonical
-- policy: forward-compatible persistence of the threshold-status label.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY
--   The owner approved the six Survival v1 thresholds (headroom 0.10 / 0.35 /
--   0.50, runway 3 / 14 / 60 days, equality semantics unchanged) as canonical
--   policy. The application records that by changing SURVIVAL_THRESHOLD_STATUS
--   from 'provisional' to 'canonical'. Production's recorder and the table's
--   policy-identity CHECK accept ONLY 'provisional', so the app change alone
--   would make every observation write fail with 22023.
--
-- WHAT (and nothing more)
--   1. survival_events_policy_identity_valid admits (v2, canonical) beside the
--      existing (v1, provisional) and (v2, provisional) pairings. Provenance and
--      runway-coverage pairing are unchanged; v1 can never be canonical.
--   2. survival_record_observation (17 args) accepts 'canonical' for v2. The
--      body is the Phase 2B body verbatim except for that one check.
--
-- MIXED-VERSION ROLLOUT
--   Apply this migration FIRST. The old app (provisional, v2) keeps recording;
--   the new app (canonical, v2) records as soon as it deploys. Migration Guard
--   keeps the new app from deploying before this migration is applied.
--   Historical rows are untouched and stay valid. Any other status string, and
--   canonical on v1, are still refused.
--
-- No threshold VALUE lives in the database; nothing here changes a number.
--
-- NOT APPLIED BY THIS BRANCH.

alter table public.survival_state_events
  drop constraint if exists survival_events_policy_identity_valid;
alter table public.survival_state_events
  add constraint survival_events_policy_identity_valid
  check (
    (derivation_version = 1 and threshold_status = 'provisional'
       and runway_coverage is null
       and provenance = 'atlas.survival.observation.v1')
    or
    (derivation_version = 2 and threshold_status in ('provisional', 'canonical')
       and runway_coverage is not null
       and provenance = 'atlas.survival.observation.v2')
  );

-- Same signature as Phase 2B, so CREATE OR REPLACE replaces it in place (no
-- overload) and its grants survive unchanged.
create or replace function public.survival_record_observation(
  p_project_id          uuid,
  p_to_state            text,
  p_reasons             text[],
  p_gaps                text[],
  p_binding_scope       text,
  p_binding_limit_sek   numeric,
  p_binding_remaining_sek numeric,
  p_burn_sek_per_day    numeric,
  p_funding_state       text,
  p_declared_funding_sek numeric,
  p_runway_days         numeric,
  p_revenue_trend_sek   numeric,
  p_operating_paused    boolean,
  p_threshold_status    text,
  p_derivation_version  integer,
  p_runway_coverage     text,
  p_occurred_at         timestamptz
) returns table (result text, event_id uuid, event_seq bigint, from_state text, to_state text)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_previous text;
  v_event_id uuid;
  v_event_seq bigint;
  v_autonomy_level text;
  v_provenance text;
begin
  if p_project_id is null then
    raise exception 'p_project_id is required' using errcode = '22023';
  end if;
  if p_to_state is null then
    raise exception 'p_to_state is required' using errcode = '22023';
  end if;
  if p_reasons is null then
    raise exception 'p_reasons is required (may be empty)' using errcode = '22023';
  end if;
  if p_gaps is null then
    raise exception 'p_gaps is required (may be empty)' using errcode = '22023';
  end if;
  if p_occurred_at is null then
    raise exception 'p_occurred_at is required' using errcode = '22023';
  end if;

  -- Fail closed on version skew. v1 and v2 are both understood here; anything
  -- else is a policy this schema cannot honour, and a mislabelled row is worse
  -- than a missing one because nothing later can tell it from a true row.
  if p_derivation_version is null or p_derivation_version not in (1, 2) then
    raise exception 'unsupported derivation version % — this schema implements v1 and v2',
      p_derivation_version using errcode = '22023';
  end if;
  -- Phase 3B1B2 M4-A: the six thresholds are OWNER-APPROVED canonical policy.
  -- 'canonical' is accepted for v2 only; 'provisional' stays accepted for v1 and
  -- v2 so the app that predates the approval keeps recording during a rollout.
  -- The values themselves did not change — only the label of their authority.
  if p_threshold_status is null
     or p_threshold_status not in ('provisional', 'canonical')
     or (p_threshold_status = 'canonical' and p_derivation_version <> 2) then
    raise exception 'unsupported threshold status % for derivation v% — this schema implements provisional (v1, v2) and canonical (v2)',
      p_threshold_status, p_derivation_version using errcode = '22023';
  end if;
  -- v2 observations must state their runway coverage; v1 observations predate it.
  if p_derivation_version = 2 and p_runway_coverage is null then
    raise exception 'v2 observations must declare p_runway_coverage' using errcode = '22023';
  end if;

  v_autonomy_level := case p_to_state
    when 'EXPAND'    then 'L6'
    when 'NORMAL'    then 'L6'
    when 'CONSERVE'  then 'L3'
    when 'CRITICAL'  then 'L1'
    when 'HIBERNATE' then 'L0'
  end;
  if v_autonomy_level is null then
    raise exception 'unsupported to_state %', p_to_state using errcode = '22023';
  end if;

  -- Provenance describes the observation FORMAT, and Phase 2B changed it. It is
  -- derived from the version for the same reason the ceiling is derived from the
  -- state: a caller that could name it could label a v2 envelope as v1, and a
  -- later reader would decode it with a schema that has no `runway_coverage`.
  -- `survival_events_policy_identity_valid` pins the same pairing in the table,
  -- so this holds even against a direct WITH CHECK OPTION-less insert.
  v_provenance := case p_derivation_version
    when 1 then 'atlas.survival.observation.v1'
    when 2 then 'atlas.survival.observation.v2'
  end;

  perform 1 from public.projects p where p.id = p_project_id for update;
  if not found then
    raise exception 'project % does not exist', p_project_id using errcode = 'P0002';
  end if;

  select e.to_state into v_previous
    from public.survival_state_events e
   where e.project_id = p_project_id
   order by e.event_seq desc
   limit 1;

  if v_previous is null then
    insert into public.survival_state_events (
      project_id, event_type, from_state, to_state, autonomy_level, reasons, gaps,
      binding_scope, binding_limit_sek, binding_remaining_sek, burn_sek_per_day,
      funding_state, declared_funding_sek, runway_days, revenue_trend_sek,
      operating_paused, threshold_status, derivation_version, runway_coverage,
      actor_principal, provenance, occurred_at)
    values (
      p_project_id, 'BASELINE_OBSERVED', null, p_to_state, v_autonomy_level,
      p_reasons, p_gaps, p_binding_scope, p_binding_limit_sek, p_binding_remaining_sek,
      p_burn_sek_per_day, p_funding_state, p_declared_funding_sek, p_runway_days,
      p_revenue_trend_sek, p_operating_paused, p_threshold_status, p_derivation_version,
      p_runway_coverage,
      'atlas.survival_recorder', v_provenance, p_occurred_at)
    returning survival_state_events.event_id, survival_state_events.event_seq
      into v_event_id, v_event_seq;

    return query select 'baseline_recorded'::text, v_event_id, v_event_seq, null::text, p_to_state;
    return;
  end if;

  if v_previous = p_to_state then
    return query select 'unchanged'::text, null::uuid, null::bigint, v_previous, p_to_state;
    return;
  end if;

  insert into public.survival_state_events (
    project_id, event_type, from_state, to_state, autonomy_level, reasons, gaps,
    binding_scope, binding_limit_sek, binding_remaining_sek, burn_sek_per_day,
    funding_state, declared_funding_sek, runway_days, revenue_trend_sek,
    operating_paused, threshold_status, derivation_version, runway_coverage,
    actor_principal, provenance, occurred_at)
  values (
    p_project_id, 'STATE_TRANSITION_OBSERVED', v_previous, p_to_state, v_autonomy_level,
    p_reasons, p_gaps, p_binding_scope, p_binding_limit_sek, p_binding_remaining_sek,
    p_burn_sek_per_day, p_funding_state, p_declared_funding_sek, p_runway_days,
    p_revenue_trend_sek, p_operating_paused, p_threshold_status, p_derivation_version,
    p_runway_coverage,
    'atlas.survival_recorder', v_provenance, p_occurred_at)
  returning survival_state_events.event_id, survival_state_events.event_seq
    into v_event_id, v_event_seq;

  return query select 'transition_recorded'::text, v_event_id, v_event_seq, v_previous, p_to_state;
end;
$$;

-- Grants are unchanged by CREATE OR REPLACE; restated so the intended ACL is
-- visible in this file.
revoke all on function public.survival_record_observation(
  uuid, text, text[], text[], text, numeric, numeric, numeric,
  text, numeric, numeric, numeric, boolean, text, integer, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.survival_record_observation(
  uuid, text, text[], text[], text, numeric, numeric, numeric,
  text, numeric, numeric, numeric, boolean, text, integer, text, timestamptz)
  to service_role;
