/**
 * lib/atlas/survival/snapshot.ts — assembling the survival input (READ-ONLY).
 *
 * The only module in this subsystem that touches a database, and it only ever
 * READS. Its whole job is to turn existing truth into a `SurvivalInput` and hand
 * it to the pure core in `derive.ts`.
 *
 * ── IT MUST NEVER CALL budget_reserve ───────────────────────────────────────
 * `budget_headroom()` is a read: it reports what the gate WOULD say. Reserving
 * would consume headroom, so a "status check" that reserved would change the
 * thing it was measuring and could refuse real work as a side effect of being
 * looked at. `/api/system/execution-safety` states the same rule for the same
 * reason — "it asks what the gate WOULD say and never reserves".
 *
 * Both functions are `SECURITY DEFINER` with EXECUTE granted to `service_role`
 * only, so this module is reached through `createAdminClient()`, exactly like
 * every other reader of this ledger.
 *
 * ── ONE BUDGET SYSTEM ───────────────────────────────────────────────────────
 * Reads `budget_headroom`, `cost_events`, `revenue_snapshots` and
 * `platform_config` — all existing. It introduces no table, no ledger and no
 * second money representation. `MissionBudget` (the authority chain's ceiling)
 * is deliberately not consulted: it is a different system for a different
 * question, and per the Phase 1 discovery nothing connects the two yet.
 *
 * ── DEGRADE, NEVER THROW ────────────────────────────────────────────────────
 * A source that cannot be read yields a `false` in `reads`, which the pure core
 * turns into a CONSERVE cap. It never throws, so a database blip cannot take
 * down a read surface; and because the consequence is a CEILING rather than a
 * gate, that blip also cannot stop any work.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { deriveSurvivalState } from './derive'
import { survivalCeiling } from './ceiling'
import { readDeclaredOperatingCapital, readRunwayCoverage } from './funding'
import type {
  BudgetScopeReading,
  FundingReading,
  RunwayCoverage,
  SurvivalInput,
  SurvivalObservation,
  SurvivalReads,
} from './types'
import type { BudgetScope } from '@/lib/cost/budget-gate'

type AnyDb = any

/** Trailing window for the burn rate. Long enough to smooth a slow platform. */
export const BURN_WINDOW_DAYS = 30

/** Matches the `p_stale_minutes` the execution-safety surface already uses. */
const STALE_MINUTES = 30

/** Bounded window for the revenue trend read. See `readRevenueTrend`. */
const REVENUE_SNAPSHOT_ROWS = 60

export interface SnapshotOptions {
  db?: AnyDb
  /** Injected so a snapshot can be reproduced for a recorded instant. */
  now?: string
  /**
   * ── CONTROLLED TEST SEAM. PRODUCTION CALLERS MUST NOT PASS THIS. ─────────
   *
   * Phase 2B made the funding source canonical: this function now reads
   * `platform_config` itself (see `readDeclaredOperatingCapital`). The override
   * survives only so the derivation's funding branches stay exercisable without
   * a database, and it is a plain server-side parameter — never a request field.
   *
   * It is deliberately still named `funding` so that every existing test call
   * site stays visible, and so a production caller passing it is obvious in
   * review. `GET /api/system/survival`, the Systemhälsa loader and the Phase 2A
   * recorder all pass nothing here, which is what keeps one source of truth.
   */
  funding?: FundingReading
  /**
   * ── CONTROLLED TEST SEAM. PRODUCTION CALLERS MUST NOT PASS THIS. ─────────
   *
   * Named with an explicit `test` prefix because this is the dangerous one: a
   * caller that could claim `PLATFORM_COMPLETE` for a partial project set would
   * manufacture a runway figure, and an overstated runway is what raises the
   * autonomy ceiling. Production coverage is derived server-side from the
   * caller's actual project set by `readRunwayCoverage`.
   */
  testRunwayCoverage?: RunwayCoverage
}

/**
 * Assemble and derive. `allowedProjectIds` must come from an authenticated
 * session — this function does not authenticate.
 *
 * The signature deliberately mirrors `lib/atlas/isolation.ts`'s
 * `applyProjectScope(db, allowedProjectIds)`: the scope is passed in by the
 * caller that proved it, never inferred from a payload.
 *
 * ── PHASE 2B: THE PRODUCTION PATH IS NOW FULLY CANONICAL ──────────────────
 * current measurements + the canonical persisted funding source + whether that
 * scope covers the platform → `SurvivalInput` → `deriveSurvivalState()`. No
 * production caller supplies funding or coverage.
 */
export async function readSurvivalSnapshot(
  allowedProjectIds: readonly string[],
  options: SnapshotOptions = {},
): Promise<SurvivalObservation> {
  const db: AnyDb = options.db ?? createAdminClient()
  const at = options.now ?? new Date().toISOString()

  // The funding source and the scope check are read alongside the measurements,
  // in the same pass, so a snapshot can never mix a fresh burn with a stale
  // declaration or vice versa.
  const [scopes, budgetsOk] = await readHeadroom(db, allowedProjectIds)
  const [burnSekPerDay, burnOk] = await readBurn(db, allowedProjectIds, at)
  const [revenueTrendSek, revenueOk] = await readRevenueTrend(db, allowedProjectIds)
  const canonicalFunding = options.funding ?? await readDeclaredOperatingCapital(db)
  const coverage = options.testRunwayCoverage ?? await readRunwayCoverage(allowedProjectIds, db)
  const operatingPaused = await readOperatingPaused(db)

  const reads: SurvivalReads = {
    budgets: budgetsOk,
    burn: burnOk,
    revenue: revenueOk,
  }

  const input: SurvivalInput = {
    scopes,
    reads,
    burnSekPerDay,
    runwayCoverage: coverage,
    funding: canonicalFunding,
    revenueTrendSek,
    operatingPaused,
  }

  const snapshot = deriveSurvivalState(input, { at })
  return { snapshot, ceiling: survivalCeiling(snapshot.state) }
}

// ─── Readers ────────────────────────────────────────────────────────────────

/**
 * Per-scope headroom for the caller's projects.
 *
 * `budget_headroom` returns every project, so the filter is applied here rather
 * than left to the caller — an unfiltered read is how a status surface becomes a
 * cross-tenant window. The `global_*` scopes are shared pools and are therefore
 * correctly included: they genuinely bind the caller's projects too.
 *
 * Returns `false` when the read could not be established, which is NOT the same
 * as "no budget configured" — `derive.ts` reports the two differently.
 */
async function readHeadroom(
  db: AnyDb,
  allowedProjectIds: readonly string[],
): Promise<[BudgetScopeReading[], boolean]> {
  try {
    const { data, error } = await db.rpc('budget_headroom', { p_stale_minutes: STALE_MINUTES })
    if (error) return [[], false]
    const rows = (data ?? []) as any[]
    return [
      rows
        .filter(row => allowedProjectIds.includes(row.project_id as string))
        .map(row => ({
          projectId: row.project_id as string,
          slug: String(row.slug),
          scope: String(row.scope) as BudgetScope,
          limitSek: Number(row.limit_sek),
          spentSek: Number(row.spent_sek),
          heldSek: Number(row.held_sek),
          remainingSek: Number(row.remaining_sek),
        })),
      true,
    ]
  } catch {
    return [[], false]
  }
}

/**
 * Trailing burn in SEK per day, from `cost_events`.
 *
 * Summed client-side because the table has no aggregate RPC. The window bounds
 * the read to a predictable size; if the row count in 30 days ever grows past
 * what a single request should carry, the fix is an RPC over the same table —
 * not a second cost ledger, and not a truncated sum, which would report a burn
 * rate lower than the real one.
 */
async function readBurn(
  db: AnyDb,
  allowedProjectIds: readonly string[],
  at: string,
): Promise<[number | null, boolean]> {
  if (allowedProjectIds.length === 0) return [null, true]
  try {
    const cutoff = new Date(Date.parse(at) - BURN_WINDOW_DAYS * 86_400_000).toISOString()
    const { data, error } = await db.from('cost_events')
      .select('cost_sek')
      .in('project_id', allowedProjectIds)
      .gte('created_at', cutoff)
    if (error) return [null, false]
    const total = (data ?? []).reduce(
      (sum: number, row: any) => sum + (Number(row.cost_sek) || 0),
      0,
    )
    return [total / BURN_WINDOW_DAYS, true]
  } catch {
    return [null, false]
  }
}

/**
 * Change in MRR against the previous snapshot, in SEK. A SIGNAL, NOT CASH.
 *
 * Grouped per project before differencing, because differencing two rows that
 * belong to different projects would compare unrelated subscribers. A project
 * with fewer than two snapshots in the window contributes nothing rather than a
 * fabricated zero — `null` when no comparison is possible at all.
 */
async function readRevenueTrend(
  db: AnyDb,
  allowedProjectIds: readonly string[],
): Promise<[number | null, boolean]> {
  if (allowedProjectIds.length === 0) return [null, true]
  try {
    const { data, error } = await db.from('revenue_snapshots')
      .select('project_id, snapshot_date, mrr_sek')
      .in('project_id', allowedProjectIds)
      .order('snapshot_date', { ascending: false })
      .limit(REVENUE_SNAPSHOT_ROWS)
    if (error) return [null, false]

    const byProject = new Map<string, { date: string; mrrSek: number }[]>()
    for (const row of (data ?? []) as any[]) {
      const list = byProject.get(row.project_id as string) ?? []
      list.push({ date: String(row.snapshot_date), mrrSek: Number(row.mrr_sek) || 0 })
      byProject.set(row.project_id as string, list)
    }

    let delta = 0
    let compared = 0
    for (const list of byProject.values()) {
      const sorted = list.slice().sort((a, b) => (a.date < b.date ? 1 : -1))
      if (sorted.length < 2) continue
      delta += sorted[0].mrrSek - sorted[1].mrrSek
      compared += 1
    }
    return compared > 0 ? [delta, true] : [null, true]
  } catch {
    return [null, false]
  }
}

/**
 * The platform automation pause, for context only.
 *
 * Read directly rather than through `stop_state` because only the global boolean
 * is wanted here and `platform_config` is the source of truth for it. `null`
 * means the row could not be read — "not established", never `false`.
 */
async function readOperatingPaused(db: AnyDb): Promise<boolean | null> {
  try {
    const { data, error } = await db.from('platform_config')
      .select('automation_paused')
      .eq('id', 1)
      .maybeSingle()
    if (error || !data) return null
    return data.automation_paused === true
  } catch {
    return null
  }
}
