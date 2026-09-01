/**
 * Omnira Trading — reconnect budget and delay.
 *
 * BOUNDED BY CONSTRUCTION
 * ───────────────────────
 * `maxAttempts` is required, not optional-with-a-default-of-infinity. A policy
 * you cannot construct without stating a budget cannot accidentally become an
 * unbounded retry loop against a provider that is refusing you — which is how a
 * client gets rate-limited, or billed, for a fault it could not fix.
 *
 * DETERMINISTIC BY DEFAULT
 * ────────────────────────
 * `delayForAttempt` is a pure function of the attempt number. No clock, no
 * randomness. Jitter is a real operational need when many clients reconnect at
 * once, but it is an INJECTED policy (`jitter`), never baked in — a core that
 * randomises itself cannot be tested for its exact attempt sequence, and that
 * sequence is the thing most worth asserting.
 *
 * THE DEFAULTS ARE RUNTIME DEFAULTS, NOT PROVIDER FACTS. Nothing here was
 * derived from any provider's documented behaviour, and no provider has told us
 * what its reconnect expectations are. They are conservative starting values,
 * marked as such, to be replaced by evidence rather than by preference.
 */

export interface ReconnectPolicy {
  /** How many attempts follow a failure before the runtime gives up. */
  readonly maxAttempts: number
  /** Delay before attempt 1. */
  readonly initialDelayMs: number
  /** Multiplier applied per subsequent attempt. 1 gives a fixed delay. */
  readonly backoffFactor: number
  /** Ceiling. Growth stops here however many attempts remain. */
  readonly maxDelayMs: number
  /**
   * Optional, injected, and pure from the caller's point of view.
   *
   * Given the computed delay and the attempt, return the delay to use. The core
   * never calls a random source itself, so a test that supplies no jitter gets
   * an exactly reproducible sequence.
   */
  readonly jitter?: (delayMs: number, attempt: number) => number
}

/**
 * Conservative runtime defaults. NOT provider facts, and not canon.
 *
 * Five attempts over roughly 15 seconds: long enough to ride out a brief blip,
 * short enough that a real outage surfaces to an operator instead of being
 * hidden by a client that keeps quietly trying.
 */
export const DEFAULT_RECONNECT_POLICY: ReconnectPolicy = {
  maxAttempts: 5,
  initialDelayMs: 1_000,
  backoffFactor: 2,
  maxDelayMs: 8_000,
}

/**
 * The delay before `attempt`, which is 1-based.
 *
 * Attempt 0 or lower yields the initial delay rather than throwing: a caller
 * that miscounts should reconnect slightly early, not crash a session teardown.
 */
export function delayForAttempt(policy: ReconnectPolicy, attempt: number): number {
  const steps = Math.max(0, attempt - 1)
  const raw = policy.initialDelayMs * Math.pow(policy.backoffFactor, steps)
  const capped = Math.min(raw, policy.maxDelayMs)
  const withJitter = policy.jitter === undefined ? capped : policy.jitter(capped, attempt)
  // A negative or non-finite jitter result must not become a negative timer.
  return Number.isFinite(withJitter) ? Math.max(0, withJitter) : capped
}

/** Whether `attempt` is still inside the budget. */
export function hasAttemptsLeft(policy: ReconnectPolicy, attempt: number): boolean {
  return attempt < policy.maxAttempts
}

/**
 * The full delay sequence a policy would produce, for inspection and tests.
 *
 * Exported so a test can assert the whole sequence in one expression instead of
 * re-deriving it, which would just re-implement the bug it is checking for.
 */
export function delaySequence(policy: ReconnectPolicy): readonly number[] {
  return Array.from(
    { length: policy.maxAttempts },
    (_unused, index) => delayForAttempt(policy, index + 1),
  )
}
