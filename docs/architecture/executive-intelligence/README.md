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
- **Status is derived, never stored.** Twelve statuses follow from an immutable act; four —
  Awaiting Approval, Ready, At Risk, Awaiting Review — are predicates over the lineage, the
  clock and live authority, so no caller can assert one instead of satisfying it. There is
  no mutable `status` column anywhere.
- **Authority binds the exact prospective act.** The candidate record is built first and
  hashed over an explicit projection of every §20.126 material field and every other field
  whose post-approval change would alter what the human approved. Change the objective,
  scope, budget, deadline, success criteria, approval gates, risks, tools or action envelope
  and the required authorization changes with it.
- **Mission authority is an OPERATIONAL GATE, not a historical fact.** This is the
  deliberate difference from the Decision Ledger. A decision's approval is past tense and
  stands (§11.180). §20.75 makes mission approval expire when the object changes materially,
  and §20.101 makes Ready depend on valid authority in the present tense — so readiness is
  re-evaluated against live Authorization V1 state on every read, and an expired or revoked
  grant means no NEW handoff may be built on it. History is never rewritten: the `activated`
  act stays exactly where it is (§20.128), and the mission derives `blocked` with an
  explicit reason (§20.103, §20.87).
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

> The `atlas_mission_ledger` migration is committed in the canonical guarded directory but
> **not yet applied**, so `check-migrations.mjs` will fail a Vercel build until a separately
> authorized rollout applies it — deployment blocked by design. Until then:
> **Executive Mission Brief V1 = CODE IMPLEMENTED / SCHEMA UNAPPLIED / NOT YET
> PRODUCTION-OPERATIONAL.**

**Deployment status (EI-S1.3B-R4 verified; EI-S1.4B pending rollout):**

| Item | State |
|---|---|
| Human Authorization V1 | **IMPLEMENTED** — `atlas_authorizations`, applied and verified |
| Chapter 11 Decision Ledger V1 | **IMPLEMENTED / PRODUCTION SCHEMA READY** |
| Decision Ledger migration | `apps/web/supabase/migrations/20260819_atlas_decision_ledger.sql`, ledger name `atlas_decision_ledger` |
| Schema | **APPLIED AND VERIFIED — SCHEMA_EQUIVALENT** |
| Production initial row count | **0** |
| Migration guard | **36 enforced / 0 missing**, no override, nothing grandfathered |
| Executive Mission Brief V1 | **CODE IMPLEMENTED / SCHEMA UNAPPLIED / NOT YET PRODUCTION-OPERATIONAL** |
| Mission migration | `apps/web/supabase/migrations/20260819_atlas_mission_ledger.sql`, ledger name `atlas_mission_ledger` |
| Executive → Manager handoff | **NOT STARTED** |
| Manager → Workforce handoff | **NOT STARTED** |
| Executive Intelligence Stage 1 | **STILL NOT COMPLETE** |

Verified read-only against the production catalogs after application: `lifecycle_generation`
present and no stale `base_record_count`; the append-only BEFORE UPDATE and BEFORE DELETE reject
triggers both enabled; RLS enabled with **zero** policies and no direct `anon`, `authenticated`
or `public` grant; the lifecycle concurrency index present with exactly the nine advancing types
in its predicate and annotations correctly absent; the lineage index carrying
`lifecycle_generation`; and the migration registered exactly once. No seed rows, no test rows,
no backfill.

**Still open, tracked for later EI-S1 increments:** the safe Manager/Workforce handoff
(EI-S1.4C and EI-S1.4D), the remaining principal-scoped read hardening on the internal
`CRON_SECRET` intelligence route, and the final FM.2 conformance review.

Carried forward: **AUTH-GAP-01** (the general approval route authenticates the reviewer but does
not persist that reviewer identity — a separate, narrowly scoped security follow-up),
**AK-PRELIVE-01** (Architecture Knowledge index/memory optimisation before live grounding),
**R2-PROV-01** (the `atlas_authorizations` payload was schema-equivalent but not byte-identical
to its repository file; the Decision Ledger rollout did not repeat that, differing only by a
trailing newline), **§11.61 non-material Decision Ledger corrections deferred** beyond V1 (Mission V1 makes
the same ruling: every mission amendment is material and takes the full authority path), and
physical deletion of `lib/atlas/executive.ts` once the UI branch migrates.

**Executive Intelligence Stage 1 is still NOT complete.**
