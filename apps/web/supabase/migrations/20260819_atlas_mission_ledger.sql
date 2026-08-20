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
  --   evidence_recorded | reviewed | dependency_observed | gate_resolved
  record_type         text not null
    constraint atlas_mission_ledger_record_type_check check (record_type in (
      'drafted', 'proposed', 'approved', 'activated', 'amended',
      'paused', 'resumed', 'completed', 'partially_completed',
      'failed', 'cancelled', 'superseded', 'archived',
      'progress_reported', 'blocker_raised', 'blocker_cleared',
      'evidence_recorded', 'reviewed',
      'dependency_observed', 'gate_resolved'
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
  --
  -- DEFINITION ONLY: kind, reference, hardness and owner. Whether a
  -- prerequisite has actually been met is a condition of the world (§20.101),
  -- recorded by a `dependency_observed` annotation. EI-S1.4B-R1 removed a
  -- `satisfied` flag from here: living inside the authorization-bound hash, it
  -- meant the only sanctioned way to record "the architecture plan was
  -- approved" was a material amendment plus fresh authority, conflating a
  -- prerequisite finishing with the mission changing. Replacing or removing a
  -- dependency is still material and still takes the amendment path.
  dependencies        jsonb not null default '[]',
  assumptions         jsonb not null default '[]',
  -- §20.68/§20.69 — risks and their controls. DECLARATIVE ONLY. FM.2 excludes
  -- the Damage Boundary engine, so nothing scores, evaluates or enforces these;
  -- they record what the approving human was shown.
  risks               jsonb not null default '[]',

  -- §20.71 — "Approval gates define where execution must pause." A gate is a
  -- point execution reaches, not a precondition of starting: "Before
  -- publishing" cannot be satisfied before the mission has begun. §20.244
  -- requires gates to be KNOWN before execution reaches them; §20.92 requires
  -- approvals to be RESOLVED at completion. Each gate carries a stable
  -- `gateId` that a `gate_resolved` annotation refers to, so "gate exists" can
  -- never be mistaken for "gate is satisfied" (§20.221).
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

  -- §20.137 — the MATERIAL identity of the governing decision: decision_id and
  -- decision_version. Caller-supplied, and the only part a human authorizes.
  -- No FK: the ledger's decision_id is a lineage key, not unique, and this
  -- migration does not touch that table.
  decision_ref        jsonb,

  -- SERVER-DERIVED provenance about that decision: its own recorded project,
  -- its status and version as actually read from the Decision Ledger, and when
  -- they were read.
  --
  -- EI-S1.4B-R2 split this out of `decision_ref`. A caller used to supply the
  -- project, status and timestamp and the record kept them verbatim, so a
  -- mission was approved carrying an observed status of "TOTALLY-FABRICATED"
  -- dated 1999. Institutional provenance a caller writes is not provenance.
  -- The project here is the DECISION's own scope (§6.117), verified equal to
  -- the mission's — never a caller's claim about it. Deliberately outside the
  -- authorization binding: only decision id + version are material, so a read
  -- timestamp moving between preparation and commit cannot make a grant
  -- unsatisfiable.
  decision_provenance jsonb,

  -- §20.75 — "Approval should expire if… the project mode changes." The
  -- project's `atlas_mode` (active | observer | hibernate | archived, a real
  -- Stage 1 primitive on public.projects) as it stood when this authority act
  -- occurred.
  --
  -- TWO questions are asked of it, and EI-S1.4B-R1 only asked the first:
  --   1. did the mode CHANGE since the mission was authorized? (equality)
  --   2. does the CURRENT mode permit movement toward execution at all?
  -- Equality alone let a mission approved in `observer` stay authorized
  -- forever, because nothing had changed. Omnira's own doctrine is explicit in
  -- lib/atlas/lifecycle.ts and in the atlas_mode column comment — observer is
  -- "collect and analyse, NO execution" — so `isExecutable` is reused as the
  -- sanctioned predicate. One string, two comparisons; no policy engine.
  --
  -- §20.75's remaining input, "the workflow version changes", is NOT
  -- APPLICABLE in V1: a Mission Brief binds no workflow, and inventing a
  -- workflow column to satisfy a future clause would be fake authority. It
  -- lands with EI-S1.4D.
  project_mode        text,

  -- §20.101 — a `dependency_observed` annotation: which declared dependency,
  -- whether it is now satisfied, and the evidence. A hard dependency is
  -- UNSATISFIED until observed, so an unobserved prerequisite blocks.
  --
  -- §20.63/§20.81 — a POSITIVE observation against a HARD dependency must carry
  -- non-empty evidence, because that observation is what unlocks activation.
  -- Nothing verifies the evidence and nothing pretends to; an unexplained
  -- unlock is simply not accepted. Negative observations need none: they only
  -- narrow what the mission may do.
  --
  -- Observations are VERSION-SCOPED, exactly as gate resolutions are
  -- (EI-S1.4B-R3). §20.126 makes N+1 a new operational contract: the same
  -- `reference` may now be a hard dependency where it was soft, or carry a
  -- different kind or owner, so an observation made against N says nothing
  -- about N+1. The current version starts unresolved and needs a fresh
  -- observation; old ones remain immutable audit history. Deliberately
  -- conservative, and it avoids a dependency-fingerprint scheme this stage has
  -- no reason to build.
  --
  -- Two contradictory observations for the same reference and version sharing
  -- the newest instant have no honest winner, so the derivation reports a
  -- conflict and every consumer fails closed. A random record id must never
  -- decide whether a prerequisite counts as met.
  dependency_observation jsonb,

  -- §20.73 — a `gate_resolved` annotation: which declared gate, and which of
  -- the eight canonical outcomes.
  --
  -- An ANNOTATION for lifecycle purposes (it advances no generation) and an
  -- AUTHORITY ACT for safety purposes: EI-S1.4B-R2 found any authenticated
  -- project member could satisfy a gate simply by calling the boundary, so the
  -- row now carries its own Authorization V1 proof in `authority_record`,
  -- bound to the project, mission, EXACT version, gate id, outcome, conditions
  -- and evidence. Project membership is not approval authority (§20.55), and a
  -- service role can never become the approving human.
  --
  -- Outcome classes, because a resolution row proves an act happened and not
  -- that its precondition was met:
  --   approve                   PASSING
  --   approve_with_conditions   CONDITIONALLY_UNVERIFIED — FM.2 excludes the
  --                             policy engine, so Stage 1 cannot verify the
  --                             attached conditions; it does not pass
  --   edit_and_approve          REQUIRES_MISSION_AMENDMENT — a material edit
  --                             belongs in version N+1 (§20.126), not an
  --                             annotation (§20.128)
  --   reject | defer | escalate | request_more_evidence | request_alternative
  --                             BLOCKING
  --
  -- Resolutions are VERSION-SCOPED: one made against version N does not float
  -- forward to N+1, because §20.126 makes N+1 a materially different
  -- commitment the approver never saw. This is not the Full Approval Inbox,
  -- which FM.2 excludes, and introduces no second approval-authority system.
  --
  -- `authority_record` is REQUIRED for this type by the constraint at the end
  -- of the table, even though the row consumes no lifecycle generation.
  gate_resolution     jsonb,

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

  created_at          timestamptz not null default now(),

  -- ── Authority provenance is structural ──────────────────────────────────────
  -- An authority-requiring act may not exist without a proof. The pure core is
  -- authoritative on semantic detail — which action kind, which principal,
  -- which bound version — and the sanctioned write boundary resolves
  -- Authorization V1 effectiveness live. This constraint exists so the
  -- append-only table itself cannot accept an obviously authority-less
  -- authority act, whatever writes to it.
  --
  -- `gate_resolved` is in this list even though it is NOT lifecycle-advancing:
  -- authority-bearing and lifecycle-advancing are separate dimensions (§20.73
  -- makes resolving a gate an authority act; concurrency keeps it an
  -- annotation). EI-S1.4B-R3 added it after a `gate_resolved` row with no proof
  -- at all was found to build, fold and satisfy a gate.
  --
  -- Kept deliberately structural: a NOT NULL test, not JSON policy in SQL.
  -- The list matches `MISSION_AUTHORITY_REQUIRED` in
  -- lib/atlas/mission/derive.ts, and a test compares the two.
  constraint atlas_mission_ledger_authority_required_check check (
    record_type not in (
      'approved', 'activated', 'amended', 'cancelled', 'superseded', 'gate_resolved'
    )
    or authority_record is not null
  )
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
-- `evidence_recorded`, `reviewed`, `dependency_observed`, `gate_resolved`) are
-- excluded and consume no generation: they record something ABOUT a mission
-- without moving it (§20.78, §20.103, §20.80, §20.195, §20.101, §20.73).
-- Serializing them would produce false `conflict` results for a report filed
-- alongside a lifecycle act, and would make no history safer. EI-S1.4B-R1 added
-- the last two, and they are excluded for exactly the same reason — a
-- prerequisite finishing must not stop two lifecycle writers from colliding.
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
  'Mission authority is an operational gate (Ch20 s20.75), unlike the Decision Ledger''s historical approval: '
  'deadline expiry, project-mode change, material amendment and governing-decision drift each stop new movement. '
  'Service-role only; UPDATE and DELETE are rejected by trigger. '
  'See docs/architecture/executive-intelligence/ and canonical Ch 20.';
