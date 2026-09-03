/**
 * GATE-08C-3A — the concrete-contract data window.
 *
 * Every instant and price here is an Omnira-owned fixture. Nothing is market
 * data, and no real contract calendar is consulted.
 */

import { describe, expect, it } from 'vitest'
import { asTimestamp, type Timestamp } from '../time'
import { contractCycle, resolvedContract } from '../contract-identity'
import {
  CANONICAL_OBSERVATION_TIMEFRAME,
  CONTRACT_WINDOW_PROBLEMS,
  buildContractDataWindow,
  buildHistoricalContractRequest,
} from './index'

const T = (raw: string): Timestamp => asTimestamp(raw)
const NQ = resolvedContract('NQ', contractCycle(2026, 3))
const FROM = T('2026-01-15T07:00:00Z')
const TO = T('2026-01-15T11:00:00Z')

describe('A/B. a window carries a resolved contract, never a bare root', () => {
  it('A. accepts a ResolvedContract', () => {
    const built = buildContractDataWindow({ contract: NQ, timeframe: '4H', from: FROM, to: TO })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.window.contract).toEqual({ root: 'NQ', cycle: { year: 2026, quarterMonth: 3 } })
    expect(built.window.timeframe).toBe('4H')
  })

  it('B. refuses a naked root', () => {
    /*
     * Canonical v1.0 §13: root resolution precedes every provider-facing
     * concrete-contract request. A bare instrument cannot satisfy the parser…
     */
    for (const bare of ['NQ', { root: 'NQ' }, { instrument: 'NQ' }, { root: 'NQ', cycle: null }]) {
      const built = buildContractDataWindow({ contract: bare, timeframe: '1m', from: FROM, to: TO })
      expect(built.ok, JSON.stringify(bare)).toBe(false)
      if (built.ok) continue
      expect(built.problem).toBe('UNRESOLVED_CONTRACT')
    }
    // …and an unsupported root is refused even with a well-formed cycle.
    const foreign = buildContractDataWindow({
      contract: { root: 'CL', cycle: { year: 2026, quarterMonth: 3 } },
      timeframe: '1m', from: FROM, to: TO,
    })
    expect(foreign.ok === false && foreign.problem).toBe('UNRESOLVED_CONTRACT')
  })

  it('refuses a non-canonical timeframe', () => {
    const built = buildContractDataWindow({ contract: NQ, timeframe: '1h', from: FROM, to: TO })
    expect(built.ok === false && built.problem).toBe('UNSUPPORTED_TIMEFRAME')
  })
})

describe('C/D/E. the interval is half-open and compared as instants', () => {
  it('C. refuses a zero-length window', () => {
    const built = buildContractDataWindow({ contract: NQ, timeframe: '1m', from: FROM, to: FROM })
    expect(built.ok === false && built.problem).toBe('EMPTY_INTERVAL')
  })

  it('D. refuses a backwards window', () => {
    const built = buildContractDataWindow({ contract: NQ, timeframe: '1m', from: TO, to: FROM })
    expect(built.ok === false && built.problem).toBe('EMPTY_INTERVAL')
  })

  it('E. orders by instant, where text ordering would be wrong', () => {
    /*
     * `Timestamp` permits an optional millisecond field, so '…00:00:00.500Z'
     * sorts BEFORE '…00:00:00Z' as text ('.' < 'Z') while being later in time.
     * A text comparison would accept the backwards window and reject the
     * forwards one — exactly inverted.
     */
    const bare = T('2026-01-15T07:00:00Z')
    const half = T('2026-01-15T07:00:00.500Z')

    const forwards = buildContractDataWindow({ contract: NQ, timeframe: '1m', from: bare, to: half })
    expect(forwards.ok).toBe(true)

    const backwards = buildContractDataWindow({ contract: NQ, timeframe: '1m', from: half, to: bare })
    expect(backwards.ok === false && backwards.problem).toBe('EMPTY_INTERVAL')

    // Equivalent spellings of one instant are a zero-length window.
    const equivalent = buildContractDataWindow({
      contract: NQ, timeframe: '1m', from: bare, to: T('2026-01-15T07:00:00.000Z'),
    })
    expect(equivalent.ok === false && equivalent.problem).toBe('EMPTY_INTERVAL')
  })

  it('refuses a malformed instant', () => {
    const built = buildContractDataWindow({ contract: NQ, timeframe: '1m', from: 'yesterday', to: TO })
    expect(built.ok === false && built.problem).toBe('MALFORMED_INSTANT')
  })
})

describe('F/G. the provider-facing request is the canonical base observation only', () => {
  it('F. accepts 1m', () => {
    const built = buildHistoricalContractRequest({ contract: NQ, timeframe: '1m', from: FROM, to: TO })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.request.timeframe).toBe(CANONICAL_OBSERVATION_TIMEFRAME)
    expect(built.request.timeframe).toBe('1m')
  })

  it('G. refuses every derived timeframe', () => {
    /*
     * §12: 5m, 15m and 4H are DERIVED from accepted 1m observations, and no
     * provider-native higher-timeframe bar becomes canonical strategy evidence.
     * A request that could fetch one would make that rule depend on every
     * future caller remembering it.
     */
    for (const timeframe of ['5m', '15m', '4H'] as const) {
      const built = buildHistoricalContractRequest({ contract: NQ, timeframe, from: FROM, to: TO })
      expect(built.ok, timeframe).toBe(false)
      if (built.ok) continue
      expect(built.problem).toBe('NOT_A_CANONICAL_OBSERVATION_TIMEFRAME')
    }
  })

  it('still requires a resolved contract and a real interval', () => {
    expect(
      buildHistoricalContractRequest({ contract: 'NQ', timeframe: '1m', from: FROM, to: TO }).ok,
    ).toBe(false)
    expect(
      buildHistoricalContractRequest({ contract: NQ, timeframe: '1m', from: TO, to: FROM }).ok,
    ).toBe(false)
  })
})

describe('the refusals are caller-contract validation, not journal codes', () => {
  it('names no canonical reason vocabulary', () => {
    expect([...CONTRACT_WINDOW_PROBLEMS]).toEqual([
      'UNRESOLVED_CONTRACT',
      'UNSUPPORTED_TIMEFRAME',
      'MALFORMED_INSTANT',
      'EMPTY_INTERVAL',
      'NOT_A_CANONICAL_OBSERVATION_TIMEFRAME',
    ])
  })

  it('X/Y. results are frozen and deterministic', () => {
    const first = buildContractDataWindow({ contract: NQ, timeframe: '4H', from: FROM, to: TO })
    const second = buildContractDataWindow({ contract: NQ, timeframe: '4H', from: FROM, to: TO })
    expect(second).toEqual(first)
    expect(Object.isFrozen(first)).toBe(true)
    expect(first.ok && Object.isFrozen(first.window)).toBe(true)
  })
})
