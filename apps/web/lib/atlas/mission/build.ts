/**
 * lib/atlas/mission/build.ts — construct and validate one immutable mission act.
 *
 * Every invariant is named, so a rejection tells the caller which canonical rule
 * it broke rather than "invalid". Pure: no I/O, no clock read, no randomness
 * beyond the record id.
 */

import { randomUUID } from 'node:crypto'
import {
  MalformedMissionLineageError,
  type MissionActType,
  type MissionApprovalGate,
  type MissionActionBound,
  type MissionAssumption,
  type MissionAuthorityRecord,
  type MissionAuthoritySource,
  type MissionBlocker,
  type MissionBudget,
  type MissionClosure,
  type MissionConstraint,
  type MissionDataScope,
  type MissionDecisionReference,
  type MissionDependency,
  type MissionDependencyObservation,
  type MissionGateResolution,
  type MissionEscalationTrigger,
  type MissionEvidence,
  type MissionEvidenceRequirement,
  type MissionHaltCondition,
  type MissionProgressReport,
  type MissionRecord,
  type MissionReportingRequirement,
  type MissionRisk,
  type MissionSuccessCriterion,
  type MissionToolBound,
  type MissionType,
} from './types'

/** §20.11 — the twelve canonical mission types. An unknown value fails closed. */
export const MISSION_TYPES: readonly MissionType[] = [
  'strategic', 'build', 'investigation', 'validation', 'growth', 'stabilization',
  'risk_reduction', 'recovery', 'learning', 'operational', 'governance', 'autonomy',
] as const

const ACT_TYPES: readonly MissionActType[] = [
  'drafted', 'proposed', 'approved', 'activated', 'amended', 'paused', 'resumed',
  'completed', 'partially_completed', 'failed', 'cancelled', 'superseded', 'archived',
  'progress_reported', 'blocker_raised', 'blocker_cleared', 'evidence_recorded', 'reviewed',
  'dependency_observed', 'gate_resolved',
] as const

function requireText(value: unknown, invariant: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MalformedMissionLineageError(invariant)
  }
  return value
}

function requireIsoTime(value: string, invariant: string): string {
  if (Number.isNaN(Date.parse(value))) throw new MalformedMissionLineageError(invariant)
  return value
}

function validateSuccessCriteria(list: MissionSuccessCriterion[]): MissionSuccessCriterion[] {
  const seen = new Set<string>()
  for (const c of list) {
    requireText(c.criterion, 'success-criterion-text-required')
    if (!['minimum', 'target', 'stretch'].includes(c.level)) {
      throw new MalformedMissionLineageError('success-criterion-level-canonical', c.level)
    }
    // §20.36 — criteria must be non-contradictory; a duplicate is a contradiction
    // waiting to happen at review time.
    if (seen.has(c.criterion)) throw new MalformedMissionLineageError('success-criterion-unique', c.criterion)
    seen.add(c.criterion)
  }
  return list
}

function validateActionBounds(list: MissionActionBound[], invariant: string): MissionActionBound[] {
  const seen = new Set<string>()
  for (const a of list) {
    requireText(a.action, `${invariant}-action-required`)
    if (seen.has(a.action)) throw new MalformedMissionLineageError(`${invariant}-unique`, a.action)
    seen.add(a.action)
  }
  return list
}

function validateBudget(budget: MissionBudget | null): MissionBudget | null {
  if (!budget) return null
  requireText(budget.currency, 'budget-currency-required')
  // Minor units only — no float ever represents money, and a negative ceiling
  // is not a boundary.
  if (!Number.isInteger(budget.limitMinor) || budget.limitMinor < 0) {
    throw new MalformedMissionLineageError('budget-limit-non-negative-integer')
  }
  return budget
}

function validateEvidence(evidence: MissionEvidence | null): MissionEvidence | null {
  if (!evidence) return null
  requireText(evidence.reference, 'evidence-reference-required')
  requireText(evidence.label, 'evidence-label-required')
  // §20.81 — evidence must be project-scoped and current.
  requireText(evidence.scope, 'evidence-scope-required')
  requireIsoTime(requireText(evidence.observedAt, 'evidence-observed-at-required'), 'evidence-observed-at-valid')
  return evidence
}

function validateDecisionRef(ref: MissionDecisionReference | null, projectId: string): MissionDecisionReference | null {
  if (!ref) return null
  requireText(ref.decisionId, 'decision-reference-id-required')
  if (!Number.isInteger(ref.decisionVersion) || ref.decisionVersion < 1) {
    throw new MalformedMissionLineageError('decision-reference-version-positive')
  }
  // §6.117 — a decision from another project can never back this mission.
  if (ref.projectId !== projectId) {
    throw new MalformedMissionLineageError('decision-reference-same-project', ref.projectId)
  }
  requireText(ref.observedStatus, 'decision-reference-status-required')
  requireIsoTime(requireText(ref.observedAt, 'decision-reference-observed-at-required'), 'decision-reference-observed-at-valid')
  return ref
}

function validateAuthorityRecord(record: MissionAuthorityRecord | null): MissionAuthorityRecord | null {
  if (!record) return null
  requireText(record.authorizationId, 'authority-authorization-id-required')
  requireText(record.principalId, 'authority-principal-required')
  requireText(record.actionKind, 'authority-action-kind-required')
  requireText(record.boundVersionHash, 'authority-bound-version-required')
  requireIsoTime(requireText(record.authorityActAt, 'authority-act-at-required'), 'authority-act-at-valid')
  return record
}

function validateClosure(closure: MissionClosure | null): MissionClosure | null {
  if (!closure) return null
  requireText(closure.outcomeSummary, 'closure-outcome-summary-required')
  const outcomes = [
    'capability_created', 'issue_resolved', 'decision_prepared', 'risk_reduced',
    'evidence_produced', 'workflow_validated', 'project_stabilized',
    'opportunity_rejected', 'mission_failed_safely',
  ]
  if (!outcomes.includes(closure.outcomeType)) {
    throw new MalformedMissionLineageError('closure-outcome-type-canonical', closure.outcomeType)
  }
  return closure
}

function validateAuthoritySource(source: MissionAuthoritySource | null): MissionAuthoritySource | null {
  if (!source) return null
  const kinds = ['founder_instruction', 'decision_ledger', 'project_policy', 'budget_mandate', 'portfolio_decision']
  if (!kinds.includes(source.kind)) {
    throw new MalformedMissionLineageError('authority-source-kind-canonical', source.kind)
  }
  requireText(source.reference, 'authority-source-reference-required')
  return source
}

export interface BuildMissionRecordInput {
  type:        MissionActType
  missionId:   string
  projectId:   string
  /** Server-derived human identity. Never taken from an untrusted caller. */
  principalId: string
  occurredAt:  string
  recordId?:   string
  version:     number
  lifecycleGeneration: number

  title:            string
  missionType:      MissionType
  executiveOwner:   string
  missionOwner?:    string | null
  objective:        string
  strategicContext?: string | null
  expectedOutcome?: string | null
  deliverables?:    string[]
  successCriteria?: MissionSuccessCriterion[]
  inScope?:         string[]
  outOfScope?:      string[]
  constraints?:     MissionConstraint[]
  budget?:          MissionBudget | null
  authority?:       MissionActionBound[]
  authoritySource?: MissionAuthoritySource | null
  allowedActions?:  MissionActionBound[]
  forbiddenActions?: MissionActionBound[]
  tools?:           MissionToolBound[]
  dataScope?:       MissionDataScope[]
  dependencies?:    MissionDependency[]
  assumptions?:     MissionAssumption[]
  risks?:           MissionRisk[]
  approvalGates?:   MissionApprovalGate[]
  deadline?:        string | null
  reporting?:       MissionReportingRequirement[]
  escalationTriggers?: MissionEscalationTrigger[]
  stopConditions?:  MissionHaltCondition[]
  pauseConditions?: MissionHaltCondition[]
  completionConditions?: string[]
  evidenceRequirements?: MissionEvidenceRequirement[]

  authorityRecord?: MissionAuthorityRecord | null
  decisionRef?:     MissionDecisionReference | null
  /** §20.75 — the project's atlas_mode when this act occurred. */
  projectMode?:     string | null
  report?:          MissionProgressReport | null
  dependencyObservation?: MissionDependencyObservation | null
  gateResolution?:  MissionGateResolution | null
  blocker?:         MissionBlocker | null
  clearsBlockerId?: string | null
  evidence?:        MissionEvidence | null
  closure?:         MissionClosure | null
  reviewNote?:      string | null
  supersededBy?:    string | null
  reason?:          string | null
}

export function buildMissionRecord(input: BuildMissionRecordInput): MissionRecord {
  requireText(input.missionId, 'mission-id-required')
  // §20.27/§20.244 — every mission must have explicit project scope.
  requireText(input.projectId, 'project-scope-required')
  requireText(input.principalId, 'principal-required')
  requireText(input.title, 'title-required')
  // §20.31 — the objective is what the mission is for.
  requireText(input.objective, 'objective-required')
  requireText(input.executiveOwner, 'executive-owner-required')
  requireIsoTime(input.occurredAt, 'occurred-at-valid')

  if (!ACT_TYPES.includes(input.type)) {
    throw new MalformedMissionLineageError('act-type-canonical', input.type)
  }
  // §20.11 — an unknown mission type fails closed rather than defaulting.
  if (!MISSION_TYPES.includes(input.missionType)) {
    throw new MalformedMissionLineageError('mission-type-canonical', input.missionType)
  }
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new MalformedMissionLineageError('version-positive-integer')
  }
  if (!Number.isInteger(input.lifecycleGeneration) || input.lifecycleGeneration < 0) {
    throw new MalformedMissionLineageError('lifecycle-generation-non-negative')
  }
  if (input.deadline) requireIsoTime(input.deadline, 'deadline-valid')

  const successCriteria = validateSuccessCriteria(input.successCriteria ?? [])
  const authority = validateActionBounds(input.authority ?? [], 'authority')
  const allowedActions = validateActionBounds(input.allowedActions ?? [], 'allowed-action')
  const forbiddenActions = validateActionBounds(input.forbiddenActions ?? [], 'forbidden-action')

  // §20.57 — an action that is both allowed and forbidden is not a boundary, it
  // is an ambiguity, and §20.173 rejects mission ambiguity.
  const forbidden = new Set(forbiddenActions.map(a => a.action))
  for (const a of allowedActions) {
    if (forbidden.has(a.action)) {
      throw new MalformedMissionLineageError('action-not-both-allowed-and-forbidden', a.action)
    }
  }

  const gateIds = new Set<string>()
  for (const gate of input.approvalGates ?? []) {
    requireText(gate.gateId, 'approval-gate-id-required')
    requireText(gate.gate, 'approval-gate-text-required')
    if (gateIds.has(gate.gateId)) throw new MalformedMissionLineageError('approval-gate-id-unique', gate.gateId)
    gateIds.add(gate.gateId)
  }
  const depRefs = new Set<string>()
  for (const dep of input.dependencies ?? []) {
    requireText(dep.reference, 'dependency-reference-required')
    // §20.101 — an observation names a dependency by reference, so references
    // must be unique or a satisfaction could be ambiguous.
    if (depRefs.has(dep.reference)) throw new MalformedMissionLineageError('dependency-reference-unique', dep.reference)
    depRefs.add(dep.reference)
  }

  const budget = validateBudget(input.budget ?? null)
  const decisionRef = validateDecisionRef(input.decisionRef ?? null, input.projectId)
  const authorityRecord = validateAuthorityRecord(input.authorityRecord ?? null)
  const closure = validateClosure(input.closure ?? null)
  const evidence = validateEvidence(input.evidence ?? null)
  const authoritySource = validateAuthoritySource(input.authoritySource ?? null)

  // §20.54/§20.137 — if a Decision Ledger decision is the authority source, the
  // reference must actually be there. And a decision reference without that
  // source would be a fabricated link, which §20.137's permissiveness does not
  // license.
  if (authoritySource?.kind === 'decision_ledger' && !decisionRef) {
    throw new MalformedMissionLineageError('decision-authority-requires-reference')
  }
  if (decisionRef && authoritySource && authoritySource.kind !== 'decision_ledger') {
    throw new MalformedMissionLineageError('decision-reference-requires-decision-authority', authoritySource.kind)
  }

  // Act-specific requirements.
  if (input.type === 'amended' || input.type === 'paused' || input.type === 'failed' || input.type === 'cancelled') {
    requireText(input.reason, `${input.type}-requires-reason`)
  }
  if (input.type === 'superseded') requireText(input.supersededBy, 'supersede-requires-successor')
  if ((input.type === 'completed' || input.type === 'partially_completed') && !closure) {
    throw new MalformedMissionLineageError(`${input.type}-requires-closure`)
  }
  if (input.type === 'progress_reported' && !input.report) {
    throw new MalformedMissionLineageError('report-record-requires-report')
  }
  if (input.type === 'blocker_raised') {
    if (!input.blocker) throw new MalformedMissionLineageError('blocker-record-requires-blocker')
    requireText(input.blocker.blockerId, 'blocker-id-required')
    requireText(input.blocker.reason, 'blocker-reason-required')
  }
  if (input.type === 'blocker_cleared') requireText(input.clearsBlockerId, 'clear-requires-blocker-id')
  if (input.type === 'evidence_recorded' && !evidence) {
    throw new MalformedMissionLineageError('evidence-record-requires-evidence')
  }
  if (input.type === 'reviewed') requireText(input.reviewNote, 'review-record-requires-note')
  if (input.type === 'dependency_observed') {
    if (!input.dependencyObservation) throw new MalformedMissionLineageError('dependency-record-requires-observation')
    requireText(input.dependencyObservation.reference, 'dependency-observation-reference-required')
    if (typeof input.dependencyObservation.satisfied !== 'boolean') {
      throw new MalformedMissionLineageError('dependency-observation-satisfied-boolean')
    }
  }
  if (input.type === 'gate_resolved') {
    if (!input.gateResolution) throw new MalformedMissionLineageError('gate-record-requires-resolution')
    requireText(input.gateResolution.gateId, 'gate-resolution-id-required')
    const outcomes = [
      'approve', 'approve_with_conditions', 'edit_and_approve', 'reject',
      'request_more_evidence', 'request_alternative', 'defer', 'escalate',
    ]
    // §20.73 — only the canonical outcomes exist.
    if (!outcomes.includes(input.gateResolution.outcome)) {
      throw new MalformedMissionLineageError('gate-outcome-canonical', input.gateResolution.outcome)
    }
  }

  return {
    recordId:   input.recordId ?? randomUUID(),
    missionId:  input.missionId,
    type:       input.type,
    occurredAt: input.occurredAt,
    projectId:  input.projectId,
    principalId: input.principalId,
    title:      input.title,
    missionType: input.missionType,
    executiveOwner: input.executiveOwner,
    missionOwner: input.missionOwner ?? null,
    objective:  input.objective,
    strategicContext: input.strategicContext ?? null,
    expectedOutcome: input.expectedOutcome ?? null,
    deliverables: input.deliverables ?? [],
    successCriteria,
    inScope:    input.inScope ?? [],
    outOfScope: input.outOfScope ?? [],
    constraints: input.constraints ?? [],
    budget,
    authority,
    authoritySource,
    allowedActions,
    forbiddenActions,
    tools:      input.tools ?? [],
    dataScope:  input.dataScope ?? [],
    dependencies: input.dependencies ?? [],
    assumptions: input.assumptions ?? [],
    risks:      input.risks ?? [],
    approvalGates: input.approvalGates ?? [],
    deadline:   input.deadline ?? null,
    reporting:  input.reporting ?? [],
    escalationTriggers: input.escalationTriggers ?? [],
    stopConditions: input.stopConditions ?? [],
    pauseConditions: input.pauseConditions ?? [],
    completionConditions: input.completionConditions ?? [],
    evidenceRequirements: input.evidenceRequirements ?? [],
    version:    input.version,
    authorityRecord,
    decisionRef,
    projectMode: input.projectMode ?? null,
    report:     input.report ?? null,
    dependencyObservation: input.dependencyObservation ?? null,
    gateResolution: input.gateResolution ?? null,
    blocker:    input.blocker ?? null,
    clearsBlockerId: input.clearsBlockerId ?? null,
    evidence,
    closure,
    reviewNote: input.reviewNote ?? null,
    supersededBy: input.supersededBy ?? null,
    reason:     input.reason ?? null,
    lifecycleGeneration: input.lifecycleGeneration,
  }
}

export function newMissionId(): string {
  return randomUUID()
}
