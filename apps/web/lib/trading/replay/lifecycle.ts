/**
 * Omnira Trading — the setup/opportunity lifecycle.
 *
 * WHAT THIS IS
 * ────────────
 * An APPLICATION-level description of where a trading opportunity has got to.
 * It answers "what is the state of this idea", and it is the thing the future
 * right rail groups planned trades by.
 *
 * WHAT THIS IS NOT
 * ────────────────
 * An execution state machine. There is no SUBMITTED, no WORKING, no FILLED —
 * those describe an order's progress at a broker, and this lifecycle never
 * reaches a broker.
 *
 * CONFIRMED DOES NOT MEAN EXECUTABLE.
 *
 * A confirmed setup is an observation that every confirmation the strategy asks
 * for has been reported. It grants nothing. No transition in this file mints
 * `RiskClearance`, `PropClearance`, `ApprovalGrant` or `ExecutionIntent`, and it
 * structurally cannot: this module imports no constructor for any of them, and
 * issuance lives in `lib/trading/internal/`, which the replay package never
 * reaches.
 *
 * AUTHORITY IS ISSUED, NOT DERIVED FROM DATA.
 *
 * Relationship to `SetupStage`
 * ────────────────────────────
 * Stage 1's `SetupStage` (NONE / DEVELOPING / CONFIRMED / INVALIDATED / UNKNOWN)
 * is the PRESENTATION vocabulary the setup panel renders. This lifecycle is
 * richer — it distinguishes BLOCKED, EXPIRED and COMPLETED, which the panel does
 * not need because the risk and proposal panels already say those things. The
 * projection maps one onto the other explicitly rather than widening the
 * presentation contract.
 */

import type { SetupStage } from '../market-view'

/**
 * The seven states an opportunity can be in.
 *
 * OBSERVING     nothing is developing; the market is being watched
 * DEVELOPING    structure is forming, confirmations incomplete
 * CONFIRMED     every confirmation reported — still not executable
 * BLOCKED       a gate (risk, prop) refuses it, regardless of quality
 * EXPIRED       its window passed before it resolved
 * INVALIDATED   the structure that justified it broke
 * COMPLETED     it ran its course and is closed out
 */
export const SETUP_LIFECYCLES = [
  'OBSERVING',
  'DEVELOPING',
  'CONFIRMED',
  'BLOCKED',
  'EXPIRED',
  'INVALIDATED',
  'COMPLETED',
] as const
export type SetupLifecycle = (typeof SETUP_LIFECYCLES)[number]

/** True once nothing further can happen to this opportunity. */
export function isTerminalLifecycle(state: SetupLifecycle): boolean {
  return state === 'EXPIRED' || state === 'INVALIDATED' || state === 'COMPLETED'
}

/**
 * Whether a lifecycle state permits execution. Always false.
 *
 * Written as an exhaustive statement rather than `return false` so it is a total
 * function over the union: adding a state to `SETUP_LIFECYCLES` without deciding
 * this question makes the test that iterates every member fail, rather than
 * silently inheriting a permissive default.
 *
 * There is deliberately no counterpart that returns true anywhere in this
 * package. Execution permission is not a property of a lifecycle state.
 */
export function lifecycleAllowsExecution(state: SetupLifecycle): boolean {
  switch (state) {
    case 'OBSERVING':
    case 'DEVELOPING':
    case 'CONFIRMED':
    case 'BLOCKED':
    case 'EXPIRED':
    case 'INVALIDATED':
    case 'COMPLETED':
      return false
    default: {
      // Unreachable while the union is fully handled. If a new member is added,
      // this stops compiling — which is the point.
      const exhaustive: never = state
      return exhaustive
    }
  }
}

/**
 * Transitions a fixture may assert.
 *
 * This is a legality table, not a detector. It says which moves are coherent to
 * author; it never decides that a move should happen. Deciding that is Strategy
 * Engine work behind gates that remain open.
 *
 * Terminal states have no outgoing transitions — an expired opportunity does not
 * come back, it is replaced by a new one with a new correlation id.
 */
const ALLOWED: Readonly<Record<SetupLifecycle, readonly SetupLifecycle[]>> = {
  OBSERVING: ['DEVELOPING', 'INVALIDATED', 'EXPIRED'],
  // A developing setup can be blocked before it ever confirms — risk does not
  // wait for quality.
  DEVELOPING: ['CONFIRMED', 'BLOCKED', 'INVALIDATED', 'EXPIRED', 'OBSERVING'],
  // And a confirmed one can still be blocked, which is the whole point.
  CONFIRMED: ['BLOCKED', 'INVALIDATED', 'EXPIRED', 'COMPLETED'],
  // Blocked is not terminal: the block can lift (a new day, a reset), and the
  // opportunity returns to whatever it had reached.
  BLOCKED: ['DEVELOPING', 'CONFIRMED', 'INVALIDATED', 'EXPIRED'],
  EXPIRED: [],
  INVALIDATED: [],
  COMPLETED: [],
}

export function canTransition(from: SetupLifecycle, to: SetupLifecycle): boolean {
  return ALLOWED[from].includes(to)
}

export function allowedTransitionsFrom(from: SetupLifecycle): readonly SetupLifecycle[] {
  return ALLOWED[from]
}

/**
 * Map the application lifecycle onto the presentation stage.
 *
 * Lossy on purpose. BLOCKED renders as the stage the setup actually reached —
 * the block itself is stated loudly by the risk panel and the safety banner, and
 * flattening a confirmed-but-blocked setup to "not confirmed" would misdescribe
 * the market. COMPLETED renders as CONFIRMED for the same reason: the setup was
 * real, and the proposal panel carries its outcome.
 */
export function lifecycleToSetupStage(
  lifecycle: SetupLifecycle,
  reached: SetupLifecycle,
): SetupStage {
  switch (lifecycle) {
    case 'OBSERVING':
      return 'NONE'
    case 'DEVELOPING':
      return 'DEVELOPING'
    case 'CONFIRMED':
    case 'COMPLETED':
      return 'CONFIRMED'
    case 'INVALIDATED':
      return 'INVALIDATED'
    case 'EXPIRED':
      return reached === 'CONFIRMED' ? 'CONFIRMED' : 'NONE'
    case 'BLOCKED':
      // Show what it got to, not the block. The block has its own loud surface.
      return reached === 'CONFIRMED' ? 'CONFIRMED' : 'DEVELOPING'
  }
}

export const LIFECYCLE_LABELS: Readonly<Record<SetupLifecycle, string>> = {
  OBSERVING: 'OBSERVERAR',
  DEVELOPING: 'UTVECKLAS',
  CONFIRMED: 'BEKRÄFTAD',
  BLOCKED: 'BLOCKERAD',
  EXPIRED: 'UTGÅNGEN',
  INVALIDATED: 'OGILTIG',
  COMPLETED: 'AVSLUTAD',
}
