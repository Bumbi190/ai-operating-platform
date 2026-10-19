/**
 * GATE-08 C3C — routine Vitest regressions for the real domain contract.
 *
 * This tests SOURCE validation, not provider connectivity, a strategy signal,
 * calendar completeness, market performance or execution permission.
 */
import { describe, expect, it } from 'vitest'
import { asTimestamp } from '../time'
import { resolvedContract, contractCycle } from '../contract-identity'
import { priceText } from '../market-price'
import { OBSERVATION_SOURCE_STATES, type ObservedMinutes } from '../session-calendar'
import { buildHistoricalContractRequest } from './contract-window'
import { inspectHistoricalContractResult, readHistoricalContractChunk } from './historical-contract-source'

const CONTRACT = resolvedContract('NQ', contractCycle(2026, 3))
const FROM = asTimestamp('2026-01-15T07:00:00Z')
const TO = asTimestamp('2026-01-15T07:05:00Z')
const built = buildHistoricalContractRequest({ contract: CONTRACT, timeframe: '1m', from: FROM, to: TO })
if (!built.ok) throw new Error('expected fixture request')
const REQUEST = built.request
const candle = (at = '2026-01-15T07:00:00Z') => ({
  openTime: asTimestamp(at),
  open: priceText('100.0'), high: priceText('101'),
  low: priceText('99'), close: priceText('100.25'), volume: null,
})
const report = (extra: Record<string, unknown> = {}) => ({
  kind: 'OBSERVATIONS', contract: CONTRACT,
  coverage: { from: FROM, to: TO },
  sourceState: 'SETTLED', candles: [candle()],
  ...extra,
})

describe('C3C source boundary: deterministic acceptance', () => {
  it('REVIEW: refuses OHLC prices with a high below its low', () => {
    const result = inspectHistoricalContractResult(REQUEST, report({
      candles: [{...candle(), high: priceText('98')}],
    }))
    expect(result).toMatchObject({kind: 'INVARIANT_VIOLATION', problem: 'MALFORMED_SOURCE_RESULT'})
  })

  it('REVIEW: refuses open or close outside the recorded high-low bounds', () => {
    for (const invalid of [
      {open: priceText('102')},
      {open: priceText('98')},
      {close: priceText('102')},
      {close: priceText('98')},
    ]) {
      const result = inspectHistoricalContractResult(REQUEST, report({
        candles: [{...candle(), ...invalid}],
      }))
      expect(result).toMatchObject({kind: 'INVARIANT_VIOLATION', problem: 'MALFORMED_SOURCE_RESULT'})
    }
  })

  it('REVIEW: refuses negative reported volume, keeps zero/null distinct', () => {
    const negative = inspectHistoricalContractResult(REQUEST, report({
      candles: [{...candle(), volume: priceText('-1')}],
    }))
    expect(negative).toMatchObject({kind: 'INVARIANT_VIOLATION', problem: 'MALFORMED_SOURCE_RESULT'})
    for (const volume of [priceText('0'), null]) {
      const result = inspectHistoricalContractResult(REQUEST, report({
        candles: [{...candle(), volume}],
      }))
      expect(result.kind).toBe('ACCEPTED')
    }
  })

  it('REVIEW: compares numerically equal OHLC values regardless of exact string scale', () => {
    const result = inspectHistoricalContractResult(REQUEST, report({
      candles: [{...candle(), open: priceText('100.000'), high: priceText('100.0000'), low: priceText('100.0'), close: priceText('100'), volume: priceText('0.000')}],
    }))
    expect(result.kind).toBe('ACCEPTED')
  })

  it('uses exactly the canonical ObservationSourceState vocabulary and ObservedMinutes shape', () => {
    expect(OBSERVATION_SOURCE_STATES).toEqual(['SETTLED', 'UNKNOWN'])
    const inspected = inspectHistoricalContractResult(REQUEST, report())
    expect(inspected.kind).toBe('ACCEPTED')
    if (inspected.kind !== 'ACCEPTED') return
    const canonical: ObservedMinutes = inspected.observed
    expect(canonical.sourceState).toBe('SETTLED')
    expect(canonical.minuteOpenTimes).toEqual([FROM])
  })

  it('accepts a settled report without claiming a complete candle or permission', () => {
    const result = inspectHistoricalContractResult(REQUEST, report())
    expect(result.kind).toBe('ACCEPTED')
    if (result.kind !== 'ACCEPTED') return
    expect(result.segment.candles).toHaveLength(1)
    expect(result.observed.sourceState).toBe('SETTLED')
    expect(result.observed.minuteOpenTimes).toEqual([FROM])
    expect(result.nextRequest).toBeNull()
    expect(result).not.toHaveProperty('completeness')
    expect(result).not.toHaveProperty('canExecute')
  })

  it('remains UNKNOWN even when source coverage reaches the requested endpoint', () => {
    const result = inspectHistoricalContractResult(REQUEST, report({ sourceState: 'UNKNOWN' }))
    expect(result.kind).toBe('ACCEPTED')
    if (result.kind !== 'ACCEPTED') return
    expect(result.observed.sourceState).toBe('UNKNOWN')
    expect(result.nextRequest).toBeNull()
  })

  it('advances only to the accepted prefix end and preserves the original to', () => {
    const mid = asTimestamp('2026-01-15T07:02:00Z')
    const result = inspectHistoricalContractResult(REQUEST, report({coverage: {from:FROM,to:mid}}))
    expect(result.kind).toBe('ACCEPTED')
    if (result.kind !== 'ACCEPTED') return
    expect(result.nextRequest?.from).toBe(mid)
    expect(result.nextRequest?.to).toBe(TO)
  })

  it('keeps no-data with settled and unknown as two distinct source observations', () => {
    for (const sourceState of ['SETTLED', 'UNKNOWN'] as const) {
      const result = inspectHistoricalContractResult(REQUEST, {
        kind:'NO_DATA', contract:CONTRACT, coverage:{from:FROM,to:TO}, sourceState,
      })
      expect(result.kind).toBe('ACCEPTED')
      if (result.kind !== 'ACCEPTED') continue
      expect(result.segment.candles).toEqual([])
      expect(result.observed.sourceState).toBe(sourceState)
      expect(result.observed.minuteOpenTimes).toEqual([])
    }
  })

  it('refuses another concrete contract before accepting any candles', () => {
    const result = inspectHistoricalContractResult(REQUEST, report({
      contract: resolvedContract('MNQ', contractCycle(2026, 3)),
    }))
    expect(result).toMatchObject({kind:'INVARIANT_VIOLATION',problem:'CONTRACT_MISMATCH'})
  })

  it('refuses incorrect or zero-progress coverage', () => {
    for (const coverage of [
      {from:FROM,to:FROM},
      {from:asTimestamp('2026-01-15T07:01:00Z'),to:TO},
      {from:FROM,to:asTimestamp('2026-01-15T07:06:00Z')},
    ]) {
      const result = inspectHistoricalContractResult(REQUEST,report({coverage}))
      expect(result).toMatchObject({kind:'INVARIANT_VIOLATION',problem:'INVALID_COVERAGE'})
    }
  })

  it('does not treat an empty observations array as an explicit NO_DATA result', () => {
    const result = inspectHistoricalContractResult(REQUEST,report({candles:[]}))
    expect(result).toMatchObject({kind:'INVARIANT_VIOLATION',problem:'MALFORMED_SOURCE_RESULT'})
  })

  it('does not repair a duplicate candle instant', () => {
    const result = inspectHistoricalContractResult(REQUEST,report({
      candles:[candle(),candle('2026-01-15T07:00:00.000Z')],
    }))
    expect(result).toMatchObject({kind:'SEGMENT_REFUSED',problem:'DUPLICATE_CANDLE_INSTANT'})
  })

  it('preserves exact price and original timestamp bytes', () => {
    const result = inspectHistoricalContractResult(REQUEST,report({
      candles:[{...candle(),openTime:asTimestamp('2026-01-15T07:00:00.000Z')}],
    }))
    expect(result.kind).toBe('ACCEPTED')
    if (result.kind !== 'ACCEPTED') return
    expect(result.segment.candles[0].openTime).toBe('2026-01-15T07:00:00.000Z')
    expect(result.segment.candles[0].open).toBe('100.0')
  })

  it('technical/infrastructure errors reject the promise rather than becoming NO_DATA', async () => {
    const source = {read: async () => {throw new Error('transport failed')}}
    await expect(readHistoricalContractChunk(source, REQUEST)).rejects.toThrow('transport failed')
  })

  it('semantic refusal is distinct from infrastructure error', async () => {
    const source = {read: async () => ({kind:'REFUSED' as const,reason:'SOURCE_REQUEST_UNAVAILABLE' as const})}
    await expect(readHistoricalContractChunk(source, REQUEST))
      .resolves.toMatchObject({kind:'REFUSED',reason:'SOURCE_REQUEST_UNAVAILABLE'})
  })
})
