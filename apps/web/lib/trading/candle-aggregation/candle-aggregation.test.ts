/**
 * Omnira Trading — canonical higher-timeframe candle aggregation.
 *
 * EVERY SCHEDULE AND EVERY PRICE HERE IS INVENTED.
 *
 * These are deterministic Omnira-owned fixtures, not CME data and not market
 * data. No real session table, no real holiday and no real instrument price
 * appears anywhere in this file, and nothing here should be read as evidence of
 * how any instrument moves.
 *
 * The fixture day is shaped LIKE a normal equity-index day — an 18:00 open, a
 * 16:15 halt, a 17:00 close — because those shapes are what the semantics have
 * to survive. The instants are chosen, not looked up.
 */

import { describe, expect, it } from 'vitest'
import { asTimestamp, toEpochMs, type Timestamp } from '../time'
import { priceText, type PriceText } from '../market-price'
import type { MarketCandle } from '../market-candle'
import type { MarketTimeframe } from '../market-timeframe'
import {
  bucketAt,
  buildSessionCalendar,
  fourHourStrategyStanding,
  sessionExpectation,
  type NominalBucket,
  type SessionCalendar,
  type SessionExpectation,
} from '../session-calendar'
import {
  AGGREGATION_REFUSALS,
  DERIVED_MARKET_TIMEFRAMES,
  aggregateCanonicalCandle,
  isDerivedMarketTimeframe,
  type CandleAggregation,
} from './index'

const T = (raw: string): Timestamp => asTimestamp(raw)
const P = (raw: string): PriceText => priceText(raw)
const MINUTE = 60_000

/** Winter fixture day: 18:00 Wed 2026-01-14 → 17:00 Thu 2026-01-15, New York. */
const W = {
  open1800: T('2026-01-14T23:00:00Z'),
  open0200: T('2026-01-15T07:00:00Z'),
  open0600: T('2026-01-15T11:00:00Z'),
  open1000: T('2026-01-15T15:00:00Z'),
  open1400: T('2026-01-15T19:00:00Z'),
  haltFrom: T('2026-01-15T21:15:00Z'),
  haltTo: T('2026-01-15T21:30:00Z'),
  close1700: T('2026-01-15T22:00:00Z'),
  next1800: T('2026-01-15T23:00:00Z'),
  dayAfter0200: T('2026-01-16T07:00:00Z'),
  coverageTo: T('2026-01-16T23:00:00Z'),
} as const

function built(
  version: string,
  trading: readonly (readonly [Timestamp, Timestamp])[],
  coverage: readonly (readonly [Timestamp, Timestamp])[],
): SessionCalendar {
  const build = buildSessionCalendar({
    calendarVersion: version,
    tradingIntervals: trading.map(([from, to]) => ({ from, to })),
    coverage: coverage.map(([from, to]) => ({ from, to })),
  })
  if (!build.ok) throw new Error(`fixture calendar refused: ${JSON.stringify(build.problems)}`)
  return build.calendar
}

const FULL_COVERAGE = [[W.open1800, W.coverageTo]] as const

/** Normal day: open 18:00, halt 16:15–16:30, close 17:00, nothing thereafter. */
const NORMAL = built('fixture-normal-v1', [
  [W.open1800, W.haltFrom],
  [W.haltTo, W.close1700],
], FULL_COVERAGE)

/** Early close at 13:00 New York, no resumption. */
const EARLY_CLOSE = built('fixture-early-close-v1', [
  [W.open1800, T('2026-01-15T18:00:00Z')],
], FULL_COVERAGE)

/** Covered, with no trading at all on the second day. */
const FULL_CLOSURE = built('fixture-full-closure-v1', [
  [W.open1800, W.close1700],
], FULL_COVERAGE)

/** A two-minute session inside one 5m bucket, for exact volume arithmetic. */
const TWO_MINUTE = built(
  'fixture-two-minute-v1',
  [[T('2026-01-15T07:00:00Z'), T('2026-01-15T07:02:00Z')]],
  [[T('2026-01-15T07:00:00Z'), T('2026-01-15T08:00:00Z')]],
)

function bucket(timeframe: MarketTimeframe, at: Timestamp): NominalBucket {
  const resolved = bucketAt(timeframe, at)
  if (!resolved.ok) throw new Error(`grid refused ${timeframe} at ${at}: ${resolved.refusal}`)
  return resolved.bucket
}

function expectationFor(calendar: SessionCalendar, target: NominalBucket): SessionExpectation {
  return sessionExpectation(calendar, target)
}

function known(calendar: SessionCalendar, target: NominalBucket) {
  const expectation = expectationFor(calendar, target)
  if (expectation.status !== 'KNOWN') throw new Error('fixture expected KNOWN coverage')
  return expectation
}

interface CandleSpec {
  readonly open?: string
  readonly high?: string
  readonly low?: string
  readonly close?: string
  readonly volume?: string | null
}

/** A well-formed 1m candle at an instant. Deliberately boring unless overridden. */
function candleAt(openTime: Timestamp, spec: CandleSpec = {}): MarketCandle {
  return {
    openTime,
    open: P(spec.open ?? '100.00'),
    high: P(spec.high ?? '100.50'),
    low: P(spec.low ?? '99.50'),
    close: P(spec.close ?? '100.25'),
    volume: spec.volume === undefined ? P('10') : spec.volume === null ? null : P(spec.volume),
  }
}

/** One candle for every minute the calendar expected. */
function everyExpected(expectation: SessionExpectation, spec: CandleSpec = {}): MarketCandle[] {
  if (expectation.status !== 'KNOWN') throw new Error('expected KNOWN')
  return expectation.expectedMinuteOpenTimes.map((minute) => candleAt(minute, spec))
}

const settled = (candles: readonly MarketCandle[]) =>
  ({ sourceState: 'SETTLED' as const, candles })

function derivedOf(result: CandleAggregation) {
  if (!result.ok) throw new Error(`aggregation refused: ${result.refusal} — ${result.detail}`)
  if (result.kind !== 'DERIVED') throw new Error(`expected a derived candle, got ${result.kind}`)
  return result
}

// ═══ F. Only derived timeframes ══════════════════════════════════════════════

describe('F. 1m is the base observation, not an aggregate of itself', () => {
  it('refuses a 1m target', () => {
    const oneMinute = bucket('1m', W.open0200)
    const result = aggregateCanonicalCandle(
      oneMinute,
      known(NORMAL, oneMinute),
      settled([candleAt(W.open0200)]),
    )
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.refusal).toBe('NOT_A_DERIVED_TIMEFRAME')
  })

  it('derives the set from the one canonical vocabulary', () => {
    expect([...DERIVED_MARKET_TIMEFRAMES]).toEqual(['5m', '15m', '4H'])
    expect(isDerivedMarketTimeframe('1m')).toBe(false)
    for (const timeframe of DERIVED_MARKET_TIMEFRAMES) {
      expect(isDerivedMarketTimeframe(timeframe)).toBe(true)
    }
  })
})

// ═══ G–K. The accepted 1m sequence really must be one ════════════════════════

describe('the accepted sequence is verified, never repaired', () => {
  const target = bucket('5m', W.open0200)
  const expectation = known(NORMAL, target)

  it('G. requires exact canonical minute boundaries', () => {
    const result = aggregateCanonicalCandle(
      target,
      expectation,
      settled([candleAt(T('2026-01-15T07:00:30Z'))]),
    )
    expect(result.ok === false && result.refusal).toBe('NON_CANONICAL_MINUTE_OPEN')
  })

  it('H. refuses a candle outside the bucket', () => {
    const result = aggregateCanonicalCandle(
      target,
      expectation,
      settled([candleAt(W.open1000)]),
    )
    expect(result.ok === false && result.refusal).toBe('OBSERVATION_OUTSIDE_BUCKET')
  })

  it('I. refuses an unordered sequence rather than sorting it', () => {
    const result = aggregateCanonicalCandle(
      target,
      expectation,
      settled([candleAt(T('2026-01-15T07:02:00Z')), candleAt(T('2026-01-15T07:01:00Z'))]),
    )
    expect(result.ok === false && result.refusal).toBe('UNORDERED_OBSERVATIONS')
  })

  it('J. refuses a duplicate rather than silently repairing it', () => {
    /*
     * Canonical v1.0 §16 assigns duplicate semantics to `mergeOlderCandles`,
     * upstream, where the bodies needed to tell an identical repeat from a
     * genuine disagreement still exist. De-duplicating here would be a second,
     * weaker policy competing with that one.
     */
    const twice = candleAt(T('2026-01-15T07:01:00Z'))
    const result = aggregateCanonicalCandle(target, expectation, settled([twice, twice]))
    expect(result.ok === false && result.refusal).toBe('DUPLICATE_OBSERVATION')
  })

  it('K. refuses an impossible body, comparing exactly', () => {
    const inverted = aggregateCanonicalCandle(
      target,
      expectation,
      settled([candleAt(W.open0200, { high: '99.99', low: '100.00' })]),
    )
    expect(inverted.ok === false && inverted.refusal).toBe('INVALID_CANDLE_BODY')

    for (const bad of [
      { high: '100.00', open: '100.01' },
      { high: '100.00', close: '100.01' },
      { low: '100.00', open: '99.99' },
      { low: '100.00', close: '99.99' },
    ]) {
      const result = aggregateCanonicalCandle(
        target,
        expectation,
        settled([candleAt(W.open0200, { open: '100.00', high: '100.00', low: '100.00', close: '100.00', ...bad })]),
      )
      expect(result.ok === false && result.refusal, JSON.stringify(bad)).toBe('INVALID_CANDLE_BODY')
    }

    // …and accepts equal values written at DIFFERENT SCALES. '100.0' and
    // '100.00' are one price; a text comparison would call them different and a
    // float comparison would make the answer depend on the engine.
    const sameValue = aggregateCanonicalCandle(
      target,
      expectation,
      settled([candleAt(W.open0200, { open: '100.0', high: '100.00', low: '100.000', close: '100' })]),
    )
    expect(sameValue.ok).toBe(true)
  })

  it('refuses a non-decimal price', () => {
    const result = aggregateCanonicalCandle(target, expectation, {
      sourceState: 'SETTLED',
      candles: [{ ...candleAt(W.open0200), high: '1e5' as PriceText }],
    })
    expect(result.ok === false && result.refusal).toBe('MALFORMED_CANDLE_PRICE')
  })

  it('every refusal is a caller-contract failure, not a market state', () => {
    expect([...AGGREGATION_REFUSALS]).not.toContain('PARTIAL')
    expect([...AGGREGATION_REFUSALS]).not.toContain('UNKNOWN')
  })
})

// ═══ L–S. The aggregation itself ═════════════════════════════════════════════

describe('OHLC is assembled from the contributing expected minutes', () => {
  it('L. aggregates a 5m bucket', () => {
    const target = bucket('5m', W.open0200)
    const expectation = known(NORMAL, target)
    expect(expectation.expectedMinuteOpenTimes).toHaveLength(5)

    const candles = expectation.expectedMinuteOpenTimes.map((minute, index) =>
      candleAt(minute, {
        open: `${100 + index}.50`,
        high: `${100 + index}.75`,
        low: `${100 + index}.25`,
        close: `${100 + index}.60`,
      }),
    )
    const result = derivedOf(aggregateCanonicalCandle(target, expectation, settled(candles)))
    expect(result.derived.candle.open).toBe('100.50')
    expect(result.derived.candle.close).toBe('104.60')
    expect(result.derived.candle.high).toBe('104.75')
    expect(result.derived.candle.low).toBe('100.25')
    expect(result.derived.timeframe).toBe('5m')
    expect(result.derived.completeness).toBe('COMPLETE')
  })

  it('M. aggregates a 15m bucket', () => {
    const target = bucket('15m', W.open0200)
    const expectation = known(NORMAL, target)
    expect(expectation.expectedMinuteOpenTimes).toHaveLength(15)

    const result = derivedOf(
      aggregateCanonicalCandle(target, expectation, settled(everyExpected(expectation))),
    )
    expect(result.derived.timeframe).toBe('15m')
    expect(result.derived.completeness).toBe('COMPLETE')
    expect(toEpochMs(result.derived.nominalTo) - toEpochMs(target.open)).toBe(15 * MINUTE)
  })

  it('N. aggregates a 4H bucket', () => {
    const target = bucket('4H', W.open0200)
    const expectation = known(NORMAL, target)
    expect(expectation.expectedMinuteOpenTimes).toHaveLength(240)

    const result = derivedOf(
      aggregateCanonicalCandle(target, expectation, settled(everyExpected(expectation))),
    )
    expect(result.derived.timeframe).toBe('4H')
    expect(result.derived.completeness).toBe('COMPLETE')
    expect(result.derived.sessionTruncated).toBe(false)
    expect(result.derived.nominalTo).toBe(W.open0600)
    expect(result.derived.effectiveTo).toBe(W.open0600)
  })

  it('O. keys the derived candle on the BUCKET open, not the first observation', () => {
    /*
     * The bucket whose opening minutes are scheduled closed. Trading resumes at
     * 16:30, but the 4H bucket still opens at 14:00 where the grid says it does
     * — keying on the first traded minute would place a bar at an instant the
     * canonical grid has no boundary for.
     */
    const target = bucket('4H', T('2026-01-15T21:20:00Z'))
    expect(target.open).toBe(W.open1400)
    const expectation = known(NORMAL, target)
    const late = expectation.expectedMinuteOpenTimes.slice(-30)
    const result = aggregateCanonicalCandle(target, expectation, settled(late.map((m) => candleAt(m))))

    const derived = result.ok && result.kind === 'DERIVED' ? result.derived : null
    expect(derived?.candle.openTime).toBe(W.open1400)
    expect(derived?.candle.openTime).not.toBe(late[0])
  })

  it('P. selects the high exactly, where text ordering would be wrong', () => {
    const target = bucket('5m', W.open0200)
    const expectation = known(NORMAL, target)
    // '99.9' sorts AFTER '100.1' as text — '9' > '1'. Only an exact decimal
    // comparison picks the right one.
    const candles = expectation.expectedMinuteOpenTimes.map((minute, index) =>
      candleAt(minute, {
        open: '99.85', close: '99.88', low: '99.80',
        high: index === 3 ? '100.1' : '99.9',
      }),
    )
    const result = derivedOf(aggregateCanonicalCandle(target, expectation, settled(candles)))
    expect(result.derived.candle.high).toBe('100.1')
  })

  it('Q. selects the low exactly, where text ordering would be wrong', () => {
    const target = bucket('5m', W.open0200)
    const expectation = known(NORMAL, target)
    const candles = expectation.expectedMinuteOpenTimes.map((minute, index) =>
      candleAt(minute, {
        open: '100.15', close: '100.15', high: '100.20',
        low: index === 2 ? '99.9' : '100.1',
      }),
    )
    const result = derivedOf(aggregateCanonicalCandle(target, expectation, settled(candles)))
    expect(result.derived.candle.low).toBe('99.9')
  })

  it('R/S. open comes from the earliest contributor and close from the latest', () => {
    const target = bucket('15m', W.open0200)
    const expectation = known(NORMAL, target)
    const minutes = expectation.expectedMinuteOpenTimes
    const candles = minutes.map((minute, index) =>
      candleAt(minute, {
        open: index === 0 ? '111.11' : '100.00',
        close: index === minutes.length - 1 ? '222.22' : '100.00',
        high: '999.00',
        low: '1.00',
      }),
    )
    const result = derivedOf(aggregateCanonicalCandle(target, expectation, settled(candles)))
    expect(result.derived.candle.open).toBe('111.11')
    expect(result.derived.candle.close).toBe('222.22')
  })
})

// ═══ T–W, AI. The calendar decides what contributes ══════════════════════════

describe('the session calendar outranks the observations', () => {
  const target = bucket('4H', W.open1400)

  it('T. scheduled halt minutes are absent and never synthesized', () => {
    const expectation = known(NORMAL, target)
    const minutes = expectation.expectedMinuteOpenTimes
    expect(minutes).toHaveLength(165)
    expect(minutes.map(toEpochMs)).not.toContain(toEpochMs(W.haltFrom))

    const result = derivedOf(aggregateCanonicalCandle(target, expectation, settled(everyExpected(expectation))))
    // A candle exists, built from 165 minutes — not 240, and not padded to 240.
    expect(result.derived.completeness).toBe('COMPLETE')
  })

  it('U. a halt does not stop a bucket being COMPLETE', () => {
    const expectation = known(NORMAL, target)
    const result = derivedOf(aggregateCanonicalCandle(target, expectation, settled(everyExpected(expectation))))
    expect(result.derived.completeness).toBe('COMPLETE')
    // …and it is still session-truncated, because the day ends at 17:00 (§12.2).
    expect(result.derived.sessionTruncated).toBe(true)
  })

  it('V. one missing expected minute with a settled source is PARTIAL', () => {
    const morning = bucket('4H', W.open0200)
    const expectation = known(NORMAL, morning)
    const short = everyExpected(expectation).slice(0, -1)
    const result = derivedOf(aggregateCanonicalCandle(morning, expectation, settled(short)))
    expect(result.derived.completeness).toBe('PARTIAL')
  })

  it('W. a PARTIAL bar is not filled, interpolated or forward-filled', () => {
    const morning = bucket('4H', W.open0200)
    const expectation = known(NORMAL, morning)
    const minutes = expectation.expectedMinuteOpenTimes
    // Only the first and last minute arrive. The bar spans them and invents
    // nothing in between.
    const sparse = [
      candleAt(minutes[0], { open: '10.00', high: '11.00', low: '9.00', close: '10.50' }),
      candleAt(minutes[minutes.length - 1], { open: '20.00', high: '21.00', low: '19.00', close: '20.50' }),
    ]
    const result = derivedOf(aggregateCanonicalCandle(morning, expectation, settled(sparse)))
    expect(result.derived.completeness).toBe('PARTIAL')
    expect(result.derived.candle.open).toBe('10.00')
    expect(result.derived.candle.close).toBe('20.50')
    expect(result.derived.candle.high).toBe('21.00')
    expect(result.derived.candle.low).toBe('9.00')
    // Nothing was invented for the 238 absent minutes.
    expect(result.derived.candle.volume).toBeNull()
  })

  it('AI. an observation for a minute the calendar did not expect is refused', () => {
    /*
     * GATE-08C-2B UNEXPECTED-MINUTE GAP. Canonical v1.0 §18 calls a scheduled
     * closed minute EXPECTED ABSENCE; it does not say what to do when data
     * arrives for one anyway. Dropping it hides the contradiction, folding it in
     * lets a bar the calendar says never traded move the bucket's high. This
     * refusal is implementation safety, not canonical text.
     */
    const expectation = known(NORMAL, target)
    const withHalted = [...everyExpected(expectation), candleAt(T('2026-01-15T21:20:00Z'))]
      .sort((a, b) => toEpochMs(a.openTime) - toEpochMs(b.openTime))

    const result = aggregateCanonicalCandle(target, expectation, settled(withHalted))
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.refusal).toBe('UNEXPECTED_TRADING_MINUTE')
  })
})

// ═══ X–Z, AA–AC. No candle, and honest states ════════════════════════════════

describe('what happens when there is no candle to make', () => {
  it('X. expected minutes with zero observations produce no candle', () => {
    const morning = bucket('4H', W.open0200)
    const expectation = known(NORMAL, morning)
    const result = aggregateCanonicalCandle(morning, expectation, settled([]))

    expect(result.ok).toBe(true)
    expect(result.ok === true && result.kind).toBe('NO_OBSERVATION')
    expect(result.ok === true && result.kind === 'NO_OBSERVATION' && result.completeness).toBe('PARTIAL')
    // No OHLC was manufactured anywhere in the result.
    expect(JSON.stringify(result)).not.toContain('"open"')
  })

  it('X2. the same with an unsettled source reports UNKNOWN, still with no candle', () => {
    const morning = bucket('4H', W.open0200)
    const result = aggregateCanonicalCandle(morning, known(NORMAL, morning), {
      sourceState: 'UNKNOWN',
      candles: [],
    })
    expect(result.ok === true && result.kind).toBe('NO_OBSERVATION')
    expect(result.ok === true && result.kind === 'NO_OBSERVATION' && result.completeness).toBe('UNKNOWN')
  })

  it('Y. an empty expectation emits no canonical candle', () => {
    const holiday = bucket('4H', W.dayAfter0200)
    const expectation = known(FULL_CLOSURE, holiday)
    expect(expectation.expectedMinuteOpenTimes).toEqual([])

    const result = aggregateCanonicalCandle(holiday, expectation, settled([]))
    expect(result.ok === true && result.kind).toBe('NO_CANONICAL_CANDLE')
    /*
     * §18.1 enforced structurally: the variant carries no `completeness` field,
     * so "every member of the empty set was present" has nowhere to be written
     * down. No flat candle, no zero-volume placeholder, no previous close.
     */
    expect(result).not.toHaveProperty('completeness')
    expect(JSON.stringify(result)).not.toContain('COMPLETE')
  })

  it('Z. an UNKNOWN calendar produces no strategy-authoritative aggregate', () => {
    const outside = bucket('4H', T('2027-06-10T15:00:00Z'))
    const expectation = expectationFor(NORMAL, outside)
    expect(expectation.status).toBe('UNKNOWN')

    const result = aggregateCanonicalCandle(outside, expectation, settled([candleAt(outside.open)]))
    expect(result.ok === true && result.kind).toBe('UNKNOWN_CALENDAR')
    // No effectiveTo and no sessionTruncated were manufactured from nominalTo.
    expect(result).not.toHaveProperty('effectiveTo')
    expect(result).not.toHaveProperty('sessionTruncated')
    expect(result.ok === true && fourHourStrategyStanding(outside, result.evidence)).toBe('INELIGIBLE')
  })

  it('AA. an unsettled source never becomes COMPLETE from array length', () => {
    const morning = bucket('4H', W.open0200)
    const expectation = known(NORMAL, morning)
    // Every expected minute is present. It still cannot be COMPLETE.
    const result = derivedOf(
      aggregateCanonicalCandle(morning, expectation, {
        sourceState: 'UNKNOWN',
        candles: everyExpected(expectation),
      }),
    )
    expect(result.derived.completeness).toBe('UNKNOWN')
  })

  it('AB. an unsettled source with observations yields an UNKNOWN-marked candle', () => {
    const morning = bucket('4H', W.open0200)
    const expectation = known(NORMAL, morning)
    const result = derivedOf(
      aggregateCanonicalCandle(morning, expectation, {
        sourceState: 'UNKNOWN',
        candles: everyExpected(expectation),
      }),
    )
    // The candle exists and is explicitly marked, and the bucket bounds come
    // from the KNOWN calendar rather than being invented.
    expect(result.derived.completeness).toBe('UNKNOWN')
    expect(result.derived.nominalTo).toBe(W.open0600)
    expect(result.derived.effectiveTo).toBe(W.open0600)
    expect(result.derived.sessionTruncated).toBe(false)
    // And it can never be consumed as completed strategy evidence.
    expect(fourHourStrategyStanding(morning, result.evidence)).toBe('INELIGIBLE')
  })

  it('AC. an early close can be COMPLETE and session-truncated at once', () => {
    const midday = bucket('4H', W.open1000)
    const expectation = known(EARLY_CLOSE, midday)
    const result = derivedOf(
      aggregateCanonicalCandle(midday, expectation, settled(everyExpected(expectation))),
    )
    expect(result.derived.completeness).toBe('COMPLETE')
    expect(result.derived.sessionTruncated).toBe(true)
    expect(result.derived.effectiveTo).toBe(T('2026-01-15T18:00:00Z'))
    expect(result.derived.nominalTo).toBe(W.open1400)
  })
})

// ═══ AD–AH. The GATE-08C-2A precondition, unchanged ══════════════════════════

describe('strategy standing is asked of the C2A predicate, not reinvented', () => {
  const standing = (calendar: SessionCalendar, open: Timestamp, keep = Number.POSITIVE_INFINITY) => {
    const target = bucket('4H', open)
    const expectation = known(calendar, target)
    const result = aggregateCanonicalCandle(
      target,
      expectation,
      settled(everyExpected(expectation).slice(0, keep)),
    )
    if (!result.ok) throw new Error(`refused: ${result.refusal}`)
    return { target, result, standing: fourHourStrategyStanding(target, result.evidence) }
  }

  it('AF. a complete full-length 02:00 satisfies the precondition', () => {
    const { result, standing: verdict } = standing(NORMAL, W.open0200)
    expect(result.kind).toBe('DERIVED')
    expect(verdict).toBe('ELIGIBLE')
  })

  it('AG. a complete full-length 10:00 satisfies the precondition', () => {
    const { result, standing: verdict } = standing(NORMAL, W.open1000)
    expect(result.kind).toBe('DERIVED')
    expect(verdict).toBe('ELIGIBLE')
  })

  it('AD/AE. a truncated 02:00 or 10:00 does not, however complete its data', () => {
    // EARLY_CLOSE ends at 13:00 New York: the 10:00 bucket has every minute it
    // was ever going to have, and still never reached 14:00.
    const ten = standing(EARLY_CLOSE, W.open1000)
    expect(ten.result.kind === 'DERIVED' && ten.result.derived.completeness).toBe('COMPLETE')
    expect(ten.result.kind === 'DERIVED' && ten.result.derived.sessionTruncated).toBe(true)
    expect(ten.standing).toBe('INELIGIBLE')

    const cut = built('fixture-cut-0200-v1', [[W.open1800, T('2026-01-15T09:00:00Z')]], FULL_COVERAGE)
    const two = standing(cut, W.open0200)
    expect(two.result.kind === 'DERIVED' && two.result.derived.completeness).toBe('COMPLETE')
    expect(two.standing).toBe('INELIGIBLE')
  })

  it('a PARTIAL 02:00 is not eligible either', () => {
    expect(standing(NORMAL, W.open0200, 100).standing).toBe('INELIGIBLE')
  })

  it('AH. the 14:00 bucket stays outside the question entirely', () => {
    const { result, standing: verdict } = standing(NORMAL, W.open1400)
    expect(result.kind === 'DERIVED' && result.derived.completeness).toBe('COMPLETE')
    expect(result.kind === 'DERIVED' && result.derived.sessionTruncated).toBe(true)
    expect(verdict).toBe('NOT_STRATEGY_RELEVANT')
  })
})

// ═══ AJ–AN. Volume ══════════════════════════════════════════════════════════

describe('volume is summed exactly, or reported as absent', () => {
  const twoMinuteBucket = bucket('5m', T('2026-01-15T07:00:00Z'))

  function twoMinuteResult(first: string | null, second: string | null) {
    const expectation = known(TWO_MINUTE, twoMinuteBucket)
    expect(expectation.expectedMinuteOpenTimes).toHaveLength(2)
    const candles = [
      candleAt(expectation.expectedMinuteOpenTimes[0], { volume: first }),
      candleAt(expectation.expectedMinuteOpenTimes[1], { volume: second }),
    ]
    return aggregateCanonicalCandle(twoMinuteBucket, expectation, settled(candles))
  }

  it('AJ. a complete bucket with every volume present sums exactly', () => {
    expect(derivedOf(twoMinuteResult('1', '2')).derived.candle.volume).toBe('3')

    const morning = bucket('5m', W.open0200)
    const expectation = known(NORMAL, morning)
    const result = derivedOf(
      aggregateCanonicalCandle(morning, expectation, settled(everyExpected(expectation, { volume: '10' }))),
    )
    expect(result.derived.candle.volume).toBe('50')
  })

  it('AK. mixed decimal scales sum exactly, keeping the widest scale', () => {
    // Serialization mechanics, not market policy: the total carries the largest
    // constituent scale so summing in two halves matches summing in one pass.
    expect(derivedOf(twoMinuteResult('1.0', '2.00')).derived.candle.volume).toBe('3.00')
    expect(derivedOf(twoMinuteResult('0.001', '0.002')).derived.candle.volume).toBe('0.003')
    expect(derivedOf(twoMinuteResult('1.05', '2')).derived.candle.volume).toBe('3.05')
    // No float could hold this pair without drifting.
    expect(derivedOf(twoMinuteResult('0.1', '0.2')).derived.candle.volume).toBe('0.3')
  })

  it('AL. a single null constituent makes the total null, never a partial sum', () => {
    const result = derivedOf(twoMinuteResult('1', null))
    expect(result.derived.completeness).toBe('COMPLETE')
    expect(result.derived.candle.volume).toBeNull()
  })

  it('AM. a PARTIAL bucket reports no volume', () => {
    const morning = bucket('4H', W.open0200)
    const expectation = known(NORMAL, morning)
    const result = derivedOf(
      aggregateCanonicalCandle(morning, expectation, settled(everyExpected(expectation).slice(0, 10))),
    )
    expect(result.derived.completeness).toBe('PARTIAL')
    expect(result.derived.candle.volume).toBeNull()
  })

  it('AN. an UNKNOWN bucket reports no volume', () => {
    const morning = bucket('4H', W.open0200)
    const expectation = known(NORMAL, morning)
    const result = derivedOf(
      aggregateCanonicalCandle(morning, expectation, {
        sourceState: 'UNKNOWN',
        candles: everyExpected(expectation, { volume: '10' }),
      }),
    )
    expect(result.derived.completeness).toBe('UNKNOWN')
    expect(result.derived.candle.volume).toBeNull()
  })

  it('refuses a total the canonical decimal grammar cannot represent', () => {
    const result = twoMinuteResult('999999999999999999', '999999999999999999')
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.refusal).toBe('VOLUME_NOT_REPRESENTABLE')
  })

  it('null is never confused with zero', () => {
    const nulled = derivedOf(twoMinuteResult(null, null))
    expect(nulled.derived.candle.volume).toBeNull()
    expect(nulled.derived.candle.volume).not.toBe('0')

    const zeroes = derivedOf(twoMinuteResult('0', '0'))
    expect(zeroes.derived.candle.volume).toBe('0')
  })
})

// ═══ AP–AR. Input provenance, immutability, determinism ══════════════════════

describe('a provider-native higher-timeframe bar cannot masquerade as a bucket', () => {
  it('AP. one bar covering the bucket is still one minute of coverage', () => {
    /*
     * A provider's native 5m bar stamped at the bucket open is structurally
     * indistinguishable from a 1m bar at the same instant — nothing in the
     * candle body says which it is, and Canonical v1.0 §12 is exactly why that
     * must not matter. The defence is not detection but ARITHMETIC: the
     * calendar expected five minutes, one arrived, and the bucket is PARTIAL.
     * A native bar can never be COMPLETE evidence for a bucket it claims to
     * summarise, and PARTIAL can never be strategy evidence.
     */
    const target = bucket('5m', W.open0200)
    const expectation = known(NORMAL, target)
    const nativeLookalike = candleAt(target.open, { open: '100.00', high: '105.00', low: '95.00', close: '104.00' })

    const result = derivedOf(aggregateCanonicalCandle(target, expectation, settled([nativeLookalike])))
    expect(result.derived.completeness).toBe('PARTIAL')
    expect(result.derived.candle.volume).toBeNull()
  })
})

describe('the same inputs always produce the same answer', () => {
  const target = bucket('15m', W.open0200)

  it('AQ. every returned value is frozen', () => {
    const expectation = known(NORMAL, target)
    const result = derivedOf(aggregateCanonicalCandle(target, expectation, settled(everyExpected(expectation))))
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.derived)).toBe(true)
    expect(Object.isFrozen(result.derived.candle)).toBe(true)
  })

  it('AR. repeats identically, and mutates neither input', () => {
    const expectation = known(NORMAL, target)
    const candles = everyExpected(expectation)
    const snapshot = JSON.stringify(candles)

    const first = aggregateCanonicalCandle(target, expectation, settled(candles))
    const second = aggregateCanonicalCandle(target, expectation, settled(candles))
    expect(second).toEqual(first)
    expect(JSON.stringify(candles)).toBe(snapshot)
  })
})
