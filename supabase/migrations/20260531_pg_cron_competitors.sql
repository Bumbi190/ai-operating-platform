-- ═══════════════════════════════════════════════════════════════════════════════
--
--   OMNIRA · Lägg till competitor-intelligence cron
--   ─────────────────────────────────────────────────
--   Kör varje måndag 06:00 UTC — en timme innan morgon-step1 (07:20 UTC).
--   Hämtar competitor hooks från Hermes, sparar i memories-tabellen.
--   step1 läser sedan från cachen (ingen extra tid i step1-budgeten).
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ta bort om det redan finns (idempotent)
do $$
begin
  perform cron.unschedule('omnira_competitors') where exists (
    select 1 from cron.job where jobname = 'omnira_competitors'
  );
end $$;

select cron.schedule(
  'omnira_competitors',
  '0 6 * * 1',   -- Varje måndag 06:00 UTC
  $$select omnira_cron.call_vercel('/api/media/cron/competitors');$$
);
