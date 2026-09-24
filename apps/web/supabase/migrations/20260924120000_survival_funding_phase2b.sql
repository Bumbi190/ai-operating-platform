-- Phase 2B — owner-declared operating capital, and derivation v2 in history.
--
-- THREE THINGS, ONE PURPOSE. This migration adds (1) one SERVER-ONLY singleton
-- holding the declaration, (2) one narrow append-only ledger that audits changes
-- to it, and (3) the minimum history-schema widening needed for Phase 2A to
-- record derivation v2 observations truthfully.
--
-- ── WHERE THE DECLARATION LIVES, AND WHY NOT ON platform_config ─────────────
-- The first design put the column on `platform_config`. It was withdrawn:
-- production grants `authenticated` SELECT on that table through the
-- `authenticated_read_platform_config` policy whose qual is literally `true`, so
-- the platform owner's operating capital would have been published to every
-- authenticated user. RLS protects ROWS, not columns, and a policy that reads
-- `true` cannot be narrowed by adding a field to its table.
--
-- The declaration therefore lives in its own singleton with no client grant of
-- any kind. See §1.
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

-- ── 1. The declaration itself: one SERVER-ONLY singleton ───────────────────
--
-- This is NOT a second general configuration authority. Its scope is exactly one
-- fact, and it holds exactly one row.
--
-- numeric(12,4) matches the platform's existing money columns. Nullable is the
-- point: NULL means UNDECLARED, so there is no default and no sentinel.
--
-- A CHECK is deliberately NOT added to forbid negatives. The canonical
-- `FundingReading` permits zero and negative KNOWN values, and the derivation
-- already decides their survival effect (<= 0 floors at HIBERNATE). Constraining
-- the sign here would be a second, disagreeing policy.

create table if not exists public.survival_funding_config (
  id                             integer primary key,
  declared_operating_capital_sek numeric(12,4),
  updated_at                     timestamptz not null default now(),

  -- The singleton invariant, stated structurally rather than described. `id = 1`
  -- is the only admissible row, so "the current declaration" is never a question
  -- with more than one answer, and a second row cannot be created by accident.
  constraint survival_funding_config_singleton check (id = 1)
);

-- Seeded NULL, idempotently: a re-run must never disturb a declaration that
-- already exists. NULL is the truthful initial state — the owner has not
-- declared anything yet, which is UNDECLARED, not zero.
insert into public.survival_funding_config (id, declared_operating_capital_sek)
values (1, null)
on conflict (id) do nothing;

comment on table public.survival_funding_config is
  'CURRENT TRUTH for the owner-declared operating capital used ONLY as a survival/runway '
  'input. Exactly one row (id = 1). NULL = UNDECLARED; a read FAILURE is UNAVAILABLE and is '
  'a different fact. Not a budget, not spend authority, not cash, not revenue. SERVER_ONLY: '
  'no client role holds any grant on it, and the sole writer is '
  'survival_set_declared_operating_capital().';

comment on column public.survival_funding_config.declared_operating_capital_sek is
  'The owner''s declaration, or NULL for UNDECLARED. Written only by the SECURITY DEFINER '
  'setter, which appends the matching survival_funding_events row in the same transaction.';

-- ── 1b. …and no separate trigger guard is needed ────────────────────────────
--
-- An earlier revision of this migration kept the column on `platform_config` and
-- defended it with an owner-check trigger, because `service_role` may UPDATE that
-- table and the value would otherwise be directly writable around the audited
-- setter.
--
-- Here there is nothing to guard. No role but the owner holds INSERT, UPDATE,
-- DELETE or TRUNCATE on this table at all — see §5 — so the ACL IS the boundary,
-- and the SECURITY DEFINER setter is the only writer that can exist.
--
-- ACL closure is preferred over a trigger workaround whenever the table exists
-- solely for this concern: one mechanism, stated exactly where a reviewer looks
-- for privileges, instead of two that must be kept in agreement. The historical
-- `stop_guard_platform_config()` is untouched and still protects the pause
-- columns on `platform_config`, which is a different concern.

-- ── 2. The audit ledger ────────────────────────────────────────────────────
--
-- ONE NARROW LEDGER, because no existing one has the right semantics. This is
-- NOT stop_events (that ledger describes the stop authority), NOT the decision /
-- mission / delegation ledgers (authority and decisions), and NOT
-- platform_credential_events (credential material). Recording a funding
-- declaration in any of those would corrupt what that ledger means.
--
-- IT IS NOT THE CURRENT TRUTH. The current declaration lives in
-- survival_funding_config, and only there. This table answers "who changed it,
-- when, and was it SET or CLEARED" — nothing reads it to discover the current
-- value.

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
  -- The ledger is an audit of a HUMAN platform-owner mutation, so the actor is
  -- constrained to the canonical authenticated human shape — `user:<uuid>` —
  -- rather than to any trimmed text of a plausible length. Without this the
  -- immutable ledger could record `cron`, `atlas.survival_recorder` or
  -- `system:123` as the person who changed the declaration, which is a machine
  -- token laundered into a human authority record and is exactly what an
  -- append-only ledger must not be able to say.
  --
  -- This does NOT replace `resolvePlatformOperator()`; the server action remains
  -- the authority boundary. It removes the ledger's ABILITY to claim a
  -- machine-shaped actor even if some future caller tried.
  -- The shape is the repository's CANONICAL UUID family, not merely
  -- "8-4-4-4-12 hex": the version nibble must be 1–5 and the variant nibble must
  -- be 8, 9, a or b. A loose hex pattern would accept the nil UUID and other
  -- bit patterns no generator in this repository can produce, so a row could look
  -- like a real authenticated actor while naming one that cannot exist.
  constraint survival_funding_events_actor_human_identity
    check (actor ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
);

create index if not exists survival_funding_events_seq_idx
  on public.survival_funding_events (event_seq desc);

comment on table public.survival_funding_events is
  'Append-only audit of owner-declared operating capital changes. Answers who / when / '
  'SET-or-CLEARED. NOT the current funding truth: that lives in survival_funding_config.';

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
  v_declared numeric(12,4);
  v_event    text;
begin
  -- ── The actor must be the canonical authenticated human shape ─────────────
  -- Not "some text of plausible length": this row is the ONLY record that a
  -- person changed the declaration, so a machine token here would be a human
  -- authority claim that no human made. The table carries the same rule as a
  -- CHECK, so this holds even against a direct call.
  -- Version nibble 1–5, variant nibble 8/9/a/b: the canonical UUID family this
  -- repository actually generates. A loose 8-4-4-4-12 hex pattern would admit
  -- the nil UUID and other patterns no generator here produces, so the immutable
  -- ledger could name a human-shaped actor that cannot exist.
  if p_actor is null
     or p_actor !~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception 'p_actor must be the canonical human actor shape user:<uuid>' using errcode = '22023';
  end if;

  -- ── The declaration must be EXACTLY representable in numeric(12,4) ────────
  --
  -- The column and the audit amounts are numeric(12,4), and PostgreSQL ROUNDS
  -- on assignment. Accepting extra precision would mean the RPC returns a
  -- number the table does not hold — 1.23456 in, 1.2346 stored — so the
  -- mutation's own response could disagree with current truth. It would also
  -- corrupt no-op detection: a stored 1.2346 re-submitted as 1.23456 is
  -- DISTINCT while persisting the same value, manufacturing an audit row for a
  -- change that never happened.
  --
  -- So a non-representable value is REFUSED rather than silently rounded. The
  -- owner's declaration is recorded as declared, or not at all.
  if p_declared_sek is not null then
    -- NaN and the infinities first: numeric can hold 'NaN', and a
    -- comparison-based check would treat it as neither null nor a number.
    -- PostgreSQL 14+ also accepts 'Infinity'::numeric. Neither is a figure.
    if p_declared_sek = 'NaN'::numeric
       or p_declared_sek in ('Infinity'::numeric, '-Infinity'::numeric)
    then
      raise exception 'declared operating capital must be a finite number' using errcode = '22023';
    end if;

    -- More than four decimal places is precision loss. `round(x, 4)` returns a
    -- different VALUE for such an input, so equality is the exactness test.
    -- Trailing zeros are fine: 1.23000 and 1.23 are the same numeric value, and
    -- no information is lost storing either.
    if p_declared_sek <> pg_catalog.round(p_declared_sek, 4) then
      raise exception
        'declared operating capital must have at most 4 decimal places; % would be rounded',
        p_declared_sek using errcode = '22023';
    end if;

    -- numeric(12,4) is 8 integer digits and 4 fractional digits. Checking here
    -- rather than letting the assignment raise keeps the failure a clear
    -- refusal instead of a numeric field overflow.
    if p_declared_sek < -99999999.9999 or p_declared_sek > 99999999.9999 then
      raise exception
        'declared operating capital is outside the numeric(12,4) range: %',
        p_declared_sek using errcode = '22023';
    end if;
  end if;

  -- The canonical value, and the ONLY one this function compares, writes, audits
  -- or returns. It is byte-for-byte what the column and the ledger will hold, so
  -- the response cannot describe a value different from the stored truth.
  v_declared := p_declared_sek::numeric(12,4);

  -- Lock the singleton BEFORE reading it, so two concurrent operators cannot
  -- both read the same predecessor and write two audit rows that disagree about
  -- what the previous declaration was.
  --
  -- This table, not `platform_config`: the declaration lives in its own
  -- SERVER-ONLY singleton, precisely so that a broadly-readable table cannot
  -- publish the owner's operating capital. Nothing about the funding truth is
  -- read from or written to `platform_config` anywhere in Phase 2B.
  perform 1 from public.survival_funding_config fc where fc.id = 1 for update;
  if not found then
    raise exception 'survival_funding_config singleton (id=1) does not exist' using errcode = 'P0002';
  end if;

  select fc.declared_operating_capital_sek into v_previous
    from public.survival_funding_config fc where fc.id = 1;

  -- A no-op is answered as such and writes NOTHING, so an operator pressing
  -- "set" twice does not manufacture an audit trail of changes that never
  -- happened. The declaration is still returned, so the caller can render it.
  --
  -- Compared against `v_declared`, the value that would actually be persisted —
  -- so "same value" means "the table would not change", not "the argument
  -- looked similar".
  if v_previous is not distinct from v_declared then
    return query select 'unchanged'::text, v_previous, v_previous;
    return;
  end if;

  update public.survival_funding_config fc
     set declared_operating_capital_sek = v_declared,
         updated_at = now()
   where fc.id = 1;

  v_event := case when v_declared is null then 'DECLARATION_CLEARED' else 'DECLARATION_SET' end;

  insert into public.survival_funding_events
    (event, previous_declared_sek, declared_sek, actor)
  values
    (v_event, v_previous, v_declared, p_actor);

  return query select 'recorded'::text, v_previous, v_declared;
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

-- `provenance` records the observation FORMAT the recorder implements, and
-- Phase 2B changed that format: it added `runway_coverage`, moved the recorder
-- from 16 to 17 parameters, and introduced the v2 coverage semantics. A v2 row
-- therefore cannot honestly carry the v1 provenance string — a reader that uses
-- provenance to decide how to decode the envelope would decode a v2 row with a
-- schema that predates its own column.
--
-- So the pairing is pinned HERE, beside the coverage pairing, and the two
-- derived facts (which format, which semantics) can never disagree:
--
--   derivation v1  →  atlas.survival.observation.v1  →  runway_coverage IS NULL
--   derivation v2  →  atlas.survival.observation.v2  →  runway_coverage NOT NULL
--
-- v1 rows are untouched and remain valid and interpretable under this rule.
alter table public.survival_state_events
  drop constraint if exists survival_events_policy_identity_valid;
alter table public.survival_state_events
  add constraint survival_events_policy_identity_valid
  check (
    (derivation_version = 1 and threshold_status = 'provisional'
       and runway_coverage is null
       and provenance = 'atlas.survival.observation.v1')
    or
    (derivation_version = 2 and threshold_status = 'provisional'
       and runway_coverage is not null
       and provenance = 'atlas.survival.observation.v2')
  );

-- The vocabulary widens to admit the new format string. Kept as its own
-- constraint rather than folded away: it still states the closed set on its own,
-- so a row can never carry an arbitrary provenance that the pairing happens not
-- to mention.
alter table public.survival_state_events
  drop constraint if exists survival_events_provenance_machine_identity;
alter table public.survival_state_events
  add constraint survival_events_provenance_machine_identity
  check (provenance in ('atlas.survival.observation.v1', 'atlas.survival.observation.v2'));

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

-- ── 5. Privileges ──────────────────────────────────────────────────────────
--
-- SELECT and EXECUTE, and nothing else, for the same reasons Phase 2A set out:
-- the boundary derives what it can, and no role can write a table directly.

alter table public.survival_funding_events enable row level security;
revoke all on table public.survival_funding_events from public, anon, authenticated, service_role;
grant select on table public.survival_funding_events to service_role;

-- ── The current-truth singleton: SELECT for the service role, and NOTHING else
--
-- The whole reason this value has its own table is that `platform_config` is
-- readable by `authenticated`. Here there is no such surface to inherit: RLS is
-- on with no policy, every grant is revoked from every role including
-- service_role, and exactly one privilege is handed back — SELECT.
--
-- No INSERT, no UPDATE, no DELETE, no TRUNCATE for anyone. That is what makes
-- the SECURITY DEFINER setter the ONLY writer that can exist, and it is why this
-- migration needs no owner-check trigger (§1b): the ACL already says it.
--
-- `id integer primary key` has no default and no identity, so there is no
-- sequence behind this table and therefore no second write surface to close.
alter table public.survival_funding_config enable row level security;
revoke all on table public.survival_funding_config from public, anon, authenticated, service_role;
grant select on table public.survival_funding_config to service_role;

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
