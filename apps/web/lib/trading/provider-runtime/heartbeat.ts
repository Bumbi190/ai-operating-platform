/**
 * Omnira Trading — heartbeat policy.
 *
 * EVERY NUMBER HERE COMES FROM THE PROVIDER
 * ─────────────────────────────────────────
 * There is deliberately no `DEFAULT_HEARTBEAT_POLICY`. A heartbeat interval is a
 * provider fact — some providers announce it at login, some publish it, some
 * have none — and a default would be a guess wearing the costume of a
 * specification. The first time that guess is wrong, the symptom is a session
 * dropped for inactivity or a client hammering a server it was asked to leave
 * alone, and the wrong number will look authoritative in the code.
 *
 * So the policy is required, and constructing a runtime without one is a type
 * error. Test policies exist, and are obviously test policies.
 *
 * WHAT A MISSED HEARTBEAT MEANS, AND WHAT IT DOES NOT
 * ───────────────────────────────────────────────────
 * It means the link has stopped producing evidence of life. It does NOT mean
 * the provider is unhealthy, that positions are stale, or that trading should
 * stop — those are judgements made further up on more evidence. A missed beat
 * degrades liveness; only `missesBeforeFailure` consecutive misses end the
 * session, and even then the failure is a transport failure, never a verdict.
 */

export interface HeartbeatPolicy {
  /**
   * How often to consider sending, in runtime milliseconds.
   *
   * Provider-supplied. Never defaulted.
   */
  readonly intervalMs: number

  /** How long to wait for evidence of life before counting a miss. */
  readonly timeoutMs: number

  /**
   * Whether this provider requires the client to send anything at all.
   *
   * Some links are kept alive by the server; sending into those is noise.
   */
  readonly outboundRequired: boolean

  /**
   * Whether ordinary inbound traffic counts as evidence of life.
   *
   * When true, a busy session never needs to send a heartbeat — which is what
   * most providers actually want. When false, only an explicit acknowledgement
   * counts, and the runtime keeps sending regardless of other traffic.
   */
  readonly inboundCountsAsActivity: boolean

  /**
   * Consecutive misses before the session is failed.
   *
   * Must be at least 1. One missed beat is a hiccup; the point of this number
   * is that a single one does not tear down a working session.
   */
  readonly missesBeforeFailure: number
}

/** Whether the runtime should send an outbound beat given the policy. */
export function shouldSendOutbound(policy: HeartbeatPolicy): boolean {
  return policy.outboundRequired
}

/**
 * Whether `misses` has reached the failure threshold.
 *
 * `>=`, not `===`: a counter that can only be caught at one exact value is a
 * counter that runs away if anything ever increments it twice.
 */
export function missesExhausted(policy: HeartbeatPolicy, misses: number): boolean {
  return misses >= Math.max(1, policy.missesBeforeFailure)
}

/**
 * A policy for tests. Obviously a test policy, and named so it reads as one at
 * the call site — no test number should ever be mistaken for a provider fact.
 */
export function testHeartbeatPolicy(overrides: Partial<HeartbeatPolicy> = {}): HeartbeatPolicy {
  return {
    intervalMs: 1_000,
    timeoutMs: 500,
    outboundRequired: true,
    inboundCountsAsActivity: true,
    missesBeforeFailure: 2,
    ...overrides,
  }
}
