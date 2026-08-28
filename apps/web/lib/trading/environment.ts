/**
 * Omnira Trading Core — environment separation.
 *
 * Canonical source:
 *  - Systemarkitektur v0.1 §33 (environment separation)
 *  - Datamodell v0.1 §50 (allowed environments)
 *
 * INVARIANTS:
 *  - LIVE is never a default. A missing or unrecognized environment resolves to
 *    nothing at all, never to 'live'.
 *  - Environments never mix. Objects crossing an authority boundary must agree
 *    on environment or the operation is refused.
 *  - Only 'live' touches real capital; 'demo' is the highest non-live tier.
 */

// ─── Environments ─────────────────────────────────────────────────────────────

/** The four canonical environments, ordered from least to most consequential. */
export const TRADING_ENVIRONMENTS = ['development', 'backtest', 'demo', 'live'] as const
export type TradingEnvironment = (typeof TRADING_ENVIRONMENTS)[number]

/** True when the value is one of the canonical environments. */
export function isTradingEnvironment(raw: unknown): raw is TradingEnvironment {
  return typeof raw === 'string' && (TRADING_ENVIRONMENTS as readonly string[]).includes(raw)
}

/**
 * Parse an untrusted environment value.
 *
 * Returns null for anything unrecognized — including undefined, null and ''.
 * There is deliberately NO default parameter: a caller that wants a fallback
 * must name it, and naming 'live' as a fallback is a visible review event.
 */
export function parseEnvironment(raw: unknown): TradingEnvironment | null {
  return isTradingEnvironment(raw) ? raw : null
}

/** True only for the environment that trades real capital. */
export function isLive(env: TradingEnvironment): boolean {
  return env === 'live'
}

/**
 * True when the environment may reach a broker at all.
 * 'development' and 'backtest' never touch a broker connection.
 */
export function isBrokerFacing(env: TradingEnvironment): boolean {
  return env === 'demo' || env === 'live'
}

/**
 * Environments must match exactly across an authority boundary.
 *
 * This is what stops a demo-derived proposal from producing a live execution
 * intent, and equally stops a live proposal from being replayed onto demo.
 */
export function environmentsAgree(a: TradingEnvironment, b: TradingEnvironment): boolean {
  return a === b
}
