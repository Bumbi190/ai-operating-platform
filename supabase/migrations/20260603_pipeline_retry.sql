-- Durabel steg-retry för media-pipelinen (step2/step3) — inget tyst innehållsbortfall.
alter table public.media_scripts add column if not exists voice_attempts        integer not null default 0;
alter table public.media_scripts add column if not exists render_attempts       integer not null default 0;
alter table public.media_scripts add column if not exists pipeline_next_retry_at timestamptz;
alter table public.media_scripts add column if not exists pipeline_failed_reason text;

-- Ersätt smala reset_stuck_images-cronen med en generell pipeline-retry-drainer (var 5:e min).
select cron.unschedule('omnira_reset_stuck_images');
select cron.schedule('omnira_pipeline_retry', '*/5 * * * *', $$select omnira_cron.call_vercel('/api/media/cron/pipeline-retry')$$);
