-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Executive Mission Brief V1 — append-only mission history
--   ─────────────────────────────────────────────────────────
--   EI-S1.4B. Implements the FM.2 Stage 1 requirement "Executive Mission Brief
--   V1" as the canonical Chapter 20 mission record.
--
--   "A Mission Brief is more than a prompt. It is a structured contract."
--   (§20.3)
--
--   Each row is one immutable act in a mission's lineage. Current status is
--   DERIVED from the lineage in application code and is never stored as a
--   mutable column. §20.98 names sixteen statuses; four of them
--   (Awaiting Approval, Ready, At Risk, Awaiting Review) are predicates over the
--   lineage, the clock and live authority, so no column could hold them
--   honestly and none tries.
--
--   WHY A DEDICATED TABLE:
--     • atlas_intelligence is EI reasoning — every row carries a NOT NULL
--       confidence, its supersession is set by UPDATE, and its project_id is
--       ON DELETE SET NULL. A mission carries authority, forbidden actions and
--       approval gates; storing that in a confidence-weighted, mutable,
--       scope-nullable cognitive store would be a security regression.
--     • manager_tasks is operational coordination with a nullable project and a
--       mutable status. §3.5 — "Manager coordinates work AFTER Executive
--       Intelligence or an authorized actor has defined the mission."
--     • atlas_decision_ledger records institutional decisions. §20.7 — "A
--       decision authorizes direction. A Mission Brief operationalizes that
--       direction." The mission REFERENCES a decision; it never duplicates or
--       mutates one, and the Decision Ledger schema is untouched by this
--       migration.
--     • atlas_authorizations records scoped human authority. The mission
--       references an authorization; it does not duplicate it (§20.54).
--
--   MISSION AUTHORITY IS AN OPERATIONAL GATE, NOT A HISTORICAL FACT. This is
--   the deliberate difference from the Decision Ledger. A decision's approval
--   is past tense and stands forever (§11.180). §20.75 makes mission approval
--   EXPIRE when the object changes materially, scope expands, risk changes, the
--   deadline passes or the project mode changes — so a mission's readiness is
--   re-evaluated against live Authorization V1 state on every read, and a
--   material amendment returns the mission to `proposed` until it earns fresh,
--   exact authority. The row below records what was proven when the act
--   happened; it never asserts that the mission is still authorized now.
--
--   IMMUTABILITY IS ENFORCED IN THE DATABASE. §20.128 — "Manager or Workforce
--   must not silently rewrite the mission." The reject triggers below make
--   UPDATE and DELETE impossible on this table, so a mission cannot be mutated
--   even by a service-role caller. A material change is a new version
--   (§20.126/§20.127), never an edit.
--
--   NOTHING HERE EXECUTES ANYTHING. `budget` is a §20.52 spend BOUNDARY, not a
--   spending capability; `allowed_actions` and `tools` are §20.56/§20.58
--   declarative upper bounds that authorize no tool call. FM.2 excludes
--   autonomous spending and the Damage Boundary engine, so `risks` is recorded
--   for the human who approves and is evaluated by nothing.
--
--   ⚠️  THIS MIGRATION IS DELIBERATELY UNAPPLIED. EI-S1.4B is authorized to
--   create and commit it, and explicitly NOT authorized to apply it to any
--   remote database. It sits in the canonical guarded directory, so
--   apps/web/scripts/check-migrations.mjs will correctly fail a Vercel build
--   until a separately authorized rollout applies it — deployment blocked by
--   design. That failure must not be bypassed, grandfathered, or dodged by
--   moving this file to the legacy repo-root directory.
--   Derived ledger name: `atlas_mission_ledger`.
--
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.atlas_mission_ledger (
  -- Identity of one immutable act.
  record_id           uuid primary key default gen_random_uuid(),

  -- §20.25 — stable mission identity. "The identifier should not change when
  -- the mission is updated. Versions belong to the same lineage."
  mission_id          uuid not null,

  --   drafted | proposed | approved | activated | amended
  --   paused | resumed | completed | partially_completed
  --   failed | cancelled | superseded | archived
  --   progress_reported | blocker_raised | blocker_cleared
  --   evidence_recorded | reviewed
  record_type         text not null
    constraint atlas_mission_ledger_record_type_check check (record_type in (
      'drafted', 'proposed', 'approved', 'activated', 'amended',
      'paused', 'resumed', 'completed', 'partially_completed',
      'failed', 'cancelled', 'superseded', 'archived',
      'progress_reported', 'blocker_raised', 'blocker_cleared',
      'evidence_recorded', 'reviewed'
    )),
  occurred_at         timestamptz not null default now(),

  -- §20.27/§20.244 — "Every mission must have explicit project scope."
  -- §20.28 makes cross-project missions exceptional and dependent on Portfolio
  -- authority, which Stage 1 does not fund, so scope is NOT NULL by design and
  -- RESTRICT keeps a project with mission history from being deleted out from
  -- under it.
  project_id          uuid not null references public.projects(id) on delete restrict,

  -- The human who performed the act, from the authenticated session.
  principal_id        uuid not null,

  -- ── §20.244 material mission content ────────────────────────────────────────
  -- §20.26/§20.11 — identity and classification. A mission type is a
  -- classification and never a capability: `autonomy` grants exactly as much
  -- authority as `learning`, namely none (§20.55).
  title               text not null,
  mission_type        text not null
    constraint atlas_mission_ledger_mission_type_check check (mission_type in (
      'strategic', 'build', 'investigation', 'validation', 'growth',
      'stabilization', 'risk_reduction', 'recovery', 'learning',
      'operational', 'governance', 'autonomy'
    )),

  -- §20.29/§20.30 — the Executive accountable for the mission existing, and the
  -- one accountable owner for delivering the outcome.
  executive_owner     text not null,
  mission_owner       text,

  -- §20.31 — what the mission is intended to achieve.
  objective           text not null,
  -- §20.32/§20.33 — context, minimized to what the mission needs.
  strategic_context   text,
  -- §20.34/§20.35 — what was promised.
  expected_outcome    text,
  deliverables        jsonb not null default '[]',
  -- §20.36–§20.41 — how completion is judged, at minimum/target/stretch.
  success_criteria    jsonb not null default '[]',

  -- §20.42/§20.43 — scope, and the exclusions that bound it.
  in_scope            jsonb not null default '[]',
  out_of_scope        jsonb not null default '[]',
  -- §20.46–§20.51 — technical, product, governance, capacity and time limits.
  constraints         jsonb not null default '[]',

  -- §20.52 — the spend BOUNDARY. Minor units only, so no float represents
  -- money. This records what the mission may not exceed; it authorizes no
  -- payment, invoice or purchase, and nothing in Stage 1 reads it as a
  -- capability.
  budget              jsonb,

  -- §20.53/§20.54 — what the mission may decide or change, and why it holds
  -- that authority. §20.137 is permissive, so `decision_ref` is present only
  -- when a Decision Ledger decision actually IS the source.
  authority           jsonb not null default '[]',
  authority_source    jsonb,

  -- §20.56/§20.57 — explicit action envelope. §20.55: "A mission should not
  -- imply authority from vague wording." These are structured so no gate ever
  -- parses prose to decide what is permitted.
  allowed_actions     jsonb not null default '[]',
  forbidden_actions   jsonb not null default '[]',

  -- §20.58–§20.61 — tools and the minimum necessary data. Declarative upper
  -- bounds: a later handoff must be a SUBSET of these (§6.39), never a superset.
  tools               jsonb not null default '[]',
  data_scope          jsonb not null default '[]',

  -- §20.62–§20.67 — what the mission waits on and what it assumes.
  dependencies        jsonb not null default '[]',
  assumptions         jsonb not null default '[]',
  -- §20.68/§20.69 — risks and their controls. DECLARATIVE ONLY. FM.2 excludes
  -- the Damage Boundary engine, so nothing scores, evaluates or enforces these;
  -- they record what the approving human was shown.
  risks               jsonb not null default '[]',

  -- §20.71–§20.73 — where execution must pause for a human.
  approval_gates      jsonb not null default '[]',
  -- §20.122 — when the mission is due.
  deadline            timestamptz,
  -- §20.76–§20.79 — reporting obligations, including §20.77 quiet execution.
  reporting           jsonb not null default '[]',
  -- §20.84/§20.85 — when to escalate, and to whom.
  escalation_triggers jsonb not null default '[]',
  -- §20.88/§20.89 — when execution must cease, and when it may merely wait.
  stop_conditions     jsonb not null default '[]',
  pause_conditions    jsonb not null default '[]',
  -- §20.92/§20.80 — how completion is judged and what proves it.
  completion_conditions jsonb not null default '[]',
  evidence_requirements jsonb not null default '[]',

  -- §20.127 — version within the lineage; identity stays stable (§20.25).
  version             integer not null default 1
    constraint atlas_mission_ledger_version_check check (version >= 1),

  -- ── Act-specific payloads ───────────────────────────────────────────────────
  -- §20.53/§20.54 — the authority behind THIS act, proven at the moment it
  -- occurred and pinned immutably: the Authorization V1 reference, the principal
  -- that authorization itself carried, which act it proved (mission.approve |
  -- activate | amend | cancel | supersede), the hash of the exact material
  -- mission version it was bound to, and when.
  --
  -- Recording it does NOT assert the mission is still authorized. §20.75 makes
  -- mission approval expire on material change, so operational readiness is
  -- re-derived against live Authorization V1 state on every read.
  authority_record    jsonb,

  -- §20.137 — the governing Decision Ledger decision, when one is the authority
  -- source. Pinned with its version and observed state so the record explains
  -- itself. No FK: the ledger's decision_id is a lineage key, not unique, and
  -- this migration does not touch that table.
  decision_ref        jsonb,

  -- §20.78 — a progress report. §20.103 — an explicit blocker, and the act that
  -- clears it (§20.87 forbids leaving one silent). §20.80/§20.81 — evidence.
  -- §20.196 — the closure record. §20.195 — a completion review note.
  report              jsonb,
  blocker             jsonb,
  clears_blocker_id   text,
  evidence            jsonb,
  closure             jsonb,
  review_note         text,

  -- §20.97 — explicit "superseded by Mission X".
  superseded_by       uuid,
  -- §20.126/§20.129 — why: amendment, pause, failure, cancellation.
  reason              text,

  -- Which lifecycle generation this act belongs to: the number of
  -- LIFECYCLE-ADVANCING records that preceded it. Not total rows — a progress
  -- report, blocker, evidence record or review never consumes a generation.
  -- Serves optimistic concurrency (the index below) and canonical ordering.
  -- Not mission content, and deliberately not part of the authority binding.
  lifecycle_generation integer not null default 0
    constraint atlas_mission_ledger_lifecycle_generation_check check (lifecycle_generation >= 0),

  created_at          timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary read: the ordered lineage of one mission (§20.152 traceability). The
-- generation column is part of the key because it is the pure core's tiebreak
-- for acts stamped in the same millisecond — record ids are random UUIDs, so
-- ordering by id alone would fold a same-millisecond proposal/approval pair the
-- wrong way about half the time.
create index if not exists atlas_mission_ledger_lineage_idx
  on public.atlas_mission_ledger (mission_id, occurred_at, lifecycle_generation, record_id);

-- Project audit listing.
create index if not exists atlas_mission_ledger_project_idx
  on public.atlas_mission_ledger (project_id, occurred_at desc);

-- Approval/review queue lookup for open missions.
create index if not exists atlas_mission_ledger_type_idx
  on public.atlas_mission_ledger (project_id, record_type, occurred_at desc);

-- ── Lifecycle serialization ───────────────────────────────────────────────────
-- The write boundary validates every prospective lineage through the pure core
-- BEFORE it appends, so a semantically invalid transition never reaches this
-- table. What pure validation cannot do is serialize two writers who each read
-- the same state and each produce an individually valid candidate: an approval
-- and a cancellation, two amendments of the same version, a completion and a
-- supersession. Appended together those form a history the pure core would then
-- refuse to read — and on an append-only table that is permanent.
--
-- ONE optimistic-concurrency invariant covers every such family: any two
-- lifecycle acts derived from the same LIFECYCLE GENERATION collide. The loser
-- gets a unique violation (23505), which the write boundary surfaces as
-- `conflict`, and no row is written.
--
-- THE GENERATION COUNTS LIFECYCLE ACTS, NOT ROWS. Counting rows was the
-- EI-S1.3B-R3 defect: a reviewer appending a note between two writers' reads
-- gave them different keys, so two incompatible closing acts both passed the
-- index. The listed types below are exactly `MISSION_LIFECYCLE_ADVANCING` in
-- lib/atlas/mission/derive.ts, and a test compares the two so they cannot drift.
--
-- Annotations (`progress_reported`, `blocker_raised`, `blocker_cleared`,
-- `evidence_recorded`, `reviewed`) are excluded and consume no generation: they
-- record something ABOUT a mission without moving it (§20.78, §20.103, §20.80,
-- §20.195). Serializing them would produce false `conflict` results for a report
-- filed alongside a lifecycle act, and would make no history safer.
--
-- Narrowly scoped: no distributed transaction machinery, no generic
-- event-sourcing framework, no advisory locks.
create unique index if not exists atlas_mission_ledger_one_advance_idx
  on public.atlas_mission_ledger (mission_id, lifecycle_generation)
  where record_type in (
    'drafted', 'proposed', 'approved', 'activated', 'amended',
    'paused', 'resumed', 'completed', 'partially_completed',
    'failed', 'cancelled', 'superseded', 'archived'
  );

-- ── Append-only enforcement (§20.127, §20.128) ────────────────────────────────
-- History is immutable. A material amendment appends a new version with
-- explicit provenance and reason; it never edits what was recorded before.
-- §20.128: "Manager or Workforce must not silently rewrite the mission."

create or replace function public.atlas_mission_ledger_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'atlas_mission_ledger is append-only: % is not permitted on mission history', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists atlas_mission_ledger_no_update on public.atlas_mission_ledger;
create trigger atlas_mission_ledger_no_update
  before update on public.atlas_mission_ledger
  for each row execute function public.atlas_mission_ledger_reject_mutation();

drop trigger if exists atlas_mission_ledger_no_delete on public.atlas_mission_ledger;
create trigger atlas_mission_ledger_no_delete
  before delete on public.atlas_mission_ledger
  for each row execute function public.atlas_mission_ledger_reject_mutation();

-- ── Row-level security ────────────────────────────────────────────────────────
-- Service-role only, matching atlas_authorizations and atlas_decision_ledger.
-- User access is mediated by the server-side principal-scoped boundary in
-- lib/atlas/mission/, which proves project ownership from the lineage's own
-- recorded scope before returning anything (§6.117 project isolation).

alter table public.atlas_mission_ledger enable row level security;
revoke all on public.atlas_mission_ledger from anon, authenticated;

comment on table public.atlas_mission_ledger is
  'Executive Mission Brief V1 — append-only mission history. '
  'One row per immutable act in a mission lineage; status is derived, never stored. '
  'References atlas_authorizations for authority and atlas_decision_ledger for direction; duplicates neither. '
  'Mission authority is an operational gate (Ch20 s20.75), unlike the Decision Ledger''s historical approval. '
  'Service-role only; UPDATE and DELETE are rejected by trigger. '
  'See docs/architecture/executive-intelligence/ and canonical Ch 20.';
