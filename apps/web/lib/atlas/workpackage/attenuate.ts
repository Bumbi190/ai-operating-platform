/**
 * lib/atlas/workpackage/attenuate.ts — §6.39 attenuation, one hop further down.
 *
 * `WorkPackage ⊆ DelegationEnvelope`, proven the same way EI-S1.4C proved
 * `DelegationEnvelope ⊆ Mission`: pure, deterministic, no clock, no I/O, no
 * model. The rule does not change just because the parent changed.
 *
 * WHAT IS DIFFERENT AT THIS HOP. A Delegation must carry its Mission's
 * objective verbatim, because delegating is not decomposing. A Work Package
 * may NOT — §21.28 gives the Manager decomposition authority, so `taskObjective`
 * is allowed to be a slice the parent never spells out.
 *
 * That freedom is exactly why the structural bounds have to be tight. Read
 * `taskObjective` as OPERATIONAL INTENT, never as authority: it says which
 * slice of work this is, while every authority question is answered by the
 * fields around it. What this core proves about a decomposition is:
 *
 *   • the objective is non-empty and declares outputs
 *   • every scope item it touches is inside the parent's `inScope`
 *   • it touches nothing in the parent's `outOfScope`
 *   • every declared input maps to a declared origin the parent permits
 *   • actions, tools, data, budget and deadline are all subsets
 *   • it cannot restate the project, Mission, Delegation or their pins
 *
 * What it deliberately does NOT prove is that the prose is *semantically*
 * subordinate. No deterministic function can read two sentences and decide one
 * serves the other, and asking a model would put authority back in a prompt —
 * the precise thing Chapter 21 exists to prevent. So the claim made here is the
 * structural one, and it is not dressed up as more.
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
import type { DelegationEnvelope } from '../delegation/types'
import type {
  WorkPackage,
  WorkPackageDependency,
  WorkPackageInput,
  WorkPackageOutput,
  WorkforceRoleRef,
} from './types'

/**
 * What a Manager may ask for when decomposing.
 *
 * Note what is absent: no `projectId`, no `missionId`, no `envelopeId`, no pin
 * of any kind, and no `forbiddenActions`. Those come from the parent Delegation
 * and cannot be supplied, so no caller can restate them into something wider.
 * The permissive fields are optional — omitting one inherits the parent's value
 * whole, the only default that is never a widening.
 */
export interface WorkPackageRequest {
  /** §21.28 — the decomposed slice. Required; it is the point of the package. */
  taskObjective: string
  /** Who receives it. Validated against the real registry before use. */
  role: WorkforceRoleRef

  inputs: WorkPackageInput[]
  expectedOutput: WorkPackageOutput[]

  /** Omit to inherit. Supply a SUBSET to narrow. Never a superset. */
  authority?: MissionActionBound[]
  allowedActions?: MissionActionBound[]
  tools?: MissionToolBound[]
  dataScope?: MissionDataScope[]
  inScope?: string[]
  budget?: MissionBudget | null
  deadline?: string | null

  /** Additive only — the inherited set is always kept (§6.39). */
  addForbiddenActions?: MissionActionBound[]
  addConstraints?: MissionConstraint[]
  addEscalationTriggers?: MissionEscalationTrigger[]
  addStopConditions?: MissionHaltCondition[]
  addApprovalGates?: MissionApprovalGate[]
  addOutOfScope?: string[]
  addReporting?: MissionReportingRequirement[]

  dependencies?: WorkPackageDependency[]
  fallback?: string | null
}

export interface WorkPackageViolation {
  field: string
  element: string
  rule: 'not_in_parent' | 'exceeds_parent' | 'removes_inherited' | 'malformed'
}

export type WorkPackageAttenuation =
  | { ok: true; package: Omit<WorkPackage, 'workPackageId' | 'packageHash'> }
  | { ok: false; violations: WorkPackageViolation[] }

/**
 * How each Work Package field relates to its parent Delegation.
 *
 *   pin          the authority chain's coordinates; copied, never supplied
 *   assigned     validated against the role registry, not against the parent
 *   decomposed   §21.28 Manager decomposition; structurally bounded below
 *   narrowable   a subset of the parent, per that field's containment rule
 *   restrictive  inherited in full; the child may add but never lose
 *   derived      computed from the content above
 *
 * The guard test enumerates `WorkPackage`'s keys against this map, so a field
 * added later without a containment ruling fails a test rather than silently
 * defaulting to unchecked — the same protection EI-S1.4C gave the envelope.
 */
export const WORK_PACKAGE_FIELD_CLASS = {
  workPackageId:       'derived',
  packageHash:         'derived',
  packageVersion:      'derived',

  envelopeId:          'pin',
  delegationBoundHash: 'pin',
  missionId:           'pin',
  missionVersion:      'pin',
  missionBoundHash:    'pin',
  projectId:           'pin',

  assignedRole:        'assigned',

  taskObjective:       'decomposed',
  inputs:              'decomposed',
  expectedOutput:      'decomposed',
  dependencies:        'decomposed',
  fallback:            'decomposed',

  authority:           'narrowable',
  allowedActions:      'narrowable',
  tools:               'narrowable',
  dataScope:           'narrowable',
  inScope:             'narrowable',
  budget:              'narrowable',
  deadline:            'narrowable',

  forbiddenActions:    'restrictive',
  constraints:         'restrictive',
  escalationTriggers:  'restrictive',
  stopConditions:      'restrictive',
  approvalGates:       'restrictive',
  outOfScope:          'restrictive',
  reporting:           'restrictive',
} as const satisfies Record<
  keyof WorkPackage,
  'pin' | 'assigned' | 'decomposed' | 'narrowable' | 'restrictive' | 'derived'
>

// Canonical element keys — identical semantics to the delegation core, so the
// two hops cannot disagree about what "the same bound" means.

const actionKey = (a: MissionActionBound) => a.action
const constraintKey = (c: MissionConstraint) => `${c.kind} ${c.statement}`
const gateKey = (g: MissionApprovalGate) => g.gateId
const triggerKey = (t: MissionEscalationTrigger) => `${t.trigger} ${t.destination}`
const haltKey = (h: MissionHaltCondition) => h.condition
const reportKey = (r: MissionReportingRequirement) => `${r.cadence} ${r.audience}`
/** Restriction is part of the key: dropping it is a widening, not an omission. */
const toolKey = (t: MissionToolBound) => `${t.tool} ${t.restriction ?? ''}`

const ACCESS_RANK: Record<MissionDataScope['access'], number> = { read: 1, write: 2 }

const containsAll = <T>(
  parent: T[], child: T[], key: (v: T) => string, field: string, out: WorkPackageViolation[],
): T[] => {
  const allowed = new Set(parent.map(key))
  for (const c of child) {
    if (!allowed.has(key(c))) out.push({ field, element: key(c), rule: 'not_in_parent' })
  }
  return child
}

const unionWith = <T>(parent: T[], added: T[], key: (v: T) => string): T[] => {
  const seen = new Set(parent.map(key))
  const result = [...parent]
  for (const a of added) {
    if (!seen.has(key(a))) { seen.add(key(a)); result.push(a) }
  }
  return result
}

const containsDataScope = (
  parent: MissionDataScope[], child: MissionDataScope[], out: WorkPackageViolation[],
): MissionDataScope[] => {
  const best = new Map<string, number>()
  for (const p of parent) {
    best.set(p.resource, Math.max(best.get(p.resource) ?? 0, ACCESS_RANK[p.access]))
  }
  for (const c of child) {
    if ((best.get(c.resource) ?? 0) < ACCESS_RANK[c.access]) {
      out.push({ field: 'dataScope', element: `${c.resource}:${c.access}`, rule: 'not_in_parent' })
    }
  }
  return child
}

const containsBudget = (
  parent: MissionBudget | null, child: MissionBudget | null | undefined, out: WorkPackageViolation[],
): MissionBudget | null => {
  if (child === undefined) return parent
  if (child === null) return null
  if (!parent) {
    out.push({ field: 'budget', element: `${child.currency}:${child.limitMinor}`, rule: 'not_in_parent' })
    return null
  }
  if (child.currency !== parent.currency) {
    out.push({ field: 'budget', element: child.currency, rule: 'exceeds_parent' }); return null
  }
  if (!Number.isSafeInteger(child.limitMinor) || child.limitMinor < 0) {
    out.push({ field: 'budget', element: String(child.limitMinor), rule: 'malformed' }); return null
  }
  if (child.limitMinor > parent.limitMinor) {
    out.push({ field: 'budget', element: String(child.limitMinor), rule: 'exceeds_parent' }); return null
  }
  return child
}

const containsDeadline = (
  parent: string | null, child: string | null | undefined, out: WorkPackageViolation[],
): string | null => {
  if (child === undefined) return parent
  if (child === null) {
    if (parent !== null) { out.push({ field: 'deadline', element: 'null', rule: 'removes_inherited' }); return parent }
    return null
  }
  const at = Date.parse(child)
  if (!Number.isFinite(at)) { out.push({ field: 'deadline', element: child, rule: 'malformed' }); return parent }
  if (parent !== null && at > Date.parse(parent)) {
    out.push({ field: 'deadline', element: child, rule: 'exceeds_parent' }); return parent
  }
  return child
}

/**
 * The parent-INDEPENDENT structural rules a Work Package must always satisfy.
 *
 * EI-S1.4D-R2 extracted these so creation and read cannot drift. Before, the
 * rules lived only inside the creation path, and a stored row could be tampered
 * with, re-hashed, and still pass every read-time check: coherence proved the
 * contract had not changed since it was sealed, and containment proved it did
 * not exceed its parent — but neither asked whether the terms were VALID. A
 * package with an empty objective or no declared output is not assignable work,
 * however well-sealed and however contained.
 *
 * Sharing one function is deliberate: an alignment test runs the same malformed
 * terms through creation AND read and requires both to refuse, so a rule added
 * here is automatically enforced at both ends.
 *
 * Parent-relative rules (scope containment, action/tool/data subsets) are NOT
 * here — they need the Delegation and live in the containment checks.
 */
export interface WorkPackageTerms {
  taskObjective: string
  inputs: WorkPackageInput[]
  expectedOutput: WorkPackageOutput[]
  dataScope: MissionDataScope[]
  dependencies: WorkPackageDependency[]
  inScope: string[]
  outOfScope: string[]
  /**
   * Absent at creation, where it is assigned by construction; required on read,
   * where a stored value is data like any other.
   */
  packageVersion?: number
}

/** V1 assigns a package once. A stored row claiming otherwise is not a V1 package. */
export const WORK_PACKAGE_V1_VERSION = 1

export function validateWorkPackageTerms(terms: WorkPackageTerms): WorkPackageViolation[] {
  const out: WorkPackageViolation[] = []

  // §21.28 "appropriately sized" — work with no stated objective is not a slice
  // of anything.
  if (terms.taskObjective.trim().length === 0) {
    out.push({ field: 'taskObjective', element: 'empty', rule: 'malformed' })
  }
  // §21.28 "verifiable" — a package nobody can judge done is not assignable.
  if (terms.expectedOutput.length === 0) {
    out.push({ field: 'expectedOutput', element: 'none', rule: 'malformed' })
  }

  // An input drawn from data scope must name a resource this package may
  // actually read, or the package promises the role data its own bounds deny.
  const readable = new Set(terms.dataScope.map(d => d.resource))
  for (const input of terms.inputs) {
    if (input.origin === 'data_scope' && !readable.has(input.resource ?? '')) {
      out.push({
        field: 'inputs',
        element: `${input.inputId}:${input.resource || 'unnamed'}`,
        rule: 'not_in_parent',
      })
    }
  }

  // §21.29 — a dependency may only require inputs this package declares.
  const declared = new Set(terms.inputs.map(i => i.inputId))
  for (const dep of terms.dependencies) {
    for (const required of dep.requiredInputs) {
      if (!declared.has(required)) {
        out.push({ field: 'dependencies', element: `input:${required}`, rule: 'not_in_parent' })
      }
    }
  }

  // An item cannot be both in and out of scope; the exclusion wins, so a
  // package claiming one is self-contradictory rather than merely ambitious.
  const excluded = new Set(terms.outOfScope)
  for (const s of terms.inScope) {
    if (excluded.has(s)) out.push({ field: 'inScope', element: s, rule: 'not_in_parent' })
  }

  if (terms.packageVersion !== undefined && terms.packageVersion !== WORK_PACKAGE_V1_VERSION) {
    out.push({ field: 'packageVersion', element: String(terms.packageVersion), rule: 'malformed' })
  }

  return out
}

/**
 * §21.28 — prove the decomposition is structurally subordinate.
 *
 * Separated from the bound checks because it answers a different question. The
 * bound checks ask "may this package do that?"; this asks "is this package a
 * slice of the delegated work at all, or a new piece of strategy?"
 */
function checkDecomposition(
  parent: DelegationEnvelope,
  request: WorkPackageRequest,
  effectiveInScope: string[],
  out: WorkPackageViolation[],
): void {
  // The parent-independent rules, from the one shared seam.
  out.push(...validateWorkPackageTerms({
    taskObjective: request.taskObjective,
    inputs: request.inputs,
    expectedOutput: request.expectedOutput,
    dataScope: request.dataScope ?? parent.dataScope,
    dependencies: request.dependencies ?? [],
    inScope: request.inScope ?? effectiveInScope,
    outOfScope: parent.outOfScope,
    // Assigned by construction below, so there is nothing to validate yet.
  }))

  // A package that claims scope its parent never held is not decomposition.
  // Parent-relative, so it stays here rather than in the shared seam.
  const outOfScope = new Set(parent.outOfScope)
  const inScope = new Set(effectiveInScope)
  if (request.inScope) {
    for (const s of request.inScope) {
      if (!inScope.has(s) && !outOfScope.has(s)) {
        out.push({ field: 'inScope', element: s, rule: 'not_in_parent' })
      }
    }
  }
}

/**
 * Derive a bounded Work Package from an accepted Delegation Envelope.
 *
 * Returns EVERY violation rather than the first, so a Manager fixing a
 * decomposition sees the whole list and cannot probe the boundary field by
 * field to map it.
 */
export function attenuateWorkPackage(
  parent: DelegationEnvelope,
  request: WorkPackageRequest,
  delegationBoundHash: string,
): WorkPackageAttenuation {
  const v: WorkPackageViolation[] = []

  const authority = request.authority
    ? containsAll(parent.authority, request.authority, actionKey, 'authority', v)
    : parent.authority
  const allowedActions = request.allowedActions
    ? containsAll(parent.allowedActions, request.allowedActions, actionKey, 'allowedActions', v)
    : parent.allowedActions
  const tools = request.tools
    ? containsAll(parent.tools, request.tools, toolKey, 'tools', v)
    : parent.tools
  const dataScope = request.dataScope
    ? containsDataScope(parent.dataScope, request.dataScope, v)
    : parent.dataScope
  const inScope = request.inScope
    ? containsAll(parent.inScope, request.inScope, s => s, 'inScope', v)
    : parent.inScope

  const budget = containsBudget(parent.budget, request.budget, v)
  const deadline = containsDeadline(parent.deadline, request.deadline, v)

  checkDecomposition(parent, request, parent.inScope, v)

  if (v.length > 0) return { ok: false, violations: v }

  return {
    ok: true,
    package: {
      // Pins: copied from the parent, never supplied.
      envelopeId: parent.envelopeId,
      delegationBoundHash,
      missionId: parent.missionId,
      missionVersion: parent.missionVersion,
      missionBoundHash: parent.missionBoundHash,
      projectId: parent.projectId,

      assignedRole: request.role,

      taskObjective: request.taskObjective,
      inputs: request.inputs,
      expectedOutput: request.expectedOutput,

      authority,
      allowedActions,
      tools,
      dataScope,
      inScope,
      budget,
      deadline,

      // Restrictive: inherited in full, then extended. Never subtracted.
      forbiddenActions: unionWith(parent.forbiddenActions, request.addForbiddenActions ?? [], actionKey),
      constraints: unionWith(parent.constraints, request.addConstraints ?? [], constraintKey),
      escalationTriggers: unionWith(parent.escalationTriggers, request.addEscalationTriggers ?? [], triggerKey),
      stopConditions: unionWith(parent.stopConditions, request.addStopConditions ?? [], haltKey),
      approvalGates: unionWith(parent.approvalGates, request.addApprovalGates ?? [], gateKey),
      outOfScope: unionWith(parent.outOfScope, request.addOutOfScope ?? [], s => s),
      reporting: unionWith(parent.reporting, request.addReporting ?? [], reportKey),

      dependencies: request.dependencies ?? [],
      fallback: request.fallback ?? null,
      packageVersion: 1,
    },
  }
}

/** Order-independent canonical form, so member order never decides equality. */
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

const requireSuperset = <T>(
  field: string, parent: T[], child: T[], key: (v: T) => string, out: WorkPackageViolation[],
) => {
  const held = new Set(child.map(key))
  for (const p of parent) {
    if (!held.has(key(p))) out.push({ field, element: key(p), rule: 'removes_inherited' })
  }
}

/**
 * Independent re-check that a STORED package is still contained by its parent.
 *
 * Used at every operational read, not only at creation — the whole reason a
 * re-proof exists is rows that did not come from `attenuateWorkPackage`. Covers
 * every field in `WORK_PACKAGE_FIELD_CLASS` except the decomposed ones, whose
 * subordination is structural and re-checked through scope and inputs.
 */
export function workPackageIsContained(
  parent: DelegationEnvelope,
  pkg: WorkPackage,
): WorkPackageViolation[] {
  const v: WorkPackageViolation[] = []

  // pin — a package may never restate its own place in the chain.
  if (pkg.projectId !== parent.projectId) v.push({ field: 'projectId', element: pkg.projectId, rule: 'not_in_parent' })
  if (pkg.envelopeId !== parent.envelopeId) v.push({ field: 'envelopeId', element: pkg.envelopeId, rule: 'not_in_parent' })
  if (pkg.missionId !== parent.missionId) v.push({ field: 'missionId', element: pkg.missionId, rule: 'not_in_parent' })
  if (pkg.missionVersion !== parent.missionVersion) {
    v.push({ field: 'missionVersion', element: String(pkg.missionVersion), rule: 'not_in_parent' })
  }
  if (pkg.missionBoundHash !== parent.missionBoundHash) {
    v.push({ field: 'missionBoundHash', element: pkg.missionBoundHash.slice(0, 12), rule: 'not_in_parent' })
  }

  // narrowable
  containsAll(parent.authority, pkg.authority, actionKey, 'authority', v)
  containsAll(parent.allowedActions, pkg.allowedActions, actionKey, 'allowedActions', v)
  containsAll(parent.tools, pkg.tools, toolKey, 'tools', v)
  containsDataScope(parent.dataScope, pkg.dataScope, v)
  containsAll(parent.inScope, pkg.inScope, s => s, 'inScope', v)
  containsBudget(parent.budget, pkg.budget, v)
  containsDeadline(parent.deadline, pkg.deadline, v)

  // restrictive
  requireSuperset('forbiddenActions', parent.forbiddenActions, pkg.forbiddenActions, actionKey, v)
  requireSuperset('constraints', parent.constraints, pkg.constraints, constraintKey, v)
  requireSuperset('escalationTriggers', parent.escalationTriggers, pkg.escalationTriggers, triggerKey, v)
  requireSuperset('stopConditions', parent.stopConditions, pkg.stopConditions, haltKey, v)
  requireSuperset('approvalGates', parent.approvalGates, pkg.approvalGates, gateKey, v)
  requireSuperset('outOfScope', parent.outOfScope, pkg.outOfScope, s => s, v)
  requireSuperset('reporting', parent.reporting, pkg.reporting, reportKey, v)

  // decomposed — the SAME parent-independent rules the creation path applied.
  // Sharing the seam is what stops a stored package from being valid at read
  // time under rules that no longer match the ones it was created under.
  v.push(...validateWorkPackageTerms({
    taskObjective: pkg.taskObjective,
    inputs: pkg.inputs,
    expectedOutput: pkg.expectedOutput,
    dataScope: pkg.dataScope,
    dependencies: pkg.dependencies,
    inScope: pkg.inScope,
    outOfScope: pkg.outOfScope,
    // On read the version is stored data, so it is validated like everything else.
    packageVersion: pkg.packageVersion,
  }))

  return v
}

export { canonical as canonicalWorkPackageForm }
