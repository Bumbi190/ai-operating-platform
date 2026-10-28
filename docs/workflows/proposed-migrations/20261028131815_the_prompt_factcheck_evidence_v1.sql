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
alter table public.media_factcheck_reports force row level security;
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
    or script_row.version is null
    or script_row.version <> new.script_version
    or new.revision_id is distinct from ('v' || script_row.version::text)
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
    or run_row.status is distinct from 'running'
    or run_row.lease_until is null
    or run_row.lease_until <= clock_timestamp()
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
create trigger media_factcheck_report_no_truncate
  before truncate on public.media_factcheck_reports
  for each statement execute function public.media_factcheck_report_append_only();

-- Trigger functions are internal implementation details, not callable API.
revoke all on function public.media_factcheck_report_insert_guard()
  from public, anon, authenticated;
revoke all on function public.media_factcheck_report_append_only()
  from public, anon, authenticated;


-- Pure structural proof of per-claim independent evidence excerpts. It does
-- NOT establish semantic truth (which requires independent review and a human).
create function public.media_factcheck_editorial_evidence_complete(
  p_receipts jsonb,p_findings jsonb
) returns boolean
language plpgsql immutable strict security invoker set search_path='' as $fn$
declare
  receipt jsonb;
  finding jsonb;
  evidence jsonb;
  source_group text;
  publisher_groups text[];
  all_sources text[]='{}'::text[];
  all_hashes text[]='{}'::text[];
begin
  if jsonb_typeof(p_receipts)<>'array' or
     jsonb_array_length(p_receipts) not between 2 and 4 or
     jsonb_typeof(p_findings)<>'array' or
     jsonb_array_length(p_findings)<2 then return false;end if;
  for receipt in select value from jsonb_array_elements(p_receipts) loop
    if jsonb_typeof(receipt)<>'object'
      or coalesce(receipt->>'sourceId','')=''
      or coalesce(receipt->>'publisherGroup','')=''
      or coalesce(receipt->>'url','') !~ '^https://'
      or coalesce(receipt->>'textSha256','') !~ '^[0-9a-f]{64}$'
      or receipt->>'sourceId'=any(all_sources)
      or receipt->>'textSha256'=any(all_hashes)
    then return false;end if;
    all_sources=array_append(all_sources,receipt->>'sourceId');
    all_hashes=array_append(all_hashes,receipt->>'textSha256');
  end loop;
  for finding in select value from jsonb_array_elements(p_findings) loop
    if jsonb_typeof(finding)<>'object'
      or finding->>'verdict'<>'supported'
      or jsonb_typeof(finding->'evidence')<>'array'
      or jsonb_array_length(finding->'evidence')<2
    then return false;end if;
    publisher_groups='{}'::text[];
    for evidence in select value from jsonb_array_elements(finding->'evidence') loop
      if jsonb_typeof(evidence)<>'object'
        or length(btrim(coalesce(evidence->>'exactQuote',''))) not between 12 and 500
      then return false;end if;
      select r->>'publisherGroup' into source_group
      from jsonb_array_elements(p_receipts) r
      where r->>'sourceId'=evidence->>'sourceId' limit 1;
      if source_group is null then return false;end if;
      if not source_group=any(publisher_groups) then
        publisher_groups=array_append(publisher_groups,source_group);
      end if;
    end loop;
    if cardinality(publisher_groups)<2 then return false;end if;
  end loop;
  return true;
exception when others then return false;
end $fn$;
revoke all on function public.media_factcheck_editorial_evidence_complete(jsonb,jsonb)
  from public,anon,authenticated;
-- The private SECURITY INVOKER insert guard calls this helper as the
-- service-role writer. No browser role is permitted to EXECUTE it.
grant execute on function public.media_factcheck_editorial_evidence_complete(jsonb,jsonb)
  to service_role;

-- OWNER-MATCHED proposed preproduction decisions. NOT a publish gate.
-- The DB checks decided_by = projects.owner_id; it cannot by itself prove
-- that a human session supplied the value. A future writer MUST derive the
-- actor from authenticated getUser() and enforce fresh owner authority.
-- Existing social_content_decisions remains the final separate per-channel,
-- exact-revision approval boundary AFTER media preparation.
create table public.media_factcheck_editorial_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  report_id uuid not null unique references public.media_factcheck_reports(id) on delete restrict,
  script_id uuid not null references public.media_scripts(id) on delete restrict,
  script_version integer not null check(script_version>0),
  revision_id text not null,
  content_sha256 text not null check(content_sha256~'^[a-f0-9]{64}$'),
  source_set_sha256 text not null check(source_set_sha256~'^[a-f0-9]{64}$'),
  decision text not null check(decision in ('approve','reject')),
  notes text not null check(length(notes) between 1 and 1200),
  sensitive_risk_acknowledged boolean not null default false,
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default clock_timestamp()
);
create index media_factcheck_editorial_decisions_project_history
  on public.media_factcheck_editorial_decisions(project_id,decided_at desc,id desc);
alter table public.media_factcheck_editorial_decisions enable row level security;
alter table public.media_factcheck_editorial_decisions force row level security;
revoke all on public.media_factcheck_editorial_decisions
  from public,anon,authenticated,service_role;
grant select,insert on public.media_factcheck_editorial_decisions to service_role;

create function public.media_factcheck_editorial_insert_guard() returns trigger
language plpgsql security invoker set search_path='' as $fn$
declare
  r public.media_factcheck_reports;
  s public.media_scripts;
  owner uuid;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'FACTCHECK_EDITOR_SERVER_ONLY' using errcode='42501';
  end if;
  select * into r from public.media_factcheck_reports where id=new.report_id;
  select owner_id into owner from public.projects where id=new.project_id;
  if r.id is null or owner is null or new.decided_by is distinct from owner
    or r.project_id is distinct from new.project_id
    or r.script_id is distinct from new.script_id
    or r.script_version is distinct from new.script_version
    or r.revision_id is distinct from new.revision_id
    or r.content_sha256 is distinct from new.content_sha256
    or r.source_set_sha256 is null
    or r.source_set_sha256 is distinct from new.source_set_sha256
    or r.writer_model = r.reviewer_model
    or new.decided_at < r.recorded_at
    or new.decided_at > r.reviewed_at + interval '48 hours'
    or new.decided_at > clock_timestamp()+interval '5 minutes'
  then raise exception 'FACTCHECK_EDITOR_EVIDENCE_MISMATCH' using errcode='23514';end if;
  select * into s from public.media_scripts
    where id=new.script_id and project_id=new.project_id for share;
  if s.id is null or s.version is distinct from r.script_version
    or new.revision_id is distinct from ('v'||s.version::text)
    or coalesce(s.hook,'') is distinct from r.manuscript_snapshot->>'hook'
    or coalesce(s.script,'') is distinct from r.manuscript_snapshot->>'script'
    or coalesce(s.captions,'[]'::jsonb) is distinct from r.manuscript_snapshot->'captions'
    or coalesce(s.cta,'') is distinct from r.manuscript_snapshot->>'cta'
  then raise exception 'FACTCHECK_EDITOR_SCRIPT_CHANGED' using errcode='23514';end if;
  if new.decision='approve' then
    if length(btrim(new.notes))<30
      or not public.media_factcheck_editorial_evidence_complete(r.source_receipts,r.findings)
      or (
        r.outcome='ready_for_editor'
        and r.framing is distinct from 'faithful_to_evidence'
      )
      or not (
        r.outcome='ready_for_editor'
        or (
          r.outcome='requires_review'
          and r.reasons=array['sensitive_or_unclassified']::text[]
          and r.framing='faithful_to_evidence'
          and new.sensitive_risk_acknowledged
          and length(btrim(new.notes))>=50
          and jsonb_array_length(r.source_receipts)>=2
          and jsonb_array_length(r.findings)>=2
          and not exists(
            select 1 from jsonb_array_elements(r.findings) f
            where f->>'verdict' is distinct from 'supported'
          )
        )
      )
    then raise exception 'FACTCHECK_EDITOR_APPROVAL_NOT_SUPPORTED'
      using errcode='23514';end if;
  end if;
  return new;
end $fn$;

create trigger media_factcheck_editorial_insert_guard
  before insert on public.media_factcheck_editorial_decisions
  for each row execute function public.media_factcheck_editorial_insert_guard();
create trigger media_factcheck_editorial_append_only
  before update or delete on public.media_factcheck_editorial_decisions
  for each row execute function public.media_factcheck_report_append_only();
create trigger media_factcheck_editorial_no_truncate
  before truncate on public.media_factcheck_editorial_decisions
  for each statement execute function public.media_factcheck_report_append_only();
revoke all on function public.media_factcheck_editorial_insert_guard()
  from public,anon,authenticated;
comment on table public.media_factcheck_editorial_decisions is
  'Append-only owner-origin preproduction editorial decision bound to one FactCheck report. Never authorizes publication itself.';
