import { describe, expect, it } from 'vitest'
import { asId, isWellFormedId, MAX_ID_LENGTH, newId, parseId } from './ids'
import {
  asDecimal, compareDecimal, decimalEquals, decimalToString,
  isPositive, isZero, parseDecimal, parseNonNegativeDecimal,
} from './decimal'
import { asTimestamp, isAfter, isExpiredAt, isTimestamp, parseTimestamp, timestampFrom } from './time'
import {
  environmentsAgree, isBrokerFacing, isLive, isTradingEnvironment,
  parseEnvironment, TRADING_ENVIRONMENTS,
} from './environment'
import {
  isVersionLabel, parseVersionLabel, riskProfileRef, sameStrategyVersion, strategyVersionRef,
} from './versions'
import type { RiskProfileId, StrategyId, StrategyVersionId } from './ids'

describe('identities', () => {
  it('accepts opaque single-line identifiers', () => {
    expect(isWellFormedId('a')).toBe(true)
    expect(isWellFormedId('3f9c1e2a-0b44-4c1d-9a77-2b6e5f0d1c33')).toBe(true)
    expect(isWellFormedId('MT5-ORDER-99182')).toBe(true)
  })

  it('rejects empty, padded, oversized and control-character input', () => {
    expect(isWellFormedId('')).toBe(false)
    expect(isWellFormedId(' pad')).toBe(false)
    expect(isWellFormedId('pad ')).toBe(false)
    expect(isWellFormedId('a\nb')).toBe(false)
    expect(isWellFormedId('a\0b')).toBe(false)
    expect(isWellFormedId('x'.repeat(MAX_ID_LENGTH + 1))).toBe(false)
  })

  it('rejects non-strings rather than coercing', () => {
    expect(isWellFormedId(42)).toBe(false)
    expect(isWellFormedId(null)).toBe(false)
    expect(isWellFormedId(undefined)).toBe(false)
    expect(isWellFormedId({})).toBe(false)
  })

  it('parseId fails closed to null; asId throws', () => {
    expect(parseId('')).toBeNull()
    expect(parseId('ok')).toBe('ok')
    expect(() => asId('')).toThrow()
  })

  it('newId mints values that are neither name- nor time-derived', () => {
    const a = newId()
    const b = newId()
    expect(a).not.toBe(b)
    expect(isWellFormedId(a)).toBe(true)
    // A UUID contains no timestamp prefix a reader could mistake for ordering.
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('exact decimals', () => {
  it('parses plain decimal strings exactly', () => {
    expect(parseDecimal('0')).toMatchObject({ units: BigInt(0), scale: 0 })
    expect(parseDecimal('1.25')).toMatchObject({ units: BigInt(125), scale: 2 })
    expect(parseDecimal('-3.5')).toMatchObject({ units: BigInt(-35), scale: 1 })
  })

  it('refuses float input — the whole point of the type', () => {
    expect(parseDecimal(1.25 as unknown)).toBeNull()
    expect(parseDecimal(0 as unknown)).toBeNull()
  })

  it('rejects exponent notation, leading plus and leading zeros', () => {
    expect(parseDecimal('1e5')).toBeNull()
    expect(parseDecimal('+1.5')).toBeNull()
    expect(parseDecimal('01.5')).toBeNull()
    expect(parseDecimal('.5')).toBeNull()
    expect(parseDecimal('1.')).toBeNull()
    expect(parseDecimal('')).toBeNull()
  })

  it('rejects scale beyond the bound', () => {
    expect(parseDecimal('0.123456789012')).not.toBeNull()
    expect(parseDecimal('0.1234567890123')).toBeNull()
  })

  it('compares across differing scales without precision loss', () => {
    const a = asDecimal('1.50')
    const b = asDecimal('1.5')
    expect(decimalEquals(a, b)).toBe(true)
    expect(compareDecimal(a, b)).toBe(0)
    expect(compareDecimal(asDecimal('1.5'), asDecimal('1.55'))).toBe(-1)
    expect(compareDecimal(asDecimal('2'), asDecimal('1.999999'))).toBe(1)
  })

  it('survives the classic float trap exactly', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point. Here the values stay exact.
    expect(decimalEquals(asDecimal('0.30'), asDecimal('0.3'))).toBe(true)
    expect(compareDecimal(asDecimal('0.1'), asDecimal('0.2'))).toBe(-1)
  })

  it('normalizes negative zero so sign never leaks into equality', () => {
    const negZero = asDecimal('-0.00')
    expect(isZero(negZero)).toBe(true)
    expect(decimalEquals(negZero, asDecimal('0'))).toBe(true)
    expect(decimalToString(negZero)).toBe('0.00')
  })

  it('distinguishes positive from zero', () => {
    expect(isPositive(asDecimal('0.0001'))).toBe(true)
    expect(isPositive(asDecimal('0'))).toBe(false)
    expect(isPositive(asDecimal('-1'))).toBe(false)
  })

  it('parseNonNegativeDecimal refuses negatives', () => {
    expect(parseNonNegativeDecimal('0')).not.toBeNull()
    expect(parseNonNegativeDecimal('-0.01')).toBeNull()
  })

  it('round-trips through its string form', () => {
    for (const text of ['0', '1.25', '-3.5', '12345.000001']) {
      expect(decimalToString(asDecimal(text))).toBe(text)
    }
  })
})

describe('timestamps', () => {
  it('accepts ISO-8601 UTC and rejects offsets or naive times', () => {
    expect(isTimestamp('2026-08-27T10:00:00Z')).toBe(true)
    expect(isTimestamp('2026-08-27T10:00:00.500Z')).toBe(true)
    expect(isTimestamp('2026-08-27T10:00:00-04:00')).toBe(false)
    expect(isTimestamp('2026-08-27T10:00:00')).toBe(false)
    expect(isTimestamp('2026-08-27')).toBe(false)
    expect(isTimestamp(1756288800000 as unknown)).toBe(false)
  })

  it('rejects syntactically valid but impossible instants', () => {
    expect(parseTimestamp('2026-13-01T00:00:00Z')).toBeNull()
    expect(parseTimestamp('2026-02-30T00:00:00Z')).toBeNull()
  })

  it('builds from Date and orders correctly', () => {
    const early = timestampFrom(new Date('2026-08-27T09:00:00Z'))
    const late = timestampFrom(new Date('2026-08-27T10:00:00Z'))
    expect(isAfter(late, early)).toBe(true)
    expect(isAfter(early, late)).toBe(false)
    expect(isAfter(early, early)).toBe(false)
  })

  it('treats expiry as inclusive — equal instants are already expired', () => {
    const t = asTimestamp('2026-08-27T10:00:00Z')
    expect(isExpiredAt(t, t)).toBe(true)
    expect(isExpiredAt(t, asTimestamp('2026-08-27T09:59:59Z'))).toBe(false)
    expect(isExpiredAt(t, asTimestamp('2026-08-27T10:00:01Z'))).toBe(true)
  })
})

describe('environment', () => {
  it('exposes exactly the four canonical environments', () => {
    expect([...TRADING_ENVIRONMENTS]).toEqual(['development', 'backtest', 'demo', 'live'])
  })

  it('never resolves missing or unknown input to live', () => {
    for (const bad of [undefined, null, '', 'LIVE', 'prod', 'production', 0, {}]) {
      expect(parseEnvironment(bad)).toBeNull()
    }
  })

  it('accepts only exact canonical spellings', () => {
    expect(parseEnvironment('live')).toBe('live')
    expect(parseEnvironment('demo')).toBe('demo')
    expect(isTradingEnvironment('Live')).toBe(false)
  })

  it('identifies live and broker-facing environments', () => {
    expect(isLive('live')).toBe(true)
    expect(isLive('demo')).toBe(false)
    expect(isBrokerFacing('demo')).toBe(true)
    expect(isBrokerFacing('live')).toBe(true)
    expect(isBrokerFacing('backtest')).toBe(false)
    expect(isBrokerFacing('development')).toBe(false)
  })

  it('requires exact agreement across a boundary', () => {
    expect(environmentsAgree('demo', 'demo')).toBe(true)
    expect(environmentsAgree('demo', 'live')).toBe(false)
    expect(environmentsAgree('backtest', 'demo')).toBe(false)
  })
})

describe('version references', () => {
  it('rejects moving aliases that would corrupt the historical record', () => {
    for (const alias of ['latest', 'LATEST', 'current', 'head', 'stable']) {
      expect(isVersionLabel(alias)).toBe(false)
      expect(parseVersionLabel(alias)).toBeNull()
    }
  })

  it('accepts concrete version labels', () => {
    expect(isVersionLabel('v1.0')).toBe(true)
    expect(isVersionLabel('v1.1-candidate-04')).toBe(true)
    expect(isVersionLabel('2026.08.27')).toBe(true)
  })

  it('refuses malformed labels', () => {
    expect(isVersionLabel('')).toBe(false)
    expect(isVersionLabel('-v1')).toBe(false)
    expect(isVersionLabel('v 1')).toBe(false)
    expect(isVersionLabel(1 as unknown)).toBe(false)
  })

  it('refuses to build a reference around a moving alias', () => {
    const sid = asId<'StrategyId'>('strategy-omnira-lm') as StrategyId
    const vid = asId<'StrategyVersionId'>('sv-1') as StrategyVersionId
    expect(strategyVersionRef(sid, vid, 'latest')).toBeNull()
    expect(strategyVersionRef(sid, vid, 'v1.0')).not.toBeNull()

    const rid = asId<'RiskProfileId'>('rp-1') as RiskProfileId
    expect(riskProfileRef(rid, 'current')).toBeNull()
    expect(riskProfileRef(rid, 'v1.0')).not.toBeNull()
  })

  it('compares strategy versions by id and label together', () => {
    const sid = asId<'StrategyId'>('s') as StrategyId
    const a = strategyVersionRef(sid, asId<'StrategyVersionId'>('sv-1') as StrategyVersionId, 'v1.0')!
    const b = strategyVersionRef(sid, asId<'StrategyVersionId'>('sv-1') as StrategyVersionId, 'v1.1')!
    expect(sameStrategyVersion(a, a)).toBe(true)
    expect(sameStrategyVersion(a, b)).toBe(false)
  })

  it('freezes references against later mutation', () => {
    const ref = strategyVersionRef(
      asId<'StrategyId'>('s') as StrategyId,
      asId<'StrategyVersionId'>('sv-1') as StrategyVersionId,
      'v1.0',
    )!
    expect(Object.isFrozen(ref)).toBe(true)
  })
})
