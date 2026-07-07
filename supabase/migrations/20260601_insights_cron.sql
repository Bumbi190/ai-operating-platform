-- Daglig uppdatering av Instagram-engagemang (efter morgonens publicering).
select cron.schedule(
  'omnira_insights_daily',
  '0 9 * * *',
  $$select omnira_cron.call_vercel('/api/media/cron/insights');$$
);
