-- ─────────────────────────────────────────────────────────────────────────────
-- Handlarbörsen daily collection (P1E): ACTIVATE the pg_cron job.
--
-- THIS IS NOT A MIGRATION and lives outside supabase/migrations on purpose, so that no
-- deploy, `supabase db push` or migration guard can ever run it. It is applied once, by an
-- operator, after explicit approval of the production sequence (docs/handlarborsen-p1e/README.md).
--
-- It schedules exactly ONE job that calls the existing route through the existing helper:
--   omnira_handlarborsen_marketplace  55 6 * * *  (06:55 UTC; pg_cron runs in GMT)
--     -> select omnira_cron.call_vercel('/api/collectors/handlarborsen/marketplace')
-- call_vercel sends GET base_url || path with `Authorization: Bearer <cron_secret>` from
-- omnira_cron.config (the production URL and the existing CRON_SECRET). Nothing is scheduled
-- for Vercel previews and no new key is introduced. The route itself still enforces the
-- fixed project, observer/active mode, and the guarded snapshot store.
--
-- Safe by construction:
--   * Refuses to run unless the guarded store exists AND service_role can no longer write
--     the table directly. Without that protection the schedule would reintroduce the
--     overwrite risk this phase exists to remove.
--   * Refuses to run if ANY other job already targets the Handlarbörsen collector routes.
--   * Idempotent: cron.schedule upserts by job name, so a second run changes nothing.
--     Afterwards it verifies there is exactly one such job, with the expected schedule/command.
--   * One transaction: any failed check raises and nothing is scheduled.
--   * Does not touch any other cron job, ensure_core_schedules(), or cron_heartbeat.
--
-- Roll back with rollback-cron.sql (unschedules that one job; collected data is untouched).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $p1e$
DECLARE
  c_job      constant text := 'omnira_handlarborsen_marketplace';
  c_schedule constant text := '55 6 * * *';
  c_command  constant text := 'select omnira_cron.call_vercel(''/api/collectors/handlarborsen/marketplace'')';
  v_count    integer;
  v_job      record;
BEGIN
  -- 1. Prerequisites: scheduler helper, guarded store, closed direct write path.
  IF to_regprocedure('omnira_cron.call_vercel(text)') IS NULL THEN
    RAISE EXCEPTION 'p1e: omnira_cron.call_vercel(text) is missing';
  END IF;
  IF to_regprocedure('public.handlarborsen_store_marketplace_snapshot(date, timestamptz, jsonb, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'p1e: the guarded snapshot store is not applied; refusing to schedule';
  END IF;
  IF has_table_privilege('service_role', 'public.handlarborsen_marketplace_snapshots', 'INSERT')
     OR has_table_privilege('service_role', 'public.handlarborsen_marketplace_snapshots', 'UPDATE') THEN
    RAISE EXCEPTION 'p1e: service_role can still write the snapshot table directly; refusing to schedule';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.projects
     WHERE id = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid AND slug = 'handlarborsen'
       AND atlas_mode IN ('observer', 'active')
  ) THEN
    RAISE EXCEPTION 'p1e: Handlarborsen is not in observer or active mode';
  END IF;

  -- 2. No duplicate registration under any other name.
  FOR v_job IN
    SELECT jobname, command FROM cron.job
     WHERE command ILIKE '%/api/collectors/handlarborsen/%' AND jobname IS DISTINCT FROM c_job
  LOOP
    RAISE EXCEPTION 'p1e: job % already targets a Handlarborsen collector route', v_job.jobname;
  END LOOP;

  -- 3. Schedule (upsert by name).
  PERFORM cron.schedule(c_job, c_schedule, c_command);

  -- 4. Verify the end state: exactly one such job, exactly as intended, and active.
  SELECT count(*) INTO v_count FROM cron.job WHERE command ILIKE '%/api/collectors/handlarborsen/%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'p1e: expected exactly 1 Handlarborsen collector job, found %', v_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
     WHERE jobname = c_job AND schedule = c_schedule AND command = c_command AND active
  ) THEN
    RAISE EXCEPTION 'p1e: the scheduled job does not match the intended definition';
  END IF;
END
$p1e$;

COMMIT;

-- Verify (read-only):
--   select jobid, jobname, schedule, active, command from cron.job where jobname = 'omnira_handlarborsen_marketplace';
--   select count(*) from cron.job;   -- was 38 before activation, 39 after
