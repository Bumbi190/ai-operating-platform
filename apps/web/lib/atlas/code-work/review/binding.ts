import {canonicalTargetVersionHash} from '../../authorization/build'
import {codeWorkAdmissionHash} from '../binding'
import {codeWorkCommandRegistryHash,resolveCommandInvocation} from '../command-registry'
import {validateCodeWorkAdmission} from '../policy'
import type {CodeWorkValidation} from '../types'
import {REVIEW_CONTRACT_LIMITS} from './types'
import type {ExpectedReviewContext,ReviewAssignmentV1,ReviewBindingV1} from './types'
import {attempt,ensure,exact,freeze,gitHash,hash,id,integer,iso,jsonCopy,list,requireValid,unique} from './validation'
export function reviewPolicyHash():string{return canonicalTargetVersionHash({schema:'atlas.code_review_policy.v1',limits:REVIEW_CONTRACT_LIMITS})}
export function reviewSettingsHash(c:ExpectedReviewContext):string{return canonicalTargetVersionHash({limits:c.limits,totalMicrousd:c.budget.totalMicrousd,reviewerAllocationMicrousd:c.budget.reviewerAllocationMicrousd,deadlineMs:c.deadlineMs,requiredChecks:c.requiredChecks.map(check=>({...check})).sort((a,b)=>a.commandId<b.commandId?-1:a.commandId>b.commandId?1:0)})}
function assignmentShape(a:any):void {
 exact(a,['workId','projectId','coordinator','worker','reviewer','claim','policyHash']);id(a.workId);id(a.projectId);hash(a.policyHash)
 for(const actor of[a.coordinator,a.worker,a.reviewer]){exact(actor,['actorId','sessionId']);id(actor.actorId);id(actor.sessionId)}
 unique([a.coordinator.actorId,a.worker.actorId,a.reviewer.actorId]);unique([a.coordinator.sessionId,a.worker.sessionId,a.reviewer.sessionId])
 exact(a.claim,['id','fence','expiresAt']);id(a.claim.id);integer(a.claim.fence,1);iso(a.claim.expiresAt)
}
export function validateReviewContext(input:unknown):CodeWorkValidation<ExpectedReviewContext>{return attempt(()=>{
 const c=jsonCopy(input);exact(c,['admission','assignment','policyHash','targetHeadSha','nowMs','cancelled','claimValid','requiredChecks','limits','budget','deadlineMs'])
 c.admission=requireValid(validateCodeWorkAdmission(c.admission));assignmentShape(c.assignment)
 hash(c.policyHash);ensure(c.policyHash===reviewPolicyHash()&&c.assignment.policyHash===c.policyHash,'policy_mismatch')
 ensure(c.assignment.workId===c.admission.workId&&c.assignment.projectId===c.admission.projectId,'assignment_scope_mismatch')
 id(c.admission.workId);id(c.admission.projectId);id(c.admission.governance.mission.id)
 gitHash(c.targetHeadSha);integer(c.nowMs);integer(c.deadlineMs)
 ensure(Number.isFinite(new Date(c.nowMs).getTime())&&Number.isFinite(new Date(c.deadlineMs).getTime()),'timestamp_invalid')
 ensure(c.deadlineMs-c.nowMs<=c.admission.limits.maxTotalRuntimeSeconds*1000,'deadline_limit_exceeded')
 ensure(typeof c.cancelled==='boolean'&&typeof c.claimValid==='boolean','boolean_required')
 exact(c.limits,Object.keys(REVIEW_CONTRACT_LIMITS))
 for(const key of Object.keys(REVIEW_CONTRACT_LIMITS)as(keyof typeof REVIEW_CONTRACT_LIMITS)[])integer(c.limits[key],1,REVIEW_CONTRACT_LIMITS[key])
 exact(c.budget,['totalMicrousd','reviewerAllocationMicrousd','spentMicrousd','reservedReviewerMicrousd'])
 integer(c.budget.totalMicrousd,1);integer(c.budget.reviewerAllocationMicrousd,1,c.budget.totalMicrousd);integer(c.budget.spentMicrousd);integer(c.budget.reservedReviewerMicrousd,0,c.budget.reviewerAllocationMicrousd)
 ensure(c.budget.spentMicrousd<=c.budget.totalMicrousd-c.budget.reservedReviewerMicrousd,'budget_exceeded')
 list(c.requiredChecks,c.admission.commands.approvedCommandIds.length,1);unique(c.requiredChecks.map((x:any)=>x.commandId))
 for(const check of c.requiredChecks){
  exact(check,['commandId','commandVersion','arguments','registryHash','argvHash','minPassedTests']);id(check.commandId)
  ensure(c.admission.commands.approvedCommandIds.includes(check.commandId),'command_not_admitted')
  ensure(check.registryHash===codeWorkCommandRegistryHash()&&check.registryHash===c.admission.commands.registryHash,'registry_mismatch')
  const command=requireValid(resolveCommandInvocation({commandId:check.commandId,version:check.commandVersion,arguments:check.arguments}))
  ensure(check.argvHash===canonicalTargetVersionHash(command.argv),'argv_mismatch')
  if(check.commandId==='sdf1.proof.fixture_test')integer(check.minPassedTests,1);else ensure(check.minPassedTests===null,'test_floor_invalid')
 }
 return freeze(c as ExpectedReviewContext)
})}
export function validateLiveReviewContext(input:ExpectedReviewContext):CodeWorkValidation<ExpectedReviewContext>{return attempt(()=>{
 const c=requireValid(validateReviewContext(input))
 ensure(!c.cancelled,'cancelled');ensure(c.claimValid,'claim_invalid');ensure(Date.parse(c.assignment.claim.expiresAt)>c.nowMs,'claim_expired');ensure(c.deadlineMs>c.nowMs,'deadline_exceeded');return c
})}
export function validateReviewAssignment(input:unknown,context:ExpectedReviewContext):CodeWorkValidation<ReviewAssignmentV1>{return attempt(()=>{
 const c=requireValid(validateReviewContext(context)),a=jsonCopy(input);assignmentShape(a)
 ensure(canonicalTargetVersionHash(a)===canonicalTargetVersionHash(c.assignment),'assignment_mismatch');return freeze(a as ReviewAssignmentV1)
})}
/** Structural validation is explicitly non-authoritative; only inert replay uses it after stop. */
export function validateReviewBindingStructure(input:unknown,context:ExpectedReviewContext):CodeWorkValidation<ReviewBindingV1>{return attempt(()=>{
 const c=requireValid(validateReviewContext(context)),b=jsonCopy(input)
 exact(b,['schema','workId','projectId','repositoryId','missionId','missionVersion','missionHash','admissionHash','delegationHash','workPackageHash','baseSha','targetRef','targetHeadSha','policyHash','reviewSettingsHash'])
 const a=c.admission
 const expected={schema:'atlas.code_review_binding.v1',workId:a.workId,projectId:a.projectId,repositoryId:a.repository.repositoryId,missionId:a.governance.mission.id,missionVersion:a.governance.mission.version,missionHash:a.governance.mission.hash,admissionHash:codeWorkAdmissionHash(a),delegationHash:a.governance.delegation.hash,workPackageHash:a.governance.workPackage.hash,baseSha:a.repository.pinnedBaseSha,targetRef:a.repository.approvedBaseRef,targetHeadSha:c.targetHeadSha,policyHash:c.policyHash,reviewSettingsHash:reviewSettingsHash(c)}
 ensure(canonicalTargetVersionHash(b)===canonicalTargetVersionHash(expected),'binding_mismatch')
 return freeze(b as ReviewBindingV1)
})}
export function validateReviewBinding(input:unknown,context:ExpectedReviewContext):CodeWorkValidation<ReviewBindingV1>{return attempt(()=>{
 const c=requireValid(validateLiveReviewContext(context));return requireValid(validateReviewBindingStructure(input,c))
})}
