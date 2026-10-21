-- ─────────────────────────────────────────────────────────────────────────────
-- Handlarbörsen daily collection (P1E): ROLL BACK the pg_cron job.
--
-- Not a migration. Unschedules the ONE job created by activate-cron.sql and nothing else.
-- Stored snapshots, signals and collector_runs are NOT touched (the history stays).
-- Idempotent: if the job is already gone this is a no-op that still verifies the end state.
--
-- The heartbeat needs no cleanup: public.cron_job_status() reads cron.job, so once the job is
-- gone the 'handlarborsen_marketplace' check reads 'pending_first_run' again (a daily check
-- with no registered run never alarms). The guarded snapshot store stays in place: it is
-- a strictly safer write path and is independent of scheduling.
--
-- An in-flight run is not cancelled: a request pg_cron already sent still finishes, and the
-- guarded store makes it harmless.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $p1e$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'omnira_handlarborsen_marketplace') THEN
    PERFORM cron.unschedule('omnira_handlarborsen_marketplace');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE command ILIKE '%/api/collectors/handlarborsen/%') THEN
    RAISE EXCEPTION 'p1e rollback: a Handlarborsen collector job still exists under another name';
  END IF;
END
$p1e$;

COMMIT;

-- Verify (read-only):
--   select count(*) from cron.job where command ilike '%/api/collectors/handlarborsen/%';  -- 0
