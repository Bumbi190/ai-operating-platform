import 'server-only'
import {canonicalJson,parseClaim,hashTask,sha256,isSha256,isUuid,validateTaskResult,JOB_STATES} from '@omnira/local-text-contract'
import {verifyWorkerRequest} from './identity'
import {revalidateSelection} from './policy'
import type {Db,WorkerOperation,Claim,TaskResult,TransitionResult} from './types'

const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const fail=():never=>{throw Error('INVALID_WORKER_PAYLOAD')}
const candidates=['qwen3:8b','qwen3.5:4b','qwen3.5:9b']
const reasonCodes=['TOKEN_BUDGET_UNVERIFIED','INPUT_TOO_LARGE','IDENTITY_CHANGED','INVALID_MODEL_RESPONSE','LOCAL_MODEL_UNAVAILABLE','LOCAL_STATE_ERROR']
const usageFields=['eval_count','prompt_eval_count','total_duration','load_duration','eval_duration','prompt_eval_duration']
export type WorkerPayload=Record<string,unknown>
export function parseWorkerPayload(operation:WorkerOperation,bytes:Uint8Array):WorkerPayload{
 try{
  if(bytes.byteLength>65536)fail();const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),value:unknown=JSON.parse(text)
  if(!object(value)||canonicalJson(value)!==text)fail()
  const v=value as Record<string,unknown>
  if(operation==='enroll'||operation==='claim'){if(!exact(v,[]))fail();return v}
  if(operation==='heartbeat'){
   if(!exact(v,['health','activeAttemptId'])||!(v.activeAttemptId===null||isUuid(v.activeAttemptId))||!exact(v.health,['state','lifecycleLock','gpuAvailable','runtimeVersion','runtimeHash','adapterHash','configurationHash','models']))fail()
   const h=v.health as Record<string,unknown>
   if(typeof h.state!=='string'||!['ready','blocked','stopped'].includes(h.state)||typeof h.lifecycleLock!=='string'||!['clear','uncertain'].includes(h.lifecycleLock)||typeof h.gpuAvailable!=='boolean'||typeof h.runtimeVersion!=='string'||h.runtimeVersion.length>64||!isSha256(h.runtimeHash)||!isSha256(h.adapterHash)||!isSha256(h.configurationHash)||!Array.isArray(h.models)||h.models.length>3)fail()
   const models=h.models as unknown[]
   if(models.some(m=>!exact(m,['candidateId','modelDigest'])||typeof m.candidateId!=='string'||!candidates.includes(m.candidateId)||typeof m.modelDigest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(m.modelDigest))||new Set(models.map(m=>(m as Record<string,unknown>).candidateId)).size!==models.length)fail()
   return v
  }
  const c=parseClaim(v.claim);if(c.inputHash!==hashTask(c.task))fail()
  if(operation==='started'){if(!exact(v,['claim']))fail();return {...v,claim:c}}
  if(operation==='complete'){
   if(!exact(v,['claim','result','resultHash','usage'])||!isSha256(v.resultHash))fail()
   const result=validateTaskResult(c.task,v.result);if(sha256(canonicalJson(result))!==v.resultHash||!object(v.usage)||Object.keys(v.usage).some(k=>!usageFields.includes(k)||!Number.isSafeInteger((v.usage as Record<string,unknown>)[k])||Number((v.usage as Record<string,unknown>)[k])<0))fail()
   return {...v,claim:c,result}
  }
  if(operation==='fail'){
   if(v.outcome==='known_failed'){if(!exact(v,['claim','outcome','reasonCode'])||typeof v.reasonCode!=='string'||!reasonCodes.includes(v.reasonCode))fail()}
   else if(typeof v.outcome!=='string'||!['dispatch_unknown','cancelled'].includes(v.outcome)||!exact(v,['claim','outcome']))fail()
   return {...v,claim:c}
  }
  if(operation==='reconcile'){if(!exact(v,['claim','proofRef'])||!isUuid(v.proofRef))fail();return {...v,claim:c}}
  return fail()
 }catch{return fail()}
}
export interface WorkerApiResponse {version:1;requestId:string;operation:WorkerOperation;result:TransitionResult<unknown>}
export async function executeWorkerRequest(db:Db,request:Request,operation:WorkerOperation,now=new Date()):Promise<WorkerApiResponse>{
 const verified=await verifyWorkerRequest(db,request,operation,now),payload=parseWorkerPayload(operation,verified.bodyBytes)
 if(object(payload.claim)&&payload.claim.deviceId!==verified.deviceId)throw Error('INVALID_WORKER_PAYLOAD')
 if(operation==='started'){const gate=await revalidateSelection(db,payload.claim as Claim,now);if(gate.kind!=='applied'&&gate.kind!=='duplicate')return {version:1,requestId:verified.requestId,operation,result:gate}}
 const unknown:TransitionResult<unknown>={kind:'unknown',reconcileId:verified.requestId};let result:TransitionResult<unknown>=unknown
 try{
  const call=db.rpc.bind(db) as unknown as (name:'local_text_worker_operation',args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>
  const response=await call('local_text_worker_operation',{p_envelope:verified.envelope,p_operation:operation,p_payload:payload})
  const v=response.data
  if(!response.error&&object(v)){
   if(v.kind==='refused'&&typeof v.reason==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/.test(v.reason))result={kind:'refused',reason:v.reason}
   else if(v.kind==='applied'||v.kind==='duplicate'){
    let value:unknown
    if(operation==='claim'){
     if(v.value===null)value=null;else{const c=parseClaim(v.value);if(c.deviceId!==verified.deviceId||c.inputHash!==hashTask(c.task)||Date.parse(c.leaseUntil)<=now.getTime()||Date.parse(c.expiresAt)<=now.getTime())throw Error('invalid');value=c}
    }else if(operation==='heartbeat'){
     if(!object(v.value)||v.value.deviceId!==verified.deviceId||typeof v.value.jobAction!=='string'||!['continue','abort'].includes(v.value.jobAction))throw Error('invalid')
     value={deviceId:verified.deviceId,jobAction:v.value.jobAction,...(typeof v.value.reasonCode==='string'&&/^[A-Z_]+$/.test(v.value.reasonCode)?{reasonCode:v.value.reasonCode}:{})}
    }else if(operation==='enroll'){
     if(!object(v.value)||v.value.deviceId!==verified.deviceId||typeof v.value.status!=='string'||!['pending','active'].includes(v.value.status)||!Number.isSafeInteger(v.value.version)||Number(v.value.version)<1)throw Error('invalid')
     value={deviceId:verified.deviceId,status:v.value.status,version:v.value.version}
    }else{
     const c=payload.claim as Claim
     if(!object(v.value)||v.value.id!==c.jobId||!JOB_STATES.includes(v.value.state as never)||typeof v.value.reviewStatus!=='string'||!['pending','approved','rejected','unknown'].includes(v.value.reviewStatus))throw Error('invalid')
     value={id:c.jobId,state:v.value.state,reviewStatus:v.value.reviewStatus}
    }
    result={kind:v.kind,value}
   }
  }
 }catch{result=unknown}
 return {version:1,requestId:verified.requestId,operation,result}
}
