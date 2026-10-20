import {canonicalTargetVersionHash as pin} from '../../../authorization/build'
import {codeWorkAdmissionHash} from '../../binding'
import type {CodeWorkValidation} from '../../types'
import {reviewPolicyHash,reviewSettingsHash,validateReviewContext,validateLiveReviewContext} from '../binding'
import {buildReviewSnapshot} from '../snapshot'
import {bindReviewResult} from '../result'
import {appendReviewMessage} from '../messages'
import type {ExpectedReviewContext,ReviewAssignmentV1,ReviewBindingV1,ReviewSnapshotV1,ReviewSnapshotInputV1} from '../types'
import {attempt,ensure,exact,freeze,hash,id,integer,jsonCopy,list,requireValid,unique} from '../validation'
import {REVIEW_STORAGE_MAX_BYTES} from './types'
import type {CommandReceipt,PrepareResult,ReviewStorageCommand,StorageActor,StoredReviewJobV1} from './types'
const same=(a:unknown,b:unknown)=>pin(a)===pin(b)
const clone=(x:unknown)=>jsonCopy(x,REVIEW_STORAGE_MAX_BYTES)
const actorKeys=['role','actorId','sessionId']
function roleActor(job:StoredReviewJobV1,a:StorageActor,candidate?:number):void{
 exact(a,actorKeys);id(a.actorId);id(a.sessionId)
 const assigned=a.role==='atlas'?job.config.coordinator:a.role==='worker'?job.config.worker:a.role==='reviewer'?job.candidates.find(c=>c.version===candidate)?.snapshot.assignment.reviewer:null
 ensure(assigned&&same(assigned,{actorId:a.actorId,sessionId:a.sessionId}),'actor_not_assigned')
}
export function storageContext(job:StoredReviewJobV1,assignment:ReviewAssignmentV1,nowMs:number,parentLive:boolean):ExpectedReviewContext{
 const c=job.config
 ensure(same(assignment.coordinator,c.coordinator)&&same(assignment.worker,c.worker),'assignment_config_mismatch')
 ensure(assignment.claim.id!==c.parent.claimId&&assignment.claim.expiresAt===new Date(Math.min(c.deadlineMs,c.authorizationExpiresAtMs)).toISOString(),'review_claim_mismatch')
 return requireValid(validateReviewContext({admission:c.admission,assignment,policyHash:c.policyHash,targetHeadSha:c.targetHeadSha,nowMs,cancelled:!parentLive,claimValid:parentLive,requiredChecks:c.requiredChecks,limits:c.limits,budget:{...c.budget,spentMicrousd:0,reservedReviewerMicrousd:0},deadlineMs:c.deadlineMs}))
}
export function storageBinding(c:ExpectedReviewContext):ReviewBindingV1{
 const a=c.admission
 return{schema:'atlas.code_review_binding.v1',workId:a.workId,projectId:a.projectId,repositoryId:a.repository.repositoryId,missionId:a.governance.mission.id,missionVersion:a.governance.mission.version,missionHash:a.governance.mission.hash,admissionHash:codeWorkAdmissionHash(a),delegationHash:a.governance.delegation.hash,workPackageHash:a.governance.workPackage.hash,baseSha:a.repository.pinnedBaseSha,targetRef:a.repository.approvedBaseRef,targetHeadSha:c.targetHeadSha,policyHash:c.policyHash,reviewSettingsHash:reviewSettingsHash(c)}
}
export function snapshotInputOf(s:ReviewSnapshotV1):ReviewSnapshotInputV1{
 const{snapshotHash:_,...input}=s;return{...input,artifacts:s.artifacts.map(({id,kind,body})=>({id,kind,body}))}
}
function commandShape(input:unknown):ReviewStorageCommand{
 const x=clone(input);id(x?.id)
 if(x.kind==='freeze')exact(x,['id','kind','snapshotInput'])
 else if(x.kind==='report'){exact(x,['id','kind','candidateVersion','result']);integer(x.candidateVersion,1,2)}
 else {ensure(x.kind==='message','command_kind_invalid');exact(x,['id','kind','candidateVersion','recipientRole','body']);integer(x.candidateVersion,1,2);ensure(['atlas','worker','reviewer'].includes(x.recipientRole),'role_invalid')}
 return x as ReviewStorageCommand
}
function normalized(job:StoredReviewJobV1,x:ReviewStorageCommand):ReviewStorageCommand{
 if(x.kind!=='freeze')return x
 const ctx=storageContext(job,x.snapshotInput.assignment,job.config.createdAtMs,true)
 return{...x,snapshotInput:snapshotInputOf(requireValid(buildReviewSnapshot(x.snapshotInput,ctx)))}
}
export function reviewStorageCommandHash(command:ReviewStorageCommand,actor:StorageActor):string{
 return pin({domain:'atlas.code_review_storage_command.v1',command,actor})
}
function content(s:ReviewSnapshotV1):string{
 const{binding:_,assignment:__,snapshotHash:___,candidateVersion:____,...evidence}=s
 return pin(evidence)
}
function appendNew(job:StoredReviewJobV1,cmd:ReviewStorageCommand,actor:StorageActor,nowMs:number,parentLive:boolean):StoredReviewJobV1{
 integer(nowMs);ensure(parentLive,'parent_not_live');ensure(nowMs>=job.config.createdAtMs&&nowMs<job.config.deadlineMs&&nowMs<job.config.authorizationExpiresAtMs,'storage_time_invalid')
 ensure(nowMs>=(job.commands.at(-1)?.observedAtMs??job.config.createdAtMs),'clock_regressed')
 const j=clone(job) as StoredReviewJobV1
 const cv=cmd.kind==='freeze'?cmd.snapshotInput.candidateVersion:cmd.candidateVersion
 roleActor(j,actor,cv)
 let payloadRef:string
 if(cmd.kind==='freeze'){
  ensure(actor.role==='atlas','freeze_role_forbidden')
  ensure(cv===j.candidates.length+1&&cv<=j.config.limits.maxReviewSessions,'candidate_order_invalid')
  if(cv===2)ensure(j.candidates[0].final?.decision==='changes_requested','candidate_not_requested')
  const s=requireValid(buildReviewSnapshot(cmd.snapshotInput,storageContext(j,cmd.snapshotInput.assignment,nowMs,true)))
  if(cv===2)ensure(content(s)!==content(j.candidates[0].snapshot),'candidate_unchanged')
  const assignments=j.candidates.map(c=>c.snapshot.assignment)
  ensure(assignments.every(a=>a.reviewer.actorId!==s.assignment.reviewer.actorId&&a.reviewer.sessionId!==s.assignment.reviewer.sessionId&&a.claim.id!==s.assignment.claim.id),'reviewer_reused')
  j.candidates.push({version:cv,snapshot:s,preliminary:null,final:null});payloadRef=s.snapshotHash
 }else{
  const c=j.candidates.find(c=>c.version===cv);ensure(c&&cv===j.candidates.length,'candidate_stale')
  const ctx=storageContext(j,c.snapshot.assignment,nowMs,true);requireValid(validateLiveReviewContext(ctx))
  ensure(c.final===null,'candidate_closed')
  if(cmd.kind==='report'){
   ensure(actor.role==='reviewer','report_role_forbidden')
   const r=requireValid(bindReviewResult(cmd.result,c.snapshot,ctx))
   if(r.phase==='preliminary'){ensure(c.preliminary===null,'preliminary_exists');c.preliminary=r}
   else {ensure(c.preliminary!==null,'preliminary_required');c.final=r}
   payloadRef=r.resultHash
  }else{
   ensure(!(cmd.recipientRole==='reviewer'&&c.preliminary===null),'first_assessment_embargo')
   const m=requireValid(appendReviewMessage(j.messages,cmd.body,{expected:ctx,snapshot:c.snapshot,senderRole:actor.role,recipientRole:cmd.recipientRole,phase:c.preliminary?'discussion':'initial',firstAssessment:c.preliminary,senderActorId:actor.actorId,senderSessionId:actor.sessionId}))
   ensure(m.outcome==='appended','message_command_alias');j.messages=m.ledger;payloadRef=cmd.body.id
  }
 }
 ensure(j.commands.length<18,'storage_command_limit')
 j.version++
 j.commands.push({id:cmd.id,kind:cmd.kind,...actor,candidateVersion:cv,commandHash:reviewStorageCommandHash(cmd,actor),jobVersion:j.version,observedAtMs:nowMs,payloadRef})
 clone(j);return freeze(j)
}
function configShape(j:StoredReviewJobV1):void{
 exact(j,['workId','projectId','version','config','candidates','messages','commands']);id(j.workId);id(j.projectId);integer(j.version,0,18)
 const c=j.config;exact(c,['admission','admissionHash','parent','createdAtMs','authorizationExpiresAtMs','targetHeadSha','policyHash','requiredChecks','limits','budget','deadlineMs','coordinator','worker'])
 hash(c.admissionHash);ensure(c.admissionHash===codeWorkAdmissionHash(c.admission)&&c.admission.workId===j.workId&&c.admission.projectId===j.projectId,'stored_admission_mismatch')
 exact(c.parent,['workId','claimId','fence','brokerId','brokerHostId']);ensure(c.parent.workId===j.workId,'parent_scope_mismatch');for(const k of ['workId','claimId','brokerId','brokerHostId']as const)id(c.parent[k]);integer(c.parent.fence,1)
 exact(c.budget,['totalMicrousd','reviewerAllocationMicrousd'])
 for(const a of[c.coordinator,c.worker]){exact(a,['actorId','sessionId']);id(a.actorId);id(a.sessionId)}
 unique([c.coordinator.actorId,c.worker.actorId]);unique([c.coordinator.sessionId,c.worker.sessionId])
 integer(c.createdAtMs);integer(c.authorizationExpiresAtMs,c.createdAtMs+1);integer(c.deadlineMs,c.createdAtMs+1);ensure(c.deadlineMs<=c.authorizationExpiresAtMs,'deadline_authorization_mismatch')
 ensure(c.policyHash===reviewPolicyHash(),'policy_mismatch')
 const unused=(base:string)=>{let a=base;while([c.coordinator.actorId,c.worker.actorId,c.coordinator.sessionId,c.worker.sessionId].includes(a))a+='x';return a}
 storageContext(j,{workId:j.workId,projectId:j.projectId,coordinator:c.coordinator,worker:c.worker,reviewer:{actorId:unused('validation-reviewer'),sessionId:unused('validation-session')},claim:{id:unused('validation-claim'),fence:1,expiresAt:new Date(Math.min(c.deadlineMs,c.authorizationExpiresAtMs)).toISOString()},policyHash:c.policyHash},c.createdAtMs,true)
 list(j.candidates,2);list(j.commands,18);ensure(j.version===j.commands.length,'version_sequence_mismatch')
 exact(j.messages,['workId','projectId','entries']);list(j.messages.entries,12)
}
function reconstruct(j:StoredReviewJobV1):StoredReviewJobV1{
 configShape(j)
 let current:StoredReviewJobV1={...j,version:0,candidates:[],commands:[],messages:{workId:j.workId,projectId:j.projectId,entries:[]}}
 for(const receipt of j.commands){
  exact(receipt,['id','kind','role','actorId','sessionId','candidateVersion','commandHash','jobVersion','observedAtMs','payloadRef']);id(receipt.id);hash(receipt.commandHash);integer(receipt.candidateVersion,1,2);integer(receipt.jobVersion,1,18);integer(receipt.observedAtMs);id(receipt.payloadRef)
  ensure(!current.commands.some(r=>r.id===receipt.id),'command_id_conflict')
  const candidate=j.candidates.find(c=>c.version===receipt.candidateVersion);ensure(candidate,'candidate_missing');exact(candidate,['version','snapshot','preliminary','final'])
  let command:ReviewStorageCommand
  if(receipt.kind==='freeze')command={id:receipt.id,kind:'freeze',snapshotInput:snapshotInputOf(candidate.snapshot)}
  else if(receipt.kind==='report'){
   const result=[candidate.preliminary,candidate.final].find(r=>r?.resultHash===receipt.payloadRef);ensure(result,'result_missing')
   const{assignment:_,resultHash:__,...model}=result;command={id:receipt.id,kind:'report',candidateVersion:receipt.candidateVersion,result:model}
  }else{
   ensure(receipt.kind==='message','command_kind_invalid')
   const m=j.messages.entries.find(e=>e.id===receipt.payloadRef);ensure(m,'message_missing')
   const{sequence:_,workId:__,projectId:___,from:____,to:_____,assignmentHash:______,observedAt:_______,messageHash:________,...body}=m
   command={id:receipt.id,kind:'message',candidateVersion:receipt.candidateVersion,recipientRole:m.to.role,body}
  }
  command=normalized(current,command)
  const actor={role:receipt.role,actorId:receipt.actorId,sessionId:receipt.sessionId}
  current=appendNew(current,command,actor,receipt.observedAtMs,true)
  ensure(same(current.commands.at(-1),receipt),'receipt_mismatch')
 }
 ensure(same(current,j),'stored_history_mismatch');return current
}
export function validateStoredReviewJob(input:unknown):CodeWorkValidation<StoredReviewJobV1>{return attempt(()=>freeze(reconstruct(clone(input))))}
export function prepareReviewAppend(job:StoredReviewJobV1,input:unknown,actor:StorageActor,observation:{nowMs:number;parentLive:boolean}):CodeWorkValidation<PrepareResult>{return attempt(()=>{
 const j=requireValid(validateStoredReviewJob(job));exact(observation,['nowMs','parentLive']);integer(observation.nowMs);ensure(typeof observation.parentLive==='boolean','parent_observation_invalid')
 const cmd=normalized(j,commandShape(input)),cv=cmd.kind==='freeze'?cmd.snapshotInput.candidateVersion:cmd.candidateVersion
 roleActor(j,actor,cv)
 const commandHash=reviewStorageCommandHash(cmd,actor),prior=j.commands.find(c=>c.id===cmd.id)
 if(prior){ensure(prior.commandHash===commandHash,'command_id_conflict');return freeze({expectedVersion:j.version,commandId:cmd.id,commandHash,next:j,outcome:'replayed' as const})}
 return freeze({expectedVersion:j.version,commandId:cmd.id,commandHash,next:appendNew(j,cmd,actor,observation.nowMs,observation.parentLive),outcome:'appended' as const})
})}
