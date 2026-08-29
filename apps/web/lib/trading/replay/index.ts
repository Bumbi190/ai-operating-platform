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
export { buildReplayTimeline } from './timelines'
export type { ReplayTimeline } from './timelines'
export { projectReplay } from './projection'
export type { TradingReplayProjection } from './projection'
