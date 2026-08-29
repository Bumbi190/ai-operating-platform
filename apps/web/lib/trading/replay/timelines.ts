/**
 * Omnira Trading — replay timelines for the six fixture scenarios.
 *
 * Each Stage 1 scenario becomes a sequence of authored events that arrives at
 * the state Stage 1 already described. The final cursor position reproduces the
 * Stage 1 snapshot's setup, plan, risk and prop state — asserted by a test, so
 * the replay cannot quietly diverge from the surface it feeds.
 *
 * THESE ARE AUTHORED ASSERTIONS
 * ─────────────────────────────
 * Every confirmation, gap state and sweep here is written down by hand, exactly
 * as a provider or a future Strategy Engine would hand it over. Nothing is
 * detected: iFVG, CISD, SMT and equal-high/low tolerance remain unresolved
 * deterministic gates, and computing one here would be inventing canon in a
 * fixture.
 *
 * They are also not evidence of anything. No scenario demonstrates that any
 * setup, grade or strategy is profitable, and none should ever be cited as if
 * it did.
 */

import {
  buildFixtureSnapshot,
  type MarketInstrument,
  type MarketTimeframe,
  type MarketViewScenarioId,
  type PriceText,
  type Timestamp,
  type TradingMarketViewSnapshot,
} from '../market-view'
import {
  replayEvent,
  replayEventId,
  type ReplayEvent,
  type ReplayEventPayload,
  type ReplayEventType,
} from './events'
import type { SetupLifecycle } from './lifecycle'
import { present, unavailable, unknownValue, type ObservedPosition } from './observed-position'
import type { PlannedTradeView } from './planned-trade'

const SOURCE_COMPONENT = 'trading.replay.fixture'
const PAYLOAD_VERSION = '1'

/** Where each scenario's replay begins. Earlier bars are already on the chart. */
const START_CANDLE = 58

export interface ReplayTimeline {
  readonly scenarioId: MarketViewScenarioId
  readonly instrument: MarketInstrument
  readonly timeframe: MarketTimeframe
  /** Market instant before any event. */
  readonly startsAt: Timestamp
  readonly startCandleIndex: number
  readonly events: readonly ReplayEvent[]
  /** The Stage 1 snapshot this timeline arrives at. */
  readonly base: TradingMarketViewSnapshot
}

// ─── Authoring ────────────────────────────────────────────────────────────────

interface StepInput {
  readonly candleIndex: number
  readonly type: ReplayEventType
  readonly payload: ReplayEventPayload
  readonly summary: string
}

/**
 * Materialize authored steps into a frozen, totally ordered timeline.
 *
 * Ids and causation are derived, never generated: event N is caused by event
 * N-1, which gives the whole scenario one chain a journal can walk. Correlation
 * is the scenario's opportunity id, so every event about this setup threads
 * together.
 */
function materialize(
  scenarioId: MarketViewScenarioId,
  instrument: MarketInstrument,
  base: TradingMarketViewSnapshot,
  steps: readonly StepInput[],
): readonly ReplayEvent[] {
  const correlationId = `setup:${scenarioId}`
  return steps.map((step, index) => {
    const at = base.candles[Math.min(step.candleIndex, base.candles.length - 1)].openTime
    return replayEvent({
      eventId: replayEventId(scenarioId, index),
      sequence: index,
      scenarioId,
      type: step.type,
      instrument,
      occurredAt: at,
      // Fixtures learn about an event at the instant it happens. A real feed
      // will report a later recordedAt, and the gap is what reveals lag.
      recordedAt: at,
      correlationId,
      causationId: index === 0 ? null : replayEventId(scenarioId, index - 1),
      environment: 'development',
      origin: 'FIXTURE',
      sourceComponent: SOURCE_COMPONENT,
      payloadVersion: PAYLOAD_VERSION,
      payload: step.payload,
      summary: step.summary,
    })
  })
}

function candle(candleIndex: number, summary: string): StepInput {
  return {
    candleIndex,
    type: 'CANDLE_ADVANCED',
    payload: { candleIndex },
    summary,
  }
}

function confirmation(
  candleIndex: number,
  which: 'liquiditySweep' | 'iFvg' | 'cisd' | 'smt',
  state: string,
  summary: string,
  note: string | null = null,
): StepInput {
  return {
    candleIndex,
    type: 'CONFIRMATION_CHANGED',
    payload: { confirmation: which, state, note },
    summary,
  }
}

function lifecycle(
  candleIndex: number,
  from: SetupLifecycle,
  to: SetupLifecycle,
  reason: string,
): StepInput {
  return {
    candleIndex,
    type: 'SETUP_LIFECYCLE_CHANGED',
    payload: { from, to, reason },
    summary: `Setup: ${from} → ${to}`,
  }
}

function planStep(
  candleIndex: number,
  type: Extract<
    ReplayEventType,
    'PLANNED_TRADE_CREATED' | 'PLANNED_TRADE_UPDATED' | 'PLANNED_TRADE_BLOCKED' | 'PLANNED_TRADE_EXPIRED'
  >,
  plan: PlannedTradeView,
  summary: string,
): StepInput {
  return { candleIndex, type, payload: { plan, plannedTradeId: plan.plannedTradeId }, summary }
}

// ─── Plan and position construction ───────────────────────────────────────────

function planFrom(
  base: TradingMarketViewSnapshot,
  scenarioId: MarketViewScenarioId,
  at: Timestamp,
  overrides: Partial<PlannedTradeView> = {},
): PlannedTradeView {
  const proposal = base.tradeProposal
  return {
    plannedTradeId: `plan:${scenarioId}`,
    correlationId: `setup:${scenarioId}`,
    instrument: base.instrument,
    direction: proposal.direction,
    grade: proposal.grade,
    lifecycle: 'DEVELOPING',
    status: proposal.status,
    entry: proposal.entry,
    stopLoss: proposal.stopLoss,
    takeProfit: proposal.takeProfit,
    breakEven: proposal.breakEven,
    riskReward: proposal.riskReward,
    proposedRisk: base.riskState.proposedRisk,
    session: base.setup.session,
    thesisRef: `thesis:${scenarioId}`,
    createdAt: at,
    updatedAt: at,
    expiresAt: null,
    reason: proposal.reason,
    riskStatus: base.riskState.status,
    propStatus: base.propState.status,
    ...overrides,
  }
}

/**
 * An observed position that Omnira did not plan.
 *
 * Deliberately unattributed and deliberately incomplete: the fixture reports a
 * provider that does not supply unrealized P/L or a target, which is the normal
 * case worth rendering. Those fields stay UNAVAILABLE rather than becoming zero.
 */
function observedPosition(
  base: TradingMarketViewSnapshot,
  at: Timestamp,
  overrides: Partial<ObservedPosition> = {},
): ObservedPosition {
  const entry = base.tradeProposal.entry ?? (base.candles[0].close as PriceText)
  return {
    positionId: `pos:${base.instrument}:1`,
    source: { providerLabel: 'Fixtur', accountLabel: null, origin: 'FIXTURE' },
    instrument: base.instrument,
    state: 'OPEN',
    direction: 'LONG',
    quantity: present(1),
    averageEntry: present(entry),
    lastPrice: present(base.candles[base.candles.length - 1].close),
    // This fixture's provider does not report P/L or a target.
    unrealizedPnl: unavailable(),
    stopLoss: present(base.tradeProposal.stopLoss ?? entry),
    takeProfit: unavailable(),
    openedAt: present(at),
    lastObservedAt: at,
    freshness: 'FRESH',
    unattributed: true,
    note: 'Observerad position utan motsvarande plan.',
    ...overrides,
  }
}

// ─── The six timelines ────────────────────────────────────────────────────────

function stepsFor(
  scenarioId: MarketViewScenarioId,
  base: TradingMarketViewSnapshot,
): readonly StepInput[] {
  const at = (index: number) => base.candles[Math.min(index, base.candles.length - 1)].openTime

  switch (scenarioId) {
    case 'long-developing':
      return [
        { candleIndex: 58, type: 'DATA_FRESHNESS_CHANGED', payload: { freshness: 'FRESH', observedAt: at(58) }, summary: 'Feed rapporterad som aktuell.' },
        { candleIndex: 58, type: 'THESIS_UPDATED', payload: { headline: 'Bevakar 10:00 NY 4H-open' }, summary: 'Tes: bevakar vald 4H-open.' },
        candle(62, 'Prisrörelse mot sessionslägsta.'),
        { candleIndex: 64, type: 'LIQUIDITY_OBSERVED', payload: { liquidityId: 'liq-pdl', status: 'SWEPT' }, summary: 'Föregående dagslägsta svept.' },
        { candleIndex: 64, type: 'MANIPULATION_OBSERVED', payload: { manipulationId: 'manip-1' }, summary: 'Sweep under sessionslägsta.' },
        confirmation(64, 'liquiditySweep', 'CONFIRMED', 'Likviditetssweep bekräftad.'),
        lifecycle(64, 'OBSERVING', 'DEVELOPING', 'Sweep bekräftad — setup utvecklas.'),
        { candleIndex: 68, type: 'FVG_STATE_CHANGED', payload: { fvgId: 'fvg-1', state: 'OPEN' }, summary: 'Bullish FVG lämnad öppen.' },
        confirmation(72, 'cisd', 'ABSENT', 'CISD saknas på 1m.', '1m-bekräftelse är ofullständig.'),
        planStep(76, 'PLANNED_TRADE_CREATED', planFrom(base, scenarioId, at(76)), 'Planerad trade skapad som observation.'),
        { candleIndex: 80, type: 'RISK_STATE_REPORTED', payload: { status: 'CLEAR', note: null }, summary: 'Risk rapporterad KLAR.' },
        { candleIndex: 84, type: 'PROP_STATE_REPORTED', payload: { status: 'NOT_CONFIGURED' }, summary: 'Prop-läge: ej konfigurerad.' },
        candle(89, 'Väntar på 1m-bekräftelse.'),
      ]

    case 'short-developing':
      return [
        { candleIndex: 58, type: 'DATA_FRESHNESS_CHANGED', payload: { freshness: 'FRESH', observedAt: at(58) }, summary: 'Feed rapporterad som aktuell.' },
        { candleIndex: 58, type: 'THESIS_UPDATED', payload: { headline: 'Bevakar lika toppar' }, summary: 'Tes: bevakar lika toppar.' },
        candle(60, 'Prisrörelse mot sessionshögsta.'),
        { candleIndex: 62, type: 'LIQUIDITY_OBSERVED', payload: { liquidityId: 'liq-pdh', status: 'SWEPT' }, summary: 'Föregående dagshögsta svept.' },
        { candleIndex: 62, type: 'MANIPULATION_OBSERVED', payload: { manipulationId: 'manip-1' }, summary: 'Sweep över sessionshögsta.' },
        confirmation(62, 'liquiditySweep', 'CONFIRMED', 'Likviditetssweep bekräftad.'),
        lifecycle(62, 'OBSERVING', 'DEVELOPING', 'Toppar tagna — setup utvecklas.'),
        confirmation(66, 'iFvg', 'ABSENT', 'Ingen inverterad FVG.'),
        { candleIndex: 70, type: 'FVG_STATE_CHANGED', payload: { fvgId: 'fvg-1', state: 'OPEN' }, summary: 'Bearish FVG lämnad öppen.' },
        planStep(74, 'PLANNED_TRADE_CREATED', planFrom(base, scenarioId, at(74)), 'Planerad trade skapad som observation.'),
        { candleIndex: 78, type: 'RISK_STATE_REPORTED', payload: { status: 'CLEAR', note: null }, summary: 'Risk rapporterad KLAR.' },
        { candleIndex: 84, type: 'PROP_STATE_REPORTED', payload: { status: 'NOT_CONFIGURED' }, summary: 'Prop-läge: ej konfigurerad.' },
        candle(89, 'CISD ännu inte utvärderad.'),
      ]

    case 'a-plus-confirmed':
      return [
        { candleIndex: 58, type: 'DATA_FRESHNESS_CHANGED', payload: { freshness: 'FRESH', observedAt: at(58) }, summary: 'Feed rapporterad som aktuell.' },
        { candleIndex: 58, type: 'THESIS_UPDATED', payload: { headline: 'Likviditet under lika bottnar' }, summary: 'Tes: likviditet under lika bottnar.' },
        { candleIndex: 60, type: 'LIQUIDITY_OBSERVED', payload: { liquidityId: 'liq-eql', status: 'SWEPT' }, summary: 'Lika bottnar svepta.' },
        { candleIndex: 60, type: 'MANIPULATION_OBSERVED', payload: { manipulationId: 'manip-1' }, summary: 'Sweep under lika bottnar.' },
        confirmation(60, 'liquiditySweep', 'CONFIRMED', 'Likviditetssweep bekräftad.'),
        lifecycle(60, 'OBSERVING', 'DEVELOPING', 'Sweep bekräftad — setup utvecklas.'),
        { candleIndex: 64, type: 'FVG_STATE_CHANGED', payload: { fvgId: 'fvg-1', state: 'INVERTED' }, summary: 'FVG inverterad — iFVG rapporterad.' },
        confirmation(64, 'iFvg', 'CONFIRMED', 'iFVG bekräftad.'),
        { candleIndex: 68, type: 'MANIPULATION_OBSERVED', payload: { manipulationId: 'manip-2' }, summary: 'Displacement upp.' },
        confirmation(68, 'cisd', 'CONFIRMED', 'CISD bekräftad.'),
        { candleIndex: 72, type: 'FVG_STATE_CHANGED', payload: { fvgId: 'fvg-2', state: 'OPEN' }, summary: 'Bullish FVG lämnad öppen.' },
        confirmation(76, 'smt', 'TRUE', 'SMT rapporterad TRUE.', 'Samtliga fyra bekräftelser rapporterade.'),
        lifecycle(76, 'DEVELOPING', 'CONFIRMED', 'Alla bekräftelser på plats. Bekräftad betyder inte körbar.'),
        planStep(80, 'PLANNED_TRADE_CREATED', planFrom(base, scenarioId, at(80), { lifecycle: 'CONFIRMED' }), 'Planerad trade skapad — ingen execution provider.'),
        { candleIndex: 82, type: 'RISK_STATE_REPORTED', payload: { status: 'CLEAR', note: 'Reserverad risk är en pre-entry-kontroll, inte en realiserad förlust.' }, summary: 'Risk rapporterad KLAR.' },
        { candleIndex: 84, type: 'PROP_STATE_REPORTED', payload: { status: 'NOT_CONFIGURED' }, summary: 'Prop-läge: ej konfigurerad.' },
        candle(89, 'Bekräftad setup — fortfarande inte körbar.'),
      ]

    case 'risk-blocked':
      return [
        { candleIndex: 58, type: 'DATA_FRESHNESS_CHANGED', payload: { freshness: 'FRESH', observedAt: at(58) }, summary: 'Feed rapporterad som aktuell.' },
        { candleIndex: 58, type: 'THESIS_UPDATED', payload: { headline: 'Struktur finns — risken avgör' }, summary: 'Tes: struktur finns.' },
        { candleIndex: 62, type: 'LIQUIDITY_OBSERVED', payload: { liquidityId: 'liq-sl', status: 'SWEPT' }, summary: 'Sessionslägsta svept.' },
        confirmation(62, 'liquiditySweep', 'CONFIRMED', 'Likviditetssweep bekräftad.'),
        lifecycle(62, 'OBSERVING', 'DEVELOPING', 'Sweep bekräftad — setup utvecklas.'),
        confirmation(66, 'iFvg', 'CONFIRMED', 'iFVG bekräftad.'),
        confirmation(70, 'cisd', 'CONFIRMED', 'CISD bekräftad.'),
        lifecycle(70, 'DEVELOPING', 'CONFIRMED', 'Setupen är bekräftad.'),
        planStep(72, 'PLANNED_TRADE_CREATED', planFrom(base, scenarioId, at(72), { lifecycle: 'CONFIRMED' }), 'Planerad trade skapad som observation.'),
        // The block lands after confirmation — quality does not exempt it.
        { candleIndex: 76, type: 'RISK_STATE_REPORTED', payload: { status: 'BLOCKED', note: 'Daglig förlustgräns nådd och samtliga tre försök förbrukade.' }, summary: 'Risk rapporterad BLOCKERAD.' },
        lifecycle(76, 'CONFIRMED', 'BLOCKED', 'Risk Engine rapporterar BLOCKED.'),
        planStep(76, 'PLANNED_TRADE_BLOCKED', planFrom(base, scenarioId, at(76), { lifecycle: 'BLOCKED', updatedAt: at(76), riskStatus: 'BLOCKED' }), 'Planen blockerad av riskläget.'),
        { candleIndex: 84, type: 'PROP_STATE_REPORTED', payload: { status: 'NOT_CONFIGURED' }, summary: 'Prop-läge: ej konfigurerad.' },
        candle(89, 'Ingenting i strukturen kan leda till en order.'),
      ]

    case 'neutral-no-setup':
      return [
        { candleIndex: 58, type: 'DATA_FRESHNESS_CHANGED', payload: { freshness: 'FRESH', observedAt: at(58) }, summary: 'Feed rapporterad som aktuell.' },
        { candleIndex: 58, type: 'THESIS_UPDATED', payload: { headline: 'Ingen bias' }, summary: 'Tes: ingen bias.' },
        candle(66, 'Smal range runt vald 4H-open.'),
        confirmation(70, 'liquiditySweep', 'ABSENT', 'Ingen likviditet tagen.'),
        confirmation(74, 'iFvg', 'ABSENT', 'Ingen FVG.'),
        confirmation(78, 'cisd', 'ABSENT', 'Ingen CISD.', 'Ingen setup är under utveckling.'),
        { candleIndex: 82, type: 'RISK_STATE_REPORTED', payload: { status: 'NOT_EVALUATED', note: 'Ingen kandidat att utvärdera.' }, summary: 'Risk ej utvärderad.' },
        { candleIndex: 84, type: 'PROP_STATE_REPORTED', payload: { status: 'NOT_CONFIGURED' }, summary: 'Prop-läge: ej konfigurerad.' },
        // Nothing was planned, so nothing is planned. An observed position still
        // exists — someone else's, which is exactly why the two models differ.
        {
          candleIndex: 86,
          type: 'OBSERVED_POSITION_OPENED',
          payload: { position: observedPosition(base, at(86)), positionId: `pos:${base.instrument}:1` },
          summary: 'Observerad position utan motsvarande plan.',
        },
        candle(89, 'Ingenting att agera på.'),
      ]

    case 'unknown-stale':
      return [
        { candleIndex: 58, type: 'DATA_FRESHNESS_CHANGED', payload: { freshness: 'FRESH', observedAt: at(58) }, summary: 'Feed rapporterad som aktuell.' },
        { candleIndex: 58, type: 'THESIS_UPDATED', payload: { headline: 'Bevakar' }, summary: 'Tes: bevakar.' },
        candle(64, 'Observationer fortsätter.'),
        confirmation(68, 'liquiditySweep', 'UNKNOWN', 'Bekräftelsetillstånd okänt.'),
        // The feed goes stale mid-scenario. Everything derived becomes UNKNOWN.
        { candleIndex: 72, type: 'DATA_FRESHNESS_CHANGED', payload: { freshness: 'STALE', observedAt: at(72) }, summary: 'Feeden rapporteras som inaktuell.' },
        confirmation(72, 'iFvg', 'UNKNOWN', 'Bekräftelsetillstånd okänt.'),
        confirmation(72, 'cisd', 'UNKNOWN', 'Bekräftelsetillstånd okänt.', 'Inget bekräftelsetillstånd kan fastställas från en inaktuell feed.'),
        lifecycle(72, 'OBSERVING', 'INVALIDATED', 'Tillståndet kan inte bekräftas från en inaktuell feed.'),
        { candleIndex: 76, type: 'RISK_STATE_REPORTED', payload: { status: 'UNKNOWN', note: 'Riskläget kan inte fastställas. UNKNOWN blir aldrig ALLOW.' }, summary: 'Riskläge okänt.' },
        { candleIndex: 80, type: 'PROP_STATE_REPORTED', payload: { status: 'UNKNOWN' }, summary: 'Prop-läge okänt.' },
        {
          candleIndex: 84,
          type: 'OBSERVED_POSITION_UPDATED',
          payload: {
            position: observedPosition(base, at(84), {
              freshness: 'UNKNOWN',
              quantity: unknownValue(),
              lastPrice: unknownValue(),
              averageEntry: unknownValue(),
              stopLoss: unknownValue(),
              openedAt: unknownValue(),
              state: 'UNKNOWN',
              note: 'Positionstillståndet kan inte bekräftas.',
            }),
            positionId: `pos:${base.instrument}:1`,
          },
          summary: 'Positionstillståndet kan inte bekräftas.',
        },
        candle(89, 'Inget tillstånd kan bekräftas.'),
      ]
  }
}

/**
 * Build one timeline.
 *
 * Pure and total: same three arguments always produce a deeply equal result,
 * with no clock read and no randomness.
 */
export function buildReplayTimeline(
  scenarioId: MarketViewScenarioId,
  instrument: MarketInstrument,
  timeframe: MarketTimeframe,
): ReplayTimeline {
  const base = buildFixtureSnapshot(scenarioId, instrument, timeframe)
  const steps = stepsFor(scenarioId, base)
  return {
    scenarioId,
    instrument,
    timeframe,
    startsAt: base.candles[START_CANDLE].openTime,
    startCandleIndex: START_CANDLE,
    events: materialize(scenarioId, instrument, base, steps),
    base,
  }
}
