/**
 * Omnira Trading — the replay engine.
 *
 * A cursor over an immutable timeline, and nothing else.
 *
 * Every operation returns a NEW cursor rather than mutating one, and the state
 * for a cursor is always recomputed from the timeline's beginning. That makes
 * the engine's whole surface a set of pure functions over
 * `(timeline, position)`, which is what lets a test assert that
 * forward-back-forward is byte-identical to forward.
 *
 * PLAYBACK IS NOT PART OF THE STATE
 * ─────────────────────────────────
 * `playing` and `speed` describe how a UI is animating the cursor. They are
 * carried here so one object describes the whole replay session, but the
 * reducer never reads them and the projection never sees them. Doubling the
 * speed changes how often something calls `step`, never what `step` produces —
 * asserted by a test that runs the same seek at every speed.
 *
 * There is no timer in this file. Scheduling belongs to whatever drives the
 * cursor; a `setInterval` here would make the engine untestable and would put a
 * wall clock on a trading-state path.
 */

import type { ReplayEvent } from './events'
import { replayClockAt, type MarketClock } from './clock'
import type { Timestamp } from '../market-view'

/** Playback rates the UI may offer. Presentation only. */
export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

export function isPlaybackSpeed(raw: unknown): raw is PlaybackSpeed {
  return typeof raw === 'number' && (PLAYBACK_SPEEDS as readonly number[]).includes(raw)
}

/**
 * A position in a replay.
 *
 * `position` is the index of the last applied event; -1 means "before the
 * beginning", which is a real and reachable state — a scenario that has been
 * reset has observed nothing yet, and that is different from having observed
 * the first event.
 */
export interface ReplayCursor {
  readonly position: number
  readonly playing: boolean
  readonly speed: PlaybackSpeed
}

export const INITIAL_CURSOR: ReplayCursor = { position: -1, playing: false, speed: 1 }

/** Clamp a requested position into the timeline, including the -1 start. */
export function clampPosition(position: number, length: number): number {
  if (length <= 0) return -1
  return Math.min(Math.max(position, -1), length - 1)
}

export function replayLength(events: readonly ReplayEvent[]): number {
  return events.length
}

/** True once the cursor sits on the final event. */
export function isAtEnd(cursor: ReplayCursor, events: readonly ReplayEvent[]): boolean {
  return events.length === 0 || cursor.position >= events.length - 1
}

export function isAtStart(cursor: ReplayCursor): boolean {
  return cursor.position <= -1
}

/**
 * Step forward one event.
 *
 * Stopping at the end also stops playback: a replay that reaches its end and
 * keeps claiming to play would misreport itself, and the UI would show a
 * spinning control over a static chart.
 */
export function stepForward(cursor: ReplayCursor, events: readonly ReplayEvent[]): ReplayCursor {
  if (isAtEnd(cursor, events)) return { ...cursor, playing: false }
  return { ...cursor, position: clampPosition(cursor.position + 1, events.length) }
}

/**
 * Step backward one event.
 *
 * Safe at the start — it returns the same position rather than going negative
 * past -1. Stepping back always pauses: rewinding while playing would
 * immediately be undone by the next tick, which reads as a stuck control.
 */
export function stepBackward(cursor: ReplayCursor, events: readonly ReplayEvent[]): ReplayCursor {
  return {
    ...cursor,
    position: clampPosition(cursor.position - 1, events.length),
    playing: false,
  }
}

/** Jump to an index. Out-of-range clamps rather than throwing. */
export function seekTo(
  cursor: ReplayCursor,
  events: readonly ReplayEvent[],
  position: number,
): ReplayCursor {
  return { ...cursor, position: clampPosition(position, events.length), playing: false }
}

/**
 * Seek to the last event at or before an instant.
 *
 * Lands before the first event when the instant precedes the timeline — the
 * honest answer, rather than snapping forward to a state the market had not
 * reached yet.
 */
export function seekToTime(
  cursor: ReplayCursor,
  events: readonly ReplayEvent[],
  instant: Timestamp,
): ReplayCursor {
  const target = Date.parse(instant)
  let found = -1
  for (let index = 0; index < events.length; index += 1) {
    if (Date.parse(events[index].occurredAt) <= target) found = index
    else break
  }
  return { ...cursor, position: found, playing: false }
}

/** Back to the beginning, paused. Speed is a UI preference and survives. */
export function resetCursor(cursor: ReplayCursor): ReplayCursor {
  return { position: -1, playing: false, speed: cursor.speed }
}

export function play(cursor: ReplayCursor, events: readonly ReplayEvent[]): ReplayCursor {
  if (isAtEnd(cursor, events)) return { ...cursor, playing: false }
  return { ...cursor, playing: true }
}

export function pause(cursor: ReplayCursor): ReplayCursor {
  return { ...cursor, playing: false }
}

export function setSpeed(cursor: ReplayCursor, speed: PlaybackSpeed): ReplayCursor {
  return { ...cursor, speed }
}

/** Milliseconds between automatic steps at this speed. Presentation only. */
export function tickIntervalMs(speed: PlaybackSpeed, baseMs = 900): number {
  return Math.round(baseMs / speed)
}

/**
 * Progress through the timeline, 0..1.
 *
 * Counts the start position as 0 of `length + 1` slots, so a reset replay reads
 * as 0% rather than as a negative fraction.
 */
export function replayProgress(cursor: ReplayCursor, events: readonly ReplayEvent[]): number {
  if (events.length === 0) return 0
  return (cursor.position + 1) / events.length
}

/**
 * The market clock for a cursor position.
 *
 * This is where replay time comes from, and it is a pure function of the
 * timeline and the position. Before the first event the clock reads the
 * scenario's start instant.
 */
export function clockAt(
  events: readonly ReplayEvent[],
  position: number,
  startsAt: Timestamp,
): MarketClock {
  const clamped = clampPosition(position, events.length)
  if (clamped < 0) return replayClockAt(startsAt)
  return replayClockAt(events[clamped].occurredAt)
}
