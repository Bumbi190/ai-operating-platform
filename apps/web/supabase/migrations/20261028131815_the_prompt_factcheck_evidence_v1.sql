-- The Prompt FactCheck v1: private, append-only source-grounded review evidence.
-- DRAFT ONLY. Do not apply to production until source/model authorization and
-- the existing production migration ledger have been independently reconciled.
-- A fact-check report is NOT a human editorial approval or publication permission.

create table public.media_factcheck_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  script_id uuid not null references public.media_scripts(id) on delete restrict,
  run_id uuid not null references public.runs(id) on delete restrict,
  claim_id uuid not null,
  reviewer_run_id uuid not null,
  script_version integer not null check (script_version >= 1),
  revision_id text not null check (length(revision_id) between 1 and 150),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  source_set_sha256 text check (
    source_set_sha256 is null or source_set_sha256 ~ '^[a-f0-9]{64}$'
  ),
  writer_model text not null check (length(writer_model) between 7 and 100),
  reviewer_model text not null check (length(reviewer_model) between 7 and 100),
  risk_tier text not null check (risk_tier in ('standard','sensitive','unknown')),
  outcome text not null check (
    outcome in ('ready_for_editor','requires_review','rejected')
  ),
  framing text not null check (
    framing in ('faithful_to_evidence','misleading','unverified')
  ),
  framing_reason text not null check (length(framing_reason) between 1 and 1200),
  reasons text[] not null default '{}'::text[],
  manuscript_snapshot jsonb not null check (
    jsonb_typeof(manuscript_snapshot) = 'object'
    and octet_length(manuscript_snapshot::text) <= 24000
  ),
  source_receipts jsonb not null check (
    jsonb_typeof(source_receipts) = 'array'
    and jsonb_array_length(source_receipts) <= 4
    and octet_length(source_receipts::text) <= 12000
  ),
  findings jsonb not null check (
    jsonb_typeof(findings) = 'array'
    and jsonb_array_length(findings) <= 60
    and octet_length(findings::text) <= 36000
  ),
  reviewed_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint media_factcheck_report_unique_run unique (project_id, reviewer_run_id),
  constraint media_factcheck_report_outcome_guard check (
    (
      outcome = 'ready_for_editor'
      and framing = 'faithful_to_evidence'
      and cardinality(reasons) = 0
      and source_set_sha256 is not null
      and jsonb_array_length(source_receipts) >= 2
      and jsonb_array_length(findings) >= 2
    )
    or (
      outcome <> 'ready_for_editor'
      and cardinality(reasons) between 1 and 20
    )
  )
);
create index media_factcheck_reports_recent_by_project
  on public.media_factcheck_reports (project_id, recorded_at desc, id desc);
create index media_factcheck_reports_script_history
  on public.media_factcheck_reports (project_id, script_id, recorded_at desc);

alter table public.media_factcheck_reports enable row level security;
-- This is a PRIVATE server-only evidence ledger; no authenticated/anon policies.
revoke all on public.media_factcheck_reports from public, anon, authenticated, service_role;
grant select, insert on public.media_factcheck_reports to service_role;
comment on table public.media_factcheck_reports is
  'Immutable The Prompt source-grounded FactCheck reports. Evidence only: never authorizes media generation, approval, posting or provider spending.';

create function public.media_factcheck_report_insert_guard() returns trigger
language plpgsql security invoker set search_path = '' as $fn$
declare
  script_row public.media_scripts;
  run_row public.runs;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'FACTCHECK_SERVER_ONLY' using errcode = '42501';
  end if;
  -- Lock original rows while checking ownership/version. A reviewer may not
  -- make a report for a different project or an unclaimed, stale run.
  select * into script_row from public.media_scripts
    where id = new.script_id and project_id = new.project_id for share;
  if script_row.id is null
    or coalesce(script_row.version, 1) <> new.script_version
    or new.manuscript_snapshot ->> 'projectId' is distinct from new.project_id::text
    or new.manuscript_snapshot ->> 'scriptId' is distinct from new.script_id::text
    or new.manuscript_snapshot ->> 'revisionId' is distinct from new.revision_id
    or new.manuscript_snapshot ->> 'hook' is distinct from coalesce(script_row.hook, '')
    or new.manuscript_snapshot ->> 'script' is distinct from coalesce(script_row.script, '')
    or new.manuscript_snapshot -> 'captions' is distinct from coalesce(script_row.captions, '[]'::jsonb)
    or new.manuscript_snapshot ->> 'cta' is distinct from coalesce(script_row.cta, '')
    or new.manuscript_snapshot ->> 'riskTier' is distinct from new.risk_tier
  then
    raise exception 'FACTCHECK_SCRIPT_VERSION_CHANGED' using errcode = '23514';
  end if;

  select * into run_row from public.runs where id = new.run_id for share;
  if run_row.id is null
    or run_row.project_id is distinct from new.project_id
    or run_row.claim_id is distinct from new.claim_id
    or run_row.cancel_requested
  then
    raise exception 'FACTCHECK_RUN_OWNERSHIP_MISMATCH' using errcode = '23514';
  end if;
  if new.reviewed_at > clock_timestamp() + interval '5 minutes'
    or new.reviewed_at < clock_timestamp() - interval '24 hours'
    or cardinality(new.reasons) > 20
  then
    raise exception 'FACTCHECK_INVALID_REVIEW_INSTANT' using errcode = '23514';
  end if;
  return new;
end $fn$;

create function public.media_factcheck_report_append_only() returns trigger
language plpgsql security invoker set search_path = '' as $fn$
begin
  raise exception 'FACTCHECK_EVIDENCE_IMMUTABLE' using errcode = '42501';
end $fn$;

create trigger media_factcheck_report_insert_guard
  before insert on public.media_factcheck_reports
  for each row execute function public.media_factcheck_report_insert_guard();
create trigger media_factcheck_report_append_only
  before update or delete on public.media_factcheck_reports
  for each row execute function public.media_factcheck_report_append_only();

-- Trigger functions are internal implementation details, not callable API.
revoke all on function public.media_factcheck_report_insert_guard()
  from public, anon, authenticated;
revoke all on function public.media_factcheck_report_append_only()
  from public, anon, authenticated;
