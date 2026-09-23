-- Phase 2A — durable, append-only survival transition history.
--
-- HISTORY, NEVER TRUTH. This table records what the canonical derivation
-- observed at a point in time. The question "what survival state is Atlas in
-- right now?" is NEVER answered from here: it is answered by
-- readSurvivalSnapshot() → deriveSurvivalState(), over current measurements.
-- A row in this table is evidence of what was observed, not a claim about now.
--
-- WHAT IT IS NOT. There is no autonomy licence here, no authorization, no
-- budget, no funding store and no current-state table:
--   * funding_state / declared_funding_sek are EVIDENCE COLUMNS. They record what
--     the observation saw, so a historical transition can be explained later.
--     They are not a funding source, nothing reads them as one, and Phase 2B owns
--     owner-declared funding persistence.
--   * autonomy_level records the ceiling the observation implied. It grants
--     nothing and is read by nothing that authorizes.
--
-- ONE STREAM PER PROJECT. The stream identity is `project_id`, deliberately:
--   * The observation is derived per project — readSurvivalSnapshot([projectId])
--     returns that project's scopes AND the platform-global scopes (which
--     budget_headroom reports per project row), so "the survival condition as it
--     binds project X" is well defined, stable, and already expressible with an
--     existing entity. It is not an invented platform-global identity, and not a
--     hash of whatever project set a caller happened to hold.
--   * There is deliberately NO binding_project_id column. For a per-project
--     stream the binding project IS the stream's project, so a second column
--     would store the same fact twice.
--   * A platform-wide stream would need a platform identity that does not exist;
--     inventing one here would be the ambiguity this ledger's scope decision
--     exists to avoid. That is a later phase's decision, and it is additive.
--
-- NOT THE SYSTEMHÄLSA NUMBER. The Systemhälsa surface derives ONE observation
-- across all of the operator's allowed project ids and renders that as a single
-- card. A stream here is per project and is a different fact:
--
--     one event here  =  "this is the canonical observation produced for [X]"
--     the panel       =  "this is the observation for the SET a caller may read"
--
-- They coincide only when the set is exactly one project. Neither is derived
-- from the other, and a row here must never be read as a statement about the
-- platform as a whole. Do not add a portfolio or platform-global scope in this
-- phase.
--
-- THE PROJECT FK IS RESTRICT, following the ledger family (atlas_decision_ledger,
-- atlas_mission_ledger, atlas_delegation_ledger,
-- dream_issue_reconciliation_events). `stop_events` deliberately omits the FK so
-- its audit outlives the row it describes; that is right for a control-plane
-- audit and wrong here, because a survival history that points at a deleted
-- project is an orphan rather than a record. Owner-approved 2026-09-23.
--
-- CONSEQUENCE, DELIBERATE: project hard-deletion does not cascade this history
-- away and will FAIL while rows exist. A future project-purge or retention
-- workflow must handle this ledger EXPLICITLY — deciding what survival evidence
-- to keep, archive or remove — rather than relying on CASCADE to sweep it up.
-- Silently discarding survival evidence alongside the project is the outcome
-- RESTRICT exists to prevent.

create table if not exists public.survival_state_events (
  event_id              uuid primary key default gen_random_uuid(),
  -- Database-assigned total order. occurred_at is OBSERVATION time and is
  -- caller-supplied; event_seq is WRITE order and is not. The from_state chain
  -- follows event_seq, so a back-dated observation can never rewrite the chain.
  event_seq             bigint generated always as identity unique,
  project_id            uuid not null references public.projects(id) on delete restrict,

  event_type            text not null,
  from_state            text,
  to_state              text not null,
  autonomy_level        text not null,

  reasons               text[] not null default '{}',
  gaps                  text[] not null default '{}',

  binding_scope         text,
  binding_limit_sek     numeric,
  binding_remaining_sek numeric,
  burn_sek_per_day      numeric,

  funding_state         text not null,
  declared_funding_sek  numeric,
  runway_days           numeric,

  -- A PERFORMANCE SIGNAL. Never cash, never runway, never spendable. Stored so a
  -- later reader can see what the signal said, not so anything can treat it as
  -- money.
  revenue_trend_sek     numeric,

  -- The operator's own automation stop at observation time. Recorded for
  -- context; this ledger neither causes nor clears it.
  operating_paused      boolean,

  threshold_status      text not null,
  derivation_version    integer not null,

  actor_principal       text not null,
  provenance            text not null,

  occurred_at           timestamptz not null,
  recorded_at           timestamptz not null default now(),

  constraint survival_events_event_type_valid
    check (event_type in ('BASELINE_OBSERVED', 'STATE_TRANSITION_OBSERVED')),
  constraint survival_events_to_state_valid
    check (to_state in ('EXPAND', 'NORMAL', 'CONSERVE', 'CRITICAL', 'HIBERNATE')),
  constraint survival_events_from_state_valid
    check (from_state is null
        or from_state in ('EXPAND', 'NORMAL', 'CONSERVE', 'CRITICAL', 'HIBERNATE')),
  -- A BASELINE has no predecessor; a TRANSITION always has one, and it is a
  -- real change. The event name, the presence of from_state and the inequality
  -- are three spellings of one fact, so they are constrained to agree rather
  -- than left able to contradict each other.
  constraint survival_events_shape
    check (
      (event_type = 'BASELINE_OBSERVED'      and from_state is null)
      or
      (event_type = 'STATE_TRANSITION_OBSERVED' and from_state is not null
        and from_state <> to_state)
    ),
  -- The ceiling is a FUNCTION OF THE STATE for derivation v1, so the row is
  -- constrained to v1's mapping. Without this, a permitted direct INSERT could
  -- hold `HIBERNATE + L6` — evidence of a survival condition that both said
  -- "observe only" and claimed full strategic autonomy. The RPC no longer takes
  -- a caller's ceiling at all; this is the second line, for a privileged writer.
  --
  -- This mapping is v1's. A future policy that changes SURVIVAL_CEILING must
  -- revisit this constraint in the same reviewed migration, exactly as it must
  -- bump the derivation version.
  constraint survival_events_autonomy_matches_state
    check (
      (to_state = 'EXPAND'    and autonomy_level = 'L6')
      or (to_state = 'NORMAL'    and autonomy_level = 'L6')
      or (to_state = 'CONSERVE'  and autonomy_level = 'L3')
      or (to_state = 'CRITICAL'  and autonomy_level = 'L1')
      or (to_state = 'HIBERNATE' and autonomy_level = 'L0')
    ),
  constraint survival_events_funding_state_valid
    check (funding_state in ('KNOWN', 'UNDECLARED', 'UNAVAILABLE')),
  -- The amount exists EXACTLY WHEN the funding situation is KNOWN — both
  -- directions. One direction alone would still admit `KNOWN` with no figure,
  -- which is a KNOWN row that knows nothing: it would read as "we were told the
  -- capital" while carrying no capital, and a reader could not tell it from a
  -- genuine reading that had been dropped. UNDECLARED/UNAVAILABLE carrying a
  -- figure is the mirror-image lie: a manufactured number. Both are refused
  -- here rather than trusted. A KNOWN figure may be zero or negative — this
  -- constrains presence, not sign, so the canonical FundingReading contract is
  -- unchanged.
  constraint survival_events_declared_funding_matches_state
    check (
      (funding_state = 'KNOWN'      and declared_funding_sek is not null)
      or
      (funding_state in ('UNDECLARED', 'UNAVAILABLE') and declared_funding_sek is null)
    ),
  -- POLICY IDENTITY MUST NAME A DERIVATION THAT EXISTS. An audit ledger that
  -- accepted `version 999 + canonical` would be recording a claim about a policy
  -- no recorder has ever implemented, and a later reader would have no way to
  -- tell it from a genuine row. Exactly one policy identity is implemented
  -- today: v1, whose thresholds are still provisional. This constraint is the
  -- pairing itself, not two independent ranges — widening it is a reviewed
  -- migration that ships alongside the derivation it describes.
  constraint survival_events_policy_identity_valid
    check (derivation_version = 1 and threshold_status = 'provisional'),
  constraint survival_events_binding_scope_valid
    check (binding_scope is null
        or binding_scope in ('project_daily', 'project_weekly', 'project_monthly',
                             'global_daily',  'global_weekly',  'global_monthly')),
  -- Closed vocabularies. An unknown reason would be a policy identifier no
  -- reader can interpret, so the array is constrained to the canonical set.
  constraint survival_events_reasons_valid
    check (reasons <@ array[
      'headroom_exhausted', 'headroom_critical', 'headroom_conserve', 'headroom_healthy',
      'no_budget_configured', 'funding_undeclared', 'funding_unavailable',
      'funding_depleted', 'runway_short', 'reads_unavailable']::text[]),
  constraint survival_events_gaps_valid
    check (gaps <@ array[
      'funding_undeclared', 'funding_unavailable', 'runway_unknown',
      'reads_incomplete', 'infrastructure_cost_untracked']::text[]),
  -- (derivation_version / threshold_status are constrained together above, as the
  -- policy identity. A separate `>= 1` range here would be the weaker claim
  -- standing next to the stronger one, and only the stronger one is true.)
  -- Amounts and durations are non-negative. A negative headroom is not a fact
  -- this ledger should be able to hold.
  constraint survival_events_amounts_non_negative
    check (
      (binding_limit_sek     is null or binding_limit_sek     >= 0)
      and (binding_remaining_sek is null or binding_remaining_sek >= 0)
      and (burn_sek_per_day      is null or burn_sek_per_day      >= 0)
      and (runway_days           is null or runway_days           >= 0)
    ),
  -- A survival observation is NOT a human authority act. Recording `owner` (or
  -- any person) here would assert that a person decided something, which is
  -- false: nobody did. The actor is therefore a CLOSED, MACHINE-ONLY vocabulary,
  -- so the impersonation is refused structurally even on a direct RPC call.
  -- Widening this set is a deliberate migration, not a caller's choice.
  constraint survival_events_actor_machine_identity
    check (actor_principal in ('atlas.survival_recorder')),
  -- Provenance is the observation FORMAT the recorder implements, not a note
  -- anyone may write. Free text here would be a caller-authored claim about how
  -- the row was produced, standing next to an actor column that is a closed
  -- vocabulary — the same forgery in a different column. The RPC no longer takes
  -- it; this constrains a privileged direct INSERT to the same value.
  constraint survival_events_provenance_machine_identity
    check (provenance = 'atlas.survival.observation.v1')
);

-- The only access pattern: "recent transitions for one project, newest first".
create index if not exists survival_state_events_project_seq_idx
  on public.survival_state_events (project_id, event_seq desc);

comment on table public.survival_state_events is
  'Atlas Survival Phase 2A — append-only history of survival state TRANSITIONS. '
  'History only: the CURRENT survival state is never read from here, it is derived '
  'anew by readSurvivalSnapshot(). Written only by survival_record_observation(), '
  'which derives from_state itself. See apps/web/lib/atlas/survival/history/.';
comment on column public.survival_state_events.event_seq is
  'Database-assigned write order. occurred_at is observation time; event_seq decides ties and is what the from_state chain follows.';
comment on column public.survival_state_events.funding_state is
  'EVIDENCE of what the observation saw, not a funding source of truth. KNOWN / UNDECLARED / UNAVAILABLE remain distinct; Phase 2B owns funding persistence.';
comment on column public.survival_state_events.autonomy_level is
  'The autonomy ceiling the observation implied, as the canonical Chapter 18 token. Grants nothing.';

-- ── Chain integrity, enforced structurally ─────────────────────────────────
--
-- The RPC below is the only writer, and it derives from_state under a lock. This
-- trigger is the second, independent layer: even a caller who somehow obtained
-- INSERT could not open a second baseline or break the chain, because the
-- predecessor is re-derived here from the ledger itself rather than taken from
-- the row being inserted.

create or replace function public.survival_events_guard_insert()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_latest text;
begin
  new.recorded_at := clock_timestamp();

  if new.occurred_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'survival history: occurred_at may not be in the future'
      using errcode = '22007';
  end if;

  select e.to_state into v_latest
    from public.survival_state_events e
   where e.project_id = new.project_id
   order by e.event_seq desc
   limit 1;

  if v_latest is null then
    if new.from_state is not null then
      raise exception 'survival history: the first event for a project must be a baseline'
        using errcode = '23514';
    end if;
    if new.event_type <> 'BASELINE_OBSERVED' then
      raise exception 'survival history: the first event for a project must be BASELINE_OBSERVED'
        using errcode = '23514';
    end if;
  else
    if new.event_type <> 'STATE_TRANSITION_OBSERVED' then
      raise exception 'survival history: a project with history cannot open a second baseline'
        using errcode = '23514';
    end if;
    -- THE predecessor is the ledger's, never the caller's.
    if new.from_state is distinct from v_latest then
      raise exception 'survival history: from_state % does not follow the recorded state %',
        coalesce(new.from_state, '<null>'), v_latest
        using errcode = '23514';
    end if;
    if new.to_state = v_latest then
      raise exception 'survival history: a transition must change the state'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists survival_events_guard_insert on public.survival_state_events;
create trigger survival_events_guard_insert
  before insert on public.survival_state_events
  for each row execute function public.survival_events_guard_insert();

-- ── Append-only, enforced ──────────────────────────────────────────────────
--
-- REVOKE alone is not enough and a trigger alone is not enough; both are here.
-- The revokes remove the write privilege from every role, and the triggers bind
-- even a superuser path. An audit ledger its own writer can rewrite is not an
-- audit ledger.

create or replace function public.survival_events_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'survival_state_events is append-only (attempted %)', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists survival_events_no_mutation on public.survival_state_events;
create trigger survival_events_no_mutation
  before update or delete on public.survival_state_events
  for each row execute function public.survival_events_append_only();

drop trigger if exists survival_events_no_truncate on public.survival_state_events;
create trigger survival_events_no_truncate
  before truncate on public.survival_state_events
  for each statement execute function public.survival_events_append_only();

-- ── The one write boundary ─────────────────────────────────────────────────
--
-- THREE THINGS ARE DELIBERATELY NOT PARAMETERS: the autonomy ceiling, the actor
-- and the provenance. All three are DERIVED FACTS the database already knows:
-- the ceiling is v1's mapping from the state, and the actor and provenance are
-- the fixed identity of the machine recorder. A caller that could pass them
-- could author evidence about its own authority, which is exactly what this
-- ledger must not be able to hold.
--
-- `p_threshold_status` / `p_derivation_version` STAY, for the opposite reason:
-- they are the application's ASSERTION about which policy it observed under, and
-- the boundary must be able to REFUSE a claim this schema cannot honour.

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
begin
  if p_project_id is null then
    raise exception 'p_project_id is required' using errcode = '22023';
  end if;
  if p_to_state is null then
    raise exception 'p_to_state is required' using errcode = '22023';
  end if;
  -- The derived facts this row exists to explain must be present. A transition
  -- with no reasons cannot be explained later, which is the only thing this
  -- ledger is for.
  if p_reasons is null then
    raise exception 'p_reasons is required (may be empty)' using errcode = '22023';
  end if;
  if p_gaps is null then
    raise exception 'p_gaps is required (may be empty)' using errcode = '22023';
  end if;
  if p_occurred_at is null then
    raise exception 'p_occurred_at is required' using errcode = '22023';
  end if;

  -- ── Fail closed on version skew ──────────────────────────────────────────
  -- The persisted policy identity is v1/provisional and nothing else. If the
  -- application has moved ahead of this schema, recording must FAIL rather than
  -- have a v2 observation written down as v1: a mislabelled row is worse than a
  -- missing one, because nothing later can tell it apart from a true v1 row.
  if p_derivation_version is null or p_derivation_version <> 1 then
    raise exception 'unsupported derivation version % — this schema implements v1',
      p_derivation_version using errcode = '22023';
  end if;
  if p_threshold_status is null or p_threshold_status <> 'provisional' then
    raise exception 'unsupported threshold status % — this schema implements provisional',
      p_threshold_status using errcode = '22023';
  end if;

  -- ── The ceiling is derived here, not accepted ────────────────────────────
  -- v1's canonical mapping. Deriving it at the boundary means the guardian of
  -- autonomy cannot be given a contradictory ceiling by the thing it observes,
  -- and the table constraint below closes the same door for a privileged writer.
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

  -- Serialise concurrent observers of THIS stream. Without the lock two workers
  -- both read the old state and both insert a transition, and the ledger then
  -- claims the same change happened twice. The project row is the lock target
  -- because it always exists and is the stream's own identity — the same shape
  -- `stop_set_platform_automation` uses on the platform singleton.
  perform 1 from public.projects p where p.id = p_project_id for update;
  if not found then
    raise exception 'project % does not exist', p_project_id using errcode = 'P0002';
  end if;

  select e.to_state into v_previous
    from public.survival_state_events e
   where e.project_id = p_project_id
   order by e.event_seq desc
   limit 1;

  -- No history yet: the first observation is a BASELINE, and only a baseline.
  if v_previous is null then
    insert into public.survival_state_events (
      project_id, event_type, from_state, to_state, autonomy_level, reasons, gaps,
      binding_scope, binding_limit_sek, binding_remaining_sek, burn_sek_per_day,
      funding_state, declared_funding_sek, runway_days, revenue_trend_sek,
      operating_paused, threshold_status, derivation_version,
      actor_principal, provenance, occurred_at)
    values (
      p_project_id, 'BASELINE_OBSERVED', null, p_to_state, v_autonomy_level,
      p_reasons, p_gaps, p_binding_scope, p_binding_limit_sek, p_binding_remaining_sek,
      p_burn_sek_per_day, p_funding_state, p_declared_funding_sek, p_runway_days,
      p_revenue_trend_sek, p_operating_paused, p_threshold_status, p_derivation_version,
      'atlas.survival_recorder', 'atlas.survival.observation.v1', p_occurred_at)
    returning survival_state_events.event_id, survival_state_events.event_seq
      into v_event_id, v_event_seq;

    return query select 'baseline_recorded'::text, v_event_id, v_event_seq, null::text, p_to_state;
    return;
  end if;

  -- The state is unchanged. This is the answer to polling noise: observing the
  -- same state again records NOTHING, and a retry of the same observation lands
  -- here rather than creating a duplicate.
  if v_previous = p_to_state then
    return query select 'unchanged'::text, null::uuid, null::bigint, v_previous, p_to_state;
    return;
  end if;

  insert into public.survival_state_events (
    project_id, event_type, from_state, to_state, autonomy_level, reasons, gaps,
    binding_scope, binding_limit_sek, binding_remaining_sek, burn_sek_per_day,
    funding_state, declared_funding_sek, runway_days, revenue_trend_sek,
    operating_paused, threshold_status, derivation_version,
    actor_principal, provenance, occurred_at)
  values (
    p_project_id, 'STATE_TRANSITION_OBSERVED', v_previous, p_to_state, v_autonomy_level,
    p_reasons, p_gaps, p_binding_scope, p_binding_limit_sek, p_binding_remaining_sek,
    p_burn_sek_per_day, p_funding_state, p_declared_funding_sek, p_runway_days,
    p_revenue_trend_sek, p_operating_paused, p_threshold_status, p_derivation_version,
    'atlas.survival_recorder', 'atlas.survival.observation.v1', p_occurred_at)
  returning survival_state_events.event_id, survival_state_events.event_seq
    into v_event_id, v_event_seq;

  return query select 'transition_recorded'::text, v_event_id, v_event_seq, v_previous, p_to_state;
end;
$$;

-- ── Privileges ─────────────────────────────────────────────────────────────
--
-- SELECT and EXECUTE, and nothing else. There is deliberately no INSERT grant to
-- any role: the ONLY way a row can be written is through the function above,
-- which derives from_state itself — and, for the same reason, the autonomy
-- ceiling, the actor and the provenance. A caller that could INSERT could choose
-- its own predecessor and author its own evidence, which is exactly what those
-- four columns must not be.

alter table public.survival_state_events enable row level security;
revoke all on table public.survival_state_events from public, anon, authenticated, service_role;
grant select on table public.survival_state_events to service_role;

-- service_role is included in the revoke as well as the grant. A function's only
-- grantable privilege is EXECUTE, so revoking and re-granting is a no-op *when*
-- no other grant exists — but including it makes service_role's privilege set
-- exactly {EXECUTE} unconditionally, rather than depending on that reasoning
-- holding against whatever default ACL the project happens to carry.
--
-- The signature list must track the function exactly: a stale argument list
-- makes the REVOKE a no-op for a name that does not exist, which PostgreSQL
-- reports as nothing at all.
revoke all on function public.survival_record_observation(
  uuid, text, text[], text[], text, numeric, numeric, numeric,
  text, numeric, numeric, numeric, boolean, text, integer, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.survival_record_observation(
  uuid, text, text[], text[], text, numeric, numeric, numeric,
  text, numeric, numeric, numeric, boolean, text, integer, timestamptz)
  to service_role;

-- The identity sequence needs its own revoke. `revoke ... on table` does not
-- touch it, and the project's default ACL grants sequences to anon,
-- authenticated and service_role, so without this line all three keep
-- rwU — USAGE lets them nextval(), and UPDATE lets them setval() the chain
-- cursor backwards, which could collide with an existing event_seq and fail the
-- definer's INSERT. Only the definer inserts; the owner keeps its implicit
-- rights, so no role needs this sequence.
revoke all on sequence public.survival_state_events_event_seq_seq
  from public, anon, authenticated, service_role;
