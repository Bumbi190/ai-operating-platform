# Executive Intelligence — Architecture Knowledge Base

This directory holds the versioned **documentation and knowledge** artifacts for Omnira
Executive Intelligence. It is a knowledge source, not runtime. Nothing here is executed by
the Atlas runtime, and nothing here grants execution authority. The repository, database
schema, migrations, runtime code, and deployment remain the sole authorities for what is
actually implemented.

## What lives here

### 1. Canonical v1.0 (the source doctrine)
- **Title:** Omnira — Executive Intelligence — Canonical Architecture and Operating Doctrine
- **Status:** Approved and locked — Canonical v1.0
- **SHA-256:** `ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8`
- **Shape:** 32 chapters · 6,705 section IDs · 4 front-matter sections
- The canonical book itself is the authored architecture doctrine. It is the upstream
  source both the Professional Edition and the Atlas Knowledge Edition derive from. The
  canonical book binary is **not** copied into this repo; it is referenced by hash.

### 2. Professional Edition v1.0 (the book)
- **File:** `Omnira — Executive Intelligence — Professional Edition v1.0.pdf`
- **SHA-256:** `b0cbb84eb0a53265bcc03b97c5c780e436489aaacdde1e7092816aa039be6aa2`
- **Shape:** 1,740 pages · 32 chapters · 10 Parts · 17 active diagrams
- **Status:** FINAL PROFESSIONAL RELEASE
- The typeset, human-readable book. Reference and provenance only — see
  [`professional-edition/v1.0/PROFESSIONAL_EDITION_REFERENCE.md`](professional-edition/v1.0/PROFESSIONAL_EDITION_REFERENCE.md).
  The PDF binary is intentionally **not** committed (large-binary policy); it is referenced
  by hash and its out-of-repo location is documented.

### 3. Atlas Knowledge Edition v1.0 (the knowledge package)
- **Status:** ATLAS KNOWLEDGE EDITION v1.0 — LOCAL VALIDATION CANDIDATE 2 CLEAN
- **Shape:** 32 chapter files · 6,705 section records · 55,840 block records · 17 active
  diagrams · 56/56 retrieval tests pass · deterministic router · no embeddings · no vector DB
- The machine-structured knowledge derived from Canonical v1.0 and the Professional Edition:
  chapter markdown, section/block JSONL, indexes, relationships, governance rules, a
  deterministic retrieval router, source references, and validation reports.
  See [`atlas-knowledge/v1.0/`](atlas-knowledge/v1.0/).

## Book vs. knowledge package vs. runtime

| Layer | What it is | Authority |
|---|---|---|
| Canonical v1.0 | Authored architecture doctrine (source of truth for *intended* design) | Describes intended architecture; not proof of implementation |
| Professional Edition v1.0 | Typeset book of the doctrine | Human reference only |
| Atlas Knowledge Edition v1.0 | Structured, retrievable knowledge package | Knowledge only — grants no execution rights |
| **Repository / schema / migrations / runtime / deployment** | The actual running system | **Authoritative for what is implemented** |

Document knowledge (including everything under this directory) describes the *intended*
Executive Intelligence architecture. It is **not** evidence that any capability is
implemented. Every record in the Atlas Knowledge Edition carries
`implementation_status = unknown_not_verified_in_this_package`.

## Runtime status

**Executive Intelligence v1.0 is ACTIVE as an Architecture Knowledge source** (EI-S1.1). It is
the fourth active source in the Architecture Knowledge Runtime, alongside Intelligence Fabric
v1.0, Intelligence Graph v1.0 and Mobile Intelligence v1.0. See
[`atlas-knowledge/v1.0/RUNTIME_INGESTION_STATUS.md`](atlas-knowledge/v1.0/RUNTIME_INGESTION_STATUS.md)
for the authoritative statement of what that does and does not mean.

What activation means:

- The canonical package is normalized, chunked and lexically indexed into the committed
  Architecture Knowledge artifact, and is retrievable with server-minted citations.
- Canonical front matter FM.1–FM.4 is ingested alongside the numbered chapters. FM.2 —
  *Implementation Scope and Maturity* — is the canonical Stage 1 boundary and is retrievable.
- Every record's primary canonical identity is the canonical v1.0 book registered in this
  repository (`ee85a1a0…f555b8`), re-verified against the file on disk at build time.

What activation does **not** mean:

- Architecture Knowledge remains **shadow-only**. No knowledge text enters the live model
  prompt, and there is no user-visible grounding surface.
- Canonical book knowledge grants **no execution authority**. Human authority, governance,
  approval gates and project isolation continue to apply unchanged.
- **This is not "Executive Intelligence Stage 1 complete".** Activating the knowledge source is
  the first subphase of canonical Stage 1 (FM.2), not Stage 1 itself.
- No embeddings, no vector database, no external retrieval service, and no Memory ingestion of
  canonical books.

Canonical FM.2 Stage 1 requires Executive Context, Daily Executive Brief, Decision Ledger V1,
Executive Mission Brief V1, explicit human authorization, safe Manager/Workforce handoff,
project-scoped status and evidence, and basic traceability and review.

**Delivered by EI-S1.2:** the apex `executive_brief` producer (canonical §13.1 five-section
shape), and retirement of the legacy `lib/atlas/executive.ts` path from every live surface. The
Atlas page now reads the conformant artifact through a principal-scoped server-side boundary.
No new execution authority was added — the apex brief recommends, it never acts.

**Delivered by EI-S1.3A:** **Explicit Human Authorization V1** — an append-only authority
event log (`atlas_authorizations`) in `lib/atlas/authorization/`. An authorization is an
authority act (canonical §27.3): one identified human principal grants one explicitly stated
permission, over one version-pinned target, inside one project, until an explicit expiry.

Safety properties that are load-bearing:

- The human principal is derived from the authenticated session and is never a caller
  parameter. A service role has capability but never authority (§10.4).
- History is immutable — revocation and supersession append new events; the database rejects
  UPDATE and DELETE by trigger (§11.60, §27.207).
- Expiry is derived from time, so an expired grant is ineffective even with no `expired` event
  and no background job (§27.319).
- Conditions are recorded as structured data (§11.42) but **not enforced** — Stage 1 has no
  policy engine, so a conditional grant reports `conditions_unverified` and is never
  execution-effective. Claiming otherwise would be canonical failure mode §27.348.
- Authorization ≠ execution: the module imports no tool, runner or action dispatcher.

Cross-project authority, delegated approvers, batch/policy-bound approval, autonomy licences,
Trust Score, Damage Boundary, crisis authority and the full Approval Inbox all remain excluded
by FM.2 and are not implemented.

Every migration lives in the canonical guarded directory `apps/web/supabase/migrations/`, where
`check-migrations.mjs` fails a Vercel build until the schema is applied through a separately
authorized rollout. That failure is the guard working as intended and must never be bypassed,
grandfathered, or dodged by moving a file back to the legacy repo-root directory. Both Stage 1
schemas have since been applied through that controlled path.

**Delivered by EI-S1.3B:** **Chapter 11 Decision Ledger V1** — an append-only institutional
decision history (`atlas_decision_ledger`) in `lib/atlas/decision-ledger/`.

> "Memory remembers context. The Decision Ledger remembers commitments." (§11.2)

It is deliberately none of the neighbouring systems: not a general activity log (§11.3), not
Memory/D1 (§11.5), not an audit log (§11.6), and not approval history (§11.7 — "Not every
approval becomes a strategic decision"). It is also not the §8.4 Executive Calibration Ledger,
which remains separate and unimplemented.

Canonical properties:

- Ten lifecycle states with dedicated Chapter 11 sections (§11.49–§11.58), derived from the
  record lineage and never stored as a mutable column. `Under Review` is deferred to Chapter 12,
  which owns the review/decay architecture (§11.46); `Cancelled` is named in §11.48 but defined
  nowhere, so it is not invented here.
- **Authority is proven at the moment of the institutional act, then pinned immutably.** §11.39
  requires the ledger to identify the authority; §11.41 that "a decision requiring approval is
  not effective until approval exists" and that the approval record reference its "Conditions.
  Edited terms." So the exact prospective act is built first, canonically hashed, and matched
  against one Authorization V1 grant's project, target, version, action **and principal** before
  anything is written. What the human authorized is what gets appended — nothing material can
  change between the proof and the record.
- **Approval is a historical act, not a continuing authority lease.** §11.180 has an active
  decision explain itself as "approved under this authority … and remains active until this
  review condition", and §11.44/§11.45/§11.55 give the decision its own duration. A later
  Authorization V1 expiry, revocation or supersession therefore does **not** retroactively erase
  an approval that was valid when it happened; it is a §11.47 trigger to review or reconsider.
  Governance after approval is decided by the decision's own lifecycle alone — `effectiveAt`,
  `expiresAt`, and whether it has been reversed, superseded or completed. No `authorized: true`
  boolean is stored to drift, and the governing read consults no live authorization state.
- **Six distinct authority acts, each needing its own fresh proof** (§27.313, minimum authority):
  `decision.approve`, `decision.amend`, `decision.reject`, `decision.defer`, `decision.reverse`,
  `decision.supersede`. None inherits another's proof. Every material amendment creates version
  N+1 under authority bound to the content of N+1 (§11.59, §11.62); §11.61 non-material
  corrections are out of scope for V1, so every amendment here is material.
- **Nothing is appended before it validates.** Each write authenticates, establishes project
  authority from the lineage's own recorded scope, applies the canonical lifecycle gate, builds
  the candidate, proves authority, folds `[existing lineage + candidate]` through the pure core,
  and only then performs the single irreversible append. An invalid transition can never reach
  an append-only table. If a lineage is read back after the append and still cannot be folded,
  that is reported as `integrity_violation` — institutional corruption needing a human, never a
  retryable availability error.
- **Supersession is verified, not asserted.** §11.56's "replaced by a newer decision" requires a
  successor that exists, shares the project, is not the decision itself, and is itself an
  approved or active decision — a draft, proposal, rejection or deferral is not one. The
  replacement chain is then walked with a visited set and a hard bound, so cycles are refused
  rather than recorded. Missing, cross-project and non-decision successors deny identically, so
  the boundary is never a cross-project decision-id oracle.
- **Completion means it actually finished.** §11.58's "after successful execution and review"
  is enforced literally: the decision must have taken effect, the lineage must carry a measured
  outcome, and a review must be recorded. The explicit UNKNOWN (`not_yet_measurable`) asserts
  nothing and cannot close a decision.
- Active and expired are derived from time (§11.43, §11.55 — "Expiration should not depend on
  manual memory"), so no background job is required.
- Immutable history (§11.60): corrections and material amendments append a new version with
  explicit provenance and reason (§11.59, §11.62); the database rejects UPDATE and DELETE.
- What was known THEN stays known then — evidence references keep timestamp and scope (§11.27)
  and the evidence snapshot is frozen against later data change (§11.28), including known gaps.
- Recommendation is preserved separately from the final decision (§11.24/§11.25); expected impact
  (§11.36) is never conflated with observed outcome (§11.96/§11.98), and `not_yet_measurable` is
  the explicit UNKNOWN — absence of failure is never success (§11.100).
- Materiality must be positively declared from the §11.19 domains; routine activity is refused
  (§11.18), and nothing can self-classify past human authority.
- Project-scoped only. Global and portfolio decisions (§11.10/§11.11) need the governed summaries
  of §11.73, which Stage 1 does not fund, so cross-project reads are denied rather than guessed.
- **Lifecycle concurrency is serialized on lifecycle position, not row count.** Each record
  carries `lifecycle_generation`: the number of lifecycle-advancing records that preceded it.
  `outcome_observed` and `reviewed` record something *about* a decision without moving it
  (§11.96, §11.102), so they consume no generation and are excluded from serialization. A single
  `UNIQUE (decision_id, lifecycle_generation)` index over the nine advancing types makes any two
  acts derived from the same lifecycle state collide — a reversal and a supersession, two
  amendments of one version, an approval and a deferral — and the loser gets `conflict` with no
  row written. Counting total rows instead would let an unrelated review note landing between
  two writers' reads hand them different keys and admit both.
- **Ordering is deterministic for acts stamped in the same millisecond**: `occurredAt`, then
  lifecycle generation, then annotations before the act that leaves their generation, then
  record id. Record ids are random UUIDs, so without the generation tiebreak a same-millisecond
  proposal and approval folded in the wrong order — and became permanently unreadable — about
  half the time. Two annotations sharing a generation *and* a millisecond are genuinely
  concurrent; their relative order is stable and reproducible for every reader, but is not
  claimed to reflect real-world sequence.

Not implemented, and out of scope by canon: Decision Quality Rating (§11.101 — "Omnira **may
later** evaluate"), Trust Score, autonomy progression, Performance Intelligence, and the
Chapter 12 review/decay architecture.

**Delivered by EI-S1.4B:** **Executive Mission Brief V1** — an append-only mission
history (`atlas_mission_ledger`) in `lib/atlas/mission/`.

> "A Mission Brief is more than a prompt. It is a structured contract." (§20.3)

§20.7 fixes its place exactly: "A decision authorizes direction. A Mission Brief
operationalizes that direction." It is not the decision, not the authorization, and not
the execution. Chapter 20 rejects prompt-only and task-list-only briefs outright
(§20.213, §20.214), so every authority- and safety-bearing field is structured and typed;
prose survives only where no security decision reads it.

Canonical properties:

- All twelve mission types (§20.11) and all sixteen statuses (§20.98). A mission type is a
  classification and never a capability — `autonomy` grants exactly as much authority as
  `learning`, namely none (§20.55).
- **Status is derived, never stored,** and there is **one** public evaluation surface.
  `resolveMissionEvaluation()` returns the immutable `lifecycleStatus`, live `authority`,
  `readiness`, and the `effectiveStatus` a human should be shown. `ready` and
  authority-driven `blocked` exist only there — no persisted act can produce either, and no
  caller can assert one instead of satisfying it. There is no mutable `status` column
  anywhere.
- **Canonical Ready means actually Ready.** §20.101 requires available tools, so a mission is
  never reported Ready while availability is unproven. Stage 1 has no capability-availability
  primitive, and the production default proves nothing — a real mission therefore stops at
  **Approved**, with `unverified` naming exactly what could not be shown. Nothing is lost:
  EI-S1.4B executes nothing either way, and EI-S1.4C's §21.16 Manager acceptance supplies the
  real check.
- **Approval gates carry their own authority.** §20.73 resolution is an authority act, not a
  note: it needs an exact Authorization V1 proof bound to the project, mission, **exact
  version**, gate id, outcome, conditions and evidence. Project membership is not approval
  authority (§20.55), and a service identity can never become the approving human. Outcomes
  are classified rather than treated as a boolean — only plain `approve` passes. Being
  authority-bearing and being lifecycle-advancing are **separate dimensions**: a gate
  resolution requires authority provenance in the pure core, in the builder and in a database
  CHECK, while still consuming no lifecycle generation.
  `approve_with_conditions` is **conditionally unverified** (FM.2 excludes the policy engine
  that could check the condition) and `edit_and_approve` **requires a Mission amendment**
  (§20.126), so neither lets an unchanged version through. A resolution made against version
  N does not float forward to N+1.
- **A random UUID never decides authority.** Two contradictory gate resolutions or dependency
  observations sharing the newest instant have no honest winner, so the derivation reports a
  conflict and every consumer fails closed. A positive observation unlocking a **hard**
  dependency must carry evidence (§20.63, §20.81) — institutional history has to explain why
  a prerequisite counted as met.
- **Both observation families are version-scoped.** A gate resolution *and* a dependency
  observation made against version N say nothing about N+1: §20.126 makes the amended version
  a new operational contract, where the same dependency reference may now be hard where it
  was soft. The current version starts unresolved and needs fresh observations; the old ones
  remain immutable audit history. Deliberately conservative — V1 does not try to judge which
  old-world observations survive a material change.
- **Authority binds the exact prospective act.** The candidate record is built first and
  hashed over an explicit projection of every §20.126 material field and every other field
  whose post-approval change would alter what the human approved. Change the objective,
  scope, budget, deadline, success criteria, approval gates, risks, tools or action envelope
  and the required authorization changes with it.
- **Mission authority is an OPERATIONAL GATE, not a historical fact.** This is the
  deliberate difference from the Decision Ledger. A decision's approval is past tense and
  stands (§11.180). §20.75 makes mission approval expire on material change, and §20.101
  makes Ready depend on valid authority in the present tense. Every §20.75 input Stage 1 can
  prove is enforced, in **one shared seam used by both boundaries**: material change (version
  N+1 + fresh authority), **deadline passed** (`deadline_expired`), and **project mode
  changed** (`project_mode_changed`). Project mode is asked two questions, not one: does the
  current mode **permit** movement toward execution at all, and did it **change** since the
  mission was authorized? Omnira's own doctrine — `lib/atlas/lifecycle.ts` and the
  `atlas_mode` column comment, independently — says only `active` executes and observer is
  "collect and analyse, NO execution", so `isExecutable` is reused as the sanctioned
  predicate. §20.75's remaining input — workflow version — is **not applicable**: a
  Mission Brief binds no workflow, and inventing a field to satisfy a future clause would be
  fake authority. It lands with EI-S1.4D.
  History is never rewritten: the `activated` act stays exactly where it is (§20.128), and
  the mission's *effective* status becomes `blocked` with an explicit reason (§20.103,
  §20.87).
- **Approve, activate and resume all prove current authority BEFORE the irreversible
  append.** Nothing is appended and then found invalid on a later read. Resume in particular
  re-proves authority in the write boundary itself, not by trusting that a caller consulted
  the read boundary first.
- **The governing decision is proven exactly, and its provenance is server-derived.** The
  caller supplies only the decision's material identity — id and version. The project, status
  and observation time are read from the Decision Ledger inside the boundary, because
  provenance a caller writes is not provenance. The decision must exist, belong to this
  project *by its own record*, still govern, and match the **exact pinned version** — §11.62 makes an amended decision a different commitment, so
  version drift stops new movement rather than silently authorizing the old mission.
  Unknown and foreign decisions deny identically. The Decision Ledger is never written.
- **Approval gates must be resolved, not merely declared** (§20.73, §20.92). Gates carry
  stable ids; a `gate_resolved` annotation records which of the eight canonical outcomes
  applied. Completion requires every declared gate resolved, and a blocking outcome —
  reject, defer, request more evidence, request alternative, escalate — blocks the mission
  instead of being quietly ignored (§20.221). This is not the Full Approval Inbox, which
  FM.2 excludes, and adds no second approval-authority system.
- **Dependency definition is separate from dependency observation** (§20.101). The contract
  binds what the mission waits on — kind, reference, hardness, owner. Whether a prerequisite
  has been met arrives as an immutable `dependency_observed` annotation, so a prerequisite
  finishing no longer requires a material amendment and fresh authority. A hard dependency
  is **unsatisfied until observed**. Replacing or removing a dependency is still material.
- **Supersession proves the successor is real and empowered** (§20.97): it must exist, share
  the project, have **crossed the approval boundary** (§20.100 — a mere proposal cannot
  terminate an institutional Mission), hold valid **current** operational authority, not be
  this mission, and not close a cycle — checked by a bounded, fail-closed chain walk. Missing,
  foreign and ineligible successors deny identically.
- **A material amendment creates version N+1 and expires the prior approval** (§20.126,
  §20.75). Version N stays in the immutable lineage; the old authorization does not float
  forward; the mission returns to `proposed` until it earns fresh, exact authority.
- **Approved, Ready and Active stay distinct** (§20.100–§20.102). Opening a mission grants
  nothing (§20.99). If activation requirements are incomplete, the mission stays inactive,
  the missing elements are reported as typed values, and nothing is appended — §20.106: "No
  external execution begins."
- **Completion is judged, never assumed.** §20.92 requires the outcome, met success
  criteria, required evidence, resolved approvals and documented limitations; §20.93 keeps
  task completion distinct from mission completion; §20.195 requires a completion review.
  Completion writes **nothing** to the Decision Ledger, Memory or any calibration surface —
  a finished mission does not prove the governing decision was correct.
- **The Decision Ledger link is optional and validated.** §20.137 is permissive, so a
  mission whose authority source is a founder instruction fabricates no decision link. When
  a decision IS the source, the reference is mandatory, must be same-project, and an
  expired, reversed or superseded decision blocks new operational authority. The Decision
  Ledger schema is untouched and never written.
- **Project-scoped only**, `project_id NOT NULL` with `ON DELETE RESTRICT`. §20.28
  cross-project missions need Portfolio authority, which Stage 1 does not fund.
- Nothing executes. `budget` is a §20.52 boundary and not a spending capability;
  `allowedActions` and `tools` are §20.56/§20.58 declarative upper bounds that authorize no
  tool call. The module imports no Manager, workflow executor, runner or dispatcher.

Not implemented, and excluded by FM.2: the Damage Boundary engine, Trust Score, Autonomy
Licensing, Performance Intelligence, the full policy engine, Mission Graph, dashboards,
templates, simulation, pre-/post-mortem automation, drift detection and batch approvals.
Structured risks, controls and stop conditions are **declarative Mission Brief boundaries
only** — calling them a Damage Boundary would be a lie.

The `atlas_mission_ledger` migration was subsequently applied through the controlled
EI-S1.4B-R4 rollout (ledger version `20260820054225`), byte-identical to its repository file.
**Executive Mission Brief V1 = IMPLEMENTED / SCHEMA APPLIED.**

**Delivered by EI-S1.4C:** **Chapter 21 Delegation Envelope V1** — the bounded Executive to
Manager handoff (`atlas_delegation_ledger`) in `lib/atlas/delegation/`.

> "Delegation is not instruction. It is the transfer of BOUNDED authority." (§21.12)

Canonical properties:

- **The envelope is structured, not a prompt.** There is no `prompt: string` and no
  `goal: string`. Every bound — objective, scope, authority, allowed and forbidden actions,
  tools, data scope, budget, deadline, constraints, approval gates, escalation triggers, stop
  conditions — is a typed field, because a string cannot be checked for containment against
  its parent and therefore cannot carry authority.
- **The envelope is DERIVED from an exact Mission version, never authored beside one.** The
  caller supplies narrowings and nothing else. Project, mission, version, objective and every
  inherited prohibition are taken from the Mission, so there is no field a caller can restate
  into something wider.
- **Attenuation is a pure, deterministic function** (§6.39). Permissive fields (authority,
  actions, tools, data, scope, budget, deadline) may only narrow, and every claimed element
  must be present in the parent. Restrictive fields (forbidden actions, out-of-scope,
  constraints, approval gates, escalation triggers, stop conditions) are inherited in full and
  may only be added to — removing an inherited prohibition is not merely rejected, it is
  **unrepresentable** in the request type. There is no capability-token framework, no policy
  engine, no Autonomy License and no Trust Score.
- Two containment rules earn their keep specifically. A tool bound is matched **including its
  §20.59 restriction**: no deterministic function can prove one prose restriction narrower than
  another, so dropping `restriction: 'draft only'` is a widening rather than an omission. And
  data scope is compared over an access lattice where write subsumes read, so narrowing a write
  scope to a read is allowed while the reverse is a privilege escalation.
- **Mission authority is re-asked on every prepare, decide, replan and read** (§21.14), through
  `resolveMissionEvaluation` — the Mission module's single public evaluation surface. An
  envelope is a claim about a Mission, never authority in itself, so a stored row over a
  cancelled, failed, superseded, archived, completed, expired, mode-blocked or
  decision-invalidated Mission is inert regardless of what the row says. The Mission's
  lifecycle status is checked independently of its authority verdict rather than inferred from
  it.
- **Version pinning is a hard stop** (§21.15). An envelope prepared against version N is
  decided against version N or not at all; it never floats to N+1, including when N+1 is
  *wider*. The pin is stored as the version **and** a `mission_bound_hash` over the delegable
  bounds, so drift is visible rather than assumed away. An editorial amendment that moves no
  bound does not spuriously invalidate live delegations.
- **The caller never chooses the outcome** (§21.16). There is no `accept()` taking
  `accepted: true`; there is `decideDelegation`, which runs the acceptance checks and appends
  whichever of accepted/rejected they produce. Every one of the eleven typed reasons —
  `objective_ambiguous`, `authority_insufficient`, `tool_unavailable`, `data_unavailable`,
  `dependency_unavailable`, `constraint_conflict`, `deadline_infeasible`, `escalation_missing`,
  `mission_not_current`, `project_mismatch`, `delegation_exceeds_mission` — is decided by
  deterministic code reading structured data. **No model is consulted anywhere on this path**,
  because an authority check a prompt can talk its way past is not a check.
- **Rejection is a first-class outcome, not a failure** (§21.17, §21.18). A refusal ends the
  handoff and writes **nothing** to the Mission: it does not fail, cancel or amend it.
- **The first sanctioned real capability check** (§20.105, §21.16). EI-S1.4B shipped
  `unprovenAvailability`, which proves nothing and says so. `registryAvailability` replaces it
  on this path and is deliberately **not** a stub returning true. Read scopes are proven against
  `DOMAIN_REGISTRY` — the actual shipped security boundary for `get_records` — so
  "can this Mission read `leads`?" now has a real answer. Where no source of truth exists the
  check **fails closed per category**: write access has no registry that authorizes it, and
  there is no enumerated tool registry in this codebase at all, so a declared tool cannot be
  proven available. Matching free-form tool strings against workflow or agent names would mean
  inventing a naming convention and then trusting it, which is not a source of truth.
- **Manager acceptance IS the Mission's availability proof** (EI-S1.4C-R1). Before R1, capability
  availability and Manager acceptance were two parallel facts: a Mission could be handed any
  implementation answering "tools: true, data: true" and activate, while an accepted envelope sat
  beside it proving nothing. `availabilityFromAcceptedDelegation` makes the chain sequential —
  Mission → Envelope → Manager ACCEPT → accepted capability proof → **separate**
  `mission.activate` Authorization V1 → Active. Manager acceptance is a NECESSARY input to
  activation and never a sufficient one: it appends no Mission act, and withholding the activate
  grant still leaves the Mission inactive.
- **The capability seam carries server-derived Mission identity** (EI-S1.4C-R1). The query was
  `{ projectId, tools, dataScope }`, which is enough for a capability-only lookup and *not*
  enough for a proof derived from a specific artifact: a proof cut for Mission A would have
  answered for Mission B in the same project merely because both wanted the same tools. The
  query now carries `missionId` and `missionVersion`, populated by the Mission boundaries from
  the lineage's own derived state — never from a caller parameter.
- **Coverage runs the other way from attenuation** (§21.13, EI-S1.4C-R1). Attenuation guarantees
  `delegation ⊆ mission`. Availability needs `queried ⊆ delegation`. A Manager that accepted an
  envelope carrying tool A has proven A and said nothing about B, so a Mission requiring A + B
  is not satisfied by that acceptance. The envelope is never widened to make a proof fit.
- **The bound hash is an enforced pin, not provenance** (EI-S1.4C-R1). It shipped written,
  carried and never consulted, so a stored envelope whose hash disagreed with the live Mission
  was still accepted and still reported usable as long as the version matched. Prepare, decide,
  replan and read now all compare it, and a same-version Mission whose delegable bounds moved
  fails closed as `mission_bound_hash_changed`.
- **The envelope must agree with the row carrying it** (EI-S1.4C-R1). A prepared row whose
  relational columns said Mission A while its JSON payload said Mission B was accepted, and the
  two halves would have authorized different things depending on which a reader trusted. Id,
  project, mission, version, bound hash and `delegatedTo` are now checked in the pure core.
- **Actor provenance is a lineage invariant** (§21.19, EI-S1.4C-R1). `DELEGATION_ACT_ACTOR` binds
  each act to the only actor that may perform it — the Executive prepares and revokes, the
  Manager decides and replans under exactly `atlas.manager` — enforced in the pure core AND
  mirrored by a database CHECK, with a test comparing the two so they cannot drift. `system` is
  reachable by no act; V1 has none, and inventing one would create an actor with no principal
  behind it.
- **Containment is re-proved across the whole contract** (EI-S1.4C-R1). The re-proof covered nine
  fields and silently ignored the rest, so a stored envelope with a rewritten objective, an
  invented deliverable, or its inherited constraints and escalation triggers deleted re-proved
  clean. `ENVELOPE_FIELD_CLASS` now classifies every field as identity, exact, narrowable or
  restrictive, a guard test enumerates the type's keys against it, and a field added later
  without a containment ruling fails a test rather than defaulting to unchecked.
- **The replanning boundary is classified, not negotiated** (§21.20–§21.26). Resequencing,
  decomposition and retrying inside the envelope are `operational_change` and belong to the
  Manager. Anything reaching past the envelope — an action outside the allowed set or inside
  the forbidden set, an ungranted tool or resource, spend above the ceiling, a date past the
  deadline, out-of-scope work, or skipping a declared gate — is
  `material_change_requires_executive_review` and is **referred**, never executed. The default
  is material: a change the classifier cannot positively prove inside the envelope goes upward.
- **Actors are not interchangeable** (§21.19). Preparing and revoking are Executive principal
  acts recording the acting human; deciding and replanning are Manager acts recording the
  Manager's own constant identity. The Manager never borrows the requesting human's id to make
  the ledger look authoritative, and the service role is neither. One institutional act resolves
  the acting identity exactly once (EI-S1.4C-R1): revocation previously authenticated a second
  time between the authorization and the append, so the row could name a principal who never
  passed the isolation check that let the read through.
- **Delegation ≠ Decision; acceptance ≠ Authorization** (§21.18). Nothing on this path writes to
  `atlas_decision_ledger`, `atlas_authorizations` or `atlas_mission_ledger`.
- **Tools in the envelope are a maximum bound, not execution permission** (§21.13). Nothing
  here executes: no task is created, no `manager_tasks` row is written, no run is started, no
  tool is called and no message is sent. The module imports no runner, executor, dispatcher or
  publisher, and a test asserts that absence.
- **Immutable and project-scoped.** `project_id NOT NULL` with `ON DELETE RESTRICT` — the
  deliberate contrast with `manager_tasks`, whose project is nullable and whose status is
  mutable. UPDATE and DELETE are rejected by trigger, and three partial unique indexes serialize
  preparation, decision and revocation so two racing deciders cannot both write.
- **`invalidated` is derived, never stored.** An envelope can be permanently and truthfully
  `accepted` in the ledger while being unusable this second because the Mission behind it was
  cancelled, amended or expired (§21.27). Storing that would mean writing to an append-only
  ledger every time the world changed, so the live answer is computed on every read.
- **A terminal Mission ends its delegations** (§21.27, EI-S1.4C-R2). Being *terminal* and
  holding *authority* are different questions, and R1 asked only the second on the read path: a
  completed, failed, cancelled, superseded, archived or partially-completed Mission whose
  Authorization V1 grant was still effective, whose deadline had not passed and whose project
  was still `active` reported `authorized` — so an accepted delegation stayed usable and kept
  proving capability availability for a Mission that had already finished. `isTerminalMissionStatus`
  now lives in the Mission domain and is asked by **both** delegation boundaries; the write
  boundary's private six-status copy is gone. The historical acceptance is untouched:
  `lifecycleStatus` stays `accepted`, `effectiveStatus` becomes `invalidated` with reason
  `mission_ended`, and no revocation is fabricated to express that the work stopped.
- **Order is a column, not a timestamp** (§21.18, EI-S1.4C-R2). Every act claims one
  `lineage_sequence` position per envelope, unique and derived by the application from the exact
  lineage it read. It is deliberately **not** the Mission ledger's `lifecycle_generation`: there,
  annotations record something *about* a mission without moving it and consume no generation;
  here there are no annotations, because whether a Manager's replan happened before or after an
  Executive's revocation is precisely the question that must have one answer. Before R2 the two
  raced freely — three indexes serialized each act type against *itself* and nothing against
  anything else — and a revocation and a replan written in the same millisecond had their order
  settled by whichever random `recordId` sorted first.
- **The causal order is closed, not merely present** (§21.20/§21.27, completed in EI-S1.4C-R3).
  The pure core compares positions, never clocks or identifiers, so no verdict can flip with a
  UUID. Three rules, each proven against `lineage_sequence`: a replan must fall **after** the
  acceptance, a replan must fall **before** any revocation, and a **decision** must fall before
  any revocation. R2 sealed only the middle one, so two impossibilities still derived cleanly —
  a replan positioned *before* the acceptance (existence of an acceptance was the whole test,
  and in the `referred` case that meant an escalation about an envelope nobody had agreed to),
  and an acceptance recorded *after* the withdrawal, which hid behind the derived status because
  the lineage ended `revoked` either way. Valid: `prepared → accepted`, `prepared → rejected`,
  `prepared → revoked` (the Executive may withdraw before the Manager decides),
  `prepared → accepted → replan* → revoked`.
- **A revocation that loses a race still lands.** Authority narrowing must not be defeated by a
  Manager winning a millisecond, so a revocation that collides with a concurrent replan retries
  at the next position — bounded, re-reading and re-checking the lifecycle each time, and reusing
  the principal `openFor` already established rather than re-authenticating. A collision with
  another *revocation* is correctly seen as `already_revoked`. If the bound is exhausted the
  caller is told plainly that the revocation did **not** happen (`conflict:
  revocation_not_appended`) — it is never silently discarded and never reported as success.

The existing Manager surface is unchanged: `planTasks(goal, projectId)` and every current
caller behave exactly as before. The bounded path is new methods on the same `ManagerAgent` —
there is no `ManagerAgentV2` — and it shares nothing with `planTasks`. The vestigial
`delegation_request` / `knowledge_request` intelligence kinds are **not** used as the Chapter 21
artifact; they have no producers and are not the canonical names.

Not implemented, and excluded by FM.2: work packages, Manager to Workforce delegation, task
dispatch, the policy engine, Damage Boundary, Trust Score, Autonomy Licensing, Performance
Intelligence, Crisis Mode, Emergency Brake, autonomy levels L4–L6, automatic spending, automatic
publishing and automatic project-mode changes.

The `atlas_delegation_ledger` migration was subsequently applied through the controlled
EI-S1.4C-R4 rollout (ledger version `20260820091102`), byte-identical to its repository file,
and PR #64 merged as `821192c59aef1c70531e78dac50e714da30b444d`.
**Executive → Manager Bounded Handoff V1 = COMPLETE / PRODUCTION.**

**Delivered by EI-S1.4D:** **Chapter 21 §21.9 Work Package V1** — the Manager to Workforce
bounded handoff, in `lib/atlas/workpackage/`, persisted additively on `manager_tasks`.

> "Delegation is not instruction. It is the transfer of BOUNDED authority." (§21.12) — one hop
> further down.

Canonical properties:

- **The parent is the DELEGATION, not the Mission.** Authority reaches a Work Package only
  through an accepted, currently usable Delegation Envelope, and narrows at every hop:
  `Mission ⊇ Delegation ⊇ Work Package`. The Mission is the grandparent, carried for §21.28
  traceability.
- **Structured, not a prompt.** No `goal: string`, no `prompt: string`. The §21.9 field names
  are the public model — mission reference, project, task objective, inputs, expected output,
  authority, constraints, deadline, reporting, escalation — plus §21.29 dependencies.
- **Attenuation is pure and deterministic** (§6.39). Permissive fields narrow; restrictive
  fields are inherited in full and may only be added to. Removing an inherited prohibition is
  **unrepresentable** in the request type. `WORK_PACKAGE_FIELD_CLASS` classifies all 28 fields
  and a guard test fails if a future field arrives without a containment ruling.
- **Decomposition is bounded, not free** (§21.28). The Manager may choose a `taskObjective` the
  Delegation never spells out — that is what decomposition *is* — so it is recorded as
  **operational intent** while every authority question is answered by the structured fields
  around it. What is proven is structural: non-empty objective, declared outputs, scope inside
  the parent's, nothing in out-of-scope, inputs mapping to permitted origins, and every action,
  tool, datum, budget and deadline a subset. What is **not** claimed is semantic subordination —
  no deterministic function can read two sentences and decide one serves the other, and asking
  a model would put authority back in a prompt.
- **The Workforce role registry is `public.agents`, and it was not invented.** It is real (35
  production rows), project-scoped (`project_id` NOT NULL + FK), and the actual runtime
  authority — `workflow-executor.ts` and `workflow-runner.ts` resolve `step.agent_id` there and
  fail when it is absent. `workflows` was rejected: a workflow is a procedure, not a party.
- **Role fitness answers only what Stage 1 can prove** (§21.35). Role existence and project
  availability: yes. Data access: yes, via the shipped `DOMAIN_REGISTRY`. Capability: **no** —
  `agents.skill_ids` resolves against nothing, because no `skills` table exists in the
  repository or in production, so a declared skill is an uninterpreted label and never gates
  fitness. Tools: proven only where the parent Delegation's acceptance already proved them.
  Capacity: no source, so not guessed. No Trust Score, Autonomy Licensing, Damage Boundary or
  Performance Intelligence — their absence is reported as absence, never as a passing default.
- **Two pins, two questions.** `delegationBoundHash` (new in EI-S1.4D) answers "does the
  accepted Delegation still say what this package was cut from?"; `packageHash` answers "have
  this package's own authority terms been altered since assignment?". Both cover delegable terms
  only, so an editorial reword does not masquerade as an authority change.
- **`assigned` is the ceiling** (§21.42). A successfully assigned package means the role has
  **RECEIVED** it and nothing has started. `Executing`, `Waiting`, `Blocked`, `Escalated`,
  `Paused`, `Completed`, `Failed` and `Quarantined` are deliberately not representable: each
  needs real execution and monitoring semantics this increment does not build, and inventing a
  value would be a state the system cannot observe.
- **`invalidated` is derived, never stored.** A package can be permanently, truthfully assigned
  and unusable this second because its Delegation was revoked or its Mission ended. History is
  not rewritten to pretend the assignment never happened.
- **Additive persistence on `manager_tasks`, with the row split in two.** The operational shell
  (title, status, result, run_id) stays mutable and legacy flows are untouched; the canonical
  contract (the package, its hash, the Mission/Delegation pins, the assigned role) is immutable
  once written, enforced by a trigger that guards only those columns. `project_id` stays
  **globally nullable** — the requirement is conditional on a canonical package existing —
  because making it NOT NULL would rewrite the meaning of legacy rows nobody reviewed. No
  backfill, no rewrite, no parallel task system.
- **Legacy status is not canonical state.** §21.42 `assigned` is derived from the contract
  existing; `manager_tasks.status` keeps meaning exactly what it meant. Two mutable status
  sources over one row is how a ledger starts disagreeing with itself.
- **Canonical packages are isolated from legacy task surfaces** (EI-S1.4D-R1). Sharing storage
  must not mean sharing semantics. A canonical row is written with `source = 'work_package'`
  and excluded from every legacy active-task query via one exported discriminator,
  `source IS NULL OR source <> 'work_package'`. The NULL branch is load-bearing: `planTasks`
  inserts without a `source`, so `source <> 'work_package'` alone evaluates to NULL — not true —
  and would silently hide the entire existing task list. Nothing in this codebase executes from
  a `manager_tasks` row (the run drain claims `runs` via `claim_runs`), so this was a
  visibility defect rather than an execution one — but a §21.42 assigned package rendered as an
  ACTIVE task is a claim the system cannot back.
- **The persisted contract is verified, not trusted** (EI-S1.4D-R1). The row stores the contract
  twice — as JSON and as relational pin columns — and one seam,
  `validateStoredWorkPackage`, decides whether they agree before any authority use. Three things
  must match: the recomputed package hash, the JSON `packageHash`, and the relational
  `work_package_hash`. The recompute is what catches a rewritten task objective, inputs, outputs,
  dependencies, fallback or role, because those are decomposition fields that containment
  against the parent deliberately does not constrain. **Project access is decided from the
  relational column, never the JSON payload** — letting a corrupted payload answer "may this
  caller read this row?" would make the access decision depend on the very thing under suspicion.
- **A legacy row can never become canonical by UPDATE** (EI-S1.4D-R1). A canonical Work Package
  originates by INSERT through the sanctioned boundary or not at all; attaching one to an
  existing task by UPDATE would bypass the parent Delegation, attenuation and role validation
  entirely. Ordinary legacy updates still pass. The shape CHECK is now all-or-none in both
  directions, so a row cannot carry a populated contract while leaving `work_package_id` NULL —
  invisible to every partial index yet sitting in the table looking like authority.
- **The canonical discriminator is part of the contract** (EI-S1.4D-R2). R1 made
  `source = 'work_package'` load-bearing for legacy isolation, but nothing required a canonical
  row to carry it and the immutability trigger did not freeze it — so a package could lose its
  discriminator and reappear as an ACTIVE MANAGER TASK. It is now required (`source_key` tied to
  `work_package_id`), frozen once written, and a legacy row may not CLAIM to be a Work Package
  without a complete contract. Other legacy `source` values — NULL, `dream`, anything else — are
  untouched.
  The canonical branch is **NULL-safe** (EI-S1.4D-R3): a PostgreSQL CHECK rejects only FALSE, so
  `source = 'work_package' AND source_key = …` *passed* for a canonical row with a NULL source,
  because the comparison evaluated to NULL rather than false. `IS TRUE` and `IS DISTINCT FROM`
  now make both branches total. Verified against real PostgreSQL, not by reading the SQL — and
  the discriminator is re-proved institutionally at read as well, since a DB constraint governs
  rows written through Postgres while the pure re-proof governs the object an authority decision
  is about to be made from. `source`/`sourceKey` are persistence identity and are deliberately
  **not** part of the Chapter 21 contract JSON.
- **Assignment history is not deletable** (§21.42, EI-S1.4D-R2). `manager_tasks.project_id`
  references `projects(id)` **ON DELETE CASCADE** — verified against the production catalog — so
  deleting a project would have silently erased every Work Package assigned within it. A
  conditional BEFORE DELETE trigger now blocks the delete of any row carrying a contract, and
  because a child trigger fires on cascades too, one guard closes both the direct delete and the
  cascade **without** rewriting the foreign key or touching project lifecycle. Legacy rows keep
  their existing delete semantics exactly; the table does **not** become append-only.
- **Coherence and validity are different proofs** (EI-S1.4D-R2). R1 proved a stored contract had
  not *changed* (pins agree, hash recomputes). It did not prove the terms were *valid*: a package
  could be tampered with, re-sealed, stay fully contained by its parent, and still be usable with
  an empty objective, no declared output, a dependency on an undeclared input, or a
  `packageVersion` V1 never issues. One shared pure seam, `validateWorkPackageTerms`, now holds
  every parent-independent structural rule and is called by **both** the creation and the read
  path — with an alignment test running the same malformed terms through both ends, so a rule
  can never be enforced at only one.
- **A dependency predecessor is validated before it is trusted** (EI-S1.4D-R2). The check read
  the predecessor's JSON `projectId`, so a row physically in another project could claim this one
  and carry a dependency across the §21.158 boundary. It now requires stored-contract coherence
  first and compares the **relational** project.
- **One assignment act, one authenticated principal** (§21.19, EI-S1.4D-R2). `assignWorkPackage`
  authenticated and then called `prepareWorkPackage`, which authenticated again — so a session
  changing mid-act could have one principal establish scope and another complete the assignment.
  An internal prepared-with-principal seam fixes this while `prepareWorkPackage` remains a
  normally authenticated public boundary on its own.
- **Role eligibility claims only what the sources prove** (EI-S1.4D-R1). The result is
  deliberately not called `fit`. `agents` proves identity and project; `DOMAIN_REGISTRY` proves
  a data domain is sanctioned *platform-wide*, not that this role may read it; Delegation
  acceptance proves a tool was available *to the parent*, not that this role holds permission to
  invoke it. So `verified` and `unverified` dimensions are both reported, and the unverified list
  is never empty for a package with tools or data. That is honest rather than damaging, because
  §21.42 assignment is not execution — the unverified dimensions are execution-time questions,
  and Stage 1 builds no execution.
- **Nothing executes.** No run, no queue, no dispatch, no tool call, no publishing, no model.
  The only table written is `manager_tasks`, and only by INSERT. Assignment is the final effect.
- **Workforce → Agent (§21.10) is NOT started** and remains a future boundary.

The existing Manager surface is unchanged: `planTasks(goal, projectId)`, `getActiveTasks`,
`updateTask` and `retryFailedRun` behave exactly as before. The canonical path is new methods on
the same `ManagerAgent` — no `ManagerAgentV2`, no parallel coordinator — and never routes
through `planTasks`.

> The `manager_tasks_work_packages` migration is committed in the canonical guarded directory
> but **not yet applied**, so `check-migrations.mjs` will fail a Vercel build until a separately
> authorized rollout applies it — deployment blocked by design. Until then:
> **Manager → Workforce Work Package V1 = CODE IMPLEMENTED / SCHEMA UNAPPLIED / NOT
> PRODUCTION-OPERATIONAL.**

**Deployment status (EI-S1.4B-R4 verified; EI-S1.4C pending rollout):**

| Item | State |
|---|---|
| Human Authorization V1 | **IMPLEMENTED** — `atlas_authorizations`, applied and verified |
| Chapter 11 Decision Ledger V1 | **IMPLEMENTED / PRODUCTION SCHEMA READY** |
| Decision Ledger migration | `apps/web/supabase/migrations/20260819_atlas_decision_ledger.sql`, ledger name `atlas_decision_ledger` |
| Schema | **APPLIED AND VERIFIED — SCHEMA_EQUIVALENT** |
| Production initial row count | **0** |
| Migration guard (main) | **38 enforced / 0 missing**, no override, nothing grandfathered |
| Migration guard (this branch) | **39 enforced / 1 missing** — `manager_tasks_work_packages`, unapplied by design |
| Executive Mission Brief V1 | **IMPLEMENTED / SCHEMA APPLIED** |
| Mission operational readiness | EI-S1.4B-R1, R2 and R3 corrections applied |
| Mission migration | `apps/web/supabase/migrations/20260819_atlas_mission_ledger.sql`, ledger name `atlas_mission_ledger` |
| Mission schema | **APPLIED AND VERIFIED — BYTE_IDENTICAL** (ledger version `20260820054225`) |
| Executive → Manager handoff | **COMPLETE / PRODUCTION** — merged `821192c5`, schema applied `20260820091102`, BYTE_IDENTICAL |
| Manager → Workforce Work Package | **CODE IMPLEMENTED / SCHEMA APPLIED** — migration registered as `20260820184619`, byte-identical to its repository file |
| Work Package migration | `apps/web/supabase/migrations/20260820_manager_tasks_work_packages.sql` (additive on `manager_tasks`) |
| Workforce role registry | `public.agents` — real, project-scoped, runtime-resolved |
| Workforce → Agent (§21.10) | **NOT STARTED / OUTSIDE STAGE 1 HANDOFF** |
| Delegation proof integrity | EI-S1.4C-R1 and R2 corrections applied |
| Delegation ordering | `lineage_sequence` — one writer per position per envelope |
| Delegation migration | `apps/web/supabase/migrations/20260820_atlas_delegation_ledger.sql`, ledger name `atlas_delegation_ledger` |
| Capability availability | **REAL CHECK SHIPPED** — reads proven against `DOMAIN_REGISTRY`; writes and all tools fail closed |
| Activation availability proof | **ACCEPTED DELEGATION REQUIRED** — Mission-, version- and coverage-specific |
| Manager → Workforce handoff | **BOUNDED WORK PACKAGE V1 SHIPPED** — stops at §21.42 `assigned`; no execution |
| Executive Brief read surface | **PRINCIPAL-SCOPED ONLY** — no shared-secret HTTP read route exists |
| EI artifact store / entity registry | **LIVE IN PRODUCTION** — `atlas_intelligence` + `atlas_entities` applied EI-S1.6A |
| Executive Brief generation | **LIVE** — scheduled `0 7 * * *` UTC; one controlled smoke produced 4 current briefs |
| Migration guard | **42 enforced / 0 missing** |
| `EI-SCHEMA-01` | **CLOSED** |
| `EI-REACH-01` | **IMPLEMENTED / AWAITING MERGE** — three authenticated Executive routes; not closed until merged and production-verified |
| Executive Intelligence Stage 1 | **STILL NOT COMPLETE** — blocked on `EI-REACH-01` |

Verified read-only against the production catalogs after application: `lifecycle_generation`
present and no stale `base_record_count`; the append-only BEFORE UPDATE and BEFORE DELETE reject
triggers both enabled; RLS enabled with **zero** policies and no direct `anon`, `authenticated`
or `public` grant; the lifecycle concurrency index present with exactly the nine advancing types
in its predicate and annotations correctly absent; the lineage index carrying
`lifecycle_generation`; and the migration registered exactly once. No seed rows, no test rows,
no backfill.

### The Executive Brief read boundary (EI-S1.5A)

Three facts, and the distinction between them is the whole point:

- **Generation may be scheduler-triggered.** `GET /api/atlas/intelligence/cron/brief` is the
  producer route and authenticates with the shared `CRON_SECRET`. That is correct: a scheduler
  proving it is the scheduler, in order to run a producer.

  **Correction (EI-S1.6A).** An earlier revision of this section named the route `POST` and said
  it "produces briefs on a `pg_cron` schedule". Both were wrong. The route is `GET`, and at the
  time of writing no such schedule existed.

  **What EI-S1.5B found (historical, 2026-08-21, now remediated).** `public.atlas_intelligence`
  was absent, `public.atlas_entities` was absent, `cron.job` held 34 jobs and none targeted this
  path, and **no Executive Brief had ever been produced in production**. The cause was not a
  missing file: all three migrations existed, in the repo-root `supabase/migrations/`, which the
  guard does not scan. Its `MIGRATIONS_DIR` is `apps/web/supabase/migrations/` only. So
  "39 enforced / 0 missing" was **truthful for the directory it enforced and blind to the
  historical Executive Intelligence directory at the same time** — the guard did not fail; it
  reported accurately on a scope that did not include these migrations.

  **What EI-S1.6A did (current state).** Canonicalized exactly those three migrations — the
  audited dependency closure — into the guarded directory, taking the guard from **39 → 42
  enforced**, and applied all three through a controlled production rollout with byte-verified
  provenance. Production now has:

  | | |
  |---|---|
  | `public.atlas_intelligence` | **LIVE** |
  | `public.atlas_entities` | **LIVE** |
  | Executive Brief schedule | **LIVE** — `omnira_atlas_intelligence_brief`, `GET /api/atlas/intelligence/cron/brief`, `0 7 * * *` UTC |
  | Migration guard | **42 enforced / 0 missing** |

  One controlled generation smoke then ran and succeeded, persisting **21 EI artifacts**,
  of which **4 are current, non-superseded `executive_brief` artifacts** (1 platform-global
  world scope, 3 project-scoped), plus **9 entity-registry rows**. Principal-scoped human reads
  were verified to remain intact and unchanged.

  **`EI-SCHEMA-01`: CLOSED.**
- **Human reads are principal-scoped.** Every user-facing Executive Brief read goes through
  `lib/atlas/intelligence/principal-read.ts`, which resolves a real user principal, enforces
  project ownership, and requires whole-portfolio authority before releasing the world brief
  (`project_id IS NULL`). There is no second way in.
- **No `CRON_SECRET`-only Executive Brief read surface exists.** `GET /api/atlas/intelligence/brief`
  was retired. It authorized on the shared secret alone and then read through a service-role,
  RLS-bypassing client — so holding one reusable infrastructure secret returned any project's
  artifacts, the platform-global world brief, or, with `projectId` omitted, every project at
  once. The audit found it had no live caller: no `fetch`, no `vercel.json` cron entry, and the
  `pg_cron` schedule points at the generation path, not this one. It was deleted rather than
  re-authorized.

`CRON_SECRET` remains in use by 38 unrelated scheduler routes and was **not** globally removed.
It is infrastructure authentication, and since EI-S1.6A made the generation schedule live the
distinction is load-bearing rather than theoretical:

- `CRON_SECRET` authenticates the **scheduler** to the **generation** route, and nothing else.
- It is **not** a human principal, **not** project ownership, **not** portfolio authority, and
  **not** permission to read an Executive Brief.
- Every human Executive Brief read goes through the principal-scoped boundary in
  `lib/atlas/intelligence/principal-read.ts`. There is no second path, and no HTTP read route.

It must never again become a parallel data-authorization model. A narrowly scoped regression
guard in `lib/qa/executive-brief-apex.test.ts` fails if an Executive Intelligence read route ever
authorizes on it again.

**Still open, tracked for later EI-S1 increments:** the final FM.2 conformance review.
§20.75's workflow-version input remains not applicable until a Mission binds a workflow.

Carried forward: **AUTH-GAP-01** (the general approval route authenticates the reviewer but does
not persist that reviewer identity — a separate, narrowly scoped security follow-up),
**AK-PRELIVE-01** (Architecture Knowledge index/memory optimisation before live grounding),
**R2-PROV-01** (the `atlas_authorizations` payload was schema-equivalent but not byte-identical
to its repository file; the Decision Ledger rollout did not repeat that, differing only by a
trailing newline), **§11.61 non-material Decision Ledger corrections deferred** beyond V1 (Mission V1 makes
the same ruling: every mission amendment is material and takes the full authority path), and
physical deletion of `lib/atlas/executive.ts` once the UI branch migrates.

### Human authority reachability (EI-S1.6B)

`EI-REACH-01` recorded that Authorization V1, Decision Ledger V1 and Executive
Mission Brief V1 were fully implemented and completely unreachable: their
sanctioned principal-write boundaries had no route, server action, script or UI
able to call them, so four FM.2 capabilities existed without being exercisable.

Three authenticated routes now reach them, and nothing else changed:

```
POST /api/atlas/executive/authorization    grant · grant_with_conditions · deny · revoke
POST /api/atlas/executive/decision         propose · request_authorization · approve ·
                                           reject · review · outcome · complete
POST /api/atlas/executive/mission          open · propose · request_authorization · approve ·
                                           activate · cancel · pause · resume · close ·
                                           evidence · review
```

- **Purpose-scoped authorization only.** The raw `AuthorizationTarget` and
  `RequestedAuthority` are free-form strings validated against no registry, so
  exposing them would let a human mint a grant naming any action kind at all —
  including the spending and publishing Stage 1 excludes. Nothing would execute
  today, which is exactly the danger: the rows are immutable and would wait in
  the ledger for a future consumer. The Authorization route therefore acts only
  on authorizations that already exist.
- **Server-atomic prepare → request.** An authorization request is created only
  by `request_authorization` on the Decision or Mission route: candidate terms →
  `prepareDecisionAct` / `prepareMissionAct` → binding → `requestAuthorization`,
  all inside one server call. The binding never reaches the client, and the
  client cannot supply `target`, `authority`, `targetType`, `targetId`,
  `versionHash`, `actionKind` or `binding`. Preparation stays advisory: the
  write path independently rebuilds the candidate and recomputes the binding,
  so changed terms fail `authority_not_effective`.
- **The principal remains session-derived.** Routes may return 401 early for
  ordinary HTTP semantics, but `principal-write` resolves the human from the
  session itself. No identity is ever read from the request body, and a
  service-role or `CRON_SECRET` caller has no session and fails closed.
- **No injection from HTTP.** The domain arg types carry test-only seams —
  `store`, `now`, `projectMode`, `availability` — and `now` is a plain JSON
  string feeding authorization effectiveness. No request object is forwarded:
  domain args are built by an explicit key pick, and those names are rejected
  outright.
- **Mission activation is not execution.** `activate` proves authority and
  appends one lifecycle record. It creates no run, task, Work Package, tool call
  or delegation, and the routes import nothing but the three write boundaries
  and their own HTTP helper. Manager and Workforce are untouched and still
  reached only through `/api/manager`.
- **Same-origin protection.** These three authority-writing routes require an
  `Origin` equal to the request's own full origin — scheme, host **and** port,
  with proxy-forwarded values parsed defensively and failing closed. Comparing
  hosts alone would not be a same-origin check: `http://` and `https://` on the
  same host are different origins. It is edge protection layered on the Supabase
  cookie's inherited `SameSite=Lax`, not a replacement for session
  authentication or project authority.
- **No UI requirement.** FM.2 Stage 1 excludes the full Approval Inbox and
  Executive Graph interfaces; authenticated API reachability plus the live Atlas
  brief surface is sufficient. UI vNext is untouched.

Unknown and foreign ids remain externally indistinguishable: both map to an
identical `404 {"error":"Not found"}`.

Reachability is proven against the **real** boundary, not a mock: an
authenticated HTTP request reaches the genuine `principal-write` function, which
runs the canonical builder and derive path and appends to an in-memory ledger.
Only the edges are faked — the session seam, the store factories, the project
mode reader and the sanctioned governing-decision read. No production ledger is
touched and no institutional history is invented. **EI-HTTP-DTO-01 — transport canonicalization.** Every structured field the
three Executive routes accept is RECONSTRUCTED at the adapter into the exact
shape its domain interface documents, then handed to the principal-write
boundary. Reconstruction, never filtering: a parser builds a fresh object
holding only the keys its spec names, so an unknown property cannot survive by
riding on an object that was merely inspected. The domain validators
(`validateActionBounds`, `validateSuccessCriteria`, `validateEvidence`,
`validateSnapshot`, `validateAlternatives`, `validateReview`, `validateOutcome`,
and Authorization's condition checks) verify selected properties and then return
the caller's own object — correct for trusted in-process callers, insufficient
for HTTP, where JSON has no types and an `as` cast asserts a shape rather than
establishing one.

This matters because `missionBoundProjection` and the Decision authority binding
fold the material structured fields into the hash a later human authorization is
bound to. An unknown nested key would therefore become permanent, authority-bound
institutional data rather than transport noise.

The parsers live in `lib/atlas/executive/canonicalize.ts` and the three
`canonical-*.ts` modules. Their enum vocabularies are asserted EQUAL to the
domain unions at compile time, and a `StructuredKeys` guard fails the build if
the domain gains a structured client-supplied field that the adapter has not
adjudicated — so this cannot regress into whack-a-mole. Shape only: lifecycle
and authority semantics stay with the domain.

**EI-AUTH-ORDER-01 — equal-timestamp ordering.** `orderAuthorizationEvents` now
sorts by `occurredAt`, then by LIFECYCLE PHASE (requested → decision → reversal),
and only then by `eventId`. Previously the tie-break at an equal instant was
`eventId`, a random UUID, so two events written in the same millisecond received
a random lifecycle order; when a `granted` UUID sorted below its own `requested`,
derivation threw `chain-starts-with-request` after the append had already landed
in an append-only ledger. The phase map is exhaustive over
`AuthorizationEventType`, so a new event type fails to compile until its phase is
stated. Ordering decides sequence, not validity — an impossible chain still fails
closed. No schema change.

The three routes are registered in `tests/isolation/route-manifest.json`, the
repository's official source of truth for API route classification, as
`class: U`, `auth: User`, `serviceRole: true`, `scope: project_id`,
`risk: Medium`, `verified: true`. Because `tests/isolation/**` is outside the
default Vitest include, a normal-suite assertion in
`lib/qa/executive-authority-entrypoint.test.ts` fails if any Executive route
drifts out of the manifest again.

**EI-CRON-OBS-01 — Executive Brief cron observability.** Observed during the EI-S1.6A-R2
controlled smoke: `omnira_cron.call_vercel` dispatched the request successfully, but the pg_net
client response **timed out at ~5 seconds** while Executive generation continued server-side and
completed in **~13 seconds**, persisting real artifacts. The generation did not fail; pg_net
simply stopped waiting for it. The consequence is that the 07:00 UTC scheduled run will record a
timeout every morning whether it succeeded or not, so a genuine future failure would be
indistinguishable from a success in the scheduler's own record. This is an **observability
limitation, not a demonstrated generation failure**. Classified **NON-BLOCKING OPERATIONAL DEBT,
to be re-adjudicated in the final FM.2 review**. Deliberately not fixed here: neither the cron
timeout nor the schedule was altered.

**Executive Intelligence Stage 1 is still NOT complete.** `EI-SCHEMA-01` is closed and
`EI-REACH-01` is implemented but **not yet closed** — it closes only once the entrypoints are
merged and verified in production. Stage 1 completion also still requires the final FM.2
conformance review.
