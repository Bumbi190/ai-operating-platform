import {describe,it,expect} from 'vitest'
import {canonicalTargetVersionHash} from '@/lib/atlas/authorization/build'
import {buildReviewSnapshot} from '@/lib/atlas/code-work/review/snapshot'
import {parseReviewModelResult,bindReviewResult} from '@/lib/atlas/code-work/review/result'
import {evaluateReviewEligibility} from '@/lib/atlas/code-work/review/eligibility'
import {makeReviewContext,makeSnapshotInput,makeModelResult,makeFinding,unwrap} from './fixtures/sdf-review-fixtures'
function fixture(){const c=makeReviewContext(),s=unwrap(buildReviewSnapshot(makeSnapshotInput(c),c)),m=makeModelResult(s.snapshotHash);return{c,s,m}}
describe('separate reviewer results',()=>{
 it('only returns metadata for a current final passed report',()=>{const{c,s,m}=fixture(),r=unwrap(bindReviewResult(m,s,c));expect(evaluateReviewEligibility(s,r,c)).toEqual({eligible:true,productionAuthority:false,reasons:[],minorFindingIds:[]})})
 for(const change of [(m:any)=>m.reviewerActorId='worker',(m:any)=>m.claim={id:'forged'},(m:any)=>m.extra='x',(m:any)=>delete m.phase,(m:any)=>m.snapshotHash='c'.repeat(64),(m:any)=>m.decision='approved'])it('model_cannot_select_identity_or_unknown_fields '+change,()=>{const{c,s,m}=fixture();change(m);expect(parseReviewModelResult(m,s,c).ok).toBe(false)})
 for(const change of [(m:any)=>{m.findings=[{...makeFinding(),severity:'critical'}]},(m:any)=>{m.findings=[{...makeFinding(),severity:'important'}]},(m:any)=>m.gaps=['missing evidence'],(m:any)=>m.pendingQuestionIds=['q1']])it('final_passed_with_blocker_rejected '+change,()=>{const{c,s,m}=fixture();change(m);expect(bindReviewResult(m,s,c).ok).toBe(false)})
 for(const field of ['phase','decision']as const)it('nonfinal/nonpassed remains ineligible '+field,()=>{const{c,s,m}=fixture();if(field==='phase')m.phase='preliminary';else m.decision='changes_requested';const r=unwrap(bindReviewResult(m,s,c));expect(evaluateReviewEligibility(s,r,c).eligible).toBe(false)})
 it('inconclusive remains ineligible',()=>{const{c,s,m}=fixture();m.decision='inconclusive';m.gaps=['Cannot verify'];expect(evaluateReviewEligibility(s,unwrap(bindReviewResult(m,s,c)),c).eligible).toBe(false)})
 it('only_minors_remain_visible',()=>{const{c,s,m}=fixture();m.findings=[makeFinding()];expect(evaluateReviewEligibility(s,unwrap(bindReviewResult(m,s,c)),c).minorFindingIds).toEqual(['finding-1'])})
 for(const change of [(r:any)=>r.resultHash='c'.repeat(64),(r:any)=>r.assignment.reviewer.actorId='worker',(r:any)=>r.findings=[makeFinding()]])it('mutated_result_hash_or_assignment_rejected '+change,()=>{const{c,s,m}=fixture(),r=structuredClone(unwrap(bindReviewResult(m,s,c)));change(r);expect(evaluateReviewEligibility(s,r,c).eligible).toBe(false)})
 for(const change of [(c:any)=>c.targetHeadSha='c'.repeat(40),(c:any)=>c.admission.governance.mission.hash='c'.repeat(64),(c:any)=>c.cancelled=true,(c:any)=>c.claimValid=false,(c:any)=>c.nowMs=Date.parse(c.assignment.claim.expiresAt),(c:any)=>c.budget.spentMicrousd=c.budget.totalMicrousd])it('changed_live_context_invalidates_result '+change,()=>{const{c,s,m}=fixture(),r=unwrap(bindReviewResult(m,s,c));change(c);const d=evaluateReviewEligibility(s,r,c);expect(d.eligible).toBe(false);expect(d.productionAuthority).toBe(false)})
 for(const change of [(m:any)=>m.findings[0].artifactId='missing',(m:any)=>m.findings[0].path='other.ts',(m:any)=>m.findings[0].line=-1,(m:any)=>m.findings[0].line=1.5,(m:any)=>m.findings[0].evidence='  ',(m:any)=>m.findings.push({...m.findings[0]}),(m:any)=>m.findings[0].extra=true])it('rejects malformed finding '+change,()=>{const{c,s,m}=fixture();m.findings=[makeFinding()];change(m);expect(bindReviewResult(m,s,c).ok).toBe(false)})
 it('rejects duplicate question ids',()=>{const{c,s,m}=fixture();m.phase='preliminary';m.pendingQuestionIds=['q1','q1'];expect(bindReviewResult(m,s,c).ok).toBe(false)})
 it('enforces exact 32768/32769 UTF8 model output bytes',()=>{
  const{c,s,m}=fixture();m.phase='preliminary';m.decision='inconclusive';m.gaps=['å']
  while(new TextEncoder().encode(JSON.stringify(m)).length<32768){const remaining=32768-new TextEncoder().encode(JSON.stringify(m)).length;const i=m.gaps.length-1;const free=4096-new TextEncoder().encode(m.gaps[i]).length;if(free===0){m.gaps.push('');continue}m.gaps[i]+='x'.repeat(Math.min(free,remaining))}
  expect(new TextEncoder().encode(JSON.stringify(m)).length).toBe(32768);expect(parseReviewModelResult(m,s,c).ok).toBe(true)
  m.gaps[m.gaps.length-1]+='x';expect(parseReviewModelResult(m,s,c).ok).toBe(false)
 })
 it('does not accept a self-consistent report for another assigned session',()=>{const{c,s,m}=fixture(),r=structuredClone(unwrap(bindReviewResult(m,s,c)));r.assignment.reviewer.sessionId='foreign';const{assignment,resultHash,...result}=r;r.resultHash=canonicalTargetVersionHash({domain:'atlas.bound_code_review_result.v1',result,assignment});expect(evaluateReviewEligibility(s,r,c).eligible).toBe(false)})
})
