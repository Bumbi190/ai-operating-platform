/**
 * Omnira Trading — the versioned SessionCalendar.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §17 (SessionCalendar)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §18 (förväntad frånvaro)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §19 (nominell kontra effektiv)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §25 (fail-closed)
 *
 * AUTHORED FACTS, NOT A SCHEDULE ENGINE
 * ─────────────────────────────────────
 * §17 makes this Omnira-owned and versioned, drawn FROM authoritative CME
 * information — it does not compute that information. There is no holiday
 * table, no weekday rule, no "third Monday in January", no 17:00/18:00 default.
 * The concrete year data is a separately versioned operational artefact with
 * its own integrity check, and §17 says in as many words that it is not written
 * into the canonical text. It is not written into this module either.
 *
 * WHY TRADABLE INTERVALS AND NOT LABELLED STATES
 * ──────────────────────────────────────────────
 * The calendar stores explicit absolute intervals during which trading was
 * expected. A maintenance window, a holiday and a scheduled halt are then all
 * the same thing — a GAP between tradable intervals — and the question "was
 * this minute expected to trade?" is answered by looking, not by classifying.
 *
 * Storing `'MAINTENANCE'` or `'HOLIDAY'` as runtime states would mean deciding
 * which labels imply closure, and that decision would live in code rather than
 * in the authored data. Labels may still be carried as provenance; no decision
 * here reads one.
 *
 * NO TIMEZONE LOGIC LIVES HERE
 * ────────────────────────────
 * Every fact is an absolute instant, so this module needs no zone at all. Wall
 * clocks belong to the grid; the calendar only intersects intervals. That is
 * why a DST bug cannot originate in this file.
 *
 * COVERAGE IS EXPLICIT, AND SILENCE IS UNKNOWN
 * ────────────────────────────────────────────
 * §17: missing authoritative coverage ⇒ UNKNOWN, never an assumption. The last
 * authored session does NOT extend to infinity, a weekend is not inferred from
 * a weekday, and an absent Thursday is not "probably normal". UNKNOWN means the
 * calendar was never claimed to know — it does NOT mean no trading was expected.
 */

import { isTimestamp, toEpochMs, type Timestamp } from '../time'

/**
 * A span during which trading WAS expected. Half-open `[from, to)`.
 *
 * Every other interval in the Trading tree is half-open, and the canonical
 * candle interval is too (§16), so a minute opening exactly at `to` belongs to
 * the next span rather than to two of them.
 */
export interface TradingInterval {
  readonly from: Timestamp
  readonly to: Timestamp
}

/** A span the calendar CLAIMS AUTHORITY OVER. Half-open `[from, to)`. */
export interface SessionCoverage {
  readonly from: Timestamp
  readonly to: Timestamp
}

export interface SessionCalendarInput {
  readonly calendarVersion: string
  readonly tradingIntervals: readonly TradingInterval[]
  readonly coverage: readonly SessionCoverage[]
}

export interface SessionCalendar {
  readonly calendarVersion: string
  /** Validated, ordered and frozen. A calendar cannot change after building. */
  readonly tradingIntervals: readonly TradingInterval[]
  readonly coverage: readonly SessionCoverage[]
}

/**
 * Why a calendar could not be built.
 *
 * AUTHORING failures, every one. Nothing downstream branches on them and none
 * of them says anything about a market.
 */
export const SESSION_CALENDAR_PROBLEMS = [
  'EMPTY_CALENDAR_VERSION',
  'MALFORMED_INTERVAL',
  'OVERLAPPING_INTERVALS',
  'MALFORMED_COVERAGE',
  'OVERLAPPING_COVERAGE',
  'INTERVAL_OUTSIDE_COVERAGE',
] as const
export type SessionCalendarProblemCode = (typeof SESSION_CALENDAR_PROBLEMS)[number]

export interface SessionCalendarProblem {
  readonly code: SessionCalendarProblemCode
  /** Operator and review text. Never decision input. */
  readonly detail: string
}

export type SessionCalendarBuild =
  | { readonly ok: true; readonly calendar: SessionCalendar }
  | { readonly ok: false; readonly problems: readonly SessionCalendarProblem[] }

const isNonBlank = (raw: unknown): raw is string => typeof raw === 'string' && raw.trim().length > 0

/** Half-open overlap. Touching endpoints do not overlap; that is the point of `[from, to)`. */
function overlaps(a: { from: Timestamp; to: Timestamp }, b: { from: Timestamp; to: Timestamp }): boolean {
  return toEpochMs(a.from) < toEpochMs(b.to) && toEpochMs(b.from) < toEpochMs(a.to)
}

/**
 * Whether a span lies entirely inside the UNION of some coverage windows.
 *
 * The union, not any single window. Two windows that merely touch
 * (`a.to === b.from`) form one continuous covered span — half-open intervals
 * join exactly there, with no instant falling between them — so a span crossing
 * that seam is fully covered and must not be reported otherwise.
 *
 * One forward walk over windows sorted by start. Exported because the build
 * validation and the per-bucket coverage question are the same question, and a
 * second implementation is a second thing to get wrong.
 */
export function spansCoverage(
  coverage: readonly SessionCoverage[],
  fromMs: number,
  toMs: number,
): boolean {
  let reached = fromMs
  for (const window of [...coverage].sort((a, b) => toEpochMs(a.from) - toEpochMs(b.from))) {
    if (reached >= toMs) break
    if (toEpochMs(window.from) > reached) break
    reached = Math.max(reached, toEpochMs(window.to))
  }
  return reached >= toMs
}

/**
 * Build a calendar, or refuse with every problem found.
 *
 * ALL PROBLEMS ARE COLLECTED. An author fixing a calendar one refusal at a time
 * learns one fault per attempt; the whole list is what makes a broken calendar
 * cheap to correct.
 *
 * Instants are compared through `toEpochMs`, never as text. `Timestamp` permits
 * an optional millisecond field, so `…T17:00:00Z` and `…T17:00:00.500Z` order
 * WRONG as strings — '.' sorts before 'Z' — and a text comparison would put the
 * later instant first.
 */
export function buildSessionCalendar(input: SessionCalendarInput): SessionCalendarBuild {
  const problems: SessionCalendarProblem[] = []
  const fail = (code: SessionCalendarProblemCode, detail: string): void => {
    problems.push({ code, detail })
  }

  if (!isNonBlank(input.calendarVersion)) {
    fail('EMPTY_CALENDAR_VERSION', 'calendarVersion must be a non-blank string')
  }

  const wellFormed = <T extends { from: Timestamp; to: Timestamp }>(
    spans: readonly T[],
    label: string,
    malformed: SessionCalendarProblemCode,
  ): T[] => {
    const kept: T[] = []
    for (const [index, span] of spans.entries()) {
      const at = `${label}[${index}]`
      if (!isTimestamp(span.from) || !isTimestamp(span.to)) {
        fail(malformed, `${at}: from/to must be canonical Timestamps`)
        continue
      }
      if (toEpochMs(span.from) >= toEpochMs(span.to)) {
        fail(malformed, `${at}: from must be strictly before to`)
        continue
      }
      kept.push(span)
    }
    return kept
  }

  const intervals = wellFormed(input.tradingIntervals, 'tradingIntervals', 'MALFORMED_INTERVAL')
  const windows = wellFormed(input.coverage, 'coverage', 'MALFORMED_COVERAGE')

  /*
   * Two tradable intervals that overlap are contradictory authored data: the
   * same minute is claimed by two spans, and no reading of "was trading
   * expected" can prefer one. Ambiguity is refused rather than resolved
   * arbitrarily. Adjacent spans that merely touch are fine and common — a halt
   * that ends exactly where the next span begins.
   */
  for (const [index, a] of intervals.entries()) {
    for (const b of intervals.slice(index + 1)) {
      if (overlaps(a, b)) {
        fail('OVERLAPPING_INTERVALS', `tradingIntervals ${a.from}..${a.to} overlaps ${b.from}..${b.to}`)
      }
    }
  }

  for (const [index, a] of windows.entries()) {
    for (const b of windows.slice(index + 1)) {
      if (overlaps(a, b)) {
        fail('OVERLAPPING_COVERAGE', `coverage ${a.from}..${a.to} overlaps ${b.from}..${b.to}`)
      }
    }
  }

  /*
   * A tradable interval outside declared coverage asserts trading in a span the
   * calendar simultaneously says it knows nothing about. Left standing, that
   * contradiction produces a bucket which is UNKNOWN by coverage yet has
   * expected minutes underneath it — so the calendar refuses to exist instead.
   */
  for (const interval of intervals) {
    if (!spansCoverage(windows, toEpochMs(interval.from), toEpochMs(interval.to))) {
      fail(
        'INTERVAL_OUTSIDE_COVERAGE',
        `tradingIntervals ${interval.from}..${interval.to} is not inside any declared coverage window`,
      )
    }
  }

  if (problems.length > 0) return { ok: false, problems: Object.freeze(problems) }

  const byStart = <T extends { from: Timestamp }>(a: T, b: T): number => toEpochMs(a.from) - toEpochMs(b.from)

  return {
    ok: true,
    calendar: Object.freeze({
      calendarVersion: input.calendarVersion,
      tradingIntervals: Object.freeze([...intervals].sort(byStart).map((span) => Object.freeze({ ...span }))),
      coverage: Object.freeze([...windows].sort(byStart).map((span) => Object.freeze({ ...span }))),
    }),
  }
}
