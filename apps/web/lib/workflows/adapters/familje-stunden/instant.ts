/**
 * The release instant. Pure, offline, DST-correct.
 *
 * The runbook is emphatic about this one: the release instant is always the
 * first day of the month at 00:00 Europe/Stockholm, stored in UTC, and
 * "räkna om sommartid varje gång — härled inte från föregående månad." Deriving
 * November from October is exactly the mistake, because Sweden leaves DST on the
 * last Sunday of October:
 *
 *   2026-10-01 00:00 Stockholm (CEST, +02) = 2026-09-30T22:00:00Z
 *   2026-11-01 00:00 Stockholm (CET,  +01) = 2026-10-31T23:00:00Z
 *
 * The offset is derived from `Intl` at the candidate instant rather than stored,
 * which is the same rule lib/atlas/utilities/time.ts follows: DST is correct
 * because the platform says so, not because someone wrote a table.
 *
 * THIS FUNCTION DOES NOT DECIDE WHETHER ANYTHING IS RELEASED. It computes the
 * instant a release was REQUESTED for. Whether the gate is open is
 * `is_month_released`'s answer and nobody else's.
 */

import { ATLAS_HOME_TIMEZONE } from '@/lib/atlas/utilities/time'

/** `YYYY-MM`, the workflow's instance key. */
const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/

/** The zone offset in minutes at a given instant, read from the platform. */
function offsetMinutesAt(instant: Date, timeZone: string): number {
  // `en-US` with an explicit zone gives parseable parts in a stable order.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant)

  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  // The same wall-clock reading, interpreted as if it were UTC. The difference
  // between that and the real instant IS the offset.
  const asUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') === 24 ? 0 : get('hour'), get('minute'), get('second'),
  )
  return (asUtc - instant.getTime()) / 60_000
}

/**
 * Convert a wall-clock reading in `timeZone` to the UTC instant it names.
 *
 * Two passes: guess the offset by treating the wall time as UTC, correct, then
 * re-derive at the corrected instant. The second pass is what makes a date that
 * sits near a DST transition land on the right side of it.
 */
function zonedWallTimeToUtc(
  year: number, month: number, day: number, timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0)
  const firstGuess = new Date(naive - offsetMinutesAt(new Date(naive), timeZone) * 60_000)
  const corrected = new Date(naive - offsetMinutesAt(firstGuess, timeZone) * 60_000)
  return corrected
}

export interface ReleaseInstant {
  monthKey: string
  /** The canonical stored value: an ISO-8601 UTC instant. */
  utc: string
  /** The same instant rendered in Stockholm, for a human to sanity-check. */
  stockholm: string
  /** '+01:00' or '+02:00' — which side of DST this month falls on. */
  utcOffset: string
}

export class InvalidMonthKeyError extends Error {
  constructor(monthKey: string) {
    super(`invalid month key "${monthKey}" — expected YYYY-MM`)
    this.name = 'InvalidMonthKeyError'
  }
}

/**
 * The requested release instant for a month key.
 *
 * Computed independently for every month from the calendar and the zone, never
 * by adding a month to a previous answer.
 */
export function computeReleaseInstant(monthKey: string): ReleaseInstant {
  const match = MONTH_KEY.exec(monthKey)
  if (!match) throw new InvalidMonthKeyError(monthKey)

  const year = Number(match[1])
  const month = Number(match[2])
  const instant = zonedWallTimeToUtc(year, month, 1, ATLAS_HOME_TIMEZONE)

  const offsetMinutes = offsetMinutesAt(instant, ATLAS_HOME_TIMEZONE)
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const utcOffset =
    `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`

  const stockholm = new Intl.DateTimeFormat('sv-SE', {
    timeZone: ATLAS_HOME_TIMEZONE, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(instant).replace(' ', ' ')

  return {
    monthKey,
    utc: instant.toISOString(),
    stockholm,
    utcOffset,
  }
}
