import {makeReviewContext,makeSnapshotInput,makeReviewBinding,makeModelResult,NOW,unwrap} from './sdf-review-fixtures'
import {codeWorkAdmissionHash} from '@/lib/atlas/code-work/binding'
import {reviewPolicyHash} from '@/lib/atlas/code-work/review/binding'
import type {StoredReviewJobV1,StorageActor} from '@/lib/atlas/code-work/review/storage/types'
export {NOW,unwrap}
export function makeStorageJob():StoredReviewJobV1{
 const c=makeReviewContext()
 return {workId:c.admission.workId,projectId:c.admission.projectId,version:0,config:{
 admission:c.admission,admissionHash:codeWorkAdmissionHash(c.admission),
 parent:{workId:c.admission.workId,claimId:'broker-claim',fence:1,brokerId:'broker-1',brokerHostId:'host-1'},
 createdAtMs:NOW,authorizationExpiresAtMs:NOW+3600000,targetHeadSha:c.targetHeadSha,
 policyHash:reviewPolicyHash(),requiredChecks:c.requiredChecks,limits:c.limits,
 budget:{totalMicrousd:100000,reviewerAllocationMicrousd:30000},deadlineMs:c.deadlineMs,
 coordinator:c.assignment.coordinator,worker:c.assignment.worker},
 candidates:[],messages:{workId:c.admission.workId,projectId:c.admission.projectId,entries:[]},commands:[]}
}
export function storageActor(j=makeStorageJob(),role:'atlas'|'worker'|'reviewer'='atlas'):StorageActor{
 return {role,...(role==='atlas'?j.config.coordinator:role==='worker'?j.config.worker:j.candidates.at(-1)!.snapshot.assignment.reviewer)}
}
export function freezeCommand(j=makeStorageJob(),candidate:1|2=1){
 const c=makeReviewContext();Object.assign(c,{admission:j.config.admission,targetHeadSha:j.config.targetHeadSha,requiredChecks:j.config.requiredChecks,limits:j.config.limits,budget:{...j.config.budget,spentMicrousd:0,reservedReviewerMicrousd:0},deadlineMs:j.config.deadlineMs})
 c.assignment={workId:j.workId,projectId:j.projectId,coordinator:j.config.coordinator,worker:j.config.worker,reviewer:{actorId:'reviewer-'+candidate,sessionId:'reviewer-session-'+candidate},claim:{id:'review-claim-'+candidate,fence:1,expiresAt:new Date(Math.min(j.config.deadlineMs,j.config.authorizationExpiresAtMs)).toISOString()},policyHash:j.config.policyHash}
 const snapshotInput=makeSnapshotInput(c);snapshotInput.binding=makeReviewBinding(c);snapshotInput.candidateVersion=candidate
 if(candidate===2)snapshotInput.artifacts.find(x=>x.id==='after')!.body='corrected'
 return {id:'freeze-'+candidate,kind:'freeze' as const,snapshotInput}
}
export function reportCommand(j:StoredReviewJobV1,phase:'preliminary'|'final'='preliminary',decision:'passed'|'changes_requested'|'inconclusive'='passed'){
 const c=j.candidates.at(-1)!;return {id:phase+'-'+c.version,kind:'report' as const,candidateVersion:c.version,result:{...makeModelResult(c.snapshot.snapshotHash),phase,decision}}
}
export function messageCommand(j:StoredReviewJobV1,n=1,to:'atlas'|'worker'|'reviewer'='worker'){
 const c=j.candidates.at(-1)!;return{id:'message-command-'+n,kind:'message' as const,candidateVersion:c.version,recipientRole:to,body:{schema:'atlas.code_review_message.v1' as const,id:'message-'+n,snapshotHash:c.snapshot.snapshotHash,kind:'question' as const,body:'Please clarify.',replyTo:null,artifactIds:[]}}
}
