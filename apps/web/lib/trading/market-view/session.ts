/**
 * Omnira Trading — session window presentation.
 *
 * Canonical source:
 *  - Strategy Specification Canonical v1.0 §5 (timezone), §6 (session windows)
 *  - Trading Core `CANONICAL_TIMEZONE` (America/New_York)
 *
 * NO NEW TIMEZONE LOGIC LIVES HERE.
 *
 * The wall clock is produced by `formatZoneTime` in `lib/atlas/utilities/time`,
 * the platform's existing Time Foundation, which derives every offset from
 * `Intl` at the given instant. That is what makes DST correct without a table:
 * America/New_York is -04:00 in July and -05:00 in January because the platform
 * says so. A fixed UTC-4 offset is forbidden by the canonical text and would
 * silently move both windows by an hour for part of the year.
 *
 * What this module adds is only the comparison: given the canonical wall clock,
 * is a window before, open, or after? That arithmetic is minutes-of-day on an
 * already-correct local time, so it inherits the DST correctness rather than
 * re-deriving it.
 */

import { formatZoneTime } from '@/lib/atlas/utilities/time'
// Sibling modules, not the `@/lib/trading` barrel — see the note in snapshot.ts:
// the barrel drags `node:crypto` into the client bundle through `ids.ts`.
import { CANONICAL_TIMEZONE } from '../time'
import type { TradingSession } from '../contracts'
import type {
  SessionDisplayState,
  SessionWindowInfo,
  SessionWindowState,
} from './snapshot'

interface WindowDefinition {
  readonly session: TradingSession
  readonly label: string
  readonly opensAt: string
  readonly closesAt: string
}

/**
 * The two permitted windows, locked by Strategy Canonical v1.0 §6.
 *
 * Both are half-open [open, close): a bar opening exactly at 05:00 is outside
 * the London window. That matches the canonical window-close break-even rule,
 * which acts *at* 05:00 — an instant that belongs to the close, not to another
 * minute of trading.
 */
export const SESSION_WINDOWS: readonly WindowDefinition[] = [
  { session: 'LONDON', label: 'London', opensAt: '02:00', closesAt: '05:00' },
  { session: 'NEW_YORK', label: 'New York', opensAt: '10:00', closesAt: '12:00' },
]

/** Minutes since local midnight for an HH:MM string. */
function minutesOfDay(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':')
  return Number(hours) * 60 + Number(minutes)
}

function windowStateAt(now: string, definition: WindowDefinition): SessionWindowState {
  const current = minutesOfDay(now)
  const opens = minutesOfDay(definition.opensAt)
  const closes = minutesOfDay(definition.closesAt)
  if (current < opens) return 'BEFORE'
  if (current < closes) return 'OPEN'
  return 'AFTER'
}

/**
 * Build the session panel state for an instant.
 *
 * The instant is always passed in and never read from the clock here, so tests
 * freeze time instead of asserting against the real current second — the same
 * discipline the Time Foundation itself follows.
 */
export function buildSessionDisplayState(instant: Date): SessionDisplayState {
  const zone = formatZoneTime(instant, CANONICAL_TIMEZONE, 'New York')

  const windows: SessionWindowInfo[] = SESSION_WINDOWS.map((definition) => ({
    session: definition.session,
    label: definition.label,
    opensAt: definition.opensAt,
    closesAt: definition.closesAt,
    state: windowStateAt(zone.time, definition),
  }))

  const active = windows.find((window) => window.state === 'OPEN')

  return {
    canonicalTime: zone.time,
    canonicalDate: zone.date,
    timezone: zone.timeZone,
    utcOffset: zone.utcOffset,
    windows,
    activeSession: active?.session ?? null,
  }
}
