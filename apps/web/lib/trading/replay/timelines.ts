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
 *
 * WHAT IS NO LONGER AUTHORED HERE
 * ──────────────────────────────
 * Provider-observed positions. They are not an application assertion — they are
 * what someone else says is open — and they now arrive through
 * `PositionObservationSource` as a separate stream. This file authors what
 * Omnira thought; it no longer authors what a broker saw.
 */

import {
  buildFixtureSnapshot,
  type MarketInstrument,
  type MarketTimeframe,
  type MarketViewScenarioId,
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
import { defaultFixtureObservationSource, fixturePositionObservations } from './fixture-provider'
import type { SetupLifecycle } from './lifecycle'
import type { PlannedTradeView } from './planned-trade'
import type { PositionObservation } from './position-observation'
import {
  mergeReplayStreams,
  type MergedStreamEntry,
  type ReplayStream,
  type ReplayStreamEntry,
} from './streams'

/**
 * Which component produced an event. Core's own provenance field.
 *
 * The two streams say different things here, so a merged timeline never loses
 * track of which hand wrote a record — without widening the event envelope with
 * a parallel "stream" field that Core does not have.
 */
const APPLICATION_COMPONENT = 'trading.replay.fixture'
const OBSERVATION_COMPONENT = 'trading.replay.position-observation.fixture'
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
 * The application's own stream: what Omnira thought, planned and reported.
 *
 * One correlation for the whole scenario, because these events genuinely are
 * one opportunity's lifecycle — the thing Core's `correlationId` is defined to
 * thread.
 */
function applicationStream(
  scenarioId: MarketViewScenarioId,
  base: TradingMarketViewSnapshot,
  steps: readonly StepInput[],
): ReplayStream {
  const correlationId = `setup:${scenarioId}`
  const entries: ReplayStreamEntry[] = steps.map((step, index) => {
    const at = base.candles[Math.min(step.candleIndex, base.candles.length - 1)].openTime
    return {
      localSequence: index,
      type: step.type,
      instrument: base.instrument,
      occurredAt: at,
      // This stream learns about its own events at the instant it authors them.
      recordedAt: at,
      correlationId,
      sourceComponent: APPLICATION_COMPONENT,
      payload: step.payload,
      summary: step.summary,
    }
  })
  return {
    streamId: `application:${scenarioId}`,
    kind: 'APPLICATION',
    origin: base.provenance.origin,
    entries,
  }
}

/** Which replay event type each observation kind reports as. */
const OBSERVATION_EVENT_TYPE = {
  OPENED: 'OBSERVED_POSITION_OPENED',
  UPDATED: 'OBSERVED_POSITION_UPDATED',
  CLOSED: 'OBSERVED_POSITION_CLOSED',
} as const satisfies Record<PositionObservation['kind'], ReplayEventType>

/**
 * The provider's stream, converted from neutral observations.
 *
 * THE CONVERSION HAPPENS HERE, NOT IN THE SOURCE. A source hands over what it
 * observed; naming replay event types, minting global ids and deciding
 * correlation are assembly concerns, and a provider that did them would be
 * making claims about a timeline it has never seen.
 *
 * Each position gets its OWN correlation. A position observed at a broker is
 * not part of the setup's lifecycle — it may have no plan behind it at all, and
 * one of the fixtures is exactly that case — so threading it onto the setup's
 * correlation would assert a relationship that does not exist.
 */
function observationStream(
  scenarioId: MarketViewScenarioId,
  origin: ReplayStream['origin'],
  observations: readonly PositionObservation[],
): ReplayStream {
  const entries: ReplayStreamEntry[] = observations.map((observation) => ({
    localSequence: observation.localSequence,
    type: OBSERVATION_EVENT_TYPE[observation.kind],
    instrument: observation.instrument,
    occurredAt: observation.occurredAt,
    recordedAt: observation.recordedAt,
    correlationId: `position:${observation.position.positionId}`,
    sourceComponent: OBSERVATION_COMPONENT,
    payload: { position: observation.position, positionId: observation.position.positionId },
    summary: observation.summary,
  }))
  return {
    streamId: `observation:${scenarioId}`,
    kind: 'PROVIDER_OBSERVATION',
    origin,
    entries,
  }
}

/**
 * Turn a merged ordering into frozen replay events.
 *
 * GLOBAL IDENTITY IS MINTED AFTER THE MERGE, never before. Sequence is the
 * position in the merged order, so it is contiguous from 0; the event id is
 * derived from scenario and sequence, so it is deterministic; and neither is
 * anything a single stream could have known on its own.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CAUSATION FOLLOWS CORRELATION, NOT ARRAY POSITION
 * ─────────────────────────────────────────────────────────────────────────────
 * An event's `causationId` is the previous event OF THE SAME CORRELATION, not
 * the previous event in the merged array.
 *
 * With a single stream those were the same thing, and for the four scenarios
 * that have only application events they still are. With two independent
 * streams they are not, and the difference is not cosmetic: the merged
 * predecessor of a provider observation is decided by the comparator — in the
 * limit, by a tie-break that `streams.ts` documents as carrying NO causal
 * meaning at all. Chaining causation to it would promote a serialization
 * decision into a claim that Omnira's candle advance caused a broker to report
 * a position. It did not. Nothing Omnira does causes what a provider observes.
 *
 * Correlation is the honest chain, and it is Core's own definition of the
 * field: `correlationId` threads one lifecycle, `causationId` names the
 * immediate predecessor within it. A journal walking back from any event now
 * reconstructs the lifecycle that event belongs to, instead of a merge order
 * that mixes two unrelated stories together.
 */
function materializeStreams(
  scenarioId: MarketViewScenarioId,
  merged: readonly MergedStreamEntry[],
): readonly ReplayEvent[] {
  const previousInCorrelation = new Map<string, string>()

  return merged.map((item, index) => {
    const eventId = replayEventId(scenarioId, index)
    const { entry } = item
    const causationId = previousInCorrelation.get(entry.correlationId) ?? null
    previousInCorrelation.set(entry.correlationId, eventId)

    return replayEvent({
      eventId,
      sequence: index,
      scenarioId,
      type: entry.type,
      instrument: entry.instrument,
      occurredAt: entry.occurredAt,
      recordedAt: entry.recordedAt,
      correlationId: entry.correlationId,
      causationId,
      environment: 'development',
      origin: item.origin,
      sourceComponent: entry.sourceComponent,
      payloadVersion: PAYLOAD_VERSION,
      payload: entry.payload,
      summary: entry.summary,
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
        // exists at candle 86 — someone else's, which is exactly why the two
        // models differ — and it now arrives from the provider stream instead
        // of being authored here.
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
        // The position whose state cannot be confirmed is observed at candle 84
        // and reported by the provider stream, not by this authoring.
        candle(89, 'Inget tillstånd kan bekräftas.'),
      ]
  }
}

/**
 * Author a timeline on top of a base market observation and what a provider was
 * observed to report.
 *
 * THE ASSEMBLY STEP, SEPARATED FROM WHERE EITHER INPUT CAME FROM.
 *
 * This is what `ReplayTimelineSource` calls once it has read the market through
 * the `MarketViewDataSource` seam and the positions through the
 * `PositionObservationSource` seam. Both arrive as arguments; this function
 * never reaches for either, which is what keeps the two boundaries genuinely on
 * the path instead of sitting unused beside it.
 *
 * WHY `observations` HAS NO DEFAULT
 * ────────────────────────────────
 * Because the honest default does not exist. An empty array here means "the
 * provider was observed and reported nothing" — a positive claim about an
 * account being flat. A caller that had not established provider state would
 * make that claim by accident every time it forgot the argument, so the
 * argument is required and unavailability is resolved BEFORE this is reached.
 * This function cannot represent "we do not know", and must never be asked to.
 *
 * Pure and total: the same inputs always produce a deeply equal result, with no
 * clock read and no randomness.
 */
export function assembleReplayTimeline(
  scenarioId: MarketViewScenarioId,
  base: TradingMarketViewSnapshot,
  observations: readonly PositionObservation[],
): ReplayTimeline {
  const steps = stepsFor(scenarioId, base)
  const merged = mergeReplayStreams([
    applicationStream(scenarioId, base, steps),
    observationStream(scenarioId, base.provenance.origin, observations),
  ])
  return {
    scenarioId,
    instrument: base.instrument,
    timeframe: base.timeframe,
    startsAt: base.candles[START_CANDLE].openTime,
    startCandleIndex: START_CANDLE,
    events: materializeStreams(scenarioId, merged),
    base,
  }
}

/**
 * Build one timeline synchronously, straight from the fixture generators.
 *
 * A CONVENIENCE FOR TESTS AND FIXTURES, not the application's data path. The
 * Atlas Market View acquires timelines through `ReplayTimelineSource`, which
 * reads the market through one seam and positions through another; this skips
 * both because a test asserting replay determinism has no interest in them.
 *
 * It is deliberately implemented in terms of the SAME pieces the source uses —
 * `buildFixtureSnapshot`, `fixturePositionObservations`, then
 * `assembleReplayTimeline` — so there is one market generator, one observation
 * author and one assembly step no matter which path reaches them. A test
 * asserts the two paths produce identical timelines.
 */
export function buildReplayTimeline(
  scenarioId: MarketViewScenarioId,
  instrument: MarketInstrument,
  timeframe: MarketTimeframe,
): ReplayTimeline {
  const base = buildFixtureSnapshot(scenarioId, instrument, timeframe)
  const source = defaultFixtureObservationSource(scenarioId, timeframe)
  return assembleReplayTimeline(
    scenarioId,
    base,
    fixturePositionObservations(scenarioId, base, source),
  )
}
