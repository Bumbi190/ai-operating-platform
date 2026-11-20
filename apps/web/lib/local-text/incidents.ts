import 'server-only'
import {isUuid,parseTask,hashTask,isSha256,validateTaskResult,canonicalJson,sha256} from '@omnira/local-text-contract'
import {parseStoredReceipt} from './store'
import type {Db,JobReceipt,TransitionResult} from './types'
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
async function rpc(db:Db,name:string,args:Record<string,unknown>){const call=db.rpc.bind(db) as unknown as (n:string,a:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>;return call(name,args)}
export async function reconcileLocalTextHealth(db:Db,now:Date):Promise<void>{
 if(!Number.isFinite(now.getTime()))throw Error('INVALID_CLOCK')
 for(let unit=0;unit<100;unit++){
  const r=await rpc(db,'local_text_maintain',{p_limit:1})
  if(r.error||!object(r.data)||!Number.isSafeInteger(r.data.processed)||Number(r.data.processed)<0||Number(r.data.processed)>1)throw Error('LOCAL_TEXT_MAINTENANCE_UNAVAILABLE')
  if(r.data.processed===0)return
 }
}
export async function purgeExpiredLocalText(db:Db,now:Date):Promise<{payloadsDeleted:number;metadataDeleted:number}>{
 if(!Number.isFinite(now.getTime()))throw Error('INVALID_CLOCK')
 let payloadsDeleted=0,metadataDeleted=0
 for(let unit=0;unit<100;unit++){
  const r=await rpc(db,'local_text_purge',{p_limit:1})
  if(r.error||!object(r.data)||!Number.isSafeInteger(r.data.payloadsDeleted)||Number(r.data.payloadsDeleted)<0||!Number.isSafeInteger(r.data.metadataDeleted)||Number(r.data.metadataDeleted)<0||Number(r.data.payloadsDeleted)+Number(r.data.metadataDeleted)>1)throw Error('LOCAL_TEXT_PURGE_UNAVAILABLE')
  payloadsDeleted+=Number(r.data.payloadsDeleted);metadataDeleted+=Number(r.data.metadataDeleted)
  if(Number(r.data.payloadsDeleted)+Number(r.data.metadataDeleted)===0)break
 }
 return {payloadsDeleted,metadataDeleted}
}
export async function resolveLocalTextApproval(db:Db,input:{userId:string;approvalId:string;decision:'approve'|'reject';expectedVersion:number}):Promise<TransitionResult<JobReceipt>>{
 if(![input.userId,input.approvalId].every(isUuid)||!['approve','reject'].includes(input.decision)||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)return {kind:'refused',reason:'INVALID_REVIEW_DECISION'}
 try{
  const r=await rpc(db,'local_text_resolve_approval',{p_owner_id:input.userId,p_approval_id:input.approvalId,p_decision:input.decision,p_expected_version:input.expectedVersion})
  if(r.error||!object(r.data))throw Error('unknown')
  if(r.data.kind==='refused'&&typeof r.data.reason==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/.test(r.data.reason))return {kind:'refused',reason:r.data.reason}
  if((r.data.kind==='applied'||r.data.kind==='duplicate')&&object(r.data.value)){
   const task=r.data.value.task===null?null:parseTask(r.data.value.task);if(task&&hashTask(task)!==r.data.value.inputHash)throw Error('hash')
   return {kind:r.data.kind,value:parseStoredReceipt(r.data.value.receipt,task,{})}
  }
  throw Error('unknown')
 }catch{return {kind:'unknown',reconcileId:input.approvalId}}
}
export async function readLocalTextReview(db:Db,userId:string,approvalId:string){
 if(![userId,approvalId].every(isUuid))return null
 const r=await rpc(db,'local_text_read_review',{p_owner_id:userId,p_approval_id:approvalId})
 if(r.error)throw Error('LOCAL_TEXT_REVIEW_UNAVAILABLE')
 if(r.data===null)return null
 if(!object(r.data)||r.data.approvalId!==approvalId||!isUuid(r.data.jobId)||!isUuid(r.data.projectId)||!isSha256(r.data.inputHash)||!isSha256(r.data.resultHash)||!Number.isSafeInteger(r.data.version)||Number(r.data.version)<1||typeof r.data.expiresAt!=='string'||!Number.isFinite(Date.parse(r.data.expiresAt))||Date.parse(r.data.expiresAt)<=Date.now())throw Error('INVALID_REVIEW_PAYLOAD')
 const task=parseTask(r.data.task),result=validateTaskResult(task,r.data.result)
 if(hashTask(task)!==r.data.inputHash||sha256(canonicalJson(result))!==r.data.resultHash)throw Error('REVIEW_BINDING_MISMATCH')
 return {approvalId,jobId:r.data.jobId,projectId:r.data.projectId,version:Number(r.data.version),inputHash:r.data.inputHash,resultHash:r.data.resultHash,expiresAt:r.data.expiresAt,task,result}
}
export async function readLocalTextIncident(db:Db,userId:string,approvalId:string){
 const r=await rpc(db,'local_text_read_incident',{p_owner_id:userId,p_approval_id:approvalId})
 if(r.error)throw Error('LOCAL_TEXT_INCIDENT_UNAVAILABLE')
 if(r.data===null)return null
 if(!object(r.data)||!isUuid(r.data.id)||r.data.approvalId!==approvalId||typeof r.data.kind!=='string'||!['quality','reconcile','needs_input'].includes(r.data.kind)||typeof r.data.state!=='string'||!['open','resolved'].includes(r.data.state)||!Number.isSafeInteger(r.data.version)||Number(r.data.version)<1||typeof r.data.acknowledged!=='boolean'||r.data.resumed!==false)throw Error('INVALID_INCIDENT')
 return {id:r.data.id,approvalId,kind:r.data.kind,state:r.data.state,version:Number(r.data.version),acknowledged:r.data.acknowledged,resumed:false as const}
}
export async function acknowledgeLocalTextIncident(db:Db,userId:string,approvalId:string,expectedVersion:number){
 if(![userId,approvalId].every(isUuid)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)return {kind:'refused',reason:'INVALID_DECISION'}
 const r=await rpc(db,'local_text_ack_incident',{p_owner_id:userId,p_approval_id:approvalId,p_expected_version:expectedVersion})
 if(r.error||!object(r.data))throw Error('LOCAL_TEXT_INCIDENT_UNAVAILABLE')
 if(r.data.kind==='refused')return {kind:'refused',reason:'INCIDENT_DECISION_REFUSED'}
 if(typeof r.data.kind!=='string'||!['applied','duplicate'].includes(r.data.kind)||!object(r.data.value)||r.data.value.acknowledged!==true||r.data.value.resumed!==false)throw Error('INVALID_DECISION')
 return {kind:r.data.kind,acknowledged:true,resumed:false}
}
