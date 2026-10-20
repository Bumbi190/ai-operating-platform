import {verifyBoundReviewResult} from './result'
import type {ExpectedReviewContext,ReviewSnapshotV1,BoundReviewResultV1,ReviewEligibilityDecision} from './types'
/** A pure descriptive decision; no production caller, authenticated provenance, grant or lifecycle transition. */
export function evaluateReviewEligibility(snapshot:ReviewSnapshotV1,result:BoundReviewResultV1,context:ExpectedReviewContext):ReviewEligibilityDecision {
 const verified=verifyBoundReviewResult(result,snapshot,context)
 if(!verified.ok)return{eligible:false,productionAuthority:false,reasons:[...new Set(verified.violations.map(v=>v.code))].sort(),minorFindingIds:[]}
 const r=verified.value,reasons:string[]=[]
 if(r.phase!=='final')reasons.push('preliminary')
 if(r.decision!=='passed')reasons.push(r.decision)
 if(r.findings.some(f=>f.severity!=='minor'))reasons.push('blocking_findings')
 if(r.gaps.length)reasons.push('review_gaps')
 if(r.pendingQuestionIds.length)reasons.push('pending_questions')
 return{eligible:reasons.length===0,productionAuthority:false,reasons:reasons.sort(),minorFindingIds:r.findings.filter(f=>f.severity==='minor').map(f=>f.id).sort()}
}
