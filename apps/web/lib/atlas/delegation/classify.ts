/**
 * lib/atlas/delegation/classify.ts — §21.20–§21.26 the replanning boundary.
 *
 * A Manager that must ask permission to reorder two steps is not a Manager. A
 * Manager that can quietly acquire a tool it was never granted is not bounded.
 * This file draws the line between those two, and it draws it in deterministic
 * code — never in a model.
 *
 * §21.21 — "Changing HOW is coordination. Changing WHAT, WITH WHAT, or HOW FAR
 * is delegation." So:
 *
 *   OPERATIONAL — resequencing, decomposition, retrying, choosing an order,
 *   splitting or merging steps, picking among tools it already holds. The
 *   Manager owns this entirely and records it for visibility, not permission.
 *
 *   MATERIAL — anything that reaches past the envelope: an action outside the
 *   allowed set, an action inside the forbidden set, a tool or resource never
 *   granted, spend above the ceiling, a date past the deadline, work in
 *   out-of-scope territory, or skipping a declared approval gate. §21.24 — this
 *   does not fail. It REFERS, and the Executive decides.
 *
 * The default is MATERIAL. A change this classifier cannot positively prove to
 * be inside the envelope is referred upward, because the cost of an unnecessary
 * referral is a question and the cost of a missed one is unauthorized action.
 */

import type { MissionDataScope } from '../mission/types'
import type { DelegationChangeClass, DelegationEnvelope, DelegationReplan } from './types'

/**
 * What the Manager proposes to do differently. Everything is optional: a pure
 * resequencing proposes no new action, tool, resource, spend or date, and is
 * therefore operational by construction.
 */
export interface ProposedChange {
  summary: string
  /** Action identifiers the change would take. */
  actions?: string[]
  /** Tool bounds the change would use, as `tool` plus its exact restriction. */
  tools?: { tool: string; restriction?: string | null }[]
  dataScope?: MissionDataScope[]
  /** Spend the change would commit, in minor units. */
  spendMinor?: number
  currency?: string
  /** A completion date the change would push work to. */
  targetDate?: string
  /** Scope items the change would touch. */
  scopeTouched?: string[]
  /** Approval gates the change would proceed WITHOUT. */
  gatesBypassed?: string[]
}

const ACCESS_RANK: Record<MissionDataScope['access'], number> = { read: 1, write: 2 }

/**
 * Classify one proposed change against the envelope it would happen under.
 *
 * Pure and total: same envelope plus same change always yields the same class
 * and the same `exceeded` list, in a stable order.
 */
export function classifyChange(
  envelope: DelegationEnvelope,
  change: ProposedChange,
): DelegationReplan {
  const exceeded: string[] = []

  const allowed = new Set(envelope.allowedActions.map(a => a.action))
  const forbidden = new Set(envelope.forbiddenActions.map(a => a.action))
  for (const action of change.actions ?? []) {
    // Checked before the allowed set: a prohibition is not cancelled by an
    // allowance that happens to name the same action (§6.39).
    if (forbidden.has(action)) exceeded.push(`forbiddenActions:${action}`)
    else if (!allowed.has(action)) exceeded.push(`allowedActions:${action}`)
  }

  const tools = new Set(envelope.tools.map(t => `${t.tool} ${t.restriction ?? ''}`))
  for (const t of change.tools ?? []) {
    if (!tools.has(`${t.tool} ${t.restriction ?? ''}`)) exceeded.push(`tools:${t.tool}`)
  }

  const dataBest = new Map<string, number>()
  for (const d of envelope.dataScope) {
    dataBest.set(d.resource, Math.max(dataBest.get(d.resource) ?? 0, ACCESS_RANK[d.access]))
  }
  for (const d of change.dataScope ?? []) {
    if ((dataBest.get(d.resource) ?? 0) < ACCESS_RANK[d.access]) {
      exceeded.push(`dataScope:${d.resource}:${d.access}`)
    }
  }

  if (change.spendMinor !== undefined) {
    // §20.52 spend is a boundary, and an envelope with no budget is a boundary
    // of zero rather than an absence of one. Committing anything against no
    // budget is material.
    if (!envelope.budget) {
      if (change.spendMinor > 0) exceeded.push(`budget:${change.spendMinor}`)
    } else if (change.currency !== undefined && change.currency !== envelope.budget.currency) {
      exceeded.push(`budget:currency:${change.currency}`)
    } else if (change.spendMinor > envelope.budget.limitMinor) {
      exceeded.push(`budget:${change.spendMinor}`)
    }
  }

  if (change.targetDate !== undefined) {
    const at = Date.parse(change.targetDate)
    if (!Number.isFinite(at)) {
      exceeded.push(`deadline:${change.targetDate}`)
    } else if (envelope.deadline !== null && at > Date.parse(envelope.deadline)) {
      exceeded.push(`deadline:${change.targetDate}`)
    }
  }

  const outOfScope = new Set(envelope.outOfScope)
  const inScope = new Set(envelope.inScope)
  for (const s of change.scopeTouched ?? []) {
    if (outOfScope.has(s)) exceeded.push(`outOfScope:${s}`)
    else if (!inScope.has(s)) exceeded.push(`inScope:${s}`)
  }

  // §21.25 — a declared gate is not advisory. Proceeding past one is the
  // clearest possible case of a change the Executive must see.
  const gates = new Set(envelope.approvalGates.map(g => g.gateId))
  for (const g of change.gatesBypassed ?? []) {
    if (gates.has(g)) exceeded.push(`approvalGates:${g}`)
    else exceeded.push(`approvalGates:unknown:${g}`)
  }

  const changeClass: DelegationChangeClass =
    exceeded.length === 0 ? 'operational_change' : 'material_change_requires_executive_review'

  return { changeClass, exceeded, summary: change.summary }
}

/** §21.24 — a referred change is recorded; it is never silently executed. */
export function requiresExecutiveReview(replan: DelegationReplan): boolean {
  return replan.changeClass === 'material_change_requires_executive_review'
}
