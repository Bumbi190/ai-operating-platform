/**
 * The Fas-2 failure matrix — every degraded case must fail HONESTLY.
 *
 * WHY THIS USES THE RECORDED ADAPTER AS ITS VEHICLE
 * ────────────────────────────────────────────────
 * A provider-neutral suite cannot demand that a real provider be disconnected,
 * or that its clock be unavailable, on request. What it CAN do is hold every
 * adapter to its declared capabilities, which `acceptance-suite.ts` does.
 *
 * This file certifies the other half: that the contract's failure vocabulary
 * behaves correctly when a provider genuinely is degraded. The recorded adapter
 * is the vehicle because a transcript can express degradation exactly and
 * deterministically — and the assertions are the same shared pure checks the
 * neutral suite uses, so what is certified here is the CONTRACT, not the
 * recorded implementation.
 *
 * "Honestly" has a specific meaning throughout: a structured failure, or an
 * explicitly absent reading — never an empty success, never a substituted
 * default, and never a thrown error.
 */

import { describe, expect, it } from 'vitest'
import { failure, ok, present, unavailable, unknown } from '../provider'
import type { PositionSnapshot, Result } from '../provider'
import {
  createRecordedExecutionProviderAdapter,
  normalizePositionSnapshots,
  type RecordedTranscript,
} from '../provider-normalization'
import {
  exactReading,
  failureCarriesStructuredReason,
  isKnownFlat,
  meetsSafetyCriticalRequirement,
  obligationFor,
  refusedUnknownReference,
} from './checks'
import {
  ACCEPTANCE_INSTRUMENT,
  ACCEPTANCE_INSTRUMENT_MAPPINGS,
  ACCEPTANCE_POSITIONS,
  ACCEPTANCE_REPLAY_METADATA,
  acceptanceTranscript,
  createRecordedAcceptanceContext,
} from './recorded-context'

const context = createRecordedAcceptanceContext()

/** A transcript variant, authored by overriding the reference. */
function variant(overrides: Partial<RecordedTranscript>): RecordedTranscript {
  return { ...acceptanceTranscript(), ...overrides }
}

function adapterFor(overrides: Partial<RecordedTranscript>) {
  return createRecordedExecutionProviderAdapter(variant(overrides))
}

// ─── 1. Provider disconnected ─────────────────────────────────────────────────

describe('failure matrix — provider disconnected', () => {
  const disconnected = {
    positions: [{
      accountId: context.knownAccountId,
      response: failure('PROVIDER_DISCONNECTED', 'Providern svarade inte.'),
    }],
  } as Partial<RecordedTranscript>

  it('reports a structured failure, not an empty success', async () => {
    const result = await adapterFor(disconnected).getPositions(context.knownAccountId)
    expect(result.ok).toBe(false)
    expect(failureCarriesStructuredReason(result)).toBe(true)
    expect(isKnownFlat(result)).toBe(false)
  })

  it('is never mistaken for known flat', async () => {
    const result = await adapterFor(disconnected).getPositions(context.knownAccountId)
    const flat = await adapterFor({
      positions: [{ accountId: context.knownAccountId, response: ok([]) }],
    }).getPositions(context.knownAccountId)

    expect(isKnownFlat(result)).toBe(false)
    expect(isKnownFlat(flat)).toBe(true)
    // The two are different shapes, not two spellings of the same answer.
    expect(result.ok).not.toBe(flat.ok)
  })
})

// ─── 2. Unknown capability ────────────────────────────────────────────────────

describe('failure matrix — unknown capability', () => {
  it('never lets UNKNOWN discharge a safety-critical requirement', () => {
    expect(meetsSafetyCriticalRequirement('UNKNOWN')).toBe(false)
    expect(meetsSafetyCriticalRequirement('CONDITIONAL')).toBe(false)
    expect(meetsSafetyCriticalRequirement('UNSUPPORTED')).toBe(false)
    expect(meetsSafetyCriticalRequirement('SUPPORTED')).toBe(true)
  })

  it('demands only honest reporting when a capability is not SUPPORTED', async () => {
    const result = await context.createAdapter().getCapabilities()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The reference declares an UNKNOWN and an UNSUPPORTED capability, so the
    // honest-reporting branch is genuinely exercised rather than hypothetical.
    expect(result.value.contractTickValue).toBe('UNKNOWN')
    expect(result.value.streamingState).toBe('UNSUPPORTED')
    expect(obligationFor(result.value.contractTickValue)).toBe('MUST_REPORT_HONESTLY')
    expect(obligationFor(result.value.streamingState)).toBe('MUST_REPORT_HONESTLY')
    expect(obligationFor(result.value.positions)).toBe('MUST_PROVIDE_DATA')
  })

  it('keeps an UNKNOWN capability consistent with an UNKNOWN reading', async () => {
    const snapshot = await context.createAdapter()
      .getContractSnapshot(context.knownContractId)
    if (!snapshot.ok) return
    // tickValue is declared UNKNOWN as a capability and reported UNKNOWN as a
    // reading. The provider does not claim one and deny the other.
    expect(exactReading(snapshot.value.tickValue)).toEqual({ state: 'UNKNOWN' })
  })
})

// ─── 3 & 4. Unavailable field and unknown field ───────────────────────────────

describe('failure matrix — unavailable and unknown fields', () => {
  it('keeps the two absences distinct on the same snapshot', async () => {
    const result = await context.createAdapter()
      .getAccountSnapshot(context.knownAccountId)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(exactReading(result.value.margin)).toEqual({ state: 'UNAVAILABLE' })
    expect(exactReading(result.value.freeMargin)).toEqual({ state: 'UNKNOWN' })
    expect(exactReading(result.value.unrealizedPnl)).toEqual({ state: 'UNKNOWN' })
  })

  it('never renders an absent money reading as zero', async () => {
    const result = await context.createAdapter()
      .getAccountSnapshot(context.knownAccountId)
    if (!result.ok) return
    for (const reading of [result.value.margin, result.value.freeMargin]) {
      const read = exactReading(reading)
      expect(read).not.toHaveProperty('text')
      expect(read).not.toEqual({ state: 'PRESENT', text: '0' })
    }
  })
})

// ─── 5. Account reference mismatch ────────────────────────────────────────────

describe('failure matrix — account reference mismatch', () => {
  it('refuses an unknown account rather than reporting it flat', async () => {
    const result = await context.createAdapter().getPositions(context.unknownAccountId)
    expect(refusedUnknownReference(result)).toBe(true)
    expect(isKnownFlat(result)).toBe(false)
  })

  it('refuses at the normalization seam when the bound account disagrees', () => {
    const normalized = normalizePositionSnapshots(ACCEPTANCE_POSITIONS, {
      accountId: context.unknownAccountId,
      source: { providerLabel: 'Recorded', accountLabel: null, origin: 'FIXTURE' },
      instrument: ACCEPTANCE_INSTRUMENT,
      instrumentMappings: ACCEPTANCE_INSTRUMENT_MAPPINGS,
      replayMetadata: ACCEPTANCE_REPLAY_METADATA,
    })
    expect(normalized.outcome).toBe('REFUSED')
    if (normalized.outcome === 'REFUSED') {
      expect(normalized.refusal).toBe('ACCOUNT_MISMATCH')
    }
  })
})

// ─── 6. Ambiguous / missing provider observation ──────────────────────────────

describe('failure matrix — ambiguous or missing observation', () => {
  it('refuses a duplicate position identity rather than picking one', () => {
    const duplicated: readonly PositionSnapshot[] = [
      ACCEPTANCE_POSITIONS[0],
      { ...ACCEPTANCE_POSITIONS[0], side: 'SHORT' },
    ]
    const normalized = normalizePositionSnapshots(duplicated, {
      accountId: context.knownAccountId,
      source: { providerLabel: 'Recorded', accountLabel: null, origin: 'FIXTURE' },
      instrument: ACCEPTANCE_INSTRUMENT,
      instrumentMappings: ACCEPTANCE_INSTRUMENT_MAPPINGS,
      replayMetadata: ACCEPTANCE_REPLAY_METADATA,
    })
    expect(normalized.outcome).toBe('REFUSED')
    if (normalized.outcome === 'REFUSED') {
      expect(normalized.refusal).toBe('DUPLICATE_POSITION_ID')
    }
  })

  it('refuses a position whose instrument attribution is unknown', () => {
    const unattributable: readonly PositionSnapshot[] = [
      { ...ACCEPTANCE_POSITIONS[0], instrumentId: unknown() },
    ]
    const normalized = normalizePositionSnapshots(unattributable, {
      accountId: context.knownAccountId,
      source: { providerLabel: 'Recorded', accountLabel: null, origin: 'FIXTURE' },
      instrument: ACCEPTANCE_INSTRUMENT,
      instrumentMappings: ACCEPTANCE_INSTRUMENT_MAPPINGS,
      replayMetadata: ACCEPTANCE_REPLAY_METADATA,
    })
    expect(normalized.outcome).toBe('REFUSED')
    if (normalized.outcome === 'REFUSED') {
      expect(normalized.refusal).toBe('INSTRUMENT_UNRESOLVED')
    }
  })

  it('refuses a position with no authored replay metadata', () => {
    const normalized = normalizePositionSnapshots([ACCEPTANCE_POSITIONS[0]], {
      accountId: context.knownAccountId,
      source: { providerLabel: 'Recorded', accountLabel: null, origin: 'FIXTURE' },
      instrument: ACCEPTANCE_INSTRUMENT,
      instrumentMappings: ACCEPTANCE_INSTRUMENT_MAPPINGS,
      replayMetadata: [],
    })
    expect(normalized.outcome).toBe('REFUSED')
    if (normalized.outcome === 'REFUSED') {
      expect(normalized.refusal).toBe('REPLAY_METADATA_MISSING')
    }
  })

  it('never produces a false known-flat from any refusal', () => {
    for (const metadata of [[], ACCEPTANCE_REPLAY_METADATA]) {
      const normalized = normalizePositionSnapshots(ACCEPTANCE_POSITIONS, {
        accountId: context.unknownAccountId,
        source: { providerLabel: 'Recorded', accountLabel: null, origin: 'FIXTURE' },
        instrument: ACCEPTANCE_INSTRUMENT,
        instrumentMappings: ACCEPTANCE_INSTRUMENT_MAPPINGS,
        replayMetadata: metadata,
      })
      expect(normalized.outcome).toBe('REFUSED')
    }
  })
})

// ─── 7. Empty successful positions — KNOWN FLAT ───────────────────────────────

describe('failure matrix — known flat', () => {
  it('treats a successful empty result as a positive claim', async () => {
    const result = await adapterFor({
      positions: [{ accountId: context.knownAccountId, response: ok([]) }],
    }).getPositions(context.knownAccountId)
    expect(result.ok).toBe(true)
    expect(isKnownFlat(result)).toBe(true)
  })

  it('does not fabricate a FLAT side to represent it', async () => {
    const result = await adapterFor({
      positions: [{ accountId: context.knownAccountId, response: ok([]) }],
    }).getPositions(context.knownAccountId)
    expect(JSON.stringify(result)).not.toContain('FLAT')
  })

  it('is unreachable from a failure, whatever the failure says', async () => {
    for (const code of ['PROVIDER_DISCONNECTED', 'REFERENCE_MISMATCH', 'VERDICT_UNKNOWN'] as const) {
      const result: Result<readonly PositionSnapshot[]> = await adapterFor({
        positions: [{ accountId: context.knownAccountId, response: failure(code, 'nej') }],
      }).getPositions(context.knownAccountId)
      expect(isKnownFlat(result), code).toBe(false)
    }
  })
})

// ─── 8. Incomplete / truncated fills ──────────────────────────────────────────

describe('failure matrix — truncated fill history', () => {
  it('reports TRUNCATED honestly rather than as COMPLETE', async () => {
    const truncated = await adapterFor({
      recentFills: [{
        accountId: context.knownAccountId,
        response: ok({
          fills: [],
          requested: context.fillWindow,
          actual: unknown(),
          completeness: 'TRUNCATED',
          nextCursor: null,
        }),
      }],
    }).getRecentFills(context.knownAccountId, context.fillWindow)

    expect(truncated.ok).toBe(true)
    if (!truncated.ok) return
    expect(truncated.value.completeness).toBe('TRUNCATED')
    // An unknown actual coverage stays UNKNOWN rather than echoing the request.
    expect(truncated.value.actual.state).toBe('UNKNOWN')
  })

  it('keeps UNKNOWN completeness distinct from COMPLETE', async () => {
    const unknownCompleteness = await adapterFor({
      recentFills: [{
        accountId: context.knownAccountId,
        response: ok({
          fills: [],
          requested: context.fillWindow,
          actual: unavailable(),
          completeness: 'UNKNOWN',
          nextCursor: null,
        }),
      }],
    }).getRecentFills(context.knownAccountId, context.fillWindow)
    if (!unknownCompleteness.ok) return
    expect(unknownCompleteness.value.completeness).toBe('UNKNOWN')
    expect(unknownCompleteness.value.completeness).not.toBe('COMPLETE')
    expect(unknownCompleteness.value.actual.state).toBe('UNAVAILABLE')
  })
})

// ─── 9. Provider time unavailable ─────────────────────────────────────────────

describe('failure matrix — provider time unavailable', () => {
  it('fails rather than substituting a local instant', async () => {
    const result = await adapterFor({
      providerTime: failure('PROVIDER_DISCONNECTED', 'Ingen klocka.'),
    }).getProviderTime()
    expect(result.ok).toBe(false)
    expect(failureCarriesStructuredReason(result)).toBe(true)
  })

  it('keeps an unknown skew unknown rather than zero', async () => {
    const result = await adapterFor({
      providerTime: ok({
        providerTime: '2026-04-06T13:44:59.500Z' as never,
        observedAt: '2026-04-06T13:45:00.000Z' as never,
        skewMs: unknown(),
      }),
    }).getProviderTime()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(exactReading(result.value.skewMs)).toEqual({ state: 'UNKNOWN' })
    expect(exactReading(result.value.skewMs)).not.toEqual({ state: 'PRESENT', text: '0' })
  })
})

// ─── 10. Reconciliation unavailable ───────────────────────────────────────────

describe('failure matrix — reconciliation unavailable', () => {
  it('fails honestly when reconciliation cannot be carried out', async () => {
    const result = await adapterFor({
      reconciliations: [{
        accountId: context.knownAccountId,
        response: failure('PROVIDER_DISCONNECTED', 'Kunde inte stämma av.'),
      }],
    }).reconcileReadOnlyState(context.knownAccountId)
    expect(result.ok).toBe(false)
    expect(failureCarriesStructuredReason(result)).toBe(true)
  })

  it('keeps INDETERMINATE + [] distinct from AGREED + []', async () => {
    const indeterminate = await adapterFor({
      reconciliations: [{
        accountId: context.knownAccountId,
        response: ok({
          accountId: context.knownAccountId,
          status: 'INDETERMINATE',
          discrepancies: [],
          startedAt: '2026-04-06T13:45:00.000Z' as never,
          completedAt: '2026-04-06T13:50:00.000Z' as never,
          observedAt: '2026-04-06T13:50:00.000Z' as never,
        }),
      }],
    }).reconcileReadOnlyState(context.knownAccountId)

    const agreed = await context.createAdapter()
      .reconcileReadOnlyState(context.knownAccountId)

    if (!indeterminate.ok || !agreed.ok) return
    expect(indeterminate.value.discrepancies).toHaveLength(0)
    expect(agreed.value.discrepancies).toHaveLength(0)
    // Same empty list, different claims. The status carries the meaning.
    expect(indeterminate.value.status).not.toBe(agreed.value.status)
  })
})

// ─── Contract resolution stays explicit ───────────────────────────────────────

describe('failure matrix — contract resolution never guesses', () => {
  it('refuses a prefix-sharing symbol that no recording covers', async () => {
    const adapter = context.createAdapter()
    const resolvable = await adapter.resolveContract(context.resolvableSpec)
    const prefixed = await adapter.resolveContract(context.unresolvableSpec)

    expect(resolvable.ok).toBe(true)
    expect(prefixed.ok).toBe(false)
    // 'NQZ6' starts with 'NQ'. A front-month, prefix or month-code rule would
    // have resolved it; GATE-08 is open, so nothing may.
    expect(context.unresolvableSpec.canonicalSymbol.startsWith(
      context.resolvableSpec.canonicalSymbol,
    )).toBe(true)
  })

  it('refuses an unknown contract snapshot reference', async () => {
    const result = await context.createAdapter()
      .getContractSnapshot(context.unknownContractId)
    expect(result.ok).toBe(false)
    expect(failureCarriesStructuredReason(result)).toBe(true)
  })
})

// ─── Nothing here throws ──────────────────────────────────────────────────────

describe('failure matrix — failures are values, never exceptions', () => {
  it('returns a Result for every degraded read', async () => {
    const degraded = adapterFor({
      positions: [{
        accountId: context.knownAccountId,
        response: failure('PROVIDER_DISCONNECTED', 'nej'),
      }],
      providerTime: failure('PROVIDER_DISCONNECTED', 'nej'),
      reconciliations: [{
        accountId: context.knownAccountId,
        response: failure('PROVIDER_DISCONNECTED', 'nej'),
      }],
    })
    for (const read of [
      () => degraded.getPositions(context.knownAccountId),
      () => degraded.getProviderTime(),
      () => degraded.reconcileReadOnlyState(context.knownAccountId),
      () => degraded.getAccountSnapshot(context.unknownAccountId),
      () => degraded.getRecentFills(context.unknownAccountId, context.fillWindow),
    ]) {
      const result = await read()
      expect(typeof result.ok).toBe('boolean')
      if (!result.ok) expect(failureCarriesStructuredReason(result)).toBe(true)
    }
  })

  it('resolves disconnect even on a fully degraded adapter', async () => {
    const degraded = adapterFor({
      positions: [{
        accountId: context.knownAccountId,
        response: failure('PROVIDER_DISCONNECTED', 'nej'),
      }],
    })
    await expect(degraded.disconnect()).resolves.toBeUndefined()
  })
})
