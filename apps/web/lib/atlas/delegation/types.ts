/**
 * lib/atlas/delegation/types.ts — Chapter 21 Delegation Envelope V1.
 *
 * §21.12 — "Delegation is not instruction. It is the transfer of BOUNDED
 * authority." A Manager does not receive a goal and improvise the limits; it
 * receives an envelope in which every limit is already explicit, and it may
 * accept or refuse that envelope for a stated, typed reason.
 *
 * WHAT THIS IS NOT:
 *   • Not a prompt. There is no `prompt: string` and no `goal: string` here.
 *     A string cannot be attenuated, cannot be compared to its parent, and
 *     cannot be checked for containment — so a string cannot carry authority.
 *   • Not a capability token. No signing, no bearer secret, no policy engine.
 *     Authority is re-derived from the live Mission on every use (§21.14).
 *   • Not permission to execute. §21.13 — the tool bound is the MAXIMUM a
 *     Manager could ever reach, never a grant that it may reach it.
 *
 * The envelope is DERIVED from an exact Mission version, never authored beside
 * one. Every bounded field below has a Mission counterpart, and `attenuate.ts`
 * proves containment for each before an envelope may exist at all.
 */

import type {
  MissionActionBound,
  MissionApprovalGate,
  MissionBudget,
  MissionConstraint,
  MissionDataScope,
  MissionDependency,
  MissionEscalationTrigger,
  MissionHaltCondition,
  MissionReportingRequirement,
  MissionSuccessCriterion,
  MissionToolBound,
} from '../mission/types'

export type DelegationId = string

/**
 * §3.5 — Executive defines, Manager coordinates, Workforce executes. Stage 1
 * ships exactly one hop. Workforce delegation is Stage 2 and is deliberately
 * not representable here rather than stubbed.
 */
export type DelegationRole = 'manager'

/** §21.12 — the bounded grant itself. Every field is a limit, not an ask. */
export interface DelegationEnvelope {
  envelopeId: DelegationId
  projectId: string

  /** §21.14 — the exact Mission version this envelope was derived from. */
  missionId: string
  missionVersion: number
  /**
   * Canonical hash of the Mission fields this envelope was cut from. If the
   * Mission is amended, an envelope pinned to the old version stays pinned and
   * this hash still describes what was actually delegated (§21.15).
   */
  missionBoundHash: string

  delegatedTo: DelegationRole

  /** §21.12.1 — the objective, carried verbatim from the Mission. */
  objective: string
  expectedOutcome: string | null
  deliverables: string[]
  successCriteria: MissionSuccessCriterion[]

  /** §21.12.2 — scope. `inScope` may narrow; `outOfScope` may only grow. */
  inScope: string[]
  outOfScope: string[]

  /** §21.12.3 — authority. May narrow, never widen (§6.39). */
  authority: MissionActionBound[]
  allowedActions: MissionActionBound[]
  /** §6.39 — a child may ADD prohibitions; it may never drop an inherited one. */
  forbiddenActions: MissionActionBound[]

  /** §21.13 — maximum reachable tools/data. NOT execution permission. */
  tools: MissionToolBound[]
  dataScope: MissionDataScope[]

  /** §21.12.4 — resource bounds. Never above the Mission's. */
  budget: MissionBudget | null
  deadline: string | null

  /** §21.12.5 — control points. May only be added to. */
  constraints: MissionConstraint[]
  approvalGates: MissionApprovalGate[]
  escalationTriggers: MissionEscalationTrigger[]
  stopConditions: MissionHaltCondition[]
  reporting: MissionReportingRequirement[]

  dependencies: MissionDependency[]
}

/**
 * §21.16 — the typed reasons a Manager may accept or refuse. Free text is not
 * a reason: an Executive cannot act on "didn't work", and an untyped refusal
 * cannot be tested. §21.18 — the contract is two-sided, so refusal is a
 * first-class, structured outcome rather than a failure.
 */
export type DelegationRejectionReason =
  | 'objective_ambiguous'
  | 'authority_insufficient'
  | 'tool_unavailable'
  | 'data_unavailable'
  | 'dependency_unavailable'
  | 'constraint_conflict'
  | 'deadline_infeasible'
  | 'escalation_missing'
  | 'mission_not_current'
  | 'project_mismatch'
  | 'delegation_exceeds_mission'

export const DELEGATION_REJECTION_REASONS: readonly DelegationRejectionReason[] = [
  'objective_ambiguous',
  'authority_insufficient',
  'tool_unavailable',
  'data_unavailable',
  'dependency_unavailable',
  'constraint_conflict',
  'deadline_infeasible',
  'escalation_missing',
  'mission_not_current',
  'project_mismatch',
  'delegation_exceeds_mission',
] as const

/** One stated refusal ground, with the specific subject that failed. */
export interface DelegationRejection {
  reason: DelegationRejectionReason
  /** The tool, resource, dependency or gate the reason is ABOUT. */
  subject?: string | null
  detail?: string | null
}

/**
 * §21.12/§21.16/§21.17 — the acts in a delegation's lineage. Each row in the
 * ledger is exactly one of these, and the envelope's status is DERIVED from
 * the sequence, never stored.
 */
export type DelegationActType =
  | 'delegation.prepared'
  | 'delegation.accepted'
  | 'delegation.rejected'
  | 'delegation.revoked'
  /** §21.20–§21.26 — a Manager-side change classified as merely operational. */
  | 'delegation.replan.operational'
  /** §21.24 — a change that exceeds the envelope and needs Executive review. */
  | 'delegation.replan.referred'

export const DELEGATION_ACT_TYPES: readonly DelegationActType[] = [
  'delegation.prepared',
  'delegation.accepted',
  'delegation.rejected',
  'delegation.revoked',
  'delegation.replan.operational',
  'delegation.replan.referred',
] as const

/**
 * Acts that close the envelope to further acceptance decisions. §21.17 — a
 * rejection ends the handoff; it does NOT fail, cancel or amend the Mission.
 */
export const DELEGATION_TERMINAL_ACTS: readonly DelegationActType[] = [
  'delegation.accepted',
  'delegation.rejected',
  'delegation.revoked',
] as const

/**
 * §21.16 — the DERIVED status. Four of these are predicates over the lineage
 * and live Mission authority, so none is stored as a mutable column.
 */
export type DelegationStatus =
  | 'prepared'
  | 'accepted'
  | 'rejected'
  | 'revoked'
  /** Lineage says accepted, but the parent Mission no longer authorizes it. */
  | 'invalidated'

/**
 * One immutable act. `provenance` is server-derived on every write; a caller
 * cannot assert who they are, and cannot assert an outcome (§21.16).
 */
export interface DelegationRecord {
  recordId: string
  envelopeId: DelegationId
  projectId: string
  actType: DelegationActType
  occurredAt: string

  /**
   * §21.18 — this act's immutable position in its envelope's lineage.
   *
   * EVERY delegation act consumes one position: prepared is 0, and each later
   * act takes the next. This is deliberately NOT the Mission ledger's
   * `lifecycle_generation`, and the name says so. There, annotations record
   * something ABOUT a mission without moving it, so they consume no generation.
   * Here there are no annotations: a replan is an ordered institutional act by
   * the Manager, and whether it happened before or after a revocation is
   * exactly the question that must have one answer.
   *
   * It serves two jobs at once. As CAUSAL ORDER it replaces a wall-clock
   * comparison that fell through to a random `recordId` — before EI-S1.4C-R2,
   * a revocation and a replan stamped in the same millisecond had their order
   * decided by whichever UUID sorted first, so the same two acts told two
   * different stories. As OPTIMISTIC CONCURRENCY it is unique per envelope, so
   * two writers who read the same lineage compute the same next position and
   * exactly one of them can append.
   */
  lineageSequence: number

  missionId: string
  missionVersion: number
  missionBoundHash: string

  /** Present on `delegation.prepared`; null on every later act. */
  envelope: DelegationEnvelope | null

  /** Present on `delegation.rejected`. §21.17 — always typed, never free text. */
  rejections: DelegationRejection[]

  /** Present on the replan acts (§21.20–§21.26). */
  replan: DelegationReplan | null

  /** Server-derived. Never caller-written (§21.19 actor integrity). */
  actorKind: DelegationActorKind
  actorId: string | null

  note: string | null
  revokedReason: DelegationRevocationReason | null
}

/**
 * §21.19 — WHO acted. A service role is not a human, and neither is the
 * Manager's own identity. Conflating the three is how fake provenance enters a
 * ledger, so the three are distinct values and the writer sets them.
 */
export type DelegationActorKind = 'executive_principal' | 'manager' | 'system'

/** §21.27 — why an envelope stopped being usable. */
export type DelegationRevocationReason =
  | 'executive_withdrew'
  | 'mission_no_longer_authorizes'
  | 'mission_amended'
  | 'mission_superseded'

/**
 * §21.20–§21.26 — the replanning boundary. A Manager may re-sequence its own
 * work freely; it may not quietly acquire authority it was not given.
 */
export type DelegationChangeClass =
  | 'operational_change'
  | 'material_change_requires_executive_review'

/** The classified change itself, with the grounds for the classification. */
export interface DelegationReplan {
  changeClass: DelegationChangeClass
  /** Which envelope bounds the proposed change would have exceeded. */
  exceeded: string[]
  summary: string
}

/** §21.16 — the derived view a caller actually reads. */
export interface DerivedDelegationState {
  envelopeId: DelegationId
  projectId: string
  status: DelegationStatus
  envelope: DelegationEnvelope
  missionId: string
  missionVersion: number
  missionBoundHash: string
  preparedAt: string
  decidedAt: string | null
  rejections: DelegationRejection[]
  revokedReason: DelegationRevocationReason | null
  /** §21.24 — referrals raised against this envelope, oldest first. */
  referrals: DelegationReplan[]
}
