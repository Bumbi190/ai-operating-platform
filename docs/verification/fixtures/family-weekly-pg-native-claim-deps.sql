-- Disposable PostgreSQL only.
-- Supplement the narrow existing fixture with EXACT columns used by the
-- canonical public.claim_runs body from 20261015041654_atlas_builder_studio_workspace.sql.
-- Never run this on a linked Supabase database.
alter table public.platform_config
 add column id integer not null default 1;
alter table public.platform_config
 add constraint synthetic_platform_config_pkey primary key(id);

alter table public.project_lifecycle
 add column version bigint not null default 0;

alter table public.runs
 add column created_at timestamptz not null default clock_timestamp(),
 add column claimed_at timestamptz,
 add column started_at timestamptz;
