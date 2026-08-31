/**
 * lib/workflows/action-identity.ts — may a fresh observation be scheduled?
 *
 * ── THE BUG THIS REPLACES ──────────────────────────────────────────────────
 * The seam classified a prior run by `attempts < max_attempts` and concluded
 * "the drain's own retry handles it". `claim_runs` selects `status = 'pending'`,
 * so a run that reached `done` is never claimed again. A completed non-passing
 * observation therefore held its action identity forever: the scheduler refused
 * a fresh run because a retry was coming, and no retry was ever coming.
 *
 * ── HOLDING IS ABOUT THE RUN, NOT THE STATUS STRING ────────────────────────
 * A run holds its identity while THAT run can still legitimately progress or be
 * reconciled. That is a PR9d question — outcome and phase — not a status string:
 *
 *   pending / running                  the drain can still act on it
 *   reconciliation_required            a human owes it an answer
 *   UNKNOWN / PARTIAL                  post-dispatch ambiguity, frozen
 *   SUCCEEDED_EVIDENCE_PENDING         the remote applied it; our audit lags,
 *                                      and SEP → SUCCEEDED is a legal move ON
 *                                      THIS RUN, so it is still in play
 *
 * Everything ambiguous holds. Releasing UNKNOWN would let a second observation
 * be scheduled while the first may still have landed — for a READ_ONLY probe
 * that is merely wasteful, but this classifier is the general rule and must not
 * teach the wrong lesson to the first write action that reaches it.
 *
 * ── RELEASE IS NOT PERMISSION TO LOOP ──────────────────────────────────────
 * A terminal run releases its identity, but that alone would be a storm: the
 * executor re-arms the instance when a run finishes, so tick → create → finish →
 * re-arm → tick would mint an observation forever.
 *
 * So release additionally requires an EXPLICIT operator schedule recorded after
 * the prior run was created. `scheduler.wake_scheduled` is written by exactly
 * one thing — `workflow_schedule_wake`, reachable only from the operator
 * endpoint. The executor's re-arm (`workflow_rearm`) and the tick's own record
 * (`workflow_record_tick`) write no such row. A blocked observation therefore
 * parks until a human asks again, which is the PR9h validation contract.
 *
 * PURE: no database, no clock. It decides; the seam acts.
 */

import { isAmbiguous, type ActionOutcome } from './action-outcome'

/** The prior run's binding-relevant columns. */
export interface PriorObservation {
  id: string
  status: string
  attempts: number
  max_attempts: number
  created_at: string
  action_outcome: ActionOutcome | null
  reconciliation_required: boolean | null
}

export type IdentityHoldReason =
  /** The drain can still claim or is running it. */
  | 'active_run_exists'
  /** Post-dispatch ambiguity, or a human owes it a reconciliation. */
  | 'ambiguity_reconciliation_required'
  /** Terminal and released, but nobody has asked for another observation. */
  | 'awaiting_explicit_schedule'
  /** Pending, but the drain can no longer claim it: attempts are spent. */
  | 'attempt_budget_spent'
  /** Not a shape this classifier recognises. Held on purpose — see below. */
  | 'unclassified_prior_run'

export type IdentityDisposition =
  | { holds: true; reason: IdentityHoldReason; detail: string }
  | { holds: false; reason: 'terminal_prior_released'; detail: string }

/**
 * Outcomes after which nothing further can happen to THIS run.
 *
 * SUCCEEDED is here for completeness, not because it matters in practice: a
 * satisfied check is answered before any run is examined. If a SUCCEEDED run
 * exists whose evidence does NOT satisfy — unbound or stale — a fresh
 * observation is exactly the right answer.
 */
const RELEASED_OUTCOMES: readonly ActionOutcome[] = [
  'FAILED', 'SUCCEEDED', 'CANCELLED', 'REJECTED',
]

const ACTIVE_STATUSES = ['pending', 'running'] as const

/**
 * @param explicitlyScheduledAt newest operator schedule for this instance, or
 *        null. Compared against the prior run's creation, so the schedule that
 *        PRODUCED that run cannot also authorise its successor.
 */
export function classifyPriorObservation(
  prior: PriorObservation,
  explicitlyScheduledAt: string | null,
): IdentityDisposition {
  // 1. Still in the drain's hands.
  if ((ACTIVE_STATUSES as readonly string[]).includes(prior.status)) {
    if (prior.attempts >= prior.max_attempts) {
      // claim_runs also requires attempts < max_attempts, so this row is stuck.
      // Held rather than duplicated: a second run would hide the stuck one.
      return { holds: true, reason: 'attempt_budget_spent',
        detail: `run ${prior.id.slice(0, 8)} is ${prior.status} with ${prior.attempts}/${prior.max_attempts} attempts spent` }
    }
    return { holds: true, reason: 'active_run_exists',
      detail: `run ${prior.id.slice(0, 8)} is ${prior.status}` }
  }

  // 2. Ambiguity outranks terminality. A row can look finished and still be
  //    owed an answer; PR9d exists so that is never guessed.
  if (prior.reconciliation_required === true) {
    return { holds: true, reason: 'ambiguity_reconciliation_required',
      detail: `run ${prior.id.slice(0, 8)} awaits reconciliation` }
  }
  if (isAmbiguous(prior.action_outcome) || prior.action_outcome === 'SUCCEEDED_EVIDENCE_PENDING') {
    return { holds: true, reason: 'ambiguity_reconciliation_required',
      detail: `run ${prior.id.slice(0, 8)} ended ${prior.action_outcome}` }
  }

  // 3. Terminal. Released — but only a human may spend the release.
  if (prior.action_outcome && RELEASED_OUTCOMES.includes(prior.action_outcome)) {
    if (explicitlyScheduledAt === null
        || Date.parse(explicitlyScheduledAt) <= Date.parse(prior.created_at)) {
      return { holds: true, reason: 'awaiting_explicit_schedule',
        detail: `run ${prior.id.slice(0, 8)} ended ${prior.action_outcome}; no schedule since it was created` }
    }
    return { holds: false, reason: 'terminal_prior_released',
      detail: `run ${prior.id.slice(0, 8)} ended ${prior.action_outcome} and was explicitly rescheduled` }
  }

  // 4. Anything else — a terminal status with no outcome, an outcome this
  //    module does not know. Held deliberately: the failure mode of releasing
  //    wrongly is a duplicate action, and the failure mode of holding wrongly is
  //    a visible stall with a reason code attached. The second is recoverable.
  return { holds: true, reason: 'unclassified_prior_run',
    detail: `run ${prior.id.slice(0, 8)} is ${prior.status}/${prior.action_outcome ?? 'no outcome'}` }
}
