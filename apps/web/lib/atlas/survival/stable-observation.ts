/**
 * lib/atlas/survival/stable-observation.ts — a Survival observation bound to
 * its epoch vector (Phase 3B1B2 M2). INERT: no production caller in M2.
 *
 * ── WHY ONE VECTOR READ IS NOT ENOUGH ──────────────────────────────────────
 * `readSurvivalSnapshot()` assembles Survival from SEVERAL statements
 * (headroom, burn, pending burn, revenue, funding, coverage, pause). A Survival
 * input may commit between any two of them, so a single vector read taken
 * after the snapshot could already contain a change that the earlier reads did
 * not see — and a fence comparing against that vector would accept an
 * observation of a database state that never existed.
 *
 * ── THE PROTOCOL ───────────────────────────────────────────────────────────
 *     V_before = survival_input_epoch_vector()
 *     S        = readSurvivalSnapshot(…, { now: asOf })
 *     V_after  = survival_input_epoch_vector()
 *
 * S is DATABASE-STABLE only when V_before == V_after: no Survival authority
 * input committed anywhere between the first and the last read, so every read
 * in S saw the same committed authority. The accepted observation carries
 * V_after as the vector a future commit fence (M3/M4) must re-lock and compare.
 * Otherwise the attempt is discarded — never silently accepted — and retried up
 * to `maxAttempts`, then refused.
 *
 * ── WHAT THIS DOES NOT DO ──────────────────────────────────────────────────
 * - It does not solve the CLOCK. One fixed `asOf` is carried through every
 *   attempt so the observation has a single instant, but whether that instant
 *   is still valid at commit (day/week/month windows, the 30-day burn window)
 *   is M3's commit-clock problem.
 * - It does not derive anything: the pure derivation and its SQL policy are
 *   reached only through `readSurvivalSnapshot()`.
 * - It binds nothing, creates no run and records no provenance. A permanent
 *   guard proves no route, workflow or bind consumer imports it in M2.
 *
 * ── M4 BLOCKING PRECONDITION ───────────────────────────────────────────────
 * A STABLE observation proves only that the inputs did not move. It does not
 * make the policy that turned them into a state authoritative. The six numeric
 * thresholds in derive.ts (`PROVISIONAL_*`: headroom 0.1 / 0.35 / 0.5, runway
 * 3 / 14 / 60 days; `SURVIVAL_THRESHOLD_STATUS === 'provisional'`) are an
 * implementer's choice, not owner-approved canonical policy. Survival policy
 * values that can restrict licensed autonomy must be reviewed and promoted to
 * owner-approved canonical policy BEFORE a licensed bind may use this
 * observation as authority. (The Chapter 18 state → ceiling mapping in
 * ceiling.ts is separate.) A guard keeps this note here while the status is
 * provisional.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { readSurvivalSnapshot, type SnapshotOptions } from './snapshot'
import type { SurvivalObservation } from './types'

type AnyDb = any

/** The number of epoch shards. Must equal the migration's 8 (guarded). */
export const SURVIVAL_EPOCH_SHARDS = 8

const MAX_ATTEMPTS_CEILING = 5

export type StableSurvivalObservation =
  | {
      kind: 'STABLE'
      /** The single instant every read in this observation was evaluated at. */
      asOf: string
      observation: SurvivalObservation
      /** V_after — the vector a future commit fence must re-lock and compare. */
      observedEpochVector: readonly number[]
      attempts: number
    }
  | {
      kind: 'UNSTABLE'
      asOf: string
      reason: 'survival_inputs_changed_during_observation' | 'survival_epoch_unavailable'
      attempts: number
    }

export interface StableObservationOptions {
  db?: AnyDb
  /** The fixed instant. Defaults to now, taken ONCE before the first attempt. */
  now?: string
  /** Bounded retries on an unstable read. 1..5; default 3. */
  maxAttempts?: number
  /** Passed through to readSurvivalSnapshot (test seams only). */
  snapshot?: Omit<SnapshotOptions, 'db' | 'now'>
}

/**
 * Read the epoch vector. Anything but exactly 8 non-negative safe integers is
 * "unavailable" — the caller refuses rather than comparing a malformed vector.
 */
async function readEpochVector(db: AnyDb): Promise<number[] | null> {
  try {
    const { data, error } = await db.rpc('survival_input_epoch_vector')
    if (error || !Array.isArray(data) || data.length !== SURVIVAL_EPOCH_SHARDS) return null
    const vector = data.map((x: unknown) => (typeof x === 'string' ? Number(x) : x))
    return vector.every((x: unknown) => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0)
      ? (vector as number[])
      : null
  } catch {
    return null
  }
}

const sameVector = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Observe Survival and prove the observation corresponds to ONE committed
 * authority state. See the module header for the protocol.
 */
export async function observeSurvivalStable(
  allowedProjectIds: readonly string[],
  options: StableObservationOptions = {},
): Promise<StableSurvivalObservation> {
  const db: AnyDb = options.db ?? createAdminClient()
  const asOf = options.now ?? new Date().toISOString()
  const maxAttempts = Math.min(Math.max(Math.trunc(options.maxAttempts ?? 3), 1), MAX_ATTEMPTS_CEILING)

  let attempts = 0
  while (attempts < maxAttempts) {
    attempts += 1
    const before = await readEpochVector(db)
    if (!before) return { kind: 'UNSTABLE', asOf, reason: 'survival_epoch_unavailable', attempts }
    const observation = await readSurvivalSnapshot(allowedProjectIds, { ...options.snapshot, db, now: asOf })
    const after = await readEpochVector(db)
    if (!after) return { kind: 'UNSTABLE', asOf, reason: 'survival_epoch_unavailable', attempts }
    if (sameVector(before, after)) {
      return { kind: 'STABLE', asOf, observation, observedEpochVector: Object.freeze([...after]), attempts }
    }
  }
  return { kind: 'UNSTABLE', asOf, reason: 'survival_inputs_changed_during_observation', attempts }
}
