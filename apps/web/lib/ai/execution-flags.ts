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
import { isFinancialExecutionEnabled } from '@/lib/governance/financial-execution-flag'

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
  /**
   * Phase 3A rollout gate: the FINANCIAL action class may enter the execution
   * lifecycle. Reported SEPARATELY from `spend_gate` and never inferred from it —
   * they are independent requirements and a FINANCIAL action needs both.
   */
  financial_execution: boolean
}

/**
 * Booleans only, read through the runtime's own predicates — the same read
 * semantics the runtime itself uses, so this surface cannot report a fiction.
 *
 * WITHIN one deployment the predicates read that deployment's `process.env` at
 * INVOCATION time. Across Vercel project configuration that is not the case:
 * deployments are IMMUTABLE, so changing an environment variable does NOT
 * affect a deployment that already exists. The new value becomes effective only
 * after a NEW deployment, and until then this surface reports the OLD state —
 * correctly, because that is what the running code is using.
 */
export function executionSafetyFlags(): ExecutionSafetyFlags {
  return {
    fencing:          isFencingEnabled(),
    cancel:           isCancelEnabled(),
    policy_gate:      process.env.H1_POLICY_GATE === '1',
    unified_executor: process.env.H1_UNIFIED_EXECUTOR === '1',
    spend_gate:       isSpendGateEnforced(),
    financial_execution: isFinancialExecutionEnabled(),
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
  // Phase 3A configuration drift, NOT a safety fault: the FINANCIAL class is
  // switched on for execution while the budget verdict is still only recorded.
  // `action-run` still refuses to bind in this state (both requirements are
  // checked independently, so `spend_enforcement_required` fires first), which is
  // exactly why this is reported as DRIFT an operator should resolve rather than
  // as an unsafe condition — the system is failing closed, and loudly.
  if (f.financial_execution && !f.spend_gate) {
    unsafe.push('financial_execution_without_spend_enforcement')
  }
  // `financial_execution === false` is deliberately NOT reported. A closed
  // rollout gate is the SAFE default and the fail-closed state; flagging it would
  // train operators to treat "not switched on yet" as a problem to clear.
  return unsafe
}
