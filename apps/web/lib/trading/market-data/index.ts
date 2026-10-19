/**
 * Omnira Trading — historical market data, public surface.
 *
 * Import from `@/lib/trading/market-data`, not from the modules beneath it.
 *
 * WHAT THIS PACKAGE IS
 * ────────────────────
 * The provider-neutral contract and state machine for navigating a candle
 * history larger than one window. It fetches nothing: Stage 1.9B decides how
 * the chart BEHAVES so that a future Market Data Provider can be plugged in
 * without the behaviour being renegotiated.
 *
 * There is no Rithmic, no Tradovate, no exchange endpoint, no credential and no
 * network call anywhere in this package. The only implementation shipped is a
 * deterministic fixture source, clearly labelled as fixture data.
 *
 * EXACT PRICES THROUGHOUT
 * ───────────────────────
 * Everything here operates on canonical `MarketCandle` values with exact
 * `PriceText`. No candle price is converted to a number in this package;
 * presentation conversion lives in the Stage 1.9A chart boundary and nowhere
 * else.
 *
 * GATE-08 REMAINS OPEN. Requests carry canonical instrument roots. No front
 * month, no rollover, no continuous contract, no month-code parsing, no symbol
 * inference.
 */

// ─── The contract ─────────────────────────────────────────────────────────────
export {
  HISTORY_STATES,
  IN_FLIGHT_HISTORY_STATES,
  TERMINAL_HISTORY_STATES,
  canRequestOlder,
  detailOfPage,
  stateAfterPage,
} from './history'
export type {
  HistoricalCandleSource,
  HistoryPage,
  HistoryState,
  InitialWindowRequest,
  OlderWindowRequest,
} from './history'

// ─── Deterministic merge ──────────────────────────────────────────────────────
export { MERGE_REFUSALS, mergeOlderCandles, oldestLoadedTime } from './merge'
export type { MergeRefusal, MergeResult } from './merge'

// ─── The state machine ────────────────────────────────────────────────────────
export {
  LOAD_OLDER_WHITESPACE_BARS,
  historyReducer,
  initialHistoryModel,
  mayRequestOlder,
  shouldLoadOlder,
} from './history-controller'
export type { HistoryAction, HistoryModel, HistorySubject } from './history-controller'

// ─── Contract-scoped windows and segments (GATE-08C-3A) ───────────────────────
/*
 * The concrete-contract boundary. A window is what gets ASKED FOR; a segment is
 * what comes back, carrying exactly one `ResolvedContract` in its envelope.
 *
 * Root resolution happens before either exists (§13), so neither type has a
 * root field and neither can be built from a bare instrument.
 *
 * BESLUT N — C3C HISTORICAL SOURCE SHAPE
 * The contract-scoped source has a separate interval coverage/result contract,
 * not the root-based chart pagination API. Source assertions are never in
 * themselves strategy-authoritative. The returning segment must still pass
 * SessionCalendar/completeness and later strategy gates. No live source here.
 */
export {
  CANONICAL_OBSERVATION_TIMEFRAME,
  CONTRACT_WINDOW_PROBLEMS,
  buildContractDataWindow,
  buildHistoricalContractRequest,
} from './contract-window'
export type {
  CanonicalObservationTimeframe,
  ContractDataWindow,
  ContractWindowBuild,
  ContractWindowProblem,
  HistoricalContractRequest,
  HistoricalContractRequestBuild,
} from './contract-window'

export {
  SEGMENT_PROBLEMS,
  SEGMENT_SEQUENCE_PROBLEMS,
  buildContractCandleSegment,
  checkSegmentSequence,
  sameSegmentContract,
} from './contract-segment'
export type {
  ContractCandleSegment,
  SegmentBuild,
  SegmentProblem,
  SegmentSequenceCheck,
  SegmentSequenceProblem,
} from './contract-segment'

// ─── C3C concrete-contract historical source and acceptance boundary ───────────
export {
  inspectHistoricalContractResult,
  readHistoricalContractChunk,
} from './historical-contract-source'
export type {
  HistoricalBoundaryProblem,
  HistoricalContractCandleSource,
  HistoricalContractSourceResult,
  HistoricalCoverage,
  HistoricalSourceInspection,
} from './historical-contract-source'

// ─── The fixture reference source ─────────────────────────────────────────────
export {
  FIXTURE_HISTORY_END,
  FIXTURE_HISTORY_LENGTH,
  createFixtureHistoricalSource,
  timeframeStepMs,
} from './fixture-history'
export type { FixtureHistoryOptions } from './fixture-history'
