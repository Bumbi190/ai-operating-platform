/**
 * lib/workflows/action-outcome.ts — what happened, and may we try again.
 *
 * ── THE DISTINCTION EVERYTHING ELSE RESTS ON ───────────────────────────────
 * `FAILED` is a POSITIVE CLAIM: the side effect did not happen. A timeout cannot
 * support that claim, and neither can a connection reset, because the request may
 * have been applied before the answer was lost. Today's drain makes no such
 * distinction — every throw becomes retry-or-failed — so a timed-out upload would
 * be reported as one that never happened, and a material action with
 * max_attempts=1 would silently land on `failed`.
 *
 * UNKNOWN is therefore not an error string. It is a first-class outcome, it is
 * terminal, and it keeps its idempotency identity so nothing can quietly retry.
 *
 * ── PHASE MAKES AMBIGUITY DECIDABLE ────────────────────────────────────────
 * Before DISPATCH_STARTED, a failure proves nothing left the machine. After it,
 * silence proves nothing at all. That single boundary is what the reaper, the
 * cancel path and the retry policy all read, which is why it is a stored column
 * rather than something inferred from an error message.
 *
 * This module is PURE: no database, no clock, no network. It decides; callers act.
 */

import { ACTION_CLASS_POLICY, type ActionClass } from './action-target'

export const ACTION_PHASES = [
  'PREPARED',            // bound, nothing attempted
  'PRE_COMMIT_VERIFIED', // revalidated; still nothing sent
  'DISPATCH_STARTED',    // ← the ambiguity boundary
  'REMOTE_CONFIRMED',    // authoritative system answered success
  'EVIDENCE_RECORDED',   // our own audit caught up
  'COMPLETE',
] as const
export type ActionPhase = (typeof ACTION_PHASES)[number]

export const ACTION_OUTCOMES = [
  'FAILED',                     // definitely did not happen
  'SUCCEEDED',                  // definitely happened, and is recorded
  'UNKNOWN',                    // may or may not have happened
  'PARTIAL',                    // some of it definitely happened
  'SUCCEEDED_EVIDENCE_PENDING', // remote applied it; our audit did not persist
  'CANCELLED',                  // stopped before the irreversible boundary
  'REJECTED',                   // never started: readiness/policy/auth refused
] as const
export type ActionOutcome = (typeof ACTION_OUTCOMES)[number]

export function phaseRank(phase: ActionPhase | null | undefined): number {
  return phase ? ACTION_PHASES.indexOf(phase) + 1 : 0
}

/** Past this point, "it failed" is no longer a claim we can make from silence. */
export const DISPATCH_BOUNDARY = phaseRank('DISPATCH_STARTED')

export function hasDispatched(phase: ActionPhase | null | undefined): boolean {
  return phaseRank(phase) >= DISPATCH_BOUNDARY
}

/** Ambiguous outcomes freeze the workflow and require a human. */
export const AMBIGUOUS_OUTCOMES: readonly ActionOutcome[] = ['UNKNOWN', 'PARTIAL']

export function isAmbiguous(outcome: ActionOutcome | null | undefined): boolean {
  return !!outcome && AMBIGUOUS_OUTCOMES.includes(outcome)
}

// ── Phase transitions ───────────────────────────────────────────────────────

/** Phase is monotonic: an executor may skip forward, never rewind. */
export function isLegalPhaseTransition(from: ActionPhase | null, to: ActionPhase): boolean {
  return phaseRank(to) > phaseRank(from)
}

// ── Outcome transitions ─────────────────────────────────────────────────────

export type OutcomeTransitionRefusal =
  | 'terminal_outcome_is_absorbing'
  | 'requires_reconciliation'
  | 'partial_cannot_widen_to_succeeded'
  | 'cancelled_illegal_after_dispatch'

export interface OutcomeTransitionContext {
  /** A CONFIRMED (non-STILL_UNKNOWN) reconciliation exists for this run. */
  hasConfirmedReconciliation: boolean
  /** The phase the run reached. */
  phase: ActionPhase | null
}

/**
 * May the outcome move from `from` to `to`?
 *
 * Terminal outcomes are absorbing. The only exits are the two that reconciliation
 * or evidence legitimately provide, and `PARTIAL → SUCCEEDED` is refused outright:
 * discovering that more of an operation landed than you thought does not mean all
 * of it did, and pretending otherwise loses the part that never happened.
 */
export function isLegalOutcomeTransition(
  from: ActionOutcome | null, to: ActionOutcome, ctx: OutcomeTransitionContext,
): { ok: true } | { ok: false; refusal: OutcomeTransitionRefusal } {
  if (to === 'CANCELLED' && hasDispatched(ctx.phase)) {
    // Cancellation cannot un-send a message.
    return { ok: false, refusal: 'cancelled_illegal_after_dispatch' }
  }
  if (from === null || from === to) return { ok: true }

  if (from === 'UNKNOWN') {
    if (to === 'SUCCEEDED' || to === 'FAILED' || to === 'PARTIAL') {
      return ctx.hasConfirmedReconciliation
        ? { ok: true }
        : { ok: false, refusal: 'requires_reconciliation' }
    }
    return { ok: false, refusal: 'terminal_outcome_is_absorbing' }
  }
  if (from === 'PARTIAL') {
    if (to === 'SUCCEEDED') return { ok: false, refusal: 'partial_cannot_widen_to_succeeded' }
    if (to === 'FAILED') {
      return ctx.hasConfirmedReconciliation
        ? { ok: true }
        : { ok: false, refusal: 'requires_reconciliation' }
    }
    return { ok: false, refusal: 'terminal_outcome_is_absorbing' }
  }
  if (from === 'SUCCEEDED_EVIDENCE_PENDING' && to === 'SUCCEEDED') {
    // Our audit caught up. No side effect is repeated by this transition.
    return { ok: true }
  }
  return { ok: false, refusal: 'terminal_outcome_is_absorbing' }
}

// ── Classifying a failure ───────────────────────────────────────────────────

/**
 * How a call ended, from the executor's point of view. Deliberately about
 * OBSERVATION, not about HTTP status: "the remote told us no" and "we never heard
 * back" are different facts even when both surface as an exception.
 */
export type DispatchObservation =
  /** Never left the machine: precondition, validation, connect refused. */
  | 'not_dispatched'
  /** Sent, and the authoritative system explicitly answered failure. */
  | 'remote_rejected'
  /** Sent, and the answer was lost: timeout, reset, aborted, 5xx with no body. */
  | 'response_lost'
  /** Sent and confirmed applied. */
  | 'remote_confirmed'
  /** Multi-object: some applied, some did not. */
  | 'partially_applied'
  /** Confirmed applied, but our own evidence write failed afterwards. */
  | 'confirmed_evidence_failed'

/** The outcome each observation supports — never more than it proves. */
export function outcomeForObservation(
  observation: DispatchObservation, phase: ActionPhase | null,
): ActionOutcome {
  switch (observation) {
    case 'not_dispatched':
      // Only honest as FAILED because nothing was sent. If the phase says we DID
      // dispatch, the caller is mistaken and we fall back to the safe answer.
      return hasDispatched(phase) ? 'UNKNOWN' : 'FAILED'
    case 'remote_rejected':            return 'FAILED'
    case 'response_lost':              return 'UNKNOWN'
    case 'partially_applied':          return 'PARTIAL'
    case 'confirmed_evidence_failed':  return 'SUCCEEDED_EVIDENCE_PENDING'
    case 'remote_confirmed':           return 'SUCCEEDED'
  }
}

// ── Retry policy ────────────────────────────────────────────────────────────

export type RetryDecision =
  | { retry: true; reason: string }
  | { retry: false; reason: string; requiresHuman: boolean }

/**
 * May this outcome be retried automatically?
 *
 * The rule that matters: an ambiguous outcome is NEVER retried, for any class.
 * Repeating a call that may already have applied is how a newsletter goes out
 * twice and a charge lands twice. Even READ_ONLY does not retry an UNKNOWN,
 * because a read that could not be completed tells us nothing about the world —
 * though for a read the consequence is merely a wasted attempt, so it is the
 * class policy rather than safety that stops it.
 */
export function decideRetry(
  actionClass: ActionClass, outcome: ActionOutcome, attempts: number,
  observation?: DispatchObservation,
): RetryDecision {
  const policy = ACTION_CLASS_POLICY[actionClass]

  if (isAmbiguous(outcome)) {
    return {
      retry: false, requiresHuman: true,
      reason: `${outcome} on ${actionClass}: the side effect may already have been applied — reconcile, never retry`,
    }
  }
  if (outcome === 'SUCCEEDED' || outcome === 'SUCCEEDED_EVIDENCE_PENDING') {
    return {
      retry: false, requiresHuman: outcome === 'SUCCEEDED_EVIDENCE_PENDING',
      reason: 'the side effect already happened; repeating it would duplicate it',
    }
  }
  if (outcome === 'CANCELLED' || outcome === 'REJECTED') {
    return { retry: false, requiresHuman: false, reason: `${outcome}: nothing to retry` }
  }

  // FAILED. Only now is retry even conceivable, and only when nothing was sent.
  if (observation === 'remote_rejected') {
    return {
      retry: false, requiresHuman: actionClass !== 'READ_ONLY',
      reason: 'the authoritative system answered no — the world must change first',
    }
  }
  if (observation !== undefined && observation !== 'not_dispatched') {
    return { retry: false, requiresHuman: true, reason: 'cannot prove the action did not start' }
  }
  if (attempts >= policy.maxAttempts) {
    return { retry: false, requiresHuman: actionClass !== 'READ_ONLY', reason: 'attempt budget exhausted' }
  }
  return { retry: true, reason: `pre-dispatch failure on ${actionClass}: nothing was sent, safe to retry` }
}

/** An ambiguous MATERIAL+ action freezes its workflow until a human resolves it. */
export function freezesWorkflow(actionClass: ActionClass, outcome: ActionOutcome | null): boolean {
  if (!isAmbiguous(outcome)) return outcome === 'SUCCEEDED_EVIDENCE_PENDING'
  return actionClass !== 'READ_ONLY'
}
