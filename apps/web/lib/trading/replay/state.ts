/**
 * Omnira Trading — replay state and its reducer.
 *
 * THE DETERMINISM MODEL
 * ─────────────────────
 * State is never mutated forward and un-mutated backward. It is always
 *
 *     state = events[0..cursor].reduce(applyEvent, initialState)
 *
 * so stepping back is a recompute from the beginning, not an inverse operation.
 * That is the whole reason this file looks the way it does: inverse operations
 * are where replay determinism dies, because an inverse has to reconstruct
 * information the forward step threw away, and it usually reconstructs it
 * slightly wrong.
 *
 * The consequence worth stating plainly: forward-then-back-then-forward is
 * byte-identical to going forward once, and seeking to N is byte-identical to
 * stepping to N. Both are tested.
 *
 * NO CLOCK IS READ HERE. Market time comes from the event being applied.
 */

import type {
  FvgState,
  LiquidityStatus,
  MarketFreshness,
  MarketInstrument,
  MarketTimeframe,
  PresenceState,
  PropDisplayStatus,
  RiskEngineStatus,
  SmtState,
  Timestamp,
} from '../market-view'
import type { ReplayEvent } from './events'
import type { SetupLifecycle } from './lifecycle'
import type { ObservedPosition } from './observed-position'
import type { PlannedTradeView } from './planned-trade'

// ─── State ────────────────────────────────────────────────────────────────────

export interface ReplayConfirmations {
  readonly liquiditySweep: PresenceState
  readonly iFvg: PresenceState
  readonly cisd: PresenceState
  readonly smt: SmtState
}

/**
 * Everything the fold accumulates.
 *
 * Deliberately small: the candle series, the annotation catalogue and the
 * copy all live on the scenario and never change during replay. Only what
 * genuinely evolves is state, which keeps the reducer readable and the
 * recompute cheap.
 */
export interface ReplayState {
  readonly scenarioId: string
  readonly instrument: MarketInstrument
  readonly timeframe: MarketTimeframe
  /** Index of the last applied event, or -1 before anything is applied. */
  readonly cursor: number
  /** Market time of the last applied event. */
  readonly marketTime: Timestamp
  /** Latest visible bar. The chart renders `candles.slice(0, candleIndex + 1)`. */
  readonly candleIndex: number

  readonly confirmations: ReplayConfirmations
  readonly lifecycle: SetupLifecycle
  /** The furthest state this opportunity reached. Survives a BLOCKED detour. */
  readonly lifecycleReached: SetupLifecycle
  readonly setupNote: string | null
  readonly thesisHeadline: string | null

  /** Which annotations are visible, and in what state. */
  readonly liquidityStatus: Readonly<Record<string, LiquidityStatus>>
  readonly fvgState: Readonly<Record<string, FvgState>>
  readonly revealedManipulation: readonly string[]

  readonly plannedTrade: PlannedTradeView | null
  readonly riskStatus: RiskEngineStatus
  readonly riskNote: string | null
  readonly propStatus: PropDisplayStatus

  readonly positions: readonly ObservedPosition[]

  readonly freshness: MarketFreshness
  readonly observedAt: Timestamp | null

  /** Applied events, oldest first. The explanation timeline projects from this. */
  readonly applied: readonly ReplayEvent[]
}

export interface InitialStateInput {
  readonly scenarioId: string
  readonly instrument: MarketInstrument
  readonly timeframe: MarketTimeframe
  /** The instant before any event. Market time, supplied by the scenario. */
  readonly startsAt: Timestamp
  readonly startCandleIndex: number
}

/**
 * The state before any event.
 *
 * Everything unknown starts UNKNOWN rather than false or empty — the market has
 * not been observed yet, and "we have not looked" is a different claim from
 * "we looked and there was nothing".
 */
export function initialReplayState(input: InitialStateInput): ReplayState {
  return {
    scenarioId: input.scenarioId,
    instrument: input.instrument,
    timeframe: input.timeframe,
    cursor: -1,
    marketTime: input.startsAt,
    candleIndex: input.startCandleIndex,
    confirmations: {
      liquiditySweep: 'UNKNOWN',
      iFvg: 'UNKNOWN',
      cisd: 'UNKNOWN',
      smt: 'UNKNOWN',
    },
    lifecycle: 'OBSERVING',
    lifecycleReached: 'OBSERVING',
    setupNote: null,
    thesisHeadline: null,
    liquidityStatus: {},
    fvgState: {},
    revealedManipulation: [],
    plannedTrade: null,
    riskStatus: 'NOT_EVALUATED',
    riskNote: null,
    propStatus: 'NOT_CONFIGURED',
    positions: [],
    freshness: 'UNKNOWN',
    observedAt: null,
    applied: [],
  }
}

// ─── The reducer ──────────────────────────────────────────────────────────────

/** Rank used to decide whether a lifecycle move advances the high-water mark. */
const REACH_RANK: Readonly<Record<SetupLifecycle, number>> = {
  OBSERVING: 0,
  DEVELOPING: 1,
  CONFIRMED: 2,
  COMPLETED: 3,
  // Not progress — these are outcomes, and must not overwrite what was reached.
  BLOCKED: -1,
  EXPIRED: -1,
  INVALIDATED: -1,
}

function payloadField<T>(event: ReplayEvent, key: string): T | undefined {
  return (event.payload as Record<string, unknown>)[key] as T | undefined
}

/**
 * Apply one event.
 *
 * Pure and total: an unrecognized type advances the cursor and the clock but
 * changes nothing else, so a timeline carrying an event this build does not
 * understand degrades to "no state change" instead of throwing. Silently
 * dropping it from `applied` would be worse — the record stays complete.
 */
export function applyReplayEvent(state: ReplayState, event: ReplayEvent): ReplayState {
  const base: ReplayState = {
    ...state,
    cursor: state.cursor + 1,
    marketTime: event.occurredAt,
    applied: [...state.applied, event],
  }

  switch (event.type) {
    case 'CANDLE_ADVANCED': {
      const index = payloadField<number>(event, 'candleIndex')
      return { ...base, candleIndex: index ?? state.candleIndex }
    }

    case 'CONFIRMATION_CHANGED': {
      const which = payloadField<keyof ReplayConfirmations>(event, 'confirmation')
      const value = payloadField<string>(event, 'state')
      if (which === undefined || value === undefined) return base
      return {
        ...base,
        confirmations: { ...state.confirmations, [which]: value } as ReplayConfirmations,
        setupNote: payloadField<string | null>(event, 'note') ?? state.setupNote,
      }
    }

    case 'SETUP_LIFECYCLE_CHANGED': {
      const to = payloadField<SetupLifecycle>(event, 'to')
      if (to === undefined) return base
      const reached = REACH_RANK[to] > REACH_RANK[state.lifecycleReached] ? to : state.lifecycleReached
      return {
        ...base,
        lifecycle: to,
        lifecycleReached: reached,
        setupNote: payloadField<string>(event, 'reason') ?? state.setupNote,
      }
    }

    case 'THESIS_UPDATED':
      return { ...base, thesisHeadline: payloadField<string>(event, 'headline') ?? state.thesisHeadline }

    case 'LIQUIDITY_OBSERVED': {
      const id = payloadField<string>(event, 'liquidityId')
      const status = payloadField<LiquidityStatus>(event, 'status')
      if (id === undefined || status === undefined) return base
      return { ...base, liquidityStatus: { ...state.liquidityStatus, [id]: status } }
    }

    case 'FVG_STATE_CHANGED': {
      const id = payloadField<string>(event, 'fvgId')
      const fvg = payloadField<FvgState>(event, 'state')
      if (id === undefined || fvg === undefined) return base
      return { ...base, fvgState: { ...state.fvgState, [id]: fvg } }
    }

    case 'MANIPULATION_OBSERVED': {
      const id = payloadField<string>(event, 'manipulationId')
      if (id === undefined || state.revealedManipulation.includes(id)) return base
      return { ...base, revealedManipulation: [...state.revealedManipulation, id] }
    }

    case 'PLANNED_TRADE_CREATED':
    case 'PLANNED_TRADE_UPDATED':
    case 'PLANNED_TRADE_BLOCKED':
    case 'PLANNED_TRADE_EXPIRED': {
      const plan = payloadField<PlannedTradeView>(event, 'plan')
      return { ...base, plannedTrade: plan ?? state.plannedTrade }
    }

    case 'RISK_STATE_REPORTED':
      return {
        ...base,
        riskStatus: payloadField<RiskEngineStatus>(event, 'status') ?? state.riskStatus,
        riskNote: payloadField<string | null>(event, 'note') ?? null,
      }

    case 'PROP_STATE_REPORTED':
      return { ...base, propStatus: payloadField<PropDisplayStatus>(event, 'status') ?? state.propStatus }

    case 'OBSERVED_POSITION_OPENED':
    case 'OBSERVED_POSITION_UPDATED': {
      const position = payloadField<ObservedPosition>(event, 'position')
      if (position === undefined) return base
      const rest = state.positions.filter((p) => p.positionId !== position.positionId)
      return { ...base, positions: [...rest, position] }
    }

    case 'OBSERVED_POSITION_CLOSED': {
      const position = payloadField<ObservedPosition>(event, 'position')
      if (position === undefined) return base
      // A closed position stays on the timeline rather than vanishing: it was
      // observed, and removing it would make the record less true than the feed.
      const rest = state.positions.filter((p) => p.positionId !== position.positionId)
      return { ...base, positions: [...rest, position] }
    }

    case 'DATA_FRESHNESS_CHANGED':
      return {
        ...base,
        freshness: payloadField<MarketFreshness>(event, 'freshness') ?? state.freshness,
        observedAt: payloadField<Timestamp | null>(event, 'observedAt') ?? null,
      }

    case 'SESSION_WINDOW_CHANGED':
      // Session state is derived from market time through the Time Foundation,
      // so the event only needs to move the clock — which `base` already did.
      return base

    default:
      return base
  }
}

/**
 * Fold a timeline up to and including `cursor`.
 *
 * `cursor` of -1 yields the initial state. Out-of-range values clamp rather than
 * throw: a seek past the end lands on the end, which is what an operator
 * dragging a scrubber expects.
 */
export function projectStateAt(
  initial: ReplayState,
  events: readonly ReplayEvent[],
  cursor: number,
): ReplayState {
  const clamped = Math.min(Math.max(cursor, -1), events.length - 1)
  let state = initial
  for (let index = 0; index <= clamped; index += 1) {
    state = applyReplayEvent(state, events[index])
  }
  return state
}
