import { MARKETPLACE_METRIC_KEYS, HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { normalizeAnalysisSource } from '@/lib/atlas/project-analytics/analysis-source-binding'
import { buildMarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
export const NOW = new Date('2026-10-12T11:00:00Z')
export function rows(changes: Record<string, unknown> = {}) {
 return [{id:'00000000-0000-4000-8000-000000000001', project_id:HANDLARBORSEN_PROJECT_ID,snapshot_date:'2026-10-12',observed_at:'2026-10-12T10:00:00.123456Z',captured_at:'2026-10-12T10:01:00.654321Z',schema_version:1,window_hours:24,completeness:'complete',unavailable:{},...Object.fromEntries(MARKETPLACE_METRIC_KEYS.map(k=>[k,0])),companies_registered_total:10,companies_verified_total:6,bids_total:2,...changes}]
}
export function runs(changes:Record<string,unknown>={}) {return [{id:'00000000-0000-4000-8000-000000000002',project_id:HANDLARBORSEN_PROJECT_ID,collector_id:'handlarborsen.marketplace',status:'ok',ran_at:'2026-10-12T10:01:00.123456Z',snapshot_date:'2026-10-12',storage_outcome:'inserted',...changes}]}
export function fixture(changes:Record<string,unknown>={},audit:unknown[]|undefined=runs(),now=NOW) {
 const actual=arguments.length>1?arguments[1]:audit
 const raw=rows(changes); return {source:normalizeAnalysisSource(raw,actual),report:buildMarketplaceReport(raw,now,actual)}
}
