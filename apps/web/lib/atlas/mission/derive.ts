/**
 * lib/atlas/mission/derive.ts — Executive Mission Brief V1 pure core.
 *
 * Deterministic derivation of mission state from an immutable act lineage.
 * Zero I/O: no database, no network, no filesystem, no clock read — evaluation
 * time is injected, so identical records plus identical `at` always yield
 * identical output.
 *
 * THREE PROPERTIES ARE LOAD-BEARING.
 *
 *  1. STATUS IS DERIVED, NEVER STORED (§20.98). Twelve of the sixteen canonical
 *     statuses follow from the latest lifecycle act; four are predicates over
 *     the lineage, the clock, and — for `ready` and `blocked` — live authority
 *     supplied by the caller. No act can assert a predicate, so a caller cannot
 *     declare a mission Ready that is not.
 *
 *  2. IDENTITY IS STABLE, VERSIONS ACCUMULATE (§20.25, §20.126, §20.127). A
 *     material amendment appends version N+1; version N stays in the chain and
 *     is never rewritten (§20.128, no silent mission mutation).
 *
 *  3. A MATERIAL AMENDMENT EXPIRES THE PRIOR APPROVAL (§20.75). This is the
 *     deliberate difference from the Decision Ledger. A decision's approval is
 *     past tense and stands (§11.180). Mission approval "should expire if the
 *     object changes materially", so an amended mission falls back to
 *     `proposed` and needs fresh, exact authority before it can be approved,
 *     activated or handed off again. Canon settles this explicitly, so the
 *     fail-closed reading is derivation, not invention.
 *
 * This module is also the PREFLIGHT for every write: the boundary folds
 * `[...existing lineage, candidate]` here BEFORE it appends, so a transition
 * this function would refuse can never reach an append-only table.
 */

import {
  MalformedMissionLineageError,
  type DerivedMissionState,
  type MissionActType,
  type MissionBlocker,
  type MissionEvidence,
  type MissionOperationalAuthority,
  type MissionProgressReport,
  type MissionReadiness,
  type MissionRecord,
  type MissionRequirement,
  type MissionStatus,
} from './types'

/** Acts that open a mission. */
const OPENING = new Set<MissionActType>(['drafted', 'proposed'])
/** Acts that close a mission for good. */
const TERMINAL = new Set<MissionActType>([
  'completed', 'partially_completed', 'failed', 'cancelled', 'superseded',
])
/** Acts that record something ABOUT a mission without moving it. */
const ANNOTATING = new Set<MissionActType>([
  'progress_reported', 'blocker_raised', 'blocker_cleared', 'evidence_recorded', 'reviewed',
])

/**
 * The acts that ADVANCE a mission's lifecycle.
 *
 * The single definition. The write boundary counts them to stamp
 * `lifecycleGeneration`, the ordering below uses them to break timestamp ties,
 * and the migration's serialization index lists exactly these — a test compares
 * the SQL against this set so the two cannot drift.
 *
 * Annotations are absent by design: a progress report, a blocker, a piece of
 * evidence or a review says something about the mission without changing where
 * it is, so none may consume a generation or collide with one. Counting rows
 * instead of acts is precisely the bug EI-S1.3B-R3 found in the Decision
 * Ledger, and it is not repeated here.
 */
export const MISSION_LIFECYCLE_ADVANCING: ReadonlySet<MissionActType> = new Set<MissionActType>([
  'drafted', 'proposed', 'approved', 'activated', 'amended', 'paused', 'resumed',
  'completed', 'partially_completed', 'failed', 'cancelled', 'superseded', 'archived',
])

/** The generation an act derived from this lineage belongs to. */
export function missionLifecycleGenerationOf(records: MissionRecord[]): number {
  return records.reduce((n, r) => n + (MISSION_LIFECYCLE_ADVANCING.has(r.type) ? 1 : 0), 0)
}

// ── Ordering ──────────────────────────────────────────────────────────────────

/**
 * Deterministic lineage order: time, then lifecycle generation, then
 * annotations before the act that leaves their generation, then record id.
 *
 * The generation tiebreak is load-bearing rather than cosmetic. Record ids are
 * random UUIDs, so ordering two same-millisecond lifecycle acts by id alone is
 * a coin flip — which in the Decision Ledger made roughly half of all
 * same-millisecond pairs fold in the wrong order and become permanently
 * unreadable. Generation is a canonical per-mission sequence, so the correct
 * order is a fact about the data.
 *
 * Byte-identical duplicates collapse, which makes a retried append safe rather
 * than a contradiction.
 */
export function orderMissionRecords(records: MissionRecord[]): MissionRecord[] {
  const unique = new Map<string, MissionRecord>()
  for (const record of records) {
    const existing = unique.get(record.recordId)
    if (existing && JSON.stringify(existing) !== JSON.stringify(record)) {
      throw new MalformedMissionLineageError('record-id-stable', record.recordId)
    }
    unique.set(record.recordId, record)
  }
  const rank = (r: MissionRecord) => (MISSION_LIFECYCLE_ADVANCING.has(r.type) ? 1 : 0)
  return [...unique.values()].sort((a, b) => {
    const at = Date.parse(a.occurredAt)
    const bt = Date.parse(b.occurredAt)
    if (Number.isNaN(at) || Number.isNaN(bt)) {
      throw new MalformedMissionLineageError('record-timestamp-valid')
    }
    return at - bt
      || a.lifecycleGeneration - b.lifecycleGeneration
      || rank(a) - rank(b)
      || (a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0)
  })
}

// ── Lifecycle transition matrix (§§20.99–20.106, §20.132, §20.133) ────────────
//
// Legal SOURCE states for each act, evaluated against the persisted lifecycle
// state (never the derived predicates — a predicate is not a place a mission
// can be). Anything not listed is refused. Fail closed.

/** The persisted lifecycle states — the subset a stored act can produce. */
type LifecycleState =
  | 'draft' | 'proposed' | 'approved' | 'active' | 'paused'
  | 'completed' | 'partially_completed' | 'failed' | 'cancelled' | 'superseded' | 'archived'

const LEGAL_SOURCE: Record<string, ReadonlySet<LifecycleState>> = {
  // §20.98 — a draft may be submitted for review.
  proposed:  new Set<LifecycleState>(['draft']),
  // §20.100 — an authorized actor approves a proposal. An amended mission
  // returns to `proposed` (§20.75), so it re-enters here for fresh approval.
  approved:  new Set<LifecycleState>(['proposed']),
  // §20.105 — activation crosses the sanctioned boundary from Approved.
  activated: new Set<LifecycleState>(['approved']),
  // §20.126 — amend a live mission. §20.128 forbids rewriting; §20.60 keeps
  // history immutable, so a closed mission is amended by superseding it.
  amended:   new Set<LifecycleState>(['proposed', 'approved', 'active', 'paused']),
  // §20.132 — pause something that is running.
  paused:    new Set<LifecycleState>(['active']),
  // §20.133 — restart a paused mission.
  resumed:   new Set<LifecycleState>(['paused']),
  // §20.92 — completion follows execution, so the mission must have run.
  completed: new Set<LifecycleState>(['active', 'paused']),
  // §20.94 — minimum outcome achieved, target blocked.
  partially_completed: new Set<LifecycleState>(['active', 'paused']),
  // §20.95 — a mission may fail once it exists as a commitment.
  failed:    new Set<LifecycleState>(['approved', 'active', 'paused']),
  // §20.96 — cancellation is not failure; anything not yet closed may cancel.
  cancelled: new Set<LifecycleState>(['draft', 'proposed', 'approved', 'active', 'paused']),
  // §20.97 — replaced by a newer mission.
  superseded: new Set<LifecycleState>(['proposed', 'approved', 'active', 'paused']),
  // §20.98 — archival is terminal bookkeeping over an already-closed mission.
  archived:  new Set<LifecycleState>(['completed', 'partially_completed', 'failed', 'cancelled', 'superseded']),
}

/** Which acts require their own Authorization V1 proof. */
export const MISSION_AUTHORITY_ACTS: ReadonlySet<MissionActType> = new Set<MissionActType>([
  'approved', 'activated', 'amended', 'cancelled', 'superseded',
])

// ── Brief completeness (§20.172) ──────────────────────────────────────────────

/**
 * §20.172 — "The system should detect missing: Owner. Project. Objective.
 * Success criteria. Authority. Approval gate. Deadline. Stop condition."
 *
 * Brief-intrinsic only: these are answerable from the mission record alone.
 * Dependencies, tools, live authorization and open blockers are conditions of
 * the world and belong to readiness (§20.101), not completeness.
 */
export function missingBriefRequirements(record: MissionRecord): MissionRequirement[] {
  const missing: MissionRequirement[] = []
  if (!record.projectId) missing.push('project')
  if (!record.objective?.trim()) missing.push('objective')
  if (!record.missionOwner?.trim()) missing.push('owner')
  if (record.successCriteria.length === 0) missing.push('success_criteria')
  if (record.authority.length === 0 || !record.authoritySource) missing.push('authority')
  if (record.approvalGates.length === 0) missing.push('approval_gate')
  if (!record.deadline) missing.push('deadline')
  if (record.stopConditions.length === 0) missing.push('stop_condition')
  return missing
}

// ── Derivation ────────────────────────────────────────────────────────────────

/**
 * Fold a lineage into current state. Raises on any chain that could not be a
 * real history — reading a broken institutional record permissively is exactly
 * the wrong failure mode.
 */
export function deriveMissionState(
  records: MissionRecord[],
  options: { at: string },
): DerivedMissionState {
  const ordered = orderMissionRecords(records)
  if (ordered.length === 0) throw new MalformedMissionLineageError('lineage-non-empty')

  const first = ordered[0]
  if (!OPENING.has(first.type)) {
    throw new MalformedMissionLineageError('lineage-starts-with-draft-or-proposal', first.type)
  }

  const missionId = first.missionId
  const projectId = first.projectId
  if (!projectId) throw new MalformedMissionLineageError('project-scope-required')

  let state: LifecycleState = first.type === 'drafted' ? 'draft' : 'proposed'
  let current = first
  let version = first.version
  let approvedAt: string | null = null
  let activatedAt: string | null = null
  let supersededBy: string | null = null
  let closure = first.closure
  /** Authority for the CURRENT version only — an amendment retires the old. */
  let authorityRecord = null as MissionRecord['authorityRecord']
  let decisionRef = first.decisionRef

  const blockers = new Map<string, MissionBlocker>()
  const evidence: MissionEvidence[] = []
  const reviewNotes: string[] = []
  const reports: MissionProgressReport[] = []

  for (const [index, record] of ordered.entries()) {
    if (record.missionId !== missionId) {
      throw new MalformedMissionLineageError('single-mission-lineage', record.recordId)
    }
    // §20.27/§20.126 — project is material and fixed. A different project is a
    // different mission, never an amendment.
    if (record.projectId !== projectId) {
      throw new MalformedMissionLineageError('project-scope-stable', record.recordId)
    }
    if (!record.principalId) {
      throw new MalformedMissionLineageError('principal-required', record.recordId)
    }
    // Every authority act must carry the proof that was verified for it.
    if (MISSION_AUTHORITY_ACTS.has(record.type) && !record.authorityRecord) {
      throw new MalformedMissionLineageError('authority-act-requires-proof', record.recordId)
    }

    if (index === 0) {
      if (record.decisionRef && record.decisionRef.projectId !== projectId) {
        throw new MalformedMissionLineageError('decision-reference-same-project', record.recordId)
      }
      continue
    }

    if (ANNOTATING.has(record.type)) {
      switch (record.type) {
        case 'progress_reported':
          if (!record.report) throw new MalformedMissionLineageError('report-record-requires-report', record.recordId)
          reports.push(record.report)
          break
        case 'blocker_raised':
          if (!record.blocker) throw new MalformedMissionLineageError('blocker-record-requires-blocker', record.recordId)
          blockers.set(record.blocker.blockerId, record.blocker)
          break
        case 'blocker_cleared':
          if (!record.clearsBlockerId) throw new MalformedMissionLineageError('clear-requires-blocker-id', record.recordId)
          if (!blockers.has(record.clearsBlockerId)) {
            throw new MalformedMissionLineageError('clear-requires-open-blocker', record.recordId)
          }
          blockers.delete(record.clearsBlockerId)
          break
        case 'evidence_recorded':
          if (!record.evidence) throw new MalformedMissionLineageError('evidence-record-requires-evidence', record.recordId)
          evidence.push(record.evidence)
          break
        case 'reviewed':
          if (!record.reviewNote) throw new MalformedMissionLineageError('review-record-requires-note', record.recordId)
          reviewNotes.push(record.reviewNote)
          break
      }
      continue
    }

    if (OPENING.has(record.type)) {
      // A proposal may follow a draft; nothing re-opens a settled mission.
      if (record.type !== 'proposed' || state !== 'draft') {
        throw new MalformedMissionLineageError('reopen-not-permitted', record.recordId)
      }
      state = 'proposed'
      current = record
      version = record.version
      continue
    }

    const legal = LEGAL_SOURCE[record.type]
    if (!legal || !legal.has(state)) {
      throw new MalformedMissionLineageError('illegal-transition', `${state}->${record.type}`)
    }

    switch (record.type) {
      case 'approved':
        state = 'approved'
        approvedAt = record.occurredAt
        authorityRecord = record.authorityRecord
        break
      case 'activated':
        state = 'active'
        activatedAt = record.occurredAt
        authorityRecord = record.authorityRecord
        break
      case 'amended': {
        // §20.126 — a material amendment creates a new version.
        if (record.version <= version) {
          throw new MalformedMissionLineageError('amendment-increments-version', record.recordId)
        }
        if (!record.reason) throw new MalformedMissionLineageError('amendment-requires-reason', record.recordId)
        // §20.75 — approval expires when the object changes materially. The new
        // version is NOT approved, so the mission returns to `proposed` and must
        // earn fresh authority. Version N stays in the chain untouched.
        state = 'proposed'
        approvedAt = null
        activatedAt = null
        authorityRecord = null
        version = record.version
        break
      }
      case 'paused':
        if (!record.reason) throw new MalformedMissionLineageError('pause-requires-reason', record.recordId)
        state = 'paused'
        break
      case 'resumed':
        state = 'active'
        break
      case 'completed':
      case 'partially_completed':
        if (!record.closure) throw new MalformedMissionLineageError(`${record.type}-requires-closure`, record.recordId)
        closure = record.closure
        state = record.type === 'completed' ? 'completed' : 'partially_completed'
        break
      case 'failed':
        if (!record.reason) throw new MalformedMissionLineageError('failure-requires-reason', record.recordId)
        state = 'failed'
        break
      case 'cancelled':
        if (!record.reason) throw new MalformedMissionLineageError('cancellation-requires-reason', record.recordId)
        state = 'cancelled'
        break
      case 'superseded':
        // §20.97 — the replacement must be explicit.
        if (!record.supersededBy) throw new MalformedMissionLineageError('supersede-requires-successor', record.recordId)
        supersededBy = record.supersededBy
        state = 'superseded'
        break
      case 'archived':
        state = 'archived'
        break
    }

    if (record.decisionRef && record.decisionRef.projectId !== projectId) {
      throw new MalformedMissionLineageError('decision-reference-same-project', record.recordId)
    }
    if (record.decisionRef) decisionRef = record.decisionRef
    current = record
    if (!TERMINAL.has(record.type) && record.type !== 'archived') version = record.version
  }

  const missingRequirements = missingBriefRequirements(current)

  return {
    missionId,
    status: derivePersistedStatus(state, current, [...blockers.values()], evidence, reviewNotes, reports, options.at),
    projectId,
    version,
    title: current.title,
    missionType: current.missionType,
    executiveOwner: current.executiveOwner,
    missionOwner: current.missionOwner,
    objective: current.objective,
    strategicContext: current.strategicContext,
    expectedOutcome: current.expectedOutcome,
    deliverables: current.deliverables,
    successCriteria: current.successCriteria,
    inScope: current.inScope,
    outOfScope: current.outOfScope,
    constraints: current.constraints,
    budget: current.budget,
    authority: current.authority,
    authoritySource: current.authoritySource,
    allowedActions: current.allowedActions,
    forbiddenActions: current.forbiddenActions,
    tools: current.tools,
    dataScope: current.dataScope,
    dependencies: current.dependencies,
    assumptions: current.assumptions,
    risks: current.risks,
    approvalGates: current.approvalGates,
    deadline: current.deadline,
    reporting: current.reporting,
    escalationTriggers: current.escalationTriggers,
    stopConditions: current.stopConditions,
    pauseConditions: current.pauseConditions,
    completionConditions: current.completionConditions,
    evidenceRequirements: current.evidenceRequirements,
    authorityRecord,
    decisionRef,
    supersededBy,
    closure,
    openBlockers: [...blockers.values()],
    evidence,
    reviewNotes,
    reports,
    missingRequirements,
    briefComplete: missingRequirements.length === 0,
    approvedAt,
    activatedAt,
    recordCount: ordered.length,
    lastRecordAt: ordered[ordered.length - 1].occurredAt,
    lineage: ordered.map(r => ({ recordId: r.recordId, type: r.type, occurredAt: r.occurredAt, version: r.version })),
  }
}

/**
 * Map the persisted lifecycle state onto the canonical §20.98 vocabulary,
 * applying the predicates that need no live authority.
 *
 * `ready` and `blocked`-by-authority additionally need current Authorization V1
 * state, which the pure core cannot resolve — `missionReadiness()` layers those
 * on top, and `principal-read.ts` supplies the live inputs.
 */
function derivePersistedStatus(
  state: LifecycleState,
  current: MissionRecord,
  openBlockers: MissionBlocker[],
  evidence: MissionEvidence[],
  reviewNotes: string[],
  reports: MissionProgressReport[],
  at: string,
): MissionStatus {
  // §20.103 — a blocked mission cannot progress. An explicit unresolved blocker
  // outranks every other running state; §20.87 forbids leaving it silent.
  if (openBlockers.length > 0 && (state === 'active' || state === 'approved')) return 'blocked'

  switch (state) {
    case 'draft':     return 'draft'
    case 'proposed':
      // §20.172 — a proposal a human could not act on is not awaiting approval,
      // it is incomplete. Splitting the two makes the gap visible.
      return missingBriefRequirements(current).length === 0 ? 'awaiting_approval' : 'proposed'
    case 'approved':  return 'approved'
    case 'paused':    return 'paused'
    case 'active': {
      // §20.195 — completion review precedes closure (§20.196). Once the
      // mission's own evidence requirements are satisfied and no review has been
      // recorded, the mission is waiting on a human, not on work.
      if (evidenceSatisfied(current, evidence) && reviewNotes.length === 0) return 'awaiting_review'
      // §20.104 — likely to miss outcome, deadline, cost or quality. Derived
      // from an observable fact (the deadline has passed) or the reporter's own
      // assessment; never from a stored flag someone can set at will.
      if (isPastDeadline(current, at) || reports.some(r => r.atRisk)) return 'at_risk'
      return 'active'
    }
    case 'completed':           return 'completed'
    case 'partially_completed': return 'partially_completed'
    case 'failed':              return 'failed'
    case 'cancelled':           return 'cancelled'
    case 'superseded':          return 'superseded'
    case 'archived':            return 'archived'
  }
}

function isPastDeadline(current: MissionRecord, at: string): boolean {
  return current.deadline != null && Date.parse(current.deadline) < Date.parse(at)
}

/** §20.80 — every declared evidence requirement has at least one matching record. */
function evidenceSatisfied(current: MissionRecord, evidence: MissionEvidence[]): boolean {
  if (current.evidenceRequirements.length === 0) return false
  return current.evidenceRequirements.every(req => evidence.some(e => e.kind === req.kind))
}

/**
 * §20.92 — is the mission's own completion contract satisfied?
 *
 * Pure and evidence-driven. §20.93 keeps task completion distinct from mission
 * completion, and §20.225 forbids completion theatre: absence of failure is
 * never success, so a mission with no evidence and no met criteria cannot close
 * as complete.
 */
export function missionCompletionGaps(
  state: DerivedMissionState,
  closure: { criteriaMet: string[] },
): string[] {
  const gaps: string[] = []
  // §20.80/§20.81 — required evidence must exist.
  for (const req of state.evidenceRequirements) {
    if (!state.evidence.some(e => e.kind === req.kind)) gaps.push(`evidence:${req.kind}`)
  }
  // §20.36 — the minimum success criteria must be judged met.
  const minimums = state.successCriteria.filter(c => c.level === 'minimum')
  if (minimums.length === 0) gaps.push('success_criteria:minimum_undefined')
  for (const c of minimums) {
    if (!closure.criteriaMet.includes(c.criterion)) gaps.push(`success_criteria:${c.criterion}`)
  }
  // §20.92 — approvals resolved: no gate may still be waiting, expressed as an
  // unresolved blocker (§20.103).
  if (state.openBlockers.length > 0) gaps.push('open_blocker')
  // §20.195 — a completion review must have happened.
  if (state.reviewNotes.length === 0) gaps.push('completion_review')
  return gaps
}

/**
 * §20.101 — Ready is a predicate, never a stored flag.
 *
 * "A Ready Mission has: Valid authority. Available dependencies. Assigned
 * owner. Required tools. Active policy. No unresolved blocker."
 *
 * Live authority is injected rather than resolved here, so the pure core stays
 * pure and the caller cannot skip the check by omitting an argument — the
 * parameter is required.
 */
export function missionReadiness(
  state: DerivedMissionState,
  authority: MissionOperationalAuthority,
): MissionReadiness {
  const missing: MissionRequirement[] = [...state.missingRequirements]
  if (!authority.authorized) missing.push('current_authorization')
  if (state.dependencies.some(d => d.hardness === 'hard' && !d.satisfied)) missing.push('dependencies')
  if (state.tools.length === 0) missing.push('tools')
  if (state.openBlockers.length > 0) missing.push('unresolved_blocker')
  // Only an approved mission can be Ready — §20.100 precedes §20.101.
  const approvedOrRunning = state.approvedAt != null
  if (!approvedOrRunning) missing.push('authority')
  return { ready: missing.length === 0, missing: [...new Set(missing)] }
}
