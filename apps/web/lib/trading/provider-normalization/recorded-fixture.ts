/**
 * Omnira Trading — authored recorded transcripts for the normalization harness.
 *
 * DETERMINISTIC AND AUTHORED, END TO END
 * ──────────────────────────────────────
 * Every instant is a written constant, every number is an exact decimal STRING
 * parsed by the canonical parser, and every identity is spelled out. Nothing
 * here reads a clock, draws a random value, mints a uuid, touches a file or
 * reaches a network. Two builds of the same fixture are deeply equal.
 *
 * These describe NOTHING about any real provider. The values are invented for
 * the purpose of exercising a mapping, and no scenario here demonstrates that
 * anything is profitable or that any provider behaves this way.
 *
 * `development` is the recorded environment throughout — the least consequential
 * of the four, and never `live`, so nothing in a fixture can be mistaken for a
 * recording of real trading.
 */

import type { Decimal } from '../decimal'
import type { AccountId, InstrumentId, PositionId } from '../ids'
import type { MarketFreshness, MarketInstrument, Timestamp } from '../market-view'
import { present, unavailable, unknown, ok, type Available, type ContractId } from '../provider'
import type {
  AccountRef,
  PositionSide,
  PositionSnapshot,
  PositionState,
  ProviderId,
  ProviderTimestamp,
} from '../provider'
import type { PositionObservationKind } from '../replay'
import {
  recordedDecimal,
  type InstrumentMappingEntry,
  type ObservationReplayMetadataEntry,
  type RecordedTranscript,
} from './transcript'

/*
 * Branded values are asserted at this boundary rather than parsed, exactly as
 * the market-view fixtures assert `Timestamp`. These are authored constants in
 * a file whose whole purpose is to author them.
 */
export const ACCOUNT_BOUND = 'acct-recorded-bound' as AccountId
export const ACCOUNT_OTHER = 'acct-recorded-other' as AccountId

export const INSTRUMENT_ID_NQ = 'instr-nq' as InstrumentId
export const INSTRUMENT_ID_ES = 'instr-es' as InstrumentId
export const INSTRUMENT_ID_UNMAPPED = 'instr-not-in-table' as InstrumentId

export const CONTRACT_NQ = 'contract-nq-recorded' as ContractId
export const PROVIDER_ID = 'provider-recorded' as ProviderId

/** Market time. Written out, never computed from a clock. */
export const OCCURRED_AT = '2026-03-02T14:30:00.000Z' as Timestamp
/** Later than `OCCURRED_AT`, so delayed reporting is expressible. */
export const RECORDED_AT = '2026-03-02T14:30:04.000Z' as Timestamp
export const BATCH_OBSERVED_AT = '2026-03-02T14:31:00.000Z' as Timestamp

/** Provider-clock provenance. Deliberately unlike the market instants above. */
export const PROVIDER_TIME = '2026-03-02T14:29:59.750Z' as ProviderTimestamp

/** The explicit instrument table. The only way an instrument is ever resolved. */
export const INSTRUMENT_MAPPINGS: readonly InstrumentMappingEntry[] = [
  { instrumentId: INSTRUMENT_ID_NQ, instrument: 'NQ' },
  { instrumentId: INSTRUMENT_ID_ES, instrument: 'ES' },
]

// ─── Position authoring ───────────────────────────────────────────────────────

export interface RecordedPositionOptions {
  readonly positionId: string
  readonly accountId?: AccountId
  readonly instrumentId?: Available<InstrumentId>
  readonly side?: PositionSide
  readonly state?: PositionState
  readonly quantity?: Available<Decimal>
  readonly averageEntry?: Available<Decimal>
  readonly lastPrice?: Available<Decimal>
  readonly unrealizedPnl?: Available<Decimal>
  readonly stopLoss?: Available<Decimal>
  readonly takeProfit?: Available<Decimal>
  readonly openedAt?: Available<Timestamp>
  readonly observedAt?: Timestamp
  readonly providerTime?: Available<ProviderTimestamp>
}

/**
 * One recorded provider position.
 *
 * The defaults are a plain LONG with mixed availability, because a snapshot
 * where every field is PRESENT would never exercise the states that matter.
 * `unrealizedPnl` and `takeProfit` default to UNAVAILABLE and UNKNOWN
 * respectively — the provider says it has none, and the provider was not asked —
 * and those must stay distinguishable all the way through.
 */
export function recordedPosition(options: RecordedPositionOptions): PositionSnapshot {
  return {
    positionId: options.positionId as PositionId,
    providerPositionRef: `ref:${options.positionId}`,
    accountId: options.accountId ?? ACCOUNT_BOUND,
    contractId: CONTRACT_NQ,
    instrumentId: options.instrumentId ?? present(INSTRUMENT_ID_NQ),
    side: options.side ?? 'LONG',
    state: options.state ?? 'OPEN',
    quantity: options.quantity ?? present(recordedDecimal('2')),
    averageEntry: options.averageEntry ?? present(recordedDecimal('20172.00')),
    lastPrice: options.lastPrice ?? present(recordedDecimal('20180.25')),
    unrealizedPnl: options.unrealizedPnl ?? unavailable(),
    stopLoss: options.stopLoss ?? present(recordedDecimal('20143.00')),
    takeProfit: options.takeProfit ?? unknown(),
    openedAt: options.openedAt ?? present(OCCURRED_AT),
    observedAt: options.observedAt ?? OCCURRED_AT,
    providerTime: options.providerTime ?? present(PROVIDER_TIME),
  }
}

// ─── Replay metadata authoring ────────────────────────────────────────────────

export interface RecordedMetadataOptions {
  readonly positionId: string
  readonly observationId?: string
  readonly localSequence?: number
  readonly kind?: PositionObservationKind
  readonly recordedAt?: Timestamp
  readonly freshness?: MarketFreshness
  readonly unattributed?: boolean
  readonly note?: string | null
  readonly summary?: string
}

/** The replay-only facts for one recorded position. Every field authored. */
export function recordedMetadata(
  options: RecordedMetadataOptions,
): ObservationReplayMetadataEntry {
  return {
    positionId: options.positionId as PositionId,
    metadata: {
      observationId: options.observationId ?? `obs:${options.positionId}`,
      localSequence: options.localSequence ?? 0,
      kind: options.kind ?? 'OPENED',
      recordedAt: options.recordedAt ?? RECORDED_AT,
      freshness: options.freshness ?? 'FRESH',
      unattributed: options.unattributed ?? true,
      // `??` would swallow an explicitly authored null, and null is a legitimate
      // authored value — "there is no note" is a decision, not an omission.
      note: 'note' in options ? options.note ?? null : 'Observerad position utan motsvarande plan.',
      summary: options.summary ?? 'Observerad position utan motsvarande plan.',
    },
  }
}

// ─── Transcript authoring ─────────────────────────────────────────────────────

const ACCOUNT_REF: AccountRef = {
  accountId: ACCOUNT_BOUND,
  providerAccountRef: 'provider-ref-bound',
  environment: 'development',
  displayLabel: present('Inspelat konto'),
}

/**
 * A complete transcript whose recorded `getPositions` answer is supplied.
 *
 * Every one of the fifteen methods has an authored response, so no call can
 * fall through to a fabricated one. The non-position responses are deliberately
 * ordinary: this harness exists to exercise the position path, and the rest are
 * present to prove the port is fully implemented rather than partially stubbed.
 */
export function transcriptWithPositions(
  positions: RecordedTranscript['positions'],
): RecordedTranscript {
  return {
    connect: ok({
      providerId: PROVIDER_ID,
      sessionRef: 'session-recorded-1',
      environment: 'development',
      resolvedCredentialMode: 'READ_ONLY_ENFORCED',
      establishedAt: OCCURRED_AT,
    }),
    identity: ok({
      providerId: PROVIDER_ID,
      displayLabel: 'Inspelad provider',
      environment: 'development',
      providerVersion: present('recorded-1'),
      observedAt: OCCURRED_AT,
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
        supportsCursor: 'UNSUPPORTED',
      },
      contractDiscovery: 'SUPPORTED',
      contractTickSize: 'SUPPORTED',
      contractTickValue: 'UNKNOWN',
      contractMultiplier: 'SUPPORTED',
      providerTime: 'SUPPORTED',
      streamingState: 'UNSUPPORTED',
      reconciliation: 'SUPPORTED',
      observedAt: OCCURRED_AT,
    }),
    health: ok({ verdict: 'ALLOW', reasonCodes: [], observedAt: OCCURRED_AT }),
    providerTime: ok({
      providerTime: PROVIDER_TIME,
      observedAt: OCCURRED_AT,
      skewMs: present(recordedDecimal('250')),
    }),
    accounts: ok([ACCOUNT_REF]),
    accountSnapshots: [
      {
        accountId: ACCOUNT_BOUND,
        response: ok({
          accountId: ACCOUNT_BOUND,
          providerAccountRef: 'provider-ref-bound',
          environment: 'development',
          currency: present('USD'),
          balance: present(recordedDecimal('50000.00')),
          equity: present(recordedDecimal('50120.50')),
          realizedPnl: present(recordedDecimal('0.00')),
          unrealizedPnl: present(recordedDecimal('120.50')),
          margin: unknown(),
          freeMargin: unavailable(),
          observedAt: OCCURRED_AT,
          providerTime: present(PROVIDER_TIME),
        }),
      },
    ],
    contractResolutions: [
      {
        canonicalSymbol: 'NQ',
        response: ok({
          contractId: CONTRACT_NQ,
          instrumentId: INSTRUMENT_ID_NQ,
          providerContractId: 'provider-contract-nq',
          resolvedAt: OCCURRED_AT,
        }),
      },
    ],
    contractSnapshots: [
      {
        contractId: CONTRACT_NQ,
        response: ok({
          providerContractId: 'provider-contract-nq',
          contractId: CONTRACT_NQ,
          rootSymbol: present('NQ'),
          canonicalSymbol: present('NQ'),
          exchange: present('CME'),
          expiration: unknown(),
          tickSize: present(recordedDecimal('0.25')),
          tickValue: unknown(),
          multiplier: present(recordedDecimal('20')),
          observedAt: OCCURRED_AT,
          source: 'PROVIDER',
        }),
      },
    ],
    positions,
    workingOrders: [{ accountId: ACCOUNT_BOUND, response: ok([]) }],
    recentFills: [
      {
        accountId: ACCOUNT_BOUND,
        response: ok({
          fills: [],
          requested: { from: OCCURRED_AT, to: BATCH_OBSERVED_AT },
          actual: present({ from: OCCURRED_AT, to: BATCH_OBSERVED_AT }),
          completeness: 'COMPLETE',
          nextCursor: null,
        }),
      },
    ],
    reconciliations: [
      {
        accountId: ACCOUNT_BOUND,
        response: ok({
          accountId: ACCOUNT_BOUND,
          status: 'AGREED',
          discrepancies: [],
          startedAt: OCCURRED_AT,
          completedAt: BATCH_OBSERVED_AT,
          observedAt: BATCH_OBSERVED_AT,
        }),
      },
    ],
  }
}
