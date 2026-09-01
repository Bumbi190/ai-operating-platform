/**
 * Omnira Trading — the provider-neutral historical candle contract.
 *
 * WHAT THIS IS FOR
 * ────────────────
 * Stage 1.9B fetches no real market data. It establishes the contract a future
 * Market Data Provider must satisfy so the interactive chart can navigate a
 * history larger than one window — and so the chart's behaviour is decided
 * HERE, once, rather than re-decided by whichever provider arrives first.
 *
 * Nothing in this file names a provider, a transport, an endpoint or a
 * credential. A fixture source and a real one implement the same two methods.
 *
 * WHY THE OUTCOMES ARE A UNION AND NOT AN ARRAY
 * ─────────────────────────────────────────────
 * Five different things can happen when you ask for older candles, and four of
 * them are not "here are zero candles":
 *
 *     PAGE         — the provider answered, here is what it had
 *     EXHAUSTED    — the provider answered: there is no older history
 *     UNAVAILABLE  — the provider could not be reached or could not answer
 *     ERROR        — the request failed
 *
 * Collapsing any of the last three into an empty array would make "we could not
 * find out" indistinguishable from "there is nothing more", and the chart would
 * either stop asking when it should retry, or ask forever when it should stop.
 * An empty `PAGE` therefore means exactly one thing: the provider answered, and
 * for that window it had no candles — and it may still have older ones.
 *
 * GATE-08 IS NOT TOUCHED HERE
 * ───────────────────────────
 * Requests are expressed in canonical instrument ROOTS. There is no front
 * month, no rollover, no continuous contract, no month code and no symbol
 * inference — resolving a root to a tradeable contract is GATE-08 work, and it
 * remains open.
 */

import type {
  MarketCandle,
  MarketInstrument,
  MarketTimeframe,
  Timestamp,
} from '../market-view'

// ─── The states a chart's history can be in ───────────────────────────────────

/**
 * Seven states, none of which is a synonym for another.
 *
 * `READY` and `EXHAUSTED` both mean "we have candles"; they differ on whether
 * asking again could ever produce more. `UNAVAILABLE` and `ERROR` both mean "we
 * do not have what we asked for"; they differ on whether the provider answered
 * at all. Keeping them apart is what lets the chart stop asking when the answer
 * is settled and keep the door open when it is not.
 */
export const HISTORY_STATES = [
  'IDLE',
  'LOADING_INITIAL',
  'READY',
  'LOADING_OLDER',
  'EXHAUSTED',
  'UNAVAILABLE',
  'ERROR',
] as const
export type HistoryState = (typeof HISTORY_STATES)[number]

/** States in which asking for more older history is pointless or unsafe. */
export const TERMINAL_HISTORY_STATES: readonly HistoryState[] = [
  'EXHAUSTED', 'UNAVAILABLE', 'ERROR',
]

/** States in which a request is already in flight. */
export const IN_FLIGHT_HISTORY_STATES: readonly HistoryState[] = [
  'LOADING_INITIAL', 'LOADING_OLDER',
]

/**
 * Whether another `loadBefore` may be issued right now.
 *
 * The single rule the chart consults, so the throttle cannot be re-implemented
 * slightly differently at a call site. A request is issued only from a settled
 * state that might still have more — never while one is in flight, never after
 * exhaustion, and never after a failure until an explicit retry.
 */
export function canRequestOlder(state: HistoryState): boolean {
  return state === 'READY'
}

// ─── What a caller asks for ───────────────────────────────────────────────────

/**
 * A request for the first window.
 *
 * `instrument` is a canonical ROOT — NQ, MNQ, ES — never a resolved contract.
 */
export interface InitialWindowRequest {
  readonly instrument: MarketInstrument
  readonly timeframe: MarketTimeframe
  /** How many candles the caller would like. A provider may return fewer. */
  readonly count: number
}

/**
 * A request for candles strictly older than what is already loaded.
 *
 * `before` is the oldest loaded `openTime`. A provider must return candles
 * strictly before it, so a page can never overlap the newest loaded bar by
 * construction.
 */
export interface OlderWindowRequest {
  readonly instrument: MarketInstrument
  readonly timeframe: MarketTimeframe
  readonly before: Timestamp
  readonly count: number
}

// ─── What a provider answers ──────────────────────────────────────────────────

export type HistoryPage =
  | {
      readonly outcome: 'PAGE'
      readonly candles: readonly MarketCandle[]
      /**
       * Whether the provider believes older candles exist beyond this page.
       *
       * A hint, not a promise: a later `loadBefore` may still answer
       * `EXHAUSTED`. What it must never do is claim `false` while more exists,
       * because the chart will stop asking.
       */
      readonly hasMoreBefore: boolean
    }
  | { readonly outcome: 'EXHAUSTED' }
  | { readonly outcome: 'UNAVAILABLE'; readonly detail: string }
  | { readonly outcome: 'ERROR'; readonly detail: string }

/**
 * A source of historical candles.
 *
 * Two methods, both async, both returning a value rather than throwing — for
 * the same reason the provider adapter does: a thrown error is easy to catch
 * and turn into an empty list, and a discriminated union is not.
 */
export interface HistoricalCandleSource {
  /** Display label. Never a credential, never an endpoint. */
  readonly label: string
  loadInitialWindow(request: InitialWindowRequest): Promise<HistoryPage>
  loadBefore(request: OlderWindowRequest): Promise<HistoryPage>
}

// ─── Mapping an answer onto a state ───────────────────────────────────────────

/**
 * The state a page implies, given whether any candles are already loaded.
 *
 * One place decides this, so the state machine cannot drift between the initial
 * load and a later page. Note that a `PAGE` with `hasMoreBefore: false` becomes
 * `EXHAUSTED` — the provider has told us there is no more, and continuing to
 * ask would be a request storm against a settled answer.
 */
export function stateAfterPage(page: HistoryPage): HistoryState {
  switch (page.outcome) {
    case 'PAGE':
      return page.hasMoreBefore ? 'READY' : 'EXHAUSTED'
    case 'EXHAUSTED':
      return 'EXHAUSTED'
    case 'UNAVAILABLE':
      return 'UNAVAILABLE'
    case 'ERROR':
      return 'ERROR'
    default: {
      const exhaustive: never = page
      return exhaustive
    }
  }
}

/** Operator-facing detail for a page, or null when there is nothing to say. */
export function detailOfPage(page: HistoryPage): string | null {
  return page.outcome === 'UNAVAILABLE' || page.outcome === 'ERROR' ? page.detail : null
}
