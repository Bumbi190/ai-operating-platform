import { describe,it,expect } from 'vitest'
import { buildAnalysisReviewDraft,validateAnalysisReviewDraft } from '@/lib/atlas/project-analytics/analysis-review-contract'
import { hashAnalysisSource } from '@/lib/atlas/project-analytics/analysis-source-binding'
import { fixture,NOW,runs } from './fixtures/analysis-test-source'
function build(f=fixture(),now=NOW,ruleId:'company-status'|'bid-window'='company-status',version='handlarborsen-insights-1.0.0') {
 if(!f.source) return {status:'conflict' as const}
 return buildAnalysisReviewDraft(f.source,f.report,{ruleId,ruleVersion:version,expectedEvidenceHash:hashAnalysisSource(f.source)},now)
}
describe('immutable manual analysis',()=>{
 it('company_10_6_and_bids_2_0_are_proposals',()=>{
  for(const r of ['company-status','bid-window'] as const) {
   const b=build(fixture(),NOW,r); expect(b.status).toBe('ok'); if(b.status!=='ok')throw Error()
   expect(b.draft.insight.kind).toBe('proposal');expect(b.draft.manualSteps).toEqual(['Granska den citerade rapporten',b.draft.insight.nextCheck,'Dokumentera resultatet utanför detta analysutkast'])
   expect(b.draft.insight.evidence.map(e=>e.value)).toEqual(r==='company-status'?[10,6]:[2,0])
   expect(b.draft.insight.evidence.every(e=>e.collectorVersion===null)).toBe(true)
   expect(validateAnalysisReviewDraft(b.draft)).toEqual(b.draft)
  }
 })
 it('null_is_not_zero',()=>expect(build(fixture({companies_verified_total:null,completeness:'partial',unavailable:{companies_verified_total:'query_failed'}})).status).toBe('conflict'))
 it('partial_required_vs_unrelated_missing',()=>expect(build(fixture({vehicles_reserved:null,completeness:'partial',unavailable:{vehicles_reserved:'query_failed'}})).status).toBe('ok'))
 it('fresh_26h_inclusive',()=>{expect(build(fixture(),new Date('2026-10-13T12:00:00.123Z')).status).toBe('ok');expect(build(fixture(),new Date('2026-10-13T12:00:00.124Z')).status).toBe('conflict')})
 it('future_unzoned_date_mismatch_refused',()=>{for(const changes of [{observed_at:'2026-10-12T12:00:00Z'},{observed_at:'2026-10-12T10:00:00'},{snapshot_date:'2026-10-11'}])expect(build(fixture(changes)).status).toBe('conflict')})
 it('unknown_failed_audit_refused',()=>{for(const a of [undefined,[],runs({status:'error'}),runs({status:'mystery'})])expect(build(fixture({},a)).status).toBe('conflict')})
 it('fact_quality_withdrawn_version_refused',()=>{expect(build(fixture({companies_verified_total:10})).status).toBe('conflict');expect(build(fixture(),NOW,'company-status','future').status).toBe('conflict')})
 it('closed_schema_rejects_executable_fields',()=>{const b=build();if(b.status!=='ok')throw Error();for(const v of [{...b.draft,agentId:'x'},{...b.draft,insight:{...b.draft.insight,action:{run:true}}},{...b.draft,manualSteps:[{run:true}]}])expect(validateAnalysisReviewDraft(v)).toBeNull()})
 it('key_order_and_clock_stable',()=>{const a=build(),b=build(fixture(),new Date('2026-10-13T00:10:00Z'));if(a.status!=='ok'||b.status!=='ok')throw Error();expect(a.draft.contentHash).toBe(b.draft.contentHash);expect(a.draft.insight.quality.collection?.today).not.toBe(b.draft.insight.quality.collection?.today)})
})
