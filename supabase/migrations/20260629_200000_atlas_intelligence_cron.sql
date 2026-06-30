-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Atlas Intelligence — pg_cron Job Registration (Epic 1)
--   ───────────────────────────────────────────────────────
--   Registers the daily EI brief cron job at 06:00 UTC.
--   Follows the established omnira_cron pattern (20260528_pg_cron_setup.sql).
--
--   This migration is idempotent: it unschedules any prior job with the same
--   name before scheduling, matching the pattern in pg_cron_setup.sql.
--
--   Requires:
--     - omnira_cron.config populated (base_url + cron_secret)
--     - omnira_cron.call_vercel() function present (from pg_cron_setup.sql)
--     - atlas_intelligence table applied (20260629_120000_atlas_intelligence.sql)
--     - atlas_entities table applied      (20260629_120100_atlas_entities.sql)
--     - GET /api/atlas/intelligence/cron/brief deployed on Vercel
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Remove prior job if it exists (idempotent) ────────────────────────────────

do $$
begin
  perform cron.unschedule('omnira_atlas_intelligence_brief')
  where exists (
    select 1 from cron.job where jobname = 'omnira_atlas_intelligence_brief'
  );
end $$;

-- ── Register the daily EI brief job ──────────────────────────────────────────
--
--   06:00 UTC — runs after token-health (06:15) and Stripe snapshot (06:45)
--   are already scheduled, but the EI brief only needs signals that have
--   accumulated from prior days so 06:00 is fine as the starting order.
--
--   If you need EI to run after the collectors (06:45–06:50), change the
--   cron expression to '0 7 * * *' (07:00 UTC) to ensure collector signals
--   from today are available. For the first deployment, 06:00 is correct
--   because EI reasons over the accumulated time series, not just today's signal.

select cron.schedule(
  'omnira_atlas_intelligence_brief',
  '0 6 * * *',
  $$select omnira_cron.call_vercel('/api/atlas/intelligence/cron/brief');$$
);

-- ── Verify ───────────────────────────────────────────────────────────────────
--
--   After applying, verify the job is scheduled:
--
--     select jobname, schedule, active
--       from cron.job
--      where jobname = 'omnira_atlas_intelligence_brief';
--
--   Smoke-test the route manually (before waiting for 06:00 UTC):
--
--     curl -X GET \
--       -H "Authorization: Bearer $CRON_SECRET" \
--       https://YOUR_VERCEL_URL/api/atlas/intelligence/cron/brief
--
--   Then verify rows in atlas_intelligence:
--
--     select id, kind, project_id, confidence, produced_at
--       from atlas_intelligence
--      order by produced_at desc
--      limit 20;
