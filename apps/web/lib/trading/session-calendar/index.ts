/**
 * Omnira Trading — session calendar and canonical time grid, public surface.
 *
 * Import from `@/lib/trading/session-calendar`, not from the modules beneath it.
 *
 * Canonical authority:
 *   docs/trading-system/specifications/market-data/
 *   Omnira Trading System – Market Data & Contract Lifecycle – Canonical v1.0.md
 *
 * WHAT THIS PACKAGE IS
 * ────────────────────
 * The provider-neutral machinery that answers, for one bucket of one timeframe:
 *
 *     timeframe + instant
 *         ↓  grid                     (canonical boundaries, wall-clock anchored)
 *     NominalBucket
 *         ↓  SessionCalendar          (authored, versioned, explicitly covered)
 *     SessionExpectation              (expected minutes + effectiveTo, or UNKNOWN)
 *         ↓  accepted 1m observations + source state
 *     BucketEvidence                  (completeness, sessionTruncated)
 *         ↓
 *     4H strategy standing            (a data precondition, never a signal)
 *
 * WHAT IT IS NOT
 * ──────────────
 * It computes no exchange schedule. There is no holiday rule, no weekday
 * formula and no default session — §17 makes the concrete year data a
 * separately versioned artefact, and this package consumes such data rather
 * than inventing it.
 *
 * It reads no clock and no machine timezone. Every instant is supplied, every
 * zone conversion names `CANONICAL_TIMEZONE` explicitly, and no offset is ever
 * hard-coded — so the same inputs give the same answers on every machine and
 * after every restart (§26).
 *
 * It aggregates nothing. No open, high, low, close or volume is computed
 * anywhere in this package; only minute OPENING INSTANTS are read. Canonical
 * OHLCV aggregation is GATE-08C-2B.
 *
 * It mints no authority. An ELIGIBLE bucket grants exactly no permission to
 * trade, and nothing here can reach `lib/trading/internal/`.
 *
 * SESSION AND TIME-GRID FACTS ONLY
 * ────────────────────────────────
 * This package owns canonical session and time-grid facts, and nothing built on
 * top of them. Candle derivation is `@/lib/trading/candle-aggregation`;
 * contract-scoped windows and `ContractCandleSegment` are
 * `@/lib/trading/market-data`; and the materialisation of
 * `ContractSelectionDecision` is `@/lib/trading/contract-selection`. All three
 * are OUTSIDE this package, and the import-discipline suite fails the build if
 * one appears inside it.
 *
 * NOT YET HERE — GATE-08C-3 AND LATER
 * ───────────────────────────────────
 * Contract-scoped data SOURCES and the live-source contract remain later
 * slices — GATE-08C-3A SOURCE-RESULT-SHAPE GAP is still open. GATE-08 stays
 * DELVIS STÄNGD.
 */

// ─── Canonical grid ───────────────────────────────────────────────────────────
export { FOUR_HOUR_OPEN_HOURS, GRID_REFUSALS, bucketAt, isBucketOpen, isCanonicalMinuteOpen } from './grid'
export type { BucketResolution, FourHourOpenHour, GridRefusal, NominalBucket } from './grid'

// ─── Canonical-zone conversion ────────────────────────────────────────────────
export { instantAtLocalTime, localTimeAt } from './zone'
export type { LocalTime, ZonedInstant } from './zone'

// ─── The calendar ─────────────────────────────────────────────────────────────
export { SESSION_CALENDAR_PROBLEMS, buildSessionCalendar } from './calendar'
export type {
  SessionCalendar,
  SessionCalendarBuild,
  SessionCalendarInput,
  SessionCalendarProblem,
  SessionCalendarProblemCode,
  SessionCoverage,
  TradingInterval,
} from './calendar'

// ─── Expectation ──────────────────────────────────────────────────────────────
export { sessionExpectation } from './expectation'
export type { SessionExpectation } from './expectation'

// ─── Completeness ─────────────────────────────────────────────────────────────
export {
  BAR_COMPLETENESS,
  COMPLETENESS_PROBLEMS,
  OBSERVATION_SOURCE_STATES,
  evaluateBucketEvidence,
} from './completeness'
export type {
  BarCompleteness,
  BucketEvidence,
  CompletenessProblem,
  ObservationSourceState,
  ObservedMinutes,
} from './completeness'

// ─── Strategy precondition ────────────────────────────────────────────────────
export {
  FOUR_HOUR_STRATEGY_STANDINGS,
  STRATEGY_FOUR_HOUR_OPEN_HOURS,
  fourHourStrategyStanding,
  isStrategyFourHourOpen,
} from './strategy-eligibility'
export type { FourHourStrategyStanding, StrategyFourHourOpenHour } from './strategy-eligibility'
