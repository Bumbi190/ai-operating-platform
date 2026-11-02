-- Applied through Supabase MCP on 2026-10-29, version 20261029065156.
-- Owner-only Handlarbörsen research archive, not a CRM or outbound-contact table.
-- No rows were inserted as part of this migration.

create table if not exists public.hb_lead_research_archives (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict
    check (project_id = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid),
  owner_id uuid not null references auth.users(id) on delete restrict,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  report jsonb not null check (
    jsonb_typeof(report) = 'object'
    and jsonb_typeof(report->'counts') = 'object'
    and jsonb_typeof(report->'result') = 'array'
    and jsonb_array_length(report->'result') = 81
    and report->'counts'->>'totalSCB' = '89'
    and report->'counts'->>'eligible' = '81'
    and report->'counts'->>'covered' = '81'
    and report->'counts'->>'noneContactable' = 'true'
  ),
  review_state text not null default 'awaiting_manual_review'
    check (review_state = 'awaiting_manual_review'),
  history_complete boolean not null default false check (history_complete = false),
  contactability text not null default 'BLOCKED_PENDING_VERIFICATION'
    check (contactability = 'BLOCKED_PENDING_VERIFICATION'),
  outreach_ready boolean not null default false check (outreach_ready = false),
  created_at timestamptz not null default now(),
  unique (project_id,owner_id,snapshot_sha256)
);
create index if not exists hb_lead_research_archives_owner_latest
  on public.hb_lead_research_archives(project_id, owner_id, created_at desc);
alter table public.hb_lead_research_archives enable row level security;
revoke all on table public.hb_lead_research_archives from public, anon, authenticated;
grant select, insert on table public.hb_lead_research_archives to authenticated;

create policy hb_lead_research_archive_owner_read
  on public.hb_lead_research_archives for select to authenticated
  using (
    owner_id = (select auth.uid())
    and project_id = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );

create policy hb_lead_research_archive_owner_insert
  on public.hb_lead_research_archives for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and project_id = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
    and review_state = 'awaiting_manual_review'
    and history_complete = false
    and outreach_ready = false
    and contactability = 'BLOCKED_PENDING_VERIFICATION'
  );
