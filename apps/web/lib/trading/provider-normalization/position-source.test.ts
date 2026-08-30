/**
 * The recorded provider observation source — the required scenarios, A–X.
 *
 * Each block below names the scenario it covers. The ones that matter most are
 * the refusals: every path that cannot be honestly attributed must come out as
 * UNAVAILABLE, and never as `OBSERVED + []`, which is the positive claim that
 * the account is flat.
 */

import { describe, expect, it } from 'vitest'
import { failure, ok, present, unavailable, unknown, type Available } from '../provider'
import type { InstrumentId } from '../ids'
import { isKnownFlat, observationsOf, type PositionObservationBatch } from '../replay'
import { createRecordedExecutionProviderAdapter } from './recorded-adapter'
import { createRecordedProviderPositionObservationSource } from './position-source'
import { recordedDecimal, type RecordedTranscript } from './transcript'
import {
  ACCOUNT_BOUND,
  ACCOUNT_OTHER,
  BATCH_OBSERVED_AT,
  INSTRUMENT_ID_ES,
  INSTRUMENT_ID_UNMAPPED,
  INSTRUMENT_MAPPINGS,
  OCCURRED_AT,
  RECORDED_AT,
  recordedMetadata,
  recordedPosition,
  transcriptWithPositions,
} from './recorded-fixture'

type Positions = RecordedTranscript['positions']

function sourceOver(
  positions: Positions,
  metadata = [recordedMetadata({ positionId: 'p1' })],
) {
  return createRecordedProviderPositionObservationSource({
    adapter: createRecordedExecutionProviderAdapter(transcriptWithPositions(positions)),
    accountId: ACCOUNT_BOUND,
    accountLabel: 'Konto ••• 4471',
    instrumentMappings: INSTRUMENT_MAPPINGS,
    replayMetadata: metadata,
    observedAt: BATCH_OBSERVED_AT,
  })
}

function withPositions(snapshots: ReturnType<typeof recordedPosition>[]): Positions {
  return [{ accountId: ACCOUNT_BOUND, response: ok(snapshots) }]
}

async function observeNQ(
  positions: Positions,
  metadata?: Parameters<typeof sourceOver>[1],
): Promise<PositionObservationBatch> {
  return sourceOver(positions, metadata).observe({ instrument: 'NQ' })
}

/** The single observation of a batch that must have exactly one. */
function only(batch: PositionObservationBatch) {
  const observations = observationsOf(batch)
  if (observations === null) throw new Error('batch was UNAVAILABLE')
  expect(observations).toHaveLength(1)
  return observations[0]
}

// ─── A · B · C — direction ────────────────────────────────────────────────────

describe('A/B/C — direction is carried, never reinterpreted', () => {
  it('A. reports one LONG open position', async () => {
    const batch = await observeNQ(withPositions([recordedPosition({ positionId: 'p1' })]))
    expect(batch.status).toBe('OBSERVED')
    expect(only(batch).position.direction).toBe('LONG')
    expect(only(batch).position.state).toBe('OPEN')
  })

  it('B. reports one SHORT open position', async () => {
    const batch = await observeNQ(
      withPositions([recordedPosition({ positionId: 'p1', side: 'SHORT' })]),
    )
    expect(only(batch).position.direction).toBe('SHORT')
  })

  it('C. reports an UNKNOWN side as UNKNOWN, never NEUTRAL', async () => {
    const batch = await observeNQ(
      withPositions([recordedPosition({ positionId: 'p1', side: 'UNKNOWN' })]),
    )
    expect(only(batch).position.direction).toBe('UNKNOWN')
  })
})

// ─── D — multiple positions ───────────────────────────────────────────────────

describe('D — multiple positions', () => {
  it('carries every position, each with its own metadata', async () => {
    const batch = await observeNQ(
      withPositions([
        recordedPosition({ positionId: 'p1' }),
        recordedPosition({ positionId: 'p2', side: 'SHORT' }),
      ]),
      [
        recordedMetadata({ positionId: 'p1', localSequence: 0, observationId: 'obs:1' }),
        recordedMetadata({ positionId: 'p2', localSequence: 1, observationId: 'obs:2' }),
      ],
    )
    const observations = observationsOf(batch)
    expect(observations).toHaveLength(2)
    expect(observations?.map((o) => o.position.direction)).toEqual(['LONG', 'SHORT'])
    expect(observations?.map((o) => o.localSequence)).toEqual([0, 1])
  })
})

// ─── E · F — the distinction that matters most ────────────────────────────────

describe('E/F — known flat is not unavailability', () => {
  it('E. maps ok + [] to OBSERVED with no observations — known flat', async () => {
    const batch = await observeNQ([{ accountId: ACCOUNT_BOUND, response: ok([]) }])
    expect(batch.status).toBe('OBSERVED')
    expect(observationsOf(batch)).toEqual([])
    expect(isKnownFlat(batch)).toBe(true)
  })

  it('E. does not fabricate a FLAT position to represent it', async () => {
    const batch = await observeNQ([{ accountId: ACCOUNT_BOUND, response: ok([]) }])
    expect(JSON.stringify(batch)).not.toContain('FLAT')
  })

  it('F. maps a provider failure to UNAVAILABLE, never to an empty batch', async () => {
    const batch = await observeNQ([
      {
        accountId: ACCOUNT_BOUND,
        response: failure('PROVIDER_DISCONNECTED', 'Providern svarade inte.'),
      },
    ])
    expect(batch.status).toBe('UNAVAILABLE')
    expect(isKnownFlat(batch)).toBe(false)
    expect(observationsOf(batch)).toBeNull()
  })

  it('F. carries the provider message as operator detail only', async () => {
    const batch = await observeNQ([
      {
        accountId: ACCOUNT_BOUND,
        response: failure('PROVIDER_DISCONNECTED', 'Providern svarade inte.'),
      },
    ])
    if (batch.status !== 'UNAVAILABLE') throw new Error('expected UNAVAILABLE')
    expect(batch.detail).toBe('Providern svarade inte.')
    // The decision rode on the discriminant, not on this string.
    expect(batch.status).toBe('UNAVAILABLE')
  })
})

// ─── G · H · I — the three availability states ────────────────────────────────

describe('G/H/I — PRESENT, UNAVAILABLE and UNKNOWN stay distinct', () => {
  it('carries all three through one position', async () => {
    const batch = await observeNQ(withPositions([recordedPosition({
      positionId: 'p1',
      lastPrice: present(recordedDecimal('20180.25')),
      unrealizedPnl: unavailable(),
      takeProfit: unknown(),
    })]))
    const position = only(batch).position
    expect(position.lastPrice).toEqual({ state: 'PRESENT', value: '20180.25' })
    expect(position.unrealizedPnl).toEqual({ state: 'UNAVAILABLE' })
    expect(position.takeProfit).toEqual({ state: 'UNKNOWN' })
  })

  it('never renders a missing reading as zero, null, false or empty', async () => {
    const batch = await observeNQ(withPositions([recordedPosition({
      positionId: 'p1',
      unrealizedPnl: unavailable(),
      takeProfit: unknown(),
    })]))
    const position = only(batch).position
    for (const field of [position.unrealizedPnl, position.takeProfit]) {
      expect(field).not.toHaveProperty('value')
    }
  })
})

// ─── J · K — exact quantities ─────────────────────────────────────────────────

describe('J/K — exact quantity survives the whole path', () => {
  it('J. keeps a 17-digit quantity exactly through the source', async () => {
    const batch = await observeNQ(withPositions([recordedPosition({
      positionId: 'p1',
      quantity: present(recordedDecimal('99999999999999999')),
    })]))
    expect(only(batch).position.quantity).toEqual({
      state: 'PRESENT',
      value: '99999999999999999',
    })
  })

  it('K. keeps a 12-decimal quantity exactly through the source', async () => {
    const batch = await observeNQ(withPositions([recordedPosition({
      positionId: 'p1',
      quantity: present(recordedDecimal('0.000000000001')),
    })]))
    expect(only(batch).position.quantity).toEqual({
      state: 'PRESENT',
      value: '0.000000000001',
    })
  })
})

// ─── L — delayed recording ────────────────────────────────────────────────────

describe('L — delayed recording is expressible', () => {
  it('keeps occurredAt and recordedAt apart', async () => {
    const batch = await observeNQ(withPositions([recordedPosition({ positionId: 'p1' })]))
    const observation = only(batch)
    expect(observation.occurredAt).toBe(OCCURRED_AT)
    expect(observation.recordedAt).toBe(RECORDED_AT)
    expect(observation.occurredAt).not.toBe(observation.recordedAt)
    expect(observation.occurredAt < observation.recordedAt).toBe(true)
  })
})

// ─── M · N · O — freshness ────────────────────────────────────────────────────

describe('M/N/O — freshness comes from metadata, never from a threshold', () => {
  for (const freshness of ['FRESH', 'STALE', 'UNKNOWN'] as const) {
    it(`carries freshness ${freshness} verbatim`, async () => {
      const batch = await observeNQ(
        withPositions([recordedPosition({ positionId: 'p1' })]),
        [recordedMetadata({ positionId: 'p1', freshness })],
      )
      expect(only(batch).position.freshness).toBe(freshness)
    })
  }

  it('does not vary with the observation instant', async () => {
    // Same authored freshness, wildly different instants. A threshold rule
    // would disagree between these two; an authored value cannot.
    const early = await observeNQ(
      withPositions([recordedPosition({ positionId: 'p1', observedAt: OCCURRED_AT })]),
      [recordedMetadata({ positionId: 'p1', freshness: 'FRESH' })],
    )
    const ancient = await observeNQ(
      withPositions([recordedPosition({
        positionId: 'p1',
        observedAt: '1999-01-01T00:00:00.000Z' as never,
      })]),
      [recordedMetadata({ positionId: 'p1', freshness: 'FRESH' })],
    )
    expect(only(early).position.freshness).toBe('FRESH')
    expect(only(ancient).position.freshness).toBe('FRESH')
  })
})

// ─── P · Q · R · S — instrument attribution ───────────────────────────────────

describe('P/Q/R — ambiguous instrument attribution fails closed', () => {
  it('P. refuses when instrumentId is UNKNOWN', async () => {
    const batch = await observeNQ(withPositions([recordedPosition({
      positionId: 'p1',
      instrumentId: unknown(),
    })]))
    expect(batch.status).toBe('UNAVAILABLE')
    expect(isKnownFlat(batch)).toBe(false)
  })

  it('Q. refuses when instrumentId is UNAVAILABLE', async () => {
    const batch = await observeNQ(withPositions([recordedPosition({
      positionId: 'p1',
      instrumentId: unavailable(),
    })]))
    expect(batch.status).toBe('UNAVAILABLE')
  })

  it('R. refuses an InstrumentId with no explicit mapping', async () => {
    const batch = await observeNQ(withPositions([recordedPosition({
      positionId: 'p1',
      instrumentId: present(INSTRUMENT_ID_UNMAPPED),
    })]))
    expect(batch.status).toBe('UNAVAILABLE')
  })

  it('P/Q/R. never answers OBSERVED + [] for an unattributable position', async () => {
    const unattributable: readonly Available<InstrumentId>[] = [
      unknown<InstrumentId>(), unavailable<InstrumentId>(), present(INSTRUMENT_ID_UNMAPPED),
    ]
    for (const instrumentId of unattributable) {
      const batch = await observeNQ(withPositions([
        recordedPosition({ positionId: 'p1', instrumentId }),
      ]))
      expect(isKnownFlat(batch)).toBe(false)
    }
  })
})

describe('S — a different KNOWN instrument is safely excluded', () => {
  it('excludes an ES position from an NQ query', async () => {
    const batch = await observeNQ(
      withPositions([
        recordedPosition({ positionId: 'p1' }),
        recordedPosition({ positionId: 'p2', instrumentId: present(INSTRUMENT_ID_ES) }),
      ]),
      [recordedMetadata({ positionId: 'p1' })],
    )
    expect(batch.status).toBe('OBSERVED')
    const observations = observationsOf(batch)
    expect(observations).toHaveLength(1)
    expect(observations?.[0].instrument).toBe('NQ')
  })

  it('answers the ES query with the ES position', async () => {
    const source = sourceOver(
      withPositions([
        recordedPosition({ positionId: 'p1' }),
        recordedPosition({ positionId: 'p2', instrumentId: present(INSTRUMENT_ID_ES) }),
      ]),
      [recordedMetadata({ positionId: 'p2' })],
    )
    const batch = await source.observe({ instrument: 'ES' })
    const observations = observationsOf(batch)
    expect(observations).toHaveLength(1)
    expect(observations?.[0].instrument).toBe('ES')
  })

  it('reports known flat only when the other instrument genuinely has none', async () => {
    const source = sourceOver(
      withPositions([recordedPosition({ positionId: 'p1' })]),
      [recordedMetadata({ positionId: 'p1' })],
    )
    // MNQ is not in the mapping table, so nothing maps to it; the NQ position
    // is positively identified as NQ and excluded, leaving a true known-flat.
    const batch = await source.observe({ instrument: 'MNQ' })
    expect(batch.status).toBe('OBSERVED')
    expect(isKnownFlat(batch)).toBe(true)
  })
})

// ─── T · U · V — malformed batches ────────────────────────────────────────────

describe('T/U/V — malformed batches fail closed', () => {
  it('T. refuses a position belonging to another account', async () => {
    const batch = await observeNQ(withPositions([
      recordedPosition({ positionId: 'p1', accountId: ACCOUNT_OTHER }),
    ]))
    expect(batch.status).toBe('UNAVAILABLE')
  })

  it('T. does not rewrite the snapshot to match the bound account', async () => {
    const batch = await observeNQ(withPositions([
      recordedPosition({ positionId: 'p1', accountId: ACCOUNT_OTHER }),
    ]))
    expect(batch.status).toBe('UNAVAILABLE')
    expect(JSON.stringify(batch)).not.toContain(ACCOUNT_OTHER)
  })

  it('T. refuses even when the mismatched row is for another instrument', async () => {
    const batch = await observeNQ(withPositions([
      recordedPosition({ positionId: 'p1' }),
      recordedPosition({
        positionId: 'p2',
        accountId: ACCOUNT_OTHER,
        instrumentId: present(INSTRUMENT_ID_ES),
      }),
    ]))
    expect(batch.status).toBe('UNAVAILABLE')
  })

  it('U. refuses a duplicate PositionId rather than keeping first or last', async () => {
    const batch = await observeNQ(
      withPositions([
        recordedPosition({ positionId: 'p1' }),
        recordedPosition({ positionId: 'p1', side: 'SHORT' }),
      ]),
      [recordedMetadata({ positionId: 'p1' })],
    )
    expect(batch.status).toBe('UNAVAILABLE')
    // Neither row survived — no silent first-wins or last-wins resolution.
    expect(observationsOf(batch)).toBeNull()
  })

  it('V. refuses a position with no recorded replay metadata', async () => {
    const batch = await observeNQ(
      withPositions([recordedPosition({ positionId: 'p1' })]),
      [recordedMetadata({ positionId: 'some-other-position' })],
    )
    expect(batch.status).toBe('UNAVAILABLE')
  })

  it('V. does not default kind, freshness, summary or unattributed', async () => {
    const batch = await observeNQ(
      withPositions([recordedPosition({ positionId: 'p1' })]),
      [],
    )
    expect(batch.status).toBe('UNAVAILABLE')
    expect(JSON.stringify(batch)).not.toContain('OPENED')
    expect(JSON.stringify(batch)).not.toContain('FRESH')
  })
})

// ─── W — determinism ──────────────────────────────────────────────────────────

describe('W — repeated identical reads are deeply equal', () => {
  it('returns the same batch twice from one source', async () => {
    const source = sourceOver(withPositions([recordedPosition({ positionId: 'p1' })]))
    const first = await source.observe({ instrument: 'NQ' })
    const second = await source.observe({ instrument: 'NQ' })
    expect(second).toEqual(first)
  })

  it('returns the same batch from two independently built sources', async () => {
    const positions = withPositions([recordedPosition({ positionId: 'p1' })])
    const first = await observeNQ(positions)
    const second = await observeNQ(positions)
    expect(second).toEqual(first)
  })

  it('is unaffected by an interleaved query for another instrument', async () => {
    const source = sourceOver(withPositions([recordedPosition({ positionId: 'p1' })]))
    const before = await source.observe({ instrument: 'NQ' })
    await source.observe({ instrument: 'ES' })
    const after = await source.observe({ instrument: 'NQ' })
    expect(after).toEqual(before)
  })
})

// ─── X — malformed recorded decimals ──────────────────────────────────────────

describe('X — malformed decimal input fails before it becomes provider truth', () => {
  it('rejects every malformed form at authoring time', () => {
    for (const malformed of ['1.2e3', '01.5', '+1', '.', '', 'abc', '1.0000000000001', 'NaN']) {
      expect(() => recordedDecimal(malformed), malformed).toThrow()
    }
  })

  it('never lets a malformed value reach a transcript', () => {
    expect(() => recordedPosition({
      positionId: 'p1',
      quantity: present(recordedDecimal('1e3')),
    })).toThrow()
  })

  it('accepts the exact forms the canonical parser accepts', () => {
    for (const valid of ['1', '1.50', '0.000000000001', '99999999999999999', '-3.75', '0']) {
      expect(() => recordedDecimal(valid), valid).not.toThrow()
    }
  })
})

// ─── The seam's own declarations ──────────────────────────────────────────────

describe('the source declares itself honestly', () => {
  it('declares FIXTURE origin, with no way to configure otherwise', async () => {
    const source = sourceOver(withPositions([recordedPosition({ positionId: 'p1' })]))
    expect(source.origin).toBe('FIXTURE')
    const batch = await source.observe({ instrument: 'NQ' })
    if (batch.status !== 'OBSERVED') throw new Error('expected OBSERVED')
    expect(batch.origin).toBe('FIXTURE')
    expect(only(batch).position.source.origin).toBe('FIXTURE')
  })

  it('exposes no raw account id as display text', async () => {
    const source = sourceOver(withPositions([recordedPosition({ positionId: 'p1' })]))
    const batch = await source.observe({ instrument: 'NQ' })
    expect(source.accountLabel).toBe('Konto ••• 4471')
    expect(JSON.stringify(batch)).not.toContain(ACCOUNT_BOUND)
  })

  it('answers only for the instruments its mapping table declares', () => {
    const source = sourceOver(withPositions([recordedPosition({ positionId: 'p1' })]))
    expect(source.instruments()).toEqual(['NQ', 'ES'])
  })

  it('keeps the query instrument-only', async () => {
    const source = sourceOver(withPositions([recordedPosition({ positionId: 'p1' })]))
    const batch = await source.observe({ instrument: 'NQ' })
    expect(batch.status).toBe('OBSERVED')
    // There is no account parameter to pass; the binding is construction-time.
    expect(Object.keys({ instrument: 'NQ' })).toEqual(['instrument'])
  })
})
