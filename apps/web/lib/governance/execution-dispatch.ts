/**
 * lib/governance/execution-dispatch.ts — the final boundary for an external write
 * that costs no money.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * G3C-1 put a fresh canonical stop decision immediately before every PAID
 * provider dispatch. That protected the money and nothing else. A publish to
 * Instagram, a Meta media container, a YouTube upload, a comment reply and a new
 * Remotion Lambda render are all externally visible, materially irreversible,
 * and cost SEK 0 — so none of them passed through that boundary.
 *
 * They were guarded, at best, by a single route-entry read of the raw global
 * flag. That is the stale-read shape twice over: it is global-only, so a paused
 * PROJECT could still publish its own content; and it is read once per route, so
 * a pause committing between two channels did not stop the second one.
 *
 * ── WHAT THIS IS ───────────────────────────────────────────────────────────
 * The enforcement point for one external attempt. Deliberately NOT
 * `resolveExecutionEligibility`, whose own contract says it is an early
 * optimisation whose answer must never be carried forward. An early "allowed"
 * means "do not bother stopping yet"; this means "you may send this packet now".
 *
 * It owns no truth table. It reads no `automation_paused`, no
 * `execution_paused`, and no billing result. It asks `execution-stop.ts` — the
 * one authority — and turns a refusal into the canonical error.
 *
 * ── WHAT IT DOES NOT PROMISE ───────────────────────────────────────────────
 * The same honest in-flight contract as G3C-1. A network call cannot join the
 * Postgres transaction that holds the stop row, so:
 *
 *   • stop commits BEFORE the decision → no external write happens;
 *   • stop commits AFTER an allowed decision → that one in-flight attempt may
 *     finish, and nothing rolls it back;
 *   • the NEXT attempt — next channel, next retry, next script, next comment —
 *     must call this again.
 *
 * "No packet after the pause commits" would need a durable dispatch claim.
 * That is deliberately not built here.
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveGovernedProjectId } from '@/lib/cost/governed-spend'
import {
  ExecutionStoppedError,
  resolveExecutionStopForContract,
  type ExecutionContract,
} from './execution-stop'

/**
 * Where the packet is going. Labels only — they appear in the error message and
 * in logs so an operator can tell WHICH boundary refused. They are never an
 * input to the decision: naming a system cannot widen or narrow authority.
 */
export interface DispatchTarget {
  /** External system, e.g. 'instagram', 'facebook', 'youtube', 'remotion-lambda'. */
  system?: string
  /** The specific write, e.g. 'media_publish', 'create_container', 'reply'. */
  operation?: string
}

/**
 * Authorise exactly ONE external write attempt, or throw.
 *
 * Call this immediately before the call that leaves the machine — and inside the
 * retry callback, never outside it, so every Omnira-controlled attempt
 * re-authorises. A pause can commit during a backoff sleep.
 *
 * Throws `ExecutionStoppedError`. That is CONTROL FLOW, not an external
 * failure: callers must not count it as a provider error, increment a failure
 * counter for it, classify it permanent, or alert on it as a pipeline fault.
 * Nothing was dispatched, so there is nothing to have failed.
 */
export async function assertExecutionDispatchAllowed(
  execution: ExecutionContract,
  target: DispatchTarget = {},
): Promise<void> {
  const decision = await resolveExecutionStopForContract(
    createAdminClient(),
    execution,
    // The execution project resolves independently, exactly as at the paid
    // boundary. No billing lookup result may reach this.
    async ref => {
      const r = await resolveGovernedProjectId(ref)
      return r.ok ? r.projectId : null
    },
  )

  if (decision.allowed) return

  throw new ExecutionStoppedError({
    reason: decision.reason ?? 'stop_state_unavailable',
    context: execution.context,
    scopeKind: execution.scope.kind,
    decision,
    provider: target.system,
    operation: target.operation,
  })
}

/**
 * Compose "a stop is never retryable" onto a route's existing permanence rule.
 *
 * `withRetry` sleeps and tries again unless a failure is permanent. A stop is
 * not a failure at all, so retrying it would sleep, ask again, and eventually
 * report the operator's own pause as an exhausted external call. It must exit
 * the retry loop immediately and propagate unchanged.
 *
 * This composes rather than replacing: the generic retry primitive stays
 * provider-neutral, and Meta's genuinely ambiguous 400s keep the custom rule
 * they already need.
 */
export function stopIsNotRetryable(
  existing?: (err: unknown) => boolean,
): (err: unknown) => boolean {
  return err => err instanceof ExecutionStoppedError || (existing?.(err) ?? false)
}

/** True when this error is a governance stop rather than an external fault. */
export function isExecutionStopped(err: unknown): err is ExecutionStoppedError {
  return err instanceof ExecutionStoppedError
}
