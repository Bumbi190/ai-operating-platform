/**
 * lib/atlas/survival/commit-bound-observation.ts — a Survival observation that a
 * future commit fence (M4) can hold to account (Phase 3B1B2 M3). INERT: no
 * production caller in M3.
 *
 * ── WHAT M2 DID NOT COVER ──────────────────────────────────────────────────
 * The M2 epoch proves no DATABASE input changed. Time changes Survival too: the
 * Europe/Stockholm budget windows roll at local midnight / ISO week / month,
 * open undispatched reservations go stale after 30 minutes, and cost rows age
 * out of the 30-day burn window. This observation therefore carries the EARLIEST
 * instant at which it may stop being valid — `invalidAt`, derived in the
 * database from those exact semantics (survival_clock_invalid_at), never a TTL.
 *
 * ── ONE CLOCK: THE DATABASE'S ──────────────────────────────────────────────
 * M2's stable observation stamps `asOf` from the application server's clock, and
 * the burn cutoff follows it while the budget windows follow the database clock.
 * A fence that compares against clock_timestamp() needs ONE clock, so this
 * observation is anchored to the DATABASE: `anchor` is clock_timestamp() read in
 * the same statement as V_before (survival_observation_anchor), and it is passed
 * to readSurvivalSnapshot as `now`, so the burn cutoff uses it too.
 *
 * ── THE PROTOCOL ───────────────────────────────────────────────────────────
 *     (anchor, V_before) = survival_observation_anchor()
 *     S                  = readSurvivalSnapshot(…, { now: anchor })
 *     invalidAt          = survival_clock_invalid_at(anchor)
 *     (t_after, V_after) = survival_observation_anchor()
 *
 * Accepted only if V_before == V_after (no authority write committed during the
 * reads) AND t_after < invalidAt (no clock boundary crossed during the reads).
 * Otherwise retried, up to a reviewed constant, then refused.
 *
 * ── AN AUTHORITY BOUNDARY: NOTHING IS INJECTABLE ───────────────────────────
 * Exactly the M2 rule: the signature accepts only the project scope. The client
 * (createAdminClient), the anchor (database clock), the vectors, the deadline and
 * the retry budget are all derived here. Guards fail if a seam reappears.
 *
 * ── M4 BLOCKING PRECONDITIONS (recorded, not solved here) ──────────────────
 * 1. The anchor and observed vector this returns must reach
 *    survival_commit_fence() UNMODIFIED, inside the same server code path that
 *    took the observation. The fence has no grant: only a SECURITY DEFINER bind
 *    function can call it, and that function must be a single-statement
 *    transaction that calls the fence LAST and issues no SET CONSTRAINTS.
 * 2. M4 must use THIS observation (database-anchored), not M2's application-clock
 *    observeSurvivalStable(), as Survival authority.
 * 3. The M2 preconditions stand: owner-approved Survival policy, and a
 *    server-derived observation scope.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { readSurvivalSnapshot } from './snapshot'
import type { SurvivalObservation } from './types'

type AnyDb = any

/** The number of epoch shards. Must equal the M2 migration's 8 (guarded). */
export const COMMIT_BOUND_EPOCH_SHARDS = 8

/** The reviewed retry budget. Not caller authority. */
export const COMMIT_BOUND_MAX_ATTEMPTS = 3

export type CommitBoundSurvivalObservation =
  | {
      kind: 'STABLE'
      /** The DATABASE instant (clock_timestamp()) the observation is anchored to. */
      anchor: string
      /** The earliest instant at which the observation may stop being valid (reject at >=). */
      invalidAt: string
      observation: SurvivalObservation
      /** The M2 vector the future fence must re-lock and compare. */
      observedEpochVector: readonly number[]
      attempts: number
    }
  | {
      kind: 'UNSTABLE'
      reason:
        | 'survival_inputs_changed_during_observation'
        | 'survival_clock_boundary_crossed_during_observation'
        | 'survival_epoch_unavailable'
        | 'survival_clock_unavailable'
      attempts: number
    }

interface Anchor { anchor: string; vector: number[] }

/** (anchor, vector) in one statement. Anything malformed is "unavailable". */
async function readAnchor(db: AnyDb): Promise<Anchor | null> {
  try {
    const { data, error } = await db.rpc('survival_observation_anchor')
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row || typeof row.anchor !== 'string' || Number.isNaN(Date.parse(row.anchor))) return null
    const raw = row.epoch_vector
    if (!Array.isArray(raw) || raw.length !== COMMIT_BOUND_EPOCH_SHARDS) return null
    const vector = raw.map((x: unknown) => (typeof x === 'string' ? Number(x) : x))
    if (!vector.every((x: unknown) => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0)) return null
    return { anchor: row.anchor, vector: vector as number[] }
  } catch {
    return null
  }
}

async function readInvalidAt(db: AnyDb, anchor: string): Promise<string | null> {
  try {
    const { data, error } = await db.rpc('survival_clock_invalid_at', { p_anchor: anchor })
    if (error || typeof data !== 'string' || Number.isNaN(Date.parse(data))) return null
    return data
  } catch {
    return null
  }
}

const sameVector = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Observe Survival anchored to the database clock, bounded in time. See the
 * module header for the protocol and the boundary.
 */
export async function observeSurvivalCommitBound(
  allowedProjectIds: readonly string[],
): Promise<CommitBoundSurvivalObservation> {
  const db: AnyDb = createAdminClient()

  let attempts = 0
  let reason: 'survival_inputs_changed_during_observation' | 'survival_clock_boundary_crossed_during_observation' =
    'survival_inputs_changed_during_observation'
  while (attempts < COMMIT_BOUND_MAX_ATTEMPTS) {
    attempts += 1
    const before = await readAnchor(db)
    if (!before) return { kind: 'UNSTABLE', reason: 'survival_epoch_unavailable', attempts }
    const observation = await readSurvivalSnapshot(allowedProjectIds, { db, now: before.anchor })
    const invalidAt = await readInvalidAt(db, before.anchor)
    if (!invalidAt) return { kind: 'UNSTABLE', reason: 'survival_clock_unavailable', attempts }
    const after = await readAnchor(db)
    if (!after) return { kind: 'UNSTABLE', reason: 'survival_epoch_unavailable', attempts }
    if (!sameVector(before.vector, after.vector)) {
      reason = 'survival_inputs_changed_during_observation'
      continue
    }
    // Millisecond comparison is conservative: equal milliseconds count as crossed.
    if (Date.parse(after.anchor) >= Date.parse(invalidAt)) {
      reason = 'survival_clock_boundary_crossed_during_observation'
      continue
    }
    return {
      kind: 'STABLE',
      anchor: before.anchor,
      invalidAt,
      observation,
      observedEpochVector: Object.freeze([...after.vector]),
      attempts,
    }
  }
  return { kind: 'UNSTABLE', reason, attempts }
}
