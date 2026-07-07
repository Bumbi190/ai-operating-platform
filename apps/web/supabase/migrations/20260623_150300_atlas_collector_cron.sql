-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Collectors v1 — Migration 4: Collector pg_cron Jobs + Guardian Update
--
-- ⚠️  APPLY AFTER DEPLOYING COLLECTOR ROUTES TO VERCEL ⚠️
-- Routes must exist before cron jobs are scheduled, or first fires 404.
--
-- Adds two daily collector cron jobs:
--   omnira_stripe_revenue  → daily 06:45 UTC → /api/collectors/stripe/revenue
--   omnira_social_account  → daily 06:50 UTC → /api/collectors/social/account
--
-- Updates ensure_core_schedules() to include these jobs in the self-healing
-- guardian (runs every 5 min via omnira_cron_guardian).
--
-- Seeds cron_heartbeat rows so the heartbeat route monitors these jobs
-- immediately (status = pending_first_run until first fire).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Update the self-healing guardian ──────────────────────────────────────
-- Strict superset of 20260623_h1_episodic_retention.sql (not h5).
-- h1 updated atlas_archive from a single-statement command (h5) to a
-- two-statement command that also calls atlas.purge_episodic_events(). This
-- migration sorts before h1 (digits < letters lexicographically) so both apply
-- in the same supabase db push. The atlas_archive restore command here matches
-- h1's two-statement command so the guardian is correct regardless of which
-- migration last ran CREATE OR REPLACE.
--
-- Dependency: atlas.purge_episodic_events() is created by h1. The restore
-- command below only executes if atlas_archive is dropped — which cannot happen
-- before h1 has run in any normal deployment. Safe in the same push batch.
--
-- Signature: no SECURITY DEFINER (pg_cron runs as superuser; h5 removed it).
-- Command strings: lowercase select, trailing semicolons for atlas jobs.

CREATE OR REPLACE FUNCTION omnira_cron.ensure_core_schedules()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE restored text := '';
BEGIN
  -- Core infrastructure interval jobs (from 20260614_cron_guardian.sql)
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

  -- Atlas Memory cron jobs — consolidate command from h5; archive command from h1.
  -- atlas_archive uses the two-statement command (h1) — includes purge_episodic_events().
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'atlas_consolidate') THEN
    PERFORM cron.schedule('atlas_consolidate', '*/5 * * * *',
      'select atlas.consolidate_memory_events();');
    restored := restored || 'atlas_consolidate ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'atlas_archive') THEN
    PERFORM cron.schedule('atlas_archive', '30 3 * * *',
      'select atlas.archive_stale_memories(); select atlas.purge_episodic_events();');
    restored := restored || 'atlas_archive ';
  END IF;

  -- Atlas Collector daily jobs (added by this migration)
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'omnira_stripe_revenue') THEN
    PERFORM cron.schedule('omnira_stripe_revenue', '45 6 * * *',
      'select omnira_cron.call_vercel(''/api/collectors/stripe/revenue'')');
    restored := restored || 'omnira_stripe_revenue ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'omnira_social_account') THEN
    PERFORM cron.schedule('omnira_social_account', '50 6 * * *',
      'select omnira_cron.call_vercel(''/api/collectors/social/account'')');
    restored := restored || 'omnira_social_account ';
  END IF;

  RETURN CASE WHEN restored = '' THEN 'ok' ELSE 'restored: ' || restored END;
END;
$$;

-- ── 2. Schedule the collector jobs now (idempotent via guardian) ─────────────
SELECT omnira_cron.ensure_core_schedules();

-- ── 3. Seed cron_heartbeat so the heartbeat route monitors from day one ──────
INSERT INTO public.cron_heartbeat (
  jobname, label, cadence, status, detail, checked_at, updated_at
) VALUES
  ('stripe_revenue', 'Stripe Revenue', 'dagligen 06:45', 'pending_first_run',
   'Väntar på första körningen', now(), now()),
  ('social_account', 'Social Account', 'dagligen 06:50', 'pending_first_run',
   'Väntar på första körningen', now(), now())
ON CONFLICT (jobname) DO NOTHING;
