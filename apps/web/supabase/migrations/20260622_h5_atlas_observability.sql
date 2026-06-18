-- Atlas Memory M4 H5 (M1): Consolidation observability.
--
-- Change 1: extend omnira_cron.ensure_core_schedules() to guard atlas_consolidate
--   and atlas_archive. Previously only guarded omnira_runs_drain and omnira_runs_reaper.
--   If either atlas cron job is dropped, the guardian (runs every 5 min) auto-restores it.
--   Command strings match exactly what is registered in cron.job — trailing semicolons
--   preserved. atlas_archive restore uses the pre-H1 command; M2 will update this body
--   to include atlas.purge_episodic_events() once H1 lands.
--
-- Change 2: create atlas.health_v — read-only spot-check view covering:
--   consolidation backlog (count + age), episodic accumulation, belief-store size,
--   emit-path liveness, and cron health (last success + last failure timestamps).
--   Queried from Supabase dashboard: SELECT * FROM atlas.health_v;

-- ── Change 1: guardian ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION omnira_cron.ensure_core_schedules()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE restored text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'omnira_runs_drain') THEN
    PERFORM cron.schedule('omnira_runs_drain', '* * * * *',
      'select omnira_cron.call_vercel(''/api/runs/drain'')');
    restored := restored || 'omnira_runs_drain ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'omnira_runs_reaper') THEN
    PERFORM cron.schedule('omnira_runs_reaper', '* * * * *',
      'select omnira_cron.reap_stuck_runs()');
    restored := restored || 'omnira_runs_reaper ';
  END IF;
  -- Atlas Memory M4 H5 — guardian coverage for Atlas cron jobs.
  -- Restore commands match the exact strings registered in cron.job (trailing semicolons).
  -- M2 will replace this body with an updated atlas_archive command including purge.
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'atlas_consolidate') THEN
    PERFORM cron.schedule('atlas_consolidate', '*/5 * * * *',
      'select atlas.consolidate_memory_events();');
    restored := restored || 'atlas_consolidate ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'atlas_archive') THEN
    PERFORM cron.schedule('atlas_archive', '30 3 * * *',
      'select atlas.archive_stale_memories();');
    restored := restored || 'atlas_archive ';
  END IF;
  RETURN CASE WHEN restored = '' THEN 'ok' ELSE 'restored: ' || restored END;
END;
$$;

-- ── Change 2: health view ─────────────────────────────────────────────────────

CREATE VIEW atlas.health_v AS
SELECT

  -- Consolidation backlog: how many non-episodic events are awaiting consolidation,
  -- and how long the oldest one has been waiting (NULL when backlog is empty).
  (
    SELECT COUNT(*)
    FROM atlas.memory_events
    WHERE consolidated_at IS NULL
      AND event_type NOT IN ('outcome', 'reflection', 'correction')
  ) AS pending_consolidation,

  (
    SELECT ROUND(EXTRACT(EPOCH FROM (now() - MIN(ingested_at))) / 60)::int
    FROM atlas.memory_events
    WHERE consolidated_at IS NULL
      AND event_type NOT IN ('outcome', 'reflection', 'correction')
  ) AS oldest_pending_minutes,

  -- Episodic accumulation: grows until H1 purge_episodic_events() runs; shrinks after.
  (
    SELECT COUNT(*)
    FROM atlas.memory_events
    WHERE event_type IN ('outcome', 'reflection', 'correction')
  ) AS episodic_events_count,

  -- Belief store size: active and soft-archived memories.
  (SELECT COUNT(*) FROM atlas.memories WHERE status = 'active')   AS active_memories,
  (SELECT COUNT(*) FROM atlas.memories WHERE status = 'archived') AS archived_memories,

  -- Emit path liveness: when was the last memory event ingested?
  (SELECT MAX(ingested_at) FROM atlas.memory_events)              AS last_event_at,

  -- Consolidation cron health: last success and last failure timestamps.
  -- If last_failed_consolidation_at > last_consolidation_at, the job is currently failing.
  (
    SELECT MAX(r.start_time)
    FROM cron.job_run_details r
    JOIN cron.job j ON j.jobid = r.jobid
    WHERE j.jobname = 'atlas_consolidate' AND r.status = 'succeeded'
  ) AS last_consolidation_at,

  (
    SELECT MAX(r.start_time)
    FROM cron.job_run_details r
    JOIN cron.job j ON j.jobid = r.jobid
    WHERE j.jobname = 'atlas_consolidate' AND r.status = 'failed'
  ) AS last_failed_consolidation_at,

  -- Archive cron health: last success and last failure timestamps.
  -- Runs daily at 03:30 UTC; if last_archive_at is > 25h ago, the job missed a run.
  (
    SELECT MAX(r.start_time)
    FROM cron.job_run_details r
    JOIN cron.job j ON j.jobid = r.jobid
    WHERE j.jobname = 'atlas_archive' AND r.status = 'succeeded'
  ) AS last_archive_at,

  (
    SELECT MAX(r.start_time)
    FROM cron.job_run_details r
    JOIN cron.job j ON j.jobid = r.jobid
    WHERE j.jobname = 'atlas_archive' AND r.status = 'failed'
  ) AS last_failed_archive_at;
