-- ═══════════════════════════════════════════════════════════════════════════
-- M0 — Durable spend settlement
-- ═══════════════════════════════════════════════════════════════════════════
--
-- THE INVARIANT
--   After a billable provider dispatch MAY have occurred, that spend never
--   disappears from budget (and therefore Survival) authority because telemetry
--   or settlement failed. Uncertainty over-counts; it never removes spend.
--
-- THE DEFECT THIS CLOSES (3B1B2 final ruling, M0)
--   `budget_scope_state` counts `spent` from `cost_events` and `held` from OPEN,
--   non-stale reservations. `budget_settle` flipped a reservation to `settled`
--   with no cost row of its own, and the cost row was written separately and
--   best-effort by lib/cost/track.ts, which ignored the insert's error. So
--     reserve → provider charged → cost insert fails → settle succeeds
--   left the spend counted NOWHERE. The ambiguous-failure path, OpenAI chat and
--   OpenAI speech settled with no cost row at all, and a crash after dispatch
--   let the reservation go stale after 30 minutes and stop counting.
--
-- THE MODEL (smallest extension of the existing reservation lifecycle)
--   open,  dispatched_at IS NULL      not dispatched; the 30-minute stale rule
--                                     still applies, with its canonical meaning:
--                                     "no progress observed, so never dispatched".
--   open,  dispatched_at IS NOT NULL  dispatch MAY have happened. Counted as held
--                                     for as long as it is open. Never stale.
--   settled                           its authoritative cost rows exist, linked by
--                                     reservation_id, written in the SAME
--                                     transaction as the status flip.
--   released                          only with evidence the provider was not
--                                     called: refused at reserve, released before
--                                     dispatch intent, or — after intent — by the
--                                     dispatcher holding the intent's token, on
--                                     the canonical proven-not-dispatched path.
--
--   `remaining = limit - spent - held` is unchanged. M0 changes how reliably
--   spend reaches `spent`/`held`, not any limit.
--
-- 1 RESERVATION : N COST ROWS
--   Every governed adapter today records at most one metered row per call, but
--   nothing structural makes that 1:1, so no unique index is added. Completion is
--   proven by the status flip itself: a reservation becomes `settled` only with
--   ≥1 linked row whose sum equals `actual_sek` (commit-time check), and no linked
--   row can be added once it is settled. A second settlement, a reconciler racing
--   a live settlement, or a late metered result therefore cannot double-count.
--
-- PRIVILEGES
--   spend_reservations was writable by anon/authenticated/service_role through the
--   default ACL. Every state change now goes through the SECURITY DEFINER functions
--   below; client roles keep SELECT only (service_role). cost_events keeps its
--   existing service_role access EXCEPT the two settlement columns, so the
--   best-effort logger can never forge a settlement row.
--
-- NOT APPLIED BY THIS BRANCH. Deploy order: this migration BEFORE the code that
-- calls budget_mark_dispatch_intent / budget_settle_recorded.

-- ── 1. Reservation lifecycle facts ──────────────────────────────────────────

alter table public.spend_reservations
  add column if not exists dispatched_at     timestamptz,
  add column if not exists dispatch_token    uuid,
  add column if not exists settlement_kind   text,
  add column if not exists release_basis     text,
  add column if not exists estimate_exceeded boolean;

comment on column public.spend_reservations.dispatched_at is
  'M0: provider dispatch MAY have occurred from this instant. An open reservation with this set counts as held until settled, regardless of age.';
comment on column public.spend_reservations.dispatch_token is
  'M0: capability of the one dispatcher that marked intent. Required to settle it or to release it as proven-not-dispatched.';
comment on column public.spend_reservations.settlement_kind is
  'M0: how the settled amount was established — metered | estimate_ambiguous | estimate_unmetered | estimate_reconciled. NULL on pre-M0 settlements.';
comment on column public.spend_reservations.estimate_exceeded is
  'M0: metered cost exceeded the reserved upper bound. Recorded honestly; surfaces a violated estimator assumption.';

alter table public.spend_reservations
  drop constraint if exists spend_reservations_dispatch_pair,
  add constraint spend_reservations_dispatch_pair
    check ((dispatched_at is null) = (dispatch_token is null)),
  drop constraint if exists spend_reservations_settlement_kind_vocab,
  add constraint spend_reservations_settlement_kind_vocab
    check (settlement_kind is null or settlement_kind in
      ('metered', 'estimate_ambiguous', 'estimate_unmetered', 'estimate_reconciled')),
  drop constraint if exists spend_reservations_settlement_kind_only_settled,
  add constraint spend_reservations_settlement_kind_only_settled
    check (settlement_kind is null or status = 'settled'),
  drop constraint if exists spend_reservations_estimate_exceeded_only_settled,
  add constraint spend_reservations_estimate_exceeded_only_settled
    check (estimate_exceeded is null or settlement_kind is not null),
  drop constraint if exists spend_reservations_release_basis_vocab,
  add constraint spend_reservations_release_basis_vocab
    check (release_basis is null or release_basis in
      ('refused_at_reserve', 'not_dispatched', 'proven_not_dispatched', 'replay_stale_undispatched')),
  drop constraint if exists spend_reservations_release_basis_only_released,
  add constraint spend_reservations_release_basis_only_released
    check (release_basis is null or status = 'released'),
  -- A reservation whose dispatch MAY have happened is released only on the
  -- canonical proven-not-dispatched path. Every other exit is settlement.
  -- `is not distinct from` is load-bearing: a plain `=` is NULL for a NULL basis,
  -- and a CHECK passes on NULL — a basis-less release would slip through.
  drop constraint if exists spend_reservations_dispatched_release_requires_proof,
  add constraint spend_reservations_dispatched_release_requires_proof
    check (status <> 'released' or dispatched_at is null
           or release_basis is not distinct from 'proven_not_dispatched');

-- The reconciler's scan: open reservations with dispatch intent, oldest first.
create index if not exists spend_reservations_open_dispatched_idx
  on public.spend_reservations (dispatched_at)
  where status = 'open' and dispatched_at is not null;

-- ── 2. The authoritative spend representation: linked cost rows ─────────────

alter table public.cost_events
  add column if not exists reservation_id  uuid references public.spend_reservations (id),
  add column if not exists settlement_kind text;

comment on column public.cost_events.reservation_id is
  'M0: the governed reservation this row SETTLES. Written only by budget_settle_recorded / budget_reconcile_dispatched. NULL for legacy and ungoverned rows (never back-filled).';

alter table public.cost_events
  drop constraint if exists cost_events_settlement_pair,
  add constraint cost_events_settlement_pair
    check ((reservation_id is null) = (settlement_kind is null)),
  drop constraint if exists cost_events_settlement_kind_vocab,
  add constraint cost_events_settlement_kind_vocab
    check (settlement_kind is null or settlement_kind in
      ('metered', 'estimate_ambiguous', 'estimate_unmetered', 'estimate_reconciled')),
  -- A settlement amount is a real non-negative figure. Legacy rows are untouched:
  -- the constraint binds only rows that carry a reservation link.
  drop constraint if exists cost_events_settlement_amount_valid,
  add constraint cost_events_settlement_amount_valid
    check (reservation_id is null or (cost_sek >= 0 and cost_usd >= 0));

create index if not exists cost_events_reservation_idx
  on public.cost_events (reservation_id) where reservation_id is not null;

-- ── 3. Structural guards ────────────────────────────────────────────────────

-- 3a. Reservation transitions. Terminal states are terminal; the reservation's
--     identity never changes; dispatch intent is set once, only while open.
create or replace function public.spend_reservations_guard_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id
     or new.project_id is distinct from old.project_id
     or new.estimated_sek is distinct from old.estimated_sek
     or new.provider is distinct from old.provider
     or new.operation is distinct from old.operation
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at is distinct from old.created_at
     or to_jsonb(new) ->> 'advisory_override' is distinct from to_jsonb(old) ->> 'advisory_override' then
    raise exception 'spend_reservations: a reservation''s identity is immutable' using errcode = '55000';
  end if;
  if old.status <> 'open' then
    raise exception 'spend_reservations: % is terminal', old.status using errcode = '55000';
  end if;
  if old.dispatched_at is not null
     and (new.dispatched_at is distinct from old.dispatched_at
          or new.dispatch_token is distinct from old.dispatch_token) then
    raise exception 'spend_reservations: dispatch intent is set once and never changed' using errcode = '55000';
  end if;
  if old.dispatched_at is null and new.dispatched_at is not null and new.status <> 'open' then
    raise exception 'spend_reservations: dispatch intent may only be marked on an open reservation'
      using errcode = '55000';
  end if;
  return new;
end $$;

drop trigger if exists spend_reservations_guard_transition on public.spend_reservations;
create trigger spend_reservations_guard_transition
  before update on public.spend_reservations
  for each row execute function public.spend_reservations_guard_transition();

-- 3b. Settled ⇒ authoritative rows exist and add up, checked at COMMIT. Forcing
--     it IMMEDIATE only makes it stricter: the settlement functions write the
--     rows BEFORE flipping the status.
create or replace function public.spend_reservations_settlement_complete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_n bigint; v_sum numeric;
begin
  select count(*), coalesce(sum(c.cost_sek), 0) into v_n, v_sum
    from public.cost_events c where c.reservation_id = new.id;
  if v_n = 0 then
    raise exception 'reservation % became settled without its durable spend representation', new.id
      using errcode = '23514';
  end if;
  if new.actual_sek is distinct from v_sum then
    raise exception 'reservation % settled at % but its linked cost rows sum to %', new.id, new.actual_sek, v_sum
      using errcode = '23514';
  end if;
  return null;
end $$;

drop trigger if exists spend_reservations_settlement_complete on public.spend_reservations;
create constraint trigger spend_reservations_settlement_complete
  after update on public.spend_reservations
  deferrable initially deferred
  for each row when (old.status = 'open' and new.status = 'settled')
  execute function public.spend_reservations_settlement_complete();

-- 3c. Linked cost rows: added only to a reservation that is still open with
--     dispatch intent (so a settled reservation can never gain a second
--     amount), and never altered or directly deleted afterwards.
create or replace function public.cost_events_guard_settlement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.reservation_id is not null and not exists (
      select 1 from public.spend_reservations r
       where r.id = new.reservation_id and r.status = 'open' and r.dispatched_at is not null
    ) then
      raise exception 'cost_events: settlement rows may only be added to an open, dispatched reservation'
        using errcode = '55000';
    end if;
    return new;
  end if;
  if old.reservation_id is not null then
    if tg_op = 'UPDATE' then
      raise exception 'cost_events: a settlement row is immutable' using errcode = '55000';
    end if;
    -- DELETE: only as part of a cascade (project purge), never directly.
    if pg_trigger_depth() <= 1 then
      raise exception 'cost_events: a settlement row cannot be deleted directly' using errcode = '55000';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists cost_events_guard_settlement on public.cost_events;
create trigger cost_events_guard_settlement
  before insert or update or delete on public.cost_events
  for each row execute function public.cost_events_guard_settlement();

-- ── 4. Held: a dispatched reservation never goes stale ──────────────────────
-- budget_scope_state is reproduced from 20260831_budget_scopes.sql except ONE
-- predicate: an open reservation counts while it is fresh OR has dispatch intent.
-- budget_headroom and budget_reserve both read through it, so the gate, the
-- operator surface and Survival keep one definition.
create or replace function public.budget_scope_state(
  p_project_id    uuid,
  p_stale_minutes int default 30
) returns table (
  scope       text,
  limit_sek   numeric,
  spent_sek   numeric,
  held_sek    numeric,
  remaining_sek numeric
) language sql security definer set search_path to '' stable as $$
  with tz as (select 'Europe/Stockholm'::text as z),
  -- Both edges of every window, and both computed in LOCAL time before being
  -- converted back. Adding an interval to a timestamptz would add exactly 24
  -- hours, which is wrong on the two days a year that are 23 or 25 hours long;
  -- adding it to the local timestamp gives the real local day.
  --
  -- The UPPER bound is not decoration. Without it a window means "from this
  -- instant onward", so a row whose created_at is in the future counts toward
  -- TODAY for as long as it exists — a clock skew between writers, or a
  -- backfill, silently consumes a day's ceiling that has not happened yet.
  win as (
    select
      (l_day)                              at time zone z as d0,
      (l_day   + interval '1 day')         at time zone z as d1,
      (l_week)                             at time zone z as w0,
      (l_week  + interval '1 week')        at time zone z as w1,
      (l_month)                            at time zone z as m0,
      (l_month + interval '1 month')       at time zone z as m1,
      now() - make_interval(mins => p_stale_minutes)      as stale
    from (
      select z,
             date_trunc('day',   now() at time zone z) as l_day,
             date_trunc('week',  now() at time zone z) as l_week,   -- ISO: Monday
             date_trunc('month', now() at time zone z) as l_month
      from tz
    ) t
  ),
  lim as (
    select b.daily_sek, b.weekly_sek, b.monthly_sek,
           c.global_daily_sek, c.global_weekly_sek, c.global_monthly_sek
      from (select 1 as k) one
      left join public.project_budgets b on b.project_id = p_project_id
      left join public.platform_config c on c.id = 1
  ),
  scopes(scope, lim, since, until, all_projects) as (
    select 'project_daily',   lim.daily_sek,          win.d0, win.d1, false from lim, win
    union all select 'project_weekly',  lim.weekly_sek,  win.w0, win.w1, false from lim, win
    union all select 'project_monthly', lim.monthly_sek, win.m0, win.m1, false from lim, win
    union all select 'global_daily',    lim.global_daily_sek,   win.d0, win.d1, true from lim, win
    union all select 'global_weekly',   lim.global_weekly_sek,  win.w0, win.w1, true from lim, win
    union all select 'global_monthly',  lim.global_monthly_sek, win.m0, win.m1, true from lim, win
  )
  -- `least(lim, ...)` is the load-bearing part: remaining may never EXCEED the
  -- limit. Nothing constrains cost_events.cost_sek to be non-negative, so a
  -- refund, a correction row or a sign bug would otherwise make `spent`
  -- negative and mint headroom ABOVE the ceiling — a 100 SEK daily limit
  -- reporting 600 remaining, and a single 200 SEK call sailing through it.
  -- A window's ceiling is a ceiling regardless of what the ledger says.
  select s.scope, s.lim, x.spent, x.held, least(s.lim, s.lim - x.spent - x.held)
  from scopes s, win
  cross join lateral (
    select
      -- `greatest(cost_sek, 0)` is the GROSS-SPEND policy, in force even if the
      -- constraint below were ever dropped: a negative row may never RELEASE
      -- governance headroom. Verified against production before choosing it —
      -- 1150 rows, zero negative, zero zero-cost, and no refund or correction
      -- path exists. A ceiling therefore bounds gross positive provider spend,
      -- which is the fail-closed reading: with a net ceiling, one erroneous
      -- -500 row beside +90 of real spend would authorise another +100 against
      -- a 100 limit and bill 190.
      coalesce((select sum(greatest(c.cost_sek, 0)) from public.cost_events c
                 where c.created_at >= s.since and c.created_at < s.until
                   and (s.all_projects or c.project_id = p_project_id)), 0) as spent,
      coalesce((select sum(r.estimated_sek) from public.spend_reservations r
                 where r.status = 'open'
                   and r.created_at >= s.since and r.created_at < s.until
                   and (r.created_at > win.stale or r.dispatched_at is not null)
                   and (s.all_projects or r.project_id = p_project_id)), 0) as held
  ) x
  where s.lim is not null
  order by (s.lim - x.spent - x.held) asc;
$$;

revoke all on function public.budget_scope_state(uuid, int) from public, anon, authenticated;
grant execute on function public.budget_scope_state(uuid, int) to service_role;
-- ── 5. The gate: replay never releases a dispatched reservation ─────────────
-- Reproduced from 20260831_budget_scopes.sql except: an open reservation with
-- dispatch intent replays as in-flight (never stale, never released); the stale
-- release restates dispatched_at IS NULL; a refused reservation records why.
create or replace function public.budget_reserve(
  p_project_id      uuid,
  p_estimated_sek   numeric,
  p_idempotency_key text default null,
  p_provider        text default null,
  p_operation       text default null,
  p_stale_minutes   int  default 30
) returns table (
  allowed        boolean,
  reservation_id uuid,
  reason         text,
  budget_sek     numeric,
  committed_sek  numeric,
  reserved_sek   numeric,
  headroom_sek   numeric,
  binding_scope  text
) language plpgsql security definer set search_path to '' as $$
declare
  v_existing public.spend_reservations;
  v_id       uuid;
  v_has_proj boolean;
  v_has_glob boolean;
  v_scope    text;
  v_lim      numeric;
  v_spent    numeric;
  v_held     numeric;
  v_rem      numeric;
begin
  -- NaN and Infinity are valid `numeric` values and BOTH slip past a bare
  -- `< 0` test. Named explicitly. For numeric (unlike float) NaN = NaN is true.
  if p_estimated_sek is null
     or p_estimated_sek = 'NaN'::numeric
     or p_estimated_sek = 'Infinity'::numeric
     or p_estimated_sek = '-Infinity'::numeric
     or p_estimated_sek < 0 then
    return query select false, null::uuid, 'invalid_estimate',
                        null::numeric, null::numeric, null::numeric, null::numeric, null::text;
    return;
  end if;

  -- Locks FIRST. Everything below, replay included, is decided under them.
  perform pg_advisory_xact_lock(hashtext('budget_reserve:' || p_project_id::text));
  perform pg_advisory_xact_lock(hashtext('budget_reserve:__platform__'));

  if p_idempotency_key is not null then
    select * into v_existing
      from public.spend_reservations where idempotency_key = p_idempotency_key;
    if found then
      -- ── IDENTITY BINDING ──────────────────────────────────────────────────
      -- A key names ONE spend. Matching the key alone would let a caller mint a
      -- cheap reservation and then present the same key for a different project,
      -- a different provider, a different operation or a LARGER estimate, and
      -- have the old, smaller reservation authorise it. Every field the verdict
      -- depends on is therefore compared, BEFORE the state branch, so a
      -- mismatch cannot even learn which state the reservation is in.
      --
      -- Estimate rule: the held amount must COVER the request. A smaller request
      -- against a larger reservation is safe (it over-reserves) and allowed; a
      -- larger request is refused rather than silently under-reserved. Growing a
      -- reservation would need a full re-evaluation of all six scopes under the
      -- locks, which is a new spend — so it is expressed as one: mint a new key.
      if v_existing.project_id      is distinct from p_project_id
         or v_existing.provider     is distinct from p_provider
         or v_existing.operation    is distinct from p_operation
         or p_estimated_sek > v_existing.estimated_sek then
        return query select false, v_existing.id, 'replay_identity_mismatch'::text,
                            null::numeric, null::numeric, null::numeric, null::numeric, null::text;
        return;
      end if;

      if v_existing.status = 'open'
         and (v_existing.created_at > now() - make_interval(mins => p_stale_minutes)
              -- M0: a reservation whose provider dispatch MAY have happened is in
              -- flight for as long as it is open. Time passing proves nothing.
              or v_existing.dispatched_at is not null) then
        -- ── ONE RESERVATION AUTHORISES ONE DISPATCH ─────────────────────────
        -- REFUSED. A reservation of 30 SEK holds 30 SEK of headroom; handing it
        -- to a second caller would authorise two 30 SEK provider calls against
        -- it, which is an under-reservation and a ceiling bypass. Budget
        -- idempotency is not provider-dispatch idempotency, and this function
        -- can only promise the first.
        return query select false, v_existing.id, 'replay_in_flight'::text,
                            null::numeric, null::numeric, null::numeric, null::numeric, null::text;
      elsif v_existing.status = 'open' then
        -- ── STALE-OPEN: ALSO REFUSED, and this is the load-bearing part ─────
        -- A visibility timeout proves only that no lifecycle progress has been
        -- OBSERVED. It does not prove the original provider request never
        -- executed, or that it is not still executing. An earlier draft
        -- re-decided a stale reservation against current ceilings and returned
        -- it as allowed; that still let one reservation authorise a second
        -- dispatch whenever the first call outlived p_stale_minutes.
        --
        -- The reservation is released — it has already stopped counting toward
        -- headroom, and leaving it open would let it silently start counting
        -- again on a later read. A caller that genuinely wants to spend again
        -- must mint a NEW key, which is a new reservation, honestly accounted.
        --
        -- A safe replay path needs a real dispatch claim, or provider-side
        -- idempotency for the exact request. Until one exists, ZERO replay
        -- states return allowed, which is why runtime keys stay dormant.
        -- M0: reached only for an UNDISPATCHED reservation (a dispatched one is
        -- in flight above), and the predicate restates it so this UPDATE can
        -- never release spend that may have reached a provider.
        update public.spend_reservations
           set status = 'released', resolved_at = now(), release_basis = 'replay_stale_undispatched'
         where id = v_existing.id and dispatched_at is null;
        return query select false, v_existing.id, 'replay_stale'::text,
                            null::numeric, null::numeric, null::numeric, null::numeric, null::text;
      elsif v_existing.status = 'settled' then
        return query select false, v_existing.id, 'replay_settled'::text,
                            null::numeric, null::numeric, null::numeric, null::numeric, null::text;
      else
        return query select false, v_existing.id, 'replay_released'::text,
                            null::numeric, null::numeric, null::numeric, null::numeric, null::text;
      end if;
      return;
    end if;
  end if;

  -- Fail closed on either authority being absent. An unconfigured budget is not
  -- an unlimited budget, and an absent platform ceiling is not "no ceiling".
  select exists (select 1 from public.project_budgets b
                  where b.project_id = p_project_id and b.monthly_sek is not null),
         exists (select 1 from public.platform_config c
                  where c.id = 1 and c.global_daily_sek is not null
                    and c.global_weekly_sek is not null and c.global_monthly_sek is not null)
    into v_has_proj, v_has_glob;

  if not v_has_proj then
    return query select false, null::uuid, 'no_budget_configured',
                        null::numeric, null::numeric, null::numeric, null::numeric, null::text;
    return;
  end if;
  if not v_has_glob then
    return query select false, null::uuid, 'no_global_budget_configured',
                        null::numeric, null::numeric, null::numeric, null::numeric, null::text;
    return;
  end if;

  -- The TIGHTEST configured scope decides, and is named in the verdict so an
  -- operator sees WHICH ceiling refused rather than only that one did.
  select s.scope, s.limit_sek, s.spent_sek, s.held_sek, s.remaining_sek
    into v_scope, v_lim, v_spent, v_held, v_rem
    from public.budget_scope_state(p_project_id, p_stale_minutes) s
   order by s.remaining_sek asc
   limit 1;

  insert into public.spend_reservations (project_id, estimated_sek, provider, operation,
                                         idempotency_key, status, release_basis)
  values (p_project_id, p_estimated_sek, p_provider, p_operation, p_idempotency_key,
          case when p_estimated_sek <= v_rem then 'open' else 'released' end,
          case when p_estimated_sek <= v_rem then null else 'refused_at_reserve' end)
  returning id into v_id;

  if p_estimated_sek <= v_rem then
    return query select true, v_id, 'ok'::text, v_lim, v_spent, v_held, v_rem, v_scope;
  else
    return query select false, v_id, 'budget_exceeded'::text, v_lim, v_spent, v_held, v_rem, v_scope;
  end if;
end $$;

revoke all on function public.budget_reserve(uuid, numeric, text, text, text, int) from public, anon, authenticated;
grant execute on function public.budget_reserve(uuid, numeric, text, text, text, int) to service_role;
-- ── 6. Dispatch intent ──────────────────────────────────────────────────────
-- Called after an allowed reservation and BEFORE the final execution-stop check,
-- so nothing is added between that check and the provider call. Idempotent for
-- the same token (a retried RPC whose first attempt committed), refused for any
-- other.
create or replace function public.budget_mark_dispatch_intent(
  p_reservation_id uuid, p_dispatch_token uuid
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v public.spend_reservations;
begin
  if p_reservation_id is null or p_dispatch_token is null then
    raise exception 'reservation and dispatch token are required' using errcode = '22023';
  end if;
  select * into v from public.spend_reservations where id = p_reservation_id for update;
  if not found or v.status <> 'open' then return false; end if;
  if v.dispatched_at is not null then return v.dispatch_token = p_dispatch_token; end if;
  update public.spend_reservations
     set dispatched_at = now(), dispatch_token = p_dispatch_token
   where id = p_reservation_id;
  return true;
end $$;

-- ── 6b. Advisory override: the spend still has to be counted ────────────────
-- With H1_SPEND_GATE off, a budget refusal is RECORDED (budget_reserve inserted
-- the reservation as released) and then overridden, and the provider is called
-- anyway. Before M0 that dispatch had no open reservation at all, so its only
-- trace was the best-effort cost row. This opens an accounting-only reservation
-- for exactly that case: it changes no verdict (the refusal row and the
-- spend_advisory_overrides record already say what the gate decided) — it only
-- makes the overridden spend durably accountable like any other.
alter table public.spend_reservations
  add column if not exists advisory_override boolean not null default false;

comment on column public.spend_reservations.advisory_override is
  'M0: an accounting-only reservation opened for a dispatch whose budget refusal was overridden in advisory mode. Not a verdict.';

create or replace function public.budget_open_override_reservation(
  p_project_id uuid, p_estimated_sek numeric, p_provider text default null, p_operation text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_project_id is null or p_estimated_sek is null
     or p_estimated_sek in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     or p_estimated_sek < 0 then
    raise exception 'a project and a finite, non-negative estimate are required' using errcode = '22023';
  end if;
  insert into public.spend_reservations (project_id, estimated_sek, provider, operation, status, advisory_override)
  values (p_project_id, p_estimated_sek, p_provider, p_operation, 'open', true)
  returning id into v_id;
  return v_id;
end $$;

-- ── 7. Release ──────────────────────────────────────────────────────────────
-- 7a. Before dispatch intent: the existing release, now unable to touch a
--     reservation whose dispatch may have happened (returns 0; it keeps counting).
create or replace function public.budget_release(p_reservation_id uuid)
returns int language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  update public.spend_reservations
     set status = 'released', resolved_at = now(), release_basis = 'not_dispatched'
   where id = p_reservation_id and status = 'open' and dispatched_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- 7b. After dispatch intent: ONLY the dispatcher holding the token, and only on
--     the canonical proven-not-dispatched path (the final stop check refused, a
--     physical admission refusal, or ProviderNotDispatchedError).
create or replace function public.budget_release_undispatched(
  p_reservation_id uuid, p_dispatch_token uuid
) returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_dispatch_token is null then
    raise exception 'a dispatch token is required' using errcode = '22023';
  end if;
  update public.spend_reservations
     set status = 'released', resolved_at = now(), release_basis = 'proven_not_dispatched'
   where id = p_reservation_id and status = 'open' and dispatch_token = p_dispatch_token;
  get diagnostics n = row_count;
  return n;
end $$;

-- ── 8. Durable settlement ───────────────────────────────────────────────────
-- Locks the reservation, writes its authoritative cost rows, settles it — one
-- transaction. A failure anywhere leaves the reservation open and dispatched,
-- i.e. still counted at its upper-bound estimate.
--
--   metered             p_rows = the adapter's real usage rows (≥1), priced by
--                       the existing canonical rate logic in TypeScript.
--   estimate_ambiguous  the call failed in a way that may have been billed.
--   estimate_unmetered  the call succeeded but the adapter has no usage figure.
--   (p_rows must be empty for both estimate kinds: ONE row at the reserved
--    upper bound is written here, never pretending to be metered.)
--
-- Attribution: rows are charged to the RESERVATION's project — that is where
-- the held amount was counted, so settlement moves the same money from held to
-- spent rather than across projects. A differing logged project is kept in
-- metadata.
create or replace function public.budget_settle_recorded(
  p_reservation_id uuid, p_dispatch_token uuid, p_kind text, p_rows jsonb default '[]'::jsonb
) returns table (result text, settled_sek numeric, estimate_sek numeric, estimate_exceeded boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v       public.spend_reservations;
  v_sum   numeric;
  v_rate  numeric;
  v_rows  jsonb := coalesce(p_rows, '[]'::jsonb);
begin
  if p_kind is null or p_kind not in ('metered', 'estimate_ambiguous', 'estimate_unmetered') then
    raise exception 'unsupported settlement kind %', p_kind using errcode = '22023';
  end if;
  if jsonb_typeof(v_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;
  if p_kind = 'metered' and jsonb_array_length(v_rows) = 0 then
    raise exception 'a metered settlement needs at least one usage row' using errcode = '22023';
  end if;
  if p_kind <> 'metered' and jsonb_array_length(v_rows) <> 0 then
    raise exception 'an estimate settlement takes no usage rows' using errcode = '22023';
  end if;

  select * into v from public.spend_reservations r where r.id = p_reservation_id for update;
  if not found then
    raise exception 'reservation % does not exist', p_reservation_id using errcode = 'P0002';
  end if;
  if v.status = 'settled' then
    -- Already settled (by the reconciler, or a retried call whose first attempt
    -- committed). Nothing is written: no double count.
    return query select 'already_settled'::text, v.actual_sek, v.estimated_sek, v.estimate_exceeded;
    return;
  end if;
  if v.status <> 'open' then
    raise exception 'reservation % is %; a released reservation cannot be settled', p_reservation_id, v.status
      using errcode = '55000';
  end if;
  if v.dispatch_token is null or v.dispatch_token is distinct from p_dispatch_token then
    raise exception 'reservation % is not dispatched under this token', p_reservation_id using errcode = '42501';
  end if;

  if p_kind = 'metered' then
    -- NaN / Infinity / negative / NULL amounts cannot be authority. Checked on
    -- the INPUT, before anything is written.
    if exists (
      select 1 from jsonb_to_recordset(v_rows) as x(cost_sek numeric, cost_usd numeric)
       where x.cost_sek is null or x.cost_usd is null
          or x.cost_sek in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
          or x.cost_usd in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
          or x.cost_sek < 0 or x.cost_usd < 0
    ) then
      raise exception 'metered settlement rows must carry finite, non-negative amounts' using errcode = '22023';
    end if;

    insert into public.cost_events (project_id, provider, model, agent, operation, unit_type, units,
                                    tokens_in, tokens_out, cost_usd, cost_sek, run_id, script_id,
                                    metadata, reservation_id, settlement_kind)
    select v.project_id, coalesce(x.provider, v.provider, 'unknown'), x.model, x.agent,
           coalesce(x.operation, v.operation), coalesce(x.unit_type, 'tokens'), coalesce(x.units, 0),
           coalesce(x.tokens_in, 0), coalesce(x.tokens_out, 0),
           x.cost_usd, x.cost_sek, x.run_id, x.script_id,
           coalesce(x.metadata, '{}'::jsonb)
             || case when x.project_id is not null and x.project_id <> v.project_id
                     then jsonb_build_object('logged_project_id', x.project_id) else '{}'::jsonb end,
           v.id, 'metered'
      from jsonb_to_recordset(v_rows) as x(provider text, model text, agent text, operation text,
             unit_type text, units numeric, tokens_in bigint, tokens_out bigint, cost_usd numeric,
             cost_sek numeric, run_id uuid, script_id uuid, metadata jsonb, project_id uuid);
  else
    select cr.value into v_rate from public.cost_rates cr where cr.key = 'usd_sek';
    insert into public.cost_events (project_id, provider, operation, unit_type, units, cost_usd, cost_sek,
                                    metadata, reservation_id, settlement_kind)
    values (v.project_id, coalesce(v.provider, 'unknown'), v.operation, 'requests', 1,
            round(v.estimated_sek / coalesce(nullif(v_rate, 0), 10.5), 6), v.estimated_sek,
            jsonb_build_object('settlement', 'reserved_upper_bound', 'kind', p_kind,
                               'note', 'not metered usage'),
            v.id, p_kind);
  end if;

  select coalesce(sum(c.cost_sek), 0) into v_sum from public.cost_events c where c.reservation_id = v.id;

  update public.spend_reservations r
     set status = 'settled', resolved_at = now(), actual_sek = v_sum, settlement_kind = p_kind,
         estimate_exceeded = (v_sum > v.estimated_sek)
   where r.id = v.id;

  return query select 'settled'::text, v_sum, v.estimated_sek, (v_sum > v.estimated_sek);
end $$;

-- ── 9. Retire the cost-less settle ──────────────────────────────────────────
-- `budget_settle` flipped a reservation to settled with no cost of its own —
-- the defect M0 exists to close. The name is kept so a stale deployment fails
-- loudly rather than silently; it can no longer settle anything, so the
-- reservation stays open and counted.
create or replace function public.budget_settle(
  p_reservation_id uuid, p_actual_sek numeric default null
) returns int language plpgsql security definer set search_path to '' as $$
begin
  raise exception 'budget_settle is retired by M0; settle through budget_settle_recorded'
    using errcode = '0A000';
end $$;

-- ── 10. Crash reconciler ────────────────────────────────────────────────────
-- A reservation with dispatch intent that never settled (the process died, or
-- the settle RPC failed) is ALREADY counted as held, so this is bookkeeping, not
-- safety: it moves the reserved upper bound from held into spent, never
-- releases, and skips rows a live settlement is holding. A live settlement that
-- loses the race receives 'already_settled' and writes nothing.
--
-- p_min_age floor of 1 hour: the longest legitimate governed execution is a
-- 300 s Vercel function, and the provider SDKs' worst case is a 10-minute
-- timeout × 3 attempts. The default (24 h) leaves a wide margin so that a live
-- settlement carrying real usage normally wins.
create or replace function public.budget_reconcile_dispatched(
  p_min_age interval default interval '24 hours', p_limit int default 100
) returns int language plpgsql security definer set search_path = '' as $$
declare
  r      public.spend_reservations;
  v_rate numeric;
  n      int := 0;
begin
  if p_min_age is null or p_min_age < interval '1 hour' then
    raise exception 'p_min_age must be at least 1 hour' using errcode = '22023';
  end if;
  select cr.value into v_rate from public.cost_rates cr where cr.key = 'usd_sek';
  for r in
    select * from public.spend_reservations s
     where s.status = 'open' and s.dispatched_at is not null and s.dispatched_at < now() - p_min_age
     order by s.dispatched_at
     limit greatest(coalesce(p_limit, 100), 0)
     for update skip locked
  loop
    insert into public.cost_events (project_id, provider, operation, unit_type, units, cost_usd, cost_sek,
                                    metadata, reservation_id, settlement_kind)
    values (r.project_id, coalesce(r.provider, 'unknown'), r.operation, 'requests', 1,
            round(r.estimated_sek / coalesce(nullif(v_rate, 0), 10.5), 6), r.estimated_sek,
            jsonb_build_object('settlement', 'reserved_upper_bound', 'kind', 'estimate_reconciled',
                               'dispatched_at', r.dispatched_at),
            r.id, 'estimate_reconciled');
    update public.spend_reservations s
       set status = 'settled', resolved_at = now(), actual_sek = r.estimated_sek,
           settlement_kind = 'estimate_reconciled', estimate_exceeded = false
     where s.id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── 11. Privileges ──────────────────────────────────────────────────────────

-- Reservations: every write goes through the functions above.
revoke all on table public.spend_reservations from public, anon, authenticated, service_role;
grant select on table public.spend_reservations to service_role;

-- cost_events: the best-effort logger keeps INSERT/UPDATE on every column EXCEPT
-- the two settlement columns, so it cannot forge or alter a settlement.
revoke insert, update on table public.cost_events from service_role;
do $grant$
declare v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'cost_events'
     and column_name not in ('reservation_id', 'settlement_kind');
  execute format('grant insert (%s), update (%s) on table public.cost_events to service_role', v_cols, v_cols);
end $grant$;

revoke all on function public.budget_mark_dispatch_intent(uuid, uuid) from public, anon, authenticated;
grant execute on function public.budget_mark_dispatch_intent(uuid, uuid) to service_role;
revoke all on function public.budget_release(uuid) from public, anon, authenticated;
grant execute on function public.budget_release(uuid) to service_role;
revoke all on function public.budget_release_undispatched(uuid, uuid) from public, anon, authenticated;
grant execute on function public.budget_release_undispatched(uuid, uuid) to service_role;
revoke all on function public.budget_settle_recorded(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.budget_settle_recorded(uuid, uuid, text, jsonb) to service_role;
revoke all on function public.budget_settle(uuid, numeric) from public, anon, authenticated;
grant execute on function public.budget_settle(uuid, numeric) to service_role;
revoke all on function public.budget_reconcile_dispatched(interval, int) from public, anon, authenticated;
grant execute on function public.budget_reconcile_dispatched(interval, int) to service_role;
revoke all on function public.budget_open_override_reservation(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.budget_open_override_reservation(uuid, numeric, text, text) to service_role;

-- Trigger machinery is not an API.
revoke all on function public.spend_reservations_guard_transition() from public, anon, authenticated, service_role;
revoke all on function public.spend_reservations_settlement_complete() from public, anon, authenticated, service_role;
revoke all on function public.cost_events_guard_settlement() from public, anon, authenticated, service_role;
