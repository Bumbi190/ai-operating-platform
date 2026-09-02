/**
 * Omnira Trading — Atlas Market View presentation model.
 *
 * Canonical documentation: docs/trading-system/README.md
 * Precedence rules:       docs/trading-system/SOURCE_OF_TRUTH.md
 *
 * WHAT THIS IS
 * ────────────
 * `TradingMarketViewSnapshot` is a frozen, provider-neutral *description of what
 * a market surface currently looks like*. It is assembled by a
 * `MarketViewDataSource` and rendered by the Atlas Market View. That is its
 * entire job.
 *
 * WHAT THIS IS NOT — AND CANNOT BECOME
 * ────────────────────────────────────
 * AUTHORITY IS ISSUED, NOT DERIVED FROM DATA.
 *
 * Nothing in this module can mint `RiskClearance`, `PropClearance`,
 * `ApprovalGrant` or `ExecutionIntent`. That is structural, not a convention:
 * issuance lives in `lib/trading/internal/`, this module imports only from the
 * public `@/lib/trading` barrel, and the barrel deliberately exports no
 * constructor for any of them. A snapshot saying `grade: 'A+'` with every
 * confirmation CONFIRMED therefore grants exactly as much permission as a
 * screenshot of the same thing: none.
 *
 * The fields below named after canonical decisions — `riskState`, `propState`,
 * `tradeProposal` — carry the *display* of a decision made elsewhere. They are
 * reported state, never the decision itself. Reading them tells you what was
 * decided; writing them decides nothing.
 *
 * NUMERIC PRECISION
 * ─────────────────
 * Prices and money are carried as `PriceText` — exact decimal strings validated
 * through the canonical `parseDecimal` (Risk v0.1 §82, kept in force by
 * Canonical v1.0 §7). A JS `number` never touches a price on this model.
 *
 * Text rather than the `Decimal` value object for one concrete reason: `Decimal`
 * stores a `bigint`, which cannot cross a React Server Component boundary —
 * `JSON.stringify` throws on it. `PriceText` is the same value, exactly, in the
 * form the boundary accepts, and `parseDecimal` turns it back into a `Decimal`
 * wherever comparison is needed.
 *
 * STAGE 1 SCOPE
 * ─────────────
 * Presentation vocabulary and shapes only. No detection logic: iFVG, CISD,
 * equal-high/low tolerance and SMT correspondence are unresolved deterministic
 * gates, so annotations are *supplied to* this model, never computed by it.
 */

/*
 * Imports reach the sibling modules directly rather than the `@/lib/trading`
 * barrel, and that is deliberate.
 *
 * The barrel rule — "import from `@/lib/trading`, nothing deeper" — governs code
 * OUTSIDE the trading package. `market-view/` is inside it, so siblings are its
 * normal neighbours.
 *
 * It also has to be this way. The barrel re-exports `newId`, which pulls in
 * `ids.ts`, which imports `node:crypto`. This package is reachable from a client
 * component, and webpack cannot bundle `node:crypto` for the browser — importing
 * the barrel here fails the production build. Every id type below is imported
 * type-only, so nothing from `ids.ts` survives into the client bundle.
 *
 * Consumers outside the package still import `@/lib/trading/market-view`, which
 * is this package's own public barrel.
 */
import { asDecimal, parseDecimal } from '../decimal'
import type { Branded } from '../ids'
import type { Direction, SetupGrade, SmtState, TradingSession } from '../contracts'
import type { MarketInstrument } from '../market-instrument'
import type { MarketTimeframe } from '../market-timeframe'
import type { Timestamp } from '../time'
import type { TradingEnvironment } from '../environment'

// ─── Exact prices at a serialization boundary ─────────────────────────────────

/**
 * An exact decimal value in text form — a price, a distance, or an amount of
 * money. Validated through the canonical decimal parser, so the same rejections
 * apply: no floats, no exponent notation, no leading '+', no bare '.'.
 */
export type PriceText = Branded<string, 'PriceText'>

/** Parse an untrusted value into a PriceText. Fails closed to null. */
export function parsePriceText(raw: unknown): PriceText | null {
  const parsed = parseDecimal(raw)
  return parsed === null ? null : (parsed.text as PriceText)
}

/** Assert a PriceText at a boundary you control. Throws on malformed input. */
export function priceText(raw: string): PriceText {
  return asDecimal(raw).text as PriceText
}

/**
 * The numeric value of a PriceText, for geometry only.
 *
 * Chart projection maps a price onto an SVG coordinate, which is inherently
 * approximate: the output is a pixel, and no hard limit is ever compared
 * against it. That is the one place a float is legitimate, and this function is
 * deliberately the only door to it — named so a reviewer can grep for every
 * caller and confirm none of them is doing risk arithmetic.
 */
export function priceMagnitude(value: PriceText): number {
  return Number(value)
}

// ─── Instruments ──────────────────────────────────────────────────────────────

/*
 * RE-EXPORTED, NOT RESTATED.
 *
 * The root vocabulary moved down to `../market-instrument` when Market Data &
 * Contract Lifecycle Canonical v1.0 made a root the input to contract
 * resolution: resolution is domain work, and a domain module cannot depend on a
 * presentation package without inverting the dependency direction.
 *
 * Canonical v1.0 §3 treats that as a placement change and nothing more —
 * semantic root identity is canonical, physical module ownership is not — and
 * it forbids a second vocabulary outright. So this package re-exports the one
 * definition and `@/lib/trading/market-view` keeps exactly the API it had.
 *
 * `../market-instrument` imports nothing at all, so taking VALUES from it here
 * cannot drag a Node builtin into the browser bundle. The import-discipline
 * suite proves that transitively rather than taking this comment's word for it.
 */
export {
  MARKET_INSTRUMENTS,
  isMarketInstrument,
  parseMarketInstrument,
} from '../market-instrument'
export type { MarketInstrument } from '../market-instrument'

export const INSTRUMENT_LABELS: Readonly<Record<MarketInstrument, string>> = {
  NQ: 'E-mini Nasdaq-100',
  MNQ: 'Micro E-mini Nasdaq-100',
  ES: 'E-mini S&P 500',
}

// ─── Timeframes ───────────────────────────────────────────────────────────────

/*
 * RE-EXPORTED, NOT RESTATED — the same move the root vocabulary made above.
 *
 * The timeframe vocabulary moved down to `../market-timeframe` when Market Data
 * & Contract Lifecycle Canonical v1.0 §12 made 5m, 15m and 4H DERIVED values:
 * they are computed from accepted canonical 1m observations against the
 * `SessionCalendar` and the canonical grid, which is domain work sitting well
 * below presentation. A domain module cannot depend on this package without
 * inverting the dependency direction.
 *
 * `../market-timeframe` imports nothing at all, so taking VALUES from it here
 * cannot drag a Node builtin into the browser bundle. Exactly one definition of
 * the vocabulary exists, and `@/lib/trading/market-view` keeps the API it had.
 */
export {
  MARKET_TIMEFRAMES,
  isMarketTimeframe,
  parseMarketTimeframe,
} from '../market-timeframe'
export type { MarketTimeframe } from '../market-timeframe'

// ─── Presence, freshness and provenance ───────────────────────────────────────

/**
 * Three-state presence for a confirmation.
 *
 * ABSENT and UNKNOWN are different facts and must render differently: the first
 * says "we looked and it is not there", the second says "we do not know". Visual
 * absence is never allowed to stand in for UNKNOWN — a missing row would make
 * the two indistinguishable, which is exactly the failure this type exists to
 * prevent.
 */
export const PRESENCE_STATES = ['CONFIRMED', 'ABSENT', 'UNKNOWN'] as const
export type PresenceState = (typeof PRESENCE_STATES)[number]

/**
 * Where the rendered market state came from.
 *
 * FIXTURE is deterministic local data with no market connection whatsoever.
 * SIMULATION is a non-live provider environment. LIVE is real capital.
 * Stage 1 can only ever produce FIXTURE.
 */
export const MARKET_DATA_ORIGINS = ['FIXTURE', 'SIMULATION', 'LIVE'] as const
export type MarketDataOrigin = (typeof MARKET_DATA_ORIGINS)[number]

/**
 * Whether the snapshot can be trusted as current.
 *
 * Kept orthogonal to origin on purpose: fixture data can be deliberately stale
 * to exercise the stale presentation, and a live feed can go stale without
 * ceasing to be live. Collapsing them into one enum would make one of those two
 * states unrepresentable.
 */
export const MARKET_FRESHNESS = ['FRESH', 'STALE', 'UNKNOWN'] as const
export type MarketFreshness = (typeof MARKET_FRESHNESS)[number]

export interface MarketDataProvenance {
  readonly origin: MarketDataOrigin
  readonly freshness: MarketFreshness
  /** Human-readable name of the source, e.g. 'Fixture · A+ confirmed'. */
  readonly sourceLabel: string
  /** Null when no provider is connected at all — the Stage 1 case. */
  readonly providerLabel: string | null
  /** When the underlying data was last known good. Null when never. */
  readonly observedAt: Timestamp | null
}

// ─── Candles ──────────────────────────────────────────────────────────────────

export interface MarketCandle {
  /** Opening instant of the bar. Bars are keyed by open, never by close. */
  readonly openTime: Timestamp
  readonly open: PriceText
  readonly high: PriceText
  readonly low: PriceText
  readonly close: PriceText
  /** Absent where the source does not report it — never defaulted to zero. */
  readonly volume: PriceText | null
}

// ─── Structural annotations ───────────────────────────────────────────────────

/**
 * The 4H open the thesis is anchored to.
 *
 * Which 4H open is selected is Strategy Engine work. This records the choice so
 * the chart can draw it and the operator can see which one was used.
 */
export interface FourHourOpenAnnotation {
  readonly label: string
  readonly price: PriceText
  readonly openedAt: Timestamp
  readonly session: TradingSession
}

export const LIQUIDITY_KINDS = [
  'EQUAL_HIGHS',
  'EQUAL_LOWS',
  'PREVIOUS_DAY_HIGH',
  'PREVIOUS_DAY_LOW',
  'SESSION_HIGH',
  'SESSION_LOW',
] as const
export type LiquidityKind = (typeof LIQUIDITY_KINDS)[number]

export const LIQUIDITY_STATUSES = ['INTACT', 'SWEPT', 'UNKNOWN'] as const
export type LiquidityStatus = (typeof LIQUIDITY_STATUSES)[number]

/** A horizontal price level where resting liquidity is expected. */
export interface LiquidityLevel {
  readonly id: string
  readonly kind: LiquidityKind
  readonly price: PriceText
  readonly status: LiquidityStatus
  readonly label: string
  readonly timeframe: MarketTimeframe
}

/**
 * A banded region rather than a single level.
 *
 * Equal highs are rarely exactly equal, and the tolerance that decides how equal
 * counts is an unresolved deterministic gate. A zone lets a source report the
 * band it actually observed instead of forcing a precision it does not have.
 */
export interface LiquidityZone {
  readonly id: string
  readonly kind: LiquidityKind
  readonly upper: PriceText
  readonly lower: PriceText
  readonly fromTime: Timestamp
  readonly toTime: Timestamp
  readonly status: LiquidityStatus
  readonly label: string
}

/**
 * FVG lifecycle state.
 *
 * INVERTED is what the canonical text calls an iFVG. It is modelled as a state
 * of one gap rather than as a separate object, because an iFVG is by definition
 * the same gap after it has been traded through — two objects would let a
 * source report a gap as simultaneously open and inverted.
 */
export const FVG_STATES = ['OPEN', 'MITIGATED', 'INVERTED', 'UNKNOWN'] as const
export type FvgState = (typeof FVG_STATES)[number]

export interface FairValueGap {
  readonly id: string
  readonly direction: Direction
  readonly upper: PriceText
  readonly lower: PriceText
  readonly fromTime: Timestamp
  readonly toTime: Timestamp
  readonly state: FvgState
  readonly timeframe: MarketTimeframe
  readonly label: string
}

export const MANIPULATION_KINDS = [
  'LIQUIDITY_SWEEP_HIGH',
  'LIQUIDITY_SWEEP_LOW',
  'DISPLACEMENT',
  'UNKNOWN',
] as const
export type ManipulationKind = (typeof MANIPULATION_KINDS)[number]

/** A point-in-time structural event the operator should see on the chart. */
export interface ManipulationMarker {
  readonly id: string
  readonly kind: ManipulationKind
  readonly at: Timestamp
  readonly price: PriceText
  readonly timeframe: MarketTimeframe
  readonly label: string
}

// ─── Confirmations ────────────────────────────────────────────────────────────

/**
 * The four confirmations the setup panel reports.
 *
 * SMT keeps its canonical tri-state (`SmtState`: TRUE / FALSE / UNKNOWN) rather
 * than being flattened into `PresenceState`. The canonical rule that SMT may
 * only lift A to A+ and can never create a trade is stated in terms of that
 * vocabulary, and re-spelling it here would create a second SMT vocabulary to
 * keep in sync. The panel renders it with the same three-state visual language.
 */
export interface SetupConfirmations {
  readonly iFvg: PresenceState
  readonly cisd: PresenceState
  readonly liquiditySweep: PresenceState
  readonly smt: SmtState
}

/** Grade including the explicit no-setup case. */
export const DISPLAY_SETUP_GRADES = ['A+', 'A', 'B', 'C', 'NONE'] as const
export type DisplaySetupGrade = SetupGrade | 'NONE'

/** Direction including the explicit no-bias case. */
export const DISPLAY_DIRECTIONS = ['LONG', 'SHORT', 'NEUTRAL'] as const
export type DisplayDirection = Direction | 'NEUTRAL'

export const SETUP_STAGES = ['NONE', 'DEVELOPING', 'CONFIRMED', 'INVALIDATED', 'UNKNOWN'] as const
export type SetupStage = (typeof SETUP_STAGES)[number]

export interface SetupState {
  readonly direction: DisplayDirection
  readonly grade: DisplaySetupGrade
  readonly stage: SetupStage
  readonly session: TradingSession | null
  readonly confirmations: SetupConfirmations
  /** Short operator-facing note. Never a reason code — those live on decisions. */
  readonly note: string | null
}

// ─── Market thesis ────────────────────────────────────────────────────────────

export interface MarketThesis {
  readonly bias: DisplayDirection
  readonly headline: string
  readonly detail: string
  /** The 4H open the thesis hangs on, when one is selected. */
  readonly anchoredTo: FourHourOpenAnnotation | null
}

// ─── Trade proposal ───────────────────────────────────────────────────────────

/**
 * Stage 1 proposal statuses. Every one of them is non-executable, and there is
 * deliberately no executable member for a status value to drift into.
 *
 * This mirrors, but is not, the canonical `ProposalStatus` in
 * `lib/trading/proposal.ts`. Reusing that type here would put values such as
 * APPROVED on a presentation object, and a presentation object must not be able
 * to spell approval.
 */
export const MARKET_PROPOSAL_STATUSES = [
  'OBSERVATION_ONLY',
  'SIMULATED',
  'NO_EXECUTION_PROVIDER',
] as const
export type MarketProposalStatus = (typeof MARKET_PROPOSAL_STATUSES)[number]

export interface MarketTradeProposal {
  readonly status: MarketProposalStatus
  readonly direction: DisplayDirection
  readonly grade: DisplaySetupGrade
  readonly entry: PriceText | null
  readonly stopLoss: PriceText | null
  readonly takeProfit: PriceText | null
  /** Break-even level once a BE rule has moved the stop. Null before that. */
  readonly breakEven: PriceText | null
  /** Reward-to-risk as an exact decimal, e.g. '2.4'. Null when undefined. */
  readonly riskReward: PriceText | null
  /** Why this proposal is in this status, in the operator's language. */
  readonly reason: string
}

// ─── Risk, prop and position ──────────────────────────────────────────────────

export const RISK_ENGINE_STATUSES = ['CLEAR', 'BLOCKED', 'NOT_EVALUATED', 'UNKNOWN'] as const
export type RiskEngineStatus = (typeof RISK_ENGINE_STATUSES)[number]

/**
 * Reported Risk Engine state, for display.
 *
 * Every figure here is a value the Risk Engine produced or would produce. This
 * model neither computes nor validates them: Risk Engine Specification
 * Canonical v1.0 is authoritative and the engine itself is Fas 5.
 */
export interface RiskDisplayState {
  readonly status: RiskEngineStatus
  readonly proposedRisk: PriceText | null
  readonly riskPercent: PriceText | null
  readonly stopDistance: PriceText | null
  readonly dailyRealizedLoss: PriceText | null
  readonly reservedRisk: PriceText | null
  readonly dailyLossLimit: PriceText | null
  readonly maxRiskPerTrade: PriceText | null
  readonly attemptsUsed: number | null
  readonly maxAttempts: number | null
  /** Operator-facing explanation of the status. Null when nothing to add. */
  readonly note: string | null
}

/**
 * Prop Mode display state.
 *
 * NOT_CONFIGURED is the Stage 1 truth and the correct default: GATE-09 is open,
 * no `PropFirmProfile` exists, and inventing one to make the panel look
 * populated would be inventing canon.
 */
export const PROP_DISPLAY_STATUSES = ['NOT_CONFIGURED', 'CLEAR', 'BLOCKED', 'UNKNOWN'] as const
export type PropDisplayStatus = (typeof PROP_DISPLAY_STATUSES)[number]

export interface PropDisplayState {
  readonly status: PropDisplayStatus
  readonly note: string | null
}

export const POSITION_DISPLAY_STATES = ['FLAT', 'OPEN', 'UNKNOWN'] as const
export type PositionDisplayState = (typeof POSITION_DISPLAY_STATES)[number]

export interface PositionDisplayInfo {
  readonly state: PositionDisplayState
  readonly direction: DisplayDirection
  readonly quantity: number | null
  readonly averagePrice: PriceText | null
  readonly note: string | null
}

// ─── Session ──────────────────────────────────────────────────────────────────

export const SESSION_WINDOW_STATES = ['BEFORE', 'OPEN', 'AFTER', 'UNKNOWN'] as const
export type SessionWindowState = (typeof SESSION_WINDOW_STATES)[number]

export interface SessionWindowInfo {
  readonly session: TradingSession
  readonly label: string
  /** Window bounds as HH:MM in the canonical timezone. */
  readonly opensAt: string
  readonly closesAt: string
  readonly state: SessionWindowState
}

export interface SessionDisplayState {
  /** Wall-clock time in the canonical timezone, HH:MM. */
  readonly canonicalTime: string
  /** Calendar date in the canonical timezone, YYYY-MM-DD. */
  readonly canonicalDate: string
  /** The IANA zone the two values above are rendered in. Always explicit. */
  readonly timezone: string
  /** Offset at this instant, derived rather than stored, so DST is correct. */
  readonly utcOffset: string
  readonly windows: readonly SessionWindowInfo[]
  /** The window currently open, when one is. */
  readonly activeSession: TradingSession | null
}

// ─── Atlas explanation ────────────────────────────────────────────────────────

export interface ExplanationEntry {
  readonly id: string
  readonly at: Timestamp
  readonly text: string
}

/**
 * The narrative surface under the chart.
 *
 * Stage 1 fills this from fixtures. There is no model call behind it and the
 * shape carries no affordance for one — an explanation is text plus the time it
 * describes, and nothing about that changes if a model ever writes it.
 */
export interface MarketExplanation {
  readonly headline: string
  readonly body: string
  readonly timeline: readonly ExplanationEntry[]
}

// ─── The aggregate ────────────────────────────────────────────────────────────

/**
 * Everything the Atlas Market View renders, for one instrument and timeframe at
 * one instant.
 *
 * Deliberately a plain data record: no methods, no callbacks, no identifiers
 * that could address a provider. A future real market-data source produces this
 * same shape, and the view cannot tell the difference — which is the point of
 * the seam. What the view CAN tell, and shows prominently, is `provenance`.
 */
export interface TradingMarketViewSnapshot {
  readonly instrument: MarketInstrument
  readonly timeframe: MarketTimeframe
  readonly generatedAt: Timestamp
  /**
   * The trading environment this state belongs to.
   *
   * Never defaulted, and Stage 1 can only be 'development'. `TradingEnvironment`
   * is the canonical vocabulary in which 'live' is never a fallback.
   */
  readonly environment: TradingEnvironment
  readonly provenance: MarketDataProvenance

  readonly candles: readonly MarketCandle[]
  readonly selectedFourHourOpen: FourHourOpenAnnotation | null
  readonly liquidity: readonly LiquidityLevel[]
  readonly liquidityZones: readonly LiquidityZone[]
  readonly fairValueGaps: readonly FairValueGap[]
  readonly manipulation: readonly ManipulationMarker[]

  readonly thesis: MarketThesis
  readonly setup: SetupState
  readonly tradeProposal: MarketTradeProposal
  readonly riskState: RiskDisplayState
  readonly propState: PropDisplayState
  readonly positionState: PositionDisplayInfo
  readonly sessionState: SessionDisplayState
  readonly explanation: MarketExplanation
}

// ─── Derived presentation helpers ─────────────────────────────────────────────

/**
 * The single most important thing to say about this snapshot's trustworthiness.
 *
 * One banner, one severity, resolved in a fixed order so the answer cannot
 * depend on render order: a blocked risk state outranks staleness, staleness
 * outranks unknown provenance, and only a fully fresh live feed reports LIVE.
 */
export const SAFETY_BANNERS = [
  'FIXTURE',
  'SIMULATION',
  'LIVE',
  'STALE',
  'UNKNOWN',
  'BLOCKED',
] as const
export type SafetyBanner = (typeof SAFETY_BANNERS)[number]

export function resolveSafetyBanner(snapshot: TradingMarketViewSnapshot): SafetyBanner {
  if (snapshot.riskState.status === 'BLOCKED' || snapshot.propState.status === 'BLOCKED') return 'BLOCKED'
  if (snapshot.provenance.freshness === 'STALE') return 'STALE'
  if (snapshot.provenance.freshness === 'UNKNOWN') return 'UNKNOWN'
  return snapshot.provenance.origin
}

/**
 * True only when this snapshot describes real capital.
 *
 * Written as an equality against 'LIVE' rather than as "not fixture", so a new
 * origin added later is non-live until someone deliberately says otherwise.
 */
export function isLiveMarketView(snapshot: TradingMarketViewSnapshot): boolean {
  return snapshot.provenance.origin === 'LIVE'
}

/**
 * Whether anything in this snapshot could be sent to a broker. Always false.
 *
 * Not a placeholder: `MarketProposalStatus` has no executable member, so this
 * is a total function over the type and stays false however the union grows —
 * unless someone adds an executable status, at which point the test asserting
 * this over every status fails and says so.
 */
export function proposalIsExecutable(proposal: MarketTradeProposal): boolean {
  const status: MarketProposalStatus = proposal.status
  return (
    status !== 'OBSERVATION_ONLY'
    && status !== 'SIMULATED'
    && status !== 'NO_EXECUTION_PROVIDER'
  )
}
