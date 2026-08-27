/**
 * Omnira Trading Core — PUBLIC DOMAIN CONTRACT.
 *
 * This barrel is the supported surface of the trading domain. Code outside
 * `lib/trading` should import from `@/lib/trading` and nothing deeper.
 *
 * Canonical documentation: docs/trading-system/README.md
 * Precedence rules:       docs/trading-system/SOURCE_OF_TRUTH.md
 *
 * WHAT IS HERE: immutable record types, value objects, vocabulary, parsers and
 * read-only predicates. Everything on this surface merely constructs or
 * inspects data.
 *
 * WHAT IS NOT HERE, ON PURPOSE: anything that can mint execution authority.
 * Authority issuance and the execution gate live in `lib/trading/internal/` and
 * are not re-exported. Code importing only from `@/lib/trading` therefore
 * cannot turn a record it invented into a clearance, and cannot reach the gate
 * at all.
 *
 * Note what this means for the record constructors below: `riskDecision(...)`
 * and friends produce *data*, not permission. Building a record with
 * `result: 'ALLOW'` grants nothing, because the gate consumes capabilities
 * issued by `lib/trading/internal/authority.ts` — never raw records.
 *
 * Everything re-exported here is PUBLIC. Anything not re-exported is an
 * INTERNAL IMPLEMENTATION DETAIL and may change without notice.
 *
 * Phase 1 (Trading Core) provides identities, decision contracts, authority
 * boundaries and the execution gate. It performs no trading: there is no
 * Strategy Engine, no AI, no Risk Engine, no Prop Engine, no MT5 and no UI.
 * See ./README.md for the full boundary.
 */

// ─── Identity ─────────────────────────────────────────────────────────────────
export {
  MAX_ID_LENGTH,
  asId,
  isWellFormedId,
  newId,
  parseId,
} from './ids'
export type {
  AccountId, AiAnalysisId, ApprovalId, Branded, BrokerId, CorrelationId,
  EventId, ExecutionId, FillId, IncidentId, InstrumentId, KillSwitchId,
  OrderId, PositionId, PropDecisionId, PropFirmProfileId, ProposalId,
  RiskDecisionId, RiskProfileId, RunId, RunnerId, SetupId, SignalId,
  StrategyId, StrategyVersionId, ThesisId, TradeId, TradingId, TradingProjectId,
} from './ids'

// ─── Time ─────────────────────────────────────────────────────────────────────
export {
  CANONICAL_TIMEZONE,
  asTimestamp,
  isAfter,
  isExpiredAt,
  isTimestamp,
  parseTimestamp,
  timestampFrom,
  toEpochMs,
} from './time'
export type { CanonicalTimezone, Timestamp } from './time'

// ─── Exact numbers ────────────────────────────────────────────────────────────
export {
  MAX_DECIMAL_SCALE,
  asDecimal,
  compareDecimal,
  decimalAtLeast,
  decimalEquals,
  decimalToString,
  isPositive,
  isZero,
  parseDecimal,
  parseNonNegativeDecimal,
} from './decimal'
export type { Decimal, NonNegativeDecimal } from './decimal'

// ─── Environment ──────────────────────────────────────────────────────────────
export {
  TRADING_ENVIRONMENTS,
  environmentsAgree,
  isBrokerFacing,
  isLive,
  isTradingEnvironment,
  parseEnvironment,
} from './environment'
export type { TradingEnvironment } from './environment'

// ─── Authority ────────────────────────────────────────────────────────────────
export {
  AUTHORITY_MODES,
  VERDICTS,
  combineVerdicts,
  grantsPermission,
  isAuthorityMode,
  isVerdict,
  modeAllowsExecution,
  modeEnvironmentScope,
  modeRequiresManualApproval,
  parseAuthorityMode,
  resolveVerdict,
} from './authority'
export type { AuthorityMode, Verdict } from './authority'

// ─── Reason codes ─────────────────────────────────────────────────────────────
export { CORE_REASON_CODES, RISK_REASON_CODES, isReasonCode, reason } from './reason-codes'
export type { CoreReasonCode, Reason, ReasonCode, RiskReasonCode } from './reason-codes'

// ─── Versioning ───────────────────────────────────────────────────────────────
export {
  isVersionLabel,
  parseVersionLabel,
  propFirmProfileRef,
  riskProfileRef,
  sameStrategyVersion,
  strategyVersionRef,
} from './versions'
export type {
  DataSnapshotRef, DetectionVersionRef, PropFirmProfileRef,
  RiskProfileRef, StrategyVersionRef,
} from './versions'

// ─── Decision contracts ───────────────────────────────────────────────────────
export {
  BREAK_EVEN_TRIGGER_TYPES,
  DIRECTIONS,
  SETUP_GRADES,
  SIGNAL_STATUSES,
  SMT_STATES,
  TRADING_SESSIONS,
  aiAnalysis,
  propDecision,
  riskDecision,
  strategySignal,
} from './contracts'
export type {
  AiAnalysis, BreakEvenTriggerType, Direction, PropDecision, RiskDecision,
  RuleEvaluation, SetupGrade, SignalStatus, SmtState, StrategySignal, TradingSession,
} from './contracts'

// ─── Proposal and approval ────────────────────────────────────────────────────
export {
  APPROVAL_TYPES,
  PROPOSAL_STATUSES,
  approval,
  isApprovalExpired,
  isProposalExpired,
  isProposalStatus,
  statusAllowsExecution,
  statusIsTerminalForExecution,
  tradeProposal,
  withStatus,
} from './proposal'
export type { Approval, ApprovalType, ProposalStatus, TradeProposal } from './proposal'

// ─── Safety ───────────────────────────────────────────────────────────────────
export {
  KILL_SWITCH_SCOPES,
  findBlockingKillSwitch,
  healthVerdict,
  isKillSwitchActive,
} from './safety'
export type {
  ExecutionHealth, KillSwitch, KillSwitchScope, KillSwitchSnapshot, KillSwitchTarget,
} from './safety'

// ─── Execution intent (shape only) ────────────────────────────────────────────
// The intent TYPE is public so read-side code can display and analyse intents.
// Creating one requires the gate in `lib/trading/internal/`, which is not
// exported here. There is deliberately no public constructor.
export { EXECUTION_STATUSES, ORDER_TYPES } from './execution-intent'
export type { ExecutionIntent, ExecutionStatus, OrderType } from './execution-intent'

// ─── Events ───────────────────────────────────────────────────────────────────
export {
  EVENT_ENTITY_TYPES,
  EVENT_SEVERITIES,
  EVENT_TYPES,
  canonicalJson,
  causationChain,
  eventsForCorrelation,
  orderEvents,
  tradingEvent,
} from './events'
export type { EventEntityType, EventSeverity, EventType, TradingEvent } from './events'
