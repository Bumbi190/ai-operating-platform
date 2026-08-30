/**
 * End to end: a recorded provider transcript reaching the replay projection.
 *
 * THE WHOLE POINT OF STAGE 1.8b-B, PROVEN RATHER THAN DESCRIBED
 * ─────────────────────────────────────────────────────────────
 *     RecordedExecutionProviderAdapter   (the Level-1 port)
 *       → provider-normalization         (the sibling bridge)
 *       → PositionObservationSource      (the Stage 1.6 seam)
 *       → assembleReplayTimeline         (the Stage 1.7 assembler)
 *       → projectReplay                  (the replay projection)
 *
 * No second assembler is built here. The existing Stage 1.7 seams are used
 * exactly as the fixture path uses them — which is the only way this proves
 * anything about the real architecture rather than about a parallel one.
 */

import { describe, expect, it } from 'vitest'
import { buildFixtureSnapshot, type TradingMarketViewSnapshot } from '../market-view'
import { ok, present } from '../provider'
import {
  assembleReplayTimeline,
  createFixturePositionObservationSource,
  observationsOf,
  projectReplay,
  type PositionObservation,
} from '../replay'
import { createRecordedExecutionProviderAdapter } from './recorded-adapter'
import { createRecordedProviderPositionObservationSource } from './position-source'
import { recordedDecimal, type RecordedTranscript } from './transcript'
import {
  ACCOUNT_BOUND,
  INSTRUMENT_MAPPINGS,
  recordedMetadata,
  recordedPosition,
  transcriptWithPositions,
} from './recorded-fixture'

const SCENARIO = 'neutral-no-setup' as const
const BASE: TradingMarketViewSnapshot = buildFixtureSnapshot(SCENARIO, 'NQ', '5m')

/**
 * An instant the replay actually reaches.
 *
 * Taken from the authored series rather than written as a literal, so the
 * observation lands inside the timeline instead of sorting off one end of it.
 */
const CANDLE_INSTANT = BASE.candles[86].openTime
const LEARNED_AT = BASE.candles[88].openTime

function recordedObservations(): Promise<readonly PositionObservation[]> {
  const positions: RecordedTranscript['positions'] = [
    {
      accountId: ACCOUNT_BOUND,
      response: ok([
        recordedPosition({
          positionId: 'p1',
          observedAt: CANDLE_INSTANT,
          openedAt: present(CANDLE_INSTANT),
          quantity: present(recordedDecimal('1')),
        }),
      ]),
    },
  ]

  const source = createRecordedProviderPositionObservationSource({
    adapter: createRecordedExecutionProviderAdapter(transcriptWithPositions(positions)),
    accountId: ACCOUNT_BOUND,
    accountLabel: null,
    instrumentMappings: INSTRUMENT_MAPPINGS,
    replayMetadata: [recordedMetadata({
      positionId: 'p1',
      kind: 'OPENED',
      recordedAt: LEARNED_AT,
      freshness: 'FRESH',
    })],
    observedAt: CANDLE_INSTANT,
  })

  return source.observe({ instrument: 'NQ' }).then((batch) => {
    const observations = observationsOf(batch)
    if (observations === null) throw new Error('recorded source reported UNAVAILABLE')
    return observations
  })
}

describe('a recorded transcript reaches the replay timeline', () => {
  it('assembles through the existing Stage 1.7 assembler', async () => {
    const timeline = assembleReplayTimeline(SCENARIO, BASE, await recordedObservations())
    expect(timeline.events.length).toBeGreaterThan(0)
    expect(timeline.instrument).toBe('NQ')
  })

  it('produces a provider observation event carrying the normalized position', async () => {
    const timeline = assembleReplayTimeline(SCENARIO, BASE, await recordedObservations())
    const observed = timeline.events.filter((event) =>
      event.type === 'OBSERVED_POSITION_OPENED')
    expect(observed).toHaveLength(1)

    const payload = observed[0].payload as { position: { quantity: unknown; direction: string } }
    expect(payload.position.direction).toBe('LONG')
    expect(payload.position.quantity).toEqual({ state: 'PRESENT', value: '1' })
  })

  it('mints global identity after the merge, not in the source', async () => {
    const observations = await recordedObservations()
    // Nothing the source produced carries a global sequence, event id or
    // causation — those are the assembler's to decide.
    expect(observations[0]).not.toHaveProperty('eventId')
    expect(observations[0]).not.toHaveProperty('sequence')
    expect(observations[0]).not.toHaveProperty('causationId')

    const timeline = assembleReplayTimeline(SCENARIO, BASE, observations)
    expect(timeline.events[0].eventId).toBeTruthy()
    expect(timeline.events.map((e) => e.sequence)).toEqual(
      timeline.events.map((_, index) => index),
    )
  })

  it('reaches the replay projection as an observed position', async () => {
    const timeline = assembleReplayTimeline(SCENARIO, BASE, await recordedObservations())
    const projection = projectReplay(timeline, timeline.events.length - 1)
    expect(projection.observedPositions).toHaveLength(1)
    expect(projection.observedPositions[0].direction).toBe('LONG')
    expect(projection.observedPositions[0].quantity).toEqual({
      state: 'PRESENT',
      value: '1',
    })
  })

  it('carries FIXTURE provenance all the way to the projection', async () => {
    const timeline = assembleReplayTimeline(SCENARIO, BASE, await recordedObservations())
    const projection = projectReplay(timeline, timeline.events.length - 1)
    expect(projection.observedPositions[0].source.origin).toBe('FIXTURE')
  })
})

describe('the recorded path is deterministic through the whole chain', () => {
  it('produces deeply equal timelines across runs', async () => {
    const first = assembleReplayTimeline(SCENARIO, BASE, await recordedObservations())
    const second = assembleReplayTimeline(SCENARIO, BASE, await recordedObservations())
    expect(second).toEqual(first)
  })

  it('produces deeply equal projections across runs', async () => {
    const one = projectReplay(
      assembleReplayTimeline(SCENARIO, BASE, await recordedObservations()), 12)
    const two = projectReplay(
      assembleReplayTimeline(SCENARIO, BASE, await recordedObservations()), 12)
    expect(two).toEqual(one)
  })
})

describe('the recorded path and the Stage 1.7 fixture path agree on domain truth', () => {
  /**
   * TRUTHFUL DOMAIN STATE, NOT BYTE EQUALITY.
   *
   * The two paths mint different ids and carry different authored metadata by
   * design — one is an authored fixture observation, the other came through a
   * provider port. Demanding byte equality would be demanding that the bridge
   * add nothing, which would defeat its purpose. What must agree is what the
   * operator is being told is TRUE about the position.
   */
  it('reports the same direction, state, quantity and instrument', async () => {
    const fixtureSource = createFixturePositionObservationSource({
      scenario: SCENARIO,
      calibration: () => BASE,
    })
    const fixtureBatch = await fixtureSource.observe({ instrument: 'NQ' })
    const fixtureObservations = observationsOf(fixtureBatch)
    expect(fixtureObservations).toHaveLength(1)
    const fixturePosition = fixtureObservations![0].position

    const recordedPositionView = (await recordedObservations())[0].position

    expect(recordedPositionView.direction).toBe(fixturePosition.direction)
    expect(recordedPositionView.state).toBe(fixturePosition.state)
    expect(recordedPositionView.quantity).toEqual(fixturePosition.quantity)
    expect(recordedPositionView.instrument).toBe(fixturePosition.instrument)
    expect(recordedPositionView.freshness).toBe(fixturePosition.freshness)
  })

  it('leaves the Stage 1.7 fixture source working exactly as before', async () => {
    const source = createFixturePositionObservationSource({
      scenario: SCENARIO,
      calibration: () => BASE,
    })
    expect(source.origin).toBe('FIXTURE')
    expect(source.providerLabel).toBe('Fixtur')
    const batch = await source.observe({ instrument: 'NQ' })
    expect(batch.status).toBe('OBSERVED')
    expect(observationsOf(batch)).toHaveLength(1)
  })

  it('lets both sources feed the same assembler independently', async () => {
    const fixtureSource = createFixturePositionObservationSource({
      scenario: SCENARIO,
      calibration: () => BASE,
    })
    const fixtureBatch = await fixtureSource.observe({ instrument: 'NQ' })
    const viaFixture = assembleReplayTimeline(
      SCENARIO, BASE, observationsOf(fixtureBatch) ?? [])
    const viaRecorded = assembleReplayTimeline(
      SCENARIO, BASE, await recordedObservations())

    // Two independent paths, each producing a complete timeline.
    expect(viaFixture.events.length).toBeGreaterThan(0)
    expect(viaRecorded.events.length).toBeGreaterThan(0)
    expect(viaFixture.instrument).toBe(viaRecorded.instrument)
  })
})

describe('unavailability never reaches the assembler as an empty list', () => {
  it('refuses to assemble from a batch that could not be observed', async () => {
    const source = createRecordedProviderPositionObservationSource({
      adapter: createRecordedExecutionProviderAdapter(transcriptWithPositions([])),
      accountId: ACCOUNT_BOUND,
      accountLabel: null,
      instrumentMappings: INSTRUMENT_MAPPINGS,
      replayMetadata: [],
      observedAt: CANDLE_INSTANT,
    })
    const batch = await source.observe({ instrument: 'NQ' })
    expect(batch.status).toBe('UNAVAILABLE')

    /*
     * `observationsOf` returns null rather than [], so a caller cannot hand
     * unavailability to `assembleReplayTimeline` without noticing: the
     * assembler's parameter is required and non-nullable, and an empty array
     * there would be the positive claim that the account is flat.
     */
    expect(observationsOf(batch)).toBeNull()
  })
})
