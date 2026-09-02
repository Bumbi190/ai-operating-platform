/**
 * Omnira Trading Core — the canonical candle body.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §16 (candlesemantik)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §11 (kanoniskt 1m-rutnät)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §14 (ContractCandleSegment)
 *
 * A BODY, AND NOTHING ELSE
 * ────────────────────────
 * Six fields: an opening instant and five exact values. That is the whole of it.
 *
 * `ResolvedContract`, provider symbol, root, timeframe, completeness,
 * `sessionTruncated` and any decision id are deliberately ABSENT, and §14 gives
 * the reason: contract identity belongs to the segment ENVELOPE that will carry
 * a run of candles, not repeated on every bar inside it. Repeating it per candle
 * would make two candles of the same bar differ because their envelopes did,
 * and would invite a candle that disagrees with the segment it sits in.
 *
 * Completeness is the same argument from the other side. §19 keeps `completeness`
 * and `effectiveTo` as facts ABOUT a bucket, held next to the body rather than
 * inside it — a candle that carried its own completeness could be COMPLETE in
 * one context and PARTIAL in another while claiming to be one value.
 *
 * KEYED ON OPEN, HALF-OPEN INTERVAL
 * ─────────────────────────────────
 * §16: bars are keyed on `openTime`, never on close, and the interval is
 * `[open, open + period)`. A derived higher-timeframe candle is keyed on its
 * canonical BUCKET open, not on the first minute that happened to trade.
 *
 * VOLUME IS NULLABLE AND NULL IS NOT ZERO
 * ──────────────────────────────────────
 * `null` means the source did not report volume. Zero means it reported none
 * traded. Collapsing the two would turn missing data into a factual claim about
 * the market, so the type keeps them apart and nothing may default one to the
 * other.
 */

import type { PriceText } from './market-price'
import type { Timestamp } from './time'

export interface MarketCandle {
  /** Opening instant of the bar. Bars are keyed by open, never by close. */
  readonly openTime: Timestamp
  readonly open: PriceText
  readonly high: PriceText
  readonly low: PriceText
  readonly close: PriceText
  /** Absent where the source does not report it — never defaulted to zero. */
  readonly volume: PriceText | null
}
