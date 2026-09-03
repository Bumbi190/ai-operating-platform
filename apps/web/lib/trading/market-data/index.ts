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
 * NOT HERE, DELIBERATELY — GATE-08C-3A SOURCE-RESULT-SHAPE GAP
 * There is no `HistoricalContractCandleSource` interface. Canonical v1.0 §24
 * says historical and live sources differ in pagination, exhaustion,
 * subscription lifecycle and backpressure, and it does not settle any of them
 * for a contract-scoped interval request — the existing root-scoped source is
 * count-and-cursor paged, which is a different shape again. Inventing a result
 * type would be manufacturing those semantics. The request DTO is the whole of
 * what C3A can honestly define.
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

// ─── The fixture reference source ─────────────────────────────────────────────
export {
  FIXTURE_HISTORY_END,
  FIXTURE_HISTORY_LENGTH,
  createFixtureHistoricalSource,
  timeframeStepMs,
} from './fixture-history'
export type { FixtureHistoryOptions } from './fixture-history'
