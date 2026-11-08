-- Genomtittnings-% (retention) per video. Numerisk 0–100. Additivt.
alter table public.media_insights
  add column if not exists avg_view_pct numeric;
comment on column public.media_insights.avg_view_pct is 'YouTube averageViewPercentage (0-100) via Analytics API. Null tills yt-analytics.readonly-scope finns.';