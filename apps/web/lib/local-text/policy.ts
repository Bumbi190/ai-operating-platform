import 'server-only'
import {randomUUID} from 'node:crypto'
import {canonicalJson,sha256,hashTask,isUuid,isSha256,parseTask,parseClaim} from '@omnira/local-text-contract'
import type {Task,VerifiedContext,SelectionDecision,Claim,Db,TransitionResult} from './types'

export type Qualification={candidateId:string;taskKind:Task['kind'];modelDigest:string;runtimeVersion:string;runtimeHash:string;templateHash:string;schemaHash:string;adapterHash:string;configurationHash:string;tokenizerEvidenceHash:string;review:{status:'approved'|'unknown'|'rejected';corpus:string;cases:number;accuracy:number;invented:number;injectionPasses:number;reviewRunId:string};license:{permission:'allowed'|'unknown'|'denied';evidenceHash:string};p95Ms:number}
export type CandidateEvidence={qualification:Qualification;evidenceHash:string;deployment:{id:string;deviceId:string;ownerId:string;status:string;expiresAt:string;healthAt:string;healthState:string;lifecycleLock:string;gpuAvailable:boolean;runtimeVersion:string;runtimeHash:string;adapterHash:string;configurationHash:string;modelDigests:string[];warmDigest:string|null};admission:{id:string;projectId:string;deviceId:string;deploymentId:string;taskKind:Task['kind'];status:string;qualificationStatus:string;evidenceHash:string;modelDigest:string;dataClass:string;placement:string;policyVersion:string;approvedInputHashes:string[];expiresAt:string;jobCostCapUsd:number;dailyCostCapUsd:number}}
/** Preselection has no chosen admission. The selected admission is bound before enqueue.
 * Callers must derive this from owned server records, never from tool/model fields. */
export type SelectionContext=Omit<VerifiedContext,'admissionId'>&{cloud?:{authorized:boolean;reviewReady:boolean;taskReady:boolean;pricingVerified:boolean;reservationUsd:number;dailyRemainingUsd:number}}
export type SelectionOutcome={kind:'selected';decision:SelectionDecision}|{kind:'needs_input'|'cloud_eligible';reason:string}
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)
const future=(v:string,now:number)=>Number.isFinite(Date.parse(v))&&Date.parse(v)>now
const supported:Record<Task['kind'],string[]>={classify:['qwen3.5:4b','qwen3.5:9b'],extract:['qwen3.5:4b'],summarize:['qwen3:8b']}
export function qualificationValid(q:Qualification,evidenceHash:string):boolean{
 try{return supported[q.taskKind]?.includes(q.candidateId)===true&&/^sha256:[a-f0-9]{64}$/.test(q.modelDigest)&&[q.runtimeHash,q.templateHash,q.schemaHash,q.adapterHash,q.configurationHash,q.tokenizerEvidenceHash,q.license.evidenceHash,evidenceHash].every(isSha256)&&/^\d+\.\d+\.\d+$/.test(q.runtimeVersion)&&q.review.status==='approved'&&q.review.corpus==='sv-atlas-v2'&&Number.isInteger(q.review.cases)&&q.review.cases>=25&&finite(q.review.accuracy)&&q.review.accuracy>=(q.taskKind==='summarize'?1:0.9)&&q.review.accuracy<=1&&q.review.invented===0&&q.review.injectionPasses===0&&isUuid(q.review.reviewRunId)&&q.license.permission==='allowed'&&finite(q.p95Ms)&&q.p95Ms>0&&q.p95Ms<=90000&&sha256(canonicalJson(q))===evidenceHash}catch{return false}
}
export function selectLocalText(input:{jobId:string;inputHash:string;task:Task;context:SelectionContext;candidates:CandidateEvidence[];now:Date}):SelectionOutcome{
 const {context:c,now}=input,at=now.getTime();let task:Task
 try{task=parseTask(input.task)}catch{return {kind:'needs_input',reason:'INVALID_TASK'}}
 if(!Number.isFinite(at)||!isUuid(input.jobId)||!isSha256(input.inputHash)||hashTask(task)!==input.inputHash||![c.userId,c.projectId,c.conversationId].every(isUuid)||c.policyVersion!=='local_assist_v1')return {kind:'needs_input',reason:'CONTEXT_UNVERIFIED'}
 if(!['synthetic','approved_cloud_text'].includes(c.dataClass)||c.placement!=='cloud_control_review_allowed')return {kind:'needs_input',reason:'PLACEMENT_REFUSED'}
 if(!future(c.deadlineAt,at))return {kind:'needs_input',reason:'EXPIRED'}
 const cloud=c.cloud
 if(!cloud||cloud.authorized!==true||cloud.reviewReady!==true||cloud.pricingVerified!==true)return {kind:'needs_input',reason:'CLOUD_REVIEW_UNVERIFIED'}
 if(!finite(c.jobCostCapUsd)||!finite(c.dailyCostCapUsd)||c.jobCostCapUsd<=0||c.dailyCostCapUsd<=0||!finite(cloud.reservationUsd)||cloud.reservationUsd<=0||!finite(cloud.dailyRemainingUsd)||cloud.reservationUsd>Math.min(0.25,c.jobCostCapUsd,5,c.dailyCostCapUsd,cloud.dailyRemainingUsd))return {kind:'needs_input',reason:'BUDGET_UNVERIFIED'}
 const exclusions:Record<string,string[]>={},eligible:CandidateEvidence[]=[]
 for(const item of input.candidates){
  const reasons:string[]=[];let key='invalid_candidate'
  try{
   const {qualification:q,admission:a,deployment:d}=item;key=isUuid(a.id)?a.id:'invalid_candidate'
   if(!qualificationValid(q,item.evidenceHash)||q.taskKind!==task.kind)reasons.push('QUALIFICATION_UNVERIFIED')
   if(![a.id,a.deploymentId,a.deviceId,d.id,d.deviceId].every(isUuid)||a.projectId!==c.projectId||d.ownerId!==c.userId||a.deviceId!==d.deviceId||a.deploymentId!==d.id||a.taskKind!==task.kind||a.status!=='active'||a.qualificationStatus!=='verified'||a.evidenceHash!==item.evidenceHash||a.modelDigest!==q.modelDigest||a.dataClass!==c.dataClass||a.placement!==c.placement||a.policyVersion!==c.policyVersion||!a.approvedInputHashes.includes(input.inputHash)||!future(a.expiresAt,at))reasons.push('ADMISSION_REFUSED')
   if(d.status!=='active'||!future(d.expiresAt,at)||d.healthState!=='ready'||d.lifecycleLock!=='clear'||d.gpuAvailable!==true||!finite(Date.parse(d.healthAt))||Date.parse(d.healthAt)>at||at-Date.parse(d.healthAt)>=45000)reasons.push('HEALTH_UNVERIFIED')
   if(d.runtimeHash!==q.runtimeHash||d.runtimeVersion!==q.runtimeVersion||d.adapterHash!==q.adapterHash||d.configurationHash!==q.configurationHash||!d.modelDigests.includes(q.modelDigest))reasons.push('EVIDENCE_DRIFT')
   if(!finite(a.jobCostCapUsd)||!finite(a.dailyCostCapUsd)||cloud.reservationUsd>Math.min(a.jobCostCapUsd,a.dailyCostCapUsd))reasons.push('ADMISSION_BUDGET_REFUSED')
   if(!finite(q.p95Ms)||at+q.p95Ms>=Date.parse(c.deadlineAt))reasons.push('DEADLINE_UNVERIFIED')
  }catch{reasons.push('MISSING_EVIDENCE')}
  if(reasons.length)exclusions[key]=reasons;else eligible.push(item)
 }
 // Quality is primary. Warm reuse only among equally qualified candidates that meet deadline.
 eligible.sort((a,b)=>b.qualification.review.accuracy-a.qualification.review.accuracy||Number(b.deployment.warmDigest===b.qualification.modelDigest)-Number(a.deployment.warmDigest===a.qualification.modelDigest)||supported[task.kind].indexOf(a.qualification.candidateId)-supported[task.kind].indexOf(b.qualification.candidateId)||a.admission.id.localeCompare(b.admission.id))
 const chosen=eligible[0]
 if(!chosen)return {kind:cloud.taskReady===true?'cloud_eligible':'needs_input',reason:'NO_ADMITTED_LOCAL_CAPABILITY'}
 const {qualification:q,admission:a,deployment:d}=chosen
 const decision:SelectionDecision={id:randomUUID(),jobId:input.jobId,inputHash:input.inputHash,projectId:c.projectId,profile:'local_assist_v1',policyVersion:c.policyVersion,candidateId:q.candidateId,modelDigest:q.modelDigest,deploymentId:d.id,admissionId:a.id,evidenceHash:chosen.evidenceHash,healthAt:d.healthAt,validUntil:new Date(Math.min(at+30000,Date.parse(d.healthAt)+45000,Date.parse(a.expiresAt),Date.parse(d.expiresAt),Date.parse(c.deadlineAt))).toISOString(),exclusions,totalExpectedCostUsd:null,costUncertainty:['operating_cost_unknown'],fallback:cloud.taskReady===true?'governed_openai':'human'}
 Object.values(exclusions).forEach(Object.freeze);Object.freeze(exclusions);Object.freeze(decision.costUncertainty)
 return {kind:'selected',decision:Object.freeze(decision)}
}
export async function revalidateSelection(db:Db,input:Claim,now:Date):Promise<TransitionResult<SelectionDecision>>{
 let claim:Claim;try{claim=parseClaim(input);if(hashTask(claim.task)!==claim.inputHash||Date.parse(claim.leaseUntil)<=now.getTime())throw Error('invalid')}catch{return {kind:'refused',reason:'INVALID_CLAIM'}}
 try{
  const call=db.rpc.bind(db) as unknown as (name:'local_text_revalidate',args:{p_claim:Claim})=>PromiseLike<{data:unknown;error:unknown}>
  const {data,error}=await call('local_text_revalidate',{p_claim:claim});if(error||!data||typeof data!=='object')throw Error('unknown')
  const v=data as {kind?:unknown;reason?:unknown;value?:SelectionDecision}
  if(v.kind==='refused'&&typeof v.reason==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/.test(v.reason))return {kind:'refused',reason:v.reason}
  const s=v.value
  if(v.kind!=='applied'||!s||s.id!==claim.selectionId||s.jobId!==claim.jobId||s.inputHash!==claim.inputHash||s.modelDigest!==claim.modelDigest||s.profile!=='local_assist_v1'||!future(s.validUntil,now.getTime())||!isSha256(s.evidenceHash)||!isUuid(s.admissionId)||!isUuid(s.projectId))throw Error('unknown')
  return {kind:'applied',value:s}
 }catch{return {kind:'unknown',reconcileId:claim.attemptId}}
}
