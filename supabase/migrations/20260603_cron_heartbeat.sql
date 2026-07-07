-- Cron Heartbeat: upptäck om automationen slutar köra (sen/död/endpoint-fel).

-- Brygga till cron-schemat (PostgREST når bara public). SECURITY DEFINER.
create or replace function public.cron_job_status()
returns table(jobname text, schedule text, active boolean, last_run timestamptz, last_status text)
language sql security definer set search_path to '' as $$
  select j.jobname, j.schedule, j.active,
    (select d.start_time from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1),
    (select d.status     from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1)
  from cron.job j;
$$;
revoke all on function public.cron_job_status() from public, anon, authenticated;
grant execute on function public.cron_job_status() to service_role;

create table if not exists public.cron_heartbeat (
  jobname           text primary key,
  label             text,
  cadence           text,
  last_fired_at     timestamptz,
  last_evidence_at  timestamptz,
  status            text not null default 'unknown',   -- ok|late|endpoint_failing|dead|pending_first_run
  detail            text,
  checked_at        timestamptz,
  last_warned_at    timestamptz,
  updated_at        timestamptz not null default now()
);
revoke all on public.cron_heartbeat from anon, authenticated;
grant all on public.cron_heartbeat to service_role;

-- pg_cron-sidan av korskontrollen (Vercel-native cron är den andra, se vercel.json).
select cron.schedule('omnira_heartbeat', '*/10 * * * *', $$select omnira_cron.call_vercel('/api/media/cron/heartbeat')$$);
