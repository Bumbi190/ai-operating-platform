/**
 * Omnira Trading — the recorded adapter as the first acceptance reference.
 *
 * WHY A REFERENCE CONTEXT EXISTS AT ALL
 * ─────────────────────────────────────
 * An acceptance suite nobody has run against anything is a wish, not a harness.
 * The recorded adapter is the first adapter put through it, and the point is as
 * much to certify the SUITE as to certify the adapter: if the suite passes
 * against a deterministic adapter whose every answer is authored, then the
 * cases are at least runnable and the obligations are at least satisfiable.
 *
 * It is NOT a claim that any real provider behaves this way, and passing here
 * is not evidence about Rithmic or anyone else.
 *
 * AUTHORED, DETERMINISTIC, AND DELIBERATELY UNEVEN
 * ───────────────────────────────────────────────
 * The capability declaration below is deliberately mixed — SUPPORTED,
 * UNSUPPORTED and UNKNOWN all appear — because a context where everything is
 * SUPPORTED would never exercise the honest-reporting branch, and the four-state
 * vocabulary would go untested. Same for the readings: PRESENT, UNAVAILABLE and
 * UNKNOWN all appear on the same position.
 *
 * The five awkward decimals from the acceptance brief are all present on one
 * position, so exactness is proven on values where a JS number demonstrably
 * fails rather than on values that happen to survive.
 */

import type { AccountId, InstrumentId, PositionId } from '../ids'
import type { MarketInstrument, Timestamp } from '../market-view'
import { ok, present, unavailable, unknown } from '../provider'
import type { ContractId, PositionSnapshot, ProviderId, ProviderTimestamp } from '../provider'
import {
  createRecordedExecutionProviderAdapter,
  recordedDecimal,
  type InstrumentMappingEntry,
  type ObservationReplayMetadataEntry,
  type RecordedTranscript,
} from '../provider-normalization'
import type { ProviderAcceptanceContext } from './contract'

/* Authored constants. Branded values are asserted at this boundary, exactly as
 * the market-view fixtures assert `Timestamp`. Nothing here is a credential. */
const PROVIDER_ID = 'provider-acceptance-recorded' as ProviderId
const KNOWN_ACCOUNT = 'acct-acceptance-known' as AccountId
const UNKNOWN_ACCOUNT = 'acct-acceptance-unknown' as AccountId
const KNOWN_CONTRACT = 'contract-acceptance-nq' as ContractId
const UNKNOWN_CONTRACT = 'contract-acceptance-nowhere' as ContractId
const INSTRUMENT_NQ = 'instr-acceptance-nq' as InstrumentId

const OBSERVED_AT = '2026-04-06T13:45:00.000Z' as Timestamp
const RECORDED_AT = '2026-04-06T13:45:03.000Z' as Timestamp
const WINDOW_TO = '2026-04-06T13:50:00.000Z' as Timestamp
const PROVIDER_TIME = '2026-04-06T13:44:59.500Z' as ProviderTimestamp

/** The instrument this reference reports on. */
export const ACCEPTANCE_INSTRUMENT: MarketInstrument = 'NQ'

export const ACCEPTANCE_INSTRUMENT_MAPPINGS: readonly InstrumentMappingEntry[] = [
  { instrumentId: INSTRUMENT_NQ, instrument: ACCEPTANCE_INSTRUMENT },
]

/**
 * The five decimals the acceptance brief names, on one position.
 *
 * Every one of them is a value a JS number changes or reformats:
 *   '99999999999999999' → 100000000000000000
 *   '0.000000000001'    → 1e-12, which the canonical parser then rejects
 *   '1.50'              → 1.5, losing the authored scale
 */
function exactnessPosition(): PositionSnapshot {
  return {
    positionId: 'pos-exactness' as PositionId,
    providerPositionRef: 'ref:pos-exactness',
    accountId: KNOWN_ACCOUNT,
    contractId: KNOWN_CONTRACT,
    instrumentId: present(INSTRUMENT_NQ),
    side: 'LONG',
    state: 'OPEN',
    quantity: present(recordedDecimal('1')),
    averageEntry: present(recordedDecimal('1.50')),
    lastPrice: present(recordedDecimal('0.000000000001')),
    unrealizedPnl: present(recordedDecimal('-3.75')),
    stopLoss: present(recordedDecimal('99999999999999999')),
    // The two absences, kept distinct: nothing to report vs not asked.
    takeProfit: unknown(),
    openedAt: present(OBSERVED_AT),
    observedAt: OBSERVED_AT,
    providerTime: present(PROVIDER_TIME),
  }
}

/** A SHORT position whose optional readings are absent in both ways. */
function sparsePosition(): PositionSnapshot {
  return {
    ...exactnessPosition(),
    positionId: 'pos-sparse' as PositionId,
    providerPositionRef: 'ref:pos-sparse',
    side: 'SHORT',
    quantity: present(recordedDecimal('2')),
    averageEntry: unavailable(),
    lastPrice: unknown(),
    unrealizedPnl: unavailable(),
    stopLoss: unknown(),
    takeProfit: unavailable(),
    openedAt: unknown(),
  }
}

/** A position whose side the provider could not report. Never NEUTRAL. */
function unknownSidePosition(): PositionSnapshot {
  return {
    ...exactnessPosition(),
    positionId: 'pos-unknown-side' as PositionId,
    providerPositionRef: 'ref:pos-unknown-side',
    side: 'UNKNOWN',
    state: 'UNKNOWN',
  }
}

export const ACCEPTANCE_POSITIONS: readonly PositionSnapshot[] = [
  exactnessPosition(),
  sparsePosition(),
  unknownSidePosition(),
]

/** Authored replay metadata, one entry per recorded position. */
export const ACCEPTANCE_REPLAY_METADATA: readonly ObservationReplayMetadataEntry[] =
  ACCEPTANCE_POSITIONS.map((position, index) => ({
    positionId: position.positionId,
    metadata: {
      observationId: `obs:${position.positionId}`,
      localSequence: index,
      kind: 'OPENED' as const,
      recordedAt: RECORDED_AT,
      freshness: 'FRESH' as const,
      unattributed: true,
      note: null,
      summary: `Observerad position ${position.positionId}.`,
    },
  }))

/**
 * The transcript this reference answers from.
 *
 * Only the KNOWN account and KNOWN contract are recorded. The unknown ones are
 * absent on purpose: that absence is what drives the fail-closed cases, and the
 * recorded adapter answers an unrecorded reference with a failure rather than
 * an empty success.
 */
export function acceptanceTranscript(): RecordedTranscript {
  return {
    connect: ok({
      providerId: PROVIDER_ID,
      sessionRef: 'session-acceptance',
      environment: 'development',
      resolvedCredentialMode: 'READ_ONLY_ENFORCED',
      establishedAt: OBSERVED_AT,
    }),
    identity: ok({
      providerId: PROVIDER_ID,
      displayLabel: 'Inspelad acceptansprovider',
      environment: 'development',
      providerVersion: present('acceptance-1'),
      observedAt: OBSERVED_AT,
    }),
    environment: ok('development'),
    capabilities: ok({
      readOnlyCredentialMode: 'READ_ONLY_ENFORCED',
      accountSnapshots: 'SUPPORTED',
      positions: 'SUPPORTED',
      workingOrders: 'SUPPORTED',
      fills: 'SUPPORTED',
      fillHistoryWindow: {
        state: 'SUPPORTED',
        maxLookbackMs: present(recordedDecimal('86400000')),
        // Deliberately not SUPPORTED, so the honest-reporting branch is real.
        supportsCursor: 'UNSUPPORTED',
      },
      contractDiscovery: 'SUPPORTED',
      contractTickSize: 'SUPPORTED',
      // A capability this provider genuinely cannot speak to.
      contractTickValue: 'UNKNOWN',
      contractMultiplier: 'SUPPORTED',
      providerTime: 'SUPPORTED',
      streamingState: 'UNSUPPORTED',
      reconciliation: 'SUPPORTED',
      observedAt: OBSERVED_AT,
    }),
    health: ok({ verdict: 'ALLOW', reasonCodes: [], observedAt: OBSERVED_AT }),
    providerTime: ok({
      providerTime: PROVIDER_TIME,
      observedAt: OBSERVED_AT,
      // Measured, not assumed. An unknown skew would stay UNKNOWN, never 0.
      skewMs: present(recordedDecimal('500')),
    }),
    accounts: ok([{
      accountId: KNOWN_ACCOUNT,
      providerAccountRef: 'provider-ref-acceptance',
      environment: 'development',
      displayLabel: present('Acceptanskonto'),
    }]),
    accountSnapshots: [{
      accountId: KNOWN_ACCOUNT,
      response: ok({
        accountId: KNOWN_ACCOUNT,
        providerAccountRef: 'provider-ref-acceptance',
        environment: 'development',
        currency: present('USD'),
        balance: present(recordedDecimal('50000.00')),
        equity: present(recordedDecimal('50000.00')),
        realizedPnl: present(recordedDecimal('0.00')),
        unrealizedPnl: unknown(),
        margin: unavailable(),
        freeMargin: unknown(),
        observedAt: OBSERVED_AT,
        providerTime: present(PROVIDER_TIME),
      }),
    }],
    /*
     * Only 'NQ' resolves. 'NQZ6' shares its prefix and is deliberately absent:
     * a front-month rule, a startsWith test or a month-code parser would
     * resolve it, and GATE-08 is open so nothing may.
     */
    contractResolutions: [{
      canonicalSymbol: 'NQ',
      response: ok({
        contractId: KNOWN_CONTRACT,
        instrumentId: INSTRUMENT_NQ,
        providerContractId: 'provider-contract-acceptance',
        resolvedAt: OBSERVED_AT,
      }),
    }],
    contractSnapshots: [{
      contractId: KNOWN_CONTRACT,
      response: ok({
        providerContractId: 'provider-contract-acceptance',
        contractId: KNOWN_CONTRACT,
        rootSymbol: present('NQ'),
        canonicalSymbol: present('NQ'),
        exchange: present('CME'),
        expiration: unknown(),
        tickSize: present(recordedDecimal('0.25')),
        // Matches the UNKNOWN capability above — the two agree.
        tickValue: unknown(),
        multiplier: present(recordedDecimal('20')),
        observedAt: OBSERVED_AT,
        source: 'PROVIDER',
      }),
    }],
    positions: [{ accountId: KNOWN_ACCOUNT, response: ok(ACCEPTANCE_POSITIONS) }],
    workingOrders: [{ accountId: KNOWN_ACCOUNT, response: ok([]) }],
    recentFills: [{
      accountId: KNOWN_ACCOUNT,
      response: ok({
        fills: [],
        requested: { from: OBSERVED_AT, to: WINDOW_TO },
        actual: present({ from: OBSERVED_AT, to: WINDOW_TO }),
        completeness: 'COMPLETE',
        nextCursor: null,
      }),
    }],
    reconciliations: [{
      accountId: KNOWN_ACCOUNT,
      response: ok({
        accountId: KNOWN_ACCOUNT,
        status: 'AGREED',
        discrepancies: [],
        startedAt: OBSERVED_AT,
        completedAt: WINDOW_TO,
        observedAt: WINDOW_TO,
      }),
    }],
  }
}

/**
 * The acceptance context for the recorded adapter.
 *
 * `createAdapter` builds a fresh adapter over a fresh transcript each time, so
 * no acceptance case can depend on state another one left behind.
 */
export function createRecordedAcceptanceContext(): ProviderAcceptanceContext {
  return {
    createAdapter: () => createRecordedExecutionProviderAdapter(acceptanceTranscript()),
    config: {
      providerId: PROVIDER_ID,
      environment: 'development',
      // An opaque reference, never a secret (v1.2 F4).
      credentialSecretRef: 'secret-ref://acceptance/not-a-credential',
    },
    knownAccountId: KNOWN_ACCOUNT,
    unknownAccountId: UNKNOWN_ACCOUNT,
    resolvableSpec: {
      instrumentId: INSTRUMENT_NQ,
      canonicalSymbol: 'NQ',
      expiration: unknown(),
      providerSymbol: unknown(),
    },
    unresolvableSpec: {
      instrumentId: INSTRUMENT_NQ,
      // Shares the 'NQ' prefix on purpose — inference would resolve it.
      canonicalSymbol: 'NQZ6',
      expiration: unknown(),
      providerSymbol: unknown(),
    },
    knownContractId: KNOWN_CONTRACT,
    unknownContractId: UNKNOWN_CONTRACT,
    fillWindow: { from: OBSERVED_AT, to: WINDOW_TO },
    instrumentMappings: ACCEPTANCE_INSTRUMENT_MAPPINGS,
    normalizationInstrument: ACCEPTANCE_INSTRUMENT,
    replayMetadata: ACCEPTANCE_REPLAY_METADATA,
  }
}
