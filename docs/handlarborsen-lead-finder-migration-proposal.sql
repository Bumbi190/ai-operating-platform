-- HISTORICAL DESIGN PROPOSAL. Schema applied 2026-10-28 to Omnira.
-- Canonical migration: apps/web/supabase/migrations/20261028072659_handlarborsen_scb_review_only_candidates.sql
-- This older proposal remains for review context. The production table is EMPTY; no SCB data imported.
-- No public write/approve/send path. No personal or contact details are stored.
-- Before promoting: verify against CURRENT Omnira schema, RLS, Supabase advisors,
-- SCB terms, GDPR/data minimization, retention, and complete pilot-contact history.
-- This table is for 89 audited LEGAL ENTITIES from SCB, not 90 raw records.
-- The SCB physical person with jurform 10 must NEVER enter this table.
-- The service_role has technical write access but an owner-authenticated,
-- explicitly approved importer must still be implemented and reviewed separately.

create table public.hb_lead_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  orgnr text not null
    check (orgnr ~ '^[0-9]{10}$' and substring(orgnr from 3 for 1) between '2' and '9'),
  name text not null check (
    length(btrim(name)) between 2 and 200 and name !~* '@|https?://'
  ),
  city text not null check (length(btrim(city)) between 1 and 120),
  county_code text not null default '12' check (county_code='12'),
  -- Only these two SNI2025 codes were verified in the import source.
  sni_codes text[] not null check (
    cardinality(sni_codes) between 1 and 2
    and sni_codes <@ array['47.811','46.711']::text[]
  ),
  -- Unknown business fit must stay UNKNOWN, not a fabricated numerical score.
  score integer check (score between 0 and 100),
  -- SCB's official legal-form code 10 (physical person) is forbidden even if
  -- its organisation number has a legal-looking checksum.
  legal_form_code text not null check (legal_form_code in ('49','31','96')),
  scb_status_code text not null check (scb_status_code in ('1','9')),
  reklam_code text not null check (reklam_code in ('1','2')),
  epost_code text not null check (epost_code in ('1','2')),
  telefon_code text not null check (telefon_code in ('1','2','3')),
  prior_contact boolean not null,
  history_coverage text not null default 'PARTIAL' check (history_coverage='PARTIAL'),
  contactability text not null default 'BLOCKED_PENDING_VERIFICATION'
    check (contactability='BLOCKED_PENDING_VERIFICATION'),
  outreach_ready boolean not null default false check (outreach_ready=false),
  status text not null default 'needs_review'
    check (status in ('needs_review','excluded','suppressed','duplicate','rejected')),
  exclusions text[] not null default array['historical_register_incomplete']::text[]
    check (
      exclusions <@ array[
        'historical_register_incomplete', 'scb_inactive',
        'scb_marketing_restriction', 'previous_contact_partial_history',
        'legal_form_requires_review', 'possible_name_group_overlap'
      ]::text[]
      and array_position(exclusions,'historical_register_incomplete') is not null
    ),
  provenance jsonb not null check (
    jsonb_typeof(provenance) = 'object'
    and provenance ?& array['source','review','audit','retrievedAt']
    and provenance - 'source' - 'review' - 'audit' - 'retrievedAt' = '{}'::jsonb
    and provenance->>'source' = 'scb_foretagsregistret'
    and provenance->>'review' = 'awaiting_human_review'
    and provenance->>'audit' = 'hb-scb-status-audited-20261028-061729'
    and provenance->>'retrievedAt' = '2026-10-27'
  ),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, orgnr),
  -- A documented SCB restriction must be represented as suppressed; never
  -- treated as merely "not contacted" or approved.
  constraint hb_lead_restriction_guard check (
    not (reklam_code='2' or epost_code='2' or telefon_code in ('2','3'))
    or status='suppressed'
  ),
  -- Inactive or previously contacted companies must not be ordinary new leads.
  constraint hb_lead_previous_or_inactive_guard check (
    not ((scb_status_code='9' or prior_contact) and status='needs_review')
  )
);

create index hb_lead_candidates_by_project on public.hb_lead_candidates(project_id,status,created_at desc);

-- Defense in depth: no anon reads, no authenticated writes.
alter table public.hb_lead_candidates enable row level security;
revoke all on table public.hb_lead_candidates from public, anon, authenticated;
grant select on table public.hb_lead_candidates to authenticated;
grant all on table public.hb_lead_candidates to service_role;

create policy hb_lead_candidates_owner_read on public.hb_lead_candidates
for select to authenticated
using (
  project_id in (
    select id from public.projects
    where owner_id = (select auth.uid())
  )
);

-- There is deliberately NO authenticated INSERT, UPDATE, DELETE or public RPC.
-- No trigger/job may send mail, approve contacts, or overwrite source evidence.
-- Any future server-only importer must require an independently verified owner,
-- project identity, review of all 89 records, a separate manual approval, and
-- keep the feature flag OFF until a real security/data-minimization review.
