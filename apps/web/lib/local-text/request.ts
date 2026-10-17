import 'server-only'
import {randomUUID} from 'node:crypto'
import {parseRequest,hashTask,isSha256} from '@omnira/local-text-contract'
import {readCloudTextProfile} from './cloud-profile'
import {selectLocalText,type SelectionContext,type CandidateEvidence} from './policy'
import {enqueueJob,parseStoredReceipt} from './store'
import {MODEL_PRICING} from '@/lib/ai/pricing'
import type {Db,RequestLocalText,JobReceipt,TransitionResult} from './types'
/** Derive placement, exact-source consent and candidate facts from owned records.
 * Neither model/tool input nor request JSON supplies authority or a price. */
export async function requestLocalTextJob(db:Db,principal:{userId:string;allowedProjectIds:string[]},input:RequestLocalText,now:Date):Promise<TransitionResult<JobReceipt>>{
 let request:RequestLocalText;try{request=parseRequest(input)}catch{return {kind:'refused',reason:'INVALID_REQUEST'}}
 if(!principal.allowedProjectIds.includes(request.projectId))return {kind:'refused',reason:'SCOPE_REFUSED'}
 const jobId=randomUUID()
 try{
  const call=db.rpc.bind(db) as unknown as (name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>
  const existing=await call('local_text_existing_request',{p_owner_id:principal.userId,p_project_id:request.projectId,p_conversation_id:request.conversationId,p_key:request.idempotencyKey,p_input_hash:hashTask(request.task)})
  if(existing.error||!existing.data||typeof existing.data!=='object')throw Error('unavailable')
  const old=existing.data as {kind?:string;value?:unknown;reason?:string}
  if(old.kind==='duplicate')return {kind:'duplicate',value:parseStoredReceipt(old.value,request.task,{projectId:request.projectId,conversationId:request.conversationId})}
  if(old.kind==='refused')return {kind:'refused',reason:old.reason==='IDEMPOTENCY_CONFLICT'?'IDEMPOTENCY_CONFLICT':'SCOPE_REFUSED'}
  if(old.kind!=='absent')throw Error('unknown')
 const profile=readCloudTextProfile(),price=profile?MODEL_PRICING[profile.deployment]:null
 if(!profile||!isSha256(profile.qualificationHash)||Date.parse(profile.expiresAt)<=now.getTime()+5*60000||!profile.textEnvelopeEvidence||!price||price.inputPer1M!==0.75||price.outputPer1M!==4.5)return {kind:'refused',reason:'CLOUD_REVIEW_UNVERIFIED'}
  const r=await call('local_text_selection_context',{p_owner_id:principal.userId,p_project_id:request.projectId,p_conversation_id:request.conversationId,p_input_hash:hashTask(request.task),p_kind:request.task.kind,p_profile_hash:profile.qualificationHash,p_profile_expires_at:profile.expiresAt})
  if(r.error||!r.data||typeof r.data!=='object')throw Error('unknown')
  const s=r.data as {kind?:string;reason?:string;value?:{context:SelectionContext;candidates:CandidateEvidence[]}}
  if(s.kind==='refused')return {kind:'refused',reason:typeof s.reason==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/.test(s.reason)?s.reason:'ADMISSION_REFUSED'}
  if(s.kind!=='applied'||!s.value||!Array.isArray(s.value.candidates))throw Error('unknown')
  const c=s.value.context
  if(!c||c.userId!==principal.userId||c.projectId!==request.projectId||c.conversationId!==request.conversationId)throw Error('scope')
  const selected=selectLocalText({jobId,inputHash:hashTask(request.task),task:request.task,context:c,candidates:s.value.candidates,now})
  if(selected.kind!=='selected')return {kind:'refused',reason:selected.reason}
  return enqueueJob(db,{userId:c.userId,projectId:c.projectId,conversationId:c.conversationId,dataClass:c.dataClass,placement:c.placement,policyVersion:c.policyVersion,admissionId:selected.decision.admissionId,deadlineAt:c.deadlineAt,jobCostCapUsd:c.jobCostCapUsd,dailyCostCapUsd:c.dailyCostCapUsd},request,selected.decision,profile.qualificationHash)
 }catch{return {kind:'unknown',reconcileId:jobId}}
}
