/**
 * Omnira Trading — replay and state foundation, public surface.
 *
 * Import from `@/lib/trading/replay`, not from the modules beneath it.
 *
 * Everything here is deterministic and provider-neutral. Nothing here can mint
 * `RiskClearance`, `PropClearance`, `ApprovalGrant` or `ExecutionIntent`: this
 * package imports only sibling modules inside `lib/trading/` and never
 * `lib/trading/internal/`, where issuance lives.
 *
 * AUTHORITY IS ISSUED, NOT DERIVED FROM DATA.
 */

// ─── Clock ────────────────────────────────────────────────────────────────────
export {
  CLOCK_SOURCES,
  observationAgeMs,
  providerClockAt,
  replayClockAt,
  wallClockEpochMs,
} from './clock'
export type { ClockSource, MarketClock } from './clock'

// ─── Lifecycle ────────────────────────────────────────────────────────────────
export {
  LIFECYCLE_LABELS,
  SETUP_LIFECYCLES,
  allowedTransitionsFrom,
  canTransition,
  isTerminalLifecycle,
  lifecycleAllowsExecution,
  lifecycleToSetupStage,
} from './lifecycle'
export type { SetupLifecycle } from './lifecycle'

// ─── Events ───────────────────────────────────────────────────────────────────
export {
  EVENT_ORIGINS,
  REPLAY_EVENT_TYPES,
  eventsForCorrelation,
  journalMappingFor,
  journalableEvents,
  orderReplayEvents,
  replayEvent,
  replayEventId,
  serializeTimeline,
  toTradingEvent,
} from './events'
export type {
  EventOrigin,
  JournalConversionContext,
  ReplayEvent,
  ReplayEventPayload,
  ReplayEventType,
} from './events'

// ─── Planned trade ────────────────────────────────────────────────────────────
export { plannedTradeExpiredAt, plannedTradeIsExecutable } from './planned-trade'
export type { PlannedTradeView } from './planned-trade'

// ─── Observed position ────────────────────────────────────────────────────────
export {
  OBSERVED_POSITION_STATES,
  observationIsStale,
  observedOrNull,
  observedPositionGrantsAuthority,
  present,
  unavailable,
  unknownValue,
} from './observed-position'
export type {
  ObservationSource,
  ObservedPosition,
  ObservedPositionState,
  ObservedValue,
} from './observed-position'

// ─── State ────────────────────────────────────────────────────────────────────
export { applyReplayEvent, initialReplayState, projectStateAt } from './state'
export type { InitialStateInput, ReplayConfirmations, ReplayState } from './state'

// ─── Engine ───────────────────────────────────────────────────────────────────
export {
  INITIAL_CURSOR,
  PLAYBACK_SPEEDS,
  clampPosition,
  clockAt,
  isAtEnd,
  isAtStart,
  isPlaybackSpeed,
  pause,
  play,
  replayLength,
  replayProgress,
  resetCursor,
  seekTo,
  seekToTime,
  setSpeed,
  stepBackward,
  stepForward,
  tickIntervalMs,
} from './engine'
export type { PlaybackSpeed, ReplayCursor } from './engine'

// ─── Timelines and projection ─────────────────────────────────────────────────
/*
 * `buildReplayTimeline` is deliberately NOT exported here.
 *
 * It builds a timeline synchronously, straight from the fixture generator, and
 * that is a legal bypass of the source seam — the exact shortcut Stage 1.6
 * exists to close. Application code acquires timelines through
 * `ReplayTimelineSource`; anything that genuinely needs the synchronous
 * fixture helper imports `./timelines` directly and is visible in review for
 * doing so.
 *
 * `assembleReplayTimeline` stays public: it is the authoring step a source
 * calls with a base it has already obtained, so it cannot bypass anything.
 */
export { assembleReplayTimeline } from './timelines'
export type { ReplayTimeline } from './timelines'

// ─── Async load state ─────────────────────────────────────────────────────────
export {
  LOADING,
  UNAVAILABLE_STATE,
  errorState,
  identityOfTimeline,
  isCurrentGeneration,
  isUsableSeed,
  loadTimelineState,
  readyState,
  timelineIdentity,
  timelineOf,
} from './load-state'
export type { LoadOutcome, ReplayLoadState } from './load-state'

// ─── Provider observation seam ────────────────────────────────────────────────
export {
  POSITION_OBSERVATION_KINDS,
  isKnownFlat,
  observationSourceOf,
  observationsOf,
  positionObservationGrantsAuthority,
  validatePositionObservationBatch,
} from './position-observation'
export type {
  ObservedPositionBatch,
  PositionObservation,
  PositionObservationBatch,
  PositionObservationKind,
  PositionObservationQuery,
  PositionObservationSource,
  UnavailablePositionObservation,
} from './position-observation'

/*
 * `fixturePositionObservations` and `defaultFixtureObservationSource` are
 * deliberately NOT exported here, for the same reason `buildReplayTimeline` is
 * not: they author fixture data without a source in the way, and application
 * code has no business doing that. `createFixturePositionObservationSource` IS
 * public — it is a source, so nothing that uses it bypasses a seam.
 */
export { createFixturePositionObservationSource } from './fixture-provider'
export type {
  FixtureObservationOptions,
  FixturePositionObservationConfig,
} from './fixture-provider'

// ─── Deterministic multi-stream assembly ──────────────────────────────────────
export {
  REPLAY_STREAM_KINDS,
  STREAM_TIE_BREAK_PRIORITY,
  compareStreamEntries,
  isSameStreamEntry,
  mergeReplayStreams,
} from './streams'
export type {
  MergedStreamEntry,
  ReplayStream,
  ReplayStreamEntry,
  ReplayStreamKind,
} from './streams'

// ─── Source seam ──────────────────────────────────────────────────────────────
export {
  ALL_INSTRUMENTS,
  ALL_TIMEFRAMES,
  createFixtureReplayTimelineSource,
  sourceSupports,
} from './source'
export type { FixtureReplaySourceConfig, ReplayTimelineSource } from './source'
export { projectReplay } from './projection'
export type { TradingReplayProjection } from './projection'
