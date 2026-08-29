/**
 * Omnira Trading — the async loading state for a replay source, and the
 * generation guard that keeps a slow request from overwriting a newer one.
 *
 * Both are pure and live outside React so they can be tested without rendering
 * anything and without a network.
 *
 * THE RACE THIS PREVENTS
 * ──────────────────────
 *   1. the operator selects NQ      → request A starts
 *   2. the operator selects ES      → request B starts
 *   3. B resolves first             → ES is shown
 *   4. A resolves afterwards        → the view snaps back to NQ
 *
 * Step 4 is the bug. A promise carries no notion of still being wanted, so the
 * decision has to be made where the request was issued: every load takes a
 * generation number, and a result is applied only if its generation is still
 * the current one. Anything older is dropped, not merged.
 *
 * `AbortController` would be the other answer, but it only helps if the source
 * honours the signal — a fixture source resolves immediately and would ignore
 * it — so the guard belongs on the consumer side where it always works.
 */

import type { MarketInstrument, MarketTimeframe, MarketViewScenarioId } from '../market-view'
import type { ReplayTimeline } from './timelines'

/**
 * The identity of a timeline selection.
 *
 * Two selections are the same request exactly when this string matches. It is
 * what decides whether a seeded timeline still answers the current selection,
 * and what a consumer keys its reload on — so it lives here, testable, rather
 * than inline in a component.
 */
export function timelineIdentity(
  scenario: MarketViewScenarioId,
  instrument: MarketInstrument,
  timeframe: MarketTimeframe,
): string {
  return `${scenario}:${instrument}:${timeframe}`
}

/** The identity a loaded timeline satisfies. */
export function identityOfTimeline(timeline: ReplayTimeline): string {
  return timelineIdentity(timeline.scenarioId, timeline.instrument, timeline.timeframe)
}

/**
 * Whether a pre-supplied timeline may be used as initial presentation state.
 *
 * AN INVALID SEED MUST NEVER BECOME PRESENTATION STATE.
 *
 * A seed skips the source, so it also skips the identity and provenance checks
 * the source performs. This is that check, applied synchronously — before the
 * seed can initialize anything. Deferring it to an effect is not enough: effects
 * do not run during server rendering or static markup, so a mismatched seed
 * would be painted first and corrected afterwards, showing an ES/1m chart under
 * an NQ/5m header for one frame.
 *
 * The same two questions the source asks: does this answer the selection that
 * was actually made, and does its provenance agree with the source that would
 * otherwise have produced it.
 */
export function isUsableSeed(
  timeline: ReplayTimeline,
  expectedIdentity: string,
  expectedOrigin: string,
): boolean {
  return (
    identityOfTimeline(timeline) === expectedIdentity
    && timeline.base.provenance.origin === expectedOrigin
  )
}

/**
 * What the view knows about its timeline right now.
 *
 * UNAVAILABLE and ERROR are distinct states, not one "no data" case: the first
 * means the source answered and has nothing for this selection, the second
 * means the attempt itself failed. A reader who cannot tell those apart cannot
 * tell a missing instrument from a broken source.
 */
export type ReplayLoadState =
  | { readonly status: 'LOADING' }
  | { readonly status: 'READY'; readonly timeline: ReplayTimeline }
  | { readonly status: 'UNAVAILABLE' }
  | { readonly status: 'ERROR'; readonly message: string }

export const LOADING: ReplayLoadState = { status: 'LOADING' }
export const UNAVAILABLE_STATE: ReplayLoadState = { status: 'UNAVAILABLE' }

export function readyState(timeline: ReplayTimeline): ReplayLoadState {
  return { status: 'READY', timeline }
}

export function errorState(reason: unknown): ReplayLoadState {
  return {
    status: 'ERROR',
    message: reason instanceof Error ? reason.message : String(reason),
  }
}

/** The timeline, or null in every non-ready state. Never a stale one. */
export function timelineOf(state: ReplayLoadState): ReplayTimeline | null {
  return state.status === 'READY' ? state.timeline : null
}

/**
 * Whether a result from `generation` should still be applied.
 *
 * The whole race guard, in one comparison. Exported so the rule is testable on
 * its own rather than only through a component.
 */
export function isCurrentGeneration(generation: number, current: number): boolean {
  return generation === current
}

export interface LoadOutcome {
  readonly generation: number
  readonly state: ReplayLoadState
}

/**
 * Resolve a load into a state, tagged with the generation that requested it.
 *
 * Never throws: a source that rejects becomes an ERROR state, because a replay
 * view that crashes on a bad source is worse than one that says the source
 * failed. The caller still has to check the generation before applying it.
 */
export async function loadTimelineState(
  generation: number,
  load: () => Promise<ReplayTimeline | null>,
): Promise<LoadOutcome> {
  try {
    const timeline = await load()
    return {
      generation,
      state: timeline === null ? UNAVAILABLE_STATE : readyState(timeline),
    }
  } catch (reason) {
    return { generation, state: errorState(reason) }
  }
}
