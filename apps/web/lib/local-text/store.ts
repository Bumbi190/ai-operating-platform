import 'server-only'
import {randomUUID} from 'node:crypto'
import {parseRequest,parseTask,parseClaim,hashTask,isUuid,isSha256,JOB_STATES,validateTaskResult} from '@omnira/local-text-contract'
import type {Task,Db,VerifiedContext,RequestLocalText,SelectionDecision,JobReceipt,Claim,TransitionResult,TaskResult} from './types'

export type AttemptEvent =
 | {type:'started'|'dispatch_unknown'|'cancelled'}
 | {type:'completed';result:TaskResult;resultHash:string;usage?:Record<string,number>}
 | {type:'known_failed';reasonCode:string}
 | {type:'reconciled';proofRef:string}
type RpcName='local_text_enqueue_reserved'|'local_text_enqueue'|'local_text_claim'|'local_text_transition'|'local_text_read_receipt'
type RpcResponse={data:unknown;error:unknown}
/** Narrow bridge until whole-schema generated types include this unactivated migration.
 * Only these four names cross the bridge; every response is checked as untrusted data. */
async function rpc(db:Db,name:RpcName,args:Record<string,unknown>):Promise<RpcResponse>{
 const call=db.rpc.bind(db) as unknown as (n:RpcName,a:Record<string,unknown>)=>PromiseLike<RpcResponse>
 return await call(name,args)
}
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const code=(v:unknown):v is string=>typeof v==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/.test(v)
const timestamp=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))
function receipt(value:unknown,task:Task|null,binding:{jobId?:string;projectId?:string;conversationId?:string}):JobReceipt{
 if(!object(value)||!isUuid(value.id)||!isUuid(value.projectId)||!isUuid(value.conversationId)
 ||(binding.jobId&&value.id!==binding.jobId)||(binding.projectId&&value.projectId!==binding.projectId)||(binding.conversationId&&value.conversationId!==binding.conversationId)
 ||!JOB_STATES.includes(value.state as JobReceipt['state'])||typeof value.reviewStatus!=='string'||!['pending','approved','rejected','unknown'].includes(value.reviewStatus)
 ||!(value.reasonCode===null||code(value.reasonCode))||!(value.selectionId===null||isUuid(value.selectionId))||!timestamp(value.expiresAt)||!timestamp(value.updatedAt))throw Error('INVALID_RECEIPT')
 const expired=Date.parse(value.expiresAt)<=Date.now()||value.reasonCode==='PAYLOAD_EXPIRED'
 const result=!expired&&task&&value.state==='succeeded'&&value.reviewStatus==='approved'&&value.result!==null?validateTaskResult(task,value.result):null
 return {id:value.id,projectId:value.projectId,conversationId:value.conversationId,state:value.state as JobReceipt['state'],reasonCode:expired?'PAYLOAD_EXPIRED':value.reasonCode as string|null,result,reviewStatus:value.reviewStatus as JobReceipt['reviewStatus'],selectionId:value.selectionId as string|null,expiresAt:value.expiresAt,updatedAt:value.updatedAt}
}
function resultOf<T>(data:unknown,reconcileId:string,parse:(value:unknown,kind:'applied'|'duplicate')=>T):TransitionResult<T>{
 if(!object(data))return {kind:'unknown',reconcileId}
 if(data.kind==='refused'&&code(data.reason))return {kind:'refused',reason:data.reason}
 if(data.kind==='applied'||data.kind==='duplicate'){try{return {kind:data.kind,value:parse(data.value,data.kind)}}catch{return {kind:'unknown',reconcileId}}}
 return {kind:'unknown',reconcileId}
}
export async function enqueueJob(db:Db,ctx:VerifiedContext,input:RequestLocalText,selection:SelectionDecision,cloudProfileHash?:string):Promise<TransitionResult<JobReceipt>>{
 let request:RequestLocalText
 try{request=parseRequest(input)}catch{return {kind:'refused',reason:'INVALID_REQUEST'}}
 const inputHash=hashTask(request.task),reconcileId=isUuid(selection?.jobId)?selection.jobId:randomUUID()
 if(!selection||selection.projectId!==request.projectId||selection.inputHash!==inputHash||selection.admissionId!==ctx.admissionId||selection.policyVersion!==ctx.policyVersion||selection.profile!=='local_assist_v1'||ctx.projectId!==request.projectId||ctx.conversationId!==request.conversationId||!isUuid(ctx.userId)||!isUuid(selection.jobId)||!isUuid(selection.id))return {kind:'refused',reason:'SELECTION_BINDING_MISMATCH'}
 try{
  if(cloudProfileHash!==undefined&&!isSha256(cloudProfileHash))return {kind:'refused',reason:'INVALID_PROFILE'}
  const {data,error}=await rpc(db,cloudProfileHash?'local_text_enqueue_reserved':'local_text_enqueue',{p_context:ctx,p_request:request,p_input_hash:inputHash,p_job_id:selection.jobId,p_selection:selection,...(cloudProfileHash?{p_profile_hash:cloudProfileHash}:{})})
  if(error)return {kind:'unknown',reconcileId}
  return resultOf(data,reconcileId,(v,kind)=>receipt(v,request.task,{jobId:kind==='applied'?selection.jobId:undefined,projectId:request.projectId,conversationId:request.conversationId}))
 }catch{return {kind:'unknown',reconcileId}}
}
export async function claimJob(db:Db,deviceId:string,_now:Date):Promise<TransitionResult<Claim|null>>{
 if(!isUuid(deviceId))return {kind:'refused',reason:'INVALID_DEVICE'}
 try{
  const {data,error}=await rpc(db,'local_text_claim',{p_device_id:deviceId});if(error)return {kind:'unknown',reconcileId:deviceId}
  return resultOf(data,deviceId,v=>{if(v===null)return null;const c=parseClaim(v);if(c.deviceId!==deviceId||hashTask(c.task)!==c.inputHash||Date.parse(c.leaseUntil)<=_now.getTime()||Date.parse(c.expiresAt)<=_now.getTime())throw Error('INVALID_CLAIM');return c})
 }catch{return {kind:'unknown',reconcileId:deviceId}}
}
export async function transitionAttempt(db:Db,input:Claim,event:AttemptEvent):Promise<TransitionResult<JobReceipt>>{
 let claim:Claim;try{claim=parseClaim(input);if(hashTask(claim.task)!==claim.inputHash)throw Error('INVALID_CLAIM');if(event.type==='completed'){validateTaskResult(claim.task,event.result);if(!isSha256(event.resultHash))throw Error('INVALID_RESULT')}}catch{return {kind:'refused',reason:'INVALID_ATTEMPT'}}
 try{const {data,error}=await rpc(db,'local_text_transition',{p_claim:claim,p_event:event});if(error)return {kind:'unknown',reconcileId:claim.attemptId};return resultOf(data,claim.attemptId,v=>receipt(v,claim.task,{jobId:claim.jobId}))}catch{return {kind:'unknown',reconcileId:claim.attemptId}}
}
export async function readReceipt(db:Db,userId:string,jobId:string):Promise<JobReceipt|null>{
 if(!isUuid(userId)||!isUuid(jobId))return null
 try{const {data,error}=await rpc(db,'local_text_read_receipt',{p_user_id:userId,p_job_id:jobId});if(error)throw Error('unavailable');if(data===null)return null;if(!object(data))throw Error('invalid');return receipt(data.receipt,data.task===null?null:parseTask(data.task),{jobId})}catch{throw Error('LOCAL_TEXT_STATE_UNAVAILABLE')}
}

export type AdmissionReceipt={id:string;projectId:string;deviceId:string;status:'active'|'paused'|'revoked';evidenceHash:string;version:number;expiresAt:string}
export async function writeOwnerAdmission(db:Db,ownerId:string,projectId:string,deviceId:string,action:'admit'|'revoke',specification:Record<string,unknown>):Promise<TransitionResult<AdmissionReceipt>>{
 if(![ownerId,projectId,deviceId].every(isUuid))return {kind:'refused',reason:'INVALID_SCOPE'}
 try{
  const call=db.rpc.bind(db) as unknown as (name:'local_text_owner_admission',args:Record<string,unknown>)=>PromiseLike<RpcResponse>
  const {data,error}=await call('local_text_owner_admission',{p_owner_id:ownerId,p_project_id:projectId,p_device_id:deviceId,p_action:action,p_specification:specification})
  if(error)return {kind:'unknown',reconcileId:deviceId}
  return resultOf(data,deviceId,v=>{
   if(!object(v)||!isUuid(v.id)||v.projectId!==projectId||v.deviceId!==deviceId||typeof v.status!=='string'||!['active','paused','revoked'].includes(v.status)||!isSha256(v.evidenceHash)||!Number.isInteger(v.version)||Number(v.version)<1||!timestamp(v.expiresAt))throw Error('INVALID_ADMISSION')
   return {id:v.id,projectId,deviceId,status:v.status as AdmissionReceipt['status'],evidenceHash:v.evidenceHash,version:Number(v.version),expiresAt:v.expiresAt}
  })
 }catch{return {kind:'unknown',reconcileId:deviceId}}
}

// Private server consumers share the same strict result/expiry suppression.
export {receipt as parseStoredReceipt}

export async function readLocalTextCost(db:Db,userId:string,jobId:string){
 const unknown={localApiFeeUsd:0 as const,totalApiCostUsd:null as number|null,totalOperatingCostUsd:null as number|null,guaranteedSavings:false as const,status:'unverified' as 'unverified'|'metered'|'estimated'}
 if(!isUuid(userId)||!isUuid(jobId))return unknown
 try{
  const call=db.rpc.bind(db) as unknown as (name:string,args:Record<string,unknown>)=>PromiseLike<RpcResponse>
  const {data,error}=await call('local_text_cost_trace',{p_owner_id:userId,p_job_id:jobId})
  if(error||!object(data)||data.jobId!==jobId||!Array.isArray(data.stages)||data.stages.length>3)return unknown
  let total=0,estimated=false
  for(const stage of data.stages){
   if(!object(stage)||typeof stage.stage!=='string'||!['local_review','cloud_task','cloud_review'].includes(stage.stage))return unknown
   if((stage.state==='pending'||stage.state==='human_ready'||stage.state==='applied')&&stage.usageRef===null&&stage.costUsd===null)continue
   if(!isUuid(stage.usageRef)||typeof stage.costUsd!=='number'||!Number.isFinite(stage.costUsd)||stage.costUsd<0)return unknown
   total+=stage.costUsd
   if(!Number.isSafeInteger(stage.tokensIn)||Number(stage.tokensIn)<=0||!Number.isSafeInteger(stage.tokensOut)||Number(stage.tokensOut)<0)estimated=true
  }
  return {...unknown,totalApiCostUsd:estimated?null:total,status:estimated?'estimated' as const:'metered' as const}
 }catch{return unknown}
}
