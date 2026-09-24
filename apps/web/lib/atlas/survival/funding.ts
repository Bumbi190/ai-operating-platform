/**
 * lib/atlas/survival/funding.ts — the canonical funding source and its scope check.
 *
 * ── ONE SOURCE OF FUNDING TRUTH ────────────────────────────────────────────
 * `readDeclaredOperatingCapital()` is the only place the platform's available
 * operating capital is read. It reads the singleton `platform_config` row and
 * converts it into the discriminated `FundingReading` the derivation consumes:
 *
 *     a numeric value   → { kind: 'KNOWN', declaredFundingSek }
 *     NULL              → { kind: 'UNDECLARED' }
 *     a FAILED read     → { kind: 'UNAVAILABLE' }
 *
 * The three states are not interchangeable, and the failure mode must never be
 * the permissive one: under the canonical floors, UNAVAILABLE is HIBERNATE while
 * UNDECLARED is CONSERVE, so collapsing a failed read into "nobody declared
 * anything" would RAISE the autonomy ceiling on the strength of a lost
 * measurement.
 *
 * `FundingReading` carries that distinction BY ITSELF, which is why this
 * function returns it directly and there is no `SurvivalReads.funding` boolean
 * beside it. The measurement reads (`budgets`, `burn`, `revenue`) need flags
 * because their failures have no other channel; the funding read does, and a
 * second representation of one fact is how two answers to one question
 * eventually disagree.
 *
 * ── WHAT IT IS NOT DERIVED FROM ────────────────────────────────────────────
 * Not MRR, not `revenue_snapshots`, not Stripe, not `project_budgets`, not
 * `budget_headroom`, not `cost_events`, not a wallet and not a bank. Those
 * measure different things, and inferring cash from any of them is the exact
 * mistake the survival subsystem exists to avoid.
 *
 * ── SERVER ONLY ────────────────────────────────────────────────────────────
 * `server-only` plus a service-role client: the table is not readable by any
 * client role, and this module is never imported by a component.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { FundingReading, RunwayCoverage } from './types'

type AnyDb = any

/** The one column that carries the declaration. Named here once. */
const CAPITAL_COLUMN = 'declared_operating_capital_sek'

/**
 * Read the owner's declared operating capital.
 *
 * Never throws. A query error, a missing singleton row, or a non-numeric value
 * all resolve to `UNAVAILABLE`, which floors at HIBERNATE — the restrictive
 * direction. There is deliberately no path from a failure to `UNDECLARED`.
 *
 * The returned reading IS the result: `UNAVAILABLE` is the failure signal, so
 * no separate success flag is returned. A boolean beside it would be the same
 * fact twice, and the two could disagree.
 */
export async function readDeclaredOperatingCapital(db?: AnyDb): Promise<FundingReading> {
  try {
    const client: AnyDb = db ?? createAdminClient()
    const { data, error } = await client
      .from('platform_config')
      .select(CAPITAL_COLUMN)
      .eq('id', 1)
      .maybeSingle()

    if (error) return { kind: 'UNAVAILABLE' }
    // The singleton is missing entirely. A configured source we cannot find is
    // not the same as an owner who never declared anything.
    if (!data) return { kind: 'UNAVAILABLE' }

    const raw = (data as Record<string, unknown>)[CAPITAL_COLUMN]
    if (raw === null || raw === undefined) return { kind: 'UNDECLARED' }

    const value = typeof raw === 'number' ? raw : Number(raw)
    // A value that is not a finite number is a broken reading, not a declaration
    // of zero. Coercing it would invent a fact, and inventing the permissive one
    // is the failure this branch exists to prevent.
    if (!Number.isFinite(value)) return { kind: 'UNAVAILABLE' }

    return { kind: 'KNOWN', declaredFundingSek: value }
  } catch {
    return { kind: 'UNAVAILABLE' }
  }
}

/**
 * Does this observation's project set contain EVERY project whose burn belongs
 * in platform operating-capital runway?
 *
 * Operating capital is one platform-wide declaration; measured burn is summed
 * over the project set the caller may read. Dividing the first by the second is
 * only meaningful when the second covers the whole platform. This answers that
 * question.
 *
 * ── WHY AN RPC AND NOT A TABLE READ ────────────────────────────────────────
 * The natural implementation — count the projects outside the caller's set — is
 * a service-role read OUTSIDE the caller's scope, which is precisely what the
 * Atlas isolation invariant forbids. It would also be a read that starts as a
 * count and ends as a list. So the question is asked of the database instead,
 * and the answer is ONE BOOLEAN: no id, no count and no row crosses the wire.
 *
 * The project population is `public.projects` in full. Discovery established
 * that the table carries no lifecycle, archive or soft-delete column, so every
 * row is a live project and the population needs no filter.
 *
 * FAILURE IS RESTRICTIVE. If the check cannot be completed, the answer is
 * `PARTIAL_SCOPE`, which suppresses runway and caps the state at `CRITICAL` —
 * the final approved v2 rule. An unreadable scope must never be read as
 * "we see everything".
 */
export async function readRunwayCoverage(
  allowedProjectIds: readonly string[],
  db?: AnyDb,
): Promise<RunwayCoverage> {
  // Seeing no projects cannot be seeing all of them. Guards the degenerate case
  // where an empty allow-list would otherwise be vacuously "complete".
  if (allowedProjectIds.length === 0) return 'PARTIAL_SCOPE'

  try {
    const client: AnyDb = db ?? createAdminClient()
    const { data, error } = await client.rpc('survival_scope_is_platform_complete', {
      p_project_ids: [...allowedProjectIds],
    })
    if (error) return 'PARTIAL_SCOPE'
    // A non-boolean answer is not an answer. Only an explicit `true` completes.
    return data === true ? 'PLATFORM_COMPLETE' : 'PARTIAL_SCOPE'
  } catch {
    return 'PARTIAL_SCOPE'
  }
}
