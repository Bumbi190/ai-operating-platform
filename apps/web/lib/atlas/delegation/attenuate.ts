/**
 * lib/atlas/delegation/attenuate.ts — §6.39 authority attenuation.
 *
 * "Delegated authority may be narrowed. It may never be widened." This file is
 * the whole of that rule, and it is a PURE function: no clock, no database, no
 * network, no model. Given the same Mission and the same narrowing request it
 * returns the same envelope or the same violations, forever. That is what makes
 * the boundary testable, and what stops authority from depending on a prompt.
 *
 * TWO DIRECTIONS, NEVER MIXED:
 *
 *   Permissive fields — authority, allowed actions, tools, data, scope, budget,
 *   deadline. A child may hold FEWER than its parent. Every element it claims
 *   must be present in the parent, or the envelope does not exist.
 *
 *   Restrictive fields — forbidden actions, out-of-scope, constraints, approval
 *   gates, escalation triggers, stop conditions. A child may hold MORE than its
 *   parent, and inherits all of them unconditionally. The request type can only
 *   ADD to these: removing an inherited prohibition is not rejected at runtime,
 *   it is UNREPRESENTABLE, because a shape that cannot express the unsafe thing
 *   is stronger than a check that must remember to look for it.
 *
 * WHAT ATTENUATION IS NOT: it is not authorization. A perfectly attenuated
 * envelope over a revoked Mission is still unusable — that is the live
 * authority question, asked on every prepare, accept and use (§21.14).
 * Containment proven here is a necessary condition and never a sufficient one.
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
import type { DelegationEnvelope, DelegationRole } from './types'

/**
 * The Mission facts an envelope may be cut from. Structurally a subset of
 * `DerivedMissionState`, declared separately so the pure core never depends on
 * mission derivation, ledger shape or authority evaluation.
 */
export interface AttenuationParent {
  missionId: string
  projectId: string
  version: number
  objective: string
  expectedOutcome: string | null
  deliverables: string[]
  successCriteria: MissionSuccessCriterion[]
  inScope: string[]
  outOfScope: string[]
  constraints: MissionConstraint[]
  authority: MissionActionBound[]
  allowedActions: MissionActionBound[]
  forbiddenActions: MissionActionBound[]
  tools: MissionToolBound[]
  dataScope: MissionDataScope[]
  budget: MissionBudget | null
  deadline: string | null
  approvalGates: MissionApprovalGate[]
  escalationTriggers: MissionEscalationTrigger[]
  stopConditions: MissionHaltCondition[]
  reporting: MissionReportingRequirement[]
  dependencies: MissionDependency[]
}

/**
 * What a caller may ask for.
 *
 * Note what is absent. There is no `objective`, no `projectId`, no
 * `forbiddenActions`, no `missionVersion`. Those are taken from the Mission and
 * cannot be supplied, so no caller can restate them into something wider. The
 * permissive fields are OPTIONAL: omitting one inherits the Mission's value
 * whole, which is the only default that is never a widening.
 */
export interface DelegationNarrowing {
  /** Omit to inherit. Supply a SUBSET to narrow. Never a superset. */
  authority?: MissionActionBound[]
  allowedActions?: MissionActionBound[]
  tools?: MissionToolBound[]
  dataScope?: MissionDataScope[]
  inScope?: string[]
  deliverables?: string[]
  successCriteria?: MissionSuccessCriterion[]
  /** Same currency, limit at or below the Mission's. */
  budget?: MissionBudget | null
  /** At or before the Mission's deadline. */
  deadline?: string | null

  /** Additive only — the inherited set is always kept (§6.39). */
  addForbiddenActions?: MissionActionBound[]
  addOutOfScope?: string[]
  addConstraints?: MissionConstraint[]
  addApprovalGates?: MissionApprovalGate[]
  addEscalationTriggers?: MissionEscalationTrigger[]
  addStopConditions?: MissionHaltCondition[]
}

/** One proven containment failure, naming the field and the offending element. */
export interface AttenuationViolation {
  field: string
  element: string
  rule: 'not_in_parent' | 'exceeds_parent' | 'removes_inherited' | 'malformed'
}

export type AttenuationResult =
  | { ok: true; envelope: Omit<DelegationEnvelope, 'envelopeId' | 'missionBoundHash'> }
  | { ok: false; violations: AttenuationViolation[] }

// Canonical element keys.
//
// Containment is decided on a STABLE KEY, never on object identity and never on
// free-text prose, so that two structurally equal bounds compare equal and a
// reworded note can never smuggle a new permission through.

const actionKey = (a: MissionActionBound) => a.action
const constraintKey = (c: MissionConstraint) => `${c.kind} ${c.statement}`
const gateKey = (g: MissionApprovalGate) => g.gateId
const triggerKey = (t: MissionEscalationTrigger) => `${t.trigger} ${t.destination}`
const haltKey = (h: MissionHaltCondition) => h.condition
const criterionKey = (c: MissionSuccessCriterion) =>
  `${c.criterion} ${c.level} ${c.measure ?? ''}`

/**
 * A tool bound's key includes its RESTRICTION, deliberately.
 *
 * §20.59 restrictions are prose ("read-only", "these channels only"), and no
 * deterministic function can prove that one prose restriction is narrower than
 * another. So the child may not restate a restriction at all: it takes the
 * parent's bound verbatim or it does not get the tool. Dropping `restriction`
 * from `{tool:'publish', restriction:'draft only'}` would otherwise read as a
 * mere omission while granting unrestricted publishing.
 */
const toolKey = (t: MissionToolBound) => `${t.tool} ${t.restriction ?? ''}`

/** Write subsumes read; read never subsumes write. */
const ACCESS_RANK: Record<MissionDataScope['access'], number> = { read: 1, write: 2 }

const containsAll = <T>(
  parent: T[],
  child: T[],
  key: (v: T) => string,
  field: string,
  out: AttenuationViolation[],
): T[] => {
  const allowed = new Set(parent.map(key))
  for (const c of child) {
    if (!allowed.has(key(c))) {
      out.push({ field, element: key(c), rule: 'not_in_parent' })
    }
  }
  return child
}

/** Union that preserves parent order, then appends genuinely new children. */
const unionWith = <T>(parent: T[], added: T[], key: (v: T) => string): T[] => {
  const seen = new Set(parent.map(key))
  const result = [...parent]
  for (const a of added) {
    if (!seen.has(key(a))) {
      seen.add(key(a))
      result.push(a)
    }
  }
  return result
}

/**
 * Data scope containment over the access lattice.
 *
 * A child asking to READ a resource the Mission may WRITE is a narrowing and is
 * allowed. A child asking to WRITE a resource the Mission may only READ is a
 * privilege escalation and is not.
 */
const containsDataScope = (
  parent: MissionDataScope[],
  child: MissionDataScope[],
  out: AttenuationViolation[],
): MissionDataScope[] => {
  const best = new Map<string, number>()
  for (const p of parent) {
    const rank = ACCESS_RANK[p.access]
    best.set(p.resource, Math.max(best.get(p.resource) ?? 0, rank))
  }
  for (const c of child) {
    const have = best.get(c.resource) ?? 0
    if (have < ACCESS_RANK[c.access]) {
      out.push({ field: 'dataScope', element: `${c.resource}:${c.access}`, rule: 'not_in_parent' })
    }
  }
  return child
}

/**
 * Budget containment.
 *
 * A Mission with no budget granted no spending bound at all, so a child cannot
 * invent one — that would create authority rather than inherit it. Currency is
 * compared exactly: "under 500" means nothing across two currencies, and this
 * core will not guess an exchange rate.
 */
const containsBudget = (
  parent: MissionBudget | null,
  child: MissionBudget | null | undefined,
  out: AttenuationViolation[],
): MissionBudget | null => {
  if (child === undefined) return parent
  if (child === null) return null
  if (!parent) {
    out.push({ field: 'budget', element: `${child.currency}:${child.limitMinor}`, rule: 'not_in_parent' })
    return null
  }
  if (child.currency !== parent.currency) {
    out.push({ field: 'budget', element: child.currency, rule: 'exceeds_parent' })
    return null
  }
  if (!Number.isSafeInteger(child.limitMinor) || child.limitMinor < 0) {
    out.push({ field: 'budget', element: String(child.limitMinor), rule: 'malformed' })
    return null
  }
  if (child.limitMinor > parent.limitMinor) {
    out.push({ field: 'budget', element: String(child.limitMinor), rule: 'exceeds_parent' })
    return null
  }
  return child
}

/**
 * Deadline containment.
 *
 * An inherited deadline may be pulled in but never pushed out, and never
 * dropped: `deadline: null` against a Mission that HAS one removes the bound.
 */
const containsDeadline = (
  parent: string | null,
  child: string | null | undefined,
  out: AttenuationViolation[],
): string | null => {
  if (child === undefined) return parent
  if (child === null) {
    if (parent !== null) {
      out.push({ field: 'deadline', element: 'null', rule: 'removes_inherited' })
      return parent
    }
    return null
  }
  const at = Date.parse(child)
  if (!Number.isFinite(at)) {
    out.push({ field: 'deadline', element: child, rule: 'malformed' })
    return parent
  }
  if (parent !== null && at > Date.parse(parent)) {
    out.push({ field: 'deadline', element: child, rule: 'exceeds_parent' })
    return parent
  }
  return child
}

/**
 * Derive a bounded envelope from an exact Mission version.
 *
 * Returns EVERY violation rather than the first, because an Executive fixing a
 * delegation deserves the whole list, and because a caller cannot then probe
 * the boundary one field at a time to map it.
 */
export function attenuate(
  parent: AttenuationParent,
  narrowing: DelegationNarrowing = {},
  delegatedTo: DelegationRole = 'manager',
): AttenuationResult {
  const v: AttenuationViolation[] = []

  const authority = narrowing.authority
    ? containsAll(parent.authority, narrowing.authority, actionKey, 'authority', v)
    : parent.authority
  const allowedActions = narrowing.allowedActions
    ? containsAll(parent.allowedActions, narrowing.allowedActions, actionKey, 'allowedActions', v)
    : parent.allowedActions
  const tools = narrowing.tools
    ? containsAll(parent.tools, narrowing.tools, toolKey, 'tools', v)
    : parent.tools
  const dataScope = narrowing.dataScope
    ? containsDataScope(parent.dataScope, narrowing.dataScope, v)
    : parent.dataScope
  const inScope = narrowing.inScope
    ? containsAll(parent.inScope, narrowing.inScope, s => s, 'inScope', v)
    : parent.inScope
  const deliverables = narrowing.deliverables
    ? containsAll(parent.deliverables, narrowing.deliverables, s => s, 'deliverables', v)
    : parent.deliverables
  const successCriteria = narrowing.successCriteria
    ? containsAll(parent.successCriteria, narrowing.successCriteria, criterionKey, 'successCriteria', v)
    : parent.successCriteria

  const budget = containsBudget(parent.budget, narrowing.budget, v)
  const deadline = containsDeadline(parent.deadline, narrowing.deadline, v)

  if (v.length > 0) return { ok: false, violations: v }

  return {
    ok: true,
    envelope: {
      projectId: parent.projectId,
      missionId: parent.missionId,
      missionVersion: parent.version,
      delegatedTo,
      objective: parent.objective,
      expectedOutcome: parent.expectedOutcome,
      deliverables,
      successCriteria,
      inScope,
      authority,
      allowedActions,
      tools,
      dataScope,
      budget,
      deadline,
      dependencies: parent.dependencies,
      reporting: parent.reporting,

      // Restrictive fields: inherited in full, then extended. Never subtracted.
      outOfScope: unionWith(parent.outOfScope, narrowing.addOutOfScope ?? [], s => s),
      forbiddenActions: unionWith(parent.forbiddenActions, narrowing.addForbiddenActions ?? [], actionKey),
      constraints: unionWith(parent.constraints, narrowing.addConstraints ?? [], constraintKey),
      approvalGates: unionWith(parent.approvalGates, narrowing.addApprovalGates ?? [], gateKey),
      escalationTriggers: unionWith(parent.escalationTriggers, narrowing.addEscalationTriggers ?? [], triggerKey),
      stopConditions: unionWith(parent.stopConditions, narrowing.addStopConditions ?? [], haltKey),
    },
  }
}

/**
 * Independent re-check that an existing envelope is still contained by a
 * Mission version. Used at ACCEPT and at USE, not only at PREPARE: an envelope
 * that was valid when cut must still prove itself against the Mission it claims
 * (§21.14), so a stored row can never become authority on its own.
 */
export function envelopeIsContained(
  parent: AttenuationParent,
  envelope: DelegationEnvelope,
): AttenuationViolation[] {
  const v: AttenuationViolation[] = []
  if (envelope.projectId !== parent.projectId) {
    v.push({ field: 'projectId', element: envelope.projectId, rule: 'not_in_parent' })
  }
  if (envelope.missionId !== parent.missionId) {
    v.push({ field: 'missionId', element: envelope.missionId, rule: 'not_in_parent' })
  }
  containsAll(parent.authority, envelope.authority, actionKey, 'authority', v)
  containsAll(parent.allowedActions, envelope.allowedActions, actionKey, 'allowedActions', v)
  containsAll(parent.tools, envelope.tools, toolKey, 'tools', v)
  containsDataScope(parent.dataScope, envelope.dataScope, v)
  containsAll(parent.inScope, envelope.inScope, s => s, 'inScope', v)
  containsBudget(parent.budget, envelope.budget, v)
  containsDeadline(parent.deadline, envelope.deadline, v)

  // Every prohibition the Mission carries must still be present downstream.
  const held = new Set(envelope.forbiddenActions.map(actionKey))
  for (const f of parent.forbiddenActions) {
    if (!held.has(actionKey(f))) {
      v.push({ field: 'forbiddenActions', element: actionKey(f), rule: 'removes_inherited' })
    }
  }
  const gates = new Set(envelope.approvalGates.map(gateKey))
  for (const g of parent.approvalGates) {
    if (!gates.has(gateKey(g))) {
      v.push({ field: 'approvalGates', element: gateKey(g), rule: 'removes_inherited' })
    }
  }
  const stops = new Set(envelope.stopConditions.map(haltKey))
  for (const s of parent.stopConditions) {
    if (!stops.has(haltKey(s))) {
      v.push({ field: 'stopConditions', element: haltKey(s), rule: 'removes_inherited' })
    }
  }
  return v
}
