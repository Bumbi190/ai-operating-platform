/**
 * Stage 1.7: provider-observed positions as a second, independent input.
 *
 * The claim under test is that provider reality can enter the same replay
 * timeline as application state without either one absorbing the other, and
 * without the result depending on which of them answered first.
 *
 * The most important assertions in this file are the ones about the difference
 * between an EMPTY answer and NO answer. Everything else is a correctness
 * property; that one is a safety property, because collapsing the two turns
 * "we do not know whether exposure exists" into "the account is flat".
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  MARKET_VIEW_SCENARIO_IDS,
  buildFixtureSnapshot,
  createMockMarketViewDataSource,
  type MarketInstrument,
  type MarketViewDataSource,
  type MarketViewQuery,
  type MarketViewScenarioId,
  type Timestamp,
  type TradingMarketViewSnapshot,
} from '../market-view'
import {
  assembleReplayTimeline,
  createFixturePositionObservationSource,
  createFixtureReplayTimelineSource,
  isKnownFlat,
  observationsOf,
  observedPositionGrantsAuthority,
  positionObservationGrantsAuthority,
  projectReplay,
  serializeTimeline,
  validatePositionObservationBatch,
  type ObservedPositionBatch,
  type PositionObservation,
  type PositionObservationBatch,
  type PositionObservationSource,
  type ReplayTimeline,
} from './index'
// The synchronous fixture authors are deliberately off the public barrel — see
// the note in index.ts. Tests reach for them directly, so the bypass is visible.
import { defaultFixtureObservationSource, fixturePositionObservations } from './fixture-provider'
import { buildReplayTimeline } from './timelines'

const NQ_5M: MarketViewQuery = { instrument: 'NQ', timeframe: '5m' }
const POSITION_SCENARIOS = ['neutral-no-setup', 'unknown-stale'] as const
const FLAT_SCENARIOS = MARKET_VIEW_SCENARIO_IDS.filter(
  (s) => !(POSITION_SCENARIOS as readonly string[]).includes(s),
)

function observationSource(
  scenario: MarketViewScenarioId = 'neutral-no-setup',
  overrides: Partial<Parameters<typeof createFixturePositionObservationSource>[0]> = {},
): PositionObservationSource {
  return createFixturePositionObservationSource({
    scenario,
    calibration: (instrument) => buildFixtureSnapshot(scenario, instrument, '5m'),
    ...overrides,
  })
}

async function observed(source: PositionObservationSource, instrument: MarketInstrument = 'NQ') {
  const batch = await source.observe({ instrument })
  if (batch.status !== 'OBSERVED') throw new Error('expected an OBSERVED batch')
  return batch
}

function code(file: string): string {
  return readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * A promise resolved by hand.
 *
 * Interleavings are forced, never raced. A timing-based proof passes on a fast
 * machine and flakes on a loaded one; this one is scheduler-independent.
 */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

// ─── The source contract ──────────────────────────────────────────────────────

describe('the fixture position-observation source', () => {
  it('declares the seam without declaring a provider', async () => {
    const source = observationSource()
    expect(source.id).toBe('observation:fixture:neutral-no-setup')
    expect(source.origin).toBe('FIXTURE')
    expect(source.providerLabel).toBe('Fixtur')
    expect(source.accountLabel).toBeNull()
    expect(source.instruments()).toEqual(['NQ', 'MNQ', 'ES'])
    // Data and one method. No connect, no session, no order surface.
    expect(Object.keys(source).filter((k) => typeof (source as never)[k] === 'function').sort())
      .toEqual(['instruments', 'observe'])
  })

  it('is deterministic: the same query always gives the same answer', async () => {
    const source = observationSource()
    const a = await source.observe({ instrument: 'NQ' })
    const b = await source.observe({ instrument: 'NQ' })
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
    // And a second source built from the same config agrees with both.
    expect(JSON.stringify(await observationSource().observe({ instrument: 'NQ' })))
      .toBe(JSON.stringify(a))
  })

  it('takes scenario as SOURCE CONFIGURATION, never as a query field', async () => {
    const query: MarketViewQuery = NQ_5M
    // The query type has exactly one field, and `scenario` is not it.
    const observationQuery = { instrument: 'NQ' as MarketInstrument }
    expect(Object.keys(observationQuery)).toEqual(['instrument'])
    expect(Object.keys(observationQuery)).not.toContain('scenario')
    // Timeframe is meaningless to a position and is absent for that reason.
    expect(Object.keys(observationQuery)).not.toContain('timeframe')
    expect(Object.keys(query)).toEqual(['instrument', 'timeframe'])

    // Two sources differing only in configured scenario answer differently.
    const withPosition = await observed(observationSource('neutral-no-setup'))
    const flat = await observed(observationSource('a-plus-confirmed'))
    expect(withPosition.observations).toHaveLength(1)
    expect(flat.observations).toHaveLength(0)
  })

  it('answers for the instrument it was asked about', async () => {
    for (const instrument of ['NQ', 'MNQ', 'ES'] as const) {
      const batch = await observed(observationSource(), instrument)
      expect(batch.observations[0].instrument, instrument).toBe(instrument)
      expect(batch.observations[0].position.instrument, instrument).toBe(instrument)
    }
  })

  it('stamps every position with the provenance the batch declares', async () => {
    const batch = await observed(observationSource('unknown-stale'))
    expect(batch.origin).toBe('FIXTURE')
    for (const observation of batch.observations) {
      expect(observation.position.source).toEqual({
        providerLabel: 'Fixtur',
        accountLabel: null,
        origin: 'FIXTURE',
      })
    }
  })

  it('carries an opaque account label as display metadata only', async () => {
    const source = observationSource('neutral-no-setup', { accountLabel: 'Konto ••••4417' })
    const batch = await observed(source)
    expect(batch.accountLabel).toBe('Konto ••••4417')
    expect(batch.observations[0].position.source.accountLabel).toBe('Konto ••••4417')
    // A label, not a handle: nothing on the position can address an account.
    for (const key of Object.keys(batch.observations[0].position)) {
      expect(key).not.toMatch(/accountId|account_id|sessionId|token/i)
    }
  })
})

// ─── EMPTY IS NOT UNAVAILABLE ─────────────────────────────────────────────────

describe('an empty observation is an answer; an unavailable one is not', () => {
  it('reports the four flat scenarios as positively observed and empty', async () => {
    for (const scenario of FLAT_SCENARIOS) {
      const batch = await observationSource(scenario).observe({ instrument: 'NQ' })
      expect(batch.status, scenario).toBe('OBSERVED')
      expect(isKnownFlat(batch), scenario).toBe(true)
      expect(observationsOf(batch), scenario).toEqual([])
    }
  })

  it('reports an unconfigurable provider as UNAVAILABLE, never as empty', async () => {
    const source = observationSource('neutral-no-setup', {
      unavailableDetail: 'Providerns tillstånd kunde inte fastställas.',
    })
    const batch = await source.observe({ instrument: 'NQ' })
    expect(batch.status).toBe('UNAVAILABLE')
    expect(isKnownFlat(batch)).toBe(false)
    // Null, not [] — a caller that ignores the difference gets nothing usable.
    expect(observationsOf(batch)).toBeNull()
  })

  it('keeps the two states structurally distinguishable', async () => {
    const flat = await observationSource('a-plus-confirmed').observe({ instrument: 'NQ' })
    const unknown = await observationSource('a-plus-confirmed', { unavailableDetail: 'x' })
      .observe({ instrument: 'NQ' })
    expect(flat.status).not.toBe(unknown.status)
    expect(isKnownFlat(flat)).toBe(true)
    expect(isKnownFlat(unknown)).toBe(false)
    expect(JSON.stringify(flat)).not.toBe(JSON.stringify(unknown))
  })

  it('never returns null, so there is no value to coalesce into an empty list', async () => {
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      const batch = await observationSource(scenario).observe({ instrument: 'NQ' })
      expect(batch, scenario).not.toBeNull()
      expect(['OBSERVED', 'UNAVAILABLE']).toContain(batch.status)
    }
  })

  it('fails the whole replay load closed when the provider is unavailable', async () => {
    const source = createFixtureReplayTimelineSource({
      scenario: 'neutral-no-setup',
      observations: observationSource('neutral-no-setup', { unavailableDetail: 'nej' }),
    })
    // Null propagates to UNAVAILABLE in the view. Not a timeline with zero
    // positions, which would be a flat account the operator never verified.
    expect(await source.load(NQ_5M)).toBeNull()
  })

  it('does NOT fail closed when the provider positively reports nothing', async () => {
    const timeline = await createFixtureReplayTimelineSource({
      scenario: 'a-plus-confirmed',
    }).load(NQ_5M)
    expect(timeline).not.toBeNull()
    expect(projectReplay(timeline!, timeline!.events.length - 1).observedPositions).toEqual([])
  })

  it('gives unavailable and known-flat providers visibly different outcomes', async () => {
    const flat = await createFixtureReplayTimelineSource({ scenario: 'a-plus-confirmed' }).load(NQ_5M)
    const unknown = await createFixtureReplayTimelineSource({
      scenario: 'a-plus-confirmed',
      observations: observationSource('a-plus-confirmed', { unavailableDetail: 'nej' }),
    }).load(NQ_5M)
    expect(flat).not.toBeNull()
    expect(unknown).toBeNull()
  })

  it('refuses to trust a source that does not observe the requested instrument', async () => {
    const narrow: PositionObservationSource = {
      ...observationSource(),
      instruments: () => ['ES'],
    }
    // Its empty answer for NQ would read as "nothing open", which it has no
    // standing to say. Fail closed instead.
    expect(await createFixtureReplayTimelineSource({
      scenario: 'neutral-no-setup',
      observations: narrow,
    }).load(NQ_5M)).toBeNull()
  })
})

// ─── Fail-closed identity validation ──────────────────────────────────────────

describe('a source that lies about what it returned is refused', () => {
  const source = observationSource()
  const query = { instrument: 'NQ' as MarketInstrument }
  const base = () => observed(source)

  function tamper(
    batch: ObservedPositionBatch,
    change: Partial<ObservedPositionBatch>,
  ): PositionObservationBatch {
    return { ...batch, ...change }
  }

  /** Assert the validator refuses this mutation of an otherwise honest batch. */
  async function refuses(change: Partial<ObservedPositionBatch>, message: RegExp) {
    const batch = tamper(await base(), change)
    expect(() => validatePositionObservationBatch(source, query, batch)).toThrow(message)
  }

  it('accepts an honest batch', async () => {
    const batch = await base()
    expect(() => validatePositionObservationBatch(source, query, batch)).not.toThrow()
  })

  it('refuses a batch stamped with another source id', async () => {
    await refuses({ sourceId: 'other' }, /stamped with source id other/)
  })

  it('refuses an origin the source did not declare', async () => {
    await refuses({ origin: 'LIVE' }, /declares origin FIXTURE but returned a batch with origin LIVE/)
  })

  it('refuses a provider or account label the source did not declare', async () => {
    await refuses({ providerLabel: 'Annan mäklare' }, /declares provider Fixtur/)
    await refuses({ accountLabel: 'X' }, /declares account null/)
  })

  it('refuses an observation for a different instrument than was asked for', async () => {
    const batch = await base()
    await refuses(
      { observations: batch.observations.map((o) => ({ ...o, instrument: 'ES' as MarketInstrument })) },
      /asked for NQ but returned an observation for ES/,
    )
  })

  it('refuses a position whose instrument disagrees with its observation', async () => {
    const batch = await base()
    await refuses(
      {
        observations: batch.observations.map((o) => ({
          ...o,
          position: { ...o.position, instrument: 'MNQ' as MarketInstrument },
        })),
      },
      /carrying a position for MNQ/,
    )
  })

  it('refuses a fixture batch carrying a LIVE-labelled position', async () => {
    const batch = await base()
    await refuses(
      {
        observations: batch.observations.map((o) => ({
          ...o,
          position: { ...o.position, source: { ...o.position.source, origin: 'LIVE' as const } },
        })),
      },
      /carrying a position observed as LIVE/,
    )
  })

  it('refuses a position attributed to another provider than the batch', async () => {
    const batch = await base()
    await refuses(
      {
        observations: batch.observations.map((o) => ({
          ...o,
          position: { ...o.position, source: { ...o.position.source, providerLabel: 'Annan' } },
        })),
      },
      /attributed to Annan, not to Fixtur/,
    )
  })

  it('refuses duplicate observation ids', async () => {
    const batch = await base()
    await refuses(
      { observations: [batch.observations[0], batch.observations[0]] },
      /duplicate observation id/,
    )
  })

  it('does not treat unavailability as a validation failure', async () => {
    const batch = await observationSource('neutral-no-setup', { unavailableDetail: 'nej' })
      .observe(query)
    expect(() => validatePositionObservationBatch(observationSource(), query, batch)).not.toThrow()
  })

  it('refuses a lying source through the replay bridge, not only in isolation', async () => {
    const liar: PositionObservationSource = {
      ...observationSource(),
      observe: async () => ({ ...(await observed(observationSource())), origin: 'LIVE' as const }),
    }
    await expect(createFixtureReplayTimelineSource({
      scenario: 'neutral-no-setup',
      observations: liar,
    }).load(NQ_5M)).rejects.toThrow(/origin FIXTURE but returned a batch with origin LIVE/)
  })

  it('refuses a replay source whose observation seam has a different origin', async () => {
    const live: PositionObservationSource = { ...observationSource(), origin: 'LIVE' }
    await expect(createFixtureReplayTimelineSource({
      scenario: 'neutral-no-setup',
      observations: live,
    }).load(NQ_5M)).rejects.toThrow(/reads observations from a LIVE source/)
  })
})

// ─── Extraction ───────────────────────────────────────────────────────────────

describe('provider observations no longer originate in application authoring', () => {
  it('leaves no position authoring in the scenario file', () => {
    const timelines = code('./timelines.ts')
    // The scenario authoring no longer builds positions or reads the
    // `ObservedValue` constructors that describe one.
    expect(timelines).not.toMatch(/function observedPosition/)
    expect(timelines).not.toMatch(/positionId:\s*`pos:/)
    expect(timelines).not.toMatch(/providerLabel/)
    expect(timelines).not.toMatch(/unattributed/)
    expect(timelines).not.toMatch(/from '\.\/observed-position'/)
  })

  it('puts that authoring in the provider fixture instead', () => {
    const provider = code('./fixture-provider.ts')
    expect(provider).toMatch(/function observedPosition/)
    expect(provider).toMatch(/positionId: `pos:/)
    expect(provider).toMatch(/from '\.\/observed-position'/)
  })

  it('leaves the application assertions exactly where they were', () => {
    const timelines = code('./timelines.ts')
    // Thesis, lifecycle, plans, risk and prop stay application-authored.
    for (const marker of [
      'THESIS_UPDATED', 'SETUP_LIFECYCLE_CHANGED', 'PLANNED_TRADE_CREATED',
      'RISK_STATE_REPORTED', 'PROP_STATE_REPORTED', 'CONFIRMATION_CHANGED',
    ]) {
      expect(timelines, marker).toContain(marker)
    }
    // And none of them appear in the provider fixture.
    const provider = code('./fixture-provider.ts')
    for (const marker of [
      'THESIS_UPDATED', 'SETUP_LIFECYCLE_CHANGED', 'PLANNED_TRADE_CREATED',
      'RISK_STATE_REPORTED', 'PROP_STATE_REPORTED', 'PlannedTradeView',
    ]) {
      expect(provider, marker).not.toContain(marker)
    }
  })

  it('still produces the same observed positions after assembly', async () => {
    for (const scenario of POSITION_SCENARIOS) {
      const timeline = (await createFixtureReplayTimelineSource({ scenario }).load(NQ_5M))!
      const projection = projectReplay(timeline, timeline.events.length - 1)
      expect(projection.observedPositions, scenario).toHaveLength(1)
      expect(projection.observedPositions[0].unattributed, scenario).toBe(true)
      expect(projection.observedPositions[0].positionId, scenario).toBe('pos:NQ:1')
    }
  })

  it('keeps the position events in the timeline, produced by the observation stream', () => {
    const opened = buildReplayTimeline('neutral-no-setup', 'NQ', '5m').events
      .filter((e) => e.type === 'OBSERVED_POSITION_OPENED')
    const updated = buildReplayTimeline('unknown-stale', 'NQ', '5m').events
      .filter((e) => e.type === 'OBSERVED_POSITION_UPDATED')
    expect(opened).toHaveLength(1)
    expect(updated).toHaveLength(1)
    for (const event of [...opened, ...updated]) {
      expect(event.sourceComponent).toBe('trading.replay.position-observation.fixture')
      expect(event.correlationId).toBe('position:pos:NQ:1')
    }
  })

  it('leaves every application event attributed to the application stream', () => {
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      for (const event of buildReplayTimeline(scenario, 'NQ', '5m').events) {
        const isObservation = event.type.startsWith('OBSERVED_POSITION_')
        expect(event.sourceComponent, `${scenario}/${event.eventId}`)
          .toBe(isObservation ? 'trading.replay.position-observation.fixture' : 'trading.replay.fixture')
      }
    }
  })
})

// ─── Global identity after the merge ──────────────────────────────────────────

describe('global replay identity is minted after the merge', () => {
  it('keeps the sequence contiguous from zero across both streams', () => {
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      const events = buildReplayTimeline(scenario, 'NQ', '5m').events
      expect(events.map((e) => e.sequence), scenario).toEqual(events.map((_, i) => i))
    }
  })

  it('derives every event id from scenario and sequence', () => {
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      const events = buildReplayTimeline(scenario, 'NQ', '5m').events
      events.forEach((event, index) => {
        expect(event.eventId).toBe(`${scenario}:${String(index).padStart(4, '0')}`)
      })
      expect(new Set(events.map((e) => e.eventId)).size).toBe(events.length)
    }
  })

  it('threads causation within a correlation, never across two streams', () => {
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      const events = buildReplayTimeline(scenario, 'NQ', '5m').events
      const byId = new Map(events.map((e) => [e.eventId, e]))
      const lastSeen = new Map<string, string>()
      for (const event of events) {
        const expected = lastSeen.get(event.correlationId) ?? null
        expect(event.causationId, `${scenario}/${event.eventId}`).toBe(expected)
        if (event.causationId !== null) {
          // A predecessor that exists, and belongs to the same lifecycle.
          const cause = byId.get(event.causationId)
          expect(cause, event.eventId).toBeDefined()
          expect(cause!.correlationId).toBe(event.correlationId)
          expect(cause!.sequence).toBeLessThan(event.sequence)
        }
        lastSeen.set(event.correlationId, event.eventId)
      }
    }
  })

  it('starts each correlation with a null causation, and only there', () => {
    const events = buildReplayTimeline('neutral-no-setup', 'NQ', '5m').events
    const roots = events.filter((e) => e.causationId === null)
    expect(roots.map((e) => e.correlationId).sort())
      .toEqual(['position:pos:NQ:1', 'setup:neutral-no-setup'])
  })

  it('never lets a provider observation claim an application cause', () => {
    for (const scenario of POSITION_SCENARIOS) {
      const events = buildReplayTimeline(scenario, 'NQ', '5m').events
      const byId = new Map(events.map((e) => [e.eventId, e]))
      for (const event of events) {
        if (event.causationId === null) continue
        expect(byId.get(event.causationId)!.sourceComponent, event.eventId)
          .toBe(event.sourceComponent)
      }
    }
  })

  it('does not chain causation to the merged predecessor when the streams interleave', () => {
    const events = buildReplayTimeline('neutral-no-setup', 'NQ', '5m').events
    const observationIndex = events.findIndex((e) => e.type === 'OBSERVED_POSITION_OPENED')
    expect(observationIndex).toBeGreaterThan(0)
    // Its array predecessor exists and is an application event — and is
    // deliberately NOT named as its cause.
    expect(events[observationIndex - 1].sourceComponent).toBe('trading.replay.fixture')
    expect(events[observationIndex].causationId).toBeNull()
    // And the next application event skips back over it to its own predecessor.
    const next = events[observationIndex + 1]
    expect(next.causationId).toBe(events[observationIndex - 1].eventId)
    expect(next.causationId).not.toBe(events[observationIndex].eventId)
  })

  /*
   * ───────────────────────────────────────────────────────────────────────────
   * THE INTERLEAVING PROOF
   * ───────────────────────────────────────────────────────────────────────────
   * Two independent streams, alternating in market time:
   *
   *     A1  P1  A2  P2  A3
   *
   * must produce
   *
   *     A1 <- null     P1 <- null
   *     A2 <- A1       P2 <- P1       A3 <- A2
   *
   * and NEVER the global chain A1 <- null, P1 <- A1, A2 <- P1, P2 <- A2,
   * A3 <- P2. The difference is the whole point: the merged predecessor of a
   * provider observation is chosen by a comparator whose last resort is a
   * tie-break with no causal meaning, so it must never be named as a cause.
   */
  it('threads two interleaved streams as two chains, never as one', () => {
    const base = buildFixtureSnapshot('neutral-no-setup', 'NQ', '5m')
    const authored = fixturePositionObservations('neutral-no-setup', base, observationSource())[0]
    const at = (index: number) => base.candles[index].openTime

    // The same position, observed twice, placed between application events.
    const observations: PositionObservation[] = [
      { ...authored, observationId: 'obs:test:0', localSequence: 0, kind: 'OPENED', occurredAt: at(60), recordedAt: at(60) },
      { ...authored, observationId: 'obs:test:1', localSequence: 1, kind: 'UPDATED', occurredAt: at(68), recordedAt: at(68) },
    ]
    const events = assembleReplayTimeline('neutral-no-setup', base, observations).events

    const shape = events
      .map((e) => (e.sourceComponent === 'trading.replay.fixture' ? 'A' : 'P'))
      .join('')
    // Genuinely interleaved — the proof is worthless if they merely concatenate.
    expect(shape.slice(0, 6)).toBe('AAPAPA')

    const application = events.filter((e) => e.sourceComponent === 'trading.replay.fixture')
    const provider = events.filter((e) => e.sourceComponent !== 'trading.replay.fixture')
    expect(provider).toHaveLength(2)
    expect(application.length).toBeGreaterThanOrEqual(3)

    // A1 <- null, P1 <- null
    expect(application[0].causationId).toBeNull()
    expect(provider[0].causationId).toBeNull()
    // A2 <- A1, P2 <- P1, A3 <- A2
    expect(application[1].causationId).toBe(application[0].eventId)
    expect(provider[1].causationId).toBe(provider[0].eventId)
    expect(application[2].causationId).toBe(application[1].eventId)

    // The refutation: a global chain would have said otherwise at these points.
    const p1Index = events.findIndex((e) => e.eventId === provider[0].eventId)
    const p2Index = events.findIndex((e) => e.eventId === provider[1].eventId)
    expect(events[p1Index].causationId).not.toBe(events[p1Index - 1].eventId)
    expect(events[p2Index].causationId).not.toBe(events[p2Index - 1].eventId)
    expect(events[p1Index + 1].causationId).not.toBe(events[p1Index].eventId)
    expect(events[p2Index + 1].causationId).not.toBe(events[p2Index].eventId)

    // Both chains are complete and neither crosses into the other.
    const byId = new Map(events.map((e) => [e.eventId, e]))
    for (const event of events) {
      if (event.causationId === null) continue
      expect(byId.get(event.causationId)!.correlationId).toBe(event.correlationId)
      expect(byId.get(event.causationId)!.sourceComponent).toBe(event.sourceComponent)
    }
    // Exactly two roots: one per correlation.
    expect(events.filter((e) => e.causationId === null).map((e) => e.correlationId).sort())
      .toEqual(['position:pos:NQ:1', 'setup:neutral-no-setup'])

    // And global identity is still contiguous and deterministic across both.
    expect(events.map((e) => e.sequence)).toEqual(events.map((_, i) => i))
    events.forEach((event, index) => {
      expect(event.eventId).toBe(`neutral-no-setup:${String(index).padStart(4, '0')}`)
    })
  })

  it('builds byte-identical timelines on repeat', () => {
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      const a = buildReplayTimeline(scenario, 'NQ', '5m')
      const b = buildReplayTimeline(scenario, 'NQ', '5m')
      expect(serializeTimeline(a.events), scenario).toBe(serializeTimeline(b.events))
    }
  })
})

// ─── occurredAt vs recordedAt ─────────────────────────────────────────────────

describe('occurredAt and recordedAt stay distinct', () => {
  it('supports a provider that reports late', async () => {
    const source = observationSource('neutral-no-setup', { recordingDelayMs: 90_000 })
    const batch = await observed(source)
    const observation = batch.observations[0]
    expect(observation.recordedAt).not.toBe(observation.occurredAt)
    expect(Date.parse(observation.recordedAt) - Date.parse(observation.occurredAt)).toBe(90_000)
  })

  it('carries the delay onto the assembled event, without moving market time', async () => {
    const base = buildFixtureSnapshot('neutral-no-setup', 'NQ', '5m')
    const prompt = fixturePositionObservations('neutral-no-setup', base, observationSource())
    const late = fixturePositionObservations('neutral-no-setup', base, observationSource(), {
      recordingDelayMs: 90_000,
    })
    const promptEvent = assembleReplayTimeline('neutral-no-setup', base, prompt)
      .events.find((e) => e.type === 'OBSERVED_POSITION_OPENED')!
    const lateEvent = assembleReplayTimeline('neutral-no-setup', base, late)
      .events.find((e) => e.type === 'OBSERVED_POSITION_OPENED')!
    // Market time is what happened; it does not move because we heard late.
    expect(lateEvent.occurredAt).toBe(promptEvent.occurredAt)
    expect(lateEvent.recordedAt).not.toBe(promptEvent.recordedAt)
    expect(Date.parse(lateEvent.recordedAt)).toBeGreaterThan(Date.parse(lateEvent.occurredAt))
  })

  it('orders two same-instant observations by when each was learned', () => {
    const base = buildFixtureSnapshot('neutral-no-setup', 'NQ', '5m')
    const at = base.candles[86].openTime
    const observation = (
      localSequence: number,
      recordedAt: string,
      positionId: string,
    ): PositionObservation => ({
      observationId: `obs:test:${localSequence}`,
      localSequence,
      instrument: 'NQ',
      kind: 'OPENED',
      occurredAt: at,
      recordedAt: recordedAt as unknown as Timestamp,
      position: { ...structuredClone(fixturePositionObservations('neutral-no-setup', base, observationSource())[0].position), positionId },
      summary: `obs ${localSequence}`,
    })
    const later = new Date(Date.parse(at) + 60_000).toISOString()
    // Authored late-first; the comparator must still put the earlier-learned
    // one first, and array position must not decide it.
    const events = assembleReplayTimeline('neutral-no-setup', base, [
      observation(0, later, 'pos:late'),
      observation(1, at, 'pos:early'),
    ]).events.filter((e) => e.type === 'OBSERVED_POSITION_OPENED')
    expect(events.map((e) => e.summary)).toEqual(['obs 1', 'obs 0'])
  })
})

// ─── Async completion order ───────────────────────────────────────────────────

describe('the timeline does not depend on which seam answered first', () => {
  /** A replay source whose two inputs resolve exactly when told to. */
  function controlled(scenario: MarketViewScenarioId) {
    const market = deferred<TradingMarketViewSnapshot | null>()
    const observations = deferred<PositionObservationBatch>()
    const inner = createMockMarketViewDataSource(scenario)
    const marketData: MarketViewDataSource = { ...inner, load: () => market.promise }
    const observationSeam: PositionObservationSource = {
      ...observationSource(scenario),
      observe: () => observations.promise,
    }
    const source = createFixtureReplayTimelineSource({
      scenario,
      marketData,
      observations: observationSeam,
    })
    return { market, observations, source }
  }

  async function truth(scenario: MarketViewScenarioId) {
    return {
      base: buildFixtureSnapshot(scenario, 'NQ', '5m'),
      batch: await observationSource(scenario).observe({ instrument: 'NQ' }),
    }
  }

  it('gives the same bytes whether market or provider resolves first', async () => {
    for (const scenario of POSITION_SCENARIOS) {
      const { base, batch } = await truth(scenario)

      // Run A — market first, provider second.
      const a = controlled(scenario)
      const loadA = a.source.load(NQ_5M)
      a.market.resolve(base)
      a.observations.resolve(batch)

      // Run B — provider first, market second. Same logical inputs.
      const b = controlled(scenario)
      const loadB = b.source.load(NQ_5M)
      b.observations.resolve(batch)
      b.market.resolve(base)

      const [first, second] = await Promise.all([loadA, loadB])
      expect(first, scenario).not.toBeNull()
      expect(JSON.stringify(second), scenario).toBe(JSON.stringify(first))
      expect(serializeTimeline(second!.events), scenario)
        .toBe(serializeTimeline(buildReplayTimeline(scenario, 'NQ', '5m').events))
    }
  })

  it('proves the race with no timers of any kind', () => {
    const text = code('./provider-observation.test.ts')
    // Assembled from fragments so this assertion is not itself a match. A
    // literal pattern here would fail on its own source, which would tempt
    // someone to weaken the check rather than the code.
    for (const banned of ['set' + 'Timeout', 'set' + 'Interval', 'useFake' + 'Timers', 'sle' + 'ep(']) {
      expect(text, banned).not.toContain(banned)
    }
    expect(text).toContain('function deferred')
  })

  it('reports a market failure deterministically even when both seams fail', async () => {
    const boom = (what: string) => async () => { throw new Error(what) }
    const inner = createMockMarketViewDataSource('neutral-no-setup')
    const source = createFixtureReplayTimelineSource({
      scenario: 'neutral-no-setup',
      marketData: { ...inner, load: boom('market') as never },
      observations: { ...observationSource(), observe: boom('provider') as never },
    })
    // Fixed inspection order, so the message is not a function of which
    // rejection happened to land first.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(source.load(NQ_5M)).rejects.toThrow('market')
    }
  })
})

// ─── The end projection, across all six scenarios ─────────────────────────────

describe('the final projection is preserved for every scenario', () => {
  it('reaches the same end state through the source as through the fixtures', async () => {
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      const viaSource = (await createFixtureReplayTimelineSource({ scenario }).load(NQ_5M))!
      const direct = buildReplayTimeline(scenario, 'NQ', '5m')
      expect(serializeTimeline(viaSource.events), scenario).toBe(serializeTimeline(direct.events))

      const a = projectReplay(viaSource, viaSource.events.length - 1)
      const b = projectReplay(direct, direct.events.length - 1)
      expect(JSON.stringify(a), scenario).toBe(JSON.stringify(b))
    }
  })

  it('preserves market, lifecycle, plan, risk, prop and position state', async () => {
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      const timeline = (await createFixtureReplayTimelineSource({ scenario }).load(NQ_5M))!
      const p = projectReplay(timeline, timeline.events.length - 1)
      expect(p.snapshot.candles, scenario).toEqual(timeline.base.candles)
      expect(p.snapshot.riskState.status, scenario).toBe(timeline.base.riskState.status)
      expect(p.snapshot.propState.status, scenario).toBe(timeline.base.propState.status)
      expect(p.state.lifecycle, scenario).toBeTruthy()
      expect(p.snapshot.setup.stage, scenario).toBeTruthy()
    }
  })

  it('does not make a known position disappear', async () => {
    for (const scenario of POSITION_SCENARIOS) {
      const timeline = (await createFixtureReplayTimelineSource({ scenario }).load(NQ_5M))!
      expect(projectReplay(timeline, timeline.events.length - 1).observedPositions, scenario)
        .toHaveLength(1)
    }
    // And the stale scenario still degrades every reading rather than guessing.
    const stale = (await createFixtureReplayTimelineSource({ scenario: 'unknown-stale' }).load(NQ_5M))!
    const position = projectReplay(stale, stale.events.length - 1).observedPositions[0]
    expect(position.state).toBe('UNKNOWN')
    expect(position.freshness).toBe('UNKNOWN')
    expect(position.quantity).toEqual({ state: 'UNKNOWN' })
  })

  it('keeps plans and positions in separate collections', async () => {
    const timeline = (await createFixtureReplayTimelineSource({ scenario: 'neutral-no-setup' }).load(NQ_5M))!
    const p = projectReplay(timeline, timeline.events.length - 1)
    expect(p.plannedTrades).toHaveLength(0)
    expect(p.observedPositions).toHaveLength(1)
    const confirmed = (await createFixtureReplayTimelineSource({ scenario: 'a-plus-confirmed' }).load(NQ_5M))!
    const q = projectReplay(confirmed, confirmed.events.length - 1)
    expect(q.plannedTrades).toHaveLength(1)
    expect(q.observedPositions).toHaveLength(0)
  })
})

// ─── Authority ────────────────────────────────────────────────────────────────

describe('observation is truth about exposure, never permission', () => {
  it('grants no authority, at either level', async () => {
    const batch = await observed(observationSource('neutral-no-setup'))
    const observation = batch.observations[0]
    expect(positionObservationGrantsAuthority(observation)).toBe(false)
    expect(observedPositionGrantsAuthority(observation.position)).toBe(false)
  })

  it('exposes no authority-shaped field and no callable member', async () => {
    const batch = await observed(observationSource('neutral-no-setup'))
    const observation = batch.observations[0]
    for (const [key, value] of Object.entries(observation)) {
      expect(typeof value, `observation.${key} is callable`).not.toBe('function')
    }
    for (const forbidden of [
      'clearance', 'grant', 'intent', 'approval', 'authority', 'executable',
      'orderId', 'submit', 'execute',
    ]) {
      expect(Object.keys(observation).map((k) => k.toLowerCase()), forbidden)
        .not.toContain(forbidden)
      expect(Object.keys(observation.position).map((k) => k.toLowerCase()), forbidden)
        .not.toContain(forbidden)
    }
  })

  it('cannot become a planned trade', async () => {
    const timeline = (await createFixtureReplayTimelineSource({ scenario: 'neutral-no-setup' }).load(NQ_5M))!
    const p = projectReplay(timeline, timeline.events.length - 1)
    // A position exists and no plan does. Nothing converted one into the other.
    expect(p.observedPositions).toHaveLength(1)
    expect(p.plannedTrades).toHaveLength(0)
    expect(code('./position-observation.ts')).not.toMatch(/PlannedTradeView/)
    expect(code('./fixture-provider.ts')).not.toMatch(/PlannedTradeView/)
  })
})

// ─── Boundaries ───────────────────────────────────────────────────────────────

describe('Stage 1.7 boundaries', () => {
  const NEW_FILES = ['./position-observation.ts', './streams.ts', './fixture-provider.ts']

  it('leaves MarketViewDataSource market-only', () => {
    const text = code('../market-view/data-source.ts')
    for (const pattern of [
      /position/i, /account/i, /\border\b/i, /\bfill/i, /margin/i, /health/i, /credential/i,
    ]) {
      expect(text, `data-source.ts matches ${pattern}`).not.toMatch(pattern)
    }
    // Its surface is still exactly the Stage 1 six members, and no more.
    const body = text.slice(text.indexOf('interface MarketViewDataSource'))
    const surface = body.slice(0, body.indexOf('\n}'))
    expect(surface.match(/^\s+(readonly \w+|\w+\()/gm)?.map((s) => s.trim()).sort())
      .toEqual(['instruments(', 'load(', 'readonly id', 'readonly label', 'readonly origin', 'timeframes('])
  })

  it('does not put provider positions on the market snapshot contract', () => {
    const snapshot = code('../market-view/snapshot.ts')
    expect(snapshot).not.toMatch(/ObservedPosition/)
    expect(snapshot).not.toMatch(/PositionObservation/)
  })

  it('names no execution provider adapter anywhere in the package', () => {
    for (const file of [...NEW_FILES, './source.ts', './timelines.ts', './index.ts']) {
      const text = code(file)
      expect(text, file).not.toMatch(/ExecutionProviderAdapter/)
      expect(text, file).not.toMatch(/ProviderSession|ProviderConfig|getWorkingOrders|getRecentFills/)
      expect(text, file).not.toMatch(/\bconnect\s*\(|disconnect\s*\(/)
    }
  })

  it('reaches no provider, network, order path or detector', () => {
    for (const file of NEW_FILES) {
      const text = code(file)
      for (const pattern of [
        /rithmic/i, /tradovate/i, /protobuf/i, /apiKey/, /\bcredential/i,
        /\bfetch\s*\(/, /XMLHttpRequest/, /new\s+WebSocket/, /sendBeacon/, /\baxios\b/,
        /submitOrder/, /modifyOrder/, /cancelOrder/, /preflightOrder/, /placeOrder/,
        /detectIFVG/, /detectCISD/, /detectSMT/, /detectSweep/,
        /\/internal/, /issueRiskClearance/, /createExecutionIntent/,
        /node:crypto/, /randomUUID/, /Math\.random/, /Date\.now\(\)/,
      ]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('mints every id deterministically, with no crypto', () => {
    const observation = fixturePositionObservations(
      'neutral-no-setup',
      buildFixtureSnapshot('neutral-no-setup', 'NQ', '5m'),
      observationSource(),
    )[0]
    expect(observation.observationId).toBe('obs:neutral-no-setup:0001')
    expect(observation.position.positionId).toBe('pos:NQ:1')
  })
})
