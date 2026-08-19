/**
 * lib/atlas/decision-ledger/binding.ts — deterministic decision authorization
 * binding.
 *
 * EI-S1.3B-R1 fixes a critical authority-binding flaw: the approval path used to
 * take the authorization target and action kind FROM THE CALLER, so any
 * legitimate authorization in the same project — one granted to publish a single
 * unrelated article, say — could be presented to approve an unrelated autonomy
 * decision. A valid authorization for Thing X must never approve Decision Y.
 *
 * The binding is therefore derived here, from the decision itself, and is not an
 * argument anywhere in the write boundary:
 *
 *   targetType  = 'decision'
 *   targetId    = the stable decision id (§11.21)
 *   versionHash = sha256 over the MATERIAL content of this exact version
 *   actionKind  = the specific authority act being performed
 *
 * §11.62 defines a material amendment as one that changes scope, authority,
 * risk, duration, autonomy, budget, approval requirement, external action
 * permission or success criteria. Those are precisely the fields hashed below,
 * so any material change produces a different binding and silently invalidates
 * an authorization obtained for the earlier version.
 *
 * Zero I/O. Order-independent canonical serialization, so an equal decision
 * always hashes equal regardless of key order.
 */

import { createHash } from 'node:crypto'
import type { AuthorizationTarget } from '@/lib/atlas/authorization/types'
import { deriveDecisionState } from './derive'
import type { DecisionRecord, DerivedDecisionState } from './types'

/**
 * The authority acts a decision can require. Each is a distinct permission: an
 * authorization to approve is not an authorization to reverse, amend or
 * supersede (§27.313, minimum authority).
 */
export const DECISION_ACTION = {
  approve:   'decision.approve',
  amend:     'decision.amend',
  reverse:   'decision.reverse',
  supersede: 'decision.supersede',
} as const

export type DecisionAct = keyof typeof DECISION_ACTION

/** Fixed instant for binding derivation — see `decisionAuthorizationBinding`. */
const EPOCH = '1970-01-01T00:00:00.000Z'

/** The material fields whose change constitutes a §11.62 material amendment. */
export interface MaterialDecisionVersion {
  decisionId:  string
  projectId:   string
  version:     number
  title:       string
  statement:   string
  materiality: string[]
  effectiveAt: string | null
  expiresAt:   string | null
  review:      unknown
  reversalConditions: string[]
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/**
 * The version pin for one material decision version. Deterministic and
 * key-order independent; any material change yields a different hash.
 */
export function materialDecisionVersionHash(material: MaterialDecisionVersion): string {
  // Explicitly projected, so an unrelated field added to DecisionRecord later
  // cannot silently change every existing binding.
  const canonical = {
    decisionId:  material.decisionId,
    projectId:   material.projectId,
    version:     material.version,
    title:       material.title,
    statement:   material.statement,
    materiality: [...material.materiality].sort(),
    effectiveAt: material.effectiveAt ?? null,
    expiresAt:   material.expiresAt ?? null,
    review:      material.review ?? null,
    reversalConditions: [...material.reversalConditions].sort(),
  }
  return createHash('sha256').update(canonicalJson(canonical)).digest('hex')
}

export interface DecisionAuthorizationBinding {
  projectId:  string
  target:     AuthorizationTarget
  actionKind: string
}

function materialFrom(source: DerivedDecisionState | DecisionRecord): MaterialDecisionVersion {
  return {
    decisionId:  source.decisionId,
    projectId:   source.projectId,
    version:     source.version,
    title:       source.title,
    statement:   source.statement,
    materiality: source.materiality,
    effectiveAt: source.effectiveAt,
    expiresAt:   source.expiresAt,
    review:      source.review,
    reversalConditions: source.reversalConditions,
  }
}

/**
 * The exact authorization a given authority act on this decision requires.
 *
 * Callers cannot influence any component: the project comes from the lineage,
 * the target from the decision's identity and material version, and the action
 * from the act being performed.
 */
export function bindingForState(
  state: DerivedDecisionState,
  act: DecisionAct = 'approve',
): DecisionAuthorizationBinding {
  return {
    projectId: state.projectId,
    target: {
      targetType:  'decision',
      targetId:    state.decisionId,
      versionHash: materialDecisionVersionHash(materialFrom(state)),
    },
    actionKind: DECISION_ACTION[act],
  }
}

/** Convenience for callers holding a raw lineage (tests, request preparation). */
export function decisionAuthorizationBinding(
  lineage: DecisionRecord[],
  act: DecisionAct = 'approve',
): DecisionAuthorizationBinding {
  // The binding depends only on identity and material content, so the fold's
  // evaluation instant is irrelevant here: any instant yields the same hash.
  const state = deriveDecisionState(lineage, { at: EPOCH })
  return bindingForState(state, act)
}
