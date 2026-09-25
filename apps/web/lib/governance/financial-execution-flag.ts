/**
 * lib/governance/financial-execution-flag.ts — the one place
 * `H1_FINANCIAL_EXECUTION` is read.
 *
 * ── WHAT THIS FLAG MEANS, AND WHAT IT DOES NOT ──────────────────────────────
 * It is a DEPLOYMENT / ROLLOUT gate with exactly one meaning:
 *
 *     "the FINANCIAL action class is allowed to enter the execution lifecycle"
 *
 * It is deliberately NOT any of these, and must never be read as one:
 *
 *   • human authorization — that is Authorization V1 and the Decision Ledger
 *   • an Autonomy License — that is Chapter 18, and Phase 2C is truth-only
 *   • capability — capability is not authority
 *   • spend authority — the budget authority is `budget_reserve`, alone
 *   • project authority — that is `resolveProjectAccess` / the project's own
 *     pause state
 *   • a replacement for ActionClass policy — `ACTION_CLASS_POLICY` remains the
 *     single answer to "what does this action class require?"
 *
 * A rollout gate says whether something MAY be switched on. It never says the
 * work is permitted; every other requirement still applies on top of it.
 *
 * ── WHY IT IS A SEPARATE FILE FROM spend-gate-flag.ts ───────────────────────
 * The audit found `H1_SPEND_GATE` doing two jobs at once: honouring the budget
 * verdict, AND deciding whether FINANCIAL actions could bind at all. One flag
 * meant two unrelated facts, so neither could be reasoned about alone — turning
 * on budget enforcement silently unlocked the first real-money effect.
 *
 * Separating them physically is the point, not an implementation detail. A
 * predicate that lives beside the spend flag invites a future editor to treat
 * them as one setting again; a predicate in `lib/governance/` with its own
 * module boundary cannot be crossed by accident. There is deliberately NO
 * fallback to `H1_SPEND_GATE`: if this flag is unset the answer is NO, even
 * when spend enforcement is on.
 *
 * Default OFF. That is the safe direction: an absent rollout flag must never be
 * the reason money moves.
 */

/**
 * Read from `process.env` at INVOCATION time, so whatever value this deployment's
 * environment already holds is used without a restart — which is what lets a test
 * toggle it, and what keeps the execution-safety surface reporting what the
 * runtime is actually using rather than a value captured at import.
 *
 * That is NOT the same as editing it taking effect. Vercel deployments are
 * IMMUTABLE: changing project environment configuration requires a NEW deployment
 * before the new value is ever read here. Editing the variable does nothing to a
 * deployment that is already running.
 *
 * The consequence is deliberate and worth stating: activation is a DEPLOY, and so
 * is rollback. Unsetting this flag does not close the gate on a running
 * deployment; deploying a build without it does.
 */
export function isFinancialExecutionEnabled(): boolean {
  return process.env.H1_FINANCIAL_EXECUTION === '1'
}
