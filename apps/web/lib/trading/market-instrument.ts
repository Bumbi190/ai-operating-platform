/**
 * Omnira Trading Core — the canonical instrument root vocabulary.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §3 (root-identitet)
 *
 * WHY THIS MODULE EXISTS AT ALL
 * ─────────────────────────────
 * This vocabulary used to live in `market-view/snapshot.ts`. That was fine while
 * a root was only ever something to draw, but Canonical v1.0 makes it the input
 * to contract resolution — and contract resolution is domain, not presentation.
 * A domain module cannot depend on a presentation package without inverting the
 * dependency direction, so the vocabulary moved down instead.
 *
 * Canonical v1.0 §3 is explicit that this is a *placement* change and nothing
 * more: "Semantisk root-identitet är kanonisk. Fysiskt TypeScript-modulägarskap
 * är det inte." The semantics below are byte-for-byte what Market View shipped.
 *
 * THERE IS EXACTLY ONE ROOT VOCABULARY
 * ────────────────────────────────────
 * Market View re-exports these names rather than restating them, so
 * `@/lib/trading/market-view` keeps the same public API it always had. A second
 * copy would be two sources of truth for the same three strings, and §3 forbids
 * one: "Ingen andra root-vokabulär får skapas."
 *
 * NO IMPORTS, DELIBERATELY
 * ────────────────────────
 * This file imports nothing. That is what lets Market View take VALUES from it
 * without dragging a Node builtin into the browser bundle — the failure that
 * `market-view/import-discipline.test.ts` exists to prevent, and which it now
 * proves transitively through this module too.
 *
 * A ROOT IS NEVER A CONTRACT (§3). It identifies a product, not an expiry.
 * Resolving a root to a concrete futures contract is `contract-calendar/`.
 */

/**
 * Root symbols, not provider contract identifiers.
 *
 * No front-month resolution, no rollover, no month code, no provider symbol.
 * Those are contract-lifecycle concerns and live elsewhere by construction.
 */
export const MARKET_INSTRUMENTS = ['NQ', 'MNQ', 'ES'] as const
export type MarketInstrument = (typeof MARKET_INSTRUMENTS)[number]

export function isMarketInstrument(raw: unknown): raw is MarketInstrument {
  return typeof raw === 'string' && (MARKET_INSTRUMENTS as readonly string[]).includes(raw)
}

/** Parse an untrusted value into a root. Fails closed to null. */
export function parseMarketInstrument(raw: unknown): MarketInstrument | null {
  return isMarketInstrument(raw) ? raw : null
}
