/**
 * The provider → replay mapping, field by field.
 *
 * These tests exist because every one of these mappings has a plausible wrong
 * version that would pass a casual review: UNKNOWN quietly becoming UNAVAILABLE,
 * a quantity going through `Number()`, an unknown side rendering as NEUTRAL. The
 * assertions below are written against the exact values where the wrong version
 * differs from the right one.
 */

import { describe, expect, it } from 'vitest'
import { parseDecimal } from '../decimal'
import { present, unavailable, unknown } from '../provider'
import {
  POSITION_SIDES,
  POSITION_STATES,
  type PositionSide,
  type PositionState,
} from '../provider'
import { parsePriceText } from '../market-view'
import {
  OBSERVED_POSITION_DIRECTIONS,
  OBSERVED_POSITION_STATES,
  parseQuantityText,
  type ObservationSource,
} from '../replay'
import { mapAvailable, normalizePositionSnapshots } from './normalization'
import { recordedDecimal } from './transcript'
import {
  ACCOUNT_BOUND,
  INSTRUMENT_MAPPINGS,
  OCCURRED_AT,
  PROVIDER_TIME,
  recordedMetadata,
  recordedPosition,
} from './recorded-fixture'

const SOURCE: ObservationSource = {
  providerLabel: 'Inspelad provider',
  accountLabel: 'Konto ••• 4471',
  origin: 'FIXTURE',
}

function contextFor(instrument: 'NQ' | 'ES' = 'NQ', positionIds: string[] = ['p1']) {
  return {
    accountId: ACCOUNT_BOUND,
    source: SOURCE,
    instrument,
    instrumentMappings: INSTRUMENT_MAPPINGS,
    replayMetadata: positionIds.map((id) => recordedMetadata({ positionId: id })),
  } as const
}

/** Normalize one authored position and return the single observation. */
function oneObservation(snapshot = recordedPosition({ positionId: 'p1' })) {
  const result = normalizePositionSnapshots([snapshot], contextFor())
  if (result.outcome !== 'NORMALIZED') throw new Error(`refused: ${result.refusal}`)
  expect(result.observations).toHaveLength(1)
  return result.observations[0]
}

// ─── Available<T> → ObservedValue<U> ──────────────────────────────────────────

describe('Available maps to ObservedValue exhaustively', () => {
  it('carries PRESENT with its mapped value', () => {
    expect(mapAvailable(present(2), (n) => n * 3)).toEqual({ state: 'PRESENT', value: 6 })
  })

  it('keeps UNAVAILABLE as UNAVAILABLE, not UNKNOWN', () => {
    expect(mapAvailable(unavailable<number>(), (n) => n)).toEqual({ state: 'UNAVAILABLE' })
  })

  it('keeps UNKNOWN as UNKNOWN, not UNAVAILABLE', () => {
    expect(mapAvailable(unknown<number>(), (n) => n)).toEqual({ state: 'UNKNOWN' })
  })

  it('never collapses a missing reading to a substitute value', () => {
    for (const missing of [unavailable<number>(), unknown<number>()]) {
      const mapped = mapAvailable(missing, (n) => n)
      expect(mapped).not.toHaveProperty('value')
      for (const substitute of [null, 0, false, '']) {
        expect(mapped).not.toEqual(substitute)
      }
      expect(Array.isArray(mapped)).toBe(false)
    }
  })

  it('runs the mapper only for PRESENT', () => {
    let calls = 0
    const count = (n: number) => { calls += 1; return n }
    mapAvailable(unavailable<number>(), count)
    mapAvailable(unknown<number>(), count)
    expect(calls).toBe(0)
    mapAvailable(present(1), count)
    expect(calls).toBe(1)
  })

  it('preserves the three states across every position field', () => {
    const observation = oneObservation(recordedPosition({
      positionId: 'p1',
      quantity: present(recordedDecimal('3')),
      unrealizedPnl: unavailable(),
      takeProfit: unknown(),
      openedAt: unknown(),
    }))
    expect(observation.position.quantity).toEqual({ state: 'PRESENT', value: '3' })
    expect(observation.position.unrealizedPnl).toEqual({ state: 'UNAVAILABLE' })
    expect(observation.position.takeProfit).toEqual({ state: 'UNKNOWN' })
    expect(observation.position.openedAt).toEqual({ state: 'UNKNOWN' })
  })
})

// ─── Decimal precision ────────────────────────────────────────────────────────

describe('Decimal maps losslessly, and the number path is never taken', () => {
  /*
   * The two values that break a JS number, verified against what `Number()`
   * would actually produce rather than against a remembered claim.
   */
  it('keeps a 17-digit quantity exactly', () => {
    const observation = oneObservation(recordedPosition({
      positionId: 'p1',
      quantity: present(recordedDecimal('99999999999999999')),
    }))
    expect(observation.position.quantity).toEqual({
      state: 'PRESENT',
      value: '99999999999999999',
    })
    // The value a number-based mapping would have produced.
    expect(String(Number('99999999999999999'))).toBe('100000000000000000')
    expect(observation.position.quantity).not.toEqual({
      state: 'PRESENT',
      value: '100000000000000000',
    })
  })

  it('keeps a 12-decimal quantity exactly, without exponent form', () => {
    const observation = oneObservation(recordedPosition({
      positionId: 'p1',
      quantity: present(recordedDecimal('0.000000000001')),
    }))
    expect(observation.position.quantity).toEqual({
      state: 'PRESENT',
      value: '0.000000000001',
    })
    expect(String(Number('0.000000000001'))).toBe('1e-12')
  })

  it('keeps a negative P/L exactly', () => {
    const observation = oneObservation(recordedPosition({
      positionId: 'p1',
      unrealizedPnl: present(recordedDecimal('-3.75')),
    }))
    expect(observation.position.unrealizedPnl).toEqual({ state: 'PRESENT', value: '-3.75' })
  })

  it('preserves trailing-zero scale rather than renormalizing it', () => {
    const observation = oneObservation(recordedPosition({
      positionId: 'p1',
      averageEntry: present(recordedDecimal('1.50')),
    }))
    expect(observation.position.averageEntry).toEqual({ state: 'PRESENT', value: '1.50' })
  })

  /*
   * The equivalence that justifies casting `Decimal.text` instead of re-parsing:
   * the text a Decimal carries IS what the branded parsers return for it.
   */
  it('agrees with the canonical branded parsers on every awkward value', () => {
    for (const text of ['1', '1.50', '0.000000000001', '99999999999999999', '-3.75', '0']) {
      const decimal = parseDecimal(text)
      expect(decimal, text).not.toBeNull()
      expect(parseQuantityText(decimal!.text), text).toBe(decimal!.text)
      expect(parsePriceText(decimal!.text), text).toBe(decimal!.text)
    }
  })

  it('round-trips a normalized quantity back through the canonical parser', () => {
    const observation = oneObservation(recordedPosition({
      positionId: 'p1',
      quantity: present(recordedDecimal('99999999999999999')),
    }))
    const value = observation.position.quantity
    expect(value.state).toBe('PRESENT')
    if (value.state === 'PRESENT') {
      expect(parseDecimal(value.value)?.text).toBe('99999999999999999')
    }
  })
})

// ─── Enumerations ─────────────────────────────────────────────────────────────

describe('direction and state map member for member', () => {
  it('maps every provider side to the same-named observed direction', () => {
    for (const side of POSITION_SIDES) {
      const observation = oneObservation(recordedPosition({ positionId: 'p1', side }))
      expect(observation.position.direction, side).toBe(side)
    }
  })

  it('never turns an unknown side into NEUTRAL', () => {
    const observation = oneObservation(recordedPosition({ positionId: 'p1', side: 'UNKNOWN' }))
    expect(observation.position.direction).toBe('UNKNOWN')
    expect(observation.position.direction as string).not.toBe('NEUTRAL')
    // NEUTRAL is not even in the observed vocabulary — it belongs to
    // `DisplayDirection`, which says something else entirely.
    expect(OBSERVED_POSITION_DIRECTIONS as readonly string[]).not.toContain('NEUTRAL')
  })

  it('maps every provider state to the same-named observed state', () => {
    for (const state of POSITION_STATES) {
      const observation = oneObservation(recordedPosition({ positionId: 'p1', state }))
      expect(observation.position.state, state).toBe(state)
    }
  })

  it('keeps the two vocabularies the same size without aliasing them', () => {
    const sides: readonly PositionSide[] = POSITION_SIDES
    const states: readonly PositionState[] = POSITION_STATES
    expect([...sides].sort()).toEqual([...OBSERVED_POSITION_DIRECTIONS].sort())
    expect([...states].sort()).toEqual([...OBSERVED_POSITION_STATES].sort())
    // Same members, but the arrays are distinct objects owned by two packages.
    expect(POSITION_SIDES as unknown).not.toBe(OBSERVED_POSITION_DIRECTIONS as unknown)
  })
})

// ─── Timestamps and provider provenance ───────────────────────────────────────

describe('timestamps', () => {
  it('takes occurredAt and lastObservedAt from the provider observation instant', () => {
    const observation = oneObservation()
    expect(observation.occurredAt).toBe(OCCURRED_AT)
    expect(observation.position.lastObservedAt).toBe(OCCURRED_AT)
  })

  it('takes recordedAt from authored metadata, never from occurredAt', () => {
    const result = normalizePositionSnapshots(
      [recordedPosition({ positionId: 'p1' })],
      {
        ...contextFor(),
        replayMetadata: [recordedMetadata({
          positionId: 'p1',
          recordedAt: '2026-03-02T14:30:09.000Z' as never,
        })],
      },
    )
    if (result.outcome !== 'NORMALIZED') throw new Error('refused')
    expect(result.observations[0].recordedAt).toBe('2026-03-02T14:30:09.000Z')
    expect(result.observations[0].recordedAt).not.toBe(result.observations[0].occurredAt)
  })

  /**
   * `ProviderTimestamp` is provider-owned provenance with no replay destination.
   * The omission is deliberate, so it is pinned rather than left to be noticed.
   */
  it('does not propagate ProviderTimestamp anywhere into replay', () => {
    const observation = oneObservation(recordedPosition({
      positionId: 'p1',
      providerTime: present(PROVIDER_TIME),
    }))
    const serialized = JSON.stringify(observation)
    expect(serialized).not.toContain(PROVIDER_TIME)
    expect(observation.position).not.toHaveProperty('providerTime')
    expect(observation).not.toHaveProperty('providerTime')
    // And it is definitely not standing in for either replay instant.
    expect(observation.recordedAt as string).not.toBe(PROVIDER_TIME as string)
    expect(observation.occurredAt as string).not.toBe(PROVIDER_TIME as string)
  })
})

// ─── Metadata is carried, never invented ──────────────────────────────────────

describe('replay metadata is carried verbatim', () => {
  it('takes kind, freshness, unattributed, note and summary from metadata', () => {
    const result = normalizePositionSnapshots(
      [recordedPosition({ positionId: 'p1' })],
      {
        ...contextFor(),
        replayMetadata: [recordedMetadata({
          positionId: 'p1',
          kind: 'CLOSED',
          freshness: 'STALE',
          unattributed: false,
          note: null,
          summary: 'Stängd position.',
        })],
      },
    )
    if (result.outcome !== 'NORMALIZED') throw new Error('refused')
    const observation = result.observations[0]
    expect(observation.kind).toBe('CLOSED')
    expect(observation.position.freshness).toBe('STALE')
    expect(observation.position.unattributed).toBe(false)
    expect(observation.position.note).toBeNull()
    expect(observation.summary).toBe('Stängd position.')
  })

  it('stamps the source provenance handed to it', () => {
    expect(oneObservation().position.source).toEqual(SOURCE)
  })

  it('widens the provider position id into replay string identity', () => {
    expect(oneObservation().position.positionId).toBe('p1')
  })
})

// ─── Purity ───────────────────────────────────────────────────────────────────

describe('normalization is pure', () => {
  it('returns deeply equal results for repeated identical calls', () => {
    const snapshots = [recordedPosition({ positionId: 'p1' })]
    const first = normalizePositionSnapshots(snapshots, contextFor())
    const second = normalizePositionSnapshots(snapshots, contextFor())
    expect(second).toEqual(first)
  })

  it('does not mutate the snapshots it is given', () => {
    const snapshots = [recordedPosition({ positionId: 'p1' })]
    // `structuredClone`, not JSON: a Decimal holds a bigint, which
    // `JSON.stringify` throws on — the same reason replay carries exact values
    // as text rather than as Decimal across a serialization boundary.
    const before = structuredClone(snapshots)
    normalizePositionSnapshots(snapshots, contextFor())
    expect(snapshots).toEqual(before)
  })

  it('is unaffected by how many times it has run before', () => {
    const snapshots = [recordedPosition({ positionId: 'p1' })]
    const first = normalizePositionSnapshots(snapshots, contextFor())
    for (let i = 0; i < 5; i += 1) normalizePositionSnapshots(snapshots, contextFor())
    expect(normalizePositionSnapshots(snapshots, contextFor())).toEqual(first)
  })
})
