-- ─────────────────────────────────────────────────────────────────────────────
--  PR #1 — Project Kill Switch (P8) + run-level cancel.
--
--  Lägsta exekveringsnivå: pausen filtreras INUTI public.claim_runs (security
--  definer, service_role-only) så ingen app-kod eller oskyddad service-role kan
--  kringgå den. Run-level cancel är en durabel flagga på runs-raden (Marks
--  threading.Event översatt till DB), läst kooperativt vid varje steggräns i
--  workflow-runner.
--
--  INERT BY DEFAULT: execution_paused=false och cancel_requested=false ⇒ noll
--  beteendeförändring tills någon faktiskt pausar/avbryter. Reporting-kompatibel.
--
--  OMFATTNING: ENBART kill switch + cancel. Capability/approval-grinden,
--  waiting_approval-status och content-binding ligger i PR #2 — inget av det
--  rörs här (L0–L3-disciplin, ingen autonomi-läcka in i Fas 0).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Per-projekt-paus (P8). Kompletterar — ersätter inte — global platform_config.automation_paused.
alter table public.projects add column if not exists execution_paused boolean not null default false;
alter table public.projects add column if not exists paused_at        timestamptz;
alter table public.projects add column if not exists paused_reason    text;

-- 2) Run-level cancel-flagga (durabel, delad mellan drainer-processer).
alter table public.runs add column if not exists cancel_requested boolean not null default false;
alter table public.runs add column if not exists cancel_reason    text;
alter table public.runs add column if not exists cancelled_by     text;

-- OBS status 'cancelled': public.runs.status saknar check-constraint (fritext:
-- pending/running/done/failed). Finns en constraint i en äldre basmigration som
-- inte syns här MÅSTE den relaxas till att rymma 'cancelled' — annars no-op.

-- 3) Kill switch i claim-frågan. NOT EXISTS = null-säker: runs utan project_id
--    (plattformsnivå) påverkas inte, bara runs vars projekt explicit är pausat.
create or replace function public.claim_runs(p_limit int, p_lease_seconds int default 280)
returns setof public.runs
language plpgsql security definer set search_path to '' as $$
begin
  return query
  update public.runs r set
    status      = 'running',
    claimed_at  = now(),
    started_at  = coalesce(r.started_at, now()),
    lease_until = now() + make_interval(secs => p_lease_seconds),
    attempts    = r.attempts + 1
  where r.id in (
    select ru.id from public.runs ru
    where ru.status = 'pending' and ru.attempts < ru.max_attempts
      and not exists (                                   -- ← P8 kill switch, lägsta nivå
        select 1 from public.projects p
        where p.id = ru.project_id and p.execution_paused = true
      )
    order by ru.created_at
    for update skip locked
    limit p_limit
  )
  returning r.*;
end $$;
revoke all on function public.claim_runs(int, int) from public, anon, authenticated;
grant execute on function public.claim_runs(int, int) to service_role;

-- 4) Tenancy-guardad skrivväg för run-level cancel. Matchen project_id = p_project_id
--    gör att Projekt A inte kan avbryta Projekt B även om run_id gissas: anroparen
--    (app-routen) får bara skicka den operatörs-auktoriserade project_id:n.
--    0 rader uppdaterade ⇒ "hittades inte" ⇒ ingen cross-tenant-läcka (P3).
create or replace function public.request_run_cancel(
  p_run_id uuid, p_project_id uuid, p_actor text default null, p_reason text default null
) returns int language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  update public.runs set
    cancel_requested = true,
    cancel_reason    = p_reason,
    cancelled_by     = p_actor
  where id = p_run_id
    and project_id = p_project_id     -- tenancy guard
    and status in ('pending','running');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.request_run_cancel(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.request_run_cancel(uuid, uuid, text, text) to service_role;

-- 5) Per-projekt-paus setter (auditbar). Pausar = frys (pending claimas ej); avbryter
--    inte redan pending runs — de återupptas vid unpause. Cancel är en separat åtgärd.
create or replace function public.set_project_execution_paused(
  p_project_id uuid, p_paused boolean, p_reason text default null
) returns void language plpgsql security definer set search_path to '' as $$
begin
  update public.projects set
    execution_paused = p_paused,
    paused_at        = case when p_paused then now() else null end,
    paused_reason    = case when p_paused then p_reason else null end
  where id = p_project_id;
end $$;
revoke all on function public.set_project_execution_paused(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.set_project_execution_paused(uuid, boolean, text) to service_role;

-- 6) Reaper: OFÖRÄNDRAD. Den rör bara status='running' med utgången lease, så en
--    'cancelled' run (status='cancelled', lease_until=null) studsar aldrig tillbaka.
--    Bekräftat i 20260603_durable_runs.sql — ingen ändring behövs.
