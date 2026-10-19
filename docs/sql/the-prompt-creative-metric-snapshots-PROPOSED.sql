-- PROPOSED, REVIEW-ONLY schema for The Prompt's seven-day creative pilot.
-- DO NOT APPLY without owner-approved migration review/rollback and prior
-- verification of media_scripts, project FK and RLS in an isolated Supabase.
-- No existing media_insights rows changed; this is a new append-only history.
create table if not exists public.media_pilot_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  script_id uuid not null references public.media_scripts(id) on delete cascade,
  platform text not null check (platform in ('instagram','facebook','youtube')),
  creative_version text not null check (creative_version in ('text_motion','story_visual')),
  published_at timestamptz not null,
  fetched_at timestamptz not null,
  views bigint check (views is null or views>=0),
  likes bigint check (likes is null or likes>=0),
  comments bigint check (comments is null or comments>=0),
  saved bigint check (saved is null or saved>=0),
  shares bigint check (shares is null or shares>=0),
  avg_view_pct numeric check (avg_view_pct is null or (avg_view_pct>=0 and avg_view_pct<=1000)),
  inserted_at timestamptz not null default now(),
  constraint creative_snapshot_collected_after_publish check (fetched_at>=published_at),
  constraint creative_snapshot_single_sample unique (project_id,script_id,platform,fetched_at)
);
create index if not exists idx_media_pilot_snapshot_cohort on
  public.media_pilot_metric_snapshots(project_id,creative_version,platform,fetched_at);
alter table public.media_pilot_metric_snapshots enable row level security;
-- No policies for anon or authenticated. Use an explicitly audited server
-- service-role writer with exact project + per-published-script verification.
revoke all on public.media_pilot_metric_snapshots from public,anon,authenticated;
grant select,insert on public.media_pilot_metric_snapshots to service_role;
-- DELIBERATELY no client-side UPDATE/DELETE; operational retention/rollback
-- requires a separately approved cleanup migration.
