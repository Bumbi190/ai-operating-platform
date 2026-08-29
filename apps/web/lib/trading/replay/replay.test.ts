/**
 * Replay determinism, clock separation, lifecycle and the plan/position split.
 *
 * The assertions that matter most are the ones about recomputation: a replay
 * whose backward step is an inverse operation drifts, and the drift is invisible
 * until two runs disagree. Every determinism test here therefore compares
 * canonical serializations, not just deep equality.
 */

import { describe, expect, it } from 'vitest'
import {
  INITIAL_CURSOR,
  PLAYBACK_SPEEDS,
  SETUP_LIFECYCLES,
  allowedTransitionsFrom,
  buildReplayTimeline,
  canTransition,
  clockAt,
  isAtEnd,
  isAtStart,
  journalableEvents,
  lifecycleAllowsExecution,
  observationAgeMs,
  observedPositionGrantsAuthority,
  orderReplayEvents,
  pause,
  play,
  plannedTradeExpiredAt,
  plannedTradeIsExecutable,
  projectReplay,
  replayClockAt,
  replayEventId,
  replayProgress,
  resetCursor,
  seekTo,
  seekToTime,
  serializeTimeline,
  setSpeed,
  stepBackward,
  stepForward,
  toTradingEvent,
  type PlaybackSpeed,
  type ReplayCursor,
  type SetupLifecycle,
} from './index'
import {
  MARKET_INSTRUMENTS,
  MARKET_TIMEFRAMES,
  MARKET_VIEW_SCENARIO_IDS,
  type MarketViewScenarioId,
} from '../market-view'

const SCENARIOS = MARKET_VIEW_SCENARIO_IDS
const TL = (s: MarketViewScenarioId = 'a-plus-confirmed') => buildReplayTimeline(s, 'NQ', '5m')

/** Canonical serialization of a projection, for byte-level comparison. */
function fingerprint(scenario: MarketViewScenarioId, cursor: number): string {
  const projection = projectReplay(TL(scenario), cursor)
  return JSON.stringify({
    snapshot: projection.snapshot,
    plannedTrades: projection.plannedTrades,
    observedPositions: projection.observedPositions,
    state: projection.state,
  })
}

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('replay determinism', () => {
  it('gives the same state for the same scenario and cursor', () => {
    for (const scenario of SCENARIOS) {
      const timeline = buildReplayTimeline(scenario, 'NQ', '5m')
      for (let cursor = -1; cursor < timeline.events.length; cursor += 1) {
        expect(fingerprint(scenario, cursor), `${scenario}@${cursor}`).toBe(fingerprint(scenario, cursor))
      }
    }
  })

  it('makes forward → back → forward byte-identical to forward', () => {
    for (const scenario of SCENARIOS) {
      const timeline = buildReplayTimeline(scenario, 'NQ', '5m')
      let cursor: ReplayCursor = INITIAL_CURSOR
      for (let step = 0; step < 6; step += 1) cursor = stepForward(cursor, timeline.events)
      const straight = fingerprint(scenario, cursor.position)

      // Wander: back three, forward three. Same position, and it must be the
      // same state — this is the assertion that fails if backward is ever
      // implemented as an inverse rather than a recompute.
      let wandered = cursor
      for (let step = 0; step < 3; step += 1) wandered = stepBackward(wandered, timeline.events)
      for (let step = 0; step < 3; step += 1) wandered = stepForward(wandered, timeline.events)
      expect(wandered.position).toBe(cursor.position)
      expect(fingerprint(scenario, wandered.position), scenario).toBe(straight)
    }
  })

  it('makes seek identical to stepping there', () => {
    const timeline = TL()
    const target = 9
    let stepped: ReplayCursor = INITIAL_CURSOR
    for (let step = 0; step <= target; step += 1) stepped = stepForward(stepped, timeline.events)
    const sought = seekTo(INITIAL_CURSOR, timeline.events, target)
    expect(sought.position).toBe(stepped.position)
    expect(fingerprint('a-plus-confirmed', sought.position)).toBe(fingerprint('a-plus-confirmed', stepped.position))
  })

  it('makes reset reproducible', () => {
    const timeline = TL()
    let cursor: ReplayCursor = INITIAL_CURSOR
    for (let step = 0; step < 8; step += 1) cursor = stepForward(cursor, timeline.events)
    const afterReset = resetCursor(cursor)
    expect(afterReset.position).toBe(-1)
    expect(isAtStart(afterReset)).toBe(true)
    expect(fingerprint('a-plus-confirmed', afterReset.position)).toBe(fingerprint('a-plus-confirmed', -1))
  })

  it('does not let playback speed change market state', () => {
    const timeline = TL()
    const reference = fingerprint('a-plus-confirmed', 7)
    for (const speed of PLAYBACK_SPEEDS) {
      const cursor = setSpeed(seekTo(INITIAL_CURSOR, timeline.events, 7), speed as PlaybackSpeed)
      expect(cursor.speed).toBe(speed)
      expect(fingerprint('a-plus-confirmed', cursor.position), `speed ${speed}`).toBe(reference)
    }
  })

  it('builds identical timelines across calls, including serialization', () => {
    for (const scenario of SCENARIOS) {
      const a = buildReplayTimeline(scenario, 'NQ', '5m')
      const b = buildReplayTimeline(scenario, 'NQ', '5m')
      expect(serializeTimeline(b.events)).toBe(serializeTimeline(a.events))
    }
  })

  it('reads no wall clock — two builds a moment apart agree', async () => {
    const before = fingerprint('long-developing', 5)
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(fingerprint('long-developing', 5)).toBe(before)
  })

  it('clamps out-of-range cursors instead of throwing', () => {
    const timeline = TL()
    expect(() => projectReplay(timeline, -99)).not.toThrow()
    expect(() => projectReplay(timeline, 9999)).not.toThrow()
    expect(fingerprint('a-plus-confirmed', 9999)).toBe(fingerprint('a-plus-confirmed', timeline.events.length - 1))
  })
})

// ─── Cursor behaviour ─────────────────────────────────────────────────────────

describe('replay cursor', () => {
  it('starts before the first event, which is a real state', () => {
    const timeline = TL()
    expect(INITIAL_CURSOR.position).toBe(-1)
    const projection = projectReplay(timeline, -1)
    expect(projection.state.applied).toHaveLength(0)
    expect(projection.plannedTrades).toHaveLength(0)
    // Nothing observed yet is UNKNOWN, never false or empty.
    expect(projection.state.freshness).toBe('UNKNOWN')
    expect(Object.values(projection.state.confirmations)).toEqual(['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'])
  })

  it('stops at the end and stops claiming to play', () => {
    const timeline = TL()
    let cursor = seekTo(INITIAL_CURSOR, timeline.events, timeline.events.length - 1)
    cursor = play(cursor, timeline.events)
    expect(cursor.playing).toBe(false)
    cursor = stepForward(cursor, timeline.events)
    expect(cursor.position).toBe(timeline.events.length - 1)
    expect(isAtEnd(cursor, timeline.events)).toBe(true)
  })

  it('is safe at the start', () => {
    const timeline = TL()
    let cursor = INITIAL_CURSOR
    for (let step = 0; step < 5; step += 1) cursor = stepBackward(cursor, timeline.events)
    expect(cursor.position).toBe(-1)
  })

  it('pauses when stepping backward', () => {
    const timeline = TL()
    const playing = play(seekTo(INITIAL_CURSOR, timeline.events, 4), timeline.events)
    expect(playing.playing).toBe(true)
    expect(stepBackward(playing, timeline.events).playing).toBe(false)
  })

  it('play and pause are inverse and change nothing else', () => {
    const timeline = TL()
    const at = seekTo(INITIAL_CURSOR, timeline.events, 3)
    expect(pause(play(at, timeline.events))).toEqual(at)
  })

  it('reports progress from 0 at the start to 1 at the end', () => {
    const timeline = TL()
    expect(replayProgress(INITIAL_CURSOR, timeline.events)).toBe(0)
    const end = seekTo(INITIAL_CURSOR, timeline.events, timeline.events.length - 1)
    expect(replayProgress(end, timeline.events)).toBe(1)
  })

  it('seeks by time to the last event at or before the instant', () => {
    const timeline = TL()
    const target = timeline.events[5].occurredAt
    const cursor = seekToTime(INITIAL_CURSOR, timeline.events, target)
    expect(cursor.position).toBeGreaterThanOrEqual(5)
    expect(Date.parse(timeline.events[cursor.position].occurredAt)).toBeLessThanOrEqual(Date.parse(target))
    // Before the timeline lands before the first event, not on it.
    expect(seekToTime(INITIAL_CURSOR, timeline.events, '2000-01-01T00:00:00Z' as never).position).toBe(-1)
  })
})

// ─── Clock ────────────────────────────────────────────────────────────────────

describe('market clock', () => {
  it('is a pure function of the cursor', () => {
    const timeline = TL()
    const clock = clockAt(timeline.events, 4, timeline.startsAt)
    expect(clock.source).toBe('REPLAY')
    expect(clock.now()).toBe(clock.now())
    expect(clock.now()).toBe(timeline.events[4].occurredAt)
  })

  it('reads the scenario start before the first event', () => {
    const timeline = TL()
    expect(clockAt(timeline.events, -1, timeline.startsAt).now()).toBe(timeline.startsAt)
  })

  it('does not advance with wall time', async () => {
    const timeline = TL()
    const clock = clockAt(timeline.events, 3, timeline.startsAt)
    const first = clock.epochMs()
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(clock.epochMs()).toBe(first)
  })

  it('keeps NY session rendering correct across DST', () => {
    // Session windows resolve from market time through the Time Foundation.
    const summer = projectReplay(TL(), 0).snapshot.sessionState
    expect(summer.timezone).toBe('America/New_York')
    expect(summer.utcOffset).toBe('-04:00')

    // The clock itself is zone-agnostic; the Foundation does the conversion.
    const winter = replayClockAt('2026-01-15T15:30:00Z' as never)
    expect(winter.now()).toBe('2026-01-15T15:30:00Z')
  })

  it('computes observation age from two explicit instants', () => {
    expect(observationAgeMs('2026-08-28T15:00:00Z' as never, '2026-08-28T15:05:00Z' as never)).toBe(300_000)
    // Ahead of the reference is a real condition, not clamped to zero.
    expect(observationAgeMs('2026-08-28T15:10:00Z' as never, '2026-08-28T15:05:00Z' as never)).toBe(-300_000)
  })
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe('setup lifecycle', () => {
  it('permits execution in no state whatsoever', () => {
    for (const state of SETUP_LIFECYCLES) {
      expect(lifecycleAllowsExecution(state as SetupLifecycle), state).toBe(false)
    }
  })

  it('keeps CONFIRMED non-executable in the rendered projection', () => {
    const timeline = TL('a-plus-confirmed')
    const projection = projectReplay(timeline, timeline.events.length - 1)
    expect(projection.state.lifecycle).toBe('CONFIRMED')
    expect(projection.plannedTrades).toHaveLength(1)
    expect(plannedTradeIsExecutable(projection.plannedTrades[0])).toBe(false)
    expect(projection.snapshot.tradeProposal.status).toBe('NO_EXECUTION_PROVIDER')
  })

  it('keeps BLOCKED non-executable, and lets it arrive after CONFIRMED', () => {
    const timeline = TL('risk-blocked')
    const projection = projectReplay(timeline, timeline.events.length - 1)
    expect(projection.state.lifecycle).toBe('BLOCKED')
    // The block did not erase what the setup reached.
    expect(projection.state.lifecycleReached).toBe('CONFIRMED')
    expect(projection.snapshot.setup.stage).toBe('CONFIRMED')
    expect(projection.snapshot.riskState.status).toBe('BLOCKED')
    expect(plannedTradeIsExecutable(projection.plannedTrades[0])).toBe(false)
  })

  it('fails closed on an unknown/stale feed', () => {
    const timeline = TL('unknown-stale')
    const projection = projectReplay(timeline, timeline.events.length - 1)
    expect(projection.snapshot.provenance.freshness).toBe('STALE')
    expect(projection.snapshot.riskState.status).toBe('UNKNOWN')
    expect(projection.snapshot.propState.status).toBe('UNKNOWN')
    expect(Object.values(projection.snapshot.setup.confirmations)).toContain('UNKNOWN')
  })

  it('allows only coherent transitions, and none out of a terminal state', () => {
    expect(canTransition('DEVELOPING', 'CONFIRMED')).toBe(true)
    expect(canTransition('DEVELOPING', 'BLOCKED')).toBe(true)
    expect(canTransition('CONFIRMED', 'BLOCKED')).toBe(true)
    expect(canTransition('BLOCKED', 'CONFIRMED')).toBe(true)
    expect(canTransition('OBSERVING', 'CONFIRMED')).toBe(false)
    for (const terminal of ['EXPIRED', 'INVALIDATED', 'COMPLETED'] as const) {
      expect(allowedTransitionsFrom(terminal)).toEqual([])
    }
  })

  it('only asserts transitions the table permits', () => {
    for (const scenario of SCENARIOS) {
      const timeline = buildReplayTimeline(scenario, 'NQ', '5m')
      for (const event of timeline.events) {
        if (event.type !== 'SETUP_LIFECYCLE_CHANGED') continue
        const payload = event.payload as { from: SetupLifecycle; to: SetupLifecycle }
        expect(canTransition(payload.from, payload.to), `${scenario}: ${payload.from}→${payload.to}`).toBe(true)
      }
    }
  })
})

// ─── Planned trade vs observed position ───────────────────────────────────────

describe('a plan is not a position', () => {
  it('keeps them as separate collections with disjoint ids', () => {
    const timeline = TL('neutral-no-setup')
    const projection = projectReplay(timeline, timeline.events.length - 1)
    // This scenario has an observed position and no plan — which is the whole
    // point: a position can exist that Omnira never proposed.
    expect(projection.plannedTrades).toHaveLength(0)
    expect(projection.observedPositions).toHaveLength(1)
    expect(projection.observedPositions[0].unattributed).toBe(true)
    expect(projection.observedPositions[0].positionId).toMatch(/^pos:/)
  })

  it('gives a plan no broker identity and no command surface', () => {
    const timeline = TL('a-plus-confirmed')
    const plan = projectReplay(timeline, timeline.events.length - 1).plannedTrades[0]
    for (const forbidden of ['orderId', 'brokerOrderId', 'clientOrderId', 'submit', 'send', 'execute', 'cancel']) {
      expect(Object.keys(plan), `plan exposes ${forbidden}`).not.toContain(forbidden)
    }
    // Data only — no function-valued member could be invoked.
    for (const [key, value] of Object.entries(plan)) {
      expect(typeof value, `plan.${key} is callable`).not.toBe('function')
    }
    expect(plan.plannedTradeId).toMatch(/^plan:/)
  })

  it('gives an observed position no authority', () => {
    const timeline = TL('neutral-no-setup')
    const position = projectReplay(timeline, timeline.events.length - 1).observedPositions[0]
    expect(observedPositionGrantsAuthority(position)).toBe(false)
    for (const [key, value] of Object.entries(position)) {
      expect(typeof value, `position.${key} is callable`).not.toBe('function')
    }
  })

  it('keeps missing provider readings explicitly unavailable, never zero', () => {
    const timeline = TL('neutral-no-setup')
    const position = projectReplay(timeline, timeline.events.length - 1).observedPositions[0]
    expect(position.unrealizedPnl).toEqual({ state: 'UNAVAILABLE' })
    expect(position.takeProfit).toEqual({ state: 'UNAVAILABLE' })
    expect(position.quantity).toEqual({ state: 'PRESENT', value: 1 })
  })

  it('degrades every reading to UNKNOWN on a stale feed', () => {
    const timeline = TL('unknown-stale')
    const position = projectReplay(timeline, timeline.events.length - 1).observedPositions[0]
    expect(position.state).toBe('UNKNOWN')
    expect(position.freshness).toBe('UNKNOWN')
    for (const field of ['quantity', 'lastPrice', 'averageEntry', 'openedAt'] as const) {
      expect(position[field], field).toEqual({ state: 'UNKNOWN' })
    }
  })

  it('does not expire a plan that carries no expiry', () => {
    const timeline = TL('a-plus-confirmed')
    const plan = projectReplay(timeline, timeline.events.length - 1).plannedTrades[0]
    expect(plan.expiresAt).toBeNull()
    expect(plannedTradeExpiredAt(plan, '2099-01-01T00:00:00Z' as never)).toBe(false)
    // With an expiry, equal counts as expired — the conservative boundary.
    const expiring = { ...plan, expiresAt: '2026-08-28T15:00:00Z' as never }
    expect(plannedTradeExpiredAt(expiring, '2026-08-28T15:00:00Z' as never)).toBe(true)
    expect(plannedTradeExpiredAt(expiring, '2026-08-28T14:59:59Z' as never)).toBe(false)
  })
})

// ─── Timeline and journal readiness ───────────────────────────────────────────

describe('event timeline', () => {
  it('has stable, deterministic ids in sequence order', () => {
    for (const scenario of SCENARIOS) {
      const timeline = buildReplayTimeline(scenario, 'NQ', '5m')
      timeline.events.forEach((event, index) => {
        expect(event.eventId).toBe(replayEventId(scenario, index))
        expect(event.sequence).toBe(index)
      })
    }
  })

  it('threads causation from each event to its predecessor', () => {
    const timeline = TL()
    expect(timeline.events[0].causationId).toBeNull()
    for (let index = 1; index < timeline.events.length; index += 1) {
      expect(timeline.events[index].causationId).toBe(timeline.events[index - 1].eventId)
    }
  })

  it('shares one correlation id across a scenario', () => {
    const timeline = TL()
    const ids = new Set(timeline.events.map((event) => event.correlationId))
    expect(ids.size).toBe(1)
  })

  it('is already in total order, and ordering is idempotent', () => {
    for (const scenario of SCENARIOS) {
      const timeline = buildReplayTimeline(scenario, 'NQ', '5m')
      const ordered = orderReplayEvents(timeline.events)
      expect(ordered.map((e) => e.eventId)).toEqual(timeline.events.map((e) => e.eventId))
      expect(orderReplayEvents(ordered).map((e) => e.eventId)).toEqual(ordered.map((e) => e.eventId))
    }
  })

  it('never moves backwards in market time', () => {
    for (const scenario of SCENARIOS) {
      const timeline = buildReplayTimeline(scenario, 'NQ', '5m')
      for (let index = 1; index < timeline.events.length; index += 1) {
        expect(Date.parse(timeline.events[index].occurredAt))
          .toBeGreaterThanOrEqual(Date.parse(timeline.events[index - 1].occurredAt))
      }
    }
  })

  it('carries the fields a journal needs, with structured payloads', () => {
    const timeline = TL()
    for (const event of timeline.events) {
      expect(event.eventId).toBeTruthy()
      expect(event.scenarioId).toBe(timeline.scenarioId)
      expect(event.occurredAt).toBeTruthy()
      expect(event.recordedAt).toBeTruthy()
      expect(event.instrument).toBe('NQ')
      expect(event.correlationId).toBeTruthy()
      expect(event.environment).toBe('development')
      expect(event.origin).toBe('FIXTURE')
      expect(event.sourceComponent).toBe('trading.replay.fixture')
      expect(event.payloadVersion).toBe('1')
      // Structured, not free text. `summary` is a projection alongside it.
      expect(typeof event.payload).toBe('object')
      expect(event.payload).not.toBeNull()
    }
  })

  it('converts decision events into canonical TradingEvents', () => {
    const timeline = TL('risk-blocked')
    const journal = journalableEvents(timeline.events, { recordedAt: '2026-08-28T16:00:00Z' as never })
    expect(journal.length).toBeGreaterThan(0)
    for (const event of journal) {
      expect(event.recordedAt).toBe('2026-08-28T16:00:00Z')
      expect(event.accountId).toBeNull()
      expect(event.strategyVersionId).toBeNull()
    }
    expect(journal.some((e) => e.eventType === 'PROPOSAL_CREATED')).toBe(true)
    expect(journal.some((e) => e.eventType === 'RISK_DECIDED')).toBe(true)
    expect(journal.some((e) => e.severity === 'WARNING')).toBe(true)
  })

  it('refuses to invent a canonical type for a market observation', () => {
    const timeline = TL()
    const candle = timeline.events.find((e) => e.type === 'CANDLE_ADVANCED')
    expect(candle).toBeTruthy()
    expect(toTradingEvent(candle!, { recordedAt: '2026-08-28T16:00:00Z' as never })).toBeNull()
  })

  it('serializes canonically — key order cannot change the bytes', () => {
    const timeline = TL()
    const reordered = timeline.events.map((event) => {
      const entries = Object.entries(event).reverse()
      return Object.fromEntries(entries) as typeof event
    })
    expect(serializeTimeline(reordered)).toBe(serializeTimeline(timeline.events))
  })
})

// ─── Projection ───────────────────────────────────────────────────────────────

describe('projection onto the presentation boundary', () => {
  it('arrives at the Stage 1 state at the final cursor', () => {
    for (const scenario of SCENARIOS) {
      const timeline = buildReplayTimeline(scenario, 'NQ', '5m')
      const projection = projectReplay(timeline, timeline.events.length - 1)
      // The candle series is the Stage 1 series, in full, unmodified.
      expect(projection.snapshot.candles).toEqual(timeline.base.candles)
      expect(projection.snapshot.instrument).toBe(timeline.base.instrument)
      expect(projection.snapshot.timeframe).toBe(timeline.base.timeframe)
      expect(projection.snapshot.riskState.status).toBe(timeline.base.riskState.status)
      expect(projection.snapshot.propState.status).toBe(timeline.base.propState.status)
      expect(projection.snapshot.provenance.freshness).toBe(timeline.base.provenance.freshness)
    }
  })

  it('reveals the chart progressively', () => {
    const timeline = TL()
    const early = projectReplay(timeline, 0).snapshot.candles.length
    const late = projectReplay(timeline, timeline.events.length - 1).snapshot.candles.length
    expect(early).toBeLessThan(late)
    expect(late).toBe(timeline.base.candles.length)
  })

  it('never leaks SVG, browser or authority concepts into the snapshot', () => {
    const projection = projectReplay(TL(), 5)
    const serialized = JSON.stringify(projection.snapshot)
    for (const leak of ['viewBox', 'svgPath', 'clientX', 'RiskClearance', 'ExecutionIntent', 'ApprovalGrant']) {
      expect(serialized, `snapshot leaks ${leak}`).not.toContain(leak)
    }
  })

  it('keeps every instrument and timeframe replayable', () => {
    for (const instrument of MARKET_INSTRUMENTS) {
      for (const timeframe of MARKET_TIMEFRAMES) {
        const timeline = buildReplayTimeline('long-developing', instrument, timeframe)
        expect(timeline.events.length).toBeGreaterThan(0)
        const projection = projectReplay(timeline, timeline.events.length - 1)
        expect(projection.snapshot.instrument).toBe(instrument)
        expect(projection.snapshot.timeframe).toBe(timeframe)
      }
    }
  })

  it('shows unobserved liquidity as UNKNOWN rather than intact', () => {
    const projection = projectReplay(TL('long-developing'), 0)
    expect(projection.snapshot.liquidity.every((level) => level.status === 'UNKNOWN')).toBe(true)
  })

  it('projects the explanation timeline from structured events', () => {
    const timeline = TL()
    const projection = projectReplay(timeline, 4)
    expect(projection.snapshot.explanation.timeline).toHaveLength(5)
    projection.snapshot.explanation.timeline.forEach((entry, index) => {
      expect(entry.id).toBe(timeline.events[index].eventId)
      expect(entry.text).toBe(timeline.events[index].summary)
    })
  })
})
