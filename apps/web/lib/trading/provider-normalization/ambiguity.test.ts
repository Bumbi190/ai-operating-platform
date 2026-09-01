/**
 * AUTHORED AMBIGUITY FAILS CLOSED — array order never decides truth.
 *
 * Every keyed lookup in this package resolves a logical key to exactly one
 * authored answer. Two answers competing for one key is malformed input, and
 * the three tempting resolutions are all wrong in the same way:
 *
 *     keep first   — array order decides what a provider is deemed to have said
 *     keep last    — the same defect, written backwards
 *     merge        — invents a third answer nobody recorded
 *
 * So each case below is asserted twice: once in the authored order and once
 * with the array REVERSED. Both must reach the same fail-closed outcome. That
 * is strictly stronger than checking one ordering, which a first-match
 * implementation would also pass half the time.
 *
 * These refusals are package-local vocabulary. No Core `ReasonCode` was added
 * for them, and `reason-codes.ts` is untouched.
 */

import { describe, expect, it } from 'vitest'
import { failure, ok, present } from '../provider'
import { observationsOf, type PositionObservationBatch } from '../replay'
import { createRecordedExecutionProviderAdapter } from './recorded-adapter'
import { createRecordedProviderPositionObservationSource } from './position-source'
import {
  NORMALIZATION_REFUSALS,
  normalizePositionSnapshots,
  type PositionBatchNormalization,
} from './normalization'
import { lookupUnique, type InstrumentMappingEntry, type RecordedTranscript } from './transcript'
import {
  ACCOUNT_BOUND,
  BATCH_OBSERVED_AT,
  CONTRACT_NQ,
  INSTRUMENT_ID_ES,
  INSTRUMENT_ID_NQ,
  INSTRUMENT_MAPPINGS,
  OCCURRED_AT,
  recordedMetadata,
  recordedPosition,
  transcriptWithPositions,
} from './recorded-fixture'

const SOURCE = { providerLabel: 'p', accountLabel: null, origin: 'FIXTURE' } as const

/** Run an assertion against an array and against its reverse. */
function bothOrders<T>(entries: readonly T[], assert: (order: readonly T[], label: string) => void) {
  assert(entries, 'authored order')
  assert([...entries].reverse(), 'reversed order')
}

function refusalOf(result: PositionBatchNormalization): string {
  return result.outcome === 'REFUSED' ? result.refusal : `NORMALIZED(${result.observations.length})`
}

// ─── The primitive that makes it order-independent ────────────────────────────

describe('lookupUnique scans the whole array', () => {
  it('reports NONE, ONE and AMBIGUOUS by content, not by position', () => {
    const entries = [{ k: 'a', v: 1 }, { k: 'b', v: 2 }, { k: 'a', v: 3 }]
    expect(lookupUnique(entries, (e) => e.k === 'z')).toEqual({ kind: 'NONE' })
    expect(lookupUnique(entries, (e) => e.k === 'b')).toEqual({ kind: 'ONE', entry: { k: 'b', v: 2 } })
    expect(lookupUnique(entries, (e) => e.k === 'a')).toEqual({ kind: 'AMBIGUOUS', count: 2 })
  })

  it('gives the same verdict for the reversed array', () => {
    const entries = [{ k: 'a', v: 1 }, { k: 'b', v: 2 }, { k: 'a', v: 3 }]
    const reversed = [...entries].reverse()
    expect(lookupUnique(reversed, (e) => e.k === 'a')).toEqual({ kind: 'AMBIGUOUS', count: 2 })
    expect(lookupUnique(reversed, (e) => e.k === 'b').kind).toBe('ONE')
  })
})

// ─── A. one InstrumentId, two competing mappings ──────────────────────────────

describe('A — a duplicated InstrumentId refuses, in either order', () => {
  const competing: readonly InstrumentMappingEntry[] = [
    { instrumentId: INSTRUMENT_ID_NQ, instrument: 'NQ' },
    { instrumentId: INSTRUMENT_ID_NQ, instrument: 'ES' },
  ]

  function normalize(mappings: readonly InstrumentMappingEntry[], asked: 'NQ' | 'ES' | 'MNQ') {
    return normalizePositionSnapshots([recordedPosition({ positionId: 'p1' })], {
      accountId: ACCOUNT_BOUND,
      source: SOURCE,
      instrument: asked,
      instrumentMappings: mappings,
      replayMetadata: [recordedMetadata({ positionId: 'p1' })],
    })
  }

  it('refuses rather than choosing whichever was authored first', () => {
    bothOrders(competing, (order, label) => {
      expect(refusalOf(normalize(order, 'NQ')), label).toBe('AMBIGUOUS_INSTRUMENT_MAPPING')
    })
  })

  it('refuses for the OTHER competing instrument too', () => {
    bothOrders(competing, (order, label) => {
      expect(refusalOf(normalize(order, 'ES')), label).toBe('AMBIGUOUS_INSTRUMENT_MAPPING')
    })
  })

  it('refuses even when the query is for an unrelated instrument', () => {
    // A malformed table is malformed regardless of which question is asked.
    bothOrders(competing, (order, label) => {
      expect(refusalOf(normalize(order, 'MNQ')), label).toBe('AMBIGUOUS_INSTRUMENT_MAPPING')
    })
  })

  it('treats an IDENTICAL duplicate as malformed too', () => {
    const identical: readonly InstrumentMappingEntry[] = [
      { instrumentId: INSTRUMENT_ID_NQ, instrument: 'NQ' },
      { instrumentId: INSTRUMENT_ID_NQ, instrument: 'NQ' },
    ]
    bothOrders(identical, (order, label) => {
      expect(refusalOf(normalize(order, 'NQ')), label).toBe('AMBIGUOUS_INSTRUMENT_MAPPING')
    })
  })

  it('still accepts a well-formed table with several distinct keys', () => {
    bothOrders(INSTRUMENT_MAPPINGS, (order, label) => {
      const result = normalize(order, 'NQ')
      expect(result.outcome, label).toBe('NORMALIZED')
      if (result.outcome === 'NORMALIZED') expect(result.observations, label).toHaveLength(1)
    })
  })

  it('never answers a duplicated mapping with known-flat', async () => {
    for (const order of [competing, [...competing].reverse()]) {
      const source = createRecordedProviderPositionObservationSource({
        adapter: createRecordedExecutionProviderAdapter(transcriptWithPositions(
          [{ accountId: ACCOUNT_BOUND, response: ok([recordedPosition({ positionId: 'p1' })]) }],
        )),
        accountId: ACCOUNT_BOUND,
        accountLabel: null,
        instrumentMappings: order,
        replayMetadata: [recordedMetadata({ positionId: 'p1' })],
        observedAt: BATCH_OBSERVED_AT,
      })
      const batch = await source.observe({ instrument: 'NQ' })
      expect(batch.status).toBe('UNAVAILABLE')
      expect(observationsOf(batch)).toBeNull()
    }
  })
})

// ─── B. one PositionId, two replay metadata entries ───────────────────────────

describe('B — duplicated replay metadata refuses, in either order', () => {
  const competing = [
    recordedMetadata({ positionId: 'p1', kind: 'OPENED', summary: 'first' }),
    recordedMetadata({ positionId: 'p1', kind: 'CLOSED', summary: 'second' }),
  ]

  function normalize(metadata: typeof competing) {
    return normalizePositionSnapshots([recordedPosition({ positionId: 'p1' })], {
      accountId: ACCOUNT_BOUND,
      source: SOURCE,
      instrument: 'NQ',
      instrumentMappings: INSTRUMENT_MAPPINGS,
      replayMetadata: metadata,
    })
  }

  it('refuses rather than keeping first or last', () => {
    bothOrders(competing, (order, label) => {
      const result = normalize([...order])
      expect(refusalOf(result), label).toBe('AMBIGUOUS_REPLAY_METADATA')
      // Neither authored summary survived.
      expect(JSON.stringify(result), label).not.toContain('"first"')
      expect(JSON.stringify(result), label).not.toContain('"second"')
    })
  })

  it('treats an identical duplicate as malformed too', () => {
    const identical = [
      recordedMetadata({ positionId: 'p1', summary: 'same' }),
      recordedMetadata({ positionId: 'p1', summary: 'same' }),
    ]
    bothOrders(identical, (order, label) => {
      expect(refusalOf(normalize([...order])), label).toBe('AMBIGUOUS_REPLAY_METADATA')
    })
  })

  it('is a different refusal from metadata being absent', () => {
    const absent = normalizePositionSnapshots([recordedPosition({ positionId: 'p1' })], {
      accountId: ACCOUNT_BOUND,
      source: SOURCE,
      instrument: 'NQ',
      instrumentMappings: INSTRUMENT_MAPPINGS,
      replayMetadata: [],
    })
    expect(refusalOf(absent)).toBe('REPLAY_METADATA_MISSING')
    expect(refusalOf(normalize(competing))).toBe('AMBIGUOUS_REPLAY_METADATA')
  })

  it('surfaces as UNAVAILABLE at the source, never as known-flat', async () => {
    for (const order of [competing, [...competing].reverse()]) {
      const source = createRecordedProviderPositionObservationSource({
        adapter: createRecordedExecutionProviderAdapter(transcriptWithPositions(
          [{ accountId: ACCOUNT_BOUND, response: ok([recordedPosition({ positionId: 'p1' })]) }],
        )),
        accountId: ACCOUNT_BOUND,
        accountLabel: null,
        instrumentMappings: INSTRUMENT_MAPPINGS,
        replayMetadata: [...order],
        observedAt: BATCH_OBSERVED_AT,
      })
      const batch: PositionObservationBatch = await source.observe({ instrument: 'NQ' })
      expect(batch.status).toBe('UNAVAILABLE')
    }
  })
})

// ─── C. one AccountId, two competing recorded position responses ──────────────

describe('C — a duplicated account recording refuses, in either order', () => {
  const competing: RecordedTranscript['positions'] = [
    { accountId: ACCOUNT_BOUND, response: ok([recordedPosition({ positionId: 'p1' })]) },
    { accountId: ACCOUNT_BOUND, response: failure('PROVIDER_DISCONNECTED', 'nej') },
  ]

  it('returns REFERENCE_MISMATCH from the adapter, in either order', async () => {
    for (const order of [competing, [...competing].reverse()]) {
      const result = await createRecordedExecutionProviderAdapter(transcriptWithPositions(order))
        .getPositions(ACCOUNT_BOUND)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.reasonCode).toBe('REFERENCE_MISMATCH')
        expect(result.error.message).toContain('tvetydig')
      }
    }
  })

  it('never resolves to the successful recording', async () => {
    for (const order of [competing, [...competing].reverse()]) {
      const result = await createRecordedExecutionProviderAdapter(transcriptWithPositions(order))
        .getPositions(ACCOUNT_BOUND)
      expect(result.ok).toBe(false)
    }
  })

  it('surfaces as UNAVAILABLE at the source, in either order', async () => {
    for (const order of [competing, [...competing].reverse()]) {
      const source = createRecordedProviderPositionObservationSource({
        adapter: createRecordedExecutionProviderAdapter(transcriptWithPositions(order)),
        accountId: ACCOUNT_BOUND,
        accountLabel: null,
        instrumentMappings: INSTRUMENT_MAPPINGS,
        replayMetadata: [recordedMetadata({ positionId: 'p1' })],
        observedAt: BATCH_OBSERVED_AT,
      })
      const batch = await source.observe({ instrument: 'NQ' })
      expect(batch.status).toBe('UNAVAILABLE')
      expect(observationsOf(batch)).toBeNull()
    }
  })

  it('two identical successful recordings are still ambiguous', async () => {
    const identical: RecordedTranscript['positions'] = [
      { accountId: ACCOUNT_BOUND, response: ok([]) },
      { accountId: ACCOUNT_BOUND, response: ok([]) },
    ]
    const result = await createRecordedExecutionProviderAdapter(transcriptWithPositions(identical))
      .getPositions(ACCOUNT_BOUND)
    expect(result.ok).toBe(false)
  })
})

// ─── D. one ContractId, two competing recorded snapshots; and resolveContract ──

describe('D — a duplicated contract recording refuses, in either order', () => {
  function transcriptWithContracts(order: 'ok-first' | 'fail-first'): RecordedTranscript {
    const base = transcriptWithPositions([{ accountId: ACCOUNT_BOUND, response: ok([]) }])
    const good = base.contractSnapshots[0]
    const bad = {
      contractId: CONTRACT_NQ,
      response: failure('PROVIDER_DISCONNECTED', 'nej'),
    } as unknown as (typeof base.contractSnapshots)[number]
    return { ...base, contractSnapshots: order === 'ok-first' ? [good, bad] : [bad, good] }
  }

  it('refuses getContractSnapshot in either order', async () => {
    for (const order of ['ok-first', 'fail-first'] as const) {
      const result = await createRecordedExecutionProviderAdapter(transcriptWithContracts(order))
        .getContractSnapshot(CONTRACT_NQ)
      expect(result.ok, order).toBe(false)
      if (!result.ok) expect(result.error.reasonCode, order).toBe('REFERENCE_MISMATCH')
    }
  })

  it('refuses resolveContract for a duplicated canonical symbol, in either order', async () => {
    const base = transcriptWithPositions([{ accountId: ACCOUNT_BOUND, response: ok([]) }])
    const first = base.contractResolutions[0]
    const second = {
      canonicalSymbol: 'NQ',
      response: failure('PROVIDER_DISCONNECTED', 'nej'),
    } as unknown as (typeof base.contractResolutions)[number]

    for (const resolutions of [[first, second], [second, first]]) {
      const result = await createRecordedExecutionProviderAdapter(
        { ...base, contractResolutions: resolutions },
      ).resolveContract({
        instrumentId: INSTRUMENT_ID_NQ,
        canonicalSymbol: 'NQ',
        expiration: { state: 'UNKNOWN' },
        providerSymbol: { state: 'UNKNOWN' },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.reasonCode).toBe('REFERENCE_MISMATCH')
    }
  })
})

// ─── E. recentFills — one recording per account ───────────────────────────────

describe('E — recentFills takes the account as a complete key', () => {
  function transcriptWithFills(order: 'wrong-first' | 'right-first'): RecordedTranscript {
    const base = transcriptWithPositions([{ accountId: ACCOUNT_BOUND, response: ok([]) }])
    const matching = base.recentFills[0]
    const otherWindow = {
      accountId: ACCOUNT_BOUND,
      response: ok({
        fills: [],
        requested: { from: OCCURRED_AT, to: OCCURRED_AT },
        actual: present({ from: OCCURRED_AT, to: OCCURRED_AT }),
        completeness: 'COMPLETE' as const,
        nextCursor: null,
      }),
    } as unknown as (typeof base.recentFills)[number]
    return {
      ...base,
      recentFills: order === 'wrong-first' ? [otherWindow, matching] : [matching, otherWindow],
    }
  }

  const WINDOW = { from: OCCURRED_AT, to: BATCH_OBSERVED_AT }

  it('refuses two recordings for one account, in either order', async () => {
    for (const order of ['right-first', 'wrong-first'] as const) {
      const result = await createRecordedExecutionProviderAdapter(transcriptWithFills(order))
        .getRecentFills(ACCOUNT_BOUND, WINDOW)
      expect(result.ok, order).toBe(false)
      if (!result.ok) {
        expect(result.error.reasonCode, order).toBe('REFERENCE_MISMATCH')
        expect(result.error.message, order).toContain('tvetydig')
      }
    }
  })

  it('gives the SAME answer in both orders — order decides nothing', async () => {
    const a = await createRecordedExecutionProviderAdapter(transcriptWithFills('right-first'))
      .getRecentFills(ACCOUNT_BOUND, WINDOW)
    const b = await createRecordedExecutionProviderAdapter(transcriptWithFills('wrong-first'))
      .getRecentFills(ACCOUNT_BOUND, WINDOW)
    expect(b).toEqual(a)
  })

  it('still answers a single recorded window for the exact window', async () => {
    const base = transcriptWithPositions([{ accountId: ACCOUNT_BOUND, response: ok([]) }])
    const result = await createRecordedExecutionProviderAdapter(base)
      .getRecentFills(ACCOUNT_BOUND, WINDOW)
    expect(result.ok).toBe(true)
  })

  it('still refuses a window the single recording does not cover', async () => {
    const base = transcriptWithPositions([{ accountId: ACCOUNT_BOUND, response: ok([]) }])
    const result = await createRecordedExecutionProviderAdapter(base)
      .getRecentFills(ACCOUNT_BOUND, { from: OCCURRED_AT, to: OCCURRED_AT })
    expect(result.ok).toBe(false)
  })
})

// ─── The vocabulary itself ────────────────────────────────────────────────────

describe('the ambiguity refusals are package-local', () => {
  it('adds no Core ReasonCode', async () => {
    const core = await import('../reason-codes')
    for (const local of ['AMBIGUOUS_INSTRUMENT_MAPPING', 'AMBIGUOUS_REPLAY_METADATA']) {
      expect(core.CORE_REASON_CODES as readonly string[]).not.toContain(local)
      expect(core.RISK_REASON_CODES as readonly string[]).not.toContain(local)
    }
    /*
     * The counts are a proxy for the claim above: this package adds nothing to
     * Core. Core grew from 31 to 40 in R1A.1, which added the nine PROVIDER_*
     * connectivity codes — none of them from here, and none of them one of the
     * two local refusals named above.
     */
    expect(core.CORE_REASON_CODES).toHaveLength(40)
    expect(core.RISK_REASON_CODES).toHaveLength(18)
  })

  it('keeps the local refusal vocabulary complete and distinct', () => {
    expect([...NORMALIZATION_REFUSALS].sort()).toEqual([
      'ACCOUNT_MISMATCH',
      'AMBIGUOUS_INSTRUMENT_MAPPING',
      'AMBIGUOUS_REPLAY_METADATA',
      'DUPLICATE_POSITION_ID',
      'INSTRUMENT_UNRESOLVED',
      'REPLAY_METADATA_MISSING',
    ])
    expect(new Set(NORMALIZATION_REFUSALS).size).toBe(NORMALIZATION_REFUSALS.length)
  })

  it('uses the approved harness REFERENCE_MISMATCH for transcript ambiguity', async () => {
    // Transcript-level ambiguity rides the already-approved harness-only code;
    // normalization-level ambiguity uses package-local vocabulary. Neither adds
    // anything to Core.
    const competing: RecordedTranscript['positions'] = [
      { accountId: ACCOUNT_BOUND, response: ok([]) },
      { accountId: ACCOUNT_BOUND, response: ok([]) },
    ]
    const result = await createRecordedExecutionProviderAdapter(transcriptWithPositions(competing))
      .getPositions(ACCOUNT_BOUND)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.reasonCode).toBe('REFERENCE_MISMATCH')
  })

  it('leaves the ES mapping usable — hardening did not break well-formed tables', () => {
    const result = normalizePositionSnapshots(
      [recordedPosition({ positionId: 'p1', instrumentId: present(INSTRUMENT_ID_ES) })],
      {
        accountId: ACCOUNT_BOUND,
        source: SOURCE,
        instrument: 'ES',
        instrumentMappings: INSTRUMENT_MAPPINGS,
        replayMetadata: [recordedMetadata({ positionId: 'p1' })],
      },
    )
    expect(result.outcome).toBe('NORMALIZED')
  })
})
