-- Self-healing cron guardian.
--
-- Bakgrund: 2026-06-14 ~04:57 försvann pg_cron-jobbet `omnira_runs_drain`
-- (avschemalagt manuellt/externt — inte via någon committad migration). Reaper-
-- jobbet överlevde men drainern var borta, så den durabla run-kön hade slutat
-- dräneras vid nästa enqueue. Heartbeaten larmade korrekt ("Runs drain: dead").
--
-- Eftersom ingen versionshanterad kod kan förhindra en manuell `cron.unschedule`,
-- lägger vi till ett självläkande lager: en guardian som var 5:e minut
-- återskapar de kritiska intervall-jobben om de saknas. Idempotent och billig
-- (bara katalog-koll + villkorlig cron.schedule).

create or replace function omnira_cron.ensure_core_schedules()
returns text language plpgsql security definer set search_path to '' as $fn$
declare restored text := '';
begin
  if not exists (select 1 from cron.job where jobname = 'omnira_runs_drain') then
    perform cron.schedule('omnira_runs_drain', '* * * * *', 'select omnira_cron.call_vercel(''/api/runs/drain'')');
    restored := restored || 'omnira_runs_drain ';
  end if;
  if not exists (select 1 from cron.job where jobname = 'omnira_runs_reaper') then
    perform cron.schedule('omnira_runs_reaper', '* * * * *', 'select omnira_cron.reap_stuck_runs()');
    restored := restored || 'omnira_runs_reaper ';
  end if;
  return case when restored = '' then 'ok' else 'restored: ' || restored end;
end $fn$;

-- Säkerställ drainern direkt (i fall den saknas vid apply-tillfället), och
-- schemalägg guardianen. cron.schedule upsertar per namn → idempotent.
select omnira_cron.ensure_core_schedules();
select cron.schedule('omnira_cron_guardian', '*/5 * * * *', $$select omnira_cron.ensure_core_schedules()$$);
