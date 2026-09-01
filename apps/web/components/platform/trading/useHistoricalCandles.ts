'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { MarketCandle, MarketInstrument, MarketTimeframe } from '@/lib/trading/market-view'
import {
  historyReducer,
  initialHistoryModel,
  mayRequestOlder,
  oldestLoadedTime,
  type HistoricalCandleSource,
  type HistoryAction,
  type HistoryModel,
} from '@/lib/trading/market-data'

/**
 * Omnira Trading — the React driver for paged candle history.
 *
 * A THIN DRIVER OVER A PURE MACHINE
 * ─────────────────────────────────
 * All the ordering rules — what may be requested, what a late page does, how
 * pages merge, when history is exhausted — live in `market-data`'s pure
 * reducer and are tested there without a DOM. This hook only wires that
 * machine to effects: it issues requests, it hands back pages, and it does not
 * decide anything the reducer already decides.
 *
 * WHY THE MODEL IS ALSO HELD IN A REF
 * ───────────────────────────────────
 * `requestOlder` is called from a chart subscription, not from a render. If it
 * closed over the model from the render that created it, it would eventually
 * read a stale one — asking for candles older than a boundary that had already
 * moved, or issuing a second request because the state it could see still said
 * READY. The ref always holds the latest model, so the guard and the boundary
 * are both read from the present.
 */

// ─── The one-request-at-a-time gate ───────────────────────────────────────────

/**
 * The identity of an older-history request that is currently open.
 *
 * A `symbol` rather than a counter or a timestamp: it needs to be unique and
 * comparable, and nothing more. No clock and no randomness enter a path the
 * rest of Stage 1.9B keeps deterministic.
 */
export interface OlderRequestSlot {
  current: { readonly generation: number; readonly token: symbol } | null
}

export interface OlderRequestContext {
  /** The model as of NOW, read fresh from the ref by the caller. */
  readonly model: HistoryModel
  readonly slot: OlderRequestSlot
  readonly dispatch: (action: HistoryAction) => void
  readonly source: HistoricalCandleSource
  readonly pageSize: number
}

/**
 * Issue one older-history request, or refuse.
 *
 * WHY THE REDUCER'S GUARD IS NOT ENOUGH
 * ─────────────────────────────────────
 * `OLDER_REQUESTED` is refused while a request is open, but that refusal
 * happens when the reducer RUNS, and the network call is made before then. The
 * model this function reads comes from a ref that React updates on re-render,
 * so two visible-range events arriving in the same task both see READY, both
 * pass, and both call `loadBefore` for the same window. That is not
 * theoretical: it is what produced an eighth request against a fixture whose
 * contract needs exactly seven.
 *
 * Against this fixture the duplicate is harmless — the merge recognises an
 * identical page and deduplicates it. Against a real provider it is a second
 * billed request, and if that provider returns so much as one differing byte
 * for the same window the merge refuses it as DUPLICATE_DISAGREEMENT and the
 * operator sees an error for a request they never made.
 *
 * So the gate is a synchronous slot, written before the first `await` can
 * possibly happen. The reducer remains the canonical state; this is only the
 * thing that makes "one at a time" true at the instant it is claimed.
 */
export function issueOlderRequest(context: OlderRequestContext): void {
  const { model, slot, dispatch, source, pageSize } = context

  // The machine's own rules first — an open request, exhaustion, or a failure.
  if (!mayRequestOlder(model)) return

  const before = oldestLoadedTime(model.candles)
  if (before === null) return

  /*
   * GENERATION-SCOPED, not a bare boolean. A request still open for a PREVIOUS
   * subject must not block the new one: the operator switched instrument and is
   * entitled to that instrument's history. Only a request for the generation we
   * are about to request under can refuse us.
   */
  const active = slot.current
  if (active !== null && active.generation === model.generation) return

  const generation = model.generation
  const token = Symbol('older-history-request')

  /*
   * INSTALLED BEFORE ANYTHING ASYNC. Everything above this line is synchronous,
   * so a second call in the same task reaches the check above and stops.
   */
  slot.current = { generation, token }
  dispatch({ type: 'OLDER_REQUESTED' })

  void source
    .loadBefore({
      instrument: model.subject.instrument,
      timeframe: model.subject.timeframe,
      before,
      count: pageSize,
    })
    .then((page) => {
      dispatch({ type: 'PAGE_RECEIVED', page, generation })
    })
    .catch((error: unknown) => {
      /*
       * A source that throws instead of returning a value is a source that
       * broke its own contract. It is reported as ERROR rather than allowed
       * to reject an unhandled promise — and the candles on screen stay.
       */
      dispatch({
        type: 'PAGE_RECEIVED',
        generation,
        page: {
          outcome: 'ERROR',
          detail: error instanceof Error ? error.message : 'Okänt fel vid historikhämtning.',
        },
      })
    })

  /*
   * NOTE THE ABSENCE OF A `.finally()` RELEASE.
   *
   * Releasing the gate when the PROMISE settles is a microtask; React commits
   * the resulting model later. Between those two moments the gate is open and
   * the ref still reports the PREVIOUS model — READY, with the old oldest bar —
   * so the next visible-range event issues a second request for exactly the
   * window that just arrived. That is a real defect, and only a real browser
   * exposes it: a test that re-renders immediately after resolving never opens
   * the window at all.
   *
   * So the gate is released by `releaseOlderRequest` from a commit effect, once
   * the model the request produced is the model the callbacks can see.
   */
}

/**
 * Release the gate — but only once the model the callbacks see reflects the
 * finished request.
 *
 * Called from a commit effect, never from a promise. The distinction is the
 * whole fix: a promise settles before React re-renders, and a gate opened in
 * that window lets a stale ref request the same page twice.
 */
export function releaseOlderRequest(slot: OlderRequestSlot, model: HistoryModel): void {
  const active = slot.current
  if (active === null) return

  /*
   * A gate held for a PREVIOUS subject is stale: the operator switched, and the
   * generation guard already makes that request unable to affect anything. Drop
   * it so it cannot linger as a permanent block.
   */
  if (active.generation !== model.generation) {
    slot.current = null
    return
  }

  // Still genuinely open.
  if (model.state === 'LOADING_OLDER') return

  slot.current = null
}

export interface UseHistoricalCandlesInput {
  readonly source: HistoricalCandleSource
  readonly instrument: MarketInstrument
  readonly timeframe: MarketTimeframe
  /**
   * The candles the chart already has for this subject.
   *
   * Stage 1.9B extends an existing window backwards rather than taking over
   * ownership of it, so the Atlas snapshot's own candles and every annotation
   * anchored to them are untouched.
   */
  readonly baseCandles: readonly MarketCandle[]
  /** How many candles to ask for per older page. */
  readonly pageSize?: number
}

export interface UseHistoricalCandlesResult {
  readonly model: HistoryModel
  /** Ask for older candles. A no-op unless the machine says it is allowed. */
  readonly requestOlder: () => void
  /** Leave UNAVAILABLE or ERROR and allow requests again. Explicit, never automatic. */
  readonly retry: () => void
  /**
   * Declare that the initial viewport for `generation` has been established, so
   * the load-older trigger may start reading visible ranges.
   *
   * Called by whoever owns the chart, AFTER the initial fit has been requested
   * and the chart has had a frame to apply it. Until then the trigger is inert:
   * a range reported before the fit lands is the library's default, not a place
   * the operator navigated to.
   */
  readonly armViewport: (generation: number) => void
}

export function useHistoricalCandles({
  source,
  instrument,
  timeframe,
  baseCandles,
  pageSize = 120,
}: UseHistoricalCandlesInput): UseHistoricalCandlesResult {
  const subject = useMemo(() => ({ instrument, timeframe }), [instrument, timeframe])

  const [model, dispatch] = useReducer(
    historyReducer,
    undefined,
    () => initialHistoryModel(subject, baseCandles),
  )

  const modelRef = useRef(model)
  modelRef.current = model

  /*
   * A change of instrument or timeframe is a new dataset. Dispatching
   * SUBJECT_CHANGED replaces the candles AND advances the generation, so
   * anything already in flight for the previous subject is invalidated by the
   * same action that switches over — the two can never disagree.
   */
  useEffect(() => {
    dispatch({ type: 'SUBJECT_CHANGED', subject, candles: baseCandles })
  }, [subject, baseCandles])

  /*
   * The synchronous one-at-a-time guard. A ref, because it must be readable and
   * writable between renders — the whole point is that it changes before React
   * has had a chance to re-render anything.
   */
  const olderRequestRef = useRef<OlderRequestSlot['current']>(null)

  /*
   * The gate is released HERE, on commit — see `releaseOlderRequest`. By the
   * time this runs, `modelRef.current` has already been updated for this render,
   * so no callback can see an open gate beside a stale model.
   */
  useEffect(() => {
    releaseOlderRequest(olderRequestRef, model)
  }, [model])

  const requestOlder = useCallback(() => {
    issueOlderRequest({
      model: modelRef.current,
      slot: olderRequestRef,
      dispatch,
      source,
      pageSize,
    })
  }, [source, pageSize])

  const retry = useCallback(() => {
    dispatch({ type: 'RETRY_REQUESTED' })
  }, [])

  /*
   * Stale arming is refused by the machine, not by the caller: the generation
   * captured when the frame was scheduled must still be current when it runs.
   */
  const armViewport = useCallback((generation: number) => {
    dispatch({ type: 'VIEWPORT_ARMED', generation })
  }, [])

  return { model, requestOlder, retry, armViewport }
}
