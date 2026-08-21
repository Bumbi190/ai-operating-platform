-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Atlas Intelligence — Executive Brief generation schedule (canonical activation)
--   ──────────────────────────────────────────────────────────────────────────────
--   Derived from the historical, never-applied migration
--   `supabase/migrations/20260629_200000_atlas_intelligence_cron.sql`
--   (sha256 88e780c416a4b6f283510cd23cbf9897014baa9a1d152f12b7c5a003f4d66090).
--
--   Production currently runs 34 pg_cron jobs and NONE of them is the Executive
--   Brief: `select count(*) from cron.job where command like
--   '%/api/atlas/intelligence/cron/brief%'` returns 0. Generation has therefore
--   never run, which is the second half of why no brief exists.
--
--   ── DEPENDENCY CONTRACT, RE-VERIFIED AGAINST TODAY'S RUNTIME ─────────────────
--
--   The historical file's stated requirements were checked one by one against
--   production rather than assumed still true:
--
--     omnira_cron.config          PRESENT (schema + config table both exist)
--     omnira_cron.call_vercel()   PRESENT — issues net.http_get(...) with an
--                                 `Authorization: Bearer <cron_secret>` header
--     atlas_intelligence          created by 20260821_atlas_intelligence.sql
--     atlas_entities              created by 20260821_atlas_entities.sql
--     the HTTP route              app/api/atlas/intelligence/cron/brief/route.ts
--                                 exports GET and checks CRON_SECRET
--
--   call_vercel performs a GET and the route handles GET, so the invocation
--   contract is NOT stale and the historical schedule can be replayed as-is.
--   Had the route moved to POST, this schedule would have failed silently every
--   morning; that is why it was verified instead of trusted.
--
--   CRON_SECRET here authenticates the SCHEDULER to a GENERATION route. It is
--   not a principal and grants no read authority: EI-S1.5A retired the
--   shared-secret READ route, and this migration deliberately does not
--   resurrect it — the only path scheduled is `/cron/brief`.
--
--   ── INTENTIONAL DIFFERENCE FROM THE HISTORICAL FILE ──────────────────────────
--
--   (1) The schedule moves from '0 6 * * *' to '0 7 * * *'.
--
--       The historical file itself flagged this: at 06:00 UTC the brief runs
--       BEFORE the same morning's collectors (stripe-snapshot 06:20/06:45,
--       social-account 06:50), and its own comment says to use 07:00 "to ensure
--       collector signals from today are available". Those collectors are live
--       in production now, so the condition the comment described as future is
--       simply the present. 07:00 also lands after token-health (06:15) and the
--       morning briefing (06:00), avoiding a cold-start pile-up.
--
--   Idempotent: any prior job of the same name is unscheduled first.
--
-- ═══════════════════════════════════════════════════════════════════════════════

do $$
begin
  perform cron.unschedule('omnira_atlas_intelligence_brief')
  where exists (
    select 1 from cron.job where jobname = 'omnira_atlas_intelligence_brief'
  );
end $$;

select cron.schedule(
  'omnira_atlas_intelligence_brief',
  '0 7 * * *',
  $$select omnira_cron.call_vercel('/api/atlas/intelligence/cron/brief');$$
);

-- ── Verify (read-only, after apply) ──────────────────────────────────────────
--
--     select jobname, schedule, active
--       from cron.job
--      where jobname = 'omnira_atlas_intelligence_brief';
--
--     select id, kind, project_id, confidence, produced_at
--       from public.atlas_intelligence
--      order by produced_at desc
--      limit 20;
