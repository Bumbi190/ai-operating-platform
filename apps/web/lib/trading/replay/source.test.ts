/**
 * The Stage 1.6 bridge: the replay source seam, and the boundary it must not
 * dissolve.
 *
 * The claims that matter most here are structural rather than behavioural — the
 * Stage 1 market-data seam is genuinely on the path, `MarketViewDataSource` is
 * still market-only, and no second fixture generator appeared alongside the
 * first. Those are the things a later refactor is most likely to break quietly.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  MARKET_INSTRUMENTS,
  MARKET_TIMEFRAMES,
  MARKET_VIEW_SCENARIO_IDS,
  buildFixtureSnapshot,
  createMockMarketViewDataSource,
  type MarketViewDataSource,
  type MarketViewQuery,
  type MarketViewScenarioId,
} from '../market-view'
import {
  assembleReplayTimeline,
  createFixtureReplayTimelineSource,
  errorState,
  identityOfTimeline,
  isCurrentGeneration,
  loadTimelineState,
  projectReplay,
  readyState,
  serializeTimeline,
  sourceSupports,
  timelineIdentity,
  timelineOf,
  type ReplayTimeline,
  type ReplayTimelineSource,
} from './index'
// The synchronous fixture helper is deliberately not on the public barrel — see
// the note in index.ts. Tests reach for it directly, so the bypass is visible.
import { buildReplayTimeline } from './timelines'

const NQ_5M: MarketViewQuery = { instrument: 'NQ', timeframe: '5m' }

function source(scenario: MarketViewScenarioId = 'long-developing', marketData?: MarketViewDataSource) {
  return createFixtureReplayTimelineSource({ scenario, marketData })
}

function code(file: string): string {
  return readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

// ─── The source contract ──────────────────────────────────────────────────────

describe('fixture replay timeline source', () => {
  it('implements the higher-level source contract', async () => {
    const s: ReplayTimelineSource = source()
    expect(s.id).toBe('replay:fixture:long-developing')
    expect(s.label).toContain('Fixturreplay')
    expect(s.origin).toBe('FIXTURE')
    expect(s.instruments()).toEqual(MARKET_INSTRUMENTS)
    expect(s.timeframes()).toEqual(MARKET_TIMEFRAMES)
    const timeline = await s.load(NQ_5M)
    expect(timeline).not.toBeNull()
    expect(timeline?.instrument).toBe('NQ')
    expect(timeline?.timeframe).toBe('5m')
  })

  it('answers for every scenario, instrument and timeframe', async () => {
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      for (const instrument of MARKET_INSTRUMENTS) {
        for (const timeframe of MARKET_TIMEFRAMES) {
          const timeline = await source(scenario).load({ instrument, timeframe })
          expect(timeline, `${scenario}/${instrument}/${timeframe}`).not.toBeNull()
          expect(timeline?.scenarioId).toBe(scenario)
        }
      }
    }
  })

  it('reports what it supports', () => {
    expect(sourceSupports(source(), NQ_5M)).toBe(true)
    expect(sourceSupports(source(), { instrument: 'ES', timeframe: '4H' })).toBe(true)
  })
})

// ─── The bridge itself ────────────────────────────────────────────────────────

describe('the Stage 1 seam is on the path', () => {
  it('reads its base through MarketViewDataSource', async () => {
    // The load is observed, not inferred: a spy on the market-data source must
    // actually be called, with the query the replay source was given.
    const inner = createMockMarketViewDataSource('long-developing')
    const spy = vi.fn(inner.load.bind(inner))
    const wrapped: MarketViewDataSource = { ...inner, load: spy }

    await source('long-developing', wrapped).load(NQ_5M)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(NQ_5M)
  })

  it('delegates its vocabulary to the market-data seam', () => {
    const inner = createMockMarketViewDataSource('long-developing')
    const narrowed: MarketViewDataSource = {
      ...inner,
      instruments: () => ['NQ'],
      timeframes: () => ['5m'],
    }
    const s = source('long-developing', narrowed)
    expect(s.instruments()).toEqual(['NQ'])
    expect(s.timeframes()).toEqual(['5m'])
    // What the source can answer for is exactly what its seam can answer for.
    expect(sourceSupports(s, { instrument: 'ES', timeframe: '4H' })).toBe(false)
  })

  it('propagates unavailability rather than inventing an empty timeline', async () => {
    const inner = createMockMarketViewDataSource('long-developing')
    const empty: MarketViewDataSource = { ...inner, load: async () => null }
    expect(await source('long-developing', empty).load(NQ_5M)).toBeNull()
  })

  it('uses one fixture generator, not two', async () => {
    // The source path and the synchronous convenience must land on identical
    // timelines. If a second generator ever appears, these diverge.
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      const viaSource = await source(scenario).load(NQ_5M)
      const direct = buildReplayTimeline(scenario, 'NQ', '5m')
      expect(serializeTimeline(viaSource!.events), scenario).toBe(serializeTimeline(direct.events))
      expect(viaSource!.base, scenario).toEqual(direct.base)
    }
  })

  it('composes the same two pieces the convenience does', () => {
    // `buildReplayTimeline` is defined as assemble(generate(...)), so authoring
    // a hand-built base reproduces it exactly.
    const base = buildFixtureSnapshot('a-plus-confirmed', 'ES', '15m')
    const assembled = assembleReplayTimeline('a-plus-confirmed', base)
    expect(assembled).toEqual(buildReplayTimeline('a-plus-confirmed', 'ES', '15m'))
  })

  it('arrives at the Stage 1 end state, unchanged by the bridge', async () => {
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      const timeline = (await source(scenario).load(NQ_5M))!
      const projection = projectReplay(timeline, timeline.events.length - 1)
      expect(projection.snapshot.candles, scenario).toEqual(timeline.base.candles)
      expect(projection.snapshot.riskState.status, scenario).toBe(timeline.base.riskState.status)
      expect(projection.snapshot.propState.status, scenario).toBe(timeline.base.propState.status)
    }
  })
})

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('source determinism', () => {
  it('gives identical timelines for the same config and query', async () => {
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      const a = await source(scenario).load(NQ_5M)
      const b = await source(scenario).load(NQ_5M)
      expect(serializeTimeline(b!.events), scenario).toBe(serializeTimeline(a!.events))
      expect(b).toEqual(a)
    }
  })

  it('leaves replay projections unchanged for the same cursor', async () => {
    const timeline = (await source('a-plus-confirmed').load(NQ_5M))!
    for (let cursor = -1; cursor < timeline.events.length; cursor += 1) {
      const first = JSON.stringify(projectReplay(timeline, cursor))
      const second = JSON.stringify(projectReplay(timeline, cursor))
      expect(second, `cursor ${cursor}`).toBe(first)
    }
  })

  it('keeps each scenario distinct', async () => {
    const seen = new Map<string, string>()
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      const timeline = (await source(scenario).load(NQ_5M))!
      const signature = serializeTimeline(timeline.events)
      for (const [other, otherSignature] of seen) {
        expect(signature, `${scenario} collided with ${other}`).not.toBe(otherSignature)
      }
      seen.set(scenario, signature)
    }
  })
})

// ─── Provenance ───────────────────────────────────────────────────────────────

describe('source identity and provenance', () => {
  it('declares FIXTURE and produces FIXTURE', async () => {
    const s = source()
    const timeline = (await s.load(NQ_5M))!
    expect(s.origin).toBe('FIXTURE')
    expect(timeline.base.provenance.origin).toBe(s.origin)
    expect(timeline.base.environment).toBe('development')
    expect(timeline.base.provenance.providerLabel).toBeNull()
  })

  it('never upgrades itself to LIVE', async () => {
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      const s = source(scenario)
      expect(s.origin).not.toBe('LIVE')
      const timeline = (await s.load(NQ_5M))!
      expect(timeline.base.provenance.origin).not.toBe('LIVE')
    }
  })

  it('fails closed when the source and the data disagree', async () => {
    // A fixture source handed non-fixture data is a wiring fault. Refusing is
    // cheaper than rendering a provenance chip that lies.
    const inner = createMockMarketViewDataSource('long-developing')
    const mislabelled: MarketViewDataSource = {
      ...inner,
      load: async (query) => {
        const snapshot = await inner.load(query)
        if (snapshot === null) return null
        return { ...snapshot, provenance: { ...snapshot.provenance, origin: 'LIVE' } }
      },
    }
    await expect(source('long-developing', mislabelled).load(NQ_5M))
      .rejects.toThrow(/declares origin FIXTURE but loaded a timeline with origin LIVE/)
  })
})

// ─── Async state ──────────────────────────────────────────────────────────────

describe('async load state', () => {
  it('reports a loaded timeline as READY', async () => {
    const outcome = await loadTimelineState(1, () => source().load(NQ_5M))
    expect(outcome.generation).toBe(1)
    expect(outcome.state.status).toBe('READY')
    expect(timelineOf(outcome.state)).not.toBeNull()
  })

  it('reports null as UNAVAILABLE, distinctly from an error', async () => {
    const outcome = await loadTimelineState(1, async () => null)
    expect(outcome.state.status).toBe('UNAVAILABLE')
    expect(timelineOf(outcome.state)).toBeNull()
  })

  it('turns a rejection into an ERROR state rather than throwing', async () => {
    const outcome = await loadTimelineState(1, async () => {
      throw new Error('source exploded')
    })
    expect(outcome.state.status).toBe('ERROR')
    expect(outcome.state).toEqual(errorState(new Error('source exploded')))
    if (outcome.state.status === 'ERROR') expect(outcome.state.message).toBe('source exploded')
    expect(timelineOf(outcome.state)).toBeNull()
  })

  it('never surfaces a timeline in a non-ready state', () => {
    const timeline = buildReplayTimeline('long-developing', 'NQ', '5m')
    expect(timelineOf(readyState(timeline))).toBe(timeline)
    expect(timelineOf({ status: 'LOADING' })).toBeNull()
    expect(timelineOf({ status: 'UNAVAILABLE' })).toBeNull()
    expect(timelineOf(errorState('x'))).toBeNull()
  })
})

// ─── Race protection ──────────────────────────────────────────────────────────

/**
 * A promise this test resolves by hand.
 *
 * The ordering under test is about which result arrives second, not about how
 * long anything takes. Driving it with `setTimeout` would make the assertion
 * depend on the scheduler — real but incidental, and the kind of test that
 * passes on a fast machine and flakes on a loaded one. Resolving manually makes
 * the interleaving exact and the invariant scheduler-independent.
 */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('a slower older request cannot overwrite a newer one', () => {
  it('drops a result whose generation is no longer current', () => {
    expect(isCurrentGeneration(3, 3)).toBe(true)
    expect(isCurrentGeneration(2, 3)).toBe(false)
    expect(isCurrentGeneration(4, 3)).toBe(false)
  })

  it('resolves the documented NQ→ES interleaving, with no timers', async () => {
    /*
     * The exact ordering, forced rather than raced:
     *
     *   1. start NQ   2. start ES   3. resolve ES   4. ES is current
     *   5. resolve the older NQ     6. ES is STILL current
     *
     * Step 6 is the bug this guards. Nothing here sleeps.
     */
    const nq = deferred<ReplayTimeline | null>()
    const es = deferred<ReplayTimeline | null>()

    let current = 0
    let applied: ReplayTimeline | null = null
    const apply = (outcome: { generation: number; state: ReturnType<typeof readyState> }) => {
      if (!isCurrentGeneration(outcome.generation, current)) return
      applied = timelineOf(outcome.state)
    }

    // 1. NQ requested.
    const genNq = ++current
    const nqLoad = loadTimelineState(genNq, () => nq.promise)

    // 2. ES requested — NQ is now stale, and nothing has resolved yet.
    const genEs = ++current
    const esLoad = loadTimelineState(genEs, () => es.promise)
    expect(applied).toBeNull()

    // 3. ES resolves first.
    es.resolve(buildReplayTimeline('long-developing', 'ES', '5m'))
    apply(await esLoad as never)

    // 4. ES is current.
    expect(applied).not.toBeNull()
    expect(applied!.instrument).toBe('ES')

    // 5. The older NQ resolves afterwards.
    nq.resolve(buildReplayTimeline('long-developing', 'NQ', '5m'))
    apply(await nqLoad as never)

    // 6. It was dropped. ES is still what is shown.
    expect(applied!.instrument).toBe('ES')
  })

  it('drops a stale result even when it is an error', async () => {
    const stale = deferred<ReplayTimeline | null>()
    const fresh = deferred<ReplayTimeline | null>()

    let current = 0
    let state: ReturnType<typeof readyState> | null = null
    const apply = (outcome: { generation: number; state: ReturnType<typeof readyState> }) => {
      if (!isCurrentGeneration(outcome.generation, current)) return
      state = outcome.state
    }

    const genStale = ++current
    const staleLoad = loadTimelineState(genStale, () => stale.promise)
    const genFresh = ++current
    const freshLoad = loadTimelineState(genFresh, () => fresh.promise)

    fresh.resolve(buildReplayTimeline('long-developing', 'ES', '5m'))
    apply(await freshLoad as never)
    expect(state!.status).toBe('READY')

    // The old request fails. A stale failure must not replace a good newer
    // result with an error frame.
    stale.reject(new Error('stale failure'))
    apply(await staleLoad as never)
    expect(state!.status).toBe('READY')
    expect(timelineOf(state!)!.instrument).toBe('ES')
  })

  it('drops a stale UNAVAILABLE just as firmly', async () => {
    const stale = deferred<ReplayTimeline | null>()
    const fresh = deferred<ReplayTimeline | null>()

    let current = 0
    let state: ReturnType<typeof readyState> | null = null
    const apply = (outcome: { generation: number; state: ReturnType<typeof readyState> }) => {
      if (!isCurrentGeneration(outcome.generation, current)) return
      state = outcome.state
    }

    const genStale = ++current
    const staleLoad = loadTimelineState(genStale, () => stale.promise)
    const genFresh = ++current
    const freshLoad = loadTimelineState(genFresh, () => fresh.promise)

    fresh.resolve(buildReplayTimeline('long-developing', 'ES', '5m'))
    apply(await freshLoad as never)

    stale.resolve(null)
    apply(await staleLoad as never)
    expect(state!.status).toBe('READY')
  })

  it('applies a result that is still current', async () => {
    // The guard must not reject everything — a control for the tests above.
    const only = deferred<ReplayTimeline | null>()
    const current = 1
    const load = loadTimelineState(current, () => only.promise)
    only.resolve(buildReplayTimeline('long-developing', 'NQ', '5m'))
    const outcome = await load
    expect(isCurrentGeneration(outcome.generation, current)).toBe(true)
    expect(timelineOf(outcome.state)!.instrument).toBe('NQ')
  })
})

// ─── Query identity ───────────────────────────────────────────────────────────

describe('the answer must match the question', () => {
  /** A market source that answers a different query than the one asked. */
  function dishonest(
    scenario: MarketViewScenarioId,
    answer: { instrument: MarketViewQuery['instrument']; timeframe: MarketViewQuery['timeframe'] },
  ): MarketViewDataSource {
    const inner = createMockMarketViewDataSource(scenario)
    return { ...inner, load: async () => inner.load(answer) }
  }

  it('rejects a snapshot for the wrong instrument', async () => {
    const s = source('long-developing', dishonest('long-developing', { instrument: 'NQ', timeframe: '5m' }))
    await expect(s.load({ instrument: 'ES', timeframe: '5m' }))
      .rejects.toThrow(/requested instrument ES but the market-data source returned NQ/)
  })

  it('rejects a snapshot for the wrong timeframe', async () => {
    const s = source('long-developing', dishonest('long-developing', { instrument: 'ES', timeframe: '1m' }))
    await expect(s.load({ instrument: 'ES', timeframe: '5m' }))
      .rejects.toThrow(/requested timeframe 5m but the market-data source returned 1m/)
  })

  it('does not silently rewrite the instrument or timeframe', async () => {
    // The failure mode this prevents: a chart rendering NQ while the header
    // says ES, with nothing anywhere reporting a problem.
    const s = source('long-developing', dishonest('long-developing', { instrument: 'NQ', timeframe: '5m' }))
    const outcome = await loadTimelineState(1, () => s.load({ instrument: 'ES', timeframe: '5m' }))
    expect(outcome.state.status).toBe('ERROR')
    expect(timelineOf(outcome.state)).toBeNull()
  })

  it('accepts a snapshot that does match', async () => {
    // Control: the validation is not rejecting everything.
    const s = source('long-developing')
    const timeline = await s.load({ instrument: 'ES', timeframe: '15m' })
    expect(timeline?.instrument).toBe('ES')
    expect(timeline?.timeframe).toBe('15m')
  })
})

// ─── Public surface ───────────────────────────────────────────────────────────

describe('the public barrel offers no synchronous timeline construction', () => {
  it('does not export buildReplayTimeline', async () => {
    const barrel = await import('./index')
    expect(Object.keys(barrel)).not.toContain('buildReplayTimeline')
    // The authoring step stays public — it takes a base it did not fetch, so it
    // cannot bypass the seam.
    expect(Object.keys(barrel)).toContain('assembleReplayTimeline')
    expect(Object.keys(barrel)).toContain('createFixtureReplayTimelineSource')
  })

  it('names the demotion in the barrel source, so it is not re-added by accident', () => {
    const barrel = code('./index.ts')
    expect(barrel).not.toMatch(/export\s*\{[^}]*buildReplayTimeline/)
    expect(barrel).toMatch(/export \{ assembleReplayTimeline \} from '\.\/timelines'/)
  })

  it('leaves the production view with no synchronous construction available', () => {
    // AtlasMarketView imports only from the public barrel, which no longer
    // carries a synchronous constructor — so the shortcut is not merely unused,
    // it is not reachable from there.
    const view = code('../../../components/platform/trading/AtlasMarketView.tsx')
    const replayImports = [...view.matchAll(/from '(@\/lib\/trading\/replay[^']*)'/g)].map((m) => m[1])
    expect(replayImports).toContain('@/lib/trading/replay')
    expect(replayImports).not.toContain('@/lib/trading/replay/timelines')
    expect(view).not.toMatch(/buildReplayTimeline/)
  })
})

// ─── Seed safety ──────────────────────────────────────────────────────────────

describe('the initialTimeline seed cannot outlive its selection', () => {
  it('identifies a selection by scenario, instrument and timeframe together', () => {
    expect(timelineIdentity('long-developing', 'NQ', '5m')).toBe('long-developing:NQ:5m')
    // Any one of the three differing is a different selection.
    expect(timelineIdentity('long-developing', 'ES', '5m')).not.toBe(timelineIdentity('long-developing', 'NQ', '5m'))
    expect(timelineIdentity('long-developing', 'NQ', '1m')).not.toBe(timelineIdentity('long-developing', 'NQ', '5m'))
    expect(timelineIdentity('risk-blocked', 'NQ', '5m')).not.toBe(timelineIdentity('long-developing', 'NQ', '5m'))
  })

  it('derives the identity from a timeline itself', () => {
    const timeline = buildReplayTimeline('a-plus-confirmed', 'ES', '15m')
    expect(identityOfTimeline(timeline)).toBe('a-plus-confirmed:ES:15m')
    expect(identityOfTimeline(timeline)).toBe(timelineIdentity('a-plus-confirmed', 'ES', '15m'))
  })

  it('says a seed answers only its own selection', () => {
    // The guard the view uses: skip the initial load only while the seed's
    // identity equals the current selection. Every other combination loads.
    const seed = buildReplayTimeline('long-developing', 'NQ', '5m')
    const seedKey = identityOfTimeline(seed)

    expect(seedKey === timelineIdentity('long-developing', 'NQ', '5m')).toBe(true)
    for (const [scenario, instrument, timeframe] of [
      ['long-developing', 'ES', '5m'],
      ['long-developing', 'NQ', '1m'],
      ['risk-blocked', 'NQ', '5m'],
    ] as const) {
      expect(
        seedKey === timelineIdentity(scenario, instrument, timeframe),
        `${scenario}/${instrument}/${timeframe} wrongly satisfied by the seed`,
      ).toBe(false)
    }
  })

  it('is consumed once, and every selection change reloads through the source', () => {
    /*
     * Structural, and honestly so: React effects do not run under
     * `renderToStaticMarkup`, so replacement cannot be observed by rendering.
     * What is asserted is the mechanism — the guard nulls the seed after one
     * use, and the effect depends on all four inputs, so no later change can
     * take the skip path.
     */
    const view = code('../../../components/platform/trading/AtlasMarketView.tsx')
    expect(view).toMatch(/seededKey\.current === timelineIdentity\(scenario, instrument, timeframe\)/)
    expect(view).toMatch(/seededKey\.current = null/)
    expect(view).toMatch(/\}, \[source, scenario, instrument, timeframe\]\)/)
  })

  it('resets the cursor and stops playback before a new timeline arrives', () => {
    // A cursor index from the old timeline must never address the new one, and
    // playback must not continue against a timeline that is being replaced.
    const view = code('../../../components/platform/trading/AtlasMarketView.tsx')
    expect(view).toMatch(/setCursor\(\(current\) => \(\{ \.\.\.INITIAL_CURSOR, speed: current\.speed \}\)\)/)
    // Playback bails when there is no timeline, and re-subscribes per timeline.
    expect(view).toMatch(/if \(!cursor\.playing \|\| timeline === null\) return/)
  })

  it('keeps speed as the one preference that survives a reload', () => {
    const view = code('../../../components/platform/trading/AtlasMarketView.tsx')
    expect((view.match(/speed: current\.speed/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

// ─── The boundary this task must not dissolve ─────────────────────────────────

describe('MarketViewDataSource remains market-only', () => {
  const seam = () => code('../market-view/data-source.ts')

  it('declares no account, position, order or fill method', () => {
    const text = seam()
    for (const method of [
      'getAccounts', 'getAccountSnapshot', 'getPositions', 'getWorkingOrders',
      'getRecentFills', 'getHealth', 'connect', 'disconnect', 'reconcileReadOnlyState',
    ]) {
      expect(text, `seam declares ${method}`).not.toMatch(new RegExp(`${method}\\s*[(:]`))
    }
  })

  it('names no credential, broker or provider protocol concept', () => {
    const text = seam()
    for (const pattern of [/credential/i, /\bbroker\b/i, /apiKey/, /Rithmic/i, /Tradovate/i]) {
      expect(text, `seam matches ${pattern}`).not.toMatch(pattern)
    }
  })

  it('keeps the query provider-neutral, with no fixture scenario field', () => {
    const text = seam()
    // Scenario is fixture configuration and belongs on the source, not on a
    // contract a real market feed will also have to satisfy.
    expect(text).not.toMatch(/scenario/i)
    expect(text).toMatch(/readonly instrument:/)
    expect(text).toMatch(/readonly timeframe:/)
  })

  it('is a different type from the replay source', () => {
    // Structural, not nominal: the replay source returns timelines, the market
    // source returns snapshots, and neither can stand in for the other.
    const s = source()
    const market = createMockMarketViewDataSource('long-developing')
    expect(s.id).not.toBe(market.id)
    expect('load' in s && 'load' in market).toBe(true)
  })
})

describe('observed positions belong to the replay source, not the market source', () => {
  it('puts observed-position events on the replay timeline', async () => {
    const timeline = (await source('neutral-no-setup').load(NQ_5M))!
    const positionEvents = timeline.events.filter((event) => event.type.startsWith('OBSERVED_POSITION'))
    expect(positionEvents.length).toBeGreaterThan(0)

    const projection = projectReplay(timeline, timeline.events.length - 1)
    expect(projection.observedPositions).toHaveLength(1)
    // And it is unattributed — a position Omnira never planned, which is exactly
    // why plan and position are separate models.
    expect(projection.observedPositions[0].unattributed).toBe(true)
  })

  it('leaves the market snapshot with no position of its own', async () => {
    const timeline = (await source('neutral-no-setup').load(NQ_5M))!
    // The market-data snapshot carries a presentation-level position field from
    // Stage 1, and it stays FLAT: market data does not observe exposure.
    expect(timeline.base.positionState.state).toBe('FLAT')
    expect(Object.keys(timeline.base)).not.toContain('observedPositions')
    expect(Object.keys(timeline.base)).not.toContain('accounts')
  })
})

// ─── Boundaries ───────────────────────────────────────────────────────────────

describe('Stage 1.6 boundaries', () => {
  const files = ['./source.ts', './load-state.ts']

  it('reaches no provider, network or order path', () => {
    for (const file of files) {
      const text = code(file)
      for (const pattern of [
        /rithmic/i, /tradovate/i, /\bfetch\s*\(/, /XMLHttpRequest/, /new\s+WebSocket/,
        /submitOrder/, /modifyOrder/, /cancelOrder/, /placeOrder/, /preflightOrder/,
        /supabase/i, /\bcredential/i,
      ]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('implements no strategy detector', () => {
    for (const file of files) {
      const text = code(file)
      for (const pattern of [/detectIFVG/, /detectCISD/, /detectSMT/, /detectSweep/, /computeGrade/]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('never reaches lib/trading/internal or an authority constructor', () => {
    for (const file of files) {
      const text = code(file)
      expect(text, file).not.toMatch(/trading\/internal/)
      for (const pattern of [
        /issueRiskClearance/, /issuePropClearance/, /issueApprovalGrant/,
        /createExecutionIntent/, /riskClearanceOf/, /openExecutionGate/,
      ]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('reads no wall clock', () => {
    for (const file of files) {
      expect(code(file), file).not.toMatch(/Date\.now\(\)/)
    }
  })
})

// ─── The view no longer builds timelines ──────────────────────────────────────

describe('AtlasMarketView acquires, it does not construct', () => {
  const view = () => code('../../../components/platform/trading/AtlasMarketView.tsx')

  it('does not import or call buildReplayTimeline', () => {
    const text = view()
    expect(text).not.toMatch(/buildReplayTimeline/)
    expect(text).not.toMatch(/buildFixtureSnapshot/)
    expect(text).not.toMatch(/assembleReplayTimeline/)
  })

  it('acquires through the source seam', () => {
    const text = view()
    expect(text).toMatch(/createFixtureReplayTimelineSource/)
    expect(text).toMatch(/\.load\(\{\s*instrument,\s*timeframe\s*\}\)/)
  })

  it('still owns cursor, projection and playback', () => {
    const text = view()
    for (const owned of ['projectReplay', 'stepForward', 'stepBackward', 'seekTo', 'setSpeed', 'tickIntervalMs']) {
      expect(text, `view no longer owns ${owned}`).toMatch(new RegExp(owned))
    }
  })

  it('guards against a stale load overwriting a newer one', () => {
    const text = view()
    expect(text).toMatch(/isCurrentGeneration/)
    expect(text).toMatch(/generation/)
  })
})
