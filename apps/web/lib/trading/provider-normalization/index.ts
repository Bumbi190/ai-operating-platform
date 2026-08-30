/**
 * Omnira Trading — provider → replay normalization, public surface.
 *
 * Import from `@/lib/trading/provider-normalization`, not from the modules
 * beneath it.
 *
 * A SIBLING OF `provider/` AND `replay/`, and the only package allowed to import
 * both. That permission exists for exactly one purpose — translating between two
 * separately-owned vocabularies — and it does not weaken the rule it sits beside:
 *
 *     provider/  MUST NOT import replay/
 *     replay/    MUST NOT import provider/
 *
 * Both of those remain true, and `import-discipline.test.ts` proves all three
 * statements rather than asserting them here.
 *
 * SERVER AND TEST SIDE. Deliberately NOT re-exported from the `@/lib/trading`
 * barrel, for the same reason `provider/` is not: nothing in the browser has any
 * business holding a provider port, and keeping it off the barrel makes the
 * client payload delta structurally zero rather than merely observed to be zero.
 *
 * This package never imports `lib/trading/internal/`, where execution authority
 * is issued.
 *
 * AUTHORITY IS ISSUED, NOT DERIVED FROM DATA.
 */

// ─── The recorded transcript ──────────────────────────────────────────────────
export { noRecordedResponse, recordedDecimal, recordedForAccount, recordedForContract } from './transcript'
export type {
  InstrumentMappingEntry,
  ObservationReplayMetadata,
  ObservationReplayMetadataEntry,
  RecordedByAccount,
  RecordedByContract,
  RecordedContractResolution,
  RecordedFillHistory,
  RecordedTranscript,
} from './transcript'

// ─── The recorded Level-1 adapter ─────────────────────────────────────────────
export { createRecordedExecutionProviderAdapter } from './recorded-adapter'

// ─── The normalization ────────────────────────────────────────────────────────
export { NORMALIZATION_REFUSALS, mapAvailable, normalizePositionSnapshots } from './normalization'
export type {
  NormalizationRefusal,
  PositionBatchNormalization,
  PositionNormalizationContext,
} from './normalization'

// ─── The source ───────────────────────────────────────────────────────────────
export {
  RECORDED_PROVIDER_LABEL,
  createRecordedProviderPositionObservationSource,
} from './position-source'
export type { RecordedProviderPositionObservationConfig } from './position-source'
