/**
 * lib/media/orchestrator/retry-authority.ts — may a CALLER run this generation
 * again?
 *
 * ── THE HOLE THIS CLOSES ───────────────────────────────────────────────────
 * `lib/media/job/lifecycle.ts` answers "may an automatic actor dispatch from
 * this state" with total care, and `run.ts` obeys it. But the guarantee stops at
 * the orchestrator's edge: a caller that wraps `orchestrateImageGeneration` in a
 * retry loop re-enters from the TOP, mints a NEW media job, and dispatches
 * again — without ever consulting the state machine, because from outside it
 * looks like one function that threw.
 *
 * `lib/article/hero-image.ts` does exactly that (`withRetry({ attempts: 2 })`).
 * The generic permanence heuristic reads HTTP status digits out of the message
 * text, and a `MediaJobError` carrying `dispatch_unknown` has none — so an
 * AMBIGUOUS DISPATCH, the one outcome the whole durable design exists to make
 * un-repeatable, reads as transient and is repeated.
 *
 * ── WHAT THIS MODULE IS ────────────────────────────────────────────────────
 * One composable predicate, shaped exactly like
 * `stopIsNotRetryable()` in `lib/governance/execution-dispatch.ts` — the
 * repository's existing answer to "this error class must never be retried".
 * Same reasoning applies: the retry primitive stays provider-neutral and every
 * other call site keeps the rule it already has.
 *
 * ── THE AUTHORITY RULE, AND WHERE IT COMES FROM ────────────────────────────
 * It is NOT a new taxonomy. Both error types already carry the fact, and this
 * module only reads them:
 *
 *   `MediaJobError`  → `mayAutomaticallyDispatch(err.state)`, the canonical
 *     function in `lifecycle.ts`. It returns true for `PENDING_DISPATCH` and
 *     nothing else. A retry loop IS an automatic actor, so it gets the same
 *     answer the reaper and the drain get — one rule, one place.
 *
 *   `MediaOrchestrationError` → `providerDispatched`, which
 *     `orchestrate.ts` has set since Phase 2 precisely to record "a paid call
 *     HAS happened".
 *
 *   `ProviderDispatchUnknownError` → the adapter's own statement that it could
 *     not prove the dispatch failed. Added for the SYNCHRONOUS bridge, which
 *     produces neither of the other two: a direct caller of
 *     `generateNewsImage` never enters the orchestrator and never mints a job.
 *
 * ── WHY THE RULE IS "WAS IT DISPATCHED", NOT "IS IT AMBIGUOUS" ─────────────
 * Ambiguity is the loudest case, not the only one. `ASSET_ADMISSION_FAILED`
 * and `PROVIDER_RESULT_INVALID` are both UNAMBIGUOUS — the provider succeeded
 * and was billed — and repeating either buys a second image for bytes Omnira
 * already paid for. A rule keyed on ambiguity would leave those retryable, and
 * they are reachable on the SHIPPED Ideogram path today, not only after the
 * provider-layer gate opens.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
 * No message parsing. No provider name. No new error code. No HTTP heuristic of
 * its own — it COMPOSES onto the existing one, so a failure this module has no
 * opinion about keeps exactly the behaviour it has today. It does not convert
 * UNKNOWN into FAILED, does not swallow anything, and cannot cause a dispatch:
 * it only ever answers "stop retrying".
 */

import { ProviderDispatchUnknownError } from '@/lib/media/job/dispatch'
import { mayAutomaticallyDispatch } from '@/lib/media/job/lifecycle'
import { MediaJobError } from '@/lib/media/job/run'
import { isPermanentByStatusText } from '@/lib/media/retry'
import { MediaOrchestrationError } from './orchestrate'

/**
 * Does this failure leave a provider dispatch possibly — or definitely — done?
 *
 * Answering TRUE forbids repeating the whole generation. It never permits one:
 * a `false` here means "this module has no opinion", and the composed rule
 * decides.
 */
export function generationMayAlreadyHaveDispatched(err: unknown): boolean {
  if (err instanceof MediaJobError) {
    // The job reached a state the lifecycle refuses to auto-dispatch from.
    // `PENDING_DISPATCH` is the only exception, and it means the durable record
    // could not even be written — nothing was sent, so a fresh attempt is safe.
    return !mayAutomaticallyDispatch(err.state)
  }

  if (err instanceof MediaOrchestrationError) {
    return err.providerDispatched
  }

  // A governed adapter saying, in the taxonomy's own words, that it could not
  // prove its dispatch failed. This covers the SYNCHRONOUS bridge, which never
  // creates a media job and never reaches the orchestrator when a caller
  // invokes it directly — `lib/article/hero-image.ts`'s writer fallback does
  // exactly that, so neither branch above can see it.
  if (err instanceof ProviderDispatchUnknownError) return true

  return false
}

/**
 * Compose "a generation that may already have dispatched is never retried" onto
 * a caller's existing permanence rule.
 *
 * Defaults to the shared status-text heuristic rather than to `false`, so
 * wrapping a call site STRENGTHENS it and never quietly drops the rule it had.
 *
 * Usage mirrors `stopIsNotRetryable`:
 *
 *     withRetry(() => orchestrateImageGeneration(brief),
 *       { attempts: 2, isPermanent: dispatchedGenerationIsNotRetryable() })
 */
export function dispatchedGenerationIsNotRetryable(
  existing: (err: unknown) => boolean = isPermanentByStatusText,
): (err: unknown) => boolean {
  return err => generationMayAlreadyHaveDispatched(err) || existing(err)
}
