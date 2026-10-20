-- Familje-Stunden: private append-only month-source review records.
-- This migration is authored locally ONLY. DO NOT apply to production until
-- independent security review and authenticated owner API verification.
--
-- All access is service-side. The public Data API has NO anon/authenticated
-- grants or RLS policies; existing server auth gates must prove owner identity.
-- Neither table grants automatic generation, member-content release or posting.

create table public.family_month_source_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_month text not null check (source_month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  plan_revision_id uuid not null,
  candidate_sha256 text not null check (candidate_sha256 ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique(project_id, source_month, candidate_sha256),
  unique(id, project_id, candidate_sha256)
);

create index family_month_source_candidates_latest
  on public.family_month_source_candidates(project_id, source_month, created_at desc, id desc);

create table public.family_month_source_decisions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  project_id uuid not null,
  candidate_sha256 text not null check (candidate_sha256 ~ '^[a-f0-9]{64}$'),
  decision text not null check (decision in ('approve','reject')),
  decided_by uuid not null,
  decided_at timestamptz not null default now(),
  unique(candidate_id),
  foreign key (candidate_id, project_id, candidate_sha256)
    references public.family_month_source_candidates(id, project_id, candidate_sha256)
    on delete cascade
);

create index family_month_source_decisions_project
  on public.family_month_source_decisions(project_id, decided_at desc);

alter table public.family_month_source_candidates enable row level security;
alter table public.family_month_source_decisions enable row level security;

revoke all on public.family_month_source_candidates from public, anon, authenticated;
revoke all on public.family_month_source_decisions from public, anon, authenticated;

-- No direct updates or deletes, even through the service role:
-- proposals and decisions are append-only. Unique candidate_id guarantees
-- that only one competing approval/rejection can be inserted.
revoke all on public.family_month_source_candidates from service_role;
revoke all on public.family_month_source_decisions from service_role;
grant select, insert on public.family_month_source_candidates to service_role;
grant select, insert on public.family_month_source_decisions to service_role;
