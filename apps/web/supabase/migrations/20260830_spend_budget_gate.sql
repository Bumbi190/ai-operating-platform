-- ─────────────────────────────────────────────────────────────────────────────
--  PR9b — PRE-SPEND BUDGET GATE.
--
--  Omnira spends real money today: $22.14 in the last 30 days across ElevenLabs,
--  Ideogram and Anthropic, and `ai-media-automation` sits at 32.7% of its 700 SEK
--  monthly budget. Nothing enforces that number.
--
--  `project_budgets` has existed since 2026-06-02 with three rows — and exactly
--  one reader: a progress bar in the Cost Intelligence UI. `cost_events` records
--  spend AFTER the fact, and `lib/cost/track.ts` states outright that it "NEVER
--  throws and NEVER blocks". So the budget is decorative: a runaway loop would
--  bill until someone happened to look at a chart.
--
--  Familje-Stunden's canonical runbook names this as a hard gate —
--  no_spend_without_approval: "Inga TTS-/API-credits förbrukas utan rapporterad
--  kostnadsuppskattning och mänskligt godkännande." That has two halves. This
--  migration builds the BUDGET half: an estimate must be declared and cleared
--  BEFORE the provider call. The APPROVAL half is the authorization layer applied
--  to FINANCIAL actions, and is deliberately not implemented here.
--
--  ── WHY RESERVATIONS, NOT A COUNTER ────────────────────────────────────────
--  Checking `sum(cost_events)` before a call cannot work: the cost of a call is
--  only known after it returns, so N concurrent callers would each see the same
--  low total and all proceed. A reservation is taken BEFORE the call and counted
--  as if already spent, so concurrent callers see each other. It is released if
--  the call never happened, and settled once the real cost lands in cost_events.
--
--  ── ONE BUDGET TABLE ───────────────────────────────────────────────────────
--  project_budgets is REUSED, never duplicated. A second budget table would mean
--  two numbers that can disagree, and the UI would keep reading the old one.
--
--  ── SQL ALWAYS TELLS THE TRUTH; THE FLAG DECIDES ENFORCEMENT ───────────────
--  budget_reserve always returns the honest verdict and always records the
--  reservation. It never consults a feature flag. Whether a refusal is HONOURED
--  is the caller's decision (H1_SPEND_GATE), so enabling enforcement is a flag
--  flip with no schema change — and advisory mode produces real accounting rather
--  than a guess about what would have happened.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Reservations. Append-mostly: rows are inserted once and transition
--    open → settled | released. Never deleted, so the spend record is auditable.
create table if not exists public.spend_reservations (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  estimated_sek   numeric(12,4) not null check (estimated_sek >= 0),
  actual_sek      numeric(12,4),
  status          text not null default 'open' check (status in ('open','settled','released')),
  provider        text,
  operation       text,
  -- Two callers retrying the same logical spend must reserve ONCE. Without this
  -- a retry storm reserves the budget repeatedly and starves itself.
  idempotency_key text unique,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

comment on table public.spend_reservations is
  'PR9b: pre-spend reservations. Taken before a billable provider call, settled once the real cost reaches cost_events, released if the call never happened.';

-- The hot path: open reservations for one project in the current month.
create index if not exists spend_reservations_open_idx
  on public.spend_reservations (project_id, created_at)
  where status = 'open';

alter table public.spend_reservations enable row level security;
-- No policies: reachable only through the security-definer functions below.
-- Direct table access by anon/authenticated is therefore denied by default.

-- 2) The gate. Returns the honest verdict; records the reservation either way.
--
--    FAIL CLOSED: a project with no budget row is REFUSED ('no_budget_configured').
--    An unconfigured budget is not an infinite budget — that is precisely the
--    state in which an unnoticed loop bills forever.
--
--    STALE RESERVATIONS: an open reservation older than p_stale_minutes stops
--    counting. Without that, a process dying between reserve and settle would
--    permanently consume budget with no way to reclaim it — the same
--    visibility-timeout reasoning as the run lease.
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
  headroom_sek   numeric
) language plpgsql security definer set search_path to '' as $$
declare
  v_budget    numeric;
  v_committed numeric;
  v_reserved  numeric;
  v_headroom  numeric;
  v_existing  public.spend_reservations;
  v_id        uuid;
  v_month     timestamptz := date_trunc('month', (now() at time zone 'utc')) at time zone 'utc';
begin
  if p_estimated_sek is null or p_estimated_sek < 0 then
    return query select false, null::uuid, 'invalid_estimate', null::numeric, null::numeric, null::numeric, null::numeric;
    return;
  end if;

  -- Idempotent replay: the same key returns the SAME reservation and reserves
  -- nothing further. A retry is the same spend, not a new one.
  if p_idempotency_key is not null then
    select * into v_existing from public.spend_reservations where idempotency_key = p_idempotency_key;
    if found then
      return query select (v_existing.status <> 'released'), v_existing.id, 'replay'::text,
                          null::numeric, null::numeric, null::numeric, null::numeric;
      return;
    end if;
  end if;

  -- Serialize concurrent reservations for this project so two callers cannot
  -- both read the same headroom and both fit into it.
  perform pg_advisory_xact_lock(hashtext('budget_reserve:' || p_project_id::text));

  select b.monthly_sek into v_budget
  from public.project_budgets b where b.project_id = p_project_id;

  if v_budget is null then
    return query select false, null::uuid, 'no_budget_configured',
                        null::numeric, null::numeric, null::numeric, null::numeric;
    return;
  end if;

  select coalesce(sum(c.cost_sek), 0) into v_committed
  from public.cost_events c
  where c.project_id = p_project_id and c.created_at >= v_month;

  select coalesce(sum(r.estimated_sek), 0) into v_reserved
  from public.spend_reservations r
  where r.project_id = p_project_id
    and r.status = 'open'
    and r.created_at >= v_month
    and r.created_at > now() - make_interval(mins => p_stale_minutes);

  v_headroom := v_budget - v_committed - v_reserved;

  -- Record the attempt whatever the verdict: advisory mode must produce real
  -- accounting, and a refusal is itself worth auditing.
  insert into public.spend_reservations (project_id, estimated_sek, provider, operation, idempotency_key,
                                         status)
  values (p_project_id, p_estimated_sek, p_provider, p_operation, p_idempotency_key,
          case when p_estimated_sek <= v_headroom then 'open' else 'released' end)
  returning id into v_id;

  if p_estimated_sek <= v_headroom then
    return query select true, v_id, 'ok'::text, v_budget, v_committed, v_reserved, v_headroom;
  else
    return query select false, v_id, 'budget_exceeded'::text, v_budget, v_committed, v_reserved, v_headroom;
  end if;
end $$;

revoke all on function public.budget_reserve(uuid, numeric, text, text, text, int) from public, anon, authenticated;
grant execute on function public.budget_reserve(uuid, numeric, text, text, text, int) to service_role;

-- 3) Settle: the call happened and its real cost is now in cost_events. The
--    reservation must stop counting or the same spend is counted twice.
create or replace function public.budget_settle(
  p_reservation_id uuid, p_actual_sek numeric default null
) returns int language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  update public.spend_reservations
     set status = 'settled', actual_sek = p_actual_sek, resolved_at = now()
   where id = p_reservation_id and status = 'open';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.budget_settle(uuid, numeric) from public, anon, authenticated;
grant execute on function public.budget_settle(uuid, numeric) to service_role;

-- 4) Release: the call never happened (refused, errored before dispatch,
--    cancelled). Frees the headroom immediately instead of waiting for staleness.
create or replace function public.budget_release(p_reservation_id uuid)
returns int language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  update public.spend_reservations
     set status = 'released', resolved_at = now()
   where id = p_reservation_id and status = 'open';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.budget_release(uuid) from public, anon, authenticated;
grant execute on function public.budget_release(uuid) to service_role;

-- 5) Read-only headroom, for the status surface. Never mutates, never reserves.
create or replace function public.budget_headroom(p_stale_minutes int default 30)
returns table (
  project_id uuid, slug text, budget_sek numeric,
  committed_sek numeric, reserved_sek numeric, headroom_sek numeric
) language sql security definer set search_path to '' stable as $$
  select p.id, p.slug, b.monthly_sek,
         coalesce((select sum(c.cost_sek) from public.cost_events c
                    where c.project_id = p.id
                      and c.created_at >= date_trunc('month', (now() at time zone 'utc')) at time zone 'utc'), 0),
         coalesce((select sum(r.estimated_sek) from public.spend_reservations r
                    where r.project_id = p.id and r.status = 'open'
                      and r.created_at > now() - make_interval(mins => p_stale_minutes)), 0),
         b.monthly_sek
           - coalesce((select sum(c.cost_sek) from public.cost_events c
                        where c.project_id = p.id
                          and c.created_at >= date_trunc('month', (now() at time zone 'utc')) at time zone 'utc'), 0)
           - coalesce((select sum(r.estimated_sek) from public.spend_reservations r
                        where r.project_id = p.id and r.status = 'open'
                          and r.created_at > now() - make_interval(mins => p_stale_minutes)), 0)
  from public.projects p
  join public.project_budgets b on b.project_id = p.id
  order by p.slug;
$$;

revoke all on function public.budget_headroom(int) from public, anon, authenticated;
grant execute on function public.budget_headroom(int) to service_role;
