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

/** Read at call time so a flag flip needs no restart (and tests can toggle). */
export function isSpendGateEnforced(): boolean {
  return process.env.H1_SPEND_GATE === '1'
}
