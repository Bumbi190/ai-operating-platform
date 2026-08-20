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
 * How each Delegation Envelope field relates to its parent Mission.
 *
 * EI-S1.4C-R1 made this explicit. Before it, `envelopeIsContained` re-proved
 * nine fields and silently ignored the rest, so a stored envelope with a
 * rewritten objective, an invented deliverable, or its inherited constraints
 * and escalation triggers deleted re-proved clean and became authority.
 * `prepareDelegation` constructs envelopes correctly — but a re-proof exists
 * precisely for rows that did NOT come from it.
 *
 *   identity     the envelope's own coordinates; must match the parent exactly
 *                (`envelopeId` is self-referential and checked in `derive.ts`
 *                against the row carrying it)
 *   exact        V1 permits no narrowing, so canonical equality is required
 *   narrowable   a subset of the parent, per that field's own containment rule
 *   restrictive  inherited in full; the child may add but never lose
 *
 * The guard test enumerates `DelegationEnvelope`'s keys against this map, so a
 * field added later without a containment ruling fails a test rather than
 * quietly defaulting to unchecked.
 */
export const ENVELOPE_FIELD_CLASS = {
  envelopeId:         'identity',
  projectId:          'identity',
  missionId:          'identity',
  missionVersion:     'identity',
  missionBoundHash:   'identity',

  delegatedTo:        'exact',
  objective:          'exact',
  expectedOutcome:    'exact',
  // §20.62/§20.76 — V1's narrowing shape cannot touch these, so an envelope
  // whose dependencies or reporting obligations differ from the Mission's did
  // not come from `attenuate` and is not a delegation of that Mission.
  dependencies:       'exact',
  reporting:          'exact',

  deliverables:       'narrowable',
  successCriteria:    'narrowable',
  inScope:            'narrowable',
  authority:          'narrowable',
  allowedActions:     'narrowable',
  tools:              'narrowable',
  dataScope:          'narrowable',
  budget:             'narrowable',
  deadline:           'narrowable',

  outOfScope:         'restrictive',
  forbiddenActions:   'restrictive',
  constraints:        'restrictive',
  approvalGates:      'restrictive',
  escalationTriggers: 'restrictive',
  stopConditions:     'restrictive',
} as const satisfies Record<keyof DelegationEnvelope, 'identity' | 'exact' | 'narrowable' | 'restrictive'>

/** Order-independent canonical form, so member order never decides equality. */
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** Structural equality for an `exact` field. Not object identity. */
const requireExact = (
  field: string,
  parentValue: unknown,
  childValue: unknown,
  out: AttenuationViolation[],
) => {
  if (canonical(parentValue) !== canonical(childValue)) {
    out.push({ field, element: canonical(childValue).slice(0, 120), rule: 'exceeds_parent' })
  }
}

/** Every parent element must still be present downstream (restrictive fields). */
const requireSuperset = <T>(
  field: string,
  parent: T[],
  child: T[],
  key: (v: T) => string,
  out: AttenuationViolation[],
) => {
  const held = new Set(child.map(key))
  for (const p of parent) {
    if (!held.has(key(p))) {
      out.push({ field, element: key(p), rule: 'removes_inherited' })
    }
  }
}

/**
 * Independent re-check that an existing envelope is still contained by a
 * Mission version. Used at ACCEPT and at USE, not only at PREPARE: an envelope
 * that was valid when cut must still prove itself against the Mission it claims
 * (§21.14), so a stored row can never become authority on its own.
 *
 * Covers EVERY field in `ENVELOPE_FIELD_CLASS`, in that classification's order.
 */
export function envelopeIsContained(
  parent: AttenuationParent,
  envelope: DelegationEnvelope,
): AttenuationViolation[] {
  const v: AttenuationViolation[] = []

  // identity
  if (envelope.projectId !== parent.projectId) {
    v.push({ field: 'projectId', element: envelope.projectId, rule: 'not_in_parent' })
  }
  if (envelope.missionId !== parent.missionId) {
    v.push({ field: 'missionId', element: envelope.missionId, rule: 'not_in_parent' })
  }
  if (envelope.missionVersion !== parent.version) {
    v.push({ field: 'missionVersion', element: String(envelope.missionVersion), rule: 'not_in_parent' })
  }

  // exact
  if (envelope.delegatedTo !== 'manager') {
    v.push({ field: 'delegatedTo', element: String(envelope.delegatedTo), rule: 'not_in_parent' })
  }
  requireExact('objective', parent.objective, envelope.objective, v)
  requireExact('expectedOutcome', parent.expectedOutcome ?? null, envelope.expectedOutcome ?? null, v)
  requireExact('dependencies', parent.dependencies, envelope.dependencies, v)
  requireExact('reporting', parent.reporting, envelope.reporting, v)

  // narrowable
  containsAll(parent.deliverables, envelope.deliverables, s => s, 'deliverables', v)
  containsAll(parent.successCriteria, envelope.successCriteria, criterionKey, 'successCriteria', v)
  containsAll(parent.inScope, envelope.inScope, s => s, 'inScope', v)
  containsAll(parent.authority, envelope.authority, actionKey, 'authority', v)
  containsAll(parent.allowedActions, envelope.allowedActions, actionKey, 'allowedActions', v)
  containsAll(parent.tools, envelope.tools, toolKey, 'tools', v)
  containsDataScope(parent.dataScope, envelope.dataScope, v)
  containsBudget(parent.budget, envelope.budget, v)
  containsDeadline(parent.deadline, envelope.deadline, v)

  // restrictive — the child may have added more, but never lost one
  requireSuperset('outOfScope', parent.outOfScope, envelope.outOfScope, s => s, v)
  requireSuperset('forbiddenActions', parent.forbiddenActions, envelope.forbiddenActions, actionKey, v)
  requireSuperset('constraints', parent.constraints, envelope.constraints, constraintKey, v)
  requireSuperset('approvalGates', parent.approvalGates, envelope.approvalGates, gateKey, v)
  requireSuperset('escalationTriggers', parent.escalationTriggers, envelope.escalationTriggers, triggerKey, v)
  requireSuperset('stopConditions', parent.stopConditions, envelope.stopConditions, haltKey, v)

  return v
}
