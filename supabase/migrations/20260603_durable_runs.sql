-- Durable workflow execution (Alternativ A): inga fire-and-forget, pending→running→done/failed,
-- atomisk claim (SKIP LOCKED), reaper för fastnade runs, retries via attempts/max_attempts.

alter table public.runs add column if not exists attempts      integer not null default 0;
alter table public.runs add column if not exists max_attempts  integer not null default 3;
alter table public.runs add column if not exists claimed_at    timestamptz;
alter table public.runs add column if not exists lease_until   timestamptz;
alter table public.runs add column if not exists last_error    text;
alter table public.runs add column if not exists error_history jsonb not null default '[]'::jsonb;

create index if not exists runs_pending_idx       on public.runs (created_at)  where status = 'pending';
create index if not exists runs_running_lease_idx on public.runs (lease_until) where status = 'running';

-- Atomisk claim (rpc-anropbar av drain-endpointen, endast service_role).
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
    select id from public.runs
    where status = 'pending' and attempts < max_attempts
    order by created_at
    for update skip locked
    limit p_limit
  )
  returning r.*;
end $$;
revoke all on function public.claim_runs(int, int) from public, anon, authenticated;
grant execute on function public.claim_runs(int, int) to service_role;

-- Reaper: återställ 'running' med utgången lease → pending (eller failed vid max attempts).
create or replace function omnira_cron.reap_stuck_runs()
returns int language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  update public.runs set
    status      = case when attempts >= max_attempts then 'failed' else 'pending' end,
    error       = case when attempts >= max_attempts then coalesce(last_error,'Lease expired (stuck run)') else error end,
    finished_at = case when attempts >= max_attempts then now() else finished_at end,
    claimed_at  = null,
    lease_until = null
  where status = 'running' and lease_until is not null and lease_until < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- pg_cron: drivare + reaper, varje minut.
select cron.schedule('omnira_runs_drain',  '* * * * *', $$select omnira_cron.call_vercel('/api/runs/drain')$$);
select cron.schedule('omnira_runs_reaper', '* * * * *', $$select omnira_cron.reap_stuck_runs()$$);
