import { canonicalJson } from '@/lib/atlas/mission/binding'
import { deriveHandlarborsenInsights,HANDLARBORSEN_INSIGHT_RULE_VERSION,type HandlarborsenInsight } from './handlarborsen-insights'
import { buildMarketplaceReport,type MarketplaceReport } from './handlarborsen-marketplace-report'
import { exactKeys,validateAnalysisSource,hashAnalysisSource,sha256,sourceReportRows,type AnalysisSourceEnvelopeV1 } from './analysis-source-binding'
export type AnalysisRuleId='company-status'|'bid-window'
export interface SaveSelector {ruleId:AnalysisRuleId;ruleVersion:string;expectedEvidenceHash:string}
export interface AnalysisReviewDraftV1 {schemaVersion:1;workflowKey:'handlarborsen.manual-insight-review';projectId:string;ruleId:AnalysisRuleId;ruleVersion:string;originalInsightId:string;evidenceHash:string;contentHash:string;sourceEnvelope:AnalysisSourceEnvelopeV1;insight:Extract<HandlarborsenInsight,{kind:'proposal'}>;manualSteps:readonly string[];evaluatedAt:string;freshUntil:string}
export function validateSaveSelector(v:unknown):v is SaveSelector {
 return exactKeys(v,['ruleId','ruleVersion','expectedEvidenceHash'])&&['company-status','bid-window'].includes(v.ruleId as string)&&typeof v.ruleVersion==='string'&&v.ruleVersion.length<=80&&typeof v.expectedEvidenceHash==='string'&&/^[0-9a-f]{64}$/.test(v.expectedEvidenceHash)
}
// Remove clock projections at every quality nesting, while retaining audit observations.
function stable(v:unknown):unknown {
 if(Array.isArray(v))return v.map(stable)
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['ageHours','today','todayDate','freshness'].includes(k)).map(([k,x])=>[k,stable(x)]))
 return v
}
export function stableOriginalInsightId(id:string):unknown {
 const prefix=HANDLARBORSEN_INSIGHT_RULE_VERSION+':'
 if(!id.startsWith(prefix))throw Error('invalid_p0_id')
 const parsed=JSON.parse(decodeURIComponent(id.slice(prefix.length)))
 if(!Array.isArray(parsed)||parsed.length!==8)throw Error('invalid_p0_id')
 // Array slot 2 is the clock-derived freshness category in P0's actual ID schema.
 return [HANDLARBORSEN_INSIGHT_RULE_VERSION,...parsed.map((v,i)=>i===2?null:stable(v))]
}
export function analysisContentProjection(d:AnalysisReviewDraftV1):unknown {
 const {id:_id,...insight}=d.insight
 return {schemaVersion:d.schemaVersion,templateVersion:1,workflowKey:d.workflowKey,projectId:d.projectId,ruleId:d.ruleId,ruleVersion:d.ruleVersion,originalInsightIdentity:stableOriginalInsightId(d.originalInsightId),evidenceHash:d.evidenceHash,insight:stable(insight),manualSteps:d.manualSteps}
}
export function buildAnalysisReviewDraft(source:AnalysisSourceEnvelopeV1,_report:MarketplaceReport,selector:SaveSelector,now:Date):{status:'ok';draft:AnalysisReviewDraftV1}|{status:'conflict'} {
 try {
 if(!validateAnalysisSource(source)||!validateSaveSelector(selector)||selector.ruleVersion!==HANDLARBORSEN_INSIGHT_RULE_VERSION||!source.auditReadable||!source.runs.length||source.runs[0].status==='error'||hashAnalysisSource(source)!==selector.expectedEvidenceHash)return {status:'conflict'}
 const report=buildMarketplaceReport(sourceReportRows(source),now,source.runs)
 if(!report.collection?.lastAttempt||report.collection.latestAttemptFailed)return {status:'conflict'}
 const insight=deriveHandlarborsenInsights(report,now).insights.find(i=>i.rule===selector.ruleId&&i.kind==='proposal')
 if(!insight||insight.kind!=='proposal'||!report.latest)return {status:'conflict'}
 const draft:AnalysisReviewDraftV1={schemaVersion:1,workflowKey:'handlarborsen.manual-insight-review',projectId:source.projectId,ruleId:selector.ruleId,ruleVersion:selector.ruleVersion,originalInsightId:insight.id,evidenceHash:selector.expectedEvidenceHash,contentHash:'',sourceEnvelope:structuredClone(source),insight,manualSteps:['Granska den citerade rapporten',insight.nextCheck,'Dokumentera resultatet utanför detta analysutkast'],evaluatedAt:now.toISOString(),freshUntil:new Date(Date.parse(report.latest.observedAt)+26*3600000).toISOString()}
 draft.contentHash=sha256(canonicalJson(analysisContentProjection(draft)))
 return {status:'ok',draft}
 }catch{return {status:'conflict'}}
}
export function validateAnalysisReviewDraft(v:unknown):AnalysisReviewDraftV1|null {
 if(!exactKeys(v,['schemaVersion','workflowKey','projectId','ruleId','ruleVersion','originalInsightId','evidenceHash','contentHash','sourceEnvelope','insight','manualSteps','evaluatedAt','freshUntil']))return null
 const s=validateAnalysisSource(v.sourceEnvelope);if(!s||typeof v.evaluatedAt!=='string')return null
 const b=buildAnalysisReviewDraft(s,buildMarketplaceReport(sourceReportRows(s),new Date(v.evaluatedAt),s.runs),{ruleId:v.ruleId as AnalysisRuleId,ruleVersion:v.ruleVersion as string,expectedEvidenceHash:v.evidenceHash as string},new Date(v.evaluatedAt))
 return b.status==='ok'&&canonicalJson(b.draft)===canonicalJson(v)?b.draft:null
}
