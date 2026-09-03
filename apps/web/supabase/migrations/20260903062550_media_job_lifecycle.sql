-- ─────────────────────────────────────────────────────────────────────────────
--  MEDIA RUNTIME PHASE 4 — media_job_lifecycle
--
--  Durable persistence for the Phase 3 Media Job lifecycle (lib/media/job/*).
--
--  WHY THIS TABLE EXISTS AND public.runs DOES NOT SERVE IT:
--   1. `runs_action_binding_complete` is ALL-OR-NOTHING: the ambiguity guard
--      needs workflow_instance_id, workflow_def_hash, workflow_from_state,
--      action_kind, action_class, target_version_hash, authorization_id,
--      idempotency_key, attempt_group AND authorized_at, all non-null. An
--      article hero image has none; supplying them forges a human authorization.
--   2. Without them the guards DO NOT APPLY: `runs_action_outcome_guard` returns
--      early for a null workflow_instance_id ("legacy run, untouched"), and
--      `reconciliation_binding_guard` REFUSES such a row outright.
--   3. `reap_stuck_runs()` branch (b) REQUEUES an expired running row — for a
--      dispatched generation, a second paid call.
--
--  What IS reused, unchanged, is the ambiguity VOCABULARY
--  (lib/workflows/action-outcome.ts) and the reconciliation-ledger SHAPE.
--  The reasoning, not the machinery.
--
--  ADDITIVE ONLY. No existing table is altered. No backfill. No data touched.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The job ───────────────────────────────────────────────────────────────

create table if not exists public.media_jobs (
  -- Minted by OMNIRA, before any network call (`newMediaJobId()`), so there is
  -- deliberately NO default: a job whose id the database invented would be a job
  -- the dispatching process could not name if the insert's response were lost.
  id                      uuid primary key,
  project_id              uuid not null references public.projects(id) on delete cascade,
  provider                text not null,
  model                   text not null,

  state                   text not null default 'PENDING_DISPATCH',

  -- The vendor's own handle. Opaque, echoed, never parsed, never routed on.
  -- Null until the vendor names the operation — which for a lost dispatch never
  -- happens, and that null IS the unreconcilable case.
  remote_operation_id     text,

  -- WHAT THE DISPATCH FAILURE PROVED (lib/workflows/action-outcome.ts vocab).
  -- `state` alone is too coarse for the operator's decision:
  --   FAILED  + not_dispatched            → nothing sent, nothing billed
  --   FAILED  + remote_rejected           → vendor answered no, did no work
  --   UNKNOWN + response_lost             → may or may not exist
  --   UNKNOWN + confirmed_evidence_failed → vendor answered 2xx: it almost
  --                                         certainly EXISTS and was billed
  dispatch_observation    text,

  simulated               boolean not null default false,
  -- ONLY the hash. A brief may carry third-party editorial text; Phase 1 already
  -- decided payloads are hashed rather than stored. Deliberately NOT unique:
  -- generating the same brief twice is legitimate.
  brief_hash              text not null,

  -- Null for the job's whole life until admission succeeds. NOT cascade: an
  -- asset being deleted must not delete the evidence that money was spent.
  asset_id                uuid references public.assets(id) on delete set null,

  last_failure_code       text,
  last_failure_detail     text,
  reconciliation_required boolean not null default false,

  created_at              timestamptz not null default now(),
  dispatch_started_at     timestamptz,
  remote_confirmed_at     timestamptz,
  terminal_at             timestamptz,

  -- Compare-and-set guard. Serverless functions share no memory, so this is the
  -- ONLY coordination primitive available: at most one terminal transition wins,
  -- over potentially at-least-once observations.
  version                 integer not null default 1
);

-- ── 2. The reconciliation ledger ────────────────────────────────────────────
--
-- The ONE append-only table Phase 3 needs, and deliberately not a general
-- transition/event log. A repeated reconciliation produces DISTINCT facts —
-- "we asked three times and still cannot tell" differs from "we have not asked"
-- — and a mutable column would lose that. Polling flips (QUEUED→RUNNING) produce
-- no such fact and are not logged.
--
-- Created BEFORE the job guard, because that guard reads this table.

create table if not exists public.media_job_reconciliations (
  id                  uuid primary key default gen_random_uuid(),
  media_job_id        uuid not null references public.media_jobs(id) on delete cascade,
  project_id          uuid not null references public.projects(id) on delete cascade,
  provider            text not null,
  remote_operation_id text,
  result              text not null check (result in
    ('CONFIRMED_SUCCEEDED','CONFIRMED_FAILED','CONFIRMED_RUNNING',
     'CONFIRMED_NOT_CREATED','STILL_UNKNOWN')),
  -- Why an answer could not be reached. `no_remote_identity` is the honest
  -- record of MuAPI's limit: no correlation lookup, no history endpoint.
  blocker             text check (blocker is null or blocker in
    ('no_remote_identity','provider_cannot_reconcile','lookup_failed')),
  -- Structured and safe BY CONTRACT: ids, counts, states. Never a raw provider
  -- response — that is how credentials and third-party text reach an audit table.
  detail              jsonb not null default '{}'::jsonb,
  observed_at         timestamptz not null,
  created_at          timestamptz not null default now()
);

-- ── 3. Constraints on media_jobs ────────────────────────────────────────────

alter table public.media_jobs drop constraint if exists media_jobs_state_vocabulary;
alter table public.media_jobs add constraint media_jobs_state_vocabulary check (
  state in ('PENDING_DISPATCH','DISPATCHING','QUEUED','RUNNING','SUCCEEDED','FAILED','UNKNOWN')
);

alter table public.media_jobs drop constraint if exists media_jobs_dispatch_observation_vocabulary;
alter table public.media_jobs add constraint media_jobs_dispatch_observation_vocabulary check (
  dispatch_observation is null or dispatch_observation in
    ('not_dispatched','remote_rejected','response_lost','remote_confirmed',
     'partially_applied','confirmed_evidence_failed')
);

-- Ambiguity ALWAYS demands a human. Not a convention a caller can forget.
alter table public.media_jobs drop constraint if exists media_jobs_ambiguous_requires_reconciliation;
alter table public.media_jobs add constraint media_jobs_ambiguous_requires_reconciliation check (
  state <> 'UNKNOWN' or reconciliation_required = true
);

-- A job past the boundary must record WHEN it crossed.
alter table public.media_jobs drop constraint if exists media_jobs_dispatch_timestamp_present;
alter table public.media_jobs add constraint media_jobs_dispatch_timestamp_present check (
  state = 'PENDING_DISPATCH' or dispatch_started_at is not null
);

alter table public.media_jobs drop constraint if exists media_jobs_terminal_timestamp_present;
alter table public.media_jobs add constraint media_jobs_terminal_timestamp_present check (
  state not in ('SUCCEEDED','FAILED','UNKNOWN') or terminal_at is not null
);

-- An asset may only be bound by a job the provider actually completed.
-- Deliberately NOT the converse: SUCCEEDED **without** an asset is legal and is
-- the load-bearing representation of "the provider produced bytes and admission
-- failed". Requiring an asset here would make that state unrepresentable and
-- force the code to report FAILED, losing the fact that the bytes exist.
alter table public.media_jobs drop constraint if exists media_jobs_asset_requires_success;
alter table public.media_jobs add constraint media_jobs_asset_requires_success check (
  asset_id is null or state = 'SUCCEEDED'
);

-- Shape bound on the vendor id: a DoS bound and a path-safety bound, not a
-- format claim. Mirrors `acceptRemoteOperationId` exactly. `/` and `..` cannot
-- appear, so a vendor answer can never steer the status URL the adapter builds.
alter table public.media_jobs drop constraint if exists media_jobs_remote_id_shape;
alter table public.media_jobs add constraint media_jobs_remote_id_shape check (
  remote_operation_id is null
  or (remote_operation_id ~ '^[A-Za-z0-9._:-]+$' and length(remote_operation_id) <= 200)
);

alter table public.media_jobs drop constraint if exists media_jobs_brief_hash_sha256;
alter table public.media_jobs add constraint media_jobs_brief_hash_sha256 check (
  brief_hash ~ '^[0-9a-f]{64}$'
);

-- Bounded because these reach logs, audit rows and error messages.
alter table public.media_jobs drop constraint if exists media_jobs_identifier_lengths;
alter table public.media_jobs add constraint media_jobs_identifier_lengths check (
  length(provider) between 1 and 64 and length(model) between 1 and 200
);

-- An inconclusive answer must carry its blocker; a conclusive one must not
-- pretend to have been blocked.
alter table public.media_job_reconciliations
  drop constraint if exists media_job_reconciliations_blocker_agrees;
alter table public.media_job_reconciliations
  add constraint media_job_reconciliations_blocker_agrees check (
    (result = 'STILL_UNKNOWN' and blocker is not null)
    or (result <> 'STILL_UNKNOWN' and blocker is null)
  );

-- ── 4. Indexes — one query each, none speculative ───────────────────────────

-- `listUnresolved(projectIds)` — the operator's queue, oldest first.
create index if not exists media_jobs_unresolved_idx
  on public.media_jobs (project_id, created_at)
  where reconciliation_required = true;

-- Serves BOTH the reconciliation lookup by vendor id AND the invariant that one
-- remote operation belongs to at most one local job: two jobs claiming one paid
-- generation is a bug that must surface, not deduplicate silently.
create unique index if not exists media_jobs_remote_operation_uniq
  on public.media_jobs (provider, remote_operation_id)
  where remote_operation_id is not null;

-- At most one job per asset. The other half of the same invariant.
create unique index if not exists media_jobs_asset_uniq
  on public.media_jobs (asset_id) where asset_id is not null;

-- The guard's evidence count, and "how many times have we asked".
create index if not exists media_job_reconciliations_job_idx
  on public.media_job_reconciliations (media_job_id, created_at desc);

-- NOT created: an index for "jobs awaiting polling" or "stale jobs". No store
-- port method queries for them, so it would be speculative. It belongs with the
-- resumption worker that would need it.

-- ── 5. The state guard ──────────────────────────────────────────────────────
--
-- SMALLEST SUFFICIENT MECHANISM. CHECK constraints cannot see OLD, so the five
-- rules below are exactly the ones that need a trigger, and each is load-bearing:
--   • version must advance, or a "compare-and-set" writing the same version lets
--     the next reader double-write;
--   • no rewind past the boundary: PENDING_DISPATCH is the only state in which
--     redispatch is safe;
--   • terminal is absorbing, and UNKNOWN exits only on recorded evidence;
--   • remote_operation_id and asset_id are write-once.
--
-- Same size and shape as `runs_action_outcome_guard` (PR9d), which made the
-- identical call for the identical reason: the application is one caller; the
-- database is the invariant. Legal FORWARD movement is unconstrained here.

create or replace function public.media_job_state_rank(s text)
returns int language sql immutable set search_path to '' as $$
  select case s
    when 'PENDING_DISPATCH' then 0 when 'DISPATCHING' then 1
    when 'QUEUED' then 2 when 'RUNNING' then 3
    when 'SUCCEEDED' then 4 when 'FAILED' then 4 when 'UNKNOWN' then 4
    else -1 end;
$$;

create or replace function public.media_jobs_guard()
returns trigger language plpgsql security definer set search_path to '' as $$
declare confirmed int;
begin
  if new.version <> old.version + 1 then
    raise exception 'media_jobs: every update must advance version (% -> %)',
      old.version, new.version using errcode = 'restrict_violation';
  end if;

  if public.media_job_state_rank(old.state) >= 1
     and public.media_job_state_rank(new.state) < 1 then
    raise exception 'media_jobs: cannot rewind to % after dispatch began (job %)',
      new.state, new.id using errcode = 'restrict_violation';
  end if;

  if old.state <> new.state and public.media_job_state_rank(old.state) = 4 then
    if old.state = 'UNKNOWN' and new.state in ('SUCCEEDED','FAILED','RUNNING','QUEUED') then
      -- The ONLY exit from UNKNOWN, and it needs recorded evidence — never a
      -- caller's assertion that it probably worked. The ledger row must be
      -- inserted in the SAME transaction, before this UPDATE.
      select count(*) into confirmed
        from public.media_job_reconciliations r
       where r.media_job_id = new.id and r.result <> 'STILL_UNKNOWN';
      if confirmed = 0 then
        raise exception
          'media_jobs: UNKNOWN may only be resolved by a recorded reconciliation (job %)',
          new.id using errcode = 'restrict_violation';
      end if;
    else
      raise exception 'media_jobs: illegal state transition % -> % (job %)',
        old.state, new.state, new.id using errcode = 'restrict_violation';
    end if;
  end if;

  -- Write-once. A later observation naming a DIFFERENT operation describes a job
  -- this row is not about, and adopting it would rebind a paid generation.
  if old.remote_operation_id is not null
     and new.remote_operation_id is distinct from old.remote_operation_id then
    raise exception 'media_jobs: remote_operation_id is write-once (job %)', new.id
      using errcode = 'restrict_violation';
  end if;

  if old.asset_id is not null and new.asset_id is distinct from old.asset_id then
    raise exception 'media_jobs: asset binding is write-once (job %)', new.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end $$;

drop trigger if exists media_jobs_guard_trg on public.media_jobs;
create trigger media_jobs_guard_trg
  before update on public.media_jobs
  for each row execute function public.media_jobs_guard();

-- ── 6. Ledger immutability + binding ────────────────────────────────────────

create or replace function public.reject_media_reconciliation_mutation()
returns trigger language plpgsql set search_path to '' as $$
begin
  raise exception 'media_job_reconciliations is append-only (attempted %)', tg_op
    using errcode = 'restrict_violation';
end $$;

drop trigger if exists media_job_reconciliations_immutable on public.media_job_reconciliations;
create trigger media_job_reconciliations_immutable
  before update or delete on public.media_job_reconciliations
  for each row execute function public.reject_media_reconciliation_mutation();

-- A reconciliation must be ABOUT the job it claims to be about, and about the
-- SAME project — otherwise a row naming the wrong job could clear an unrelated
-- ambiguity, and a cross-project row could resolve someone else's incident.
create or replace function public.media_reconciliation_binding_guard()
returns trigger language plpgsql security definer set search_path to '' as $$
declare j public.media_jobs;
begin
  select * into j from public.media_jobs where id = new.media_job_id;
  if not found then
    raise exception 'reconciliation: media job % does not exist', new.media_job_id
      using errcode = 'foreign_key_violation';
  end if;
  if new.project_id is distinct from j.project_id
     or new.provider is distinct from j.provider
     or new.remote_operation_id is distinct from j.remote_operation_id then
    raise exception 'reconciliation: identity does not match media job % (project/provider/operation)',
      new.media_job_id using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

drop trigger if exists media_job_reconciliations_binding on public.media_job_reconciliations;
create trigger media_job_reconciliations_binding
  before insert on public.media_job_reconciliations
  for each row execute function public.media_reconciliation_binding_guard();

-- ── 7. RLS ──────────────────────────────────────────────────────────────────
--
-- Reuses the EXISTING convention verbatim. The repository has no project-access
-- helper function — every project-scoped policy (`assets_owner`,
-- `asset_provenance_owner`) inlines this same subquery — so inlining it here is
-- reuse; a helper would be the second authorization framework to avoid.

alter table public.media_jobs                enable row level security;
alter table public.media_job_reconciliations enable row level security;

-- `for select`, NOT `for all` — the one deliberate departure from the Phase 1
-- policies this otherwise mirrors. `assets_owner` is `for all` because a user
-- legitimately manages their own assets. A media job is different: its state is
-- derived from what a PROVIDER said, and an owner who could UPDATE one could
-- move a job out of UNKNOWN by hand, clearing an unresolved financial ambiguity
-- with no reconciliation — exactly what the guard above exists to prevent.
--
-- No insert/update/delete policy is created, so RLS denies every non-service
-- write by default. All lifecycle writes are service_role (which has BYPASSRLS).
drop policy if exists "media_jobs_owner_read" on public.media_jobs;
create policy "media_jobs_owner_read" on public.media_jobs
  for select using (
    project_id in (select id from public.projects where owner_id = auth.uid())
  );

drop policy if exists "media_job_reconciliations_owner_read" on public.media_job_reconciliations;
create policy "media_job_reconciliations_owner_read" on public.media_job_reconciliations
  for select using (
    project_id in (select id from public.projects where owner_id = auth.uid())
  );

-- ── 8. Retention ────────────────────────────────────────────────────────────
--
-- DELIBERATELY NO AUTOMATIC DELETION and no cleanup job. An unresolved UNKNOWN
-- is a financial fact about money that may have been spent; a retention sweep
-- would erase the only evidence an operator has. Rows carry hashes, not
-- payloads, so volume is not a pressure worth that trade.
--
-- Project deletion cascades: jobs and reconciliations go with the project, as
-- assets already do. `cost_events` is unaffected and remains the billing record.

comment on table public.media_jobs is
  'Media Runtime Phase 4: one attempted remote generation. UNKNOWN is terminal and may only be resolved by a recorded reconciliation. Deliberately separate from public.runs, whose ambiguity guards apply only to authorized workflow actions.';

comment on column public.media_jobs.dispatch_observation is
  'What the dispatch failure PROVED (lib/workflows/action-outcome.ts vocabulary). Distinguishes an UNKNOWN that may not exist (response_lost) from one that almost certainly exists and was billed (confirmed_evidence_failed).';

comment on table public.media_job_reconciliations is
  'Append-only answers to "did media job X actually happen". A recorded, non-STILL_UNKNOWN row is the ONLY thing that may resolve an UNKNOWN job.';
