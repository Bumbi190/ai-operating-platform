/**
 * Omnira Trading — what the calendar expected a bucket to contain.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §17 (täckning ⇒ UNKNOWN)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §18 (förväntad frånvaro)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §18.1 (tom förväntansmängd)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §19 (nominalTo / effectiveTo)
 *
 * THE JOIN BETWEEN THE GRID AND THE CALENDAR — AND NOTHING ELSE.
 * ─────────────────────────────────────────────────────────────
 * The grid says where a bucket begins and nominally ends. The calendar says
 * when trading was expected. This module intersects the two, and that is its
 * entire job.
 *
 * NO PROVIDER DATA ENTERS THIS FILE.
 *
 * A missing observation is not a calendar concern: the calendar answers what
 * SHOULD have been there, and comparing that against what arrived is a separate
 * step in `completeness.ts`. Keeping them apart is what stops a quiet provider
 * from looking like a holiday.
 *
 * UNKNOWN IS NOT AN EMPTY LIST.
 * ────────────────────────────
 * §17 is unambiguous: absent authoritative coverage is UNKNOWN, never an
 * assumption. Collapsing that into "no minutes expected" would turn "we do not
 * know" into "nothing was due", and a bucket with nothing due is trivially
 * satisfied — the exact inversion of fail-closed. A partial answer is refused
 * for the same reason: half a known list, silently returned, reads as a whole
 * one.
 *
 * A HALT IS NOT A TRUNCATION.
 * ──────────────────────────
 * §19 keeps two facts apart. A scheduled halt inside a bucket removes minutes
 * from the expected set and leaves `effectiveTo` alone, because trading resumed
 * before the bucket's nominal end. An early close with no resumption moves
 * `effectiveTo` back. Conflating them would make every lunch halt look like a
 * shortened session.
 */

import { toEpochMs, type Timestamp } from '../time'
import { timestampAt, MS_PER_MINUTE } from './zone'
import type { NominalBucket } from './grid'
import { spansCoverage, type SessionCalendar } from './calendar'

/**
 * What the calendar knows about one bucket.
 *
 * `effectiveTo` exists only on the KNOWN branch, structurally. There is no
 * session-bounded end to report when the calendar never claimed the span, and a
 * field defaulting to `nominalTo` in that case would assert a full session on
 * no evidence at all.
 */
export type SessionExpectation =
  | {
      readonly status: 'KNOWN'
      /** Every canonical 1m opening instant the calendar expected to trade. */
      readonly expectedMinuteOpenTimes: readonly Timestamp[]
      /** Exclusive. The session-bounded end relevant to this bucket (§19). */
      readonly effectiveTo: Timestamp
    }
  | { readonly status: 'UNKNOWN' }

const UNKNOWN: SessionExpectation = Object.freeze({ status: 'UNKNOWN' })

/**
 * What the calendar expected inside a nominal bucket.
 *
 * A minute is expected when its ENTIRE bar `[minute, minute + 1m)` lies inside
 * a tradable interval. The whole-bar test is the conservative one: a session
 * ending mid-minute leaves a bar that was never going to be a full minute of
 * trading, and counting it as expected would make an unavoidable absence look
 * like missing data forever.
 */
export function sessionExpectation(
  calendar: SessionCalendar,
  bucket: NominalBucket,
): SessionExpectation {
  const openMs = toEpochMs(bucket.open)
  const nominalToMs = toEpochMs(bucket.nominalTo)

  /*
   * Partial coverage is NOT partial knowledge. If any part of the bucket is
   * unclaimed the whole answer is UNKNOWN — a bucket judged on its covered half
   * would be judged against a set that was never complete.
   */
  if (!spansCoverage(calendar.coverage, openMs, nominalToMs)) return UNKNOWN

  const intervals = calendar.tradingIntervals.map((span) => ({
    from: toEpochMs(span.from),
    to: toEpochMs(span.to),
  }))

  const expected: Timestamp[] = []
  const firstMinute = Math.ceil(openMs / MS_PER_MINUTE) * MS_PER_MINUTE
  for (let minute = firstMinute; minute + MS_PER_MINUTE <= nominalToMs; minute += MS_PER_MINUTE) {
    const tradable = intervals.some((span) => span.from <= minute && minute + MS_PER_MINUTE <= span.to)
    if (tradable) expected.push(timestampAt(minute))
  }

  /*
   * §19's stored fact. The LAST tradable reach inside the bucket, clamped to
   * the nominal end — so a halt that resumes leaves this at `nominalTo` while
   * an early close pulls it back.
   *
   * A bucket with no tradable interval at all (a full holiday closure) reports
   * `effectiveTo === open`. That is `sessionTruncated` by §19's derivation, and
   * deliberately so: the session did not reach the bucket's nominal end, and
   * §20 must not accept such a bucket as completed 4H strategy evidence.
   */
  let effectiveToMs = openMs
  for (const span of intervals) {
    if (span.to <= openMs || span.from >= nominalToMs) continue
    effectiveToMs = Math.max(effectiveToMs, Math.min(span.to, nominalToMs))
  }

  return Object.freeze({
    status: 'KNOWN' as const,
    expectedMinuteOpenTimes: Object.freeze(expected),
    effectiveTo: effectiveToMs === nominalToMs ? bucket.nominalTo : timestampAt(effectiveToMs),
  })
}
