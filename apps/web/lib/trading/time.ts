/**
 * Omnira Trading Core — time primitives.
 *
 * Canonical source:
 *  - Strategy Specification Canonical v1.0 §5 (timezone)
 *  - Systemarkitektur v0.1 §9 (time handling)
 *
 * INVARIANTS:
 *  - Instants are stored as ISO-8601 UTC strings. Unambiguous, sortable, portable.
 *  - Session and calendar logic MUST resolve through the canonical IANA zone.
 *    A fixed UTC-4 offset is forbidden: it silently breaks across DST and would
 *    move every session window by an hour for part of the year.
 *
 * Phase 1 scope: the instant type and the canonical zone constant.
 * Session windows, 4H opens and DST transitions are Strategy Engine work (Fas 3).
 */

import type { Branded } from './ids'

/**
 * The only timezone permitted for strategy, session and daily-reset logic.
 * Locked by SOURCE_OF_TRUTH §4. Never substitute a fixed offset.
 */
export const CANONICAL_TIMEZONE = 'America/New_York' as const
export type CanonicalTimezone = typeof CANONICAL_TIMEZONE

/** An instant in time, ISO-8601 with an explicit UTC designator. */
export type Timestamp = Branded<string, 'Timestamp'>

const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/

/**
 * True when the value is a well-formed ISO-8601 UTC instant.
 *
 * Shape alone is not enough. `Date.parse('2026-02-30T00:00:00Z')` succeeds and
 * silently rolls over to March 2 — a journal entry two days from where it
 * claims to be. Every component is therefore compared back against the parsed
 * Date, so impossible calendar dates are rejected rather than shifted.
 */
export function isTimestamp(raw: unknown): raw is Timestamp {
  if (typeof raw !== 'string') return false
  const match = ISO_UTC.exec(raw)
  if (match === null) return false

  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return false

  const date = new Date(ms)
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]) &&
    date.getUTCHours() === Number(match[4]) &&
    date.getUTCMinutes() === Number(match[5]) &&
    date.getUTCSeconds() === Number(match[6])
  )
}

/** Parse an untrusted value into a Timestamp. Fails closed to null. */
export function parseTimestamp(raw: unknown): Timestamp | null {
  return isTimestamp(raw) ? raw : null
}

/** Assert a Timestamp at a boundary you control. Throws on malformed input. */
export function asTimestamp(raw: string): Timestamp {
  const parsed = parseTimestamp(raw)
  if (parsed === null) throw new Error(`Malformed timestamp: ${JSON.stringify(raw)}`)
  return parsed
}

/** Convert a Date to a canonical Timestamp. */
export function timestampFrom(date: Date): Timestamp {
  const ms = date.getTime()
  if (!Number.isFinite(ms)) throw new Error('Cannot build a Timestamp from an invalid Date')
  return date.toISOString() as Timestamp
}

/** Epoch milliseconds for a Timestamp. Total — the type guarantees parseability. */
export function toEpochMs(ts: Timestamp): number {
  return Date.parse(ts)
}

/**
 * Strictly-after comparison.
 * Used for expiry checks, where "equal" must NOT count as still valid.
 */
export function isAfter(a: Timestamp, b: Timestamp): boolean {
  return toEpochMs(a) > toEpochMs(b)
}

/**
 * Expiry test with a deliberate boundary choice: an object whose `expiresAt`
 * equals `now` is EXPIRED, not valid. On a safety boundary the conservative
 * reading is the correct one.
 */
export function isExpiredAt(expiresAt: Timestamp, now: Timestamp): boolean {
  return toEpochMs(now) >= toEpochMs(expiresAt)
}
