/**
 * Omnira Trading — the 4H market-data PRECONDITION for strategy evidence.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §20 (strategirelevanta 4H-buckets)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §12.1 (4H-ankaret)
 *  - Strategy Specification Canonical v1.0 §6 (the two locked 4H opens)
 *
 * THIS IS A DATA-QUALITY GATE. IT IS NOT THE STRATEGY.
 * ───────────────────────────────────────────────────
 * ELIGIBLE means one thing only: the market data underneath this bucket is good
 * enough to be looked at. It creates no signal, no setup, no grade, no thesis,
 * no proposal and no authority. There is no iFVG here, no CISD, no SMT, no
 * displacement and no liquidity sweep — §20 says in as many words that no
 * detection rule is redefined, and GATE-04 stays open.
 *
 * AUTHORITY IS ISSUED, NOT DERIVED FROM DATA. Nothing in this package can mint
 * any, and an ELIGIBLE verdict permits exactly nothing.
 *
 * WHY ONLY 02:00 AND 10:00
 * ────────────────────────
 * Those are the strategy's two canonical 4H opens (§20). The other four opens
 * on the grid are ordinary market data — real, renderable, researchable, and
 * not evidence of a completed strategy bucket. Marking them strategy-relevant
 * would silently quadruple the surface the strategy reads from.
 *
 * The ordinary last bucket of the day, 14:00 → the close, is the case that
 * makes the distinction concrete: it is normally session-truncated by design
 * (§12.2), it is frequently COMPLETE market data, and it is never canonical 4H
 * strategy evidence.
 *
 * BOTH CONDITIONS, OR NEITHER
 * ───────────────────────────
 * §20 requires `completeness === 'COMPLETE'` AND `effectiveTo === nominalTo`.
 * A holiday that cuts 02:00→06:00 or 10:00→14:00 short leaves valid market data
 * for the shortened session that must NOT be delivered as completed 4H
 * evidence. Fail closed.
 */

import type { Timestamp } from '../time'
import type { NominalBucket } from './grid'
import type { BucketEvidence } from './completeness'
import { localTimeAt } from './zone'

/**
 * The strategy's two canonical 4H opens, as America/New_York wall-clock hours.
 *
 * Locked by Strategy Canonical v1.0 §6 and restated by Market Data Canonical
 * v1.0 §20. They are wall-clock hours because the 4H grid is wall-clock
 * anchored — 02:00 New York is 07:00Z in winter and 06:00Z in summer, and both
 * are the same canonical open.
 */
export const STRATEGY_FOUR_HOUR_OPEN_HOURS = [2, 10] as const
export type StrategyFourHourOpenHour = (typeof STRATEGY_FOUR_HOUR_OPEN_HOURS)[number]

export const FOUR_HOUR_STRATEGY_STANDINGS = [
  'ELIGIBLE',
  'INELIGIBLE',
  'NOT_STRATEGY_RELEVANT',
] as const
export type FourHourStrategyStanding = (typeof FOUR_HOUR_STRATEGY_STANDINGS)[number]

/**
 * Whether an instant is one of the two strategy-relevant 4H opens.
 *
 * Reads the canonical wall clock, never a UTC hour. A UTC test would be right
 * for half the year and wrong for the other half, which is the failure mode
 * §12.1 exists to prevent.
 */
export function isStrategyFourHourOpen(at: Timestamp): boolean {
  const hour = localTimeAt(at).hour
  return (STRATEGY_FOUR_HOUR_OPEN_HOURS as readonly number[]).includes(hour)
}

/**
 * Whether a bucket's market data supports completed canonical 4H evidence.
 *
 * `NOT_STRATEGY_RELEVANT` is a third answer rather than a `false`, because
 * "this bucket does not qualify" and "this question does not apply to this
 * bucket" are different facts. A caller that collapsed them would treat every
 * 14:00 bucket as a failed 02:00 one.
 */
export function fourHourStrategyStanding(
  bucket: NominalBucket,
  evidence: BucketEvidence,
): FourHourStrategyStanding {
  if (bucket.timeframe !== '4H') return 'NOT_STRATEGY_RELEVANT'
  if (!isStrategyFourHourOpen(bucket.open)) return 'NOT_STRATEGY_RELEVANT'

  if (!evidence.ok) return 'INELIGIBLE'
  if (evidence.kind !== 'ASSESSED') return 'INELIGIBLE'
  if (evidence.completeness !== 'COMPLETE') return 'INELIGIBLE'
  /*
   * `sessionTruncated` is §19's derivation of `effectiveTo < nominalTo`, so
   * requiring it to be false IS §20's `effectiveTo === nominalTo` — read from
   * the one place that computes it rather than recomputed into a second answer
   * that could disagree.
   */
  if (evidence.sessionTruncated) return 'INELIGIBLE'

  return 'ELIGIBLE'
}
