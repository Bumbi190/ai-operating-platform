import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { HANDLARBORSEN_PROJECT_ID,HANDLARBORSEN_PROJECT_SLUG,isEligibleHandlarborsenProject,MARKETPLACE_METRIC_KEYS } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { COLLECTION_RUN_LIMIT,COLLECTION_RUN_SELECT,COLLECTOR_ID,HISTORY_LIMIT,SNAPSHOT_SELECT_COLUMNS,buildMarketplaceReport,emptyReport,type MarketplaceReport } from './handlarborsen-marketplace-report'
import type { MarketplaceReadScope,MarketplaceReadOptions } from './handlarborsen-marketplace-read'
import { normalizeAnalysisSource,type AnalysisSourceEnvelopeV1 } from './analysis-source-binding'
export type MarketplaceSourceResult={status:'not_permitted'}|{status:'ok';report:MarketplaceReport;source:AnalysisSourceEnvelopeV1|null}
function safeReportRows(rows:unknown[]):unknown[] {
 return rows.map(r=>{
 if(!r||typeof r!=='object')return r
 const x={...r} as Record<string,unknown>
 for(const k of MARKETPLACE_METRIC_KEYS)if(typeof x[k]==='string'&&/^(0|[1-9]\d*)$/.test(x[k] as string)&&BigInt(x[k] as string)<=9007199254740991n)x[k]=Number(x[k])
 return x
 })
}
export async function readMarketplaceSourceRows(
  project: { id: string; slug: string },
  scope: MarketplaceReadScope,
  options: MarketplaceReadOptions = {},
): Promise<MarketplaceSourceResult> {
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
      return { status: 'ok', report: emptyReport('not_enabled'), source: null }
    }

    // Two independent, project-bound reads start together after the authorization
    // and observer-mode gates above. Avoid serial network latency without adding
    // queries, weakening filters or changing failure semantics.
    const [snapshotRead, auditRead] = await Promise.allSettled([
      Promise.resolve().then(() => (db as any)
        .from('handlarborsen_marketplace_snapshots')
        .select('id, '+SNAPSHOT_SELECT_COLUMNS)
        .eq('project_id', HANDLARBORSEN_PROJECT_ID)
        .order('snapshot_date', { ascending: false }).order('id', { ascending: false })
        .limit(HISTORY_LIMIT)),
      Promise.resolve().then(() => (db as any)
        .from('collector_runs')
        .select('id, project_id, collector_id, '+COLLECTION_RUN_SELECT)
        .eq('collector_id', COLLECTOR_ID)
        .eq('project_id', HANDLARBORSEN_PROJECT_ID)
        .order('ran_at', { ascending: false }).order('id', { ascending: false })
        .limit(COLLECTION_RUN_LIMIT)),
    ])
    if (snapshotRead.status === 'rejected' || snapshotRead.value.error) {
      return failed('snapshots')
    }

    // Failure to read the audit must never hide a valid saved snapshot.
    // Unknown collection status remains unknown, never presented as "none".
    let runs: unknown[] | undefined
    if (auditRead.status === 'rejected' || auditRead.value.error) {
      console.error('[handlarborsen.report] read failed (stage: collector_runs)')
    } else {
      runs = auditRead.value.data ?? []
    }

    return {
      status: 'ok',
      report: buildMarketplaceReport(safeReportRows(snapshotRead.value.data ?? []), options.now, runs),
      source: normalizeAnalysisSource(snapshotRead.value.data ?? [], runs),
    }
  } catch {
    return failed('exception')
  }
}

function failed(stage: string): MarketplaceSourceResult {
  console.error(`[handlarborsen.report] read failed (stage: ${stage})`)
  return { status: 'ok', report: emptyReport('read_failed'), source: null }
}

export const loadHandlarborsenAnalysisSource = readMarketplaceSourceRows
