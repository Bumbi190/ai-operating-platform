-- Make media_insights multi-platform (YouTube + Facebook per-post), additive & non-destructive.
alter table public.media_insights
  add column if not exists youtube_video_id text,
  add column if not exists facebook_post_id text;

-- Allow per-platform upserts keyed on (script_id, platform).
-- Existing data: 14 rows, 0 null script_id, all distinct on (script_id, platform) — safe.
create unique index if not exists media_insights_script_platform_key
  on public.media_insights (script_id, platform);

comment on column public.media_insights.youtube_video_id is 'YouTube video id for platform=youtube rows (null otherwise).';
comment on column public.media_insights.facebook_post_id  is 'Facebook post id for platform=facebook rows (null otherwise).';