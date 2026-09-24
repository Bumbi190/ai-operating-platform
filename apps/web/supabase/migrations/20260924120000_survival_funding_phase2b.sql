-- Phase 2B — owner-declared operating capital, and derivation v2 in history.
--
-- THREE THINGS, ONE PURPOSE. This migration adds (1) one nullable column on the
-- existing platform_config singleton, (2) one narrow append-only ledger that
-- audits changes to it, and (3) the minimum history-schema widening needed for
-- Phase 2A to record derivation v2 observations truthfully.
--
-- ── THE FIGURE IS RUNWAY INPUT ONLY ────────────────────────────────────────
-- `declared_operating_capital_sek` is NOT a budget, NOT a spend authorization,
-- NOT a wallet or bank balance, NOT accounting cash, and NOT revenue. It cannot
-- authorize anything: nothing reserves against it, no gate reads it, and
-- `effectiveAutonomy = min(licensedAutonomy, survivalCeiling)` is unchanged.
-- Survival pressure may only ever LOWER autonomy; funding never grants it.
--
-- It is deliberately NOT derived from MRR, revenue_snapshots, Stripe,
-- project_budgets, budget_headroom, cost_events, wallets or bank data. Those are
-- measurements of something else.
--
-- ── NULL / VALUE / FAILURE ARE THREE DIFFERENT FACTS ───────────────────────
--   NULL              the owner has never declared, or has cleared it
--                     -> FundingReading { kind: 'UNDECLARED' } -> CONSERVE floor
--   a numeric value   an explicit declaration, read successfully
--                     -> { kind: 'KNOWN', declaredFundingSek } -> may be 0 or negative
--   a FAILED read     a configured source that could not be read
--                     -> { kind: 'UNAVAILABLE' } -> HIBERNATE floor
--
-- Funding state is deliberately NOT a column. It is derivable from "did the read
-- succeed" + "is the value null", and storing it would be the same truth twice.

-- ── 1. The declaration itself ──────────────────────────────────────────────
--
-- numeric(12,4) matches the existing platform-wide money columns on this table
-- (`global_daily_sek`, `global_weekly_sek`, `global_monthly_sek`). Nullable is
-- the point: NULL means UNDECLARED, so there is no default and no sentinel.
--
-- A CHECK is deliberately NOT added to forbid negatives. The canonical
-- `FundingReading` permits zero and negative KNOWN values, and the existing
-- derivation already decides their survival effect (<= 0 -> HIBERNATE floor).
-- Constraining the sign here would be a second, disagreeing policy.

alter table public.platform_config
  add column if not exists declared_operating_capital_sek numeric(12,4);

comment on column public.platform_config.declared_operating_capital_sek is
  'Owner-declared available operating capital (SEK) used ONLY as a survival/runway input. '
  'NULL = UNDECLARED (never declared, or deliberately cleared); a read FAILURE is UNAVAILABLE '
  'and is a different fact. Not a budget, not spend authority, not cash, not revenue. '
  'Writable only through survival_set_declared_operating_capital().';

-- ── 2. The audit ledger ────────────────────────────────────────────────────
--
-- ONE NARROW LEDGER, because no existing one has the right semantics. This is
-- NOT stop_events (that ledger describes the stop authority), NOT the decision /
-- mission / delegation ledgers (authority and decisions), and NOT
-- platform_credential_events (credential material). Recording a funding
-- declaration in any of those would corrupt what that ledger means.
--
-- IT IS NOT THE CURRENT TRUTH. The current declaration lives in
-- platform_config, and only there. This table answers "who changed it, when, and
-- was it SET or CLEARED" — nothing reads it to discover the current value.

create table if not exists public.survival_funding_events (
  id                     uuid primary key default gen_random_uuid(),
  -- Database-assigned total order. The ledger is read by time, but a
  -- monotonic cursor is what makes two same-instant events orderable.
  event_seq              bigint generated always as identity unique,

  -- SET or CLEARED. A closed vocabulary: a free-text event name would be a
  -- policy identifier no reader can interpret.
  event                  text not null,

  -- The declaration on both sides of the change. NULL is a real value here
  -- (undeclared), so "no previous declaration" and "previous declaration of
  -- nothing" are the same fact and need no third column.
  previous_declared_sek  numeric(12,4),
  declared_sek           numeric(12,4),

  -- Derived SERVER-SIDE from the authenticated operator session, never from a
  -- request body. This is the one place in the survival subsystem where the
  -- actor is a human rather than a machine recorder, because changing the
  -- declaration IS a human authority act.
  actor                  text not null,

  created_at             timestamptz not null default now(),

  constraint survival_funding_events_event_valid
    check (event in ('DECLARATION_SET', 'DECLARATION_CLEARED')),
  -- The event name and the resulting declaration are two spellings of one fact,
  -- so they are constrained to agree rather than left able to contradict.
  constraint survival_funding_events_shape
    check (
      (event = 'DECLARATION_SET'     and declared_sek is not null)
      or
      (event = 'DECLARATION_CLEARED' and declared_sek is null)
    ),
  constraint survival_funding_events_actor_present
    check (length(btrim(actor)) between 3 and 200)
);

create index if not exists survival_funding_events_seq_idx
  on public.survival_funding_events (event_seq desc);

comment on table public.survival_funding_events is
  'Append-only audit of owner-declared operating capital changes. Answers who / when / '
  'SET-or-CLEARED. NOT the current funding truth: that lives in platform_config.';

-- Append-only, structurally. An audit ledger its own writer can rewrite is not
-- an audit ledger, so this is triggers rather than convention.

create or replace function public.survival_funding_events_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'survival_funding_events is append-only (attempted %)', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists survival_funding_events_no_mutation on public.survival_funding_events;
create trigger survival_funding_events_no_mutation
  before update or delete on public.survival_funding_events
  for each row execute function public.survival_funding_events_append_only();

drop trigger if exists survival_funding_events_no_truncate on public.survival_funding_events;
create trigger survival_funding_events_no_truncate
  before truncate on public.survival_funding_events
  for each statement execute function public.survival_funding_events_append_only();

-- ── 3. The one atomic owner mutation boundary ──────────────────────────────
--
-- SET and CLEAR are ONE operation with one nullable argument, not two functions.
-- Clearing is not "set to zero": zero is a KNOWN declaration and must stay
-- distinguishable from no declaration at all. Two entry points that could drift
-- apart in locking, auditing or validation is the failure mode this avoids.
--
-- The whole thing is atomic. There is no window in which the configuration
-- changes but the audit row does not, or the reverse: both happen inside one
-- transaction, under one row lock.
--
-- WHO MAY CALL IT: service_role only. Client roles cannot execute it and hold no
-- INSERT grant on either table, so the only path is a server action that has
-- already established platform-operator authority from the authenticated
-- session. The `p_actor` it passes is derived there, never read from a request.

create or replace function public.survival_set_declared_operating_capital(
  p_declared_sek numeric,
  p_actor        text
) returns table (result text, previous_sek numeric, declared_sek numeric)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_previous numeric;
  v_event    text;
begin
  if p_actor is null or length(btrim(p_actor)) < 3 then
    raise exception 'p_actor is required' using errcode = '22023';
  end if;

  -- NaN and the infinities are rejected HERE rather than by a CHECK, because
  -- numeric can hold 'NaN' and a comparison-based constraint would silently
  -- treat it as neither null nor a number. PostgreSQL 14+ also accepts
  -- 'Infinity'::numeric. Neither is a capital figure.
  if p_declared_sek is not null
     and (p_declared_sek = 'NaN'::numeric or p_declared_sek in ('Infinity'::numeric, '-Infinity'::numeric))
  then
    raise exception 'declared operating capital must be a finite number' using errcode = '22023';
  end if;

  -- Lock the singleton BEFORE reading it, so two concurrent operators cannot
  -- both read the same predecessor and write two audit rows that disagree about
  -- what the previous declaration was.
  perform 1 from public.platform_config pc where pc.id = 1 for update;
  if not found then
    raise exception 'platform_config singleton (id=1) does not exist' using errcode = 'P0002';
  end if;

  select pc.declared_operating_capital_sek into v_previous
    from public.platform_config pc where pc.id = 1;

  -- A no-op is answered as such and writes NOTHING, so an operator pressing
  -- "set" twice does not manufacture an audit trail of changes that never
  -- happened. The declaration is still returned, so the caller can render it.
  if v_previous is not distinct from p_declared_sek then
    return query select 'unchanged'::text, v_previous, v_previous;
    return;
  end if;

  update public.platform_config pc
     set declared_operating_capital_sek = p_declared_sek,
         updated_at = now()
   where pc.id = 1;

  v_event := case when p_declared_sek is null then 'DECLARATION_CLEARED' else 'DECLARATION_SET' end;

  insert into public.survival_funding_events
    (event, previous_declared_sek, declared_sek, actor)
  values
    (v_event, v_previous, p_declared_sek, btrim(p_actor));

  return query select 'recorded'::text, v_previous, p_declared_sek;
end;
$$;

-- ── 3b. The scope-completeness question, answered server-side ──────────────
--
-- "Does this project set contain every project on the platform?" is a
-- cross-tenant question: answering it by reading `public.projects` from the
-- application would mean a service-role read OUTSIDE the caller's scope, which
-- is exactly what the Atlas isolation invariant forbids — and it would be the
-- kind of read that starts as a count and ends as a list.
--
-- So it is answered here instead, and it returns ONE BOOLEAN. No project id,
-- no count, no row ever leaves the database. A caller learns whether its scope
-- is complete and nothing about what lies outside it.
--
-- FAIL-CLOSED is the caller's job, not this function's: an error, an empty
-- argument, or a false answer all mean "not platform-complete", and the
-- derivation treats that as the restrictive case.

create or replace function public.survival_scope_is_platform_complete(
  p_project_ids uuid[]
) returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  -- TRUE only when NO project exists outside the given set. An empty set is
  -- therefore never complete, unless the platform genuinely has no projects —
  -- in which case there is no burn to divide by either, and the derivation
  -- reports runway as unestablished rather than infinite.
  select not exists (
    select 1 from public.projects p
     where not (p.id = any (coalesce(p_project_ids, array[]::uuid[])))
  );
$$;

comment on function public.survival_scope_is_platform_complete(uuid[]) is
  'Does this project set cover every project on the platform? Returns ONE BOOLEAN and never '
  'a row, an id or a count, so a caller cannot learn anything outside its own scope. '
  'Phase 2B uses it to decide whether platform-wide operating capital may be divided by this '
  'observation''s burn to produce a runway figure.';

-- ── 4. History must be able to record derivation v2 ────────────────────────
--
-- Phase 2A pinned the persisted policy identity to v1/provisional and said in
-- its own comment that widening it is a reviewed migration shipping alongside
-- the derivation it describes. This is that migration. The v1 rows already in
-- production stay valid and stay interpretable; nothing rewrites them.

alter table public.survival_state_events
  add column if not exists runway_coverage text;

comment on column public.survival_state_events.runway_coverage is
  'Whether this observation covered the whole platform burn population, and therefore whether '
  'runway could be calculated at all. NULL on v1 rows, which predate the concept. This is what '
  'lets a later reader distinguish "runway unknown because no burn was measured" from "runway '
  'deliberately suppressed because the observation scope was partial".';

alter table public.survival_state_events
  drop constraint if exists survival_events_policy_identity_valid;
alter table public.survival_state_events
  add constraint survival_events_policy_identity_valid
  check (
    (derivation_version = 1 and threshold_status = 'provisional' and runway_coverage is null)
    or
    (derivation_version = 2 and threshold_status = 'provisional' and runway_coverage is not null)
  );

alter table public.survival_state_events
  drop constraint if exists survival_events_runway_coverage_valid;
alter table public.survival_state_events
  add constraint survival_events_runway_coverage_valid
  check (runway_coverage is null or runway_coverage in ('PLATFORM_COMPLETE', 'PARTIAL_SCOPE'));

-- The coverage rule itself, stated where the row is written.
--
-- `derive.ts` withholds a runway figure whenever the observation does not cover
-- the whole platform, because platform capital divided by a partial burn is
-- larger than the truth. That rule is implemented in TypeScript — but a rule
-- only the current caller honours is not a property of the ledger. A direct RPC
-- call, or a future caller that assembles its own arguments, could record a
-- partial scope beside a fabricated positive runway and nothing here would
-- object.
--
-- So a POSITIVE runway under PARTIAL_SCOPE is refused structurally. Zero is
-- deliberately permitted: a depleted declaration yields runway 0, and that fact
-- does not depend on the project set — "there is nothing to spend" is not made
-- less true by looking at less of the platform (see the depleted branch in
-- `derive.ts`, which runs before the coverage check). NULL is permitted for the
-- same reason, and is the truthful value for every other partial-scope row.
alter table public.survival_state_events
  drop constraint if exists survival_events_coverage_runway_valid;
alter table public.survival_state_events
  add constraint survival_events_coverage_runway_valid
  check (
    runway_coverage is distinct from 'PARTIAL_SCOPE'
    or runway_days is null
    or runway_days <= 0
  );

-- The new gap joins the existing closed vocabulary. It is NOT a synonym for
-- runway_unknown: that one means "no runway figure could be established", while
-- this one means "a figure EXISTS to be computed and was deliberately withheld
-- because the observation does not cover the whole platform".
alter table public.survival_state_events
  drop constraint if exists survival_events_gaps_valid;
alter table public.survival_state_events
  add constraint survival_events_gaps_valid
  check (gaps <@ array[
    'funding_undeclared', 'funding_unavailable', 'runway_unknown',
    'reads_incomplete', 'infrastructure_cost_untracked', 'runway_scope_incomplete']::text[]);

-- The recorder gains the coverage argument. CREATE OR REPLACE cannot change a
-- signature — it would silently create an OVERLOAD beside the 16-argument
-- function, leaving two writers with different rules — so the old one is
-- dropped explicitly and its grants re-issued below.
drop function if exists public.survival_record_observation(
  uuid, text, text[], text[], text, numeric, numeric, numeric,
  text, numeric, numeric, numeric, boolean, text, integer, timestamptz);

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
  if p_threshold_status is null or p_threshold_status <> 'provisional' then
    raise exception 'unsupported threshold status % — this schema implements provisional',
      p_threshold_status using errcode = '22023';
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
      'atlas.survival_recorder', 'atlas.survival.observation.v1', p_occurred_at)
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
    'atlas.survival_recorder', 'atlas.survival.observation.v1', p_occurred_at)
  returning survival_state_events.event_id, survival_state_events.event_seq
    into v_event_id, v_event_seq;

  return query select 'transition_recorded'::text, v_event_id, v_event_seq, v_previous, p_to_state;
end;
$$;

-- ── 5. Privileges ──────────────────────────────────────────────────────────
--
-- SELECT and EXECUTE, and nothing else, for the same reasons Phase 2A set out:
-- the boundary derives what it can, and no role can write a table directly.

alter table public.survival_funding_events enable row level security;
revoke all on table public.survival_funding_events from public, anon, authenticated, service_role;
grant select on table public.survival_funding_events to service_role;

revoke all on function public.survival_funding_events_append_only()
  from public, anon, authenticated, service_role;

revoke all on function public.survival_set_declared_operating_capital(numeric, text)
  from public, anon, authenticated, service_role;
grant execute on function public.survival_set_declared_operating_capital(numeric, text)
  to service_role;

revoke all on function public.survival_scope_is_platform_complete(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.survival_scope_is_platform_complete(uuid[])
  to service_role;

-- Re-issued for the REPLACED recorder signature. The old 16-argument grants went
-- with the dropped function; these are the new 17-argument ones.
revoke all on function public.survival_record_observation(
  uuid, text, text[], text[], text, numeric, numeric, numeric,
  text, numeric, numeric, numeric, boolean, text, integer, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.survival_record_observation(
  uuid, text, text[], text[], text, numeric, numeric, numeric,
  text, numeric, numeric, numeric, boolean, text, integer, text, timestamptz)
  to service_role;

-- The ledger's identity sequence needs its own revoke, exactly as Phase 2A's
-- does: `revoke ... on table` does not reach a sequence, and the default ACL
-- grants sequences to anon, authenticated and service_role.
revoke all on sequence public.survival_funding_events_event_seq_seq
  from public, anon, authenticated, service_role;
