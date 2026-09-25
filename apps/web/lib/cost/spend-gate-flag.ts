/**
 * lib/cost/spend-gate-flag.ts — the one place H1_SPEND_GATE is read.
 *
 * Deliberately its own module with no `server-only` marker and no database
 * import, so both the gate itself (`budget-gate.ts`, which is server-only) and
 * the effective-state surface (`lib/ai/execution-flags.ts`) can share ONE
 * predicate. A second env read in the status surface could report a fiction
 * while the gate behaved differently — the exact failure PR9a's flag tests
 * exist to prevent.
 */

/**
 * Read from `process.env` at INVOCATION time, so whatever value this deployment's
 * environment already holds is used without a restart. That is what lets a test
 * toggle it, and what keeps the effective-state surface reporting what the runtime
 * is actually using rather than a value captured at import.
 *
 * That is NOT the same as editing it taking effect. Vercel deployments are
 * IMMUTABLE: changing project environment configuration requires a NEW deployment
 * before the new value is ever read here. Editing the variable does nothing to a
 * deployment that is already running, so a flag change and its effect are always
 * separated by a deploy — never by a restart, and never instantly.
 */
export function isSpendGateEnforced(): boolean {
  return process.env.H1_SPEND_GATE === '1'
}
