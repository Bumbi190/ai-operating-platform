/**
 * lib/atlas/decision-ledger/binding.ts — deterministic authority binding for a
 * PROSPECTIVE decision act.
 *
 * WHAT A HUMAN AUTHORIZES IS THE ACT THAT WILL BE APPENDED.
 *
 * EI-S1.3B-R1 stopped the caller choosing the authorization target, but still
 * derived the binding from the decision's state BEFORE the act. The terms of the
 * act itself — the approval's effective date, expiry, review condition and
 * rationale; an amendment's new statement, scope and duration; a reversal's
 * reason; a supersession's successor — were all supplied AFTER the authorization
 * had already passed. So one approval grant accepted an expiry in 2099 and a
 * review condition of "never", and one amendment grant produced a version N+1
 * with an entirely different commitment.
 *
 * §11.41 requires the approval record to reference "Conditions. Edited terms."
 * §11.62 requires a material amendment to go through "the applicable decision
 * process" — it is a decision, not an edit. Neither is satisfiable if the terms
 * can change after the human said yes.
 *
 * The binding is therefore computed from the CANDIDATE RECORD — the exact row
 * that is about to be appended — over an explicit projection of every field that
 * carries decision meaning. Change any of them and the required authorization
 * changes, so the grant obtained for one act cannot perform a different one.
 *
 * Deliberately EXCLUDED from the projection, each for a stated reason:
 *
 *   recordId         random row identity; carries no institutional meaning
 *   occurredAt       the server instant of the append, unknowable when the human
 *                    authorizes; the authorization's own expiry bounds when the
 *                    act may happen (§27.319)
 *   principalId      the acting human, verified separately and directly against
 *                    the authorization's own principal
 *   authority        the proof being computed; including it would be circular
 *   lifecycleGeneration  optimistic-concurrency and ordering position, not
 *                    decision content
 *
 * Everything else is bound. `authorityBoundProjection` enumerates the fields
 * explicitly rather than spreading the record, so a field added to
 * `DecisionRecord` later cannot silently join or leave the security surface —
 * and `decision-ledger-authority.test.ts` fails if one is added without a ruling.
 *
 * Zero I/O. Order-independent canonical serialization, so an equal act always
 * hashes equal regardless of key order.
 */

import { createHash } from 'node:crypto'
import type { AuthorizationTarget } from '@/lib/atlas/authorization/types'
import type { DecisionRecord } from './types'

/**
 * The authority acts a decision can require. Each is a distinct permission: an
 * authorization to approve is not an authorization to reverse, amend, reject or
 * supersede (§27.313, minimum authority).
 */
export const DECISION_ACTION = {
  approve:   'decision.approve',
  amend:     'decision.amend',
  reject:    'decision.reject',
  defer:     'decision.defer',
  reverse:   'decision.reverse',
  supersede: 'decision.supersede',
} as const

export type DecisionAct = keyof typeof DECISION_ACTION

/** Fields excluded from the bound projection. Named for the guard test. */
export const AUTHORITY_UNBOUND_FIELDS = [
  'recordId', 'occurredAt', 'principalId', 'authority', 'lifecycleGeneration',
] as const

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
 * Every field of the candidate act that carries decision meaning.
 *
 * The test applied to each one was: "could changing this value after the human
 * authorized the act materially change what the institution believes was
 * decided?" Where the answer is yes, it is here — including fields that already
 * existed before the act, because carrying them forward unchanged is itself part
 * of what was authorized.
 */
export function authorityBoundProjection(candidate: DecisionRecord): Record<string, unknown> {
  return {
    // Which act, on which decision, in which scope, at which version.
    type:        candidate.type,
    decisionId:  candidate.decisionId,
    projectId:   candidate.projectId,
    version:     candidate.version,

    // §11.22/§11.23 — identity and the commitment itself.
    title:       candidate.title,
    statement:   candidate.statement,
    // §11.24/§11.25 — the recommendation is separate from the decision, and
    // §11.101 rates authority correctness and outcome calibration against it.
    recommendation: candidate.recommendation ?? null,
    // §11.26 — why the final decision was made. Swapping the stated reason
    // after approval falsifies the institutional record.
    rationale:   candidate.rationale ?? null,
    // §11.19 — which domains are affected; §11.62 makes a risk/scope change
    // material by definition.
    materiality: [...candidate.materiality].sort(),

    // §11.27/§11.28 — what was known THEN. Evidence swapped after authorization
    // would make a decision look better- or worse-founded than it was.
    evidence:    [...candidate.evidence]
      .map(reference => ({ ...reference }))
      .sort((a, b) => (canonicalJson(a) < canonicalJson(b) ? -1 : 1)),
    snapshot:    candidate.snapshot ?? null,
    // §11.31/§11.32 — the alternatives a future reviewer will be told existed.
    alternatives: [...candidate.alternatives]
      .map(alternative => ({ ...alternative }))
      .sort((a, b) => (canonicalJson(a) < canonicalJson(b) ? -1 : 1)),
    // §11.30 — recommendation confidence when material.
    confidence:  candidate.confidence ?? null,
    // §11.36/§11.95 — what success was expected to mean. Change it afterwards
    // and every later evaluation measures a different promise.
    expectedImpact: candidate.expectedImpact ?? null,

    // §11.43/§11.45 — when it starts governing and when it stops. §11.41's
    // "edited terms" are exactly these.
    effectiveAt: candidate.effectiveAt ?? null,
    expiresAt:   candidate.expiresAt ?? null,
    // §11.46 — the review condition. "Review in 30 days" and "never review"
    // are not the same decision.
    review:      candidate.review ?? null,
    // §11.47 — what would require reversal.
    reversalConditions: [...candidate.reversalConditions].sort(),

    // §11.56 — WHICH decision replaces this one. Without this, one supersession
    // grant would accept any successor chosen afterwards.
    supersededBy: candidate.supersededBy ?? null,
    // §11.53/§11.54/§11.57/§11.59 — the recorded reason for the act.
    reason:      candidate.reason ?? null,
    // Present for completeness; annotations are not authority acts.
    outcome:     candidate.outcome ?? null,
    reviewNote:  candidate.reviewNote ?? null,
  }
}

/** sha256 over the canonical serialization of the bound projection. */
export function authorityBindingHash(candidate: DecisionRecord): string {
  return createHash('sha256').update(canonicalJson(authorityBoundProjection(candidate))).digest('hex')
}

export interface DecisionAuthorizationBinding {
  projectId:  string
  target:     AuthorizationTarget
  actionKind: string
}

/**
 * The exact authorization this prospective act requires.
 *
 * No component is a caller argument: the project and decision come from the
 * lineage, the version hash from the candidate act's own content, and the action
 * from which act is being performed.
 */
export function bindingForCandidate(
  candidate: DecisionRecord,
  act: DecisionAct,
): DecisionAuthorizationBinding {
  return {
    projectId: candidate.projectId,
    target: {
      targetType:  'decision',
      targetId:    candidate.decisionId,
      versionHash: authorityBindingHash(candidate),
    },
    actionKind: DECISION_ACTION[act],
  }
}
