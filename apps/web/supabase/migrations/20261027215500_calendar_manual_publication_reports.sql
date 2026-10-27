-- Operator-reported manual publishing is not a provider receipt or dispatch authority.
create table if not exists public.calendar_manual_publication_reports (
 project_id uuid not null,
 post_id uuid not null,
 revision_id uuid not null,
 sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
 reported_by uuid not null,
 reported_at timestamptz not null default now(),
 primary key (project_id,post_id)
);
create index if not exists calendar_manual_publication_reports_reporter_idx
 on public.calendar_manual_publication_reports (reported_by);
alter table public.calendar_manual_publication_reports enable row level security;
revoke all on public.calendar_manual_publication_reports from anon, authenticated;
grant select, insert, update, delete on public.calendar_manual_publication_reports to service_role;
comment on table public.calendar_manual_publication_reports is
 'User-confirmed external manual publication only, never an observed provider receipt or proof of automatic delivery.';
