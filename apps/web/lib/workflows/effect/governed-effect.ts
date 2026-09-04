/**
 * lib/workflows/effect/governed-effect.ts — what an effectful action requires
 * before it may touch the world, and what its result is allowed to claim.
 *
 * ── WHY THIS IS SMALL ───────────────────────────────────────────────────────
 * Almost everything a governed effect needs already exists and is already
 * generic. The dispatch-certainty state machine (`action-outcome.ts`), the retry
 * authority (`decideRetry`), the reconciliation seam (`reconciliation.ts`), the
 * idempotency identity (`computeActionIdempotencyKey`) and the point of no return
 * (`assertWorkflowActionStillAuthorized`) were all built before any executor
 * could use them, and all of them read `ACTION_CLASS_POLICY` rather than assuming
 * READ_ONLY.
 *
 * So this module adds no state machine and no second policy table. It answers one
 * question the engine cannot currently answer — "may THIS kind act, and what must
 * be true first?" — and leaves every existing primitive to do its own job.
 *
 * ── ENABLEMENT IS PER KIND, NEVER PER CLASS ─────────────────────────────────
 * A class says what an action WOULD require. It must never say that an action is
 * allowed to run. `upload_protected_artifacts` and `send_release_newsletter` are
 * MATERIAL_WRITE and EXTERNAL_COMMUNICATION today; if the family gate keyed on
 * class, widening the executor would have made both live in the same commit.
 * They stay `not_executable`, and adding a kind here is a deliberate act with its
 * own review.
 */

import { ACTION_CLASS_POLICY, type ActionClass } from '../action-target'

/**
 * What must hold before an effectful dispatch, derived from the class policy
 * rather than restated.
 */
export interface GovernedEffectRequirements {
  /** An execution authorization must exist and still be valid. */
  readonly requiresExecutionAuthorization: boolean
  /** A spend reservation must be held for the exact action identity. */
  readonly requiresSpendReservation: boolean
  /** The pinned target must be re-derived and still match immediately before dispatch. */
  readonly requiresPreDispatchRevalidation: boolean
  /** The dispatch must carry a stable idempotency identity. */
  readonly requiresIdempotency: boolean
  /** Attempts permitted for one intent. */
  readonly maxAttempts: number
}

/**
 * Requirements for a class. Read from `ACTION_CLASS_POLICY` — the single place
 * that answers "what does FINANCIAL require" — so the two can never disagree.
 */
export function governedEffectRequirements(cls: ActionClass): GovernedEffectRequirements {
  const p = ACTION_CLASS_POLICY[cls]
  return {
    requiresExecutionAuthorization: p.requiresAuthorization,
    requiresSpendReservation: p.requiresSpendEnforcement,
    requiresPreDispatchRevalidation: p.requiresPreCommitRevalidation,
    requiresIdempotency: p.requiresIdempotency,
    maxAttempts: p.maxAttempts,
  }
}

/**
 * Is this class effectful at all?
 *
 * READ_ONLY is the only class whose repetition is free, and the only one the
 * existing observation executor may run. Everything else changes the world.
 */
export function isEffectfulClass(cls: ActionClass): boolean {
  return cls !== 'READ_ONLY'
}

/**
 * Why a governed effect was refused BEFORE it touched anything.
 *
 * Every value here means "nothing happened". Refusals that occur after the
 * dispatch boundary are not in this vocabulary on purpose — those are outcomes,
 * owned by `action-outcome.ts`, and calling them refusals would let a possibly-
 * applied effect be reported as a clean stop.
 */
export const GOVERNED_EFFECT_REFUSALS = [
  'kind_not_enabled',
  'class_not_effectful',
  'execution_authorization_missing',
  'execution_authorization_invalid',
  'spend_reservation_missing',
  'spend_refused',
  'pre_dispatch_revalidation_failed',
  'idempotency_identity_missing',
] as const

export type GovernedEffectRefusal = (typeof GOVERNED_EFFECT_REFUSALS)[number]

/**
 * Every pre-dispatch refusal leaves the world untouched, so every one of them
 * releases a reservation rather than settling it.
 *
 * Stated as data rather than as a branch, because the mirror mistake — settling
 * on a refusal — silently bills for work that never left the building.
 */
export function refusalMeansNothingHappened(_r: GovernedEffectRefusal): boolean {
  return true
}

/**
 * May a success be claimed?
 *
 * Deliberately conservative. An outcome that needs reconciliation is not a
 * success that happens to be unconfirmed — it is an open question, and recording
 * success against it would tell the workflow the world is in a state nobody has
 * verified.
 */
export function mayRecordSuccessEvidence(input: {
  outcome: string
  reconciliationRequired: boolean
  spendSettled: boolean
  requiresSpend: boolean
}): boolean {
  if (input.reconciliationRequired) return false
  if (input.outcome !== 'SUCCEEDED') return false
  if (input.requiresSpend && !input.spendSettled) return false
  return true
}
