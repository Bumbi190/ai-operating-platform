/**
 * GATE-08C-3A — the contract candle segment.
 *
 * Every instant, price and contract here is an Omnira-owned fixture. No real
 * calendar, no real contract expiry and no market data appears in this file.
 *
 * The winter instants are chosen so their New York wall-clock labels land on
 * the canonical grid: 07:00Z is 02:00 ET, 11:00Z is 06:00 ET.
 */

import { describe, expect, it } from 'vitest'
import { asTimestamp, type Timestamp } from '../time'
import { contractCycle, resolvedContract } from '../contract-identity'
import { priceText, type PriceText } from '../market-price'
import type { MarketCandle } from '../market-candle'
import {
  SEGMENT_PROBLEMS,
  buildContractCandleSegment,
  checkSegmentSequence,
  sameSegmentContract,
} from './index'

const T = (raw: string): Timestamp => asTimestamp(raw)
const P = (raw: string): PriceText => priceText(raw)
const NQ_H26 = resolvedContract('NQ', contractCycle(2026, 3))
const NQ_M26 = resolvedContract('NQ', contractCycle(2026, 6))
const MNQ_H26 = resolvedContract('MNQ', contractCycle(2026, 3))

const FROM = T('2026-01-15T07:00:00Z')   // 02:00 New York
const TO = T('2026-01-15T11:00:00Z')     // 06:00 New York

function candle(openTime: string, close = '100.25'): MarketCandle {
  return {
    openTime: T(openTime),
    open: P('100.00'), high: P('100.50'), low: P('99.50'), close: P(close), volume: P('10'),
  }
}

const build = (over: Record<string, unknown> = {}) =>
  buildContractCandleSegment({
    contract: NQ_H26, timeframe: '1m', from: FROM, to: TO, candles: [], ...over,
  })

// ═══ H–L. Envelopes at every canonical timeframe ═════════════════════════════

describe('a segment envelopes candles of any canonical timeframe', () => {
  it('H. 1m', () => {
    const built = build({ timeframe: '1m', candles: [candle('2026-01-15T07:00:00Z'), candle('2026-01-15T07:01:00Z')] })
    expect(built.ok).toBe(true)
    expect(built.ok && built.segment.candles).toHaveLength(2)
  })

  it('I. 5m', () => {
    const built = build({ timeframe: '5m', candles: [candle('2026-01-15T07:00:00Z'), candle('2026-01-15T07:05:00Z')] })
    expect(built.ok).toBe(true)
  })

  it('J. 15m', () => {
    const built = build({ timeframe: '15m', candles: [candle('2026-01-15T07:00:00Z'), candle('2026-01-15T07:15:00Z')] })
    expect(built.ok).toBe(true)
  })

  it('K. 4H — the canonical local opens', () => {
    // 07:00Z is 02:00 New York; the next 4H open is 06:00 NY = 11:00Z, which is
    // the exclusive end, so one candle fits this window.
    const built = build({ timeframe: '4H', candles: [candle('2026-01-15T07:00:00Z')] })
    expect(built.ok).toBe(true)
  })

  it('refuses a candle that is not on the declared grid', () => {
    // 07:03 is a fine 1m open and not a 5m one.
    const built = build({ timeframe: '5m', candles: [candle('2026-01-15T07:03:00Z')] })
    expect(built.ok === false && built.problem).toBe('NON_CANONICAL_CANDLE_OPEN')
    // …and the same instant IS valid when the envelope says 1m.
    expect(build({ timeframe: '1m', candles: [candle('2026-01-15T07:03:00Z')] }).ok).toBe(true)
  })

  it('L. the contract lives in the envelope and nowhere else', () => {
    const built = build({ candles: [candle('2026-01-15T07:00:00Z')] })
    if (!built.ok) throw new Error('expected a segment')
    expect(built.segment.contract).toEqual({ root: 'NQ', cycle: { year: 2026, quarterMonth: 3 } })
    // M. The candle carries no contract fact — it never did and still does not.
    const only = built.segment.candles[0]
    expect(Object.keys(only).sort()).toEqual(['close', 'high', 'low', 'open', 'openTime', 'volume'])
  })

  it('refuses a bare root as the segment contract', () => {
    const built = build({ contract: 'NQ' })
    expect(built.ok).toBe(false)
    expect(built.ok === false && built.problem).toBe('UNRESOLVED_CONTRACT')
  })
})

// ═══ N–R. Containment, ordering, duplicates ══════════════════════════════════

describe('candles must lie inside the half-open window, in instant order', () => {
  it('N. refuses a candle before `from`', () => {
    const built = build({ candles: [candle('2026-01-15T06:59:00Z')] })
    expect(built.ok === false && built.problem).toBe('CANDLE_BEFORE_WINDOW')
  })

  it('O. refuses a candle opening exactly at `to`', () => {
    // Half-open: `to` belongs to the next window, never this one.
    const built = build({ candles: [candle('2026-01-15T11:00:00Z')] })
    expect(built.ok === false && built.problem).toBe('CANDLE_AT_OR_AFTER_WINDOW')
  })

  it('P. accepts a candle strictly inside', () => {
    expect(build({ candles: [candle('2026-01-15T10:59:00Z')] }).ok).toBe(true)
    expect(build({ candles: [candle(FROM)] }).ok).toBe(true)
  })

  it('Q. refuses an unordered sequence', () => {
    const built = build({ candles: [candle('2026-01-15T07:05:00Z'), candle('2026-01-15T07:01:00Z')] })
    expect(built.ok === false && built.problem).toBe('UNORDERED_CANDLES')
  })

  it('R. treats equivalent Timestamp spellings as one instant', () => {
    /*
     * The GATE-08C-2B.1 lesson, not re-learned here: '…07:00:00Z' and
     * '…07:00:00.000Z' are one instant written two ways. A text-keyed check
     * would let both survive as separate candles.
     */
    const built = build({ candles: [candle('2026-01-15T07:00:00Z'), candle('2026-01-15T07:00:00.000Z')] })
    expect(built.ok === false && built.problem).toBe('DUPLICATE_CANDLE_INSTANT')

    const reversed = build({ candles: [candle('2026-01-15T07:00:00.000Z'), candle('2026-01-15T07:00:00Z')] })
    expect(reversed.ok === false && reversed.problem).toBe('DUPLICATE_CANDLE_INSTANT')
  })

  it('S/T. repairs nothing — no sort, no dedupe, no reconciliation', () => {
    // Two candles for one instant with DIFFERENT bodies is still a refusal, not
    // a merge: duplicate/disagreement semantics belong to mergeOlderCandles.
    const built = build({
      candles: [candle('2026-01-15T07:00:00Z', '100.25'), candle('2026-01-15T07:00:00Z', '999.00')],
    })
    expect(built.ok === false && built.problem).toBe('DUPLICATE_CANDLE_INSTANT')
    expect(built).not.toHaveProperty('segment')
  })
})

// ═══ U–Y. Bytes, immutability, determinism ═══════════════════════════════════

describe('the segment preserves exactly what it was given', () => {
  const millis = candle('2026-01-15T07:00:00.000Z')
  const plain = candle('2026-01-15T07:01:00Z')

  it('U. keeps Timestamp text byte-for-byte', () => {
    const built = build({ candles: [millis, plain] })
    if (!built.ok) throw new Error('expected a segment')
    expect(built.segment.candles[0].openTime).toBe('2026-01-15T07:00:00.000Z')
    expect(built.segment.candles[1].openTime).toBe('2026-01-15T07:01:00Z')
  })

  it('V. keeps PriceText bytes, at whatever scale they arrived', () => {
    const scaled: MarketCandle = {
      openTime: T('2026-01-15T07:00:00Z'),
      open: P('100.0'), high: P('100.50'), low: P('99.5'), close: P('100'), volume: null,
    }
    const built = build({ candles: [scaled] })
    if (!built.ok) throw new Error('expected a segment')
    const kept = built.segment.candles[0]
    expect(kept.open).toBe('100.0')
    expect(kept.close).toBe('100')
    expect(kept.low).toBe('99.5')
    expect(kept.volume).toBeNull()
  })

  it('W. does not mutate the input array or its candles', () => {
    const input = [plain, candle('2026-01-15T07:02:00Z')]
    const snapshot = JSON.stringify(input)
    build({ candles: input })
    expect(JSON.stringify(input)).toBe(snapshot)
    expect(input).toHaveLength(2)
  })

  it('X. returns frozen values', () => {
    const built = build({ candles: [plain] })
    expect(Object.isFrozen(built)).toBe(true)
    expect(built.ok && Object.isFrozen(built.segment)).toBe(true)
    expect(built.ok && Object.isFrozen(built.segment.candles)).toBe(true)
  })

  it('a later push to the caller array cannot reach inside a built segment', () => {
    const input = [plain]
    const built = build({ candles: input })
    input.push(candle('2026-01-15T07:03:00Z'))
    expect(built.ok && built.segment.candles).toHaveLength(1)
  })

  it('Y. repeats identically', () => {
    const a = build({ candles: [plain] })
    const b = build({ candles: [plain] })
    expect(b).toEqual(a)
  })
})

// ═══ Z. Contract boundaries stay explicit ════════════════════════════════════

describe('Z. segment boundaries are never flattened away', () => {
  const first = build({ candles: [candle('2026-01-15T07:00:00Z')] })
  const second = buildContractCandleSegment({
    contract: NQ_M26, timeframe: '1m', from: TO, to: T('2026-01-15T15:00:00Z'),
    candles: [candle('2026-01-15T11:00:00Z')],
  })

  it('a sequence check returns SEGMENTS, not a stitched candle array', () => {
    if (!first.ok || !second.ok) throw new Error('fixture segments expected')
    const checked = checkSegmentSequence([first.segment, second.segment])
    expect(checked.ok).toBe(true)
    if (!checked.ok) return
    expect(checked.segments).toHaveLength(2)
    // The two contracts remain distinguishable — that is the whole point.
    expect(sameSegmentContract(checked.segments[0], checked.segments[1])).toBe(false)
    expect(checked.segments[0].contract.cycle.quarterMonth).toBe(3)
    expect(checked.segments[1].contract.cycle.quarterMonth).toBe(6)
  })

  it('refuses overlapping or unordered segments', () => {
    if (!first.ok || !second.ok) throw new Error('fixture segments expected')
    expect(checkSegmentSequence([second.segment, first.segment]).ok).toBe(false)

    const overlapping = buildContractCandleSegment({
      contract: NQ_M26, timeframe: '1m', from: T('2026-01-15T10:00:00Z'), to: T('2026-01-15T15:00:00Z'),
      candles: [],
    })
    if (!overlapping.ok) throw new Error('fixture segment expected')
    const checked = checkSegmentSequence([first.segment, overlapping.segment])
    expect(checked.ok === false && checked.problem).toBe('OVERLAPPING_SEGMENTS')
  })

  it('refuses a mixed-timeframe sequence', () => {
    const fourHour = build({ timeframe: '4H', candles: [candle('2026-01-15T07:00:00Z')] })
    if (!first.ok || !fourHour.ok) throw new Error('fixture segments expected')
    const later = buildContractCandleSegment({
      contract: NQ_H26, timeframe: '4H', from: TO, to: T('2026-01-15T19:00:00Z'),
      candles: [candle('2026-01-15T11:00:00Z')],
    })
    if (!later.ok) throw new Error('fixture segment expected')
    const checked = checkSegmentSequence([first.segment, later.segment])
    expect(checked.ok === false && checked.problem).toBe('MIXED_TIMEFRAME')
  })

  it('distinguishes NQ from MNQ of the same cycle', () => {
    // §22: same cycle, different products. Never one contract.
    const micro = buildContractCandleSegment({
      contract: MNQ_H26, timeframe: '1m', from: FROM, to: TO, candles: [],
    })
    if (!first.ok || !micro.ok) throw new Error('fixture segments expected')
    expect(sameSegmentContract(first.segment, micro.segment)).toBe(false)
  })
})

describe('the refusal vocabulary is caller-contract validation', () => {
  it('is a closed local union, not a canonical reason registry', () => {
    expect([...SEGMENT_PROBLEMS]).toEqual([
      'UNRESOLVED_CONTRACT', 'UNSUPPORTED_TIMEFRAME', 'MALFORMED_INSTANT', 'EMPTY_INTERVAL',
      'CANDLE_BEFORE_WINDOW', 'CANDLE_AT_OR_AFTER_WINDOW', 'UNORDERED_CANDLES',
      'DUPLICATE_CANDLE_INSTANT', 'NON_CANONICAL_CANDLE_OPEN',
    ])
  })
})
