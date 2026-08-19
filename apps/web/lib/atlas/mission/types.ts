/**
 * lib/atlas/mission/types.ts — Executive Mission Brief V1 domain (EI-S1.4B).
 *
 * Canonical Chapter 20. A Mission Brief operationalizes direction that a
 * decision authorized (§20.7); it is not the decision, not the authorization,
 * and not the execution.
 *
 * §20.3 makes the Mission Brief "more than a prompt… a structured contract",
 * and §20.213/§20.214 reject prompt-only and task-list-only briefs outright.
 * So every authority- and safety-bearing field here is STRUCTURED and typed.
 * Prose is confined to `objective`, `strategicContext` and free-text summaries
 * that no security decision reads. Nothing in this system parses prose to
 * decide what a mission may do.
 *
 * STATUS IS DERIVED, NEVER STORED. §20.98 names sixteen statuses; this file
 * types all sixteen, but the persisted vocabulary is a much smaller set of
 * immutable acts (`MissionActType`). Four statuses are evaluation predicates
 * over that lineage plus current authority — see `derive.ts`. There is no
 * mutable `status` column anywhere, so two code paths can never disagree about
 * what a mission currently is.
 *
 * MISSION AUTHORITY IS AN OPERATIONAL GATE, NOT A HISTORICAL FACT. This is the
 * load-bearing difference from the Decision Ledger. A decision's approval is
 * past tense and stands forever (§11.180). A mission's authority governs
 * whether THIS version may move toward execution right now, and §20.75 makes
 * mission approval expire when the object changes materially, scope expands,
 * risk changes, the deadline passes, or the project mode changes. Mission
 * readiness is therefore re-evaluated against live Authorization V1 state on
 * every read — the opposite of the ledger's rule, deliberately.
 */

/** §20.25 — stable mission identity across versions. */
export type MissionId = string
/** One immutable act in a mission's lineage. */
export type MissionRecordId = string
/** Authorization V1 proof reference. */
export type AuthorizationId = string

// ── Mission types (§20.11–§20.23) ─────────────────────────────────────────────

/**
 * The twelve canonical mission types, verbatim from §20.11.
 *
 * A mission type is a classification, never a capability: selecting
 * `autonomy` grants exactly as much authority as selecting `learning`, namely
 * none. Authority comes only from `authority` + `authoritySource` and a live
 * Authorization V1 proof (§20.55, No Implied Authority).
 */
export type MissionType =
  | 'strategic'       // §20.12
  | 'build'           // §20.13
  | 'investigation'   // §20.14
  | 'validation'      // §20.15
  | 'growth'          // §20.16
  | 'stabilization'   // §20.17
  | 'risk_reduction'  // §20.18
  | 'recovery'        // §20.19
  | 'learning'        // §20.20
  | 'operational'     // §20.21
  | 'governance'      // §20.22
  | 'autonomy'        // §20.23

// ── Status vocabulary (§20.98) ────────────────────────────────────────────────

/**
 * All sixteen canonical statuses from §20.98.
 *
 * Twelve are the direct consequence of a persisted act; four are derived
 * predicates that no act can fabricate. `derive.ts` documents which is which,
 * and a test asserts the split so a future contributor cannot quietly promote a
 * predicate into a stored flag.
 */
export type MissionStatus =
  | 'draft'                // §20.99  — grants no execution authority
  | 'proposed'             // §20.98
  | 'awaiting_approval'    // §20.98  — DERIVED (§20.172 brief completeness)
  | 'approved'             // §20.100 — authority valid, prerequisites may lag
  | 'ready'                // §20.101 — DERIVED
  | 'active'               // §20.102
  | 'blocked'              // §20.103 — DERIVED (explicit blocker or bad authority)
  | 'paused'               // §20.132
  | 'at_risk'              // §20.104 — DERIVED
  | 'awaiting_review'      // §20.98  — DERIVED (§20.195)
  | 'completed'            // §20.92
  | 'partially_completed'  // §20.94
  | 'failed'               // §20.95
  | 'cancelled'            // §20.96
  | 'superseded'           // §20.97
  | 'archived'             // §20.98

/**
 * The acts actually appended to a mission's lineage.
 *
 * Deliberately smaller than the status vocabulary. `awaiting_approval`,
 * `ready`, `at_risk` and `awaiting_review` have no act: they are conditions of
 * the world, and inventing an act for them would let a caller assert a
 * condition instead of satisfying it.
 */
export type MissionActType =
  | 'drafted'              // §20.99
  | 'proposed'             // §20.98
  | 'approved'             // §20.100 — authority act
  | 'activated'            // §20.105 — authority act
  | 'amended'              // §20.126 — authority act, creates version N+1
  | 'paused'               // §20.132
  | 'resumed'              // §20.133
  | 'completed'            // §20.92
  | 'partially_completed'  // §20.94
  | 'failed'               // §20.95
  | 'cancelled'            // §20.96  — authority act
  | 'superseded'           // §20.97  — authority act
  | 'archived'             // §20.98
  // ── Annotations: record something ABOUT a mission without moving it ────────
  | 'progress_reported'    // §20.78
  | 'blocker_raised'       // §20.103 — "The blocker should be explicit."
  | 'blocker_cleared'      // resolves a raised blocker; §20.87 no silent blockers
  | 'evidence_recorded'    // §20.80/§20.81
  | 'reviewed'             // §20.195

// ── Structured safety fields (§20.42–§20.61) ──────────────────────────────────

/** §20.46–§20.51 — a typed constraint, never free prose a gate must parse. */
export interface MissionConstraint {
  kind: 'technical' | 'product' | 'governance' | 'capacity' | 'time'
  statement: string
}

/**
 * §20.56/§20.57 — allowed and forbidden actions.
 *
 * A stable identifier plus human text. The identifier is what the downstream
 * attenuation check compares (EI-S1.4C); the text is for the human approving.
 */
export interface MissionActionBound {
  action: string
  note?: string | null
}

/** §20.58/§20.59 — the tools a mission may use, and how they are narrowed. */
export interface MissionToolBound {
  tool: string
  /** §20.59 — e.g. read-only, specific paths, specific channels. */
  restriction?: string | null
}

/** §20.60/§20.61 — minimum necessary data (§16.186 least privilege). */
export interface MissionDataScope {
  resource: string
  access: 'read' | 'write'
  /** Why this is the minimum necessary, not merely convenient. */
  justification?: string | null
}

/** §20.36–§20.41 — how completion is judged. */
export interface MissionSuccessCriterion {
  criterion: string
  /** §20.39/§20.40/§20.41 — minimum, target or stretch. */
  level: 'minimum' | 'target' | 'stretch'
  /** §20.37/§20.38 — quantitative criteria carry their measure. */
  measure?: string | null
}

/** §20.62–§20.65 — what the mission waits on. */
export interface MissionDependency {
  kind: 'decision' | 'mission' | 'capability' | 'approval' | 'external_provider' | 'project_mode' | 'data'
  reference: string
  /** §20.63/§20.64 — a hard dependency blocks; a soft one degrades. */
  hardness: 'hard' | 'soft'
  /** §20.65 — who owns resolving it. */
  owner?: string | null
  /** Whether it is currently satisfied — §20.101 feeds on this. */
  satisfied: boolean
}

/** §20.66/§20.67 — stated assumptions; the critical ones trigger escalation. */
export interface MissionAssumption {
  assumption: string
  critical: boolean
}

/**
 * §20.68/§20.69 — a risk and its control.
 *
 * Declarative only. FM.2 excludes the Damage Boundary engine, so nothing here
 * evaluates, scores or enforces a risk; these fields record what the human was
 * shown when they approved. Calling this a Damage Boundary would be a lie.
 */
export interface MissionRisk {
  risk: string
  severity: 'low' | 'medium' | 'high'
  /** §20.69 — the control that reduces it. */
  control?: string | null
}

/** §20.71–§20.73 — where execution must pause for a human. */
export interface MissionApprovalGate {
  gate: string
  /** §20.72 — what the approver needs to see. */
  inputs?: string[]
}

/** §20.84/§20.85 — when to escalate, and to whom. */
export interface MissionEscalationTrigger {
  trigger: string
  /** §20.85 — Manager, Project Executive, Portfolio Executive, Founder, … */
  destination: 'manager' | 'project_executive' | 'portfolio_executive' | 'founder' | 'governance' | 'specialist_reviewer'
}

/** §20.88/§20.89 — when execution must cease, and when it may merely wait. */
export interface MissionHaltCondition {
  condition: string
}

/** §20.76–§20.79 — reporting obligations. */
export interface MissionReportingRequirement {
  cadence: 'on_change' | 'daily' | 'weekly' | 'on_completion' | 'quiet_until_exception'
  audience: 'executive' | 'founder'
  /** §20.77 — quiet execution is legitimate; silence about a blocker is not. */
  note?: string | null
}

/** §20.80/§20.81 — what evidence proves completion. */
export interface MissionEvidenceRequirement {
  requirement: string
  kind: 'test_output' | 'screenshot' | 'log' | 'metric' | 'diff' | 'user_validation' | 'policy_evaluation' | 'production_observation'
}

/**
 * §20.52 — the mission's spend BOUNDARY.
 *
 * A ceiling that bounds what may later be authorized, never a spending
 * capability. Nothing in Mission V1 charges, purchases, invoices or bills;
 * actual spend stays behind its own gate. FM.2 excludes autonomous spending.
 */
export interface MissionBudget {
  currency: string
  /** Minor units (öre/cents), so no float ever represents money. */
  limitMinor: number
  note?: string | null
}

// ── Authority (§20.53–§20.55) ─────────────────────────────────────────────────

/**
 * §20.54 — why the mission holds the authority it claims.
 *
 * `decision_ledger` is one source among several; §20.137 is permissive, so a
 * mission with a founder-instruction source must not fabricate a decision link.
 */
export type MissionAuthoritySourceKind =
  | 'founder_instruction'
  | 'decision_ledger'
  | 'project_policy'
  | 'budget_mandate'
  | 'portfolio_decision'

export interface MissionAuthoritySource {
  kind: MissionAuthoritySourceKind
  /** Human-readable identification of the source. */
  reference: string
}

/**
 * §20.24/§20.137 — the governing Decision Ledger decision, when one is the
 * authority source.
 *
 * Provenance is pinned at the moment the mission act occurred so the record can
 * explain itself later without re-reading the ledger — but unlike the ledger's
 * own approval semantics, a mission's readiness IS re-checked against the
 * decision's current state (see `derive.ts` and `principal-read.ts`).
 */
export interface MissionDecisionReference {
  decisionId: string
  /** §11.59 — which version of the decision authorized this direction. */
  decisionVersion: number
  /** Must equal the mission's own project. */
  projectId: string
  /** The decision's derived status when this mission act was recorded. */
  observedStatus: string
  observedAt: string
}

/**
 * Immutable provenance for one mission authority act.
 *
 * Records who exercised authority, under which Authorization V1 proof, for
 * which act, bound to which exact material mission version, and when. The
 * record is historical truth; whether the mission may still ACT is a separate,
 * live question answered by `isMissionOperationallyAuthorized`.
 */
export interface MissionAuthorityRecord {
  authorizationId: AuthorizationId
  /** The principal the authorization itself carried — not merely the caller. */
  principalId: string
  /** mission.approve | mission.activate | mission.amend | mission.cancel | mission.supersede */
  actionKind: string
  /** sha256 over the bound projection of the exact act this authorized. */
  boundVersionHash: string
  authorityActAt: string
}

// ── Reports, blockers, evidence, outcome ──────────────────────────────────────

/** §20.78 — a progress report. Annotation only; never moves the lifecycle. */
export interface MissionProgressReport {
  summary: string
  /** §20.104 — the reporter's own at-risk assessment. */
  atRisk: boolean
  nextStep?: string | null
  decisionRequired?: string | null
}

/** §20.103 — an explicit blocker. §20.87 forbids leaving one silent. */
export interface MissionBlocker {
  blockerId: string
  reason: string
  dependency?: string | null
}

/** §20.80/§20.81 — evidence actually produced. */
export interface MissionEvidence {
  kind: MissionEvidenceRequirement['kind']
  reference: string
  label: string
  observedAt: string
  /** §20.81 — evidence must be project-scoped. */
  scope: string
}

/** §20.198 — canonical mission outcome types. */
export type MissionOutcomeType =
  | 'capability_created'
  | 'issue_resolved'
  | 'decision_prepared'
  | 'risk_reduced'
  | 'evidence_produced'
  | 'workflow_validated'
  | 'project_stabilized'
  | 'opportunity_rejected'
  | 'mission_failed_safely'

/**
 * §20.92/§20.196 — what closing a mission must record.
 *
 * Completion is an assessment of the MISSION's own criteria. §20.93 keeps task
 * completion distinct from mission completion, and no ruling here says anything
 * about whether the governing decision was correct — that stays a separate
 * Decision Ledger act with its own evidence.
 */
export interface MissionClosure {
  outcomeType: MissionOutcomeType
  /** §20.195 — did it achieve its objective? */
  outcomeSummary: string
  /** Which success criteria were judged met, by criterion text. */
  criteriaMet: string[]
  /** §20.196 — known limitations that survive closure. */
  limitations: string[]
  /** §20.196/§20.197 — residual work explicitly transferred, if any. */
  residualWork?: string | null
  /** §20.196 — ownership transfer where needed. */
  ownershipTransferredTo?: string | null
}

// ── The immutable record ──────────────────────────────────────────────────────

/**
 * One appended act in a mission's lineage.
 *
 * Rows are never updated or deleted; a material change is a new version with
 * explicit provenance (§20.126–§20.128). The material mission content is
 * carried on every act so the lineage explains itself without joins.
 */
export interface MissionRecord {
  recordId:   MissionRecordId
  missionId:  MissionId
  type:       MissionActType
  occurredAt: string
  /** §20.27/§20.244 — explicit single project scope. Never null. */
  projectId:  string
  /** The human who performed the act, from the authenticated session. */
  principalId: string

  // ── §20.244 material mission content ────────────────────────────────────────
  title:            string           // §20.26
  missionType:      MissionType      // §20.11
  /** §20.29 — the Executive accountable for the mission existing. */
  executiveOwner:   string
  /** §20.30 — the one accountable owner for delivering the outcome. */
  missionOwner:     string | null
  objective:        string           // §20.31
  /** §20.32/§20.33 — minimized: only what the mission needs to be understood. */
  strategicContext: string | null
  expectedOutcome:  string | null    // §20.34
  deliverables:     string[]         // §20.35
  successCriteria:  MissionSuccessCriterion[]   // §20.36
  inScope:          string[]         // §20.42
  outOfScope:       string[]         // §20.43
  constraints:      MissionConstraint[]         // §20.46
  budget:           MissionBudget | null        // §20.52
  /** §20.53 — what the mission may decide or change. */
  authority:        MissionActionBound[]
  authoritySource:  MissionAuthoritySource | null // §20.54
  allowedActions:   MissionActionBound[]        // §20.56
  forbiddenActions: MissionActionBound[]        // §20.57
  tools:            MissionToolBound[]          // §20.58/§20.59
  dataScope:        MissionDataScope[]          // §20.60/§20.61
  dependencies:     MissionDependency[]         // §20.62
  assumptions:      MissionAssumption[]         // §20.66
  risks:            MissionRisk[]               // §20.68/§20.69
  approvalGates:    MissionApprovalGate[]       // §20.71
  deadline:         string | null               // §20.122
  reporting:        MissionReportingRequirement[] // §20.76
  escalationTriggers: MissionEscalationTrigger[]  // §20.84/§20.85
  stopConditions:   MissionHaltCondition[]      // §20.88
  pauseConditions:  MissionHaltCondition[]      // §20.89
  completionConditions: string[]                // §20.92
  evidenceRequirements: MissionEvidenceRequirement[] // §20.80
  /** §20.127 — version within the lineage; identity stays stable (§20.25). */
  version:          number

  // ── Act-specific payloads ───────────────────────────────────────────────────
  authorityRecord:  MissionAuthorityRecord | null
  decisionRef:      MissionDecisionReference | null
  report:           MissionProgressReport | null
  blocker:          MissionBlocker | null
  /** For `blocker_cleared`: which blocker this resolves. */
  clearsBlockerId:  string | null
  evidence:         MissionEvidence | null
  closure:          MissionClosure | null
  reviewNote:       string | null
  /** §20.97 — set by a `superseded` act. */
  supersededBy:     MissionId | null
  /** §20.126/§20.129 — why: amendment, pause, cancellation, failure. */
  reason:           string | null

  /**
   * Which lifecycle generation this act belongs to: the number of
   * lifecycle-advancing records that preceded it. Annotations consume none.
   * Optimistic concurrency and canonical ordering — not mission content, so it
   * is deliberately not authority-bound. (EI-S1.3B-R3 lesson, carried forward.)
   */
  lifecycleGeneration: number
}

// ── Derived state ─────────────────────────────────────────────────────────────

/** Why a mission is not operationally authorized to move toward execution. */
export type MissionAuthorityReason =
  | 'authorized'
  | 'no_authority_act'
  | 'authorization_invalid'
  | 'governing_decision_invalid'
  | 'superseded_version'

/** §20.106 — the canonical requirements an activation attempt can miss. */
export type MissionRequirement =
  | 'project'          // §20.172
  | 'objective'
  | 'owner'
  | 'success_criteria'
  | 'authority'
  | 'approval_gate'
  | 'deadline'
  | 'stop_condition'
  | 'dependencies'
  | 'tools'
  | 'current_authorization'
  | 'unresolved_blocker'

export interface DerivedMissionState {
  missionId:   MissionId
  status:      MissionStatus
  projectId:   string
  version:     number
  title:       string
  missionType: MissionType
  executiveOwner: string
  missionOwner: string | null
  objective:   string
  strategicContext: string | null
  expectedOutcome: string | null
  deliverables: string[]
  successCriteria: MissionSuccessCriterion[]
  inScope:     string[]
  outOfScope:  string[]
  constraints: MissionConstraint[]
  budget:      MissionBudget | null
  authority:   MissionActionBound[]
  authoritySource: MissionAuthoritySource | null
  allowedActions: MissionActionBound[]
  forbiddenActions: MissionActionBound[]
  tools:       MissionToolBound[]
  dataScope:   MissionDataScope[]
  dependencies: MissionDependency[]
  assumptions: MissionAssumption[]
  risks:       MissionRisk[]
  approvalGates: MissionApprovalGate[]
  deadline:    string | null
  reporting:   MissionReportingRequirement[]
  escalationTriggers: MissionEscalationTrigger[]
  stopConditions: MissionHaltCondition[]
  pauseConditions: MissionHaltCondition[]
  completionConditions: string[]
  evidenceRequirements: MissionEvidenceRequirement[]

  /** The authority proven for the CURRENT version's latest authority act. */
  authorityRecord: MissionAuthorityRecord | null
  decisionRef: MissionDecisionReference | null
  supersededBy: MissionId | null
  closure:     MissionClosure | null

  /** §20.103 — blockers raised and not cleared. §20.87: never silent. */
  openBlockers: MissionBlocker[]
  /** §20.80 — evidence recorded so far, in order. */
  evidence:    MissionEvidence[]
  reviewNotes: string[]
  reports:     MissionProgressReport[]

  /** §20.172 — requirements the brief itself is still missing. */
  missingRequirements: MissionRequirement[]
  /** True once every brief-intrinsic §20.172 requirement is present. */
  briefComplete: boolean

  approvedAt:  string | null
  activatedAt: string | null
  recordCount: number
  lastRecordAt: string
  /** Full lineage in canonical order, for audit (§20.152 traceability). */
  lineage: Array<{ recordId: string; type: MissionActType; occurredAt: string; version: number }>
}

/** The live answer to "may this mission move toward execution right now?" */
export interface MissionOperationalAuthority {
  authorized: boolean
  reason:     MissionAuthorityReason
  /** Detail from the Authorization V1 seam, when it denied. */
  detail?:    string
}

/** §20.101 — readiness is a predicate, never a stored flag. */
export interface MissionReadiness {
  ready:   boolean
  missing: MissionRequirement[]
}

/** Thrown by the pure core when a record chain could not be a real history. */
export class MalformedMissionLineageError extends Error {
  constructor(public readonly invariant: string, detail?: string) {
    super(`mission: invariant ${invariant} failed${detail ? ` (${detail})` : ''}`)
    this.name = 'MalformedMissionLineageError'
  }
}
