/**
 * Omnira Trading — deterministic canonical-zone conversion.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §12.1 (18:00 America/New_York)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §27.6 (DST)
 *  - Strategy Specification Canonical v1.0 §5 (timezone)
 *
 * THE ONLY MODULE IN THIS PACKAGE THAT KNOWS WHAT A TIMEZONE IS.
 * ─────────────────────────────────────────────────────────────
 * Everything above this file works in absolute instants. The canonical grid is
 * defined in New York WALL-CLOCK terms, so exactly one module performs the
 * conversion and every other module inherits its correctness. A second place
 * doing zone arithmetic is a second place for it to be subtly wrong.
 *
 * NO OFFSET TABLE. NO FIXED -04:00 OR -05:00.
 * ──────────────────────────────────────────
 * Offsets are derived from `Intl` at the supplied instant, which is what makes
 * DST correct without anyone maintaining a table. Canonical v1.0 forbids a
 * fixed offset outright: it would move every session boundary by an hour for
 * part of the year, and it would do so silently.
 *
 * `CANONICAL_TIMEZONE` is imported, never restated. The `'UTC'` below is a
 * SERIALISATION zone for rendering an instant back into the canonical
 * `Timestamp` text — it is not a second session zone and no session question is
 * ever asked of it.
 *
 * IT NEVER READS THE MACHINE'S CLOCK OR THE MACHINE'S TIMEZONE.
 * ────────────────────────────────────────────────────────────
 * Every formatter names its `timeZone` explicitly. A formatter constructed
 * without one resolves to the host's configured zone, which would make the
 * canonical grid depend on where the process happens to run — the same class of
 * defect as a hard-coded offset, and harder to see.
 *
 * DST ANOMALIES ARE MODELLED, NOT ROUNDED AWAY.
 * ─────────────────────────────────────────────
 * A local wall-clock time does not always name exactly one instant. On the
 * spring-forward Sunday, 02:00–02:59 New York does not exist at all; on the
 * fall-back Sunday, 01:00–01:59 happens twice. Canonical 02:00 is a strategy
 * boundary (§12.1), so the spring-forward gap lands squarely on one — and §27.6
 * says the code may NOT lean on the fact that today's schedule keeps those
 * Sundays inside the weekend closure.
 *
 * So the conversion reports all three outcomes and the callers fail closed.
 * Picking "the nearest existing instant" would silently invent a boundary that
 * the exchange never had.
 */

import { asTimestamp, CANONICAL_TIMEZONE, toEpochMs, type Timestamp } from '../time'

const MS_PER_SECOND = 1_000
export const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000

/** A wall-clock reading. Calendar fields only — it names no instant by itself. */
export interface LocalTime {
  readonly year: number
  /** 1-12. Calendar month, not a zero-based index. */
  readonly month: number
  readonly day: number
  /** 0-23. */
  readonly hour: number
  readonly minute: number
  readonly second: number
}

/*
 * Formatters are built once. Constructing one per call is pure overhead, and
 * `Intl.DateTimeFormat` is immutable, so a shared instance cannot drift.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`: the latter renders midnight as
 * hour 24 under some ICU versions, which would silently push every midnight
 * reading onto the previous day.
 */
const FIELDS = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
} as const

const CANONICAL_FORMAT = new Intl.DateTimeFormat('en-US', { timeZone: CANONICAL_TIMEZONE, ...FIELDS })
const UTC_FORMAT = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...FIELDS })

function fieldsAt(format: Intl.DateTimeFormat, epochMs: number): LocalTime {
  const parts: Record<string, number> = {}
  for (const part of format.formatToParts(epochMs)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return Object.freeze({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  })
}

/** Epoch milliseconds for wall-clock fields read as though they were UTC. */
function asIfUtc(local: LocalTime): number {
  return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second)
}

/**
 * The canonical zone's offset, in milliseconds, at a given instant.
 *
 * Truncated to whole seconds first. Zone offsets are whole minutes, so a
 * sub-second remainder carries no information — but leaving it in would make
 * the difference below wrong by exactly that remainder.
 */
function offsetMsAt(epochMs: number): number {
  const whole = Math.floor(epochMs / MS_PER_SECOND) * MS_PER_SECOND
  return asIfUtc(fieldsAt(CANONICAL_FORMAT, whole)) - whole
}

/** Render an instant back into canonical `Timestamp` text. */
export function timestampAt(epochMs: number): Timestamp {
  const utc = fieldsAt(UTC_FORMAT, epochMs)
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0')
  return asTimestamp(
    `${pad(utc.year, 4)}-${pad(utc.month)}-${pad(utc.day)}` +
      `T${pad(utc.hour)}:${pad(utc.minute)}:${pad(utc.second)}Z`,
  )
}

/** The canonical wall-clock reading for an instant. Total — every instant has one. */
export function localTimeAt(at: Timestamp): LocalTime {
  return fieldsAt(CANONICAL_FORMAT, toEpochMs(at))
}

/**
 * What a wall-clock reading maps to in absolute time.
 *
 * Three outcomes because a local time genuinely has three possible meanings —
 * see the DST note in the module header. Nothing here chooses on the caller's
 * behalf.
 */
export type ZonedInstant =
  | { readonly kind: 'EXACT'; readonly instant: Timestamp }
  | { readonly kind: 'NONEXISTENT' }
  | { readonly kind: 'AMBIGUOUS'; readonly earlier: Timestamp; readonly later: Timestamp }

/**
 * The instant a canonical wall-clock reading names.
 *
 * The method is a round trip, not a lookup: each candidate offset produces a
 * candidate instant, and a candidate is kept only if formatting it back in the
 * canonical zone reproduces the requested fields exactly. A gap therefore
 * yields nothing and an overlap yields two, which is precisely the truth.
 *
 * Candidate offsets come from probing the zone itself rather than from a table
 * of ±4/±5 hours, so this stays correct if the zone's rules ever change.
 */
export function instantAtLocalTime(local: LocalTime): ZonedInstant {
  const naive = asIfUtc(local)

  /*
   * Candidate offsets are probed a day either side of the target, not at the
   * target alone.
   *
   * Probing only near the target — or worse, probing again at the offset the
   * first probe suggested — stays inside ONE regime and can never see the
   * other. On the fall-back Sunday both readings of 01:30 sit within an hour of
   * each other, so a same-regime probe finds one instant, calls it unique, and
   * reports EXACT for a genuinely ambiguous label.
   *
   * A day's margin brackets any transition that could affect the requested
   * local time, since no zone shifts by anything close to 24 hours.
   */
  const probes = [naive - MS_PER_DAY, naive, naive + MS_PER_DAY].map(offsetMsAt)

  const matches: number[] = []
  for (const offset of new Set(probes)) {
    const candidate = naive - offset
    const rendered = fieldsAt(CANONICAL_FORMAT, candidate)
    if (
      rendered.year === local.year &&
      rendered.month === local.month &&
      rendered.day === local.day &&
      rendered.hour === local.hour &&
      rendered.minute === local.minute &&
      rendered.second === local.second
    ) {
      matches.push(candidate)
    }
  }

  if (matches.length === 0) return Object.freeze({ kind: 'NONEXISTENT' as const })
  if (matches.length === 1) {
    return Object.freeze({ kind: 'EXACT' as const, instant: timestampAt(matches[0]) })
  }
  const sorted = [...matches].sort((a, b) => a - b)
  return Object.freeze({
    kind: 'AMBIGUOUS' as const,
    earlier: timestampAt(sorted[0]),
    later: timestampAt(sorted[sorted.length - 1]),
  })
}

/**
 * The same wall-clock time, a whole number of calendar days away.
 *
 * Pure calendar arithmetic on the DATE fields, performed in UTC where every day
 * is exactly 24 hours. It deliberately does not step 24 hours in absolute local
 * time: a DST day is 23 or 25 hours long, so that subtraction would land on the
 * wrong date twice a year. Shifting the date and keeping the wall-clock fields
 * is what "the same time yesterday" actually means.
 */
export function shiftLocalDay(local: LocalTime, days: number): LocalTime {
  const shifted = fieldsAt(
    UTC_FORMAT,
    Date.UTC(local.year, local.month - 1, local.day) + days * MS_PER_DAY,
  )
  return Object.freeze({
    year: shifted.year,
    month: shifted.month,
    day: shifted.day,
    hour: local.hour,
    minute: local.minute,
    second: local.second,
  })
}
