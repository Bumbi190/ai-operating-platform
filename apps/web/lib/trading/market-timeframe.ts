/**
 * Omnira Trading Core — the canonical timeframe vocabulary.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §11 (kanoniskt 1m-rutnät)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §12 (härledda timeframes)
 *  - Strategy Specification Canonical v1.0 (the four timeframes the strategy reads)
 *
 * WHY THIS IS NOT IN market-view/ ANY MORE
 * ────────────────────────────────────────
 * It began as presentation vocabulary, which was true while a timeframe was
 * only a chart tab. Canonical v1.0 §12 made it domain vocabulary: 5m, 15m and
 * 4H are DERIVED from accepted canonical 1m observations, and that derivation
 * is session and grid work sitting well below any view.
 *
 * A domain module cannot import a presentation package without inverting the
 * dependency direction, so the definition moved down here and Market View
 * re-exports it — the same move the root vocabulary made in GATE-08C-1, for the
 * same reason. There is still exactly ONE definition; `@/lib/trading/market-view`
 * keeps precisely the API it had.
 *
 * THIS MODULE IMPORTS NOTHING.
 *
 * That is deliberate and it is load-bearing: the client-reachable Market View
 * package takes VALUES from here, so a single import of anything carrying a
 * `node:` builtin would put that builtin in the browser bundle. Nothing to
 * import means nothing to leak, and the import-discipline suites prove it
 * transitively rather than trusting this sentence.
 *
 * IT DESCRIBES A LABEL, NOT A GRID.
 *
 * `'4H'` names a timeframe. It does not say where a 4H bar opens, how long it
 * lasts in absolute time, or whether the market was open — those are session
 * and grid questions, answered in `session-calendar/` against the canonical
 * IANA zone. Keeping the label free of that arithmetic is what lets the label
 * stay a leaf.
 */

/** The timeframes the strategy reasons across (Strategy Canonical v1.0). */
export const MARKET_TIMEFRAMES = ['1m', '5m', '15m', '4H'] as const
export type MarketTimeframe = (typeof MARKET_TIMEFRAMES)[number]

export function isMarketTimeframe(raw: unknown): raw is MarketTimeframe {
  return typeof raw === 'string' && (MARKET_TIMEFRAMES as readonly string[]).includes(raw)
}

export function parseMarketTimeframe(raw: unknown): MarketTimeframe | null {
  return isMarketTimeframe(raw) ? raw : null
}
