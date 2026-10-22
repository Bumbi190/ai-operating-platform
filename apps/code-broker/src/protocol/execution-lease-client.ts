import {randomUUID} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import {assertOperationalOrigin,isCanonicalClaimToken,type OperationalContext,type OperationResult} from './operational-client.js'
import type {ClaimHandle} from './response-order.js'
import {canonicalRequestPayload,sha256Hex} from './canonical-request.js'
import {abortable,readBoundedJsonResponse} from './bounded-json.js'
import {parseExecutionLease,type ExecutionLeaseV1} from './execution-lease-contracts.js'
export const EXECUTION_LEASE_PATH='/api/atlas/code-work/broker/execution-lease' as const
export type ExecutionLeaseRead={status:'live';lease:ExecutionLeaseV1}|{status:'unavailable';reason:'request_failed'|'invalid_response'|'lease_not_live'}
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
export async function readExecutionLease(ctx:OperationalContext,counter:number,claim:ClaimHandle,signal:AbortSignal):Promise<OperationResult<ExecutionLeaseRead>>{
 const controller=new AbortController(),start=performance.now();let httpStatus=0,reason:'request_failed'|'invalid_response'|'lease_not_live'='request_failed'
 const abort=()=>controller.abort();if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true})
 const timer=setTimeout(abort,3000)
 const current=()=>{if(controller.signal.aborted||performance.now()-start>=3000)throw Error('stopped')}
 try{
  current()
  if(!Number.isSafeInteger(counter)||counter<1||!uuid(claim.workId)||!uuid(claim.claimId)||!Number.isSafeInteger(claim.fence)||claim.fence<1||!isCanonicalClaimToken(claim.claimToken))throw Error('invalid handle')
  const origin=assertOperationalOrigin(ctx.origin),url=new URL(EXECUTION_LEASE_PATH,origin)
  const body=JSON.stringify({workId:claim.workId,claimId:claim.claimId,fence:claim.fence,claimToken:claim.claimToken}),jti=randomUUID(),timestamp=new Date().toISOString()
  const signature=await abortable(ctx.signer.signCanonicalPayload(ctx.identityId,canonicalRequestPayload({brokerId:ctx.brokerId,hostId:ctx.hostId,protocolVersion:ctx.protocolVersion,brokerVersion:ctx.brokerVersion,buildSha256:ctx.buildSha256,counter,jti,timestamp,method:'POST',path:EXECUTION_LEASE_PATH,bodySha256:sha256Hex(body)})),controller.signal)
  current()
  const response=await abortable((ctx.fetchImpl??fetch)(url,{method:'POST',redirect:'error',signal:controller.signal,headers:{'content-type':'application/json','x-omnira-broker-id':ctx.brokerId,'x-omnira-broker-host-id':ctx.hostId,'x-omnira-broker-protocol':String(ctx.protocolVersion),'x-omnira-broker-version':ctx.brokerVersion,'x-omnira-broker-build-sha256':ctx.buildSha256,'x-omnira-broker-counter':String(counter),'x-omnira-broker-jti':jti,'x-omnira-broker-timestamp':timestamp,'x-omnira-broker-signature':signature},body}),controller.signal)
  current();httpStatus=response.status;reason='invalid_response'
  const value=await readBoundedJsonResponse(response,controller.signal);current()
  if(response.status<200||response.status>=300){reason=response.status===409?'lease_not_live':'invalid_response';throw Error('refused')}
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||(value as any).ok!==true||!Object.prototype.hasOwnProperty.call(value,'lease'))throw Error('invalid envelope')
  const lease=parseExecutionLease((value as {lease:unknown}).lease)
  if(lease.binding.workId!==claim.workId||lease.binding.claimId!==claim.claimId||lease.binding.fence!==claim.fence)throw Error('wrong claim')
  current();return{requestCounter:counter,httpStatus,body:{status:'live',lease}}
 }catch{return{requestCounter:counter,httpStatus,body:{status:'unavailable',reason:controller.signal.aborted?'request_failed':reason}}}
 finally{clearTimeout(timer);signal.removeEventListener('abort',abort)}
}
