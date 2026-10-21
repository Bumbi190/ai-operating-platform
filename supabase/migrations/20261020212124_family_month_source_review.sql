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


-- Serialize candidate creation and owner decisions for the SAME project/month.
-- A decision may be inserted only for the latest currently committed
-- candidate, with the exact source checksum and the canonical owner.
-- This closes the race between SELECT latest and INSERT decision in the
-- server, without changing the existing authorization or release gates.
--
-- These are ordinary invoker trigger functions with no elevated privileges,
-- client RPC, table UPDATE/DELETE, external provider or publication access.
create function public.family_month_source_candidate_insert_gate()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $family_gate$
begin
 perform pg_advisory_xact_lock(hashtextextended(
   new.project_id::text || '|' || new.source_month, 0));
 -- Lock acquisition, not client timestamp or transaction BEGIN,
 -- defines review-version order for concurrent sessions.
 new.created_at := clock_timestamp();
 if not exists (
  select 1 from public.projects p
  where p.id = new.project_id
    and p.slug = 'familje-stunden'
    and p.owner_id = new.created_by
 ) then
  raise exception 'SOURCE_OWNER_MISMATCH' using errcode = '23514';
 end if;
 return new;
end
$family_gate$;

create trigger family_month_source_candidate_insert_gate_trigger
before insert on public.family_month_source_candidates
for each row execute function public.family_month_source_candidate_insert_gate();

create function public.family_month_source_decision_insert_gate()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $family_gate$
declare
 v_source_month text;
 candidate_owner uuid;
 candidate_digest text;
 latest_id uuid;
begin
 -- Only read the month here to obtain the correct per-month lock key;
 -- re-read all authoritative state AFTER the lock is acquired.
 select c.source_month into v_source_month
 from public.family_month_source_candidates c
 where c.id = new.candidate_id
   and c.project_id = new.project_id;

 if v_source_month is null then
  raise exception 'SOURCE_CANDIDATE_NOT_FOUND' using errcode = '23514';
 end if;

 perform pg_advisory_xact_lock(hashtextextended(
   new.project_id::text || '|' || v_source_month, 0));

 select c.created_by, c.candidate_sha256
 into candidate_owner, candidate_digest
 from public.family_month_source_candidates c
 where c.id = new.candidate_id
   and c.project_id = new.project_id
   and c.source_month = v_source_month;

 select c.id into latest_id
 from public.family_month_source_candidates c
 where c.project_id = new.project_id
   and c.source_month = v_source_month
 order by c.created_at desc, c.id desc limit 1;

 if candidate_owner is null
   or latest_id is distinct from new.candidate_id
   or candidate_digest is distinct from new.candidate_sha256
   or candidate_owner is distinct from new.decided_by
   or not exists (
     select 1 from public.projects p
     where p.id = new.project_id
       and p.slug = 'familje-stunden'
       and p.owner_id = new.decided_by
   )
 then
  raise exception 'SOURCE_OWNER_OR_LATEST_VERSION_MISMATCH'
    using errcode = '23514';
 end if;

 new.decided_at := clock_timestamp();
 return new;
end
$family_gate$;

create trigger family_month_source_decision_insert_gate_trigger
before insert on public.family_month_source_decisions
for each row execute function public.family_month_source_decision_insert_gate();

revoke all on function public.family_month_source_candidate_insert_gate() from public, anon, authenticated;
revoke all on function public.family_month_source_decision_insert_gate() from public, anon, authenticated;
grant execute on function public.family_month_source_candidate_insert_gate() to service_role;
grant execute on function public.family_month_source_decision_insert_gate() to service_role;
