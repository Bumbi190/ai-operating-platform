/**
 * Omnira Trading — projecting replay state onto the presentation boundary.
 *
 *      Replay/Event State  →  Projection  →  TradingMarketViewSnapshot  →  view
 *
 * The snapshot stays exactly what Stage 1 made it: renderer-neutral,
 * provider-neutral presentation. It does not become the replay engine, it holds
 * no cursor, and it learns nothing about events. This module is the only place
 * that knows both sides.
 *
 * WHAT DOES NOT LEAK ACROSS THIS BOUNDARY
 * ───────────────────────────────────────
 * SVG coordinates (geometry is computed by the chart, from the snapshot),
 * browser state, provider protocol types, and authority objects. The snapshot
 * has no field that could carry any of them, and nothing here constructs one.
 *
 * The projection is a pure function of `(timeline, cursor)`. It reads no clock:
 * market time arrives from the applied events, and session windows resolve
 * through the existing Time Foundation from that instant.
 */

import {
  buildSessionDisplayState,
  type MarketExplanation,
  type ExplanationEntry,
  type TradingMarketViewSnapshot,
} from '../market-view'
import { clockAt } from './engine'
import { lifecycleToSetupStage, LIFECYCLE_LABELS } from './lifecycle'
import { initialReplayState, projectStateAt, type ReplayState } from './state'
import type { ReplayTimeline } from './timelines'
import type { ObservedPosition } from './observed-position'
import type { PlannedTradeView } from './planned-trade'

/**
 * Everything the Trading workspace renders at one cursor position.
 *
 * The snapshot is the presentation boundary Stage 1 locked. Planned trades and
 * observed positions ride alongside it rather than inside it, because they are
 * NOT market-view state — they are the two sides of the future right rail, and
 * folding them into the snapshot would blur exactly the distinction Stage 1.5
 * exists to draw.
 */
export interface TradingReplayProjection {
  readonly snapshot: TradingMarketViewSnapshot
  readonly plannedTrades: readonly PlannedTradeView[]
  readonly observedPositions: readonly ObservedPosition[]
  readonly state: ReplayState
}

function explanationFrom(
  state: ReplayState,
  base: TradingMarketViewSnapshot,
): MarketExplanation {
  /*
   * The timeline is projected from structured events, not stored as prose. Each
   * entry's text is the event's `summary`, which is a rendering of its payload —
   * so the journal keeps the structured record and the operator reads a
   * sentence, without either being the other's only source.
   */
  const timeline: ExplanationEntry[] = state.applied.map((event) => ({
    id: event.eventId,
    at: event.occurredAt,
    text: event.summary,
  }))

  const headline = state.lifecycle === 'OBSERVING' && state.applied.length === 0
    ? 'Replay har inte börjat'
    : `${base.explanation.headline} · ${LIFECYCLE_LABELS[state.lifecycle]}`

  return {
    headline,
    body: base.explanation.body,
    timeline,
  }
}

/**
 * Project a cursor position into a renderable state.
 *
 * `cursor` of -1 is the pre-start state: the chart shows the bars that were
 * already there, and every derived state reads UNKNOWN, because nothing has
 * been observed yet. That is a real state, not an empty one.
 */
export function projectReplay(
  timeline: ReplayTimeline,
  cursor: number,
): TradingReplayProjection {
  const initial = initialReplayState({
    scenarioId: timeline.scenarioId,
    instrument: timeline.instrument,
    timeframe: timeline.timeframe,
    startsAt: timeline.startsAt,
    startCandleIndex: timeline.startCandleIndex,
  })
  const state = projectStateAt(initial, timeline.events, cursor)
  const base = timeline.base
  const clock = clockAt(timeline.events, cursor, timeline.startsAt)

  // Only bars up to the cursor are visible. Slicing rather than regenerating
  // keeps every price identical to the Stage 1 series.
  const candles = base.candles.slice(0, state.candleIndex + 1)

  const liquidity = base.liquidity.map((level) => {
    const status = state.liquidityStatus[level.id]
    // Unobserved liquidity is UNKNOWN, not INTACT: we have not looked yet.
    return { ...level, status: status ?? 'UNKNOWN' }
  })

  const fairValueGaps = base.fairValueGaps
    .filter((gap) => state.fvgState[gap.id] !== undefined)
    .map((gap) => ({ ...gap, state: state.fvgState[gap.id] }))

  const manipulation = base.manipulation.filter((marker) =>
    state.revealedManipulation.includes(marker.id),
  )

  const liquidityZones = base.liquidityZones.filter((zone) =>
    Date.parse(zone.fromTime) <= clock.epochMs(),
  )

  const setupStage = lifecycleToSetupStage(state.lifecycle, state.lifecycleReached)

  const snapshot: TradingMarketViewSnapshot = {
    ...base,
    generatedAt: clock.now(),
    candles,
    liquidity,
    liquidityZones,
    fairValueGaps,
    manipulation,
    provenance: {
      ...base.provenance,
      freshness: state.freshness,
      observedAt: state.observedAt,
    },
    thesis: {
      ...base.thesis,
      headline: state.thesisHeadline ?? base.thesis.headline,
    },
    setup: {
      ...base.setup,
      stage: setupStage,
      confirmations: state.confirmations,
      note: state.setupNote,
    },
    tradeProposal: state.plannedTrade === null
      ? {
          // No plan yet is not "a plan with empty fields". Every price is null
          // and the reason says why.
          ...base.tradeProposal,
          entry: null,
          stopLoss: null,
          takeProfit: null,
          breakEven: null,
          riskReward: null,
          reason: 'Ingen planerad trade vid denna punkt i replayen.',
        }
      : {
          ...base.tradeProposal,
          direction: state.plannedTrade.direction,
          grade: state.plannedTrade.grade,
          status: state.plannedTrade.status,
          entry: state.plannedTrade.entry,
          stopLoss: state.plannedTrade.stopLoss,
          takeProfit: state.plannedTrade.takeProfit,
          breakEven: state.plannedTrade.breakEven,
          riskReward: state.plannedTrade.riskReward,
          reason: state.plannedTrade.reason,
        },
    riskState: {
      ...base.riskState,
      status: state.riskStatus,
      note: state.riskNote,
    },
    propState: { ...base.propState, status: state.propStatus },
    // Session windows resolve from MARKET time, through the Time Foundation.
    sessionState: buildSessionDisplayState(new Date(clock.epochMs())),
    explanation: explanationFrom(state, base),
  }

  return {
    snapshot,
    plannedTrades: state.plannedTrade === null ? [] : [state.plannedTrade],
    observedPositions: state.positions,
    state,
  }
}
