/**
 * Omnira Trading — a `PositionObservationSource` backed by a recorded adapter.
 *
 * THE PATH THIS COMPLETES
 * ───────────────────────
 *     recorded provider-shaped transcript
 *       → RecordedExecutionProviderAdapter   (the Level-1 port, all 15 methods)
 *       → provider-normalization             (the sibling bridge)
 *       → PositionObservationSource          ← this file
 *       → Stage 1.7 deterministic assembly
 *       → ReplayTimeline / replay projection
 *
 * It ADDS a path; it replaces nothing. `createFixturePositionObservationSource`
 * remains the independent Stage 1.7 fixture route, and both coexist because they
 * prove different things: that one authors observations directly, this one
 * proves the provider port can produce the same shape without losing anything.
 *
 * BOUND TO ONE ACCOUNT, BY CONSTRUCTION
 * ─────────────────────────────────────
 * The account is fixed when the source is built and is NOT a query parameter.
 * `PositionObservationQuery` stays instrument-only, so a caller cannot enumerate
 * or address accounts by asking — there is no account id in the query at all,
 * only the opaque, already-redacted label the source declares.
 *
 * FIXTURE, AND NOT CONFIGURABLE
 * ─────────────────────────────
 * `origin` is the literal `'FIXTURE'`. There is no knob, no option and no
 * environment check that can raise it to `SIMULATION` or `LIVE`. Recorded data
 * that could claim LIVE would be able to present authored numbers as real broker
 * state, and no configuration flexibility is worth that.
 *
 * AUTHORITY IS ISSUED, NOT DERIVED FROM DATA.
 */

import type { AccountId } from '../ids'
import type { MarketInstrument, Timestamp } from '../market-view'
import type { ExecutionProviderAdapter } from '../provider'
import {
  observationSourceOf,
  validatePositionObservationBatch,
  type PositionObservationBatch,
  type PositionObservationQuery,
  type PositionObservationSource,
} from '../replay'
import { normalizePositionSnapshots } from './normalization'
import type {
  InstrumentMappingEntry,
  ObservationReplayMetadataEntry,
} from './transcript'

/** What a recorded source calls itself. Display metadata, never a credential. */
export const RECORDED_PROVIDER_LABEL = 'Inspelad provider'

export interface RecordedProviderPositionObservationConfig {
  /** The Level-1 port to read from. Only `getPositions` is called. */
  readonly adapter: ExecutionProviderAdapter
  /** The single account this source observes. Never exposed as display text. */
  readonly accountId: AccountId
  /** Opaque and already redacted, or null. Never the raw account id. */
  readonly accountLabel: string | null
  readonly instrumentMappings: readonly InstrumentMappingEntry[]
  readonly replayMetadata: readonly ObservationReplayMetadataEntry[]
  /**
   * When the provider was observed. Market time, authored.
   *
   * Explicit because there is no honest alternative: a wall clock is forbidden,
   * and deriving it from the snapshots would leave known-flat — which has no
   * snapshots at all — with nothing to derive from.
   */
  readonly observedAt: Timestamp
  /** Distinguishes several recorded sources in one merge. */
  readonly sourceId?: string
}

/**
 * The instruments this source can answer for.
 *
 * Read straight off the explicit mapping table, de-duplicated in mapping order.
 * That is a restatement of authored configuration, not an inference about what
 * the provider trades.
 */
function mappedInstruments(
  mappings: readonly InstrumentMappingEntry[],
): readonly MarketInstrument[] {
  const seen: MarketInstrument[] = []
  for (const entry of mappings) {
    if (!seen.includes(entry.instrument)) seen.push(entry.instrument)
  }
  return seen
}

/**
 * Build a position-observation source over a recorded Level-1 adapter.
 *
 * FAIL-CLOSED IN BOTH DIRECTIONS THAT MATTER
 * ──────────────────────────────────────────
 *   provider failure          → UNAVAILABLE   ("we could not find out")
 *   normalization refusal     → UNAVAILABLE   (ambiguous attribution, mismatched
 *                                              account, duplicate identity,
 *                                              missing metadata)
 *   success with no positions → OBSERVED []   ("we looked, nothing is open")
 *
 * The third line is the one worth staring at. `OBSERVED + []` is a positive
 * claim, and it is reachable ONLY from a successful provider result that
 * genuinely contained no position. Nothing else in this function can produce it:
 * every refusal returns UNAVAILABLE instead, so no failure can shrink into
 * "the account is flat".
 */
export function createRecordedProviderPositionObservationSource(
  config: RecordedProviderPositionObservationConfig,
): PositionObservationSource {
  const accountLabel = config.accountLabel
  const instruments = mappedInstruments(config.instrumentMappings)
  const id = config.sourceId ?? 'observation:recorded'

  const source: PositionObservationSource = {
    id,
    label: 'Inspelad providerobservation',
    origin: 'FIXTURE',
    providerLabel: RECORDED_PROVIDER_LABEL,
    accountLabel,
    instruments: () => instruments,

    async observe(query: PositionObservationQuery): Promise<PositionObservationBatch> {
      const result = await config.adapter.getPositions(config.accountId)

      /*
       * Branching is on the `ok` discriminant alone. `ProviderError.message` is
       * carried into `detail` as operator and journal text and is never parsed,
       * matched or compared — the adapter contract is explicit that provider
       * error strings are not decision input.
       */
      if (!result.ok) {
        return {
          status: 'UNAVAILABLE',
          sourceId: id,
          detail: result.error.message,
        }
      }

      const normalized = normalizePositionSnapshots(result.value, {
        accountId: config.accountId,
        source: observationSourceOf(source),
        instrument: query.instrument,
        instrumentMappings: config.instrumentMappings,
        replayMetadata: config.replayMetadata,
      })

      if (normalized.outcome === 'REFUSED') {
        return { status: 'UNAVAILABLE', sourceId: id, detail: normalized.detail }
      }

      const batch: PositionObservationBatch = {
        status: 'OBSERVED',
        sourceId: id,
        origin: 'FIXTURE',
        providerLabel: RECORDED_PROVIDER_LABEL,
        accountLabel,
        observedAt: config.observedAt,
        observations: normalized.observations,
      }

      /*
       * The replay package's own identity check, run on our output rather than
       * trusted to be unnecessary. It catches exactly the faults this file could
       * introduce by drifting — a batch stamped with someone else's provenance,
       * an observation for an instrument nobody asked about, a position whose
       * source disagrees with its batch — and throws, because a source that
       * lies about what it observed has nothing useful to offer a caller.
       */
      validatePositionObservationBatch(source, query, batch)
      return batch
    },
  }

  return source
}
