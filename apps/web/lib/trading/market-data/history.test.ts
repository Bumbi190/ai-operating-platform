/**
 * Stage 1.9B — paged candle history.
 *
 * The interesting failures here are ordering failures, and none of them needs a
 * DOM: a late response merging into the wrong dataset, a second request opening
 * while the first is in flight, a provider saying "no more" and the chart
 * asking forever. The machine is a pure reducer precisely so those can be
 * driven directly instead of approximated by panning a rendered chart.
 */

import { describe, expect, it } from 'vitest'
import { buildFixtureSnapshot, type MarketCandle } from '../market-view'
import {
  FIXTURE_HISTORY_LENGTH,
  LOAD_OLDER_WHITESPACE_BARS,
  createFixtureHistoricalSource,
  historyReducer,
  initialHistoryModel,
  mayRequestOlder,
  mergeOlderCandles,
  oldestLoadedTime,
  shouldLoadOlder,
  type HistoryModel,
  type HistoryPage,
} from './index'

const NQ5 = { instrument: 'NQ', timeframe: '5m' } as const

function baseCandles(): readonly MarketCandle[] {
  return buildFixtureSnapshot('long-developing', 'NQ', '5m').candles
}

/** Drive a page through the machine, as the hook would. */
function receive(model: HistoryModel, page: HistoryPage, generation = model.generation) {
  return historyReducer(model, { type: 'PAGE_RECEIVED', page, generation })
}

// ─── The fixture source ───────────────────────────────────────────────────────

describe('the fixture historical source', () => {
  const source = createFixtureHistoricalSource()

  it('returns an initial window of the requested size', async () => {
    const page = await source.loadInitialWindow({ ...NQ5, count: 90 })
    expect(page.outcome).toBe('PAGE')
    if (page.outcome !== 'PAGE') return
    expect(page.candles).toHaveLength(90)
    expect(page.hasMoreBefore).toBe(true)
  })

  it('is deterministic — the same request twice gives deeply equal candles', async () => {
    const a = await source.loadInitialWindow({ ...NQ5, count: 40 })
    const b = await createFixtureHistoricalSource().loadInitialWindow({ ...NQ5, count: 40 })
    expect(b).toEqual(a)
  })

  it('returns candles strictly older than the requested boundary', async () => {
    const initial = await source.loadInitialWindow({ ...NQ5, count: 60 })
    if (initial.outcome !== 'PAGE') throw new Error('expected a page')
    const before = initial.candles[0].openTime

    const older = await source.loadBefore({ ...NQ5, before, count: 50 })
    expect(older.outcome).toBe('PAGE')
    if (older.outcome !== 'PAGE') return
    for (const candle of older.candles) {
      expect(candle.openTime < before).toBe(true)
    }
  })

  it('pages back through many windows and finally exhausts', async () => {
    let loaded = (await source.loadInitialWindow({ ...NQ5, count: 90 })) as HistoryPage
    if (loaded.outcome !== 'PAGE') throw new Error('expected a page')
    let all: readonly MarketCandle[] = loaded.candles
    let pages = 0
    let exhausted = false

    // Bounded: the loop must terminate on the source's own answer, not a cap.
    for (let i = 0; i < 40; i += 1) {
      const before = all[0].openTime
      const page = await source.loadBefore({ ...NQ5, before, count: 120 })
      if (page.outcome === 'EXHAUSTED') { exhausted = true; break }
      if (page.outcome !== 'PAGE') throw new Error(`unexpected ${page.outcome}`)
      pages += 1
      const merged = mergeOlderCandles(page.candles, all)
      if (merged.outcome !== 'MERGED') throw new Error(`refused: ${merged.refusal}`)
      all = merged.candles
      if (!page.hasMoreBefore) { exhausted = true; break }
    }

    expect(pages).toBeGreaterThan(3)
    expect(exhausted).toBe(true)
    expect(all).toHaveLength(FIXTURE_HISTORY_LENGTH)
  })

  it('reports UNAVAILABLE and ERROR as themselves, never as an empty page', async () => {
    const unavailable = createFixtureHistoricalSource({ unavailableDetail: 'nej' })
    const errored = createFixtureHistoricalSource({ errorDetail: 'trasig' })
    const request = { ...NQ5, before: '2026-08-28T10:00:00.000Z' as never, count: 10 }

    const u = await unavailable.loadBefore(request)
    const e = await errored.loadBefore(request)
    expect(u.outcome).toBe('UNAVAILABLE')
    expect(e.outcome).toBe('ERROR')
    // Neither carries candles at all — there is no empty array to mistake.
    expect(u).not.toHaveProperty('candles')
    expect(e).not.toHaveProperty('candles')
  })

  it('names no provider, endpoint or credential', () => {
    expect(source.label).toBe('Fixturhistorik')
  })
})

// ─── Deterministic merge ──────────────────────────────────────────────────────

describe('merging older candles', () => {
  const current = baseCandles()

  it('places older candles in front and keeps ascending order', async () => {
    const source = createFixtureHistoricalSource()
    const page = await source.loadBefore({
      ...NQ5, before: current[0].openTime, count: 30,
    })
    if (page.outcome !== 'PAGE') throw new Error('expected a page')

    const merged = mergeOlderCandles(page.candles, current)
    expect(merged.outcome).toBe('MERGED')
    if (merged.outcome !== 'MERGED') return
    expect(merged.candles).toHaveLength(page.candles.length + current.length)
    for (let i = 1; i < merged.candles.length; i += 1) {
      expect(merged.candles[i].openTime > merged.candles[i - 1].openTime).toBe(true)
    }
  })

  it('does not mutate either input', async () => {
    const source = createFixtureHistoricalSource()
    const page = await source.loadBefore({ ...NQ5, before: current[0].openTime, count: 20 })
    if (page.outcome !== 'PAGE') throw new Error('expected a page')

    const olderBefore = structuredClone(page.candles)
    const currentBefore = structuredClone(current)
    mergeOlderCandles(page.candles, current)
    expect(page.candles).toEqual(olderBefore)
    expect(current).toEqual(currentBefore)
  })

  it('de-duplicates an identical repeat rather than doubling a bar', () => {
    const overlap = [current[0], current[1]]
    const merged = mergeOlderCandles(overlap, current)
    expect(merged.outcome).toBe('MERGED')
    if (merged.outcome !== 'MERGED') return
    // Nothing added: those two bars were already loaded, identically.
    expect(merged.candles).toHaveLength(current.length)
  })

  it('REFUSES when two candles claim one instant with different prices', () => {
    const disagreeing: MarketCandle = { ...current[0], close: '99999.00' as never }
    const merged = mergeOlderCandles([disagreeing], current)
    expect(merged.outcome).toBe('REFUSED')
    if (merged.outcome !== 'REFUSED') return
    expect(merged.refusal).toBe('DUPLICATE_DISAGREEMENT')
  })

  it('picks neither side of a disagreement', () => {
    const disagreeing: MarketCandle = { ...current[0], close: '99999.00' as never }
    const merged = mergeOlderCandles([disagreeing], current)
    // No merged series is produced at all, so neither close can have won.
    expect(merged).not.toHaveProperty('candles')
  })

  it('REFUSES an unordered page', () => {
    const source = [...current].slice(0, 5).reverse()
    const merged = mergeOlderCandles(source, current)
    expect(merged.outcome).toBe('REFUSED')
    if (merged.outcome !== 'REFUSED') return
    expect(merged.refusal).toBe('UNORDERED_INPUT')
  })

  it('REFUSES a page that is not actually older', () => {
    // Internally ordered, but positioned after the loaded series.
    const later = current.slice(-3).map((c) => ({
      ...c,
      openTime: `2099-01-0${current.indexOf(c) % 9 + 1}T00:00:00.000Z` as never,
    }))
    const ordered = [...later].sort((a, b) => (a.openTime < b.openTime ? -1 : 1))
    const merged = mergeOlderCandles(ordered, current)
    expect(merged.outcome).toBe('REFUSED')
  })

  it('preserves exact PriceText through the merge', async () => {
    const source = createFixtureHistoricalSource()
    const page = await source.loadBefore({ ...NQ5, before: current[0].openTime, count: 10 })
    if (page.outcome !== 'PAGE') throw new Error('expected a page')
    const merged = mergeOlderCandles(page.candles, current)
    if (merged.outcome !== 'MERGED') throw new Error('refused')

    for (const candle of merged.candles) {
      // Still exact decimal TEXT, never a number.
      expect(typeof candle.open).toBe('string')
      expect(typeof candle.close).toBe('string')
      expect(String(candle.high)).toBe(candle.high as unknown as string)
    }
    // And the specific values are byte-identical to what the source produced.
    expect(merged.candles.slice(0, page.candles.length)).toEqual(page.candles)
  })

  it('reports the oldest loaded instant, or null when empty', () => {
    expect(oldestLoadedTime(current)).toBe(current[0].openTime)
    expect(oldestLoadedTime([])).toBeNull()
  })
})

// ─── GATE-08C-2B.1 — instants, not their serialization ───────────────────────

/**
 * `Timestamp` permits an OPTIONAL millisecond field, so one instant has several
 * legal spellings and text order is not time order:
 *
 *   '2026-01-01T00:00:00.000Z' === '2026-01-01T00:00:00Z'   as instants
 *   '2026-01-01T00:00:00.500Z'  <  '2026-01-01T00:00:00Z'   as TEXT ('.' < 'Z')
 *                               but LATER in time
 *
 * Every case below is built from those two facts. They are Omnira-owned fixture
 * instants and prices; nothing here is market data.
 */
describe('candle instants are compared as instants, not as text', () => {
  const at = (openTime: string, close = '100.00'): MarketCandle =>
    ({
      openTime,
      open: '100.00',
      high: '101.00',
      low: '99.00',
      close,
      volume: '10',
    }) as unknown as MarketCandle

  const BARE = '2026-01-01T00:00:00Z'
  const MILLIS = '2026-01-01T00:00:00.000Z'
  const HALF = '2026-01-01T00:00:00.500Z'

  it('E. accepts a page whose text order disagrees with its chronological order', () => {
    // '…00.500Z' sorts BEFORE '…00Z' as text. Chronologically it is later, and
    // this page is therefore correctly ascending.
    const merged = mergeOlderCandles([at(BARE), at(HALF)], [at('2026-01-01T00:01:00Z')])
    expect(merged.outcome).toBe('MERGED')
    if (merged.outcome !== 'MERGED') return
    expect(merged.candles.map((c) => c.openTime)).toEqual([
      BARE, HALF, '2026-01-01T00:01:00Z',
    ])
  })

  it('F. refuses the same two instants in the reverse order', () => {
    const merged = mergeOlderCandles([at(HALF), at(BARE)], [at('2026-01-01T00:01:00Z')])
    expect(merged.outcome).toBe('REFUSED')
    if (merged.outcome !== 'REFUSED') return
    expect(merged.refusal).toBe('UNORDERED_INPUT')
  })

  it('orders by instant across every millisecond width', () => {
    const widths = ['2026-01-01T00:00:00.1Z', '2026-01-01T00:00:00.01Z', '2026-01-01T00:00:00.001Z']
    // Chronologically: .001 < .01 < .1 — the exact reverse of their text order.
    const ascending = [BARE, widths[2], widths[1], widths[0]]
    expect(mergeOlderCandles(ascending.map((t) => at(t)), [at('2026-01-01T00:01:00Z')]).outcome)
      .toBe('MERGED')
    expect(mergeOlderCandles([...ascending].reverse().map((t) => at(t)), [at('2026-01-01T00:01:00Z')]).outcome)
      .toBe('REFUSED')
  })

  it('G. de-duplicates equivalent serializations of one instant', () => {
    const merged = mergeOlderCandles([at(MILLIS)], [at(BARE), at('2026-01-01T00:01:00Z')])
    expect(merged.outcome).toBe('MERGED')
    if (merged.outcome !== 'MERGED') return
    // One candle for that instant, not two.
    expect(merged.candles).toHaveLength(2)
  })

  it('H. de-duplicates with the representations reversed', () => {
    const merged = mergeOlderCandles([at(BARE)], [at(MILLIS), at('2026-01-01T00:01:00Z')])
    expect(merged.outcome).toBe('MERGED')
    if (merged.outcome !== 'MERGED') return
    expect(merged.candles).toHaveLength(2)
  })

  it('I. refuses a disagreement across equivalent serializations', () => {
    const merged = mergeOlderCandles([at(MILLIS, '99999.00')], [at(BARE)])
    expect(merged.outcome).toBe('REFUSED')
    if (merged.outcome !== 'REFUSED') return
    expect(merged.refusal).toBe('DUPLICATE_DISAGREEMENT')
  })

  it('J. refuses it in the other representation direction too', () => {
    const merged = mergeOlderCandles([at(BARE, '99999.00')], [at(MILLIS)])
    expect(merged.outcome).toBe('REFUSED')
    if (merged.outcome !== 'REFUSED') return
    expect(merged.refusal).toBe('DUPLICATE_DISAGREEMENT')
  })

  it('K. retains the loaded series\' own Timestamp text, byte for byte', () => {
    /*
     * The merge normalizes nothing. When an older page repeats a bar the chart
     * already holds, OURS is kept — including the exact spelling of its instant.
     */
    const keptBare = mergeOlderCandles([at(MILLIS)], [at(BARE)])
    expect(keptBare.outcome === 'MERGED' && keptBare.candles[0].openTime).toBe(BARE)

    const keptMillis = mergeOlderCandles([at(BARE)], [at(MILLIS)])
    expect(keptMillis.outcome === 'MERGED' && keptMillis.candles[0].openTime).toBe(MILLIS)
  })

  it('L. no equivalent-serialization duplicate survives as two candles', () => {
    // The whole point of the hardening, stated directly.
    for (const [older, loaded] of [[MILLIS, BARE], [BARE, MILLIS]] as const) {
      const merged = mergeOlderCandles([at(older)], [at(loaded)])
      if (merged.outcome !== 'MERGED') throw new Error('expected a merge')
      const instants = merged.candles.map((c) => Date.parse(c.openTime))
      expect(new Set(instants).size).toBe(instants.length)
      expect(merged.candles).toHaveLength(1)
    }
  })

  it('M. oldestLoadedTime stays byte-preserving', () => {
    expect(oldestLoadedTime([at(MILLIS), at('2026-01-01T00:01:00Z')])).toBe(MILLIS)
    expect(oldestLoadedTime([at(BARE), at('2026-01-01T00:01:00Z')])).toBe(BARE)
  })

  it('O. leaves PriceText bytes untouched across the hardening', () => {
    // '100.0' and '100.00' are numerically equal and NOT the same observation.
    // Instant identity changed; price identity deliberately did not.
    const merged = mergeOlderCandles(
      [{ ...at(MILLIS), close: '100.0' } as MarketCandle],
      [{ ...at(BARE), close: '100.00' } as MarketCandle],
    )
    expect(merged.outcome).toBe('REFUSED')
    if (merged.outcome !== 'REFUSED') return
    expect(merged.refusal).toBe('DUPLICATE_DISAGREEMENT')
  })

  it('P. a same-page duplicate is refused, in either spelling', () => {
    /*
     * AUDIT (GATE-08C-2B.1 §11). The strict-ascending check runs first, so a
     * page repeating an instant never reaches the duplicate branch inside the
     * merge loop — that branch is unreachable through the public function and
     * was deliberately left in place rather than redesigned.
     *
     * Observable policy is unchanged for exact repeats (UNORDERED_INPUT before
     * and after). What CHANGED is the equivalent-serialization case: it used to
     * slip past the text-ordering check and survive as two candles for one
     * instant. It is now refused like any other same-instant repeat.
     */
    const loaded = [at('2026-01-01T00:01:00Z')]
    for (const page of [[at(BARE), at(BARE)], [at(BARE), at(MILLIS)], [at(MILLIS), at(BARE)]]) {
      const merged = mergeOlderCandles(page, loaded)
      expect(merged.outcome).toBe('REFUSED')
      if (merged.outcome !== 'REFUSED') continue
      expect(merged.refusal).toBe('UNORDERED_INPUT')
    }
  })

  it('the merged-boundary check uses instants too', () => {
    // Each page is internally ascending, but the older page ENDS after the
    // loaded series begins — detectable only by instant.
    const merged = mergeOlderCandles([at('2026-01-01T00:02:00.000Z')], [at('2026-01-01T00:01:00Z')])
    expect(merged.outcome).toBe('REFUSED')
    if (merged.outcome !== 'REFUSED') return
    expect(merged.refusal).toBe('UNORDERED_INPUT')
  })
})

// ─── The state machine ────────────────────────────────────────────────────────

describe('the history state machine', () => {
  const start = () => initialHistoryModel(NQ5, baseCandles())

  it('starts READY when candles are already present, IDLE when not', () => {
    expect(start().state).toBe('READY')
    expect(initialHistoryModel(NQ5, []).state).toBe('IDLE')
  })

  it('allows exactly one in-flight request — no request storm', () => {
    const model = start()
    expect(mayRequestOlder(model)).toBe(true)

    const loading = historyReducer(model, { type: 'OLDER_REQUESTED' })
    expect(loading.state).toBe('LOADING_OLDER')
    expect(mayRequestOlder(loading)).toBe(false)

    // A second dispatch changes nothing at all.
    const again = historyReducer(loading, { type: 'OLDER_REQUESTED' })
    expect(again).toBe(loading)
  })

  it('refuses further requests once EXHAUSTED', () => {
    const model = receive(start(), { outcome: 'EXHAUSTED' })
    expect(model.state).toBe('EXHAUSTED')
    expect(mayRequestOlder(model)).toBe(false)
    expect(historyReducer(model, { type: 'OLDER_REQUESTED' })).toBe(model)
  })

  it('treats a page with hasMoreBefore:false as exhausted', () => {
    const model = receive(start(), { outcome: 'PAGE', candles: [], hasMoreBefore: false })
    expect(model.state).toBe('EXHAUSTED')
  })

  it('refuses further requests while UNAVAILABLE or ERROR, until retry', () => {
    for (const page of [
      { outcome: 'UNAVAILABLE', detail: 'nej' },
      { outcome: 'ERROR', detail: 'trasig' },
    ] as const) {
      const failed = receive(start(), page)
      expect(mayRequestOlder(failed)).toBe(false)
      expect(historyReducer(failed, { type: 'OLDER_REQUESTED' })).toBe(failed)

      const retried = historyReducer(failed, { type: 'RETRY_REQUESTED' })
      expect(retried.state).toBe('READY')
      expect(mayRequestOlder(retried)).toBe(true)
    }
  })

  it('does not let retry escape EXHAUSTED — that is not a failure', () => {
    const exhausted = receive(start(), { outcome: 'EXHAUSTED' })
    expect(historyReducer(exhausted, { type: 'RETRY_REQUESTED' })).toBe(exhausted)
  })

  it('keeps the loaded candles when a request fails', () => {
    const model = start()
    const failed = receive(model, { outcome: 'UNAVAILABLE', detail: 'nej' })
    // Nothing disappeared — a failure must never look like data loss.
    expect(failed.candles).toEqual(model.candles)
    expect(failed.detail).toBe('nej')
  })

  it('keeps the loaded candles when a page is refused by the merge', () => {
    const model = start()
    const disagreeing: MarketCandle = { ...model.candles[0], close: '99999.00' as never }
    const refused = receive(model, {
      outcome: 'PAGE', candles: [disagreeing], hasMoreBefore: true,
    })
    expect(refused.state).toBe('ERROR')
    expect(refused.candles).toEqual(model.candles)
    expect(refused.detail).not.toBeNull()
  })

  it('reports how many bars a page prepended', async () => {
    const model = start()
    const source = createFixtureHistoricalSource()
    const page = await source.loadBefore({
      ...NQ5, before: model.candles[0].openTime, count: 25,
    })
    if (page.outcome !== 'PAGE') throw new Error('expected a page')

    const next = receive(model, page)
    expect(next.lastPrepended).toBe(page.candles.length)
    expect(next.candles).toHaveLength(model.candles.length + page.candles.length)
  })

  it('resets lastPrepended once a request starts, so it is never re-applied', () => {
    const model = historyReducer(start(), { type: 'OLDER_REQUESTED' })
    expect(model.lastPrepended).toBe(0)
  })
})

// ─── Stale responses and subject isolation ────────────────────────────────────

describe('a late response cannot touch the wrong dataset', () => {
  it('DISCARDS a page from a previous generation', async () => {
    // A request begins for NQ 5m…
    const nq = initialHistoryModel(NQ5, baseCandles())
    const requested = historyReducer(nq, { type: 'OLDER_REQUESTED' })
    const staleGeneration = requested.generation

    // …the operator switches to ES 15m…
    const es = historyReducer(requested, {
      type: 'SUBJECT_CHANGED',
      subject: { instrument: 'ES', timeframe: '15m' },
      candles: buildFixtureSnapshot('long-developing', 'ES', '15m').candles,
    })
    expect(es.generation).toBe(staleGeneration + 1)

    // …and the NQ request returns late.
    const source = createFixtureHistoricalSource()
    const latePage = await source.loadBefore({
      ...NQ5, before: nq.candles[0].openTime, count: 30,
    })
    const after = historyReducer(es, {
      type: 'PAGE_RECEIVED', page: latePage, generation: staleGeneration,
    })

    // Nothing changed. Not the candles, not the state, not the viewport hint.
    expect(after).toBe(es)
    expect(after.candles).toEqual(es.candles)
    expect(after.subject.instrument).toBe('ES')
  })

  it('isolates an instrument change — no old data bleeds in', () => {
    const nq = initialHistoryModel(NQ5, baseCandles())
    const esCandles = buildFixtureSnapshot('long-developing', 'ES', '15m').candles
    const es = historyReducer(nq, {
      type: 'SUBJECT_CHANGED',
      subject: { instrument: 'ES', timeframe: '15m' },
      candles: esCandles,
    })
    expect(es.candles).toEqual(esCandles)
    expect(es.candles).not.toEqual(nq.candles)
    expect(es.lastPrepended).toBe(0)
    expect(es.detail).toBeNull()
  })

  it('isolates a timeframe change on the same instrument', () => {
    const nq5 = initialHistoryModel(NQ5, baseCandles())
    const nq15Candles = buildFixtureSnapshot('long-developing', 'NQ', '15m').candles
    const nq15 = historyReducer(nq5, {
      type: 'SUBJECT_CHANGED',
      subject: { instrument: 'NQ', timeframe: '15m' },
      candles: nq15Candles,
    })
    expect(nq15.subject.timeframe).toBe('15m')
    expect(nq15.candles).toEqual(nq15Candles)
    expect(nq15.generation).toBeGreaterThan(nq5.generation)
  })

  it('clears a failed state when the subject changes', () => {
    const failed = receive(
      initialHistoryModel(NQ5, baseCandles()),
      { outcome: 'ERROR', detail: 'trasig' },
    )
    const switched = historyReducer(failed, {
      type: 'SUBJECT_CHANGED',
      subject: { instrument: 'ES', timeframe: '5m' },
      candles: buildFixtureSnapshot('long-developing', 'ES', '5m').candles,
    })
    expect(switched.state).toBe('READY')
    expect(switched.detail).toBeNull()
  })
})

// ─── The load-older trigger ───────────────────────────────────────────────────

/** Arm a model, as the view does one frame after the initial fit lands. */
function arm(model: HistoryModel): HistoryModel {
  return historyReducer(model, { type: 'VIEWPORT_ARMED', generation: model.generation })
}

/**
 * Replay a sequence of visible-range events exactly as the chart handler does:
 * consult the trigger, and on a pass count one request and open it.
 */
function drive(model: HistoryModel, ranges: readonly number[]): {
  readonly model: HistoryModel
  readonly issued: number
} {
  let current = model
  let issued = 0
  for (const from of ranges) {
    if (!shouldLoadOlder(current, from)) continue
    issued += 1
    current = historyReducer(current, { type: 'OLDER_REQUESTED' })
  }
  return { model: current, issued }
}

describe('the load-older trigger', () => {
  /*
   * ARMED throughout this suite. These cases describe a chart an operator is
   * already driving; the separate suite below covers everything before that.
   */
  const ready = () => arm(initialHistoryModel(NQ5, baseCandles()))

  it('fires once the viewport is dragged past the oldest loaded bar', () => {
    expect(shouldLoadOlder(ready(), -(LOAD_OLDER_WHITESPACE_BARS + 1))).toBe(true)
    expect(shouldLoadOlder(ready(), -30)).toBe(true)
  })

  it('does NOT fire on a freshly fitted chart — the mount-cascade guard', () => {
    /*
     * A fit puts the leftmost logical index at 0. A rule phrased as "within N
     * bars of the oldest" fires there, and keeps firing after each page lands,
     * walking the whole history backwards without the operator asking. That is
     * a real defect this stage hit and fixed; 0 must not trigger.
     */
    expect(shouldLoadOlder(ready(), 0)).toBe(false)
    expect(shouldLoadOlder(ready(), -LOAD_OLDER_WHITESPACE_BARS)).toBe(false)
  })

  it('does not fire while the viewport is far from the oldest bar', () => {
    expect(shouldLoadOlder(ready(), 12)).toBe(false)
    expect(shouldLoadOlder(ready(), 500)).toBe(false)
  })

  it('does not walk the whole history without user navigation', () => {
    // Simulate a mount: fit, then repeated range events at from=0 with no drag.
    let model = ready()
    let requests = 0
    for (let i = 0; i < 20; i += 1) {
      if (shouldLoadOlder(model, 0)) {
        requests += 1
        model = historyReducer(model, { type: 'OLDER_REQUESTED' })
      }
    }
    expect(requests).toBe(0)
  })

  it('does not fire while a request is already in flight', () => {
    const loading = historyReducer(ready(), { type: 'OLDER_REQUESTED' })
    expect(shouldLoadOlder(loading, -20)).toBe(false)
  })

  it('does not fire after exhaustion, however far left the operator drags', () => {
    const exhausted = receive(ready(), { outcome: 'EXHAUSTED' })
    for (const from of [-10, -50, -500]) {
      expect(shouldLoadOlder(exhausted, from), String(from)).toBe(false)
    }
  })

  it('does not fire after a failure until an explicit retry', () => {
    const failed = receive(ready(), { outcome: 'UNAVAILABLE', detail: 'nej' })
    expect(shouldLoadOlder(failed, -20)).toBe(false)
    expect(shouldLoadOlder(historyReducer(failed, { type: 'RETRY_REQUESTED' }), -20)).toBe(true)
  })

  it('does not fire with nothing loaded — there is no boundary to page from', () => {
    expect(shouldLoadOlder(initialHistoryModel(NQ5, []), -20)).toBe(false)
  })

  it('survives a pan without opening a second request', () => {
    // Every frame of a drag calls the trigger; only the first may pass.
    let model = ready()
    let issued = 0
    for (let frame = 0; frame < 50; frame += 1) {
      if (shouldLoadOlder(model, -20)) {
        issued += 1
        model = historyReducer(model, { type: 'OLDER_REQUESTED' })
      }
    }
    expect(issued).toBe(1)
  })
})

// ─── Arming: nothing during startup may request history ───────────────────────

describe('the history trigger is inert until the viewport is armed', () => {
  const unarmed = () => initialHistoryModel(NQ5, baseCandles())

  /*
   * The library's own startup range, measured on this chart before the initial
   * fit was applied. It is deeply negative — far past the trigger threshold —
   * and it means "not laid out yet", not "the operator dragged there".
   */
  const UNFITTED_STARTUP_FROM = -90.67

  it('starts disarmed, with a non-empty dataset already loaded', () => {
    const model = unarmed()
    expect(model.triggerArmed).toBe(false)
    // Not a side effect of having no data: the data is there, the viewport is not.
    expect(model.candles.length).toBeGreaterThan(0)
    expect(model.state).toBe('READY')
    expect(mayRequestOlder(model)).toBe(true)
  })

  // A
  it('refuses the unfitted startup range, however deeply negative it is', () => {
    for (const from of [UNFITTED_STARTUP_FROM, -120, -500, -5000]) {
      expect(shouldLoadOlder(unarmed(), from), String(from)).toBe(false)
    }
    // The very same range is honoured the moment the viewport is armed.
    expect(shouldLoadOlder(arm(unarmed()), UNFITTED_STARTUP_FROM)).toBe(true)
  })

  // B
  it('issues nothing across a full startup burst of range events', () => {
    /*
     * Mount, hydration, setData, the initial fit and its settling all emit
     * range changes. Twenty of them, every one past the threshold.
     */
    const startup = Array.from({ length: 20 }, () => UNFITTED_STARTUP_FROM)
    const result = drive(unarmed(), startup)
    expect(result.issued).toBe(0)
    expect(result.model.state).toBe('READY')
    expect(result.model.candles).toEqual(unarmed().candles)
  })

  // C
  it('issues nothing when a resize widens the unfitted viewport during startup', () => {
    /*
     * The corrective resize happens before the fit lands, so it widens a
     * viewport that is still at its default spacing — pushing `from` further
     * negative on every step. None of it is navigation.
     */
    const duringResize = [UNFITTED_STARTUP_FROM, -186.4, -330.2, -330.2]
    expect(drive(unarmed(), duringResize).issued).toBe(0)
  })

  // D
  it('still respects the threshold once armed', () => {
    const armed = arm(unarmed())
    for (const from of [0, -1, -LOAD_OLDER_WHITESPACE_BARS, 12, 40]) {
      expect(shouldLoadOlder(armed, from), String(from)).toBe(false)
    }
    expect(drive(armed, [0, 5, -1, 0]).issued).toBe(0)
  })

  // E
  it('issues exactly one request when an armed viewport crosses the boundary', () => {
    const armed = arm(unarmed())
    const pan = [0, -1, -LOAD_OLDER_WHITESPACE_BARS, -(LOAD_OLDER_WHITESPACE_BARS + 1)]
    const result = drive(armed, pan)
    expect(result.issued).toBe(1)
    expect(result.model.state).toBe('LOADING_OLDER')
  })

  // F
  it('issues exactly one request across a fifty-frame drag with one in flight', () => {
    const storm = Array.from({ length: 50 }, (_unused, index) => -20 - index)
    expect(drive(arm(unarmed()), storm).issued).toBe(1)
  })

  // G
  it('disarms on a change of subject, and issues nothing until re-armed', () => {
    const armed = arm(unarmed())
    expect(shouldLoadOlder(armed, -40)).toBe(true)

    const switched = historyReducer(armed, {
      type: 'SUBJECT_CHANGED',
      subject: { instrument: 'ES', timeframe: '5m' },
      candles: buildFixtureSnapshot('long-developing', 'ES', '5m').candles,
    })
    expect(switched.triggerArmed).toBe(false)
    // The new subject's own startup burst is refused exactly like the first.
    expect(drive(switched, Array.from({ length: 20 }, () => -90.67)).issued).toBe(0)

    // And it works again once the NEW viewport has been fitted and armed.
    expect(drive(arm(switched), [-40]).issued).toBe(1)
  })

  // H
  it('refuses an arming frame scheduled for the previous subject', () => {
    /*
     * The frame was queued when the old instrument was on screen. It runs after
     * the switch. Arming the new viewport on the old one's evidence would
     * re-open exactly the race this state exists to close.
     */
    const armed = arm(unarmed())
    const staleGeneration = armed.generation

    const switched = historyReducer(armed, {
      type: 'SUBJECT_CHANGED',
      subject: { instrument: 'ES', timeframe: '5m' },
      candles: buildFixtureSnapshot('long-developing', 'ES', '5m').candles,
    })
    const late = historyReducer(switched, {
      type: 'VIEWPORT_ARMED',
      generation: staleGeneration,
    })

    expect(late.triggerArmed).toBe(false)
    expect(late).toBe(switched)
    expect(drive(late, [-90.67, -200]).issued).toBe(0)
  })

  // I
  it('does not request on a fullscreen resize that stays inside the data', () => {
    /*
     * Entering fullscreen reflows the chart and emits range events. A resize is
     * not navigation: unless the viewport genuinely ends up past the oldest
     * bar, nothing is requested — and arming is NOT lost either way.
     */
    const armed = arm(unarmed())
    const enterFullscreen = drive(armed, [0, 0, 0, 0])
    expect(enterFullscreen.issued).toBe(0)
    expect(enterFullscreen.model.triggerArmed).toBe(true)

    const leaveFullscreen = drive(enterFullscreen.model, [0, 1, 0])
    expect(leaveFullscreen.issued).toBe(0)
    expect(leaveFullscreen.model.triggerArmed).toBe(true)

    // Still armed afterwards: a genuine crossing is honoured immediately.
    expect(drive(leaveFullscreen.model, [-40]).issued).toBe(1)
  })

  it('arms idempotently, so a re-render cannot disturb the model', () => {
    const armed = arm(unarmed())
    expect(arm(armed)).toBe(armed)
  })

  it('never arms itself — only an explicit action can', () => {
    /*
     * Everything the machine does on its own leaves the trigger disarmed. If
     * the frame never runs, no amount of data movement substitutes for it.
     */
    let model = unarmed()
    model = historyReducer(model, { type: 'INITIAL_STARTED' })
    expect(model.triggerArmed).toBe(false)
    model = receive(model, {
      outcome: 'PAGE',
      candles: [],
      hasMoreBefore: true,
    })
    expect(model.triggerArmed).toBe(false)
    model = historyReducer(model, { type: 'RETRY_REQUESTED' })
    expect(model.triggerArmed).toBe(false)
    expect(shouldLoadOlder(model, -500)).toBe(false)
  })
})
