import {describe,it,expect} from 'vitest'
import {buildReviewSnapshot} from '@/lib/atlas/code-work/review/snapshot'
import {bindReviewResult} from '@/lib/atlas/code-work/review/result'
import {evaluateReviewEligibility} from '@/lib/atlas/code-work/review/eligibility'
import {makeReviewContext,makeSnapshotInput,makeModelResult,makeFinding,unwrap} from './fixtures/sdf-review-fixtures'
describe('review contract composition without execution',()=>{
 it('requires a fresh review after a requested correction',()=>{
  const c=makeReviewContext(),s1=unwrap(buildReviewSnapshot(makeSnapshotInput(c),c)),m1=makeModelResult(s1.snapshotHash);m1.decision='changes_requested';m1.findings=[{...makeFinding(),severity:'important'}]
  const r1=unwrap(bindReviewResult(m1,s1,c));expect(evaluateReviewEligibility(s1,r1,c).eligible).toBe(false)
  const input=makeSnapshotInput(c);input.candidateVersion=2;input.artifacts.find(a=>a.id==='after')!.body='corrected'
  const s2=unwrap(buildReviewSnapshot(input,c));expect(evaluateReviewEligibility(s2,r1,c).eligible).toBe(false)
  const r2=unwrap(bindReviewResult(makeModelResult(s2.snapshotHash),s2,c));expect(evaluateReviewEligibility(s2,r2,c)).toEqual({eligible:true,productionAuthority:false,reasons:[],minorFindingIds:[]})
 })
 it('cannot replay a prior passed candidate or stale supplied assignment',()=>{
  const c=makeReviewContext(),s1=unwrap(buildReviewSnapshot(makeSnapshotInput(c),c)),r1=unwrap(bindReviewResult(makeModelResult(s1.snapshotHash),s1,c)),input=makeSnapshotInput(c);input.candidateVersion=2
  const s2=unwrap(buildReviewSnapshot(input,c));expect(evaluateReviewEligibility(s2,r1,c).eligible).toBe(false)
  const r2=unwrap(bindReviewResult(makeModelResult(s2.snapshotHash),s2,c));c.assignment.claim.fence++;expect(evaluateReviewEligibility(s2,r2,c).eligible).toBe(false)
 })
 it('missing source, changed target and cancellation cannot become eligible',()=>{
  const c=makeReviewContext(),input=makeSnapshotInput(c);input.artifacts=input.artifacts.filter(a=>a.id!=='before');expect(buildReviewSnapshot(input,c).ok).toBe(false)
  const s=unwrap(buildReviewSnapshot(makeSnapshotInput(c),c)),r=unwrap(bindReviewResult(makeModelResult(s.snapshotHash),s,c))
  const target=structuredClone(c);target.targetHeadSha='d'.repeat(40);expect(evaluateReviewEligibility(s,r,target).eligible).toBe(false)
  c.cancelled=true;expect(evaluateReviewEligibility(s,r,c).eligible).toBe(false)
 })
})
