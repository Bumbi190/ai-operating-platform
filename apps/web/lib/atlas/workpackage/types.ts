/**
 * lib/atlas/workpackage/types.ts — Chapter 21 Work Package V1.
 *
 * §21.9 — the Manager → Workforce hop. A Work Package is what a Manager hands a
 * Workforce role once it has ACCEPTED a Delegation Envelope: bounded, traceable,
 * assignable, verifiable, properly authorized and appropriately sized (§21.28).
 *
 * ITS PARENT IS THE DELEGATION, NOT THE MISSION. This is the easy thing to get
 * wrong. The Mission is the grandparent; authority reaches a Work Package only
 * through an accepted, currently usable Delegation Envelope, and the chain
 * narrows at every hop:
 *
 *     Mission  ⊇  Delegation Envelope  ⊇  Work Package
 *
 * WHAT THIS IS NOT:
 *   • Not a prompt. No `goal: string`, no `prompt: string`. Prose cannot be
 *     checked for containment, so prose cannot carry authority.
 *   • Not an execution instruction. §21.42 — a Work Package that has been
 *     assigned has been RECEIVED, not started. Nothing here runs.
 *   • Not a workflow run, an agent prompt, an Authorization V1 record or a
 *     Decision Ledger act. It is none of those and writes to none of them.
 *
 * The §21.9 field names are kept as the canonical public model — mission
 * reference, project, task objective, inputs, expected output, authority,
 * constraints, deadline, reporting, escalation — so a reader of Chapter 21 can
 * find each one here without translation.
 */

import type {
  MissionActionBound,
  MissionApprovalGate,
  MissionBudget,
  MissionConstraint,
  MissionDataScope,
  MissionEscalationTrigger,
  MissionHaltCondition,
  MissionReportingRequirement,
  MissionToolBound,
} from '../mission/types'

export type WorkPackageId = string

/**
 * §21.34 — WHO receives the package.
 *
 * `roleId` is an `agents.id`. That table is the repository's real, populated,
 * project-scoped registry of who does work, and it is what the runtime actually
 * resolves: `workflow-executor.ts` and `workflow-runner.ts` look up
 * `step.agent_id` there and fail when it is absent. A free-form role string the
 * system has never heard of is therefore not representable — the id must
 * resolve, in the right project, before a package can be assigned.
 *
 * `roleName` is carried for auditability only. It is a snapshot of what the
 * registry said at assignment time and is never the thing that authorizes.
 */
export interface WorkforceRoleRef {
  roleId: string
  roleName: string
}

/** §21.9 — a declared input the receiving role is given. */
export interface WorkPackageInput {
  /** Stable identifier a dependency can point at. */
  inputId: string
  description: string
  /** Where it comes from: an upstream package, declared data, or the brief. */
  origin: 'delegation' | 'predecessor' | 'data_scope'
  /** For `data_scope` origin, the resource it reads. Must be in scope. */
  resource?: string | null
}

/** §21.9 — what the package is expected to produce. */
export interface WorkPackageOutput {
  outputId: string
  description: string
  /** §21.28 "verifiable" — how completion would be judged, declaratively. */
  verification?: string | null
}

/**
 * §21.29 — task dependencies.
 *
 * CONTRACT DATA ONLY. Stage 1 has no scheduler: nothing here starts a package
 * when a predecessor finishes, and `blockingState` is a declared condition, not
 * an observed one. Recording the dependency is the deliverable; acting on it is
 * a later increment.
 */
export interface WorkPackageDependency {
  /** The package that must precede this one, when there is one. */
  predecessorPackageId?: string | null
  /** Inputs this dependency supplies. */
  requiredInputs: string[]
  /** Outputs it is expected to produce. */
  expectedOutputs: string[]
  /** Who owns the dependency — a Workforce role, or an external owner. */
  owner: string
  /** §21.29 — what "blocked" would mean for this dependency. Declarative. */
  blockingState: string
  /** §21.29 — what happens if it is not satisfied. */
  fallback?: string | null
}

/**
 * §21.9 — the package itself. Every field is a bound or a declared term.
 *
 * `taskObjective` is the one field that may legitimately differ from its
 * parent's wording, because §21.28 gives the Manager decomposition authority.
 * It is OPERATIONAL INTENT: it says what this slice of work is, while every
 * authority question is answered by the structured fields around it. See
 * `attenuate.ts` for exactly which structural subordination is proven, and
 * which semantic subordination deliberately is not claimed.
 */
export interface WorkPackage {
  workPackageId: WorkPackageId

  // ── The authority pin (§21.14/§21.15, inherited through the Delegation) ──
  /** The accepted Delegation this package draws its authority from. */
  envelopeId: string
  /** Canonical hash of the exact Delegation terms it was cut from. */
  delegationBoundHash: string
  /** The Mission behind that Delegation, carried for traceability (§21.28). */
  missionId: string
  missionVersion: number
  missionBoundHash: string

  /** §6.117/§21.158 — one project, taken from the authority chain. */
  projectId: string

  assignedRole: WorkforceRoleRef

  // ── §21.9 canonical content ──
  taskObjective: string
  inputs: WorkPackageInput[]
  expectedOutput: WorkPackageOutput[]

  authority: MissionActionBound[]
  allowedActions: MissionActionBound[]
  forbiddenActions: MissionActionBound[]

  constraints: MissionConstraint[]
  tools: MissionToolBound[]
  dataScope: MissionDataScope[]
  budget: MissionBudget | null
  deadline: string | null

  reporting: MissionReportingRequirement[]
  escalationTriggers: MissionEscalationTrigger[]
  stopConditions: MissionHaltCondition[]
  approvalGates: MissionApprovalGate[]

  /** §21.28 — the slice of the Delegation's scope this package works inside. */
  inScope: string[]
  outOfScope: string[]

  dependencies: WorkPackageDependency[]
  /** §21.29 — package-level fallback when the work cannot proceed. */
  fallback: string | null

  /** Version within this package's own lineage. V1 assigns once, at 1. */
  packageVersion: number
  /** Deterministic hash of the authority-bearing terms above. */
  packageHash: string
}

/**
 * §21.40–§21.50 name a full Workforce Operating State. EI-S1.4D implements
 * exactly the part Stage 1 can honestly support.
 *
 *   assigned      §21.42 — the role has RECEIVED the package. Nothing started.
 *   invalidated   the authority chain behind it stopped holding. Derived live,
 *                 never stored: the assignment really happened and history is
 *                 not rewritten to pretend otherwise.
 *
 * Executing, Waiting, Blocked, Escalated, Paused, Completed, Failed and
 * Quarantined are deliberately ABSENT. Each requires real execution and
 * monitoring semantics that this increment does not build, and inventing a
 * value for one of them would be a state the system cannot actually observe.
 */
export type WorkPackageState = 'assigned' | 'invalidated'

/** Why an assigned package is not currently usable. */
export type WorkPackageUnusableReason =
  | 'usable'
  /** The parent Delegation is not accepted-and-usable right now (§21.14). */
  | 'delegation_unusable'
  /** The stored parent pin no longer describes that Delegation. */
  | 'delegation_pin_changed'
  /** The Mission pin behind the Delegation moved. */
  | 'mission_pin_changed'
  /** The package is no longer contained by its Delegation (§6.39). */
  | 'exceeds_delegation'
  /** The assigned role no longer resolves in this project (§21.158). */
  | 'role_unavailable'
  | 'delegation_unreadable'

/** The live answer a caller actually needs. */
export interface WorkPackageEvaluation {
  /** What durably happened. Always `assigned` for a persisted package. */
  lifecycleState: WorkPackageState
  /** What is true right now, once the authority chain is re-checked. */
  effectiveState: WorkPackageState
  usable: boolean
  reason: WorkPackageUnusableReason
  workPackage: WorkPackage
  assignedAt: string
}

/** §21.28 — why a proposed package could not be created. Typed, never prose. */
export type WorkPackageRejectionReason =
  | 'delegation_not_usable'
  | 'exceeds_delegation'
  | 'role_not_found'
  | 'role_project_mismatch'
  | 'role_capability_unproven'
  | 'objective_missing'
  | 'output_undeclared'
  | 'input_unavailable'
  | 'out_of_scope'
  | 'dependency_project_mismatch'
  | 'deadline_infeasible'

export const WORK_PACKAGE_REJECTION_REASONS: readonly WorkPackageRejectionReason[] = [
  'delegation_not_usable',
  'exceeds_delegation',
  'role_not_found',
  'role_project_mismatch',
  'role_capability_unproven',
  'objective_missing',
  'output_undeclared',
  'input_unavailable',
  'out_of_scope',
  'dependency_project_mismatch',
  'deadline_infeasible',
] as const

export interface WorkPackageRejection {
  reason: WorkPackageRejectionReason
  subject?: string | null
  detail?: string | null
}
