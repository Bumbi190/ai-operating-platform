/**
 * lib/ai/execution-flags.ts — the EFFECTIVE state of the execution safety flags.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The safety flags are stored as sensitive Vercel env vars, which means their
 * values are unreadable from outside the running process: `vercel env pull`
 * returns `H1_FENCING=""` whether it is "1", "0" or anything else. During the
 * Phase 8.5 review it was therefore impossible to prove whether fencing was
 * actually on in production — and an unverifiable safety feature is not a safety
 * feature. `H1_CANCEL` turned out to be unset entirely, which is exactly the
 * class of thing this makes visible.
 *
 * Each flag's effective value is read through the SAME predicate the runtime
 * uses (`isFencingEnabled`, `isCancelEnabled`), not by re-reading the env var
 * here. If the two ever disagreed, this surface would be reporting a fiction.
 *
 * ── WHAT IT MUST NEVER DO ───────────────────────────────────────────────────
 * Return, log or echo a raw env value. Only booleans leave this module. The
 * distinction matters: "cancellation is on" is operational truth an operator
 * needs; the literal contents of an encrypted env var is a secret.
 */

import { isFencingEnabled } from './fencing'
import { isCancelEnabled } from './cancel'
import { isSpendGateEnforced } from '@/lib/cost/spend-gate-flag'

export interface ExecutionSafetyFlags {
  /** Writes from an executing run are conditioned on its claim_id. */
  fencing: boolean
  /** A cancel request is honoured cooperatively by the drain and executor. */
  cancel: boolean
  /** Terminal outcome routed through decideGate (default-deny on unknown class). */
  policy_gate: boolean
  /** The unified executor (validation + quality gate + checkpointed resume). */
  unified_executor: boolean
  /** PR9b: a budget refusal is HONOURED rather than merely recorded. */
  spend_gate: boolean
}

/**
 * Booleans only, derived at call time so a flag flip is visible without a
 * redeploy — the same read semantics the runtime itself uses.
 */
export function executionSafetyFlags(): ExecutionSafetyFlags {
  return {
    fencing:          isFencingEnabled(),
    cancel:           isCancelEnabled(),
    policy_gate:      process.env.H1_POLICY_GATE === '1',
    unified_executor: process.env.H1_UNIFIED_EXECUTOR === '1',
    spend_gate:       isSpendGateEnforced(),
  }
}

/**
 * The flags whose being OFF is a stop-safety problem worth surfacing.
 * `policy_gate` and `unified_executor` are execution-behaviour flags, not
 * stop-safety ones, so they are reported but never counted as unsafe here.
 */
export function unsafeExecutionFlags(f: ExecutionSafetyFlags = executionSafetyFlags()): string[] {
  const unsafe: string[] = []
  if (!f.fencing) unsafe.push('fencing_disabled')
  if (!f.cancel) unsafe.push('cancel_disabled')
  // Advisory-by-design for now, but it must be VISIBLE that spend is only being
  // observed rather than limited — an unenforced budget reads as a budget.
  if (!f.spend_gate) unsafe.push('spend_gate_advisory_only')
  return unsafe
}
