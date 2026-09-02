/**
 * Omnira Trading — BarCompleteness, a DATA-COVERAGE answer.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §18 (BAR_COMPLETENESS)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §18.1 (tom förväntansmängd)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §19 (sessionTruncated)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §25 (fail-closed)
 *
 * WHAT QUESTION THIS ANSWERS
 * ──────────────────────────
 * "Did every observation the calendar expected actually arrive?" — and nothing
 * else. §18 is explicit that it does NOT answer whether the bucket spanned its
 * full nominal timeframe length. That is `sessionTruncated`, derived from two
 * separately stored facts, and the two are never merged into one enum. A
 * shortened trading day can produce a bucket that is genuinely COMPLETE and
 * genuinely truncated at the same time.
 *
 * NOR IS IT `HISTORY_COMPLETENESS`
 * ────────────────────────────────
 * That vocabulary (`COMPLETE | TRUNCATED | UNKNOWN`) describes a WINDOW cut off
 * at one end during navigation. This one describes a BUCKET measured against an
 * expectation. Sharing the type would let a paging state answer a market-data
 * question, so they stay separate — as §18 requires by name.
 *
 * AN EMPTY EXPECTATION IS NOT A SATISFIED ONE
 * ───────────────────────────────────────────
 * §18.1: when the calendar expected no minutes, no canonical candle is emitted,
 * and the bucket must NOT become COMPLETE on the grounds that every member of
 * the empty set was present. That is enforced STRUCTURALLY here rather than by
 * a comparison: the empty case returns a variant that carries no `completeness`
 * field at all, so no caller can read COMPLETE off it. Vacuous truth cannot be
 * argued into a type that does not exist.
 *
 * A FINITE ARRAY IS NOT A FINISHED DELIVERY
 * ─────────────────────────────────────────
 * §18 admits UNKNOWN when SOURCE STATE is insufficient, and an array of
 * observations proves only what has arrived so far. A source still paging, still
 * subscribed, or of unknown disposition may yet deliver the very minute whose
 * absence would make this PARTIAL — and, worse, may already have delivered
 * enough to look COMPLETE by accident. So the caller states the source state
 * explicitly; length is never read as evidence of completion.
 *
 * NO OHLCV. NO PRICES. NO VOLUME.
 * ───────────────────────────────
 * Only minute OPENING INSTANTS enter here. Aggregation is GATE-08C-2B and this
 * module must stay usable without it.
 */

import { toEpochMs, type Timestamp } from '../time'
import type { NominalBucket } from './grid'
import type { SessionExpectation } from './expectation'

/** §18's three-value vocabulary. Deliberately not `HISTORY_COMPLETENESS`. */
export const BAR_COMPLETENESS = ['COMPLETE', 'PARTIAL', 'UNKNOWN'] as const
export type BarCompleteness = (typeof BAR_COMPLETENESS)[number]

/**
 * Whether the observation set is finished enough to judge.
 *
 * Two values, narrowly. SETTLED is the caller asserting that the source has
 * delivered everything it is going to for this bucket; UNKNOWN is every other
 * disposition. A richer taxonomy would invite branching on distinctions that
 * carry the same obligation — anything short of settled cannot support a
 * completeness verdict at all.
 */
export const OBSERVATION_SOURCE_STATES = ['SETTLED', 'UNKNOWN'] as const
export type ObservationSourceState = (typeof OBSERVATION_SOURCE_STATES)[number]

export interface ObservedMinutes {
  readonly sourceState: ObservationSourceState
  /** Accepted canonical 1m opening instants. Opening instants only — §16. */
  readonly minuteOpenTimes: readonly Timestamp[]
}

/**
 * Why an observation set was not admissible.
 *
 * These are INPUT faults, not knowledge states. A caller that passed the wrong
 * bucket's observations, or a set carrying a misaligned instant, has asked a
 * question this function cannot answer — and answering UNKNOWN would hide a
 * caller bug inside a legitimate market-data state.
 */
export const COMPLETENESS_PROBLEMS = [
  'NON_CANONICAL_MINUTE_OPEN',
  'DUPLICATE_OBSERVED_MINUTE',
  'OBSERVATION_OUTSIDE_BUCKET',
] as const
export type CompletenessProblem = (typeof COMPLETENESS_PROBLEMS)[number]

/**
 * The evidence a bucket carries.
 *
 * `NO_CANONICAL_CANDLE` deliberately has no `completeness`: see §18.1 above.
 * `UNKNOWN` deliberately has no `effectiveTo`: an uncovered bucket has no
 * session-bounded end to report.
 */
export type BucketEvidence =
  | { readonly ok: false; readonly problem: CompletenessProblem; readonly detail: string }
  | { readonly ok: true; readonly kind: 'UNKNOWN'; readonly completeness: 'UNKNOWN' }
  | {
      readonly ok: true
      readonly kind: 'NO_CANONICAL_CANDLE'
      readonly nominalTo: Timestamp
      readonly effectiveTo: Timestamp
      readonly sessionTruncated: boolean
    }
  | {
      readonly ok: true
      readonly kind: 'ASSESSED'
      readonly completeness: 'COMPLETE' | 'PARTIAL'
      readonly nominalTo: Timestamp
      readonly effectiveTo: Timestamp
      /** Derived, never stored beside the other two — §19. */
      readonly sessionTruncated: boolean
    }

const unknownEvidence: BucketEvidence = Object.freeze({
  ok: true,
  kind: 'UNKNOWN',
  completeness: 'UNKNOWN',
})

const reject = (problem: CompletenessProblem, detail: string): BucketEvidence =>
  Object.freeze({ ok: false, problem, detail })

/**
 * Evaluate one bucket against what the calendar expected.
 *
 * Pure, provider-neutral and total. Same expectation plus same observation set
 * gives the same verdict on every machine and after every restart.
 *
 * Duplicates are REFUSED rather than de-duplicated. Canonical §16 does govern
 * duplicate candles — identical ones collapse, disagreeing ones refuse with
 * `DUPLICATE_DISAGREEMENT` — but that contract operates on candle BODIES, in
 * `mergeOlderCandles`, upstream of here. This function receives opening
 * instants alone and therefore cannot tell an identical duplicate from a
 * disagreeing one. Silently collapsing them would apply the benign half of a
 * rule whose other half refuses, so the input is rejected and the question is
 * put back where the bodies still exist.
 */
export function evaluateBucketEvidence(
  bucket: NominalBucket,
  expectation: SessionExpectation,
  observed: ObservedMinutes,
): BucketEvidence {
  const openMs = toEpochMs(bucket.open)
  const nominalToMs = toEpochMs(bucket.nominalTo)

  const seen = new Set<number>()
  for (const minute of observed.minuteOpenTimes) {
    const ms = toEpochMs(minute)
    if (ms % 60_000 !== 0) {
      return reject('NON_CANONICAL_MINUTE_OPEN', `${minute} is not an exact 1m boundary`)
    }
    if (ms < openMs || ms >= nominalToMs) {
      return reject('OBSERVATION_OUTSIDE_BUCKET', `${minute} lies outside ${bucket.open}..${bucket.nominalTo}`)
    }
    if (seen.has(ms)) {
      return reject('DUPLICATE_OBSERVED_MINUTE', `${minute} appears more than once`)
    }
    seen.add(ms)
  }

  // Order matters: an unsettled source cannot support a verdict even when the
  // calendar is fully known, and an unknown calendar cannot support one even
  // when the source has settled.
  if (expectation.status === 'UNKNOWN') return unknownEvidence
  if (observed.sourceState === 'UNKNOWN') return unknownEvidence

  const sessionTruncated = toEpochMs(expectation.effectiveTo) < nominalToMs

  if (expectation.expectedMinuteOpenTimes.length === 0) {
    return Object.freeze({
      ok: true,
      kind: 'NO_CANONICAL_CANDLE' as const,
      nominalTo: bucket.nominalTo,
      effectiveTo: expectation.effectiveTo,
      sessionTruncated,
    })
  }

  /*
   * Every expected minute must be present. Extra observations are counted by
   * nobody: an unexpected bar arriving during a scheduled halt cannot stand in
   * for an expected one that never came, so a set that is missing a minute
   * stays PARTIAL no matter how many extras accompany it.
   */
  const complete = expectation.expectedMinuteOpenTimes.every((minute) => seen.has(toEpochMs(minute)))

  return Object.freeze({
    ok: true,
    kind: 'ASSESSED' as const,
    completeness: complete ? ('COMPLETE' as const) : ('PARTIAL' as const),
    nominalTo: bucket.nominalTo,
    effectiveTo: expectation.effectiveTo,
    sessionTruncated,
  })
}
