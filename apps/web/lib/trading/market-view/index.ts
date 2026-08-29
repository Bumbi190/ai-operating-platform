/**
 * Omnira Trading — Atlas Market View, public surface.
 *
 * Import from `@/lib/trading/market-view`, not from the modules beneath it.
 *
 * Everything here is presentation. Nothing here can mint `RiskClearance`,
 * `PropClearance`, `ApprovalGrant` or `ExecutionIntent` — this package imports
 * only the public `@/lib/trading` barrel, which exports no constructor for any
 * of them, and it never reaches `lib/trading/internal/`.
 *
 * AUTHORITY IS ISSUED, NOT DERIVED FROM DATA.
 */

export {
  DISPLAY_DIRECTIONS,
  DISPLAY_SETUP_GRADES,
  FVG_STATES,
  INSTRUMENT_LABELS,
  LIQUIDITY_KINDS,
  LIQUIDITY_STATUSES,
  MANIPULATION_KINDS,
  MARKET_DATA_ORIGINS,
  MARKET_FRESHNESS,
  MARKET_INSTRUMENTS,
  MARKET_PROPOSAL_STATUSES,
  MARKET_TIMEFRAMES,
  POSITION_DISPLAY_STATES,
  PRESENCE_STATES,
  PROP_DISPLAY_STATUSES,
  RISK_ENGINE_STATUSES,
  SAFETY_BANNERS,
  SESSION_WINDOW_STATES,
  SETUP_STAGES,
  isLiveMarketView,
  isMarketInstrument,
  isMarketTimeframe,
  parseMarketInstrument,
  parseMarketTimeframe,
  parsePriceText,
  priceMagnitude,
  priceText,
  proposalIsExecutable,
  resolveSafetyBanner,
} from './snapshot'

export type {
  DisplayDirection,
  DisplaySetupGrade,
  ExplanationEntry,
  FairValueGap,
  FourHourOpenAnnotation,
  FvgState,
  LiquidityKind,
  LiquidityLevel,
  LiquidityStatus,
  LiquidityZone,
  ManipulationKind,
  ManipulationMarker,
  MarketCandle,
  MarketDataOrigin,
  MarketDataProvenance,
  MarketExplanation,
  MarketFreshness,
  MarketInstrument,
  MarketProposalStatus,
  MarketThesis,
  MarketTimeframe,
  MarketTradeProposal,
  PositionDisplayInfo,
  PositionDisplayState,
  PresenceState,
  PriceText,
  PropDisplayState,
  PropDisplayStatus,
  RiskDisplayState,
  RiskEngineStatus,
  SafetyBanner,
  SessionDisplayState,
  SessionWindowInfo,
  SessionWindowState,
  SetupConfirmations,
  SetupStage,
  SetupState,
  TradingMarketViewSnapshot,
} from './snapshot'

/**
 * Canonical trading vocabulary the view renders, re-exported so a component
 * needs one import and never reaches past a barrel. These are the SAME types as
 * `@/lib/trading` — re-exported, not redefined, so there is no second SMT or
 * direction vocabulary to keep in sync.
 *
 * Types only: values would pull `ids.ts` and its `node:crypto` import into the
 * client bundle.
 */
export type {
  Direction,
  SetupGrade,
  SmtState,
  Timestamp,
  TradingEnvironment,
  TradingSession,
} from '@/lib/trading'

export type { MarketViewDataSource, MarketViewQuery } from './data-source'

export {
  MARKET_VIEW_SCENARIOS,
  MARKET_VIEW_SCENARIO_IDS,
  buildFixtureSnapshot,
  createMockMarketViewDataSource,
  isMarketViewScenarioId,
  parseMarketViewScenarioId,
} from './fixtures'
export type { MarketViewScenario, MarketViewScenarioId } from './fixtures'

export { SESSION_WINDOWS, buildSessionDisplayState } from './session'

export {
  DEFAULT_CHART_PADDING,
  computeChartGeometry,
  indexToLeftX,
  indexToX,
  priceToY,
  priceValueToY,
  timeToIndex,
  timeToX,
} from './geometry'
export type {
  ChartGeometry,
  ChartGeometryInput,
  ChartPadding,
  ChartPlotArea,
  PriceTick,
  TimeTick,
} from './geometry'
