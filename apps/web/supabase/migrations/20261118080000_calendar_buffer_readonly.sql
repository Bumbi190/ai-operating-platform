-- Buffer calendar history is a read-only provider mirror, never a publishing queue.
-- The authenticated sync implementation must verify channel and project ownership.
create table if not exists public.calendar_buffer_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  channel_id text not null check(length(channel_id) between 4 and 128),
  provider_post_id text not null check(length(provider_post_id) between 4 and 128),
  content_text text not null default '' check(length(content_text) <= 10000),
  provider_status text not null check(provider_status in ('scheduled','sent','failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  permalink text,
  synced_at timestamptz not null default now(),
  constraint calendar_buffer_provider_unique unique (owner_id, project_id, channel_id, provider_post_id),
  constraint calendar_buffer_status_evidence check (
    (provider_status='sent' and sent_at is not null)
    or (provider_status in ('scheduled','failed') and scheduled_at is not null)
  ),
  constraint calendar_buffer_https_permalink check (permalink is null or permalink ~ '^https://[^[:space:]]+$')
);
create index if not exists calendar_buffer_project_window_idx
  on public.calendar_buffer_posts (project_id, scheduled_at, sent_at);
alter table public.calendar_buffer_posts enable row level security;
revoke all on public.calendar_buffer_posts from anon, authenticated;
grant select, insert, update, delete on public.calendar_buffer_posts to service_role;
comment on table public.calendar_buffer_posts is
'Buffer provider-status mirror for Omnira calendar: read only in app, owner-scoped, populated only by trusted backend sync';
