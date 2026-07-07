-- Daglig morgonbriefing till operatörens inkorg (06:30).
select cron.schedule(
  'omnira_briefing_morning',
  '30 6 * * *',
  $$select omnira_cron.call_vercel('/api/briefing/cron');$$
);
