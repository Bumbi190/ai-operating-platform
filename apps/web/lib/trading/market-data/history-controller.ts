/**
 * Omnira Trading — the historical-loading state machine.
 *
 * WHY A PURE REDUCER
 * ──────────────────
 * The hard parts of paged history are not rendering; they are ordering
 * problems. A response arriving after the user switched instrument. A second
 * request firing while the first is still open. A provider saying "no more"
 * and the chart asking again forever. Every one of those is a state-machine
 * bug, and none of them needs a DOM to reproduce.
 *
 * So the machine is a pure reducer over an explicit state, and the React hook
 * is a thin driver. That is what lets the awkward cases be tested directly
 * rather than approximated through a rendered chart.
 *
 * GENERATION TOKENS
 * ─────────────────
 * Every change of subject — instrument or timeframe — increments a generation.
 * A page carries the generation it was requested under, and a page from an
 * older generation is DISCARDED rather than merged. That is the whole
 * stale-response defence, and it is one comparison: a late NQ response cannot
 * append itself onto an ES dataset, because it does not carry ES's generation.
 */

import type { MarketCandle, MarketInstrument, MarketTimeframe } from '../market-view'
import {
  canRequestOlder,
  detailOfPage,
  stateAfterPage,
  type HistoryPage,
  type HistoryState,
} from './history'
import { mergeOlderCandles } from './merge'

export interface HistorySubject {
  readonly instrument: MarketInstrument
  readonly timeframe: MarketTimeframe
}

export interface HistoryModel {
  readonly state: HistoryState
  readonly candles: readonly MarketCandle[]
  /** Operator-facing text for UNAVAILABLE / ERROR / a refused merge. Never decision input. */
  readonly detail: string | null
  /** Incremented on every change of subject. Pages from older generations are dropped. */
  readonly generation: number
  readonly subject: HistorySubject
  /**
   * How many candles the last accepted page PREPENDED.
   *
   * The chart needs this and nothing else to hold the viewport still: it shifts
   * the visible logical range by exactly this many bars. Reported by the model
   * rather than recomputed by the view, so the two cannot disagree.
   */
  readonly lastPrepended: number
  /**
   * Whether the viewport has been INITIALIZED and the history trigger may fire.
   *
   * WHY THIS EXISTS, AND WHY IT IS NOT INFERRED
   * ───────────────────────────────────────────
   * A chart reports a visible logical range from the moment it is created, and
   * before the initial fit settles that range is the library's default — deeply
   * negative, e.g. `from: -90.67`. Any rule that reads only "is `from` past the
   * oldest bar?" is therefore satisfied during startup, and history loads
   * without the operator having navigated anywhere.
   *
   * Startup is not navigation, and no threshold can tell the two apart. So
   * readiness is stated explicitly by whoever owns the viewport lifecycle,
   * rather than inferred from a coordinate that is not yet meaningful.
   *
   * FAIL-SAFE BY CONSTRUCTION: the default is `false`. If arming never happens
   * — a hidden page whose `requestAnimationFrame` never runs, a chart that
   * never settles — the trigger simply stays inert. Not loading history is
   * always the safe failure.
   */
  readonly triggerArmed: boolean
}

export function initialHistoryModel(
  subject: HistorySubject,
  candles: readonly MarketCandle[] = [],
): HistoryModel {
  return {
    state: candles.length > 0 ? 'READY' : 'IDLE',
    candles,
    detail: null,
    generation: 0,
    subject,
    lastPrepended: 0,
    // Never armed at construction. Startup is not navigation.
    triggerArmed: false,
  }
}

export type HistoryAction =
  | { readonly type: 'SUBJECT_CHANGED'; readonly subject: HistorySubject; readonly candles: readonly MarketCandle[] }
  | { readonly type: 'INITIAL_STARTED' }
  | { readonly type: 'OLDER_REQUESTED' }
  | {
      readonly type: 'PAGE_RECEIVED'
      readonly page: HistoryPage
      /** The generation this request was issued under. */
      readonly generation: number
    }
  | { readonly type: 'RETRY_REQUESTED' }
  /**
   * The initial viewport for the current subject has been established.
   *
   * Dispatched by the view after it has requested the initial fit AND the chart
   * has had a frame to apply it — never on a guess and never on a timer.
   *
   * Carries the generation it was scheduled under, for the same reason a page
   * does: the frame that lands after the operator switched instrument was
   * scheduled for a viewport that no longer exists, and arming the new one on
   * the old one's evidence is exactly the race this state was added to remove.
   */
  | { readonly type: 'VIEWPORT_ARMED'; readonly generation: number }

/**
 * Whether a request may be issued right now.
 *
 * Exported so the view asks the model instead of re-deriving the rule. A view
 * that decided this itself would eventually decide it differently.
 */
export function mayRequestOlder(model: HistoryModel): boolean {
  return canRequestOlder(model.state)
}

export function historyReducer(model: HistoryModel, action: HistoryAction): HistoryModel {
  switch (action.type) {
    /*
     * A new instrument or timeframe is a NEW DATASET, not an extension of the
     * old one. The candles are replaced wholesale and the generation advances,
     * which simultaneously invalidates anything still in flight.
     */
    case 'SUBJECT_CHANGED':
      return {
        state: action.candles.length > 0 ? 'READY' : 'IDLE',
        candles: action.candles,
        detail: null,
        generation: model.generation + 1,
        subject: action.subject,
        lastPrepended: 0,
        /*
         * A new subject is a new viewport. It must be initialized and fitted
         * before its trigger means anything, so arming starts over.
         */
        triggerArmed: false,
      }

    case 'INITIAL_STARTED':
      return { ...model, state: 'LOADING_INITIAL', detail: null, lastPrepended: 0 }

    case 'OLDER_REQUESTED':
      // Guarded, so a double-fire cannot open a second request.
      if (!mayRequestOlder(model)) return model
      return { ...model, state: 'LOADING_OLDER', detail: null, lastPrepended: 0 }

    case 'VIEWPORT_ARMED':
      // A frame scheduled for a previous subject proves nothing about this one.
      if (action.generation !== model.generation) return model
      // Idempotent: a re-render must not re-arm or otherwise disturb the model.
      if (model.triggerArmed) return model
      return { ...model, triggerArmed: true }

    case 'RETRY_REQUESTED':
      // Only a failed state may be retried; exhaustion is not a failure.
      if (model.state !== 'UNAVAILABLE' && model.state !== 'ERROR') return model
      return { ...model, state: 'READY', detail: null, lastPrepended: 0 }

    case 'PAGE_RECEIVED': {
      /*
       * THE STALE-RESPONSE GUARD. A page requested before the subject changed
       * carries an older generation and is dropped entirely — it cannot merge,
       * cannot change the state, and cannot move the viewport.
       */
      if (action.generation !== model.generation) return model

      const page = action.page
      if (page.outcome !== 'PAGE') {
        return {
          ...model,
          state: stateAfterPage(page),
          detail: detailOfPage(page),
          lastPrepended: 0,
        }
      }

      const merged = mergeOlderCandles(page.candles, model.candles)
      if (merged.outcome === 'REFUSED') {
        /*
         * A page we cannot honestly place. The candles already on screen stay
         * exactly as they were — refusing must never look like data loss.
         */
        return {
          ...model,
          state: 'ERROR',
          detail: merged.detail,
          lastPrepended: 0,
        }
      }

      return {
        ...model,
        state: stateAfterPage(page),
        candles: merged.candles,
        detail: null,
        lastPrepended: merged.candles.length - model.candles.length,
      }
    }

    default: {
      const exhaustive: never = action
      return exhaustive
    }
  }
}

// ─── The load-older trigger ───────────────────────────────────────────────────

/**
 * How far PAST the oldest loaded bar the viewport must travel before more
 * history is requested, in bars.
 *
 * The sign is the whole point, and getting it wrong is not a subtle bug. A
 * freshly fitted chart shows exactly the loaded series, so its leftmost logical
 * index is 0. A rule phrased as "within N bars of the oldest" is therefore
 * satisfied the instant the chart mounts — and it stays satisfied after each
 * page arrives, so the chart silently walks the entire history backwards
 * without the operator asking for anything.
 *
 * "Approaching the oldest bar" only means something once the operator has
 * navigated there. So the trigger requires the viewport to extend into the
 * WHITESPACE before the first bar, which a fit never does and a leftward drag
 * always does.
 */
export const LOAD_OLDER_WHITESPACE_BARS = 2

/**
 * Whether a visible range warrants asking for older candles.
 *
 * Pure, so the trigger can be tested at its boundary instead of by panning a
 * real chart. `visibleFrom` is the leftmost visible logical index; it is 0 on a
 * fitted chart and goes negative as the operator drags into the empty space
 * before the oldest bar.
 */
export function shouldLoadOlder(
  model: HistoryModel,
  visibleFrom: number,
  whitespaceBars: number = LOAD_OLDER_WHITESPACE_BARS,
): boolean {
  /*
   * ARMING IS CHECKED FIRST, and deliberately so. Every other condition below
   * reads a coordinate, and coordinates are not trustworthy until the viewport
   * has been initialized.
   */
  if (!model.triggerArmed) return false
  if (!mayRequestOlder(model)) return false
  if (model.candles.length === 0) return false
  // Strictly past the oldest bar. A fitted chart sits at 0 and must not fire.
  return visibleFrom < -whitespaceBars
}
