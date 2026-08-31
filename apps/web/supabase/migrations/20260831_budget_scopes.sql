-- ─────────────────────────────────────────────────────────────────────────────
--  G2 — ATOMIC BUDGET SCOPES + REPLAY SAFETY.
--
--  PR9b gave Omnira a working pre-spend reservation. G1 put every billable
--  provider behind it. Two holes remain, and both are in this file.
--
--  ── HOLE 1: A MONTH IS NOT A CEILING (audit F-102) ──────────────────────────
--  `project_budgets` has exactly one column: `monthly_sek`. A runaway can spend
--  an entire month's budget in an hour and never be refused, because nothing
--  asks how fast it is going. Measured against 90 days of real spend, the worst
--  observed DAY is 30.24 SEK and the worst MONTH is 266.37 SEK — so a monthly-
--  only ceiling of 700 permits ~23x the worst real day before it notices.
--
--  ── HOLE 2: REPLAY RETURNED BEFORE THE LOCK (audit F-106) ───────────────────
--  The old replay branch read `idempotency_key` and returned BEFORE
--  `pg_advisory_xact_lock` and BEFORE the budget was read:
--
--      if p_idempotency_key is not null then
--        select * into v_existing ... ;
--        if found then
--          return (v_existing.status <> 'released'), ... ;   -- no lock, no budget
--
--  So a key whose reservation had already SETTLED came back `allowed = true`
--  with no new reservation and no budget check: the second spend was never
--  counted against any ceiling. That is why G1 shipped the idempotency plumbing
--  but deliberately passed no keys — enabling them on this function would have
--  converted a dead feature into a live bypass.
--
--  ── THE FIX IS ORDERING, NOT CLEVERNESS ─────────────────────────────────────
--  Locks are taken FIRST, then the key is resolved, then the budget is read.
--  The replay verdict is now a closed state machine (below), and only a still-
--  OPEN reservation replays as allowed — because that reservation is itself
--  still holding the headroom it was granted. A settled or released key is
--  terminal and refused: repeating a completed spend is a NEW spend and needs a
--  new key.
--
--  ── ONE BUDGET AUTHORITY, TWO SCOPES ────────────────────────────────────────
--  Per-project limits stay in `project_budgets`. The platform ceiling goes in
--  `platform_config` — the single-row table that ALREADY owns platform-wide
--  operational limits (`max_daily_renders`, `max_retry_attempts`,
--  `automation_paused`). A new `platform_budget` table would be a second
--  config authority for the same question, which is the duplication G1's audit
--  named explicitly. No second ledger, no second rate table, no second lock.
--
--  ── TIME IS EUROPE/STOCKHOLM, NOT UTC ───────────────────────────────────────
--  The old function truncated the month in UTC. Omnira's canonical zone is
--  `ATLAS_HOME_TIMEZONE = 'Europe/Stockholm'` (lib/atlas/utilities/time.ts), and
--  the Familje-Stunden release instant already computes month boundaries there.
--  A budget that rolls over at 01:00 or 02:00 local is a budget nobody can
--  reason about, so every window here is Stockholm-local. `date_trunc('week')`
--  is ISO-8601 in Postgres: weeks start Monday.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Per-project scopes. Nullable = NOT CONFIGURED for this project, which is
--    not the same as unlimited: the platform ceilings below are mandatory and
--    always apply, so no spend can ever escape a daily and weekly bound.
--    `monthly_sek` stays NOT NULL — a project with no budget row is still
--    refused outright, exactly as before.
alter table public.project_budgets
  add column if not exists daily_sek  numeric(12,4),
  add column if not exists weekly_sek numeric(12,4);

alter table public.project_budgets
  drop constraint if exists project_budgets_scopes_nonneg;
alter table public.project_budgets
  add constraint project_budgets_scopes_nonneg check (
    (daily_sek  is null or daily_sek  >= 0) and
    (weekly_sek is null or weekly_sek >= 0) and
    monthly_sek >= 0
  );

comment on column public.project_budgets.daily_sek is
  'G2: optional per-project daily ceiling (Europe/Stockholm day). NULL = not configured; the mandatory platform daily ceiling still applies.';
comment on column public.project_budgets.weekly_sek is
  'G2: optional per-project weekly ceiling (ISO week, Europe/Stockholm). NULL = not configured; the mandatory platform weekly ceiling still applies.';

-- 2) The platform ceiling, on the existing single-row config authority.
--    NOT NULL with explicit values: an unset global ceiling must never mean
--    "no ceiling", and budget_reserve refuses when the row is missing.
alter table public.platform_config
  add column if not exists global_daily_sek   numeric(12,4),
  add column if not exists global_weekly_sek  numeric(12,4),
  add column if not exists global_monthly_sek numeric(12,4);

--    Seeded from 90 days of measured spend, not from a round number:
--      worst observed day 30.24 · p95 day 11.28 · worst month 266.37
--      sum of approved project budgets 1500.00
--    daily 150   ≈ 5x the worst real day — a runaway is caught within hours
--                  instead of within a month, and normal traffic is ~18x under.
--    weekly 600  binds before four consecutive worst-case days can accumulate
--                  (4 x 150), so a slow leak cannot ride the daily ceiling.
--    monthly 1500 equals the sum of already-approved project budgets: it binds
--                  when a NEW project starts spending without the platform
--                  ceiling being revisited, which is the runaway this guards.
--                  Deliberately not tighter — a project refused while inside its
--                  own approved budget should be a decision, not a migration.
update public.platform_config
   set global_daily_sek   = coalesce(global_daily_sek,   150.0000),
       global_weekly_sek  = coalesce(global_weekly_sek,  600.0000),
       global_monthly_sek = coalesce(global_monthly_sek, 1500.0000)
 where id = 1;

alter table public.platform_config
  drop constraint if exists platform_config_global_budget_nonneg;
alter table public.platform_config
  add constraint platform_config_global_budget_nonneg check (
    (global_daily_sek   is null or global_daily_sek   >= 0) and
    (global_weekly_sek  is null or global_weekly_sek  >= 0) and
    (global_monthly_sek is null or global_monthly_sek >= 0)
  );

comment on column public.platform_config.global_daily_sek is
  'G2: mandatory platform-wide daily spend ceiling (Europe/Stockholm). budget_reserve refuses when absent.';

-- 3) Budget coverage. Every project that can reach the G1 provider boundary
--    needs a row. `omnira-selftest` had none and would have been refused the
--    moment enforcement was enabled — surfaced by the audit as
--    `projects_without_budget`. Its limits are deliberately small: a self-test
--    project has no business making a material purchase.
insert into public.project_budgets (project_id, monthly_sek, daily_sek, weekly_sek)
select p.id, 50.0000, 20.0000, 35.0000
from public.projects p
where p.slug = 'omnira-selftest'
  and not exists (select 1 from public.project_budgets b where b.project_id = p.id)
on conflict (project_id) do nothing;

--    The one project that actually spends gets explicit sub-monthly ceilings,
--    sized from its own history (worst day 30.24): 100/day is ~3.3x that, and
--    400/week bounds a four-day burst. The other two projects have no measured
--    spend to size a daily limit from, so theirs stay NULL and inherit the
--    platform ceilings rather than being given an invented number.
update public.project_budgets b
   set daily_sek  = coalesce(b.daily_sek,  100.0000),
       weekly_sek = coalesce(b.weekly_sek, 400.0000)
  from public.projects p
 where p.id = b.project_id and p.slug = 'ai-media-automation';
-- ─────────────────────────────────────────────────────────────────────────────
-- 4) THE ONE DEFINITION OF HEADROOM (audit F-204).
--
--  The old code computed headroom twice: `budget_reserve` filtered open
--  reservations by month-start AND staleness, while `budget_headroom` filtered
--  by staleness only. The gate and the operator surface could therefore report
--  different remaining budget for the same project at the same instant.
--
--  There is now exactly one implementation, and both callers use it. Divergence
--  is not "discouraged" — it is unrepresentable, because neither caller contains
--  the arithmetic any more.
--
--    spent     — settled reality, from cost_events, inside the window
--    held      — open reservations inside the window that have not gone stale
--    remaining — limit - spent - held
--
--  STALE RESERVATIONS: an open reservation older than p_stale_minutes stops
--  counting. Without that, a process dying between reserve and settle would
--  consume budget forever. It is a visibility timeout, the same reasoning as the
--  run lease — and deliberately NOT a reconciliation: the row stays `open` and
--  auditable. Full reconciliation of abandoned reservations remains deferred
--  because nothing here depends on it; read and enforcement agree either way.
-- ─────────────────────────────────────────────────────────────────────────────

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
      coalesce((select sum(c.cost_sek) from public.cost_events c
                 where c.created_at >= s.since and c.created_at < s.until
                   and (s.all_projects or c.project_id = p_project_id)), 0) as spent,
      coalesce((select sum(r.estimated_sek) from public.spend_reservations r
                 where r.status = 'open'
                   and r.created_at >= s.since and r.created_at < s.until
                   and r.created_at > win.stale
                   and (s.all_projects or r.project_id = p_project_id)), 0) as held
  ) x
  where s.lim is not null
  order by (s.lim - x.spent - x.held) asc;
$$;

revoke all on function public.budget_scope_state(uuid, int) from public, anon, authenticated;
grant execute on function public.budget_scope_state(uuid, int) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) THE GATE.
--
--  ── REPLAY STATE MACHINE (the F-106 fix) ────────────────────────────────────
--  Resolved AFTER both locks are held, so two callers cannot race the same key.
--
--    key absent           → normal path: evaluate every configured scope
--    reservation OPEN, fresh   → ALLOWED, same id, reason 'replay_open'
--                           It still holds the headroom it was granted, so
--                           re-checking would count it against itself. This is
--                           the retry the key exists for: one logical spend,
--                           one reservation.
--    reservation OPEN, STALE   → re-decided against TODAY's ceilings.
--                           A stale reservation stopped counting toward headroom
--                           when it aged out, so replaying it as allowed would
--                           spend against a budget check made over
--                           p_stale_minutes ago. It is refreshed if it still
--                           fits, or released and refused if it does not — one
--                           reservation per key either way.
--    reservation SETTLED  → REFUSED, reason 'replay_settled'
--                           The spend completed. Repeating it is a NEW spend and
--                           needs a NEW key. Returning allowed here IS the F-106
--                           bypass: a second charge, never counted.
--    reservation RELEASED → REFUSED, reason 'replay_released'
--                           Refused or never dispatched; the key is spent.
--
--  WHAT THE KEY DOES NOT PROMISE: one RESERVATION, not one provider dispatch.
--  Two callers racing the same key while it is still open both get `allowed` and
--  may both dispatch — bounded by the single reservation, so no ceiling is
--  exceeded, but not de-duplicated at the provider. Only provider-side
--  idempotency can promise that, and claiming it here would be a promise this
--  function cannot keep.
--
--  ── LOCK ORDER: PROJECT, THEN PLATFORM ──────────────────────────────────────
--  Always this order, and this is the only acquisition site — a deadlock needs
--  two transactions taking the same pair in opposite orders, which no code path
--  can produce. Project first keeps the per-project reads concurrent across
--  projects; the platform lock then serialises only the global decision.
--
--  ── ALL SCOPES, ONE TRANSACTION, NO PARTIAL RESERVATION ─────────────────────
--  The estimate must fit every configured scope. Anything else refuses and
--  reserves nothing. There is no "reserve what fits".
-- ─────────────────────────────────────────────────────────────────────────────

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
      if v_existing.status = 'open'
         and v_existing.created_at > now() - make_interval(mins => p_stale_minutes) then
        -- Live and still holding its own headroom. The retry the key exists for.
        return query select true, v_existing.id, 'replay_open'::text,
                            null::numeric, null::numeric, null::numeric, null::numeric, null::text;
      elsif v_existing.status = 'open' then
        -- STALE-OPEN. It stopped counting toward headroom when it aged out, so
        -- replaying it as `allowed` would let the caller spend against a budget
        -- check made more than p_stale_minutes ago — the case a cron re-running
        -- tomorrow with the same subject hits exactly. Re-decide it against
        -- TODAY's ceilings instead: refresh it if it still fits (keeping one
        -- reservation per key), release it and refuse if it does not.
        select s.scope, s.limit_sek, s.spent_sek, s.held_sek, s.remaining_sek
          into v_scope, v_lim, v_spent, v_held, v_rem
          from public.budget_scope_state(v_existing.project_id, p_stale_minutes) s
         order by s.remaining_sek asc limit 1;

        if v_existing.estimated_sek <= v_rem then
          update public.spend_reservations
             set created_at = now()               -- holds headroom again from now
           where id = v_existing.id;
          return query select true, v_existing.id, 'replay_open'::text,
                              v_lim, v_spent, v_held, v_rem, v_scope;
        else
          update public.spend_reservations
             set status = 'released', resolved_at = now()
           where id = v_existing.id;
          return query select false, v_existing.id, 'budget_exceeded'::text,
                              v_lim, v_spent, v_held, v_rem, v_scope;
        end if;
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
                                         idempotency_key, status)
  values (p_project_id, p_estimated_sek, p_provider, p_operation, p_idempotency_key,
          case when p_estimated_sek <= v_rem then 'open' else 'released' end)
  returning id into v_id;

  if p_estimated_sek <= v_rem then
    return query select true, v_id, 'ok'::text, v_lim, v_spent, v_held, v_rem, v_scope;
  else
    return query select false, v_id, 'budget_exceeded'::text, v_lim, v_spent, v_held, v_rem, v_scope;
  end if;
end $$;

revoke all on function public.budget_reserve(uuid, numeric, text, text, text, int) from public, anon, authenticated;
grant execute on function public.budget_reserve(uuid, numeric, text, text, text, int) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) The read surface, rebuilt on the SAME definition.
--    One row per project per configured scope. Never mutates, never reserves.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.budget_headroom(int);

create or replace function public.budget_headroom(p_stale_minutes int default 30)
returns table (
  project_id uuid, slug text, scope text,
  limit_sek numeric, spent_sek numeric, held_sek numeric, remaining_sek numeric
) language sql security definer set search_path to '' stable as $$
  select p.id, p.slug, s.scope, s.limit_sek, s.spent_sek, s.held_sek, s.remaining_sek
  from public.projects p
  cross join lateral public.budget_scope_state(p.id, p_stale_minutes) s
  order by p.slug, s.remaining_sek asc;
$$;

revoke all on function public.budget_headroom(int) from public, anon, authenticated;
grant execute on function public.budget_headroom(int) to service_role;
