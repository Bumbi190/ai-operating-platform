/**
 * Omnira Trading — the older-history request gate, at the level the bug lives.
 *
 * WHY THESE TESTS ARE NOT REDUCER TESTS
 * ─────────────────────────────────────
 * The reducer already refuses a second `OLDER_REQUESTED` while one is open, and
 * it always did. The defect was ABOVE it: the network call is made before the
 * reducer runs, and the model the driver consults comes from a ref that React
 * updates only on re-render. Two visible-range callbacks in the same task both
 * read READY, both pass, and both call `loadBefore`.
 *
 * So the harness below reproduces the one property that makes it possible: a
 * "ref" that changes only when `render()` is called, exactly as React's does.
 * Events fired without a `render()` between them are same-task events.
 *
 * `issueOlderRequest` is the function `useHistoricalCandles` calls; these tests
 * exercise the shipped code path rather than a re-description of it.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildFixtureSnapshot } from '@/lib/trading/market-view'
import {
  createFixtureHistoricalSource,
  historyReducer,
  initialHistoryModel,
  shouldLoadOlder,
  type HistoricalCandleSource,
  type HistoryAction,
  type HistoryModel,
  type HistoryPage,
  type HistorySubject,
} from '@/lib/trading/market-data'
import { issueOlderRequest, releaseOlderRequest, type OlderRequestSlot } from './useHistoricalCandles'

const NQ5: HistorySubject = { instrument: 'NQ', timeframe: '5m' }
const ES5: HistorySubject = { instrument: 'ES', timeframe: '5m' }

const candlesFor = (s: HistorySubject) =>
  buildFixtureSnapshot('long-developing', s.instrument, s.timeframe).candles

/** Let every queued microtask and promise callback run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * A source whose responses are released by hand, so "while the request is still
 * unresolved" is a state the test controls rather than races.
 */
function controlledSource(): {
  readonly source: HistoricalCandleSource
  readonly calls: () => number
  release: () => Promise<void>
  releaseAll: () => Promise<void>
} {
  const inner = createFixtureHistoricalSource()
  const queue: Array<() => Promise<void>> = []
  let calls = 0

  const source: HistoricalCandleSource = {
    label: 'controlled fixture',
    loadInitialWindow: (request) => inner.loadInitialWindow(request),
    loadBefore: (request) => {
      calls += 1
      return new Promise<HistoryPage>((resolve) => {
        queue.push(async () => {
          resolve(await inner.loadBefore(request))
        })
      })
    },
  }

  const release = async () => {
    const next = queue.shift()
    if (next !== undefined) await next()
    await flush()
  }
  return {
    source,
    calls: () => calls,
    release,
    releaseAll: async () => {
      while (queue.length > 0) await release()
    },
  }
}

/** A driver harness with React's update timing, and nothing else of React's. */
function driver(subject: HistorySubject, source: HistoricalCandleSource, pageSize = 120) {
  let model: HistoryModel = historyReducer(
    initialHistoryModel(subject, candlesFor(subject)),
    { type: 'VIEWPORT_ARMED', generation: 0 },
  )
  // The ref. Updated ONLY by render(), which is the whole point.
  let modelRef: HistoryModel = model
  const slot: OlderRequestSlot = { current: null }

  const dispatch = (action: HistoryAction) => {
    model = historyReducer(model, action)
  }

  return {
    get committed() { return model },
    get seenByCallbacks() { return modelRef },
    slot,
    dispatch,
    /*
     * A commit: the ref updates AND the commit effects run — including the one
     * that releases the request gate. Modelling only the ref update would hide
     * the very window this suite exists to close.
     */
    render() { modelRef = model; releaseOlderRequest(slot, model) },
    /** One visible-range callback, exactly as InteractiveMarketChart wires it. */
    rangeEvent(from: number) {
      if (!shouldLoadOlder(modelRef, from)) return
      issueOlderRequest({ model: modelRef, slot, dispatch, source, pageSize })
    },
    arm() {
      dispatch({ type: 'VIEWPORT_ARMED', generation: model.generation })
      modelRef = model
      releaseOlderRequest(slot, model)
    },
    changeSubject(next: HistorySubject) {
      dispatch({ type: 'SUBJECT_CHANGED', subject: next, candles: candlesFor(next) })
      modelRef = model
      releaseOlderRequest(slot, model)
    },
  }
}

// ─── A. The exact reported bug ────────────────────────────────────────────────

describe('two visible-range events in one task', () => {
  it('issues exactly ONE loadBefore call', () => {
    const ctl = controlledSource()
    const d = driver(NQ5, ctl.source)

    // No render() between them: this is one task, as React would deliver it.
    d.rangeEvent(-40)
    d.rangeEvent(-41)

    expect(ctl.calls()).toBe(1)
    expect(d.committed.state).toBe('LOADING_OLDER')
  })

  it('both events genuinely qualified — the guard is what stopped the second', () => {
    /*
     * Guards against a vacuous pass: if the second event had simply failed
     * `shouldLoadOlder`, this test would prove nothing about concurrency.
     */
    const ctl = controlledSource()
    const d = driver(NQ5, ctl.source)
    expect(shouldLoadOlder(d.seenByCallbacks, -40)).toBe(true)
    d.rangeEvent(-40)
    // The ref has NOT been updated, so the second event still sees READY.
    expect(d.seenByCallbacks.state).toBe('READY')
    expect(shouldLoadOlder(d.seenByCallbacks, -41)).toBe(true)
    d.rangeEvent(-41)
    expect(ctl.calls()).toBe(1)
  })
})

// ─── B. Storm ─────────────────────────────────────────────────────────────────

describe('a drag storm while the request is unresolved', () => {
  it('issues exactly ONE loadBefore call across fifty events', () => {
    const ctl = controlledSource()
    const d = driver(NQ5, ctl.source)
    for (let frame = 0; frame < 50; frame += 1) d.rangeEvent(-20 - frame)
    expect(ctl.calls()).toBe(1)
  })

  it('still one call when React re-renders between every event', async () => {
    // The other half of the same rule: once committed, the reducer refuses too.
    const ctl = controlledSource()
    const d = driver(NQ5, ctl.source)
    for (let frame = 0; frame < 50; frame += 1) {
      d.rangeEvent(-20 - frame)
      d.render()
    }
    expect(ctl.calls()).toBe(1)
    await ctl.releaseAll()
  })
})

// ─── C. Recovery ──────────────────────────────────────────────────────────────

describe('after a request resolves', () => {
  it('a later genuine boundary crossing issues the next request', async () => {
    const ctl = controlledSource()
    const d = driver(NQ5, ctl.source)

    d.rangeEvent(-40)
    expect(ctl.calls()).toBe(1)
    await ctl.release()
    d.render()

    expect(d.committed.candles.length).toBe(210)
    expect(d.committed.state).toBe('READY')
    expect(d.slot.current).toBeNull()

    d.rangeEvent(-40)
    expect(ctl.calls()).toBe(2)
  })

  it('does not fire again without a crossing', async () => {
    const ctl = controlledSource()
    const d = driver(NQ5, ctl.source)
    d.rangeEvent(-40)
    await ctl.release()
    d.render()
    for (const from of [0, 5, -1, 12]) d.rangeEvent(from)
    expect(ctl.calls()).toBe(1)
  })
})

// ─── D / E / F. Subject changes across an in-flight request ───────────────────

describe('an in-flight request when the subject changes', () => {
  it('does not block the new subject from requesting its own history', async () => {
    const ctl = controlledSource()
    const d = driver(NQ5, ctl.source)

    d.rangeEvent(-40)
    expect(ctl.calls()).toBe(1)
    expect(d.slot.current?.generation).toBe(0)

    // Switch while NQ's request is still open, then fit and arm the new chart.
    d.changeSubject(ES5)
    expect(d.committed.triggerArmed).toBe(false)
    d.arm()

    d.rangeEvent(-40)
    expect(ctl.calls()).toBe(2)
    expect(d.slot.current?.generation).toBe(1)
  })

  it('the old request cannot clear the new subject\'s guard when it lands', async () => {
    const ctl = controlledSource()
    const d = driver(NQ5, ctl.source)

    d.rangeEvent(-40)
    const nqToken = d.slot.current?.token
    d.changeSubject(ES5)
    d.arm()
    d.rangeEvent(-40)
    const esToken = d.slot.current?.token
    expect(esToken).not.toBe(nqToken)

    // NQ's response arrives LAST — after ES already owns the slot.
    await ctl.release()

    expect(d.slot.current).not.toBeNull()
    expect(d.slot.current?.token).toBe(esToken)
    expect(d.slot.current?.generation).toBe(1)

    // And the guard still holds: a same-task event cannot slip through.
    d.rangeEvent(-45)
    expect(ctl.calls()).toBe(2)
  })

  it('the old response cannot mutate the new subject', async () => {
    const ctl = controlledSource()
    const d = driver(NQ5, ctl.source)

    d.rangeEvent(-40)
    d.changeSubject(ES5)
    d.arm()
    const esBefore = d.committed.candles.length

    await ctl.release()
    d.render()

    expect(d.committed.subject.instrument).toBe('ES')
    expect(d.committed.candles.length).toBe(esBefore)
    expect(d.committed.candles).toEqual(candlesFor(ES5))
  })

  it('releases the slot once the new subject\'s own request lands', async () => {
    // The guard must not leak: an old token left behind would be a slow leak
    // that only shows up as "history stops loading" many switches later.
    const ctl = controlledSource()
    const d = driver(NQ5, ctl.source)
    d.rangeEvent(-40)
    d.changeSubject(ES5)
    d.arm()
    d.rangeEvent(-40)
    await ctl.releaseAll()
    d.render()
    expect(d.slot.current).toBeNull()
    d.rangeEvent(-40)
    expect(ctl.calls()).toBe(3)
  })
})

// ─── G / H. The real fixture sequence ─────────────────────────────────────────

describe('the full fixture history, driven as the chart drives it', () => {
  it('reaches 900 candles in exactly seven requests', async () => {
    const ctl = controlledSource()
    const d = driver(NQ5, ctl.source)

    expect(d.committed.candles.length).toBe(90)
    expect(ctl.calls()).toBe(0)

    // Pan left, let the page land, repeat — with same-task duplicates thrown in.
    for (let step = 0; step < 20; step += 1) {
      d.rangeEvent(-40)
      d.rangeEvent(-41)
      d.rangeEvent(-42)
      await ctl.releaseAll()
      d.render()
      if (d.committed.state === 'EXHAUSTED') break
    }

    expect(d.committed.candles.length).toBe(900)
    expect(d.committed.state).toBe('EXHAUSTED')
    expect(ctl.calls()).toBe(7)
    expect(d.committed.lastPrepended).toBe(90)
  })

  it('stays at seven however deep the operator pans after exhaustion', async () => {
    const ctl = controlledSource()
    const d = driver(NQ5, ctl.source)
    for (let step = 0; step < 20; step += 1) {
      d.rangeEvent(-40)
      await ctl.releaseAll()
      d.render()
      if (d.committed.state === 'EXHAUSTED') break
    }
    expect(ctl.calls()).toBe(7)

    for (const from of [-100, -200, -427.93, -1000]) {
      d.rangeEvent(from)
      d.render()
    }
    expect(ctl.calls()).toBe(7)
    expect(d.committed.state).toBe('EXHAUSTED')
    expect(d.committed.candles.length).toBe(900)
  })
})

// ─── The gap between a settled promise and a committed render ─────────────────

describe('a response that has resolved but not yet been committed', () => {
  it('keeps the gate closed, so the same window is not requested twice', async () => {
    /*
     * FOUND IN A REAL BROWSER, NOT HERE — the first version of this suite
     * re-rendered immediately after resolving and so never opened the window.
     *
     * A promise settles as a microtask; React commits later. If the gate were
     * released when the promise settled, then in between: the gate is open, and
     * `modelRef` still holds the PREVIOUS model — READY, 90 candles, same oldest
     * bar. A visible-range event there requests the page that just arrived.
     */
    const ctl = controlledSource()
    const d = driver(NQ5, ctl.source)

    d.rangeEvent(-40)
    expect(ctl.calls()).toBe(1)

    // The response has landed and been dispatched. NO render() yet.
    await ctl.release()
    expect(d.committed.candles.length).toBe(210)
    expect(d.seenByCallbacks.candles.length).toBe(90)
    expect(d.seenByCallbacks.state).toBe('READY')
    expect(shouldLoadOlder(d.seenByCallbacks, -40)).toBe(true)

    // The gate — not the model — is what has to stop this.
    d.rangeEvent(-40)
    expect(ctl.calls()).toBe(1)

    // And after the commit, the next genuine crossing proceeds normally.
    d.render()
    d.rangeEvent(-40)
    expect(ctl.calls()).toBe(2)
  })

  it('does not request the same window twice across the whole history', async () => {
    const ctl = controlledSource()
    const d = driver(NQ5, ctl.source)
    const windows: string[] = []
    const inner = ctl.source.loadBefore.bind(ctl.source)
    void inner

    for (let step = 0; step < 30; step += 1) {
      d.rangeEvent(-40)
      d.rangeEvent(-41)
      await ctl.releaseAll()
      // Deliberately fire again BEFORE committing.
      d.rangeEvent(-42)
      d.render()
      if (d.committed.state === 'EXHAUSTED') break
    }
    windows.push(...[])
    expect(d.committed.candles.length).toBe(900)
    expect(d.committed.state).toBe('EXHAUSTED')
    expect(ctl.calls()).toBe(7)
  })

  it('releases a gate left behind by a previous subject', () => {
    const ctl = controlledSource()
    const d = driver(NQ5, ctl.source)
    d.rangeEvent(-40)
    expect(d.slot.current?.generation).toBe(0)
    d.changeSubject(ES5)
    // The stale gate must not survive as a permanent block.
    expect(d.slot.current).toBeNull()
  })
})
// ─── The ordering the guard depends on ────────────────────────────────────────

describe('the gate installs its token before anything can suspend', () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'useHistoricalCandles.ts'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  const gate = source.slice(source.indexOf('export function issueOlderRequest'))

  it('writes the slot before it calls the source', () => {
    /*
     * The entire guarantee is that nothing between entering this function and
     * writing the slot can yield to another event. An await, or a call to the
     * source placed first, silently restores the bug.
     */
    const install = gate.indexOf('slot.current = { generation, token }')
    const call = gate.indexOf('source\n    .loadBefore(') >= 0
      ? gate.indexOf('source\n    .loadBefore(')
      : gate.indexOf('.loadBefore(')
    expect(install).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(install)
  })

  it('has no await before the slot is written', () => {
    const install = gate.indexOf('slot.current = { generation, token }')
    expect(gate.slice(0, install)).not.toMatch(/\bawait\b/)
  })

  it('refuses on a generation match, not on a bare boolean', () => {
    expect(gate).toMatch(/active\.generation === model\.generation/)
  })

  it('never releases the gate from the promise', () => {
    /*
     * A `.finally()` release settles a microtask before React commits, leaving
     * the gate open beside a stale ref. That was a real browser-only defect.
     */
    expect(gate).not.toMatch(/\.finally\s*\(/)
  })

  it('releases the gate on commit, scoped by generation and state', () => {
    const release = source.slice(source.indexOf('export function releaseOlderRequest'))
    expect(release).toMatch(/active\.generation !== model\.generation/)
    expect(release).toMatch(/model\.state === 'LOADING_OLDER'/)
    // And the hook must actually run it from an effect over the model.
    expect(source).toMatch(/useEffect\(\(\) => \{\s*releaseOlderRequest\(olderRequestRef, model\)/)
  })

  it('uses no clock and no randomness for request identity', () => {
    for (const pattern of [/Date\.now\s*\(/, /Math\.random\s*\(/, /randomUUID/]) {
      expect(source, String(pattern)).not.toMatch(pattern)
    }
    expect(gate).toMatch(/Symbol\(/)
  })
})
