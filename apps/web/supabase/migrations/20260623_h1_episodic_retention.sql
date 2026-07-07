-- Atlas Memory M4 H1 (M2): Episodic retention policy.
--
-- Change 1: atlas.purge_episodic_events(p_retention_days integer DEFAULT 90)
--   Deletes episodic memory events older than the retention window. Retention
--   anchor is occurred_at (business event age), not ingested_at (queue entry time).
--   Episodic class is derived via atlas.event_type_to_class() — an IMMUTABLE SQL
--   function, inlined by the planner (zero per-row overhead). The 'unknown' fallback
--   in the taxonomy function ensures unrecognised event types are never accidentally
--   purged. Returns the number of rows deleted (visible in cron.job_run_details via
--   the "1 row" result-set count — the integer itself is not captured by pg_cron).
--
-- Change 2: extend atlas_archive cron command.
--   Unschedule + reschedule atlas_archive to call both archive_stale_memories() and
--   purge_episodic_events() as sequential independent statements. Each runs in its
--   own implicit transaction: an archive failure does not block purge, and vice versa.
--
-- Change 3: update omnira_cron.ensure_core_schedules() guardian.
--   Closes the M1 binding constraint: the atlas_archive restore command now reflects
--   the post-H1 two-statement command. If atlas_archive is dropped after M2, the
--   guardian restores it with both operations.
--
-- Execution order: function first (cron command references it by name), then cron
-- update, then guardian (depends on nothing, closes M1 binding constraint last).

-- ── Change 1: purge function ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION atlas.purge_episodic_events(
  p_retention_days integer DEFAULT 90
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  -- Purge episodic events older than p_retention_days days (default: 90).
  -- Retention anchor: occurred_at (business event age, not Atlas ingest time).
  --
  -- 'episodic' is derived from atlas.event_type_to_class() — an IMMUTABLE SQL
  -- function inlined by the planner to the equivalent IN list at zero runtime cost.
  -- The taxonomy function returns 'unknown' for unrecognised types, so this predicate
  -- never accidentally purges events whose class has not been declared.
  --
  -- COUPLING: when adding a new episodic event_type, both of the following must be
  -- updated in the same migration:
  --   1. public.atlas_record_event  — consolidated_at stamping (behavioral authority)
  --   2. atlas.event_type_to_class  — taxonomy (this purge then picks it up automatically)
  DELETE FROM atlas.memory_events
  WHERE atlas.event_type_to_class(event_type) = 'episodic'
    AND occurred_at < now() - (p_retention_days || ' days')::interval;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ── Change 2: extend atlas_archive cron command ───────────────────────────────

-- Remove the existing single-function job and replace with the two-statement command.
-- Both calls are independent: each runs in its own implicit transaction.
SELECT cron.unschedule('atlas_archive');
SELECT cron.schedule('atlas_archive', '30 3 * * *',
  'select atlas.archive_stale_memories(); select atlas.purge_episodic_events();');

-- ── Change 3: guardian update (M1 binding constraint) ────────────────────────

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
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'atlas_consolidate') THEN
    PERFORM cron.schedule('atlas_consolidate', '*/5 * * * *',
      'select atlas.consolidate_memory_events();');
    restored := restored || 'atlas_consolidate ';
  END IF;
  -- Atlas Memory M4 H1 (M2) — restore command updated to include purge.
  -- If atlas_archive is dropped after M2, the guardian restores both operations.
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'atlas_archive') THEN
    PERFORM cron.schedule('atlas_archive', '30 3 * * *',
      'select atlas.archive_stale_memories(); select atlas.purge_episodic_events();');
    restored := restored || 'atlas_archive ';
  END IF;
  RETURN CASE WHEN restored = '' THEN 'ok' ELSE 'restored: ' || restored END;
END;
$$;
