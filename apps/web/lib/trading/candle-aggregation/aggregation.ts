/**
 * Omnira Trading — canonical higher-timeframe candle aggregation.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §11 (kanoniskt basrutnät — 1m)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §12 (härledda timeframes)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §16 (candlesemantik)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §18, §18.1 (BarCompleteness)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §19 (nominell kontra effektiv)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §25 (fail-closed)
 *
 * ONE DIRECTION ONLY: 1m UPWARDS.
 * ───────────────────────────────
 * §12 is categorical — 5m, 15m and 4H are derived ONLY from accepted canonical
 * 1m observations, and no provider-native higher-timeframe bar becomes canonical
 * strategy evidence merely because a provider sent it. Nothing here accepts a
 * 5m, 15m or 4H bar as INPUT: the input type is a run of 1m candles, and the
 * requested target must be a derived timeframe, so "aggregate 1m into 1m" is
 * not expressible either.
 *
 * IT NORMALISES NOTHING
 * ─────────────────────
 * Provider timestamp convention, close-stamped bars, provider timezones and
 * provider symbols are normalised at the market-data boundary and nowhere else
 * (§11). By the time a candle reaches this file it is already an ACCEPTED
 * canonical 1m observation. What this module does is verify that claim and
 * refuse when it is false — never repair it.
 *
 * IT REFUSES RATHER THAN REPAIRS
 * ──────────────────────────────
 * An unordered or duplicated input is a CALLER-CONTRACT failure, not a data
 * condition to tidy up. §16 assigns duplicate and ordering semantics to the
 * existing `mergeOlderCandles` contract, upstream of here, where the candle
 * bodies needed to tell an identical repeat from a genuine disagreement still
 * exist. Sorting or de-duplicating here would be a SECOND, weaker duplicate
 * policy competing with that one — so this module declines and says so.
 *
 * ORDERING IS COMPARED AS INSTANTS, NOT AS TEXT
 * ─────────────────────────────────────────────
 * Every comparison below goes through `toEpochMs`. `Timestamp` permits an
 * optional millisecond field, so `…T00:00:00Z` and `…T00:00:00.500Z` order
 * WRONG as strings — '.' sorts before 'Z' — and a text comparison would place
 * the later instant first.
 *
 *     GATE-08C-2B.1 TIMESTAMP ORDERING & INSTANT IDENTITY HARDENING
 *     — IMPLEMENTED IN THIS SLICE, PENDING MERGE
 *
 * `market-data/merge.ts` used to order instants as text, on the reasoning that
 * a fixed-width ISO string sorts chronologically. That reasoning holds only
 * while every producer emits the same millisecond form. GATE-08C-2B could not
 * fix it — its approved scope forbade touching the merge contract — so it was
 * recorded here instead.
 *
 * GATE-08C-2B.1 now routes both the ordering and the cross-page instant
 * IDENTITY in `merge.ts` through `toEpochMs`, leaving the duplicate and
 * disagreement policy exactly as it was. C3 stays blocked until that slice
 * itself merges.
 *
 * THE CALENDAR OUTRANKS THE OBSERVATIONS
 * ──────────────────────────────────────
 * When the session calendar is KNOWN, its expected-minute set decides which
 * observations may contribute. A scheduled halt minute is EXPECTED ABSENCE
 * (§18), so an observation claiming to be that minute contradicts authored
 * calendar data. See `UNEXPECTED_TRADING_MINUTE` below.
 *
 * NO FLOAT TOUCHES A PRICE OR A VOLUME
 * ────────────────────────────────────
 * High and low are selected by exact `compareDecimal`; volume is summed as a
 * scaled `bigint`. `Number`, `parseFloat`, `Math.max` and `Math.min` appear
 * nowhere, and `priceMagnitude` — the one legitimate float in the system — is
 * unreachable from this package by construction.
 *
 * IT MINTS NO AUTHORITY AND DETECTS NOTHING
 * ─────────────────────────────────────────
 * There is no iFVG, CISD, SMT, FVG, liquidity, displacement, setup grade or
 * proposal here. A derived candle is market data. Strategy standing is asked of
 * the GATE-08C-2A predicate, unchanged, and even ELIGIBLE permits nothing.
 */

import { compareDecimal, parseDecimal, type Decimal } from '../decimal'
import { toEpochMs, type Timestamp } from '../time'
import { MARKET_TIMEFRAMES, type MarketTimeframe } from '../market-timeframe'
import type { MarketCandle } from '../market-candle'
import type { PriceText } from '../market-price'
import {
  evaluateBucketEvidence,
  type BarCompleteness,
  type BucketEvidence,
  type NominalBucket,
  type ObservationSourceState,
  type SessionExpectation,
} from '../session-calendar'
import { exactVolumeSum } from './exact-sum'

const MS_PER_MINUTE = 60_000

/**
 * The timeframes that are DERIVED rather than observed.
 *
 * Filtered from the one canonical vocabulary rather than restated as a second
 * literal list — §12 makes this exactly "every timeframe except the 1m base",
 * so writing the members out again would create a second place for the set to
 * drift. 1m is absent because it is the accepted base observation, not an
 * aggregate of itself.
 */
export type DerivedMarketTimeframe = Exclude<MarketTimeframe, '1m'>

export const DERIVED_MARKET_TIMEFRAMES: readonly DerivedMarketTimeframe[] = Object.freeze(
  MARKET_TIMEFRAMES.filter((timeframe): timeframe is DerivedMarketTimeframe => timeframe !== '1m'),
)

export function isDerivedMarketTimeframe(raw: unknown): raw is DerivedMarketTimeframe {
  return typeof raw === 'string' && (DERIVED_MARKET_TIMEFRAMES as readonly string[]).includes(raw)
}

// ─── Refusals ─────────────────────────────────────────────────────────────────

/**
 * Why an aggregation request was not admissible.
 *
 * Every one is a CALLER-CONTRACT failure — the inputs did not describe an
 * accepted canonical 1m sequence for this bucket. None of them is a market
 * condition, and none may be read as one: an UNKNOWN calendar and a PARTIAL
 * bucket are ordinary answers returned below, not refusals.
 */
export const AGGREGATION_REFUSALS = [
  'NOT_A_DERIVED_TIMEFRAME',
  'BUCKET_TIMEFRAME_MISMATCH',
  'NON_CANONICAL_MINUTE_OPEN',
  'OBSERVATION_OUTSIDE_BUCKET',
  'UNORDERED_OBSERVATIONS',
  'DUPLICATE_OBSERVATION',
  'MALFORMED_CANDLE_PRICE',
  'INVALID_CANDLE_BODY',
  'UNEXPECTED_TRADING_MINUTE',
  'VOLUME_NOT_REPRESENTABLE',
] as const
export type AggregationRefusal = (typeof AGGREGATION_REFUSALS)[number]

// ─── Result ───────────────────────────────────────────────────────────────────

/**
 * A derived candle together with the facts ABOUT its bucket.
 *
 * The body and the bucket facts are deliberately separate fields. §19 keeps
 * `completeness` and `effectiveTo` beside the bucket rather than inside the
 * candle, and §14 keeps contract identity in a later segment envelope — so a
 * `MarketCandle` here is exactly the same six-field shape a 1m observation has.
 *
 * No contract provenance yet. `ContractCandleSegment` is GATE-08C-3.
 */
export interface DerivedCanonicalCandle {
  readonly timeframe: DerivedMarketTimeframe
  readonly candle: MarketCandle
  /** Exclusive. The grid's answer. */
  readonly nominalTo: Timestamp
  /** Exclusive. The session's answer (§19). */
  readonly effectiveTo: Timestamp
  /** Derived, never stored beside the other two — §19. */
  readonly sessionTruncated: boolean
  readonly completeness: BarCompleteness
}

/**
 * What aggregating one bucket produced.
 *
 * Four success shapes rather than one nullable candle, because the reasons a
 * bucket has no canonical candle are genuinely different facts and a caller
 * must not be able to confuse them:
 *
 *   UNKNOWN_CALENDAR      the calendar never claimed this span. Nothing is
 *                         known, so no bucket bounds are reported — inventing
 *                         `effectiveTo` here would assert a session on no
 *                         evidence at all.
 *   NO_CANONICAL_CANDLE   §18.1: the calendar expected no minutes. No candle is
 *                         emitted and there is no `completeness` field to read,
 *                         so the empty set cannot be satisfied vacuously.
 *   NO_OBSERVATION        minutes were expected and none arrived. The coverage
 *                         state is truthful; no OHLC is manufactured.
 *   DERIVED               a real candle, carrying its own completeness.
 */
export type CandleAggregation =
  | { readonly ok: false; readonly refusal: AggregationRefusal; readonly detail: string }
  | {
      readonly ok: true
      readonly kind: 'UNKNOWN_CALENDAR'
      readonly completeness: 'UNKNOWN'
      readonly evidence: BucketEvidence
    }
  | {
      readonly ok: true
      readonly kind: 'NO_CANONICAL_CANDLE'
      readonly nominalTo: Timestamp
      readonly effectiveTo: Timestamp
      readonly sessionTruncated: boolean
      readonly evidence: BucketEvidence
    }
  | {
      readonly ok: true
      readonly kind: 'NO_OBSERVATION'
      readonly completeness: BarCompleteness
      readonly nominalTo: Timestamp
      readonly effectiveTo: Timestamp
      readonly sessionTruncated: boolean
      readonly evidence: BucketEvidence
    }
  | {
      readonly ok: true
      readonly kind: 'DERIVED'
      readonly derived: DerivedCanonicalCandle
      /*
       * GATE-08C-2A's own verdict, carried through rather than recomputed.
       * `fourHourStrategyStanding(bucket, result.evidence)` is the whole of
       * §20's precondition, asked of the unchanged C2A predicate — a caller
       * that had to rebuild the evidence itself would be a second place for
       * completeness to be decided.
       */
      readonly evidence: BucketEvidence
    }

const refuse = (refusal: AggregationRefusal, detail: string): CandleAggregation =>
  Object.freeze({ ok: false, refusal, detail })

// ─── Candle body admission ────────────────────────────────────────────────────

interface CandleBody {
  readonly open: Decimal
  readonly high: Decimal
  readonly low: Decimal
  readonly close: Decimal
}

/**
 * Parse and validate one candle body exactly.
 *
 * The relationships are checked with `compareDecimal`, never through `Number`.
 * '20150.0' and '20150.00' are the same price and must compare equal; through
 * a float they might not, and through text they certainly would not.
 *
 * This gate exists because nothing upstream guarantees it. `mergeOlderCandles`
 * compares candles for IDENTITY, not for internal consistency, and the only
 * body check in the repository today is a fixture test. An aggregate built from
 * a candle whose high sits below its low would produce a bucket high that never
 * traded, so admission happens here rather than being assumed.
 *
 * It invents no tick-size rule, no price bounds and no venue convention — only
 * the four relationships §16's candle semantics already imply.
 */
function admitBody(candle: MarketCandle): CandleBody | 'MALFORMED' | 'INVALID' {
  const open = parseDecimal(candle.open)
  const high = parseDecimal(candle.high)
  const low = parseDecimal(candle.low)
  const close = parseDecimal(candle.close)
  if (open === null || high === null || low === null || close === null) return 'MALFORMED'
  if (candle.volume !== null && parseDecimal(candle.volume) === null) return 'MALFORMED'

  if (compareDecimal(high, low) < 0) return 'INVALID'
  if (compareDecimal(high, open) < 0) return 'INVALID'
  if (compareDecimal(high, close) < 0) return 'INVALID'
  if (compareDecimal(low, open) > 0) return 'INVALID'
  if (compareDecimal(low, close) > 0) return 'INVALID'

  return { open, high, low, close }
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export interface AcceptedMinuteObservations {
  readonly sourceState: ObservationSourceState
  /** Accepted canonical 1m candles, ascending, no duplicates. Never provider-native. */
  readonly candles: readonly MarketCandle[]
}

/**
 * Derive one canonical higher-timeframe candle.
 *
 * PURE. Same bucket, same expectation, same source state and same candle bytes
 * produce the same result on every machine and after every restart (§26). No
 * clock, no randomness, no environment, no network and no provider.
 */
export function aggregateCanonicalCandle(
  bucket: NominalBucket,
  expectation: SessionExpectation,
  observed: AcceptedMinuteObservations,
): CandleAggregation {
  if (!isDerivedMarketTimeframe(bucket.timeframe)) {
    return refuse(
      'NOT_A_DERIVED_TIMEFRAME',
      `${bucket.timeframe} is the accepted canonical base observation, not an aggregate of itself`,
    )
  }
  const timeframe = bucket.timeframe

  const openMs = toEpochMs(bucket.open)
  const nominalToMs = toEpochMs(bucket.nominalTo)

  // ── 1. The sequence really is an accepted canonical 1m run for this bucket ──
  let previousMs: number | null = null
  const bodies: CandleBody[] = []
  for (const candle of observed.candles) {
    const atMs = toEpochMs(candle.openTime)

    if (atMs % MS_PER_MINUTE !== 0) {
      return refuse('NON_CANONICAL_MINUTE_OPEN', `${candle.openTime} is not an exact 1m boundary`)
    }
    if (atMs < openMs || atMs + MS_PER_MINUTE > nominalToMs) {
      return refuse(
        'OBSERVATION_OUTSIDE_BUCKET',
        `${candle.openTime} does not lie wholly inside ${bucket.open}..${bucket.nominalTo}`,
      )
    }
    if (previousMs !== null && atMs === previousMs) {
      return refuse('DUPLICATE_OBSERVATION', `${candle.openTime} appears more than once`)
    }
    if (previousMs !== null && atMs < previousMs) {
      return refuse('UNORDERED_OBSERVATIONS', `${candle.openTime} arrives after a later instant`)
    }
    previousMs = atMs

    const body = admitBody(candle)
    if (body === 'MALFORMED') {
      return refuse('MALFORMED_CANDLE_PRICE', `${candle.openTime} carries a non-decimal price or volume`)
    }
    if (body === 'INVALID') {
      return refuse(
        'INVALID_CANDLE_BODY',
        `${candle.openTime} violates high >= open/close >= low`,
      )
    }
    bodies.push(body)
  }

  // ── 2. GATE-08C-2A decides completeness. This module does not. ─────────────
  /*
   * §18's vocabulary, §18.1's empty-set rule, §19's truncation derivation and
   * the source-state semantics are all C2A's, asked once here and reused
   * everywhere below. There is deliberately no second completeness engine, no
   * second `SessionExpectation` model and no second truncation rule.
   */
  const evidence = evaluateBucketEvidence(bucket, expectation, {
    sourceState: observed.sourceState,
    minuteOpenTimes: observed.candles.map((candle) => candle.openTime),
  })
  /*
   * Unreachable: every rejection C2A can make here is already made above, more
   * strictly. Kept because an aggregator that assumed its own validator had run
   * would be trusting a guarantee it cannot see — and the honest answer is the
   * same refusal.
   */
  if (!evidence.ok) {
    return refuse('DUPLICATE_OBSERVATION', `observation set rejected upstream: ${evidence.problem}`)
  }

  if (expectation.status === 'UNKNOWN') {
    /*
     * §17 and §19: nothing is known, so nothing is reported. No `effectiveTo`,
     * no `sessionTruncated`, and above all no candle that a later reader could
     * mistake for canonical evidence.
     */
    return Object.freeze({
      ok: true,
      kind: 'UNKNOWN_CALENDAR' as const,
      completeness: 'UNKNOWN' as const,
      evidence,
    })
  }

  const expected = new Set(expectation.expectedMinuteOpenTimes.map(toEpochMs))
  for (const candle of observed.candles) {
    if (!expected.has(toEpochMs(candle.openTime))) {
      /*
       * GATE-08C-2B UNEXPECTED-MINUTE GAP — see the package README note and the
       * review. Canonical v1.0 states that a scheduled closed or halted minute
       * is EXPECTED ABSENCE (§18); it does not say what to do when data arrives
       * for one anyway. That is a contradiction between authored calendar data
       * and an observation, and neither silently dropping it nor silently
       * folding it into OHLCV is defensible — the first hides the conflict, the
       * second lets a bar the calendar says never traded move the bucket's high.
       *
       * So it refuses, and the refusal is IMPLEMENTATION SAFETY, not canon.
       */
      return refuse(
        'UNEXPECTED_TRADING_MINUTE',
        `${candle.openTime} is not an expected trading minute for this bucket`,
      )
    }
  }

  const sessionTruncated = toEpochMs(expectation.effectiveTo) < nominalToMs

  // §18.1: an empty expectation emits no candle, and cannot be satisfied vacuously.
  if (evidence.kind === 'NO_CANONICAL_CANDLE') {
    return Object.freeze({
      ok: true,
      kind: 'NO_CANONICAL_CANDLE' as const,
      nominalTo: bucket.nominalTo,
      effectiveTo: expectation.effectiveTo,
      sessionTruncated,
      evidence,
    })
  }

  const completeness: BarCompleteness =
    evidence.kind === 'UNKNOWN' ? 'UNKNOWN' : evidence.completeness

  // ── 3. Minutes were expected. Were any observed? ───────────────────────────
  if (observed.candles.length === 0) {
    /*
     * §14 of the slice brief and §25 of canon: no OHLC is manufactured from an
     * empty set. The coverage state is still reported truthfully — PARTIAL when
     * the source has settled and the minutes are simply missing, UNKNOWN when
     * the source cannot say it is finished.
     */
    return Object.freeze({
      ok: true,
      kind: 'NO_OBSERVATION' as const,
      completeness,
      nominalTo: bucket.nominalTo,
      effectiveTo: expectation.effectiveTo,
      sessionTruncated,
      evidence,
    })
  }

  // ── 4. The body ────────────────────────────────────────────────────────────
  /*
   * §16: keyed on the canonical BUCKET open, never on the first minute that
   * happened to trade. A bucket whose opening minutes were scheduled closed
   * still opens where the grid says it opens — moving the key to the first
   * observation would silently produce a bar at an instant the grid has no
   * boundary for.
   */
  const first = observed.candles[0]
  const last = observed.candles[observed.candles.length - 1]

  let high = bodies[0].high
  let low = bodies[0].low
  for (const body of bodies) {
    if (compareDecimal(body.high, high) > 0) high = body.high
    if (compareDecimal(body.low, low) < 0) low = body.low
  }

  const volume = aggregateVolume(completeness, observed.candles)
  if (volume === 'NOT_REPRESENTABLE') {
    return refuse('VOLUME_NOT_REPRESENTABLE', 'the summed volume exceeds the canonical decimal range')
  }

  return Object.freeze({
    ok: true,
    kind: 'DERIVED' as const,
    evidence,
    derived: Object.freeze({
      timeframe,
      candle: Object.freeze({
        openTime: bucket.open,
        open: first.open,
        close: last.close,
        high: high.text as PriceText,
        low: low.text as PriceText,
        volume,
      }),
      nominalTo: bucket.nominalTo,
      effectiveTo: expectation.effectiveTo,
      sessionTruncated,
      completeness,
    }),
  })
}

/**
 * The bucket's volume, or null.
 *
 * GATE-08C-2B VOLUME POLICY — DERIVED, not canonical. Canonical v1.0 defines
 * `volume` as nullable and says null means "not reported, never zero", but it
 * states no higher-timeframe rule for a nullable constituent. Two fail-closed
 * consequences follow, and both are implementation policy:
 *
 *  - A single null constituent makes the total null. A sum that silently
 *    skipped it would report a smaller number AS IF it were the bucket's whole
 *    volume, which is a factual claim no observation supports.
 *  - A PARTIAL or UNKNOWN bucket has null volume for the same reason: the total
 *    of the bars that happened to arrive is not the total of the bucket, and
 *    publishing it as though it were is the more dangerous of the two errors.
 *
 * Null here always means "not reported for this bucket". It never means zero.
 */
function aggregateVolume(
  completeness: BarCompleteness,
  candles: readonly MarketCandle[],
): PriceText | null | 'NOT_REPRESENTABLE' {
  if (completeness !== 'COMPLETE') return null

  const volumes: PriceText[] = []
  for (const candle of candles) {
    if (candle.volume === null) return null
    volumes.push(candle.volume)
  }
  /*
   * Unreachable — an empty bucket returns NO_OBSERVATION before reaching here.
   * Stated anyway, because `exactVolumeSum` answers null for BOTH an empty list
   * and an unrepresentable total, and only this guard keeps the two apart.
   */
  if (volumes.length === 0) return null

  const total = exactVolumeSum(volumes)
  return total === null ? 'NOT_REPRESENTABLE' : total
}
