/**
 * Omnira Trading Core — exact prices at a serialization boundary.
 *
 * Canonical source:
 *  - Risk Engine Specification v0.1 §82 (numeric precision), kept in force by
 *    Market Data & Contract Lifecycle Canonical v1.0 §7
 *  - Market Data & Contract Lifecycle Canonical v1.0 §16 (candlesemantik)
 *
 * WHY THIS IS NOT IN market-view/ ANY MORE
 * ────────────────────────────────────────
 * It began as presentation vocabulary, which was true while an exact price was
 * only something to render. Canonical v1.0 §12 made it domain vocabulary: 5m,
 * 15m and 4H candles are DERIVED from accepted canonical 1m observations, and
 * that derivation compares and sums prices well below any view.
 *
 * A domain module cannot import a presentation package without inverting the
 * dependency direction, so the definition moved down here and Market View
 * re-exports it — the same move the root vocabulary made in GATE-08C-1 and the
 * timeframe vocabulary in GATE-08C-2A. There is still exactly ONE definition.
 *
 * `priceMagnitude` DELIBERATELY STAYED BEHIND
 * ───────────────────────────────────────────
 * It converts a price to a JS `number` for chart geometry, where the output is
 * a pixel and no hard limit is ever compared against it. That is a genuine
 * presentation concern and the one legitimate float in the system, so it stays
 * in `market-view/` where a reviewer can grep every caller.
 *
 * Aggregation must never reach it. Ordering and summation here go through the
 * exact decimal primitives, and the import-discipline suites fail the build if
 * the aggregation package so much as names it.
 *
 * NO ARITHMETIC LIVES HERE EITHER
 * ───────────────────────────────
 * `decimal.ts` deliberately ships no add, subtract, multiply or divide — that
 * is Risk Engine work (Fas 5), and a general-purpose money arithmetic API
 * appearing here by accident is exactly what its header warns against. This
 * module carries and validates exact values; it does not compute with them.
 */

import { asDecimal, parseDecimal } from './decimal'
import type { Branded } from './ids'

/**
 * An exact decimal value in text form — a price, a distance, or an amount of
 * money. Validated through the canonical decimal parser, so the same rejections
 * apply: no floats, no exponent notation, no leading '+', no bare '.'.
 */
export type PriceText = Branded<string, 'PriceText'>

/** Parse an untrusted value into a PriceText. Fails closed to null. */
export function parsePriceText(raw: unknown): PriceText | null {
  const parsed = parseDecimal(raw)
  return parsed === null ? null : (parsed.text as PriceText)
}

/** Assert a PriceText at a boundary you control. Throws on malformed input. */
export function priceText(raw: string): PriceText {
  return asDecimal(raw).text as PriceText
}
