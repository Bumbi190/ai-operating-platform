/**
 * Canonical transport shapes for the Mission HTTP surface (EI-HTTP-DTO-01).
 *
 * Every structured field a client can send to `POST /api/atlas/executive/mission`
 * is reconstructed here into the exact interface `lib/atlas/mission/types.ts`
 * documents. `missionBoundProjection` folds the material ones — constraints,
 * authority, allowedActions, forbiddenActions, tools, dataScope, dependencies,
 * assumptions, risks, approvalGates, reporting, escalationTriggers,
 * stopConditions, pauseConditions, evidenceRequirements, decisionRef — into the
 * hash a human authorization is bound to, so an unknown nested key here would
 * become authority-bound institutional data.
 *
 * Enum vocabularies are copied from the domain unions. They are asserted
 * equal to those unions at compile time below, so a domain vocabulary change
 * breaks the build here instead of silently narrowing or widening the surface.
 */
import type {
  MissionActionBound, MissionApprovalGate, MissionAssumption, MissionAuthoritySource,
  MissionBudget, MissionClosure, MissionConstraint, MissionDataScope, MissionDecisionReference,
  MissionDependency, MissionEscalationTrigger, MissionEvidence, MissionEvidenceRequirement,
  MissionHaltCondition, MissionReportingRequirement, MissionRisk, MissionSuccessCriterion,
  MissionToolBound, MissionType,
} from '@/lib/atlas/mission/types'
import { REJECT, arrayOf, bool, enumOf, f, int, objectOf, opt, optNull, str, text, type Parser } from './canonicalize'

/**
 * Compile-time proof that a transport vocabulary is EXACTLY its domain union —
 * neither missing a member (which would reject legal input) nor inventing one
 * (which would admit input the domain will not honour).
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
const exact = <T extends true>(_ok: T) => undefined

const MISSION_TYPES = [
  'strategic', 'build', 'investigation', 'validation', 'growth', 'stabilization',
  'risk_reduction', 'recovery', 'learning', 'operational', 'governance', 'autonomy',
] as const
exact<Exact<(typeof MISSION_TYPES)[number], MissionType>>(true)

const CONSTRAINT_KINDS = ['technical', 'product', 'governance', 'capacity', 'time'] as const
exact<Exact<(typeof CONSTRAINT_KINDS)[number], MissionConstraint['kind']>>(true)

const CRITERION_LEVELS = ['minimum', 'target', 'stretch'] as const
exact<Exact<(typeof CRITERION_LEVELS)[number], MissionSuccessCriterion['level']>>(true)

const DATA_ACCESS = ['read', 'write'] as const
exact<Exact<(typeof DATA_ACCESS)[number], MissionDataScope['access']>>(true)

const DEPENDENCY_KINDS = [
  'decision', 'mission', 'capability', 'approval', 'external_provider', 'project_mode', 'data',
] as const
exact<Exact<(typeof DEPENDENCY_KINDS)[number], MissionDependency['kind']>>(true)

const DEPENDENCY_HARDNESS = ['hard', 'soft'] as const
exact<Exact<(typeof DEPENDENCY_HARDNESS)[number], MissionDependency['hardness']>>(true)

const RISK_SEVERITY = ['low', 'medium', 'high'] as const
exact<Exact<(typeof RISK_SEVERITY)[number], MissionRisk['severity']>>(true)

const ESCALATION_DESTINATIONS = [
  'manager', 'project_executive', 'portfolio_executive', 'founder', 'governance',
  'specialist_reviewer',
] as const
exact<Exact<(typeof ESCALATION_DESTINATIONS)[number], MissionEscalationTrigger['destination']>>(true)

const REPORTING_CADENCE = [
  'on_change', 'daily', 'weekly', 'on_completion', 'quiet_until_exception',
] as const
exact<Exact<(typeof REPORTING_CADENCE)[number], MissionReportingRequirement['cadence']>>(true)

const REPORTING_AUDIENCE = ['executive', 'founder'] as const
exact<Exact<(typeof REPORTING_AUDIENCE)[number], MissionReportingRequirement['audience']>>(true)

const EVIDENCE_KINDS = [
  'test_output', 'screenshot', 'log', 'metric', 'diff', 'user_validation',
  'policy_evaluation', 'production_observation',
] as const
exact<Exact<(typeof EVIDENCE_KINDS)[number], MissionEvidenceRequirement['kind']>>(true)

const AUTHORITY_SOURCE_KINDS = [
  'founder_instruction', 'decision_ledger', 'project_policy', 'budget_mandate',
  'portfolio_decision',
] as const
exact<Exact<(typeof AUTHORITY_SOURCE_KINDS)[number], MissionAuthoritySource['kind']>>(true)

const OUTCOME_TYPES = [
  'capability_created', 'issue_resolved', 'decision_prepared', 'risk_reduced',
  'evidence_produced', 'workflow_validated', 'project_stabilized', 'opportunity_rejected',
  'mission_failed_safely',
] as const
exact<Exact<(typeof OUTCOME_TYPES)[number], MissionClosure['outcomeType']>>(true)

// ── Canonical structured parsers, one per documented interface ───────────────

/**
 * `MissionActionBound` — action, note?.
 *
 * Serves `authority`, `allowedActions` and `forbiddenActions`, the three fields
 * that share `build.ts:validateActionBounds`.
 */
export const actionBound: Parser<MissionActionBound> =
  objectOf<MissionActionBound>({ action: f(text), note: optNull(str) })

/**
 * `authority` collides by name with a raw `RequestedAuthority`. A caller sending
 * that shape is refused VISIBLY rather than quietly reduced, so the attempt
 * stays legible; the other two fields simply never reconstruct those keys.
 */
export const authorityActionBound: Parser<MissionActionBound> = value => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>
    if ('actionKind' in candidate || 'description' in candidate) return REJECT
  }
  return actionBound(value)
}

export const constraint: Parser<MissionConstraint> =
  objectOf<MissionConstraint>({ kind: f(enumOf(CONSTRAINT_KINDS)), statement: f(str) })

export const successCriterion: Parser<MissionSuccessCriterion> =
  objectOf<MissionSuccessCriterion>({
    criterion: f(str), level: f(enumOf(CRITERION_LEVELS)), measure: optNull(str),
  })

export const toolBound: Parser<MissionToolBound> =
  objectOf<MissionToolBound>({ tool: f(str), restriction: optNull(str) })

export const dataScope: Parser<MissionDataScope> =
  objectOf<MissionDataScope>({
    resource: f(str), access: f(enumOf(DATA_ACCESS)), justification: optNull(str),
  })

export const dependency: Parser<MissionDependency> =
  objectOf<MissionDependency>({
    kind: f(enumOf(DEPENDENCY_KINDS)), reference: f(str),
    hardness: f(enumOf(DEPENDENCY_HARDNESS)), owner: optNull(str),
  })

export const assumption: Parser<MissionAssumption> =
  objectOf<MissionAssumption>({ assumption: f(str), critical: f(bool) })

export const risk: Parser<MissionRisk> =
  objectOf<MissionRisk>({
    risk: f(str), severity: f(enumOf(RISK_SEVERITY)), control: optNull(str),
  })

export const approvalGate: Parser<MissionApprovalGate> =
  objectOf<MissionApprovalGate>({
    gateId: f(str), gate: f(str), inputs: opt(arrayOf(str)),
  })

export const escalationTrigger: Parser<MissionEscalationTrigger> =
  objectOf<MissionEscalationTrigger>({
    trigger: f(str), destination: f(enumOf(ESCALATION_DESTINATIONS)),
  })

export const haltCondition: Parser<MissionHaltCondition> =
  objectOf<MissionHaltCondition>({ condition: f(str) })

export const reportingRequirement: Parser<MissionReportingRequirement> =
  objectOf<MissionReportingRequirement>({
    cadence: f(enumOf(REPORTING_CADENCE)), audience: f(enumOf(REPORTING_AUDIENCE)),
    note: optNull(str),
  })

export const evidenceRequirement: Parser<MissionEvidenceRequirement> =
  objectOf<MissionEvidenceRequirement>({
    requirement: f(str), kind: f(enumOf(EVIDENCE_KINDS)),
  })

export const budget: Parser<MissionBudget> =
  objectOf<MissionBudget>({ currency: f(str), limitMinor: f(int), note: optNull(str) })

export const authoritySource: Parser<MissionAuthoritySource> =
  objectOf<MissionAuthoritySource>({
    kind: f(enumOf(AUTHORITY_SOURCE_KINDS)), reference: f(str),
  })

export const decisionRef: Parser<MissionDecisionReference> =
  objectOf<MissionDecisionReference>({ decisionId: f(str), decisionVersion: f(int) })

/** `close` act — the closure record persisted into the immutable Mission. */
export const closure: Parser<MissionClosure> =
  objectOf<MissionClosure>({
    outcomeType: f(enumOf(OUTCOME_TYPES)), outcomeSummary: f(str),
    criteriaMet: f(arrayOf(str)), limitations: f(arrayOf(str)),
    residualWork: optNull(str), ownershipTransferredTo: optNull(str),
  })

/** `evidence` act — recorded evidence, project-scoped. */
export const evidence: Parser<MissionEvidence> =
  objectOf<MissionEvidence>({
    kind: f(enumOf(EVIDENCE_KINDS)), reference: f(str), label: f(str),
    observedAt: f(str), scope: f(str),
  })

// Re-exported so an adapter can compose parsers through a single import.
export { arrayOf, nullable, isRejected } from './canonicalize'
/** `string[]` — deliverables, inScope, outOfScope, completionConditions. */
export const arrayOfStr: Parser<string[]> = arrayOf(str)
