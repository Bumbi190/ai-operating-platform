/**
 * Omnira Trading — the market clock.
 *
 * THE DISTINCTION THIS MODULE EXISTS TO ENFORCE
 * ─────────────────────────────────────────────
 * There are two clocks in a trading system and they are never the same clock:
 *
 *   MARKET TIME  — when the observation happened, according to the source of
 *                  the data. In replay it is the cursor's timestamp; with a
 *                  live feed it is the provider's. All trading state is
 *                  computed against this.
 *
 *   WALL TIME    — what the operator's browser thinks the time is. Useful for
 *                  "3 minutes ago" and for animating a replay. Never an input
 *                  to trading state.
 *
 * Mixing them is the bug this file prevents. If a setup's validity were
 * evaluated against `Date.now()`, the same scenario replayed tomorrow would
 * produce a different answer — and a replay that cannot reproduce its own
 * result is not a replay. So `Date.now()` never appears on a trading-state
 * path; a `MarketClock` is passed in, and in replay it is a pure function of
 * the cursor.
 *
 * Timezone rendering is NOT re-implemented here. `America/New_York`, DST and
 * the two session windows all continue to resolve through the existing Time
 * Foundation via `buildSessionDisplayState`.
 */

import type { Timestamp } from '../time'

/** Where a clock's reading comes from. */
export const CLOCK_SOURCES = ['REPLAY', 'PROVIDER', 'WALL'] as const
export type ClockSource = (typeof CLOCK_SOURCES)[number]

/**
 * A source of market time.
 *
 * `now()` is deliberately not called `getTime()` or `Date.now()`-shaped: it
 * returns the market's current instant, which in replay does not advance unless
 * the cursor moves.
 */
export interface MarketClock {
  readonly source: ClockSource
  /** The market's current instant. */
  now(): Timestamp
  /** Epoch milliseconds for the current instant. */
  epochMs(): number
}

/**
 * A clock pinned to one instant.
 *
 * This is the replay clock: the engine builds one per cursor position, so time
 * is a function of the cursor and nothing else. Calling `now()` twice always
 * returns the same value — which is exactly what makes a replayed state
 * reproducible.
 */
export function replayClockAt(instant: Timestamp): MarketClock {
  return {
    source: 'REPLAY',
    now: () => instant,
    epochMs: () => Date.parse(instant),
  }
}

/**
 * A clock reading a provider's reported time.
 *
 * Not used in Stage 1.5 — there is no provider. It exists so the seam is named:
 * when a real feed arrives it supplies one of these, and nothing downstream
 * changes shape.
 */
export function providerClockAt(instant: Timestamp): MarketClock {
  return {
    source: 'PROVIDER',
    now: () => instant,
    epochMs: () => Date.parse(instant),
  }
}

/**
 * The browser's wall clock.
 *
 * PRESENTATION ONLY. Deliberately awkward to reach: it is not a `MarketClock`
 * and cannot be passed where one is expected, so it cannot drift into a
 * trading-state calculation by accident. Use it for "how long ago was this
 * observed", never for what the market state is.
 */
export function wallClockEpochMs(): number {
  return Date.now()
}

/**
 * How far behind market time a reading is, in milliseconds.
 *
 * Both arguments are explicit: the comparison never reads a clock itself, so a
 * staleness calculation in a test is as reproducible as one in production.
 * Negative means the observation is ahead of the reference, which is a real
 * condition worth seeing rather than clamping away.
 */
export function observationAgeMs(observedAt: Timestamp, reference: Timestamp): number {
  return Date.parse(reference) - Date.parse(observedAt)
}
