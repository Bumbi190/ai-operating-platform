/**
 * Omnira Trading — deterministic merging of historical candle pages.
 *
 * WHY THIS IS NOT `[...older, ...current]`
 * ────────────────────────────────────────
 * Concatenation is right exactly when the provider is. It silently accepts an
 * out-of-order page, a page that overlaps what is already loaded, and two
 * candles claiming the same instant with different prices — and every one of
 * those produces a chart that renders perfectly while showing something that
 * never happened.
 *
 * So the merge has a rule, the rule is total, and where the input is ambiguous
 * it REFUSES rather than picking. A refusal keeps the candles already on screen
 * and reports honestly; a silent choice would replace them with a plausible
 * lie.
 *
 * DUPLICATE INSTANTS
 * ──────────────────
 * Two candles for one `openTime` are either the same observation twice —
 * harmless, and de-duplicated — or a genuine disagreement about what happened
 * at that instant. There is no first-wins or last-wins rule for the second
 * case, deliberately: whichever one is discarded might be the true one, and
 * nothing here can tell. It fails closed.
 *
 * EXACT PRICES ONLY
 * ─────────────────
 * This layer works on canonical `MarketCandle` values throughout. `PriceText`
 * stays exact decimal text and is compared as text; no candle price is ever
 * converted to a number here. Presentation conversion lives in the Stage 1.9A
 * chart boundary and nowhere else.
 *
 * INSTANTS ARE COMPARED AS INSTANTS, PRICES AS TEXT
 * ─────────────────────────────────────────────────
 * These are two different rules and the difference is deliberate.
 *
 * An earlier version ordered candles by comparing `openTime` as TEXT, on the
 * reasoning that a fixed-width UTC ISO string sorts chronologically. That
 * reasoning does not hold for this repository's `Timestamp` grammar, which
 * permits an OPTIONAL millisecond field:
 *
 *     2026-01-01T00:00:00Z   and   2026-01-01T00:00:00.000Z
 *
 * are the same instant written two ways, and
 *
 *     2026-01-01T00:00:00.500Z
 *
 * is LATER than `…00:00:00Z` while sorting BEFORE it as text, because '.'
 * (0x2E) precedes 'Z' (0x5A). Two failures followed from that: a page could be
 * declared unordered when it was not, and — worse — two candles for the SAME
 * instant could both survive a merge because their text keys differed.
 *
 * So every ORDERING and every IDENTITY question below goes through
 * `toEpochMs`. Prices keep exact text comparison: `sameCandle` asks whether two
 * observations are the same reading, not whether they are numerically equal,
 * and '20150.0' against '20150.00' is a provider disagreement worth refusing
 * rather than a rounding detail worth absorbing.
 *
 * TIMESTAMP TEXT IS NEVER REWRITTEN
 * ─────────────────────────────────
 * Comparison is semantic; serialization stays input-owned. A retained candle
 * keeps the exact `openTime` string it arrived with, and this module normalizes
 * nothing.
 */

import { toEpochMs } from '../time'
import type { MarketCandle } from '../market-view'

export const MERGE_REFUSALS = [
  'UNORDERED_INPUT',
  'DUPLICATE_DISAGREEMENT',
] as const
export type MergeRefusal = (typeof MERGE_REFUSALS)[number]

export type MergeResult =
  | { readonly outcome: 'MERGED'; readonly candles: readonly MarketCandle[] }
  | {
      readonly outcome: 'REFUSED'
      readonly refusal: MergeRefusal
      /** Operator and journal text. Never decision input. */
      readonly detail: string
    }

/**
 * Whether two candles for the same instant are the same observation.
 *
 * Compared as exact TEXT. `PriceText` is canonical decimal text, so equality is
 * string equality — and comparing through numbers would make '20150.0' and
 * '20150.00' differ or agree depending on float behaviour rather than on what
 * the provider actually said.
 */
function sameCandle(a: MarketCandle, b: MarketCandle): boolean {
  return a.open === b.open
    && a.high === b.high
    && a.low === b.low
    && a.close === b.close
    && a.volume === b.volume
}

/**
 * Strictly ascending by INSTANT.
 *
 * `<=` rather than `<` is load-bearing: two candles for the same instant are not
 * ascending, and that is what keeps a same-page duplicate from reaching the
 * merge at all. Equivalent serializations of one instant collapse here, so a
 * page carrying both `…00:00:00Z` and `…00:00:00.000Z` is refused as the
 * duplicate it is rather than passing as two distinct bars.
 */
function isAscending(candles: readonly MarketCandle[]): boolean {
  for (let i = 1; i < candles.length; i += 1) {
    if (toEpochMs(candles[i].openTime) <= toEpochMs(candles[i - 1].openTime)) return false
  }
  return true
}

/**
 * Merge an older page in front of the candles already loaded.
 *
 * PURE. Neither input array is mutated and neither candle object is touched; a
 * test asserts both by deep-comparing the inputs afterwards.
 *
 * The result is a function of the CONTENTS alone — the same two pages always
 * produce the same merged series, in the same order, whichever order they
 * arrived in.
 */
export function mergeOlderCandles(
  older: readonly MarketCandle[],
  current: readonly MarketCandle[],
): MergeResult {
  // A page that is not itself in order cannot be placed in order without
  // guessing what the provider meant.
  if (!isAscending(older)) {
    return {
      outcome: 'REFUSED',
      refusal: 'UNORDERED_INPUT',
      detail: 'Den äldre sidan är inte sorterad stigande på openTime.',
    }
  }
  if (!isAscending(current)) {
    return {
      outcome: 'REFUSED',
      refusal: 'UNORDERED_INPUT',
      detail: 'Den redan laddade serien är inte sorterad stigande på openTime.',
    }
  }

  /*
   * Index the loaded series by instant so an overlap is detected rather than
   * appended. An older page is *allowed* to repeat a bar the chart already has;
   * what it may not do is repeat it with different prices.
   */
  const byTime = new Map<number, MarketCandle>()
  for (const candle of current) byTime.set(toEpochMs(candle.openTime), candle)

  const prepend: MarketCandle[] = []
  const seen = new Set<number>()

  for (const candle of older) {
    const at = toEpochMs(candle.openTime)

    if (seen.has(at)) {
      /*
       * Two candles for one instant inside the SAME page.
       *
       * UNREACHABLE through the public function: `isAscending(older)` above
       * already refused any page that repeats an instant, in either
       * serialization. It is kept, and deliberately not redesigned into a
       * de-duplication path, because that would widen the merge contract's
       * observable policy — a same-page duplicate is refused today and stays
       * refused. A branch that assumed its own validator had run would be
       * trusting a guarantee it cannot see.
       */
      const first = prepend.find((c) => toEpochMs(c.openTime) === at)
      if (first !== undefined && !sameCandle(first, candle)) {
        return {
          outcome: 'REFUSED',
          refusal: 'DUPLICATE_DISAGREEMENT',
          detail: `Två olika candles för ${candle.openTime} i samma sida.`,
        }
      }
      continue
    }

    const existing = byTime.get(at)
    if (existing !== undefined) {
      if (!sameCandle(existing, candle)) {
        return {
          outcome: 'REFUSED',
          refusal: 'DUPLICATE_DISAGREEMENT',
          detail: `Den äldre sidan motsäger redan laddad candle för ${candle.openTime}.`,
        }
      }
      /*
       * Identical repeat of a bar we already have: drop it, keep ours — which
       * also keeps the retained candle's original `openTime` text, whichever
       * of the two equivalent serializations the loaded series happened to use.
       */
      seen.add(at)
      continue
    }

    seen.add(at)
    prepend.push(candle)
  }

  const merged = [...prepend, ...current]

  /*
   * The boundary check. Each page can be internally ordered and still land in
   * the wrong place relative to the other — a provider answering `before: T`
   * with candles after T, for instance. Verifying the joined series catches
   * exactly that, and it is cheap.
   */
  if (!isAscending(merged)) {
    return {
      outcome: 'REFUSED',
      refusal: 'UNORDERED_INPUT',
      detail: 'Den äldre sidan ligger inte före den redan laddade serien.',
    }
  }

  return { outcome: 'MERGED', candles: merged }
}

/** The oldest loaded instant, or null when nothing is loaded. */
export function oldestLoadedTime(candles: readonly MarketCandle[]) {
  return candles.length === 0 ? null : candles[0].openTime
}
