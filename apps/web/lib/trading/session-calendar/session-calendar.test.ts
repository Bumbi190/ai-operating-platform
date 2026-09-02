/**
 * Omnira Trading — session calendar and canonical time grid.
 *
 * EVERY SCHEDULE HERE IS INVENTED.
 *
 * These are deterministic Omnira-owned fixtures, not CME data. No real holiday,
 * no real early close and no published session table appears anywhere in this
 * file. Canonical v1.0 §17 makes the concrete year data a separately versioned
 * operational artefact; a test that quietly became that artefact would put
 * exchange data under a test runner's authority.
 *
 * The fixture day is shaped LIKE a normal equity-index day — an 18:00 open, an
 * intraday halt, a 17:00 close — because those shapes are what the semantics
 * have to survive. The instants are chosen, not looked up.
 *
 * WHY THE UTC LITERALS ARE ALLOWED TO BE ABSOLUTE
 * ──────────────────────────────────────────────
 * Production code may never hard-code an offset. A TEST may state a known
 * absolute instant, and must: asserting that 02:00 New York is 07:00Z in
 * January and 06:00Z in July is exactly the DST proof, and it cannot be written
 * by asking the same `Intl` machinery under test what the answer is.
 */

import { describe, expect, it } from 'vitest'
import { asTimestamp, type Timestamp } from '../time'
import {
  BAR_COMPLETENESS,
  FOUR_HOUR_OPEN_HOURS,
  OBSERVATION_SOURCE_STATES,
  SESSION_CALENDAR_PROBLEMS,
  bucketAt,
  buildSessionCalendar,
  evaluateBucketEvidence,
  fourHourStrategyStanding,
  instantAtLocalTime,
  isBucketOpen,
  isCanonicalMinuteOpen,
  isStrategyFourHourOpen,
  localTimeAt,
  sessionExpectation,
  type NominalBucket,
  type SessionCalendar,
  type SessionCalendarProblemCode,
} from './index'

const T = (raw: string): Timestamp => asTimestamp(raw)

// ─── Fixture instants, verified against the wall clock in the assertions ──────

/** Winter fixture day: 18:00 Wed 2026-01-14 → 17:00 Thu 2026-01-15, New York. */
const WINTER = {
  open1800: T('2026-01-14T23:00:00Z'),
  open2200: T('2026-01-15T03:00:00Z'),
  open0200: T('2026-01-15T07:00:00Z'),
  open0600: T('2026-01-15T11:00:00Z'),
  open1000: T('2026-01-15T15:00:00Z'),
  open1400: T('2026-01-15T19:00:00Z'),
  haltFrom: T('2026-01-15T21:15:00Z'),
  haltTo: T('2026-01-15T21:30:00Z'),
  close1700: T('2026-01-15T22:00:00Z'),
  next1800: T('2026-01-15T23:00:00Z'),
  dayAfter0200: T('2026-01-16T07:00:00Z'),
  coverageTo: T('2026-01-16T23:00:00Z'),
} as const

/** Summer fixture day: 18:00 Wed 2026-07-15 → 17:00 Thu 2026-07-16, New York. */
const SUMMER = {
  open1800: T('2026-07-15T22:00:00Z'),
  open0200: T('2026-07-16T06:00:00Z'),
  open0600: T('2026-07-16T10:00:00Z'),
  open1000: T('2026-07-16T14:00:00Z'),
  open1400: T('2026-07-16T18:00:00Z'),
  close1700: T('2026-07-16T21:00:00Z'),
  next1800: T('2026-07-16T22:00:00Z'),
} as const

/** United States DST changeover Sundays in 2026. Both inside a weekend, by fixture choice. */
const DST = {
  springLastBefore: T('2026-03-08T06:59:00Z'),
  springFirstAfter: T('2026-03-08T07:00:00Z'),
  fallFirst0100: T('2026-11-01T05:00:00Z'),
  fallSecond0100: T('2026-11-01T06:00:00Z'),
} as const

const MINUTE = 60_000

function built(
  version: string,
  tradingIntervals: readonly (readonly [Timestamp, Timestamp])[],
  coverage: readonly (readonly [Timestamp, Timestamp])[],
): SessionCalendar {
  const build = buildSessionCalendar({
    calendarVersion: version,
    tradingIntervals: tradingIntervals.map(([from, to]) => ({ from, to })),
    coverage: coverage.map(([from, to]) => ({ from, to })),
  })
  if (!build.ok) throw new Error(`fixture calendar refused: ${JSON.stringify(build.problems)}`)
  return build.calendar
}

function problemsOf(input: Parameters<typeof buildSessionCalendar>[0]): SessionCalendarProblemCode[] {
  const build = buildSessionCalendar(input)
  return build.ok ? [] : build.problems.map((problem) => problem.code)
}

/** The whole fixture window, so coverage questions are never accidentally the subject. */
const FULL_COVERAGE = [[WINTER.open1800, WINTER.coverageTo]] as const

/** Normal day: open 18:00, halt 16:15–16:30, close 17:00. Nothing thereafter. */
const NORMAL = built('fixture-normal-v1', [
  [WINTER.open1800, WINTER.haltFrom],
  [WINTER.haltTo, WINTER.close1700],
], FULL_COVERAGE)

/** A halt sitting INSIDE the 10:00 bucket, with trading resuming before 14:00. */
const HALT_INSIDE = built('fixture-halt-inside-v1', [
  [WINTER.open1800, T('2026-01-15T16:00:00Z')],
  [T('2026-01-15T16:30:00Z'), WINTER.close1700],
], FULL_COVERAGE)

/** Early close at 13:00 New York, with no resumption. */
const EARLY_CLOSE = built('fixture-early-close-v1', [
  [WINTER.open1800, T('2026-01-15T18:00:00Z')],
], FULL_COVERAGE)

/** Covered, but with no trading at all on the second day. */
const FULL_CLOSURE = built('fixture-full-closure-v1', [
  [WINTER.open1800, WINTER.close1700],
], FULL_COVERAGE)

/** The summer day, so the same local labels can be asserted in the other DST mode. */
const SUMMER_NORMAL = built(
  'fixture-summer-v1',
  [[SUMMER.open1800, SUMMER.close1700]],
  [[SUMMER.open1800, SUMMER.next1800]],
)

function bucket(timeframe: Parameters<typeof bucketAt>[0], at: Timestamp): NominalBucket {
  const resolved = bucketAt(timeframe, at)
  if (!resolved.ok) throw new Error(`grid refused ${timeframe} at ${at}: ${resolved.refusal}`)
  return resolved.bucket
}

/** Every minute the calendar expected, offered back as if a source had delivered it. */
function settled(minutes: readonly Timestamp[]) {
  return { sourceState: 'SETTLED' as const, minuteOpenTimes: minutes }
}

function knownExpectation(calendar: SessionCalendar, target: NominalBucket) {
  const expectation = sessionExpectation(calendar, target)
  if (expectation.status !== 'KNOWN') throw new Error('fixture expected KNOWN coverage')
  return expectation
}

// ═══ A–C. The calendar refuses to exist rather than answer badly ══════════════

describe('a SessionCalendar is authored data, and invalid data is no calendar', () => {
  it('A. requires a version', () => {
    expect(
      problemsOf({
        calendarVersion: '   ',
        tradingIntervals: [{ from: WINTER.open1800, to: WINTER.close1700 }],
        coverage: [{ from: WINTER.open1800, to: WINTER.next1800 }],
      }),
    ).toContain('EMPTY_CALENDAR_VERSION')

    // A version is what makes resolution reproducible after a restart (§26), so
    // an unversioned calendar cannot be built even when everything else is sound.
    expect(SESSION_CALENDAR_PROBLEMS).toContain('EMPTY_CALENDAR_VERSION')
  })

  it('B. rejects malformed coverage', () => {
    const inverted = problemsOf({
      calendarVersion: 'v1',
      tradingIntervals: [],
      coverage: [{ from: WINTER.close1700, to: WINTER.open1800 }],
    })
    expect(inverted).toContain('MALFORMED_COVERAGE')

    const notAnInstant = problemsOf({
      calendarVersion: 'v1',
      tradingIntervals: [],
      coverage: [{ from: 'yesterday' as unknown as Timestamp, to: WINTER.close1700 }],
    })
    expect(notAnInstant).toContain('MALFORMED_COVERAGE')

    // Zero-length is malformed too: a half-open [x, x) covers no instant at all
    // and would silently claim authority over nothing.
    expect(
      problemsOf({
        calendarVersion: 'v1',
        tradingIntervals: [],
        coverage: [{ from: WINTER.open1800, to: WINTER.open1800 }],
      }),
    ).toContain('MALFORMED_COVERAGE')
  })

  it('C. rejects contradictory schedule data', () => {
    const overlappingIntervals = problemsOf({
      calendarVersion: 'v1',
      tradingIntervals: [
        { from: WINTER.open1800, to: WINTER.open1000 },
        { from: WINTER.open0200, to: WINTER.close1700 },
      ],
      coverage: [{ from: WINTER.open1800, to: WINTER.next1800 }],
    })
    expect(overlappingIntervals).toContain('OVERLAPPING_INTERVALS')

    const overlappingCoverage = problemsOf({
      calendarVersion: 'v1',
      tradingIntervals: [],
      coverage: [
        { from: WINTER.open1800, to: WINTER.open1000 },
        { from: WINTER.open0200, to: WINTER.next1800 },
      ],
    })
    expect(overlappingCoverage).toContain('OVERLAPPING_COVERAGE')

    // Trading asserted where the calendar simultaneously claims no authority.
    const uncoveredTrading = problemsOf({
      calendarVersion: 'v1',
      tradingIntervals: [{ from: WINTER.open1800, to: WINTER.close1700 }],
      coverage: [{ from: WINTER.open1800, to: WINTER.open1000 }],
    })
    expect(uncoveredTrading).toContain('INTERVAL_OUTSIDE_COVERAGE')

    // Every fault is reported, not just the first — an author fixing one refusal
    // per attempt learns one fault per attempt.
    const many = problemsOf({
      calendarVersion: '',
      tradingIntervals: [{ from: WINTER.close1700, to: WINTER.open1800 }],
      coverage: [{ from: WINTER.close1700, to: WINTER.open1800 }],
    })
    expect(many.length).toBeGreaterThanOrEqual(3)
  })

  it('touching spans are continuous, not overlapping', () => {
    // A halt that ends exactly where the next span begins is the normal shape of
    // a real schedule; half-open intervals join there with no instant between.
    const build = buildSessionCalendar({
      calendarVersion: 'v1',
      tradingIntervals: [
        { from: WINTER.open1800, to: WINTER.haltFrom },
        { from: WINTER.haltFrom, to: WINTER.close1700 },
      ],
      coverage: [
        { from: WINTER.open1800, to: WINTER.open1000 },
        { from: WINTER.open1000, to: WINTER.next1800 },
      ],
    })
    expect(build.ok).toBe(true)
  })

  it('a built calendar cannot be mutated afterwards', () => {
    expect(Object.isFrozen(NORMAL)).toBe(true)
    expect(Object.isFrozen(NORMAL.tradingIntervals)).toBe(true)
    expect(Object.isFrozen(NORMAL.tradingIntervals[0])).toBe(true)
  })
})

// ═══ D–I. Coverage, halts, closures and the two ends of a bucket ══════════════

describe('what the calendar expected inside a bucket', () => {
  it('D. answers UNKNOWN outside authoritative coverage', () => {
    const outside = bucket('4H', T('2027-06-10T15:00:00Z'))
    expect(sessionExpectation(NORMAL, outside).status).toBe('UNKNOWN')

    // Partial coverage is not partial knowledge: a bucket half-covered is UNKNOWN
    // in whole, never a shortened known list.
    const halfCovered = built(
      'fixture-half-v1',
      [[WINTER.open1800, WINTER.open0200]],
      [[WINTER.open1800, T('2026-01-15T09:00:00Z')]],
    )
    const straddling = bucket('4H', WINTER.open0200)
    expect(sessionExpectation(halfCovered, straddling).status).toBe('UNKNOWN')
  })

  it('UNKNOWN is not an empty expectation', () => {
    // The distinction the whole design turns on: "we were never told" and
    // "nothing was due" must not arrive as the same value.
    const unknown = sessionExpectation(NORMAL, bucket('4H', T('2027-06-10T15:00:00Z')))
    const closed = sessionExpectation(FULL_CLOSURE, bucket('4H', WINTER.dayAfter0200))
    expect(unknown.status).toBe('UNKNOWN')
    expect(closed.status).toBe('KNOWN')
    expect(closed.status === 'KNOWN' && closed.expectedMinuteOpenTimes).toEqual([])
  })

  it('E. a fully closed but covered bucket is KNOWN with an empty expected set', () => {
    const holiday = bucket('4H', WINTER.dayAfter0200)
    const expectation = knownExpectation(FULL_CLOSURE, holiday)
    expect(expectation.expectedMinuteOpenTimes).toEqual([])
    // Nothing traded, so the session never reached the bucket's nominal end.
    expect(expectation.effectiveTo).toBe(holiday.open)
  })

  it('F. excludes a scheduled intraday halt from the expected minutes', () => {
    const terminal = bucket('4H', WINTER.open1400)
    const expectation = knownExpectation(NORMAL, terminal)
    const minutes = expectation.expectedMinuteOpenTimes

    // 14:00 → 16:15 is 135 minutes, 16:30 → 17:00 is a further 30.
    expect(minutes).toHaveLength(165)
    expect(minutes).toContain(T('2026-01-15T21:14:00Z'))
    expect(minutes).not.toContain(WINTER.haltFrom)
    expect(minutes).not.toContain(T('2026-01-15T21:29:00Z'))
    expect(minutes).toContain(WINTER.haltTo)
  })

  it('G. a halt with trading resuming does NOT truncate the session', () => {
    const midday = bucket('4H', HALT_INSIDE.tradingIntervals[0].to)
    expect(midday.open).toBe(WINTER.open1000)

    const expectation = knownExpectation(HALT_INSIDE, midday)
    // 30 minutes removed from the middle, and the bucket still runs to its end.
    expect(expectation.expectedMinuteOpenTimes).toHaveLength(210)
    expect(expectation.effectiveTo).toBe(midday.nominalTo)
  })

  it('H. an early close with no resumption pulls effectiveTo back', () => {
    const midday = bucket('4H', WINTER.open1000)
    const expectation = knownExpectation(EARLY_CLOSE, midday)
    expect(expectation.effectiveTo).toBe(T('2026-01-15T18:00:00Z'))
    expect(expectation.effectiveTo < midday.nominalTo).toBe(true)
    expect(expectation.expectedMinuteOpenTimes).toHaveLength(180)
  })

  it('I. a normal bucket reaches its nominal end exactly', () => {
    const morning = bucket('4H', WINTER.open0200)
    const expectation = knownExpectation(NORMAL, morning)
    expect(expectation.effectiveTo).toBe(morning.nominalTo)
    expect(expectation.expectedMinuteOpenTimes).toHaveLength(240)
  })

  it('L. the expected set is half-open on both ends', () => {
    const morning = bucket('4H', WINTER.open0200)
    const minutes = knownExpectation(NORMAL, morning).expectedMinuteOpenTimes
    expect(minutes[0]).toBe(morning.open)
    expect(minutes[minutes.length - 1]).toBe(T('2026-01-15T10:59:00Z'))
    // The nominal end opens the NEXT bucket and belongs to it alone.
    expect(minutes).not.toContain(morning.nominalTo)
    expect(minutes).not.toContain(WINTER.open0600)
  })
})

// ═══ J–N. The canonical grids ════════════════════════════════════════════════

describe('the canonical 1m grid', () => {
  it('J. requires second 00 and millisecond 000', () => {
    expect(isCanonicalMinuteOpen(T('2026-01-15T07:00:00Z'))).toBe(true)
    expect(isCanonicalMinuteOpen(T('2026-01-15T07:00:00.000Z'))).toBe(true)
    expect(isCanonicalMinuteOpen(T('2026-01-15T07:00:01Z'))).toBe(false)
    expect(isCanonicalMinuteOpen(T('2026-01-15T07:00:00.500Z'))).toBe(false)
    expect(isCanonicalMinuteOpen(T('2026-01-15T07:00:30Z'))).toBe(false)
  })

  it('K. a grid-valid minute is not the same claim as an expected minute', () => {
    const haltedMinute = T('2026-01-15T21:20:00Z')
    // Perfectly well-formed as a boundary…
    expect(isCanonicalMinuteOpen(haltedMinute)).toBe(true)
    expect(isBucketOpen('1m', haltedMinute)).toBe(true)
    // …and scheduled closed. Two different questions, two different answers.
    const terminal = bucket('4H', WINTER.open1400)
    expect(knownExpectation(NORMAL, terminal).expectedMinuteOpenTimes).not.toContain(haltedMinute)
  })

  it('buckets a mid-minute instant back to its opening boundary', () => {
    const resolved = bucket('1m', T('2026-01-15T07:03:47Z'))
    expect(resolved.open).toBe(T('2026-01-15T07:03:00Z'))
    expect(resolved.nominalTo).toBe(T('2026-01-15T07:04:00Z'))
  })
})

describe('the 5m and 15m grids', () => {
  /*
   * ALIGNMENT PROVENANCE. Canonical v1.0 states no 5m/15m anchor of its own,
   * and it does not need to: §8 states that 18:00 New York is simultaneously a
   * boundary on the 1m, 5m, 15m AND 4H grids — the whole justification for
   * rolling contracts there — and §12.1 anchors the 4H grid to that same local
   * instant. A grid periodic at 5 (or 15) local minutes that contains 18:00:00
   * is uniquely the set of local minutes divisible by 5 (or 15), because 60 is
   * a multiple of both and America/New_York shifts by whole hours. The two
   * candidate readings — periodic in local time, or periodic in absolute time
   * from the anchor — therefore produce identical instants in this zone, which
   * is why the canonical text had to state an anchor for 4H and not for these.
   */
  it('M. opens 5m buckets on local minutes divisible by five', () => {
    for (const [instant, open] of [
      ['2026-01-15T07:02:00Z', '2026-01-15T07:00:00Z'],
      ['2026-01-15T07:07:59Z', '2026-01-15T07:05:00Z'],
      ['2026-01-15T07:59:00Z', '2026-01-15T07:55:00Z'],
      ['2026-07-16T14:13:00Z', '2026-07-16T14:10:00Z'],
    ] as const) {
      const resolved = bucket('5m', T(instant))
      expect(resolved.open).toBe(T(open))
      expect(localTimeAt(resolved.open).minute % 5).toBe(0)
      expect(localTimeAt(resolved.open).second).toBe(0)
    }
    // §8's fact, in both DST modes.
    expect(isBucketOpen('5m', WINTER.open1800)).toBe(true)
    expect(isBucketOpen('5m', SUMMER.open1800)).toBe(true)
  })

  it('N. opens 15m buckets on local minutes divisible by fifteen', () => {
    for (const [instant, open] of [
      ['2026-01-15T07:14:59Z', '2026-01-15T07:00:00Z'],
      ['2026-01-15T07:16:00Z', '2026-01-15T07:15:00Z'],
      ['2026-01-15T07:44:00Z', '2026-01-15T07:30:00Z'],
      ['2026-07-16T14:59:00Z', '2026-07-16T14:45:00Z'],
    ] as const) {
      const resolved = bucket('15m', T(instant))
      expect(resolved.open).toBe(T(open))
      expect(localTimeAt(resolved.open).minute % 15).toBe(0)
    }
    expect(isBucketOpen('15m', WINTER.open1800)).toBe(true)
    expect(isBucketOpen('15m', SUMMER.open1800)).toBe(true)
  })

  it('sub-hour buckets are exactly their nominal absolute length', () => {
    // §16: half-open [open, open + period). For a sub-hour timeframe the period
    // is a plain absolute duration, which is why these need no local anchor.
    for (const [timeframe, minutes] of [['1m', 1], ['5m', 5], ['15m', 15]] as const) {
      const resolved = bucket(timeframe, T('2026-01-15T07:07:00Z'))
      expect(Date.parse(resolved.nominalTo) - Date.parse(resolved.open)).toBe(minutes * MINUTE)
    }
  })
})

describe('the 4H grid', () => {
  it('O. opens exactly at 18, 22, 02, 06, 10 and 14 New York', () => {
    expect([...FOUR_HOUR_OPEN_HOURS]).toEqual([2, 6, 10, 14, 18, 22])

    const winterOpens = [
      WINTER.open1800, WINTER.open2200, WINTER.open0200,
      WINTER.open0600, WINTER.open1000, WINTER.open1400,
    ]
    for (const open of winterOpens) {
      expect(isBucketOpen('4H', open), `${open} should open a 4H bucket`).toBe(true)
      expect(localTimeAt(open).minute).toBe(0)
      expect(FOUR_HOUR_OPEN_HOURS).toContain(localTimeAt(open).hour)
    }
    expect(winterOpens.map((open) => localTimeAt(open).hour)).toEqual([18, 22, 2, 6, 10, 14])

    // And nothing between them opens one.
    for (const notAnOpen of ['2026-01-15T08:00:00Z', '2026-01-15T16:00:00Z', '2026-01-15T20:00:00Z']) {
      expect(isBucketOpen('4H', T(notAnOpen))).toBe(false)
    }
  })

  it('P. is not UTC-anchored', () => {
    /*
     * The decisive test. A UTC-anchored 4H grid opens at 00/04/08/12/16/20Z
     * always; the canonical grid opens four hours apart from 18:00 LOCAL, which
     * is 23:00Z in winter and 22:00Z in summer. If those two ever agreed, the
     * strategy's 02:00 and 10:00 opens would not be on the grid at all.
     */
    const winterOpensUtc = [WINTER.open0200, WINTER.open0600, WINTER.open1000, WINTER.open1400]
      .map((open) => new Date(Date.parse(open)).toISOString().slice(11, 16))
    expect(winterOpensUtc).toEqual(['07:00', '11:00', '15:00', '19:00'])

    const summerOpensUtc = [SUMMER.open0200, SUMMER.open0600, SUMMER.open1000, SUMMER.open1400]
      .map((open) => new Date(Date.parse(open)).toISOString().slice(11, 16))
    expect(summerOpensUtc).toEqual(['06:00', '10:00', '14:00', '18:00'])

    // Same local labels, different UTC hours. No fixed offset can produce both.
    expect(winterOpensUtc).not.toEqual(summerOpensUtc)
    for (const utc of ['2026-01-15T00:00:00Z', '2026-01-15T04:00:00Z', '2026-01-15T20:00:00Z']) {
      expect(isBucketOpen('4H', T(utc))).toBe(false)
    }
  })

  it('the 22:00 bucket carries across local midnight into 02:00', () => {
    const evening = bucket('4H', T('2026-01-15T05:30:00Z'))
    expect(evening.open).toBe(WINTER.open2200)
    expect(evening.nominalTo).toBe(WINTER.open0200)
    expect(localTimeAt(evening.open).day).toBe(14)
    expect(localTimeAt(evening.nominalTo).day).toBe(15)
  })

  it('nominal ends are the next canonical local boundary, not open plus four hours', () => {
    for (const [open, end] of [
      [WINTER.open1800, WINTER.open2200],
      [WINTER.open0200, WINTER.open0600],
      [WINTER.open1000, WINTER.open1400],
      [WINTER.open1400, WINTER.next1800],
      [SUMMER.open1000, SUMMER.open1400],
    ] as const) {
      expect(bucket('4H', open).nominalTo).toBe(end)
    }
  })
})

// ═══ Q–S. DST ════════════════════════════════════════════════════════════════

describe('DST is resolved through the zone, never through an offset', () => {
  it('Q. maps the same local boundary to different UTC instants in EST and EDT', () => {
    expect(localTimeAt(WINTER.open1800).hour).toBe(18)
    expect(localTimeAt(SUMMER.open1800).hour).toBe(18)
    // 23:00Z against 22:00Z: one hour apart, same wall-clock label.
    expect(Date.parse(WINTER.open1800) % 86_400_000).toBe(23 * 3_600_000)
    expect(Date.parse(SUMMER.open1800) % 86_400_000).toBe(22 * 3_600_000)

    const winterOffset = Date.parse(WINTER.open1800) - Date.parse(T('2026-01-14T18:00:00Z'))
    const summerOffset = Date.parse(SUMMER.open1800) - Date.parse(T('2026-07-15T18:00:00Z'))
    expect(winterOffset).toBe(5 * 3_600_000)
    expect(summerOffset).toBe(4 * 3_600_000)
  })

  it('R. the 02:00 bucket keeps its local meaning in both seasons', () => {
    const winter = bucket('4H', WINTER.open0200)
    const summer = bucket('4H', SUMMER.open0200)

    expect(localTimeAt(winter.open).hour).toBe(2)
    expect(localTimeAt(summer.open).hour).toBe(2)
    expect(localTimeAt(winter.nominalTo).hour).toBe(6)
    expect(localTimeAt(summer.nominalTo).hour).toBe(6)

    // Different absolute instants, identical canonical meaning.
    expect(winter.open).toBe(T('2026-01-15T07:00:00Z'))
    expect(summer.open).toBe(T('2026-07-16T06:00:00Z'))
    expect(isStrategyFourHourOpen(winter.open)).toBe(true)
    expect(isStrategyFourHourOpen(summer.open)).toBe(true)
  })

  it('S. the 10:00 bucket keeps its local meaning in both seasons', () => {
    const winter = bucket('4H', WINTER.open1000)
    const summer = bucket('4H', SUMMER.open1000)

    expect(localTimeAt(winter.open).hour).toBe(10)
    expect(localTimeAt(summer.open).hour).toBe(10)
    expect(winter.open).toBe(T('2026-01-15T15:00:00Z'))
    expect(summer.open).toBe(T('2026-07-16T14:00:00Z'))
    expect(localTimeAt(winter.nominalTo).hour).toBe(14)
    expect(localTimeAt(summer.nominalTo).hour).toBe(14)

    // The summer day is a real calendar with a real expectation, not a label test.
    const expectation = knownExpectation(SUMMER_NORMAL, summer)
    expect(expectation.expectedMinuteOpenTimes).toHaveLength(240)
    expect(expectation.effectiveTo).toBe(summer.nominalTo)
  })

  it('models the spring-forward gap instead of rounding through it', () => {
    // 02:00 New York does not exist on this Sunday, and 02:00 is a canonical
    // boundary. The grid says so rather than substituting 03:00.
    const missing = instantAtLocalTime({ year: 2026, month: 3, day: 8, hour: 2, minute: 0, second: 0 })
    expect(missing.kind).toBe('NONEXISTENT')

    const refused = bucketAt('4H', T('2026-03-08T08:00:00Z'))
    expect(refused.ok).toBe(false)
    expect(refused.ok === false && refused.refusal).toBe('LOCAL_BOUNDARY_DOES_NOT_EXIST')

    // The clock really does jump an hour across that instant.
    expect(localTimeAt(DST.springLastBefore).hour).toBe(1)
    expect(localTimeAt(DST.springFirstAfter).hour).toBe(3)
  })

  it('models the fall-back overlap instead of picking a side', () => {
    const twice = instantAtLocalTime({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 })
    expect(twice.kind).toBe('AMBIGUOUS')
    expect(twice.kind === 'AMBIGUOUS' && twice.earlier).toBe(T('2026-11-01T05:30:00Z'))
    expect(twice.kind === 'AMBIGUOUS' && twice.later).toBe(T('2026-11-01T06:30:00Z'))

    // Both readings carry the same local label…
    expect(localTimeAt(DST.fallFirst0100).hour).toBe(1)
    expect(localTimeAt(DST.fallSecond0100).hour).toBe(1)
    /*
     * …and yet the sub-hour bucket holding each is unambiguous, because it is
     * computed in absolute time from the instant itself. Resolving through the
     * local label would refuse a well-defined bucket for a whole hour, twice a
     * year — which is why only the 4H grid resolves through labels.
     */
    expect(bucket('15m', DST.fallFirst0100).open).toBe(DST.fallFirst0100)
    expect(bucket('15m', DST.fallSecond0100).open).toBe(DST.fallSecond0100)
  })
})

// ═══ T–Y. BarCompleteness ════════════════════════════════════════════════════

describe('BarCompleteness answers data coverage and nothing else', () => {
  it('exposes exactly the canonical vocabulary', () => {
    expect([...BAR_COMPLETENESS]).toEqual(['COMPLETE', 'PARTIAL', 'UNKNOWN'])
    expect([...OBSERVATION_SOURCE_STATES]).toEqual(['SETTLED', 'UNKNOWN'])
  })

  it('T. an empty expected set can never become complete evidence', () => {
    const holiday = bucket('4H', WINTER.dayAfter0200)
    const expectation = knownExpectation(FULL_CLOSURE, holiday)
    const evidence = evaluateBucketEvidence(holiday, expectation, settled([]))

    expect(evidence.ok).toBe(true)
    expect(evidence.ok === true && evidence.kind).toBe('NO_CANONICAL_CANDLE')
    /*
     * §18.1 enforced structurally: the variant carries no `completeness` field
     * at all, so "every member of the empty set was present" has nowhere to be
     * written down. Vacuous truth cannot be argued into a field that does not
     * exist.
     */
    expect(evidence).not.toHaveProperty('completeness')
    expect(JSON.stringify(evidence)).not.toContain('COMPLETE')
  })

  it('U. is COMPLETE when every expected minute arrived and the source settled', () => {
    const morning = bucket('4H', WINTER.open0200)
    const expectation = knownExpectation(NORMAL, morning)
    const evidence = evaluateBucketEvidence(morning, expectation, settled(expectation.expectedMinuteOpenTimes))

    expect(evidence.ok === true && evidence.kind).toBe('ASSESSED')
    expect(evidence.ok === true && evidence.kind === 'ASSESSED' && evidence.completeness).toBe('COMPLETE')
    expect(evidence.ok === true && evidence.kind === 'ASSESSED' && evidence.sessionTruncated).toBe(false)
  })

  it('V. is PARTIAL when a single expected minute is missing', () => {
    const morning = bucket('4H', WINTER.open0200)
    const expectation = knownExpectation(NORMAL, morning)
    const short = expectation.expectedMinuteOpenTimes.slice(0, -1)
    const evidence = evaluateBucketEvidence(morning, expectation, settled(short))

    expect(evidence.ok === true && evidence.kind === 'ASSESSED' && evidence.completeness).toBe('PARTIAL')
  })

  it('extra observations cannot rescue an incomplete bucket', () => {
    const terminal = bucket('4H', WINTER.open1400)
    const expectation = knownExpectation(NORMAL, terminal)
    // Drop a real expected minute, then add the same COUNT back from minutes the
    // calendar never expected — the halted ones.
    const tampered = [
      ...expectation.expectedMinuteOpenTimes.slice(1),
      T('2026-01-15T21:20:00Z'),
    ]
    const evidence = evaluateBucketEvidence(terminal, expectation, settled(tampered))
    expect(evidence.ok === true && evidence.kind === 'ASSESSED' && evidence.completeness).toBe('PARTIAL')
  })

  it('W. is UNKNOWN when calendar coverage is unknown', () => {
    const outside = bucket('4H', T('2027-06-10T15:00:00Z'))
    const expectation = sessionExpectation(NORMAL, outside)
    const evidence = evaluateBucketEvidence(outside, expectation, settled([]))
    expect(evidence.ok === true && evidence.kind).toBe('UNKNOWN')
    expect(evidence.ok === true && evidence.kind === 'UNKNOWN' && evidence.completeness).toBe('UNKNOWN')
  })

  it('X. is UNKNOWN when the source state is unknown, however full the set looks', () => {
    const morning = bucket('4H', WINTER.open0200)
    const expectation = knownExpectation(NORMAL, morning)
    const evidence = evaluateBucketEvidence(morning, expectation, {
      sourceState: 'UNKNOWN',
      minuteOpenTimes: expectation.expectedMinuteOpenTimes,
    })
    // Every expected minute is present. It still cannot be COMPLETE: an array is
    // not proof that a source finished delivering.
    expect(evidence.ok === true && evidence.kind).toBe('UNKNOWN')
  })

  it('Y. completeness and session truncation are independent facts', () => {
    const midday = bucket('4H', WINTER.open1000)
    const expectation = knownExpectation(EARLY_CLOSE, midday)
    const evidence = evaluateBucketEvidence(midday, expectation, settled(expectation.expectedMinuteOpenTimes))

    // §19's own example: genuinely COMPLETE data coverage, genuinely truncated.
    expect(evidence.ok === true && evidence.kind === 'ASSESSED' && evidence.completeness).toBe('COMPLETE')
    expect(evidence.ok === true && evidence.kind === 'ASSESSED' && evidence.sessionTruncated).toBe(true)
    expect(evidence.ok === true && evidence.kind === 'ASSESSED' && evidence.effectiveTo).not.toBe(midday.nominalTo)

    // And the reverse pairing exists too: not truncated, not complete.
    const normalMorning = bucket('4H', WINTER.open0200)
    const normal = knownExpectation(NORMAL, normalMorning)
    const partial = evaluateBucketEvidence(
      normalMorning,
      normal,
      settled(normal.expectedMinuteOpenTimes.slice(0, 10)),
    )
    expect(partial.ok === true && partial.kind === 'ASSESSED' && partial.completeness).toBe('PARTIAL')
    expect(partial.ok === true && partial.kind === 'ASSESSED' && partial.sessionTruncated).toBe(false)
  })

  it('refuses an inadmissible observation set rather than answering UNKNOWN', () => {
    const morning = bucket('4H', WINTER.open0200)
    const expectation = knownExpectation(NORMAL, morning)
    const minutes = expectation.expectedMinuteOpenTimes

    const duplicated = evaluateBucketEvidence(morning, expectation, settled([minutes[0], minutes[0]]))
    expect(duplicated.ok).toBe(false)
    expect(duplicated.ok === false && duplicated.problem).toBe('DUPLICATE_OBSERVED_MINUTE')

    const misaligned = evaluateBucketEvidence(
      morning,
      expectation,
      settled([T('2026-01-15T07:00:30Z')]),
    )
    expect(misaligned.ok === false && misaligned.problem).toBe('NON_CANONICAL_MINUTE_OPEN')

    const foreign = evaluateBucketEvidence(morning, expectation, settled([WINTER.open1000]))
    expect(foreign.ok === false && foreign.problem).toBe('OBSERVATION_OUTSIDE_BUCKET')
  })
})

// ═══ Z–AC. The 4H strategy precondition ══════════════════════════════════════

describe('the 4H strategy precondition', () => {
  const standingFor = (calendar: SessionCalendar, open: Timestamp, keep = Number.POSITIVE_INFINITY) => {
    const target = bucket('4H', open)
    const expectation = knownExpectation(calendar, target)
    const evidence = evaluateBucketEvidence(
      target,
      expectation,
      settled(expectation.expectedMinuteOpenTimes.slice(0, keep)),
    )
    return fourHourStrategyStanding(target, evidence)
  }

  it('Z. 02:00 complete and full-length is eligible', () => {
    expect(standingFor(NORMAL, WINTER.open0200)).toBe('ELIGIBLE')
    expect(standingFor(SUMMER_NORMAL, SUMMER.open0200)).toBe('ELIGIBLE')
  })

  it('AA. 10:00 complete and full-length is eligible', () => {
    expect(standingFor(NORMAL, WINTER.open1000)).toBe('ELIGIBLE')
    expect(standingFor(SUMMER_NORMAL, SUMMER.open1000)).toBe('ELIGIBLE')
  })

  it('AB. 02:00 and 10:00 complete but truncated are INELIGIBLE', () => {
    // EARLY_CLOSE ends at 13:00 New York: the 10:00 bucket has every minute it
    // was ever going to have, and still never reached 14:00.
    const midday = bucket('4H', WINTER.open1000)
    const expectation = knownExpectation(EARLY_CLOSE, midday)
    const evidence = evaluateBucketEvidence(midday, expectation, settled(expectation.expectedMinuteOpenTimes))
    expect(evidence.ok === true && evidence.kind === 'ASSESSED' && evidence.completeness).toBe('COMPLETE')
    expect(fourHourStrategyStanding(midday, evidence)).toBe('INELIGIBLE')

    // A truncated 02:00 fails the same way.
    const cut = built(
      'fixture-cut-0200-v1',
      [[WINTER.open1800, T('2026-01-15T09:00:00Z')]],
      FULL_COVERAGE,
    )
    const morning = bucket('4H', WINTER.open0200)
    const cutExpectation = knownExpectation(cut, morning)
    const cutEvidence = evaluateBucketEvidence(morning, cutExpectation, settled(cutExpectation.expectedMinuteOpenTimes))
    expect(cutEvidence.ok === true && cutEvidence.kind === 'ASSESSED' && cutEvidence.completeness).toBe('COMPLETE')
    expect(fourHourStrategyStanding(morning, cutEvidence)).toBe('INELIGIBLE')
  })

  it('a partial or unknown 02:00 is also ineligible', () => {
    expect(standingFor(NORMAL, WINTER.open0200, 100)).toBe('INELIGIBLE')

    const morning = bucket('4H', WINTER.open0200)
    const unknownSource = evaluateBucketEvidence(morning, knownExpectation(NORMAL, morning), {
      sourceState: 'UNKNOWN',
      minuteOpenTimes: [],
    })
    expect(fourHourStrategyStanding(morning, unknownSource)).toBe('INELIGIBLE')
  })

  it('AC. the 14:00 bucket is never canonical 4H strategy evidence', () => {
    const terminal = bucket('4H', WINTER.open1400)
    const expectation = knownExpectation(NORMAL, terminal)
    const evidence = evaluateBucketEvidence(terminal, expectation, settled(expectation.expectedMinuteOpenTimes))

    // Real, complete market data for the shortened terminal session (§12.2)…
    expect(evidence.ok === true && evidence.kind === 'ASSESSED' && evidence.completeness).toBe('COMPLETE')
    expect(evidence.ok === true && evidence.kind === 'ASSESSED' && evidence.sessionTruncated).toBe(true)
    // …and not a failed strategy bucket. A third answer, not a false one.
    expect(fourHourStrategyStanding(terminal, evidence)).toBe('NOT_STRATEGY_RELEVANT')
    expect(isStrategyFourHourOpen(WINTER.open1400)).toBe(false)
  })

  it('the other canonical opens are not strategy-relevant either', () => {
    for (const open of [WINTER.open1800, WINTER.open2200, WINTER.open0600]) {
      expect(isStrategyFourHourOpen(open), `${open}`).toBe(false)
    }
    expect(isStrategyFourHourOpen(WINTER.open0200)).toBe(true)
    expect(isStrategyFourHourOpen(WINTER.open1000)).toBe(true)
  })

  it('a sub-hour bucket is never strategy-relevant, whatever its local hour', () => {
    // 02:00 on a 15m grid is still 02:00 — and still not a canonical 4H open.
    const fifteen = bucket('15m', WINTER.open0200)
    const expectation = knownExpectation(NORMAL, fifteen)
    const evidence = evaluateBucketEvidence(fifteen, expectation, settled(expectation.expectedMinuteOpenTimes))
    expect(evidence.ok === true && evidence.kind === 'ASSESSED' && evidence.completeness).toBe('COMPLETE')
    expect(fourHourStrategyStanding(fifteen, evidence)).toBe('NOT_STRATEGY_RELEVANT')
  })
})

// ═══ Determinism ═════════════════════════════════════════════════════════════

describe('the same inputs always produce the same answer', () => {
  it('repeats identically, and returns frozen values', () => {
    const morning = bucket('4H', WINTER.open0200)
    const first = knownExpectation(NORMAL, morning)
    const second = knownExpectation(NORMAL, morning)

    expect(second).toEqual(first)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.expectedMinuteOpenTimes)).toBe(true)

    const evidence = evaluateBucketEvidence(morning, first, settled(first.expectedMinuteOpenTimes))
    expect(Object.isFrozen(evidence)).toBe(true)
    expect(evaluateBucketEvidence(morning, second, settled(second.expectedMinuteOpenTimes))).toEqual(evidence)
  })

  it('never consults the machine timezone', () => {
    /*
     * The decisive check for a host running outside New York. This suite runs on
     * whatever zone the machine is configured for, and every answer above is
     * asserted in absolute UTC instants — so a formatter that had silently
     * fallen back to the host zone would move them.
     */
    const hostZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(typeof hostZone).toBe('string')
    expect(localTimeAt(WINTER.open0200).hour).toBe(2)
    expect(localTimeAt(SUMMER.open0200).hour).toBe(2)
  })
})
