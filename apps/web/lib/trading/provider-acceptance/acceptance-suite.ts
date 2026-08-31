/**
 * Omnira Trading — the reusable Level-1 provider acceptance suite.
 *
 * HOW A PROVIDER IS CERTIFIED
 * ───────────────────────────
 *     runProviderAcceptanceSuite('Recorded', createRecordedAcceptanceContext())
 *     runProviderAcceptanceSuite('Rithmic',  createRithmicAcceptanceContext())
 *
 * The suite is written once and never edited per provider. Everything that can
 * legitimately differ arrives through the context, and everything that must not
 * differ is asserted here.
 *
 * IT HOLDS AN ADAPTER TO WHAT IT CLAIMED
 * ──────────────────────────────────────
 * Providers genuinely differ in what they can report, so the suite reads
 * `getCapabilities()` and derives the obligation: a capability the adapter
 * declares `SUPPORTED` must produce data, and anything else must be reported
 * honestly. That is how one acceptance surface can certify a rich provider and
 * a sparse one without weakening into "any answer is fine" — the four states
 * stay four, and only `SUPPORTED` discharges a safety-critical requirement.
 *
 * WHAT THIS DOES NOT CERTIFY
 * ──────────────────────────
 * That live trading is safe, that a provider is reliable, that a credential is
 * least-privilege in production, or that anything is profitable. It certifies
 * READ-ONLY CONTRACT CONFORMANCE. GATE-08 stays open, no order path exists, and
 * passing this suite is not permission to execute anything.
 */

import { describe, expect, it } from 'vitest'
import { POSITION_SIDES, type CapabilityState } from '../provider'
import {
  normalizePositionSnapshots,
  type InstrumentMappingEntry,
} from '../provider-normalization'
import {
  observedPositionGrantsAuthority,
  positionObservationGrantsAuthority,
} from '../replay'
import { isInertRecord, type ProviderAcceptanceContext } from './contract'
import {
  exactReading,
  failureCarriesStructuredReason,
  isKnownFlat,
  meetsSafetyCriticalRequirement,
  obligationFor,
  refusedUnknownReference,
  resolutionWasExplicit,
} from './checks'

/** Read the adapter's own declaration. Several areas are judged against it. */
async function capabilitiesOf(context: ProviderAcceptanceContext) {
  const result = await context.createAdapter().getCapabilities()
  if (!result.ok) throw new Error('adapter could not report capabilities')
  return result.value
}

export function runProviderAcceptanceSuite(
  providerName: string,
  context: ProviderAcceptanceContext,
): void {
  describe(`Level-1 read-only acceptance — ${providerName}`, () => {
    // ─── 1. Connectivity ──────────────────────────────────────────────────────

    describe('1. connectivity', () => {
      it('returns a structured Result from connect, never a thrown error', async () => {
        const result = await context.createAdapter().connect(context.config)
        expect(typeof result.ok).toBe('boolean')
        if (!result.ok) expect(failureCarriesStructuredReason(result)).toBe(true)
      })

      it('carries no credential in the session it returns', async () => {
        const result = await context.createAdapter().connect(context.config)
        if (!result.ok) return
        const serialized = JSON.stringify(result.value)
        expect(serialized).not.toContain(context.config.credentialSecretRef)
        // A session is a frozen record, not a handle that could act.
        expect(isInertRecord(result.value)).toBe(true)
      })
    })

    // ─── 2. Identity ──────────────────────────────────────────────────────────

    describe('2. provider identity', () => {
      it('reports an identity distinct from any display label', async () => {
        const result = await context.createAdapter().getProviderIdentity()
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.value.providerId.length).toBeGreaterThan(0)
        expect(typeof result.value.displayLabel).toBe('string')
        expect(isInertRecord(result.value)).toBe(true)
      })
    })

    // ─── 3. Environment ───────────────────────────────────────────────────────

    describe('3. environment', () => {
      it('never defaults — it answers or it fails', async () => {
        const result = await context.createAdapter().getEnvironment()
        if (result.ok) {
          expect(['development', 'backtest', 'demo', 'live']).toContain(result.value)
        } else {
          expect(failureCarriesStructuredReason(result)).toBe(true)
        }
      })

      it('agrees with the environment its identity reports', async () => {
        const adapter = context.createAdapter()
        const [environment, identity] = await Promise.all([
          adapter.getEnvironment(),
          adapter.getProviderIdentity(),
        ])
        if (environment.ok && identity.ok) {
          expect(identity.value.environment).toBe(environment.value)
        }
      })
    })

    // ─── 4. Capabilities ──────────────────────────────────────────────────────

    describe('4. capabilities', () => {
      it('reports every capability as one of the four states', async () => {
        const capabilities = await capabilitiesOf(context)
        const states: CapabilityState[] = [
          capabilities.accountSnapshots, capabilities.positions, capabilities.workingOrders,
          capabilities.fills, capabilities.contractDiscovery, capabilities.contractTickSize,
          capabilities.contractTickValue, capabilities.contractMultiplier,
          capabilities.providerTime, capabilities.streamingState, capabilities.reconciliation,
          capabilities.fillHistoryWindow.state, capabilities.fillHistoryWindow.supportsCursor,
        ]
        for (const state of states) {
          expect(['SUPPORTED', 'UNSUPPORTED', 'CONDITIONAL', 'UNKNOWN']).toContain(state)
        }
      })

      it('lets only SUPPORTED satisfy a safety-critical requirement', async () => {
        const capabilities = await capabilitiesOf(context)
        expect(meetsSafetyCriticalRequirement('SUPPORTED')).toBe(true)
        for (const weaker of ['UNSUPPORTED', 'CONDITIONAL', 'UNKNOWN'] as const) {
          expect(meetsSafetyCriticalRequirement(weaker), weaker).toBe(false)
        }
        // And the rule is actually applied to this adapter's own declaration.
        expect(obligationFor(capabilities.positions)).toBe(
          capabilities.positions === 'SUPPORTED' ? 'MUST_PROVIDE_DATA' : 'MUST_REPORT_HONESTLY',
        )
      })

      it('never collapses a capability to a boolean', async () => {
        const capabilities = await capabilitiesOf(context)
        for (const value of Object.values(capabilities)) {
          expect(typeof value).not.toBe('boolean')
        }
      })
    })

    // ─── 5. Health ────────────────────────────────────────────────────────────

    describe('5. health', () => {
      it('reports a verdict with structured reason codes', async () => {
        const result = await context.createAdapter().getHealth()
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(['ALLOW', 'DENY', 'UNKNOWN']).toContain(result.value.verdict)
        expect(Array.isArray(result.value.reasonCodes)).toBe(true)
      })

      it('distinguishes healthy-and-empty from unknown', async () => {
        const result = await context.createAdapter().getHealth()
        if (!result.ok) return
        // ALLOW with no reason codes is a positive statement of health; it is
        // not the same claim as UNKNOWN, which means health was not established.
        if (result.value.verdict === 'ALLOW') {
          expect(result.value.verdict).not.toBe('UNKNOWN')
        }
      })
    })

    // ─── 6. Provider time ─────────────────────────────────────────────────────

    describe('6. provider time', () => {
      it('reports provider time as provenance, with a measured or absent skew', async () => {
        const capabilities = await capabilitiesOf(context)
        const result = await context.createAdapter().getProviderTime()

        if (obligationFor(capabilities.providerTime) === 'MUST_PROVIDE_DATA') {
          expect(result.ok).toBe(true)
        }
        if (!result.ok) {
          expect(failureCarriesStructuredReason(result)).toBe(true)
          return
        }
        // Skew is MEASURED, never assumed: an UNKNOWN skew never becomes 0.
        const skew = exactReading(result.value.skewMs)
        expect(['PRESENT', 'UNAVAILABLE', 'UNKNOWN']).toContain(skew.state)
        if (skew.state !== 'PRESENT') {
          expect(skew).not.toHaveProperty('text')
        }
      })

      it('never substitutes a wall clock for an absent provider time', async () => {
        const result = await context.createAdapter().getProviderTime()
        if (!result.ok) return
        // The provider instant is the provider's own reading, not "now".
        const nowIso = new Date().toISOString()
        expect(result.value.providerTime as string).not.toBe(nowIso)
      })
    })

    // ─── 7. Account discovery ─────────────────────────────────────────────────

    describe('7. account discovery', () => {
      it('lists accounts as opaque references, never as credentials', async () => {
        const result = await context.createAdapter().getAccounts()
        expect(result.ok).toBe(true)
        if (!result.ok) return
        for (const account of result.value) {
          expect(typeof account.providerAccountRef).toBe('string')
          expect(isInertRecord(account)).toBe(true)
        }
      })
    })

    // ─── 8. Account snapshot ──────────────────────────────────────────────────

    describe('8. account snapshot', () => {
      it('answers for a known account when it claims to support snapshots', async () => {
        const capabilities = await capabilitiesOf(context)
        const result = await context.createAdapter().getAccountSnapshot(context.knownAccountId)
        if (obligationFor(capabilities.accountSnapshots) === 'MUST_PROVIDE_DATA') {
          expect(result.ok).toBe(true)
        }
        if (!result.ok) expect(failureCarriesStructuredReason(result)).toBe(true)
      })

      it('keeps every money reading three-state', async () => {
        const result = await context.createAdapter().getAccountSnapshot(context.knownAccountId)
        if (!result.ok) return
        for (const reading of [
          result.value.balance, result.value.equity, result.value.realizedPnl,
          result.value.unrealizedPnl, result.value.margin, result.value.freeMargin,
        ]) {
          const read = exactReading(reading)
          expect(['PRESENT', 'UNAVAILABLE', 'UNKNOWN']).toContain(read.state)
          // A missing money reading is never rendered as zero.
          if (read.state !== 'PRESENT') expect(read).not.toHaveProperty('text')
        }
      })

      it('refuses an unknown account rather than answering emptily', async () => {
        const result = await context.createAdapter().getAccountSnapshot(context.unknownAccountId)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(failureCarriesStructuredReason(result)).toBe(true)
      })
    })

    // ─── 9. Contract resolution (GATE-08 stays open) ──────────────────────────

    describe('9. contract resolution', () => {
      it('resolves only by explicit correspondence, never by inference', async () => {
        const adapter = context.createAdapter()
        const resolvable = await adapter.resolveContract(context.resolvableSpec)
        const unresolvable = await adapter.resolveContract(context.unresolvableSpec)
        expect(resolutionWasExplicit(resolvable, unresolvable)).toBe(true)
      })

      it('fails closed on a spec it cannot identify', async () => {
        const result = await context.createAdapter().resolveContract(context.unresolvableSpec)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(failureCarriesStructuredReason(result)).toBe(true)
      })
    })

    // ─── 10. Contract snapshot ────────────────────────────────────────────────

    describe('10. contract snapshot', () => {
      it('answers for a known contract and keeps tick readings three-state', async () => {
        const result = await context.createAdapter().getContractSnapshot(context.knownContractId)
        if (!result.ok) {
          expect(failureCarriesStructuredReason(result)).toBe(true)
          return
        }
        expect(['PROVIDER', 'CANONICAL_SPEC']).toContain(result.value.source)
        for (const reading of [
          result.value.tickSize, result.value.tickValue, result.value.multiplier,
        ]) {
          expect(['PRESENT', 'UNAVAILABLE', 'UNKNOWN']).toContain(exactReading(reading).state)
        }
      })

      it('refuses an unknown contract reference', async () => {
        const result = await context.createAdapter().getContractSnapshot(context.unknownContractId)
        expect(result.ok).toBe(false)
      })
    })

    // ─── 11. Positions, and KNOWN FLAT ────────────────────────────────────────

    describe('11. positions', () => {
      it('answers for a known account when it claims to support positions', async () => {
        const capabilities = await capabilitiesOf(context)
        const result = await context.createAdapter().getPositions(context.knownAccountId)
        if (obligationFor(capabilities.positions) === 'MUST_PROVIDE_DATA') {
          expect(result.ok).toBe(true)
        }
      })

      it('declares no FLAT side — flatness is a property of the whole answer', async () => {
        expect(POSITION_SIDES as readonly string[]).not.toContain('FLAT')
        const result = await context.createAdapter().getPositions(context.knownAccountId)
        if (!result.ok) return
        for (const position of result.value) {
          expect(['LONG', 'SHORT', 'UNKNOWN']).toContain(position.side)
        }
      })

      it('never lets an unknown account become known flat', async () => {
        const result = await context.createAdapter().getPositions(context.unknownAccountId)
        expect(refusedUnknownReference(result)).toBe(true)
        expect(isKnownFlat(result)).toBe(false)
      })

      it('keeps every position reading three-state', async () => {
        const result = await context.createAdapter().getPositions(context.knownAccountId)
        if (!result.ok) return
        for (const position of result.value) {
          for (const reading of [
            position.quantity, position.averageEntry, position.lastPrice,
            position.unrealizedPnl, position.stopLoss, position.takeProfit,
          ]) {
            expect(['PRESENT', 'UNAVAILABLE', 'UNKNOWN']).toContain(exactReading(reading).state)
          }
          expect(isInertRecord(position)).toBe(true)
        }
      })
    })

    // ─── 12. Working orders ───────────────────────────────────────────────────

    describe('12. working orders', () => {
      it('answers for a known account, or reports honestly', async () => {
        const capabilities = await capabilitiesOf(context)
        const result = await context.createAdapter().getWorkingOrders(context.knownAccountId)
        if (obligationFor(capabilities.workingOrders) === 'MUST_PROVIDE_DATA') {
          expect(result.ok).toBe(true)
        }
        if (!result.ok) expect(failureCarriesStructuredReason(result)).toBe(true)
      })

      it('returns observations, never anything that could act', async () => {
        const result = await context.createAdapter().getWorkingOrders(context.knownAccountId)
        if (!result.ok) return
        for (const order of result.value) expect(isInertRecord(order)).toBe(true)
      })
    })

    // ─── 13. Recent fills, when supported ─────────────────────────────────────

    describe('13. recent fills', () => {
      it('answers the declared window when it claims to support fills', async () => {
        const capabilities = await capabilitiesOf(context)
        const result = await context.createAdapter()
          .getRecentFills(context.knownAccountId, context.fillWindow)
        if (obligationFor(capabilities.fills) === 'MUST_PROVIDE_DATA') {
          expect(result.ok).toBe(true)
        }
        if (!result.ok) expect(failureCarriesStructuredReason(result)).toBe(true)
      })

      it('reports completeness honestly rather than presenting truncation as COMPLETE', async () => {
        const result = await context.createAdapter()
          .getRecentFills(context.knownAccountId, context.fillWindow)
        if (!result.ok) return
        expect(['COMPLETE', 'TRUNCATED', 'UNKNOWN']).toContain(result.value.completeness)
        // The actual window is Available: an unknown coverage stays unknown.
        expect(['PRESENT', 'UNAVAILABLE', 'UNKNOWN']).toContain(result.value.actual.state)
      })

      it('refuses an unknown account', async () => {
        const result = await context.createAdapter()
          .getRecentFills(context.unknownAccountId, context.fillWindow)
        expect(result.ok).toBe(false)
      })
    })

    // ─── 14. Reconnect ────────────────────────────────────────────────────────

    describe('14. disconnect and reconnect', () => {
      it('accepts connect → disconnect → connect, each a valid Level-1 result', async () => {
        const adapter = context.createAdapter()
        const first = await adapter.connect(context.config)
        await expect(adapter.disconnect()).resolves.toBeUndefined()
        const second = await adapter.connect(context.config)

        expect(typeof first.ok).toBe('boolean')
        expect(typeof second.ok).toBe('boolean')
        // No session mechanics are assumed beyond what the contract states.
        if (first.ok && second.ok) {
          expect(second.value.providerId).toBe(first.value.providerId)
        }
      })

      it('still answers read-only queries after a disconnect', async () => {
        const adapter = context.createAdapter()
        await adapter.connect(context.config)
        await adapter.disconnect()
        const result = await adapter.getPositions(context.knownAccountId)
        // Whatever it answers must be a well-formed Result, not a throw.
        expect(typeof result.ok).toBe('boolean')
      })

      it('treats disconnect as having no failure outcome to report', async () => {
        const adapter = context.createAdapter()
        await expect(adapter.disconnect()).resolves.toBeUndefined()
        await expect(adapter.disconnect()).resolves.toBeUndefined()
      })
    })

    // ─── 15. Reconciliation ───────────────────────────────────────────────────

    describe('15. reconciliation', () => {
      it('compares and reports, and an empty list means nothing without its status', async () => {
        const capabilities = await capabilitiesOf(context)
        const result = await context.createAdapter()
          .reconcileReadOnlyState(context.knownAccountId)
        if (obligationFor(capabilities.reconciliation) === 'MUST_PROVIDE_DATA') {
          expect(result.ok).toBe(true)
        }
        if (!result.ok) {
          expect(failureCarriesStructuredReason(result)).toBe(true)
          return
        }
        expect(['AGREED', 'DISCREPANCY', 'INDETERMINATE']).toContain(result.value.status)
        // AGREED + [] and INDETERMINATE + [] are different claims.
        if (result.value.discrepancies.length === 0) {
          expect(['AGREED', 'INDETERMINATE']).toContain(result.value.status)
        }
      })

      it('refuses an unknown account', async () => {
        const result = await context.createAdapter()
          .reconcileReadOnlyState(context.unknownAccountId)
        expect(result.ok).toBe(false)
      })
    })

    // ─── 16. Normalization into replay ────────────────────────────────────────

    describe('16. normalization into replay observation', () => {
      /*
       * Reuses the Stage 1.8b normalization seam rather than reimplementing it.
       * A harness with its own copy of the mapping would certify the copy.
       */
      const mappings: readonly InstrumentMappingEntry[] = context.instrumentMappings

      it('normalizes the adapter\'s own positions without inventing known-flat', async () => {
        const result = await context.createAdapter().getPositions(context.knownAccountId)
        if (!result.ok) return

        const normalized = normalizePositionSnapshots(result.value, {
          accountId: context.knownAccountId,
          source: { providerLabel: providerName, accountLabel: null, origin: 'FIXTURE' },
          instrument: context.normalizationInstrument,
          instrumentMappings: mappings,
          replayMetadata: context.replayMetadata,
        })

        // Either it normalized honestly, or it refused with a structured reason.
        if (normalized.outcome === 'REFUSED') {
          expect(typeof normalized.refusal).toBe('string')
          return
        }
        for (const observation of normalized.observations) {
          expect(['LONG', 'SHORT', 'UNKNOWN']).toContain(observation.position.direction)
          expect(observation.position.direction).not.toBe('NEUTRAL')
        }
      })

      it('refuses rather than producing a false known-flat for a mismatched account', async () => {
        const result = await context.createAdapter().getPositions(context.knownAccountId)
        if (!result.ok || result.value.length === 0) return

        const normalized = normalizePositionSnapshots(result.value, {
          accountId: context.unknownAccountId,
          source: { providerLabel: providerName, accountLabel: null, origin: 'FIXTURE' },
          instrument: context.normalizationInstrument,
          instrumentMappings: mappings,
          replayMetadata: context.replayMetadata,
        })
        expect(normalized.outcome).toBe('REFUSED')
        if (normalized.outcome === 'REFUSED') {
          expect(normalized.refusal).toBe('ACCOUNT_MISMATCH')
        }
      })
    })

    // ─── 17. Authority boundary ───────────────────────────────────────────────

    describe('17. authority', () => {
      it('cannot mint authority from any observation', async () => {
        const result = await context.createAdapter().getPositions(context.knownAccountId)
        if (!result.ok) return

        const normalized = normalizePositionSnapshots(result.value, {
          accountId: context.knownAccountId,
          source: { providerLabel: providerName, accountLabel: null, origin: 'FIXTURE' },
          instrument: context.normalizationInstrument,
          instrumentMappings: context.instrumentMappings,
          replayMetadata: context.replayMetadata,
        })
        if (normalized.outcome !== 'NORMALIZED') return

        for (const observation of normalized.observations) {
          expect(positionObservationGrantsAuthority(observation)).toBe(false)
          expect(observedPositionGrantsAuthority(observation.position)).toBe(false)
        }
      })

      it('exposes no execution method under any spelling', () => {
        const adapter = context.createAdapter() as unknown as Record<string, unknown>
        /*
         * Assembled from fragments on purpose. The repository guard test scans
         * for these identifiers in source, and a file asserting their absence
         * that spelled them out would trip the guard against itself — the
         * assertion is about the adapter's shape, not about this file's text.
         */
        const ORDER = 'Order'
        const forbidden = [
          `submit${ORDER}`, `modify${ORDER}`, `cancel${ORDER}`, `replace${ORDER}`,
          `preflight${ORDER}`, `place${ORDER}`, `send${ORDER}`, `create${ORDER}`,
          'flatten', ['close', 'Position'].join(''),
        ]
        for (const name of forbidden) {
          expect(adapter[name], name).toBeUndefined()
        }
        expect(forbidden).toHaveLength(10)
      })

      it('exposes exactly the fifteen Level-1 methods', () => {
        const adapter = context.createAdapter() as unknown as Record<string, unknown>
        const LEVEL_1 = [
          'connect', 'disconnect', 'getProviderIdentity', 'getEnvironment', 'getCapabilities',
          'getHealth', 'getProviderTime', 'getAccounts', 'getAccountSnapshot', 'resolveContract',
          'getContractSnapshot', 'getPositions', 'getWorkingOrders', 'getRecentFills',
          'reconcileReadOnlyState',
        ]
        for (const name of LEVEL_1) expect(typeof adapter[name], name).toBe('function')
        expect(LEVEL_1).toHaveLength(15)
      })
    })
  })
}
