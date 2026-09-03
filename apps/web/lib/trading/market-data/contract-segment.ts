/**
 * Omnira Trading — the contract candle segment.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §14 (ContractCandleSegment)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §16 (candlesemantik, halvöppet)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §21 (continuous contracts)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §25 (fail-closed)
 *
 * ONE SEGMENT IS ONE CONTRACT. THAT IS THE POINT.
 * ───────────────────────────────────────────────
 * §14 puts contract identity in the ENVELOPE, not on every candle, and §21
 * forbids handing a detector a silently stitched cross-contract series. Those
 * two rules are the same rule seen from opposite ends: the envelope is the
 * provenance boundary, and it holds exactly one `ResolvedContract`.
 *
 * WHAT VALIDATION CAN AND CANNOT PROVE
 * ────────────────────────────────────
 * `MarketCandle` deliberately carries no contract field, so nothing here can
 * verify per-candle provenance — there is no fact in the data to check. This
 * module does not pretend otherwise. What it enforces is everything that IS
 * checkable: the interval, the ordering, the containment, the grid alignment.
 * The caller's assertion is that these candles belong to `contract`, and the
 * envelope is what records it.
 *
 * Saying that plainly matters more than a validation that looks thorough. A
 * check that appeared to prove provenance would invite callers to stop being
 * careful about what they pass.
 *
 * IT REFUSES; IT DOES NOT REPAIR
 * ──────────────────────────────
 * No sorting, no de-duplication, no timestamp normalization, no price
 * reconciliation. Duplicate and disagreement semantics belong to
 * `mergeOlderCandles` upstream (§16), where the candle bodies needed to tell an
 * identical repeat from a genuine conflict still exist. Two candles for one
 * instant reaching a segment means the accepted sequence was not accepted, and
 * the honest answer is to decline it.
 *
 * INSTANTS, NOT THEIR SPELLING
 * ────────────────────────────
 * Every comparison goes through `toEpochMs`. `…T00:00:00Z` and `…T00:00:00.000Z`
 * are one instant written two ways, so they collide as duplicates rather than
 * both surviving — the defect GATE-08C-2B.1 removed from the merge contract,
 * not reintroduced here.
 *
 * THE GRID IS BORROWED, NOT REBUILT
 * ─────────────────────────────────
 * Candle-open alignment is checked with GATE-08C-2A's `isBucketOpen`, the one
 * canonical grid. A second alignment rule living here would be a second
 * definition of where a 4H bar opens, and the two would eventually disagree.
 * It follows that a segment whose boundary falls in a DST gap is refused, since
 * that predicate reports no boundary there — fail-closed, consistent with C2A.
 */

import { isTimestamp, toEpochMs, type Timestamp } from '../time'
import { parseResolvedContract, sameContract, type ResolvedContract } from '../contract-identity'
import { isMarketTimeframe, type MarketTimeframe } from '../market-timeframe'
import type { MarketCandle } from '../market-candle'
import { isBucketOpen } from '../session-calendar'

/**
 * A run of canonical candles for exactly one concrete contract.
 *
 * Half-open `[from, to)`. The candles are whatever canonical timeframe the
 * envelope declares: 1m observations, or 5m/15m/4H bars already derived by
 * GATE-08C-2B. The envelope does not care which — it records whose they are.
 */
export interface ContractCandleSegment {
  readonly contract: ResolvedContract
  readonly timeframe: MarketTimeframe
  /** Inclusive. */
  readonly from: Timestamp
  /** Exclusive. */
  readonly to: Timestamp
  readonly candles: readonly MarketCandle[]
}

/**
 * Why a segment could not be built.
 *
 * CALLER-CONTRACT validation. These are NOT canonical `ReasonCode`s — they
 * never reach a journal or a decision, and `reason-codes.ts` is deliberately
 * not imported anywhere in this package. GATE-08C's REASON-CODE GAP stays open.
 */
export const SEGMENT_PROBLEMS = [
  'UNRESOLVED_CONTRACT',
  'UNSUPPORTED_TIMEFRAME',
  'MALFORMED_INSTANT',
  'EMPTY_INTERVAL',
  'CANDLE_BEFORE_WINDOW',
  'CANDLE_AT_OR_AFTER_WINDOW',
  'UNORDERED_CANDLES',
  'DUPLICATE_CANDLE_INSTANT',
  'NON_CANONICAL_CANDLE_OPEN',
] as const
export type SegmentProblem = (typeof SEGMENT_PROBLEMS)[number]

export type SegmentBuild =
  | { readonly ok: true; readonly segment: ContractCandleSegment }
  | { readonly ok: false; readonly problem: SegmentProblem; readonly detail: string }

const refuse = (problem: SegmentProblem, detail: string): SegmentBuild =>
  Object.freeze({ ok: false, problem, detail })

/**
 * Build a segment, or refuse.
 *
 * PURE. The input array is never sorted, spliced or written to, and no candle
 * object is touched — the candles are re-exposed exactly as supplied, with
 * their original `openTime` text and `PriceText` bytes intact.
 */
export function buildContractCandleSegment(input: {
  readonly contract: unknown
  readonly timeframe: unknown
  readonly from: unknown
  readonly to: unknown
  readonly candles: readonly MarketCandle[]
}): SegmentBuild {
  const contract = parseResolvedContract(input.contract)
  if (contract === null) {
    return refuse('UNRESOLVED_CONTRACT', 'contract must be a resolved root plus cycle, never a bare root')
  }
  if (!isMarketTimeframe(input.timeframe)) {
    return refuse('UNSUPPORTED_TIMEFRAME', 'timeframe is not a canonical MarketTimeframe')
  }
  if (!isTimestamp(input.from) || !isTimestamp(input.to)) {
    return refuse('MALFORMED_INSTANT', 'from/to must be canonical Timestamps')
  }
  const timeframe = input.timeframe
  const from = input.from
  const to = input.to
  const fromMs = toEpochMs(from)
  const toMs = toEpochMs(to)
  if (fromMs >= toMs) return refuse('EMPTY_INTERVAL', 'from must be strictly before to')

  let previousMs: number | null = null
  for (const candle of input.candles) {
    if (!isTimestamp(candle.openTime)) {
      return refuse('MALFORMED_INSTANT', 'a candle openTime is not a canonical Timestamp')
    }
    const atMs = toEpochMs(candle.openTime)

    if (atMs < fromMs) {
      return refuse('CANDLE_BEFORE_WINDOW', `${candle.openTime} opens before ${from}`)
    }
    if (atMs >= toMs) {
      // Half-open: a candle opening exactly at `to` belongs to the next window.
      return refuse('CANDLE_AT_OR_AFTER_WINDOW', `${candle.openTime} opens at or after ${to}`)
    }
    if (previousMs !== null && atMs === previousMs) {
      return refuse('DUPLICATE_CANDLE_INSTANT', `${candle.openTime} repeats an instant already in the segment`)
    }
    if (previousMs !== null && atMs < previousMs) {
      return refuse('UNORDERED_CANDLES', `${candle.openTime} arrives after a later instant`)
    }
    if (!isBucketOpen(timeframe, candle.openTime)) {
      return refuse('NON_CANONICAL_CANDLE_OPEN', `${candle.openTime} is not a canonical ${timeframe} open`)
    }
    previousMs = atMs
  }

  return Object.freeze({
    ok: true as const,
    segment: Object.freeze({
      contract,
      timeframe,
      from,
      to,
      // Copied so a later mutation of the caller's array cannot reach inside a
      // built segment. The candle OBJECTS are the caller's own, untouched.
      candles: Object.freeze([...input.candles]),
    }),
  })
}

// ─── Sequences of segments ────────────────────────────────────────────────────

/**
 * Why a sequence of segments could not be accepted.
 *
 * Also caller-contract validation, and also not `ReasonCode`s.
 */
export const SEGMENT_SEQUENCE_PROBLEMS = [
  'UNORDERED_SEGMENTS',
  'OVERLAPPING_SEGMENTS',
  'MIXED_TIMEFRAME',
] as const
export type SegmentSequenceProblem = (typeof SEGMENT_SEQUENCE_PROBLEMS)[number]

export type SegmentSequenceCheck =
  | { readonly ok: true; readonly segments: readonly ContractCandleSegment[] }
  | { readonly ok: false; readonly problem: SegmentSequenceProblem; readonly detail: string }

/**
 * Check that a run of segments is ordered, non-overlapping and single-timeframe.
 *
 * IT RETURNS SEGMENTS, NEVER CANDLES.
 *
 * §21 forbids handing a detector a stitched cross-contract series, so there is
 * deliberately no function anywhere in this package that flattens segments into
 * one candle array. The boundary between two contracts is the fact worth
 * keeping, and a `readonly MarketCandle[]` return type would destroy it while
 * looking convenient.
 *
 * It asserts NOTHING about where a contract transition happened. Whether a
 * boundary sits at the calendar's roll instant is a selection question, and
 * selection belongs to a later slice — claiming it here would mean recomputing
 * root resolution behind the caller's back.
 */
export function checkSegmentSequence(
  segments: readonly ContractCandleSegment[],
): SegmentSequenceCheck {
  for (const [index, segment] of segments.entries()) {
    if (index === 0) continue
    const previous = segments[index - 1]

    if (segment.timeframe !== previous.timeframe) {
      return Object.freeze({
        ok: false as const,
        problem: 'MIXED_TIMEFRAME' as const,
        detail: `${previous.timeframe} is followed by ${segment.timeframe}`,
      })
    }
    if (toEpochMs(segment.from) < toEpochMs(previous.from)) {
      return Object.freeze({
        ok: false as const,
        problem: 'UNORDERED_SEGMENTS' as const,
        detail: `${segment.from} starts before the preceding segment`,
      })
    }
    if (toEpochMs(segment.from) < toEpochMs(previous.to)) {
      return Object.freeze({
        ok: false as const,
        problem: 'OVERLAPPING_SEGMENTS' as const,
        detail: `${segment.from} starts before ${previous.to} ends`,
      })
    }
  }
  return Object.freeze({ ok: true as const, segments: Object.freeze([...segments]) })
}

/**
 * Whether two segments describe the same concrete contract.
 *
 * Exposed so a caller can ask about a boundary explicitly rather than inferring
 * one from adjacency. Structural equality on root and cycle — NQ and MNQ of the
 * same cycle are different contracts (§22).
 */
export function sameSegmentContract(a: ContractCandleSegment, b: ContractCandleSegment): boolean {
  return sameContract(a.contract, b.contract)
}
