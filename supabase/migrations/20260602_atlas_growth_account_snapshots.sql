-- Fas 4a: account-level tidsserie (DISTINKT från media_insights som är per-INLÄGG).
-- Fångar följare/reach/profil per plattform & projekt över tid → grunden för
-- all tillväxt- och publikanalys. Daglig snapshot, idempotent via unik nyckel.
create table if not exists public.account_snapshots (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.projects(id) on delete set null,
  platform      text not null check (platform in ('instagram','facebook','youtube')),
  snapshot_date date not null default (now() at time zone 'utc')::date,
  captured_at   timestamptz not null default now(),
  followers     integer,
  following     integer,
  media_count   integer,
  reach         integer,
  profile_views integer,
  raw           jsonb,
  unique (project_id, platform, snapshot_date)
);

create index if not exists account_snapshots_proj_plat_date_idx
  on public.account_snapshots (project_id, platform, snapshot_date desc);

alter table public.account_snapshots enable row level security;
-- Endast service-role (cron/Atlas) rör tabellen; ingen klient-policy → RLS blockerar anon/auth.
