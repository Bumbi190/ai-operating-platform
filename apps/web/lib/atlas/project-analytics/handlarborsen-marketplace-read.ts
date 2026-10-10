import 'server-only'
/**
 * lib/atlas/project-analytics/handlarborsen-marketplace-read.ts — the read path (P1D).
 *
 * The one place Omnira reads `handlarborsen_marketplace_snapshots`. That table is
 * SERVER_ONLY (RLS on, no policy, every client role revoked), so the read necessarily
 * uses the service-role client. Authorization therefore happens HERE, before any client
 * is created, and is fail-closed:
 *
 *   1. The caller supplies the project allow-list it has already resolved (the page
 *      passes the one project its RLS-bound `getProjectBySlug` returned; Atlas passes
 *      its request allow-list). The project must be IN that list (`assertProjectAllowed`).
 *   2. The project must be the fixed, verified Handlarbörsen identity (id AND slug).
 *   3. `atlas_mode` is read from the database and must be observer or active. Reading
 *      is observation: observer mode permits it, and nothing here can write or act.
 *
 * Failing 1 or 2 returns `not_permitted` without touching the database. The query is
 * pinned to the fixed project id and selects named columns only, never `*`. Read errors
 * log a fixed code, never the database message.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { assertProjectAllowed } from '@/lib/atlas/isolation'
import {
  HANDLARBORSEN_PROJECT_ID,
  HANDLARBORSEN_PROJECT_SLUG,
  isEligibleHandlarborsenProject,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import type { ContextRequest } from '@/lib/atlas/context/request'
import {
  HISTORY_LIMIT,
  SNAPSHOT_SELECT_COLUMNS,
  buildMarketplaceReport,
  emptyReport,
  renderHandlarborsenFactBlock,
  type MarketplaceReport,
} from './handlarborsen-marketplace-report'

type AnyDb = any

export type MarketplaceReportResult =
  | { status: 'not_permitted' }
  | { status: 'ok'; report: MarketplaceReport }

export interface MarketplaceReadScope {
  /** Projects the caller is already authorized for. An empty list permits nothing. */
  allowedProjectIds: string[]
}

/** Injectable for tests; production uses the service-role client, created only after authz. */
export interface MarketplaceReadOptions {
  db?: AnyDb
  now?: Date
}

export async function loadHandlarborsenMarketplaceReport(
  project: { id: string; slug: string },
  scope: MarketplaceReadScope,
  options: MarketplaceReadOptions = {},
): Promise<MarketplaceReportResult> {
  if (
    !assertProjectAllowed(project.id, scope.allowedProjectIds) ||
    project.id !== HANDLARBORSEN_PROJECT_ID ||
    project.slug !== HANDLARBORSEN_PROJECT_SLUG
  ) {
    return { status: 'not_permitted' }
  }

  try {
    const db = options.db ?? createAdminClient()

    // atlas_mode is not in generated types — established cast.
    const { data: projectRow, error: projectError } = await (db.from('projects') as any)
      .select('id, slug, atlas_mode')
      .eq('id', HANDLARBORSEN_PROJECT_ID)
      .maybeSingle()
    if (projectError) return failed('project')
    if (!projectRow) return { status: 'not_permitted' }
    if (!isEligibleHandlarborsenProject(projectRow)) {
      return { status: 'ok', report: emptyReport('not_enabled') }
    }

    // Table is not in generated types — established cast.
    const { data, error } = await (db as any)
      .from('handlarborsen_marketplace_snapshots')
      .select(SNAPSHOT_SELECT_COLUMNS)
      .eq('project_id', HANDLARBORSEN_PROJECT_ID)
      .order('snapshot_date', { ascending: false })
      .limit(HISTORY_LIMIT)
    if (error) return failed('snapshots')

    return { status: 'ok', report: buildMarketplaceReport(data ?? [], options.now) }
  } catch {
    return failed('exception')
  }
}

function failed(stage: string): MarketplaceReportResult {
  console.error(`[handlarborsen.report] read failed (stage: ${stage})`)
  return { status: 'ok', report: emptyReport('read_failed') }
}

// ── Atlas side ────────────────────────────────────────────────────────────────

export interface HandlarborsenFactBlock {
  text: string
  meta: { snapshotDate: string; completeness: string; comparisonAvailable: boolean }
}

/**
 * Atlas-facing reader, shaped like a context reader (`ContextRequest → block | null`) so
 * it can be registered with the assembler later. It is NOT registered in this phase:
 * adding a context dimension is a versioned allocation-policy change (STATIC_POLICY_V2),
 * deliberately left to its own step.
 *
 * Contributes only for a project-scoped request that names Handlarbörsen and is inside
 * the request's allow-list; anything else (global scope, another project, no verified
 * report) is null — an absent block, never an error and never zeros. Never throws.
 */
export async function readHandlarborsenFactBlock(
  req: ContextRequest,
  env: { db?: AnyDb; allowedProjectIds: string[] },
  now?: Date,
): Promise<HandlarborsenFactBlock | null> {
  try {
    if (req.scope !== 'project' || req.projectId !== HANDLARBORSEN_PROJECT_ID) return null
    const result = await loadHandlarborsenMarketplaceReport(
      { id: HANDLARBORSEN_PROJECT_ID, slug: HANDLARBORSEN_PROJECT_SLUG },
      { allowedProjectIds: env.allowedProjectIds },
      { db: env.db, now },
    )
    if (result.status !== 'ok') return null
    const text = renderHandlarborsenFactBlock(result.report)
    if (!text || !result.report.latest) return null
    return {
      text,
      meta: {
        snapshotDate: result.report.latest.snapshotDate,
        completeness: result.report.latest.completeness,
        comparisonAvailable: result.report.history.comparison.available,
      },
    }
  } catch {
    return null
  }
}
