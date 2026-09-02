/**
 * Omnira Trading — the canonical time grid.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §8  (18:00 is a boundary on every grid)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §11 (kanoniskt basrutnät — 1m)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §12.1 (4H-rutnätet)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §16 (halvöppet [open, open + period))
 *  - Market Data & Contract Lifecycle Canonical v1.0 §19 (nominell kontra effektiv bucket)
 *
 * OMNIRA OWNS THIS GRID. A PROVIDER DOES NOT.
 * ───────────────────────────────────────────
 * §11 is explicit: Omnira defines the expected 1m grid, and a provider's native
 * bar is an OBSERVATION validated against it. Nothing here reads, imports or
 * accommodates a provider convention.
 *
 * TWO DIFFERENT QUESTIONS, KEPT APART
 * ───────────────────────────────────
 * "Is this instant a valid boundary?" is answered here. "Was trading expected
 * there?" is answered by the `SessionCalendar`. A minute can be perfectly
 * grid-valid and scheduled closed, and merging the two would make a holiday
 * look like malformed data.
 *
 * WHY 4H IS NOT `open + 4 * 60 * 60 * 1000`
 * ─────────────────────────────────────────
 * §12.1 anchors the 4H grid at 18:00 America/New_York, in WALL-CLOCK terms,
 * because that is the only anchor containing the strategy's two locked opens,
 * 02:00 and 10:00. A UTC-anchored grid contains neither, in either DST mode.
 * So a 4H bucket's end is the NEXT CANONICAL LOCAL BOUNDARY, and on a DST day
 * that is 3 or 5 absolute hours away, not 4.
 *
 * The sub-hour grids are the opposite case, and deliberately so — see the note
 * on `bucketAt`.
 *
 * IT REFUSES RATHER THAN INVENTS
 * ──────────────────────────────
 * On the spring-forward Sunday there is no 02:00 in New York, and 02:00 is a
 * canonical boundary. The grid reports that it has no such boundary instead of
 * quietly substituting 03:00. Canonical v1.0 §27.6 notes that today's schedule
 * keeps every such Sunday inside the weekend closure — and says in the same
 * breath that the code may not rely on it.
 *
 *     GATE-08C-2A DST-BOUNDARY GAP — OPEN / FAIL-CLOSED IMPLEMENTATION
 *
 * The refusal is PROVISIONAL SAFETY BEHAVIOUR, not canonical policy: no
 * canonical text says what the 4H grid should do when its own local anchor has
 * no instant. It must be resolved before GATE-08 may be declared fully closed,
 * and before operational SessionCalendar coverage may claim an exceptional
 * session whose strategy-relevant processing depends on such a boundary.
 * Do not read the refusal as the question being settled.
 *
 * WHAT IS CANON HERE, AND WHAT IS DERIVED
 * ───────────────────────────────────────
 * Canonical, verbatim: the 1m grid (§11), the 4H anchor and its six local opens
 * (§12.1), half-open intervals (§16), and §8's statement that 18:00 New York is
 * simultaneously a boundary on the 1m, 5m, 15m AND 4H grids.
 *
 * DERIVED, not quoted: the 5m and 15m phase below. No canonical text states an
 * anchor for them. It follows from §8 rather than being written down — a grid
 * periodic at 5 (or 15) minutes that contains local minute 00 has exactly the
 * minute-mod-5 (or mod-15) phase, and New York's whole-hour DST shifts preserve
 * it. That is also why the canon had to state an anchor for 4H and not for
 * these: 4H is the only one of the three where the local and absolute readings
 * diverge. A future reviewer should treat this paragraph as the boundary
 * between quoted canon and sound inference.
 */

import { toEpochMs, type Timestamp } from '../time'
import type { MarketTimeframe } from '../market-timeframe'
import {
  instantAtLocalTime,
  localTimeAt,
  MS_PER_MINUTE,
  shiftLocalDay,
  timestampAt,
  type LocalTime,
} from './zone'

const MS_PER_SECOND = 1_000

/**
 * The canonical 4H opens, in America/New_York wall-clock hours.
 *
 * Ascending within a local calendar day, which is the order the containing-open
 * search below depends on. 18:00 is the anchor (§12.1); the rest follow from it
 * at four-hour local spacing.
 */
export const FOUR_HOUR_OPEN_HOURS = [2, 6, 10, 14, 18, 22] as const
export type FourHourOpenHour = (typeof FOUR_HOUR_OPEN_HOURS)[number]

/**
 * Nominal length of the sub-hour timeframes, in whole minutes.
 *
 * 4H is absent on purpose. Its length is not a constant: it is whatever the
 * distance to the next canonical local boundary happens to be, so writing 240
 * here would invite exactly the arithmetic §12.1 rules out.
 */
const SUB_HOUR_MINUTES = { '1m': 1, '5m': 5, '15m': 15 } as const
/* 5m and 15m phase: DERIVED from §8, not quoted. See the module header. */
type SubHourTimeframe = keyof typeof SUB_HOUR_MINUTES

function isSubHour(timeframe: MarketTimeframe): timeframe is SubHourTimeframe {
  return timeframe !== '4H'
}

/**
 * Whether an instant is a valid canonical 1m boundary.
 *
 * Seconds and milliseconds must both be zero, in ABSOLUTE time. Every zone
 * Omnira uses is offset by a whole number of minutes, so a valid absolute
 * minute boundary is a valid local one — but the absolute test is the one that
 * cannot be argued with.
 *
 * This says nothing whatsoever about whether the market was open. See §11 and
 * the module header.
 */
export function isCanonicalMinuteOpen(at: Timestamp): boolean {
  return toEpochMs(at) % MS_PER_MINUTE === 0
}

/** Why the grid could not name a boundary. */
export const GRID_REFUSALS = [
  'NOT_A_CANONICAL_BOUNDARY',
  'LOCAL_BOUNDARY_DOES_NOT_EXIST',
  'LOCAL_BOUNDARY_AMBIGUOUS',
] as const
export type GridRefusal = (typeof GRID_REFUSALS)[number]

/**
 * A bucket, as the grid sees it: where it opens and where it nominally ends.
 *
 * `nominalTo` is the grid's answer alone. What the SESSION did inside the
 * bucket is `effectiveTo`, and that is the `SessionCalendar`'s answer — §19
 * keeps the two as separate machine-readable facts and so does this type.
 */
export interface NominalBucket {
  readonly timeframe: MarketTimeframe
  /** Inclusive. */
  readonly open: Timestamp
  /** Exclusive. */
  readonly nominalTo: Timestamp
}

export type BucketResolution =
  | { readonly ok: true; readonly bucket: NominalBucket }
  | { readonly ok: false; readonly refusal: GridRefusal }

const refuse = (refusal: GridRefusal): BucketResolution => Object.freeze({ ok: false, refusal })

/** The sole instant a canonical local boundary names, or a refusal. */
function boundaryInstant(local: LocalTime): { ok: true; at: Timestamp } | { ok: false; refusal: GridRefusal } {
  const resolved = instantAtLocalTime(local)
  if (resolved.kind === 'NONEXISTENT') return { ok: false, refusal: 'LOCAL_BOUNDARY_DOES_NOT_EXIST' }
  if (resolved.kind === 'AMBIGUOUS') return { ok: false, refusal: 'LOCAL_BOUNDARY_AMBIGUOUS' }
  return { ok: true, at: resolved.instant }
}

/** The canonical 4H open hour governing a local hour, and how many days back it sits. */
function containingFourHourOpen(hour: number): { readonly hour: FourHourOpenHour; readonly dayShift: number } {
  for (let index = FOUR_HOUR_OPEN_HOURS.length - 1; index >= 0; index -= 1) {
    const candidate = FOUR_HOUR_OPEN_HOURS[index]
    if (hour >= candidate) return { hour: candidate, dayShift: 0 }
  }
  // Local 00:00 and 01:00 belong to the 22:00 bucket that opened yesterday.
  return { hour: FOUR_HOUR_OPEN_HOURS[FOUR_HOUR_OPEN_HOURS.length - 1], dayShift: -1 }
}

/** The canonical 4H open that follows a given one. */
function nextFourHourOpen(hour: FourHourOpenHour): { readonly hour: FourHourOpenHour; readonly dayShift: number } {
  const index = FOUR_HOUR_OPEN_HOURS.indexOf(hour)
  if (index === FOUR_HOUR_OPEN_HOURS.length - 1) return { hour: FOUR_HOUR_OPEN_HOURS[0], dayShift: 1 }
  return { hour: FOUR_HOUR_OPEN_HOURS[index + 1], dayShift: 0 }
}

function fourHourBucketAt(at: Timestamp): BucketResolution {
  const local = localTimeAt(at)
  const opening = containingFourHourOpen(local.hour)
  const closing = nextFourHourOpen(opening.hour)

  const openLocal = shiftLocalDay({ ...local, hour: opening.hour, minute: 0, second: 0 }, opening.dayShift)
  const open = boundaryInstant(openLocal)
  if (!open.ok) return refuse(open.refusal)

  const endLocal = shiftLocalDay({ ...openLocal, hour: closing.hour }, closing.dayShift)
  const end = boundaryInstant(endLocal)
  if (!end.ok) return refuse(end.refusal)

  return Object.freeze({
    ok: true,
    bucket: Object.freeze({ timeframe: '4H' as const, open: open.at, nominalTo: end.at }),
  })
}

function subHourBucketAt(timeframe: SubHourTimeframe, at: Timestamp): BucketResolution {
  const period = SUB_HOUR_MINUTES[timeframe]
  const atMs = toEpochMs(at)
  const local = localTimeAt(at)

  /*
   * Computed in ABSOLUTE time from the instant itself, so it stays inside the
   * instant's own offset regime.
   *
   * This is the deliberate opposite of the 4H case. On the fall-back Sunday the
   * local label 01:30 names two different instants — but the 5m bucket holding
   * a given instant is not ambiguous at all, and resolving through the label
   * would refuse a well-defined bucket for a whole hour, twice a year.
   *
   * The local reading supplies only the PHASE. Canonical v1.0's zone is offset
   * by whole hours, so a local minute and an absolute minute agree; the phase
   * is verified below rather than assumed, and a zone where that ever stopped
   * holding would refuse instead of silently mis-bucketing.
   */
  const openMs =
    atMs -
    (atMs % MS_PER_SECOND) -
    local.second * MS_PER_SECOND -
    (local.minute % period) * MS_PER_MINUTE

  const openLocal = localTimeAt(timestampAt(openMs))
  if (openLocal.second !== 0 || openLocal.minute % period !== 0) return refuse('NOT_A_CANONICAL_BOUNDARY')

  /*
   * §16 fixes the interval as half-open `[open, open + period)`, and for a
   * sub-hour timeframe that period is a plain absolute duration. A 15m bucket
   * that happens to straddle a spring-forward transition is still 15 minutes
   * long; only its local end-label jumps, which is exactly what the canonical
   * text describes.
   */
  return Object.freeze({
    ok: true,
    bucket: Object.freeze({
      timeframe,
      open: timestampAt(openMs),
      nominalTo: timestampAt(openMs + period * MS_PER_MINUTE),
    }),
  })
}

/**
 * The canonical bucket of `timeframe` containing `at`.
 *
 * Total over instants: every instant is inside exactly one bucket per
 * timeframe, or the grid refuses because the canonical local boundary that
 * would open it does not exist.
 */
export function bucketAt(timeframe: MarketTimeframe, at: Timestamp): BucketResolution {
  return isSubHour(timeframe) ? subHourBucketAt(timeframe, at) : fourHourBucketAt(at)
}

/**
 * Whether an instant is itself a canonical bucket open for a timeframe.
 *
 * Derived from `bucketAt` rather than re-deriving the boundary rule, so the two
 * answers cannot drift apart.
 */
export function isBucketOpen(timeframe: MarketTimeframe, at: Timestamp): boolean {
  const resolved = bucketAt(timeframe, at)
  /*
   * Compared as instants, never as text. `Timestamp` permits an optional
   * millisecond field, so `…T18:00:00Z` and `…T18:00:00.000Z` are the same
   * instant written two ways and a string comparison would call one of them a
   * non-boundary.
   */
  return resolved.ok && toEpochMs(resolved.bucket.open) === toEpochMs(at)
}
