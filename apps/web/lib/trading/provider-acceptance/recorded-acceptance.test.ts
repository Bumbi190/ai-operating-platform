/**
 * The recorded adapter, put through the reusable acceptance suite.
 *
 * This file is deliberately tiny. Certifying a provider should be one call, and
 * the day a real adapter arrives the diff should look like this file with a
 * different context — never like an edit to the suite.
 *
 *     runProviderAcceptanceSuite('Rithmic', createRithmicAcceptanceContext())
 *
 * The cases below the suite call are the ones that need the RECORDED context's
 * specific authored values — exact decimals and the three-state readings — which
 * a provider-neutral suite cannot assert without knowing what was authored.
 */

import { describe, expect, it } from 'vitest'
import { normalizePositionSnapshots } from '../provider-normalization'
import { runProviderAcceptanceSuite } from './acceptance-suite'
import { exactReading } from './checks'
import {
  ACCEPTANCE_INSTRUMENT,
  ACCEPTANCE_INSTRUMENT_MAPPINGS,
  ACCEPTANCE_REPLAY_METADATA,
  createRecordedAcceptanceContext,
} from './recorded-context'

// The whole Level-1 acceptance surface, against the first reference adapter.
runProviderAcceptanceSuite('RecordedExecutionProviderAdapter', createRecordedAcceptanceContext())

// ─── Exactness, on the values a JS number demonstrably breaks ─────────────────

describe('recorded reference — exact decimal preservation', () => {
  const context = createRecordedAcceptanceContext()

  async function exactnessPosition() {
    const result = await context.createAdapter().getPositions(context.knownAccountId)
    if (!result.ok) throw new Error('recorded positions unavailable')
    const position = result.value.find((p) => p.positionId === 'pos-exactness')
    if (position === undefined) throw new Error('exactness position missing')
    return position
  }

  it('preserves every awkward decimal exactly, as provider truth', async () => {
    const position = await exactnessPosition()
    expect(exactReading(position.quantity)).toEqual({ state: 'PRESENT', text: '1' })
    expect(exactReading(position.averageEntry)).toEqual({ state: 'PRESENT', text: '1.50' })
    expect(exactReading(position.lastPrice))
      .toEqual({ state: 'PRESENT', text: '0.000000000001' })
    expect(exactReading(position.unrealizedPnl)).toEqual({ state: 'PRESENT', text: '-3.75' })
    expect(exactReading(position.stopLoss))
      .toEqual({ state: 'PRESENT', text: '99999999999999999' })
  })

  it('differs from what a JS number would have produced', async () => {
    const position = await exactnessPosition()
    // The three values a number path corrupts or reformats.
    expect(String(Number('99999999999999999'))).toBe('100000000000000000')
    expect(String(Number('0.000000000001'))).toBe('1e-12')
    expect(String(Number('1.50'))).toBe('1.5')

    const stop = exactReading(position.stopLoss)
    const last = exactReading(position.lastPrice)
    const entry = exactReading(position.averageEntry)
    expect(stop.state === 'PRESENT' && stop.text).not.toBe('100000000000000000')
    expect(last.state === 'PRESENT' && last.text).not.toBe('1e-12')
    expect(entry.state === 'PRESENT' && entry.text).not.toBe('1.5')
  })

  it('carries the exact text through normalization into replay', async () => {
    const result = await context.createAdapter().getPositions(context.knownAccountId)
    if (!result.ok) throw new Error('recorded positions unavailable')

    const normalized = normalizePositionSnapshots(result.value, {
      accountId: context.knownAccountId,
      source: { providerLabel: 'Recorded', accountLabel: null, origin: 'FIXTURE' },
      instrument: ACCEPTANCE_INSTRUMENT,
      instrumentMappings: ACCEPTANCE_INSTRUMENT_MAPPINGS,
      replayMetadata: ACCEPTANCE_REPLAY_METADATA,
    })
    expect(normalized.outcome).toBe('NORMALIZED')
    if (normalized.outcome !== 'NORMALIZED') return

    const observation = normalized.observations.find((o) => o.position.positionId === 'pos-exactness')
    expect(observation).toBeDefined()
    expect(observation?.position.quantity).toEqual({ state: 'PRESENT', value: '1' })
    expect(observation?.position.stopLoss)
      .toEqual({ state: 'PRESENT', value: '99999999999999999' })
    expect(observation?.position.lastPrice)
      .toEqual({ state: 'PRESENT', value: '0.000000000001' })
  })
})

// ─── The three states, on one authored position ───────────────────────────────

describe('recorded reference — PRESENT / UNAVAILABLE / UNKNOWN stay distinct', () => {
  const context = createRecordedAcceptanceContext()

  it('keeps both kinds of absence apart on the sparse position', async () => {
    const result = await context.createAdapter().getPositions(context.knownAccountId)
    if (!result.ok) throw new Error('recorded positions unavailable')
    const sparse = result.value.find((p) => p.positionId === 'pos-sparse')
    expect(sparse).toBeDefined()
    if (sparse === undefined) return

    expect(exactReading(sparse.quantity)).toEqual({ state: 'PRESENT', text: '2' })
    expect(exactReading(sparse.averageEntry)).toEqual({ state: 'UNAVAILABLE' })
    expect(exactReading(sparse.lastPrice)).toEqual({ state: 'UNKNOWN' })
    expect(exactReading(sparse.unrealizedPnl)).toEqual({ state: 'UNAVAILABLE' })
    expect(exactReading(sparse.stopLoss)).toEqual({ state: 'UNKNOWN' })
  })

  it('carries both absences through normalization without collapsing them', async () => {
    const result = await context.createAdapter().getPositions(context.knownAccountId)
    if (!result.ok) return
    const normalized = normalizePositionSnapshots(result.value, {
      accountId: context.knownAccountId,
      source: { providerLabel: 'Recorded', accountLabel: null, origin: 'FIXTURE' },
      instrument: ACCEPTANCE_INSTRUMENT,
      instrumentMappings: ACCEPTANCE_INSTRUMENT_MAPPINGS,
      replayMetadata: ACCEPTANCE_REPLAY_METADATA,
    })
    if (normalized.outcome !== 'NORMALIZED') throw new Error('normalization refused')
    const sparse = normalized.observations.find((o) => o.position.positionId === 'pos-sparse')
    expect(sparse?.position.averageEntry).toEqual({ state: 'UNAVAILABLE' })
    expect(sparse?.position.lastPrice).toEqual({ state: 'UNKNOWN' })
  })

  it('preserves an UNKNOWN side rather than rendering it NEUTRAL', async () => {
    const result = await context.createAdapter().getPositions(context.knownAccountId)
    if (!result.ok) return
    const unknownSide = result.value.find((p) => p.positionId === 'pos-unknown-side')
    expect(unknownSide?.side).toBe('UNKNOWN')

    const normalized = normalizePositionSnapshots(result.value, {
      accountId: context.knownAccountId,
      source: { providerLabel: 'Recorded', accountLabel: null, origin: 'FIXTURE' },
      instrument: ACCEPTANCE_INSTRUMENT,
      instrumentMappings: ACCEPTANCE_INSTRUMENT_MAPPINGS,
      replayMetadata: ACCEPTANCE_REPLAY_METADATA,
    })
    if (normalized.outcome !== 'NORMALIZED') return
    const observation = normalized.observations
      .find((o) => o.position.positionId === 'pos-unknown-side')
    expect(observation?.position.direction).toBe('UNKNOWN')
    expect(observation?.position.direction as string).not.toBe('NEUTRAL')
  })
})

// ─── ProviderTimestamp stays provider provenance ──────────────────────────────

describe('recorded reference — ProviderTimestamp', () => {
  const context = createRecordedAcceptanceContext()

  it('is not propagated into the replay observation', async () => {
    const result = await context.createAdapter().getPositions(context.knownAccountId)
    if (!result.ok) return
    const providerInstant = result.value[0].providerTime
    expect(providerInstant.state).toBe('PRESENT')

    const normalized = normalizePositionSnapshots(result.value, {
      accountId: context.knownAccountId,
      source: { providerLabel: 'Recorded', accountLabel: null, origin: 'FIXTURE' },
      instrument: ACCEPTANCE_INSTRUMENT,
      instrumentMappings: ACCEPTANCE_INSTRUMENT_MAPPINGS,
      replayMetadata: ACCEPTANCE_REPLAY_METADATA,
    })
    if (normalized.outcome !== 'NORMALIZED') return

    if (providerInstant.state === 'PRESENT') {
      const serialized = JSON.stringify(normalized.observations)
      expect(serialized).not.toContain(providerInstant.value as string)
    }
  })

  it('is not used as a freshness or clock-sync proof', async () => {
    const clock = await context.createAdapter().getProviderTime()
    if (!clock.ok) return
    // The provider's own instant, and a separately reported local observation
    // instant. The contract keeps them apart; they are not interchangeable.
    expect(clock.value.providerTime as string).not.toBe(clock.value.observedAt as string)
    // Skew is measured and reported, never assumed to be zero.
    expect(exactReading(clock.value.skewMs).state).toBe('PRESENT')
  })
})
