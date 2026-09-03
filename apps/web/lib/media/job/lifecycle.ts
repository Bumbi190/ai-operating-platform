/**
 * lib/media/job/lifecycle.ts — the canonical media job state machine.
 *
 * PURE: no database, no clock, no network, no provider. It decides; callers act.
 * Same discipline as `lib/media/providers/gate.ts`, `lib/media/orchestrator/
 * eligibility.ts` and `lib/workflows/action-outcome.ts`, and for the same reason
 * — every rule here is exhaustively testable without a fixture, and no branch can
 * "helpfully" fetch something that changes the answer.
 *
 * ── ONE AMBIGUITY VOCABULARY, NOT TWO ──────────────────────────────────────
 * Omnira already answered "what does a lost response mean" once, in
 * `lib/workflows/action-outcome.ts` (PR9d): FAILED is a POSITIVE CLAIM that the
 * side effect did not happen, a timeout cannot support that claim, so UNKNOWN is
 * a first-class terminal state that never auto-retries.
 *
 * That is exactly the question a paid media generation asks, so this module
 * REUSES `DispatchObservation` rather than inventing a parallel set of words.
 * The import is TYPE-ONLY and deliberately so:
 *
 *   • the vocabulary cannot drift — a change to the workflow observation set is
 *     a compile error here, caught by `mediaStateForDispatch`'s exhaustive switch;
 *   • nothing from the workflow AUTHORITY layer is pulled in at runtime.
 *
 * That distinction is the whole reuse decision. `lib/workflows` owns *bound
 * workflow actions*: a run there requires a workflow instance, a pinned
 * definition hash, an approved target hash and a human `authorization_id` — the
 * `runs_action_binding_complete` constraint is all-or-nothing. A media
 * generation for an article hero is none of those things, so it borrows the
 * REASONING about ambiguity and none of the machinery around it.
 *
 * ── WHAT MEDIA ADDS THAT A WORKFLOW ACTION DOES NOT HAVE ───────────────────
 * A workflow action is ONE call whose outcome is decided when it returns. A
 * media job also has a REMOTE LIFE after dispatch succeeds — it sits in a
 * vendor queue, runs, and finishes minutes later. `QUEUED` and `RUNNING` have no
 * workflow analogue, which is why this is a separate state set rather than a
 * re-export.
 */

import type { DispatchObservation } from '@/lib/workflows/action-outcome'
import type { MediaJobStatus } from '@/lib/media/providers/types'

// ── The states ───────────────────────────────────────────────────────────────

/**
 * Seven states, and the count is deliberate.
 *
 * `PENDING_DISPATCH` and `DISPATCHING` are separated because the boundary
 * BETWEEN them is the only thing that makes ambiguity decidable: before the
 * request leaves the machine a failure proves nothing happened; after it,
 * silence proves nothing at all. That is PR9d's `DISPATCH_STARTED` boundary,
 * expressed as the state a job is IN while the request is outstanding.
 *
 * There is deliberately no `RECONCILING` and no `PARTIAL`:
 *
 *   RECONCILING would be a state that describes what an OPERATOR is doing, not
 *   what the job is. A job under investigation is still UNKNOWN, and adding the
 *   state would mean every reader has to remember that two values mean "we do
 *   not know" — the exact state explosion PR9d avoided when it mapped
 *   `cancelled` onto `failed` rather than adding a fifth provider status.
 *
 *   PARTIAL is real for a workflow action that touches many objects. One image
 *   generation produces one output: it exists or it does not. A multi-output
 *   request (`count > 1`) is the case that could justify PARTIAL, and Phase 3
 *   does not dispatch one — see PHASE3_RESULT.md §9.
 */
export const MEDIA_JOB_STATES = [
  /** Local identity minted, nothing sent. The only state where retry is free. */
  'PENDING_DISPATCH',
  /** The request is outstanding. ← THE AMBIGUITY BOUNDARY. */
  'DISPATCHING',
  /** The vendor accepted it and has not started work. */
  'QUEUED',
  /** The vendor is working on it. */
  'RUNNING',
  /** The vendor finished successfully. NOT yet an Omnira success — see run.ts. */
  'SUCCEEDED',
  /** The vendor said no, or Omnira proved the request never left. */
  'FAILED',
  /** Omnira cannot prove whether a remote operation exists or what state it is in. */
  'UNKNOWN',
] as const

export type MediaJobState = (typeof MEDIA_JOB_STATES)[number]

/** Past this point "it failed" is no longer a claim silence can support. */
const AMBIGUITY_BOUNDARY: MediaJobState = 'DISPATCHING'

const STATE_RANK: Record<MediaJobState, number> = {
  PENDING_DISPATCH: 0,
  DISPATCHING: 1,
  QUEUED: 2,
  RUNNING: 3,
  SUCCEEDED: 4,
  FAILED: 4,
  UNKNOWN: 4,
}

/** True once a request has been put on the wire. */
export function hasEnteredAmbiguityWindow(state: MediaJobState): boolean {
  return STATE_RANK[state] >= STATE_RANK[AMBIGUITY_BOUNDARY]
}

export const TERMINAL_MEDIA_JOB_STATES: readonly MediaJobState[] = ['SUCCEEDED', 'FAILED', 'UNKNOWN']

export function isTerminalMediaJobState(state: MediaJobState): boolean {
  return TERMINAL_MEDIA_JOB_STATES.includes(state)
}

/**
 * UNKNOWN is the only ambiguous state, and it is TERMINAL.
 *
 * Terminal does not mean finished — it means nothing automatic may move it. Only
 * a recorded reconciliation can, and only in the directions below.
 */
export function isAmbiguousMediaJobState(state: MediaJobState): boolean {
  return state === 'UNKNOWN'
}

// ── Dispatch → state ─────────────────────────────────────────────────────────

/**
 * The state each dispatch observation SUPPORTS — never more than it proves.
 *
 * The switch is exhaustive over `DispatchObservation`, so if the workflow layer
 * ever adds an observation this stops compiling rather than silently defaulting.
 * Defaulting is precisely how an unhandled ambiguity becomes a `FAILED`.
 */
export function mediaStateForDispatch(observation: DispatchObservation): MediaJobState {
  switch (observation) {
    case 'not_dispatched':
      // The ONLY honest FAILED: nothing was sent, so nothing was billed and
      // nothing exists remotely.
      return 'FAILED'
    case 'remote_rejected':
      // The vendor answered, and its answer was no. Also a definite failure —
      // but for a different reason, and one a retry cannot change.
      return 'FAILED'
    case 'response_lost':
      // Timeout, socket reset, unparseable body. The job may exist remotely.
      return 'UNKNOWN'
    case 'remote_confirmed':
      // Accepted, with a usable operation id. The remote life begins.
      return 'QUEUED'
    case 'partially_applied':
      // Phase 3 dispatches exactly one operation, so a provider claiming a
      // partial creation is describing something Omnira did not ask for.
      // Treated as ambiguous rather than as a new state: we cannot prove what
      // exists, which is the definition of UNKNOWN.
      return 'UNKNOWN'
    case 'confirmed_evidence_failed':
      // The vendor accepted it and Omnira failed to write its own record. The
      // remote job is real; our ability to find it again is what is in doubt.
      return 'UNKNOWN'
  }
}

// ── Remote status → state ────────────────────────────────────────────────────

/**
 * Map the provider-neutral status onto the job state.
 *
 * `MediaJobStatus` is the adapter's normalized answer (`lib/media/providers/
 * types.ts`); this is the orchestrator-facing state. They are separate types on
 * purpose — the adapter reports what the VENDOR said, and only this layer knows
 * whether the job had already entered the ambiguity window.
 */
export function mediaStateForRemoteStatus(status: MediaJobStatus): MediaJobState {
  switch (status) {
    case 'pending':   return 'QUEUED'
    case 'running':   return 'RUNNING'
    case 'completed': return 'SUCCEEDED'
    case 'failed':    return 'FAILED'
  }
}

// ── Transitions ──────────────────────────────────────────────────────────────

export type MediaTransitionRefusal =
  | 'terminal_state_is_absorbing'
  | 'requires_reconciliation'
  | 'cannot_rewind_before_dispatch'
  | 'succeeded_cannot_become_failed'

export interface MediaTransitionContext {
  /** A reconciliation with a CONFIRMED (non-inconclusive) answer exists. */
  hasConfirmedReconciliation: boolean
}

/**
 * May the job move from `from` to `to`?
 *
 * Two rules carry everything:
 *
 *   1. A terminal state is ABSORBING. The single exception is UNKNOWN, and its
 *      only exit is a recorded reconciliation — the same rule
 *      `runs_action_outcome_guard` enforces in SQL for workflow actions, and for
 *      the identical reason: "it probably worked" is not evidence.
 *
 *   2. Nothing rewinds across the ambiguity boundary. A job that reached
 *      DISPATCHING can never be described as PENDING_DISPATCH again, because
 *      PENDING_DISPATCH is the state in which redispatch is safe, and a job that
 *      may already exist remotely is never safe to redispatch.
 */
export function isLegalMediaJobTransition(
  from: MediaJobState,
  to: MediaJobState,
  ctx: MediaTransitionContext = { hasConfirmedReconciliation: false },
): { ok: true } | { ok: false; refusal: MediaTransitionRefusal } {
  if (from === to) return { ok: true }

  if (hasEnteredAmbiguityWindow(from) && !hasEnteredAmbiguityWindow(to)) {
    return { ok: false, refusal: 'cannot_rewind_before_dispatch' }
  }

  if (from === 'UNKNOWN') {
    if (to === 'SUCCEEDED' || to === 'FAILED' || to === 'RUNNING' || to === 'QUEUED') {
      return ctx.hasConfirmedReconciliation
        ? { ok: true }
        : { ok: false, refusal: 'requires_reconciliation' }
    }
    return { ok: false, refusal: 'terminal_state_is_absorbing' }
  }

  if (from === 'SUCCEEDED') {
    // A remote success is a fact about the vendor. Later trouble — a bad
    // payload, a failed admission — is Omnira's problem and is reported as
    // itself, never by rewriting what the vendor did.
    return { ok: false, refusal: to === 'FAILED' ? 'succeeded_cannot_become_failed' : 'terminal_state_is_absorbing' }
  }

  if (from === 'FAILED') return { ok: false, refusal: 'terminal_state_is_absorbing' }

  // Non-terminal → anything forward is legal. RUNNING → QUEUED is permitted
  // rather than refused: a vendor whose queue reports out of order is describing
  // its own scheduling, not moving our job backwards, and refusing it would turn
  // a cosmetic vendor quirk into a frozen job.
  return { ok: true }
}

// ── Retry classification ─────────────────────────────────────────────────────

/**
 * The four things "retry" can mean. Collapsing them is the bug this phase exists
 * to prevent — `catch (timeout) → dispatch again` is a second paid generation.
 */
export const MEDIA_RETRY_CLASSES = [
  /** The remote operation definitely does not exist. A fresh dispatch is safe. */
  'SAFE_REDISPATCH',
  /** Retry the READ, never the creation. Costs nothing, changes nothing. */
  'STATUS_RETRY',
  /** Creation may have succeeded. Recover identity/state; never dispatch. */
  'RECONCILE',
  /** Any repetition could duplicate a paid generation. Automatic retry is refused. */
  'UNSAFE_REDISPATCH',
] as const

export type MediaRetryClass = (typeof MEDIA_RETRY_CLASSES)[number]

export interface MediaRetryDecision {
  retryClass: MediaRetryClass
  /** May an automatic actor act on this without a human? */
  automatic: boolean
  reason: string
}

/**
 * What may be done about a job in this state.
 *
 * The rule that matters, stated once: **an ambiguous state is never redispatched
 * automatically, ever.** Not after a backoff, not after N attempts, not because
 * the estimate was small. `lib/media/retry.ts` — the pipeline's blind
 * timeout-and-retry wrapper — must therefore never be placed around a dispatch
 * that reaches this state machine, and `run.ts` does not import it.
 */
export function classifyMediaRetry(state: MediaJobState): MediaRetryDecision {
  switch (state) {
    case 'PENDING_DISPATCH':
      return {
        retryClass: 'SAFE_REDISPATCH', automatic: true,
        reason: 'nothing has been sent; no remote operation can exist',
      }
    case 'DISPATCHING':
      return {
        retryClass: 'UNSAFE_REDISPATCH', automatic: false,
        reason: 'a request is outstanding; its outcome is not yet known',
      }
    case 'QUEUED':
    case 'RUNNING':
      return {
        retryClass: 'STATUS_RETRY', automatic: true,
        reason: 'the operation exists and is progressing; read its status, never recreate it',
      }
    case 'FAILED':
      return {
        // A definite failure is safe to redispatch in principle, but it is a
        // DECISION, not an automatic recovery: the vendor refused, or the
        // request never left, and in both cases something about the world has to
        // change first. Making it non-automatic is what stops a rejected prompt
        // from becoming a retry loop that never succeeds and always bills.
        retryClass: 'SAFE_REDISPATCH', automatic: false,
        reason: 'the operation definitely did not produce output; a fresh attempt is a deliberate act',
      }
    case 'SUCCEEDED':
      return {
        retryClass: 'UNSAFE_REDISPATCH', automatic: false,
        reason: 'the output exists; regenerating it would pay twice for the same result',
      }
    case 'UNKNOWN':
      return {
        retryClass: 'RECONCILE', automatic: false,
        reason: 'the operation may already exist; reconcile against the provider, never redispatch',
      }
  }
}

/**
 * The single question every automatic actor must ask before dispatching.
 *
 * Deliberately phrased as a positive permission rather than a negative check:
 * `if (!isBlocked)` is the shape that acquires an exception, and an exception
 * here is a duplicated charge.
 */
export function mayAutomaticallyDispatch(state: MediaJobState): boolean {
  const decision = classifyMediaRetry(state)
  return decision.retryClass === 'SAFE_REDISPATCH' && decision.automatic
}
