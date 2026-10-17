import 'server-only'
import {createPublicKey,verify} from 'node:crypto'
import {canonicalJson,isUuid,isSha256,parseWorkerEnvelope,sha256,workerSigningPayload,WORKER_OPERATIONS} from '@omnira/local-text-contract'
import type {Db,WorkerEnvelope,WorkerOperation} from './types'

export interface VerifiedDeviceRequest {
 deviceId:string;ownerId:string;keyId:string;buildHash:string
 allowedProjects:string[];allowedTasks:('classify'|'extract'|'summarize')[]
 envelope:WorkerEnvelope;bodyBytes:Uint8Array;requestId:string
}
const invalid=()=>Error('INVALID_WORKER_REQUEST')
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
function publicKey(value:unknown){
 if(!record(value)||Object.keys(value).length!==4||value.kty!=='EC'||value.crv!=='P-256'||typeof value.x!=='string'||typeof value.y!=='string')throw invalid()
 for(const part of [value.x,value.y])if(!/^[A-Za-z0-9_-]{43}$/.test(part)||Buffer.from(part,'base64url').length!==32||Buffer.from(part,'base64url').toString('base64url')!==part)throw invalid()
 return createPublicKey({key:{kty:'EC',crv:'P-256',x:value.x,y:value.y},format:'jwk'})
}
export function verifyWorkerSignature(input:unknown,body:Uint8Array,jwk:unknown,now:Date):boolean{
 try{
  const envelope=parseWorkerEnvelope(input)
  if(!(body instanceof Uint8Array)||body.byteLength>65536||!Number.isFinite(now.getTime())||Date.parse(envelope.issuedAt)>now.getTime()+5000||Date.parse(envelope.expiresAt)<=now.getTime()||envelope.bodySha256!==sha256(body))return false
  const {signature,...unsigned}=envelope
  return verify('sha256',workerSigningPayload(unsigned),{key:publicKey(jwk),dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url'))
 }catch{return false}
}
export async function readBoundedRequestBody(request:Request,maxBytes=65536):Promise<Uint8Array>{
 const declared=request.headers.get('content-length');if(declared!==null&&(!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>maxBytes))throw invalid()
 if(!request.body)return new Uint8Array()
 const reader=request.body.getReader();let timer:ReturnType<typeof setTimeout>|undefined
 const read=async()=>{let total=0;const chunks:Uint8Array[]=[];while(true){const next=await reader.read();if(next.done)break;total+=next.value.byteLength;if(total>maxBytes)throw invalid();chunks.push(next.value)}return Buffer.concat(chunks)}
 try{return await Promise.race([read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(invalid()),3000)})])}
 finally{clearTimeout(timer);void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}
}
/** Signature verification is not dispatch authority. Counter + operation are committed
 * together by worker-api's closed SQL boundary, which rechecks revocation and scope. */
export async function verifyWorkerRequest(db:Db,request:Request,operation:WorkerOperation,now=new Date()):Promise<VerifiedDeviceRequest>{
 let envelope:WorkerEnvelope
 try{
  const url=new URL(request.url),encoded=request.headers.get('x-omnira-local-text')
  if(request.method!=='POST'||url.protocol!=='https:'||url.search||!WORKER_OPERATIONS.includes(operation)||url.pathname!=='/api/local-text/worker/'+operation||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??'')||!encoded||encoded.length>8192||!/^[A-Za-z0-9_-]+$/.test(encoded))throw invalid()
  const raw=Buffer.from(encoded,'base64url');if(raw.length>4096||raw.toString('base64url')!==encoded)throw invalid()
  const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);envelope=parseWorkerEnvelope(JSON.parse(text))
  if(canonicalJson(envelope)!==text||envelope.origin!==url.origin||envelope.path!==url.pathname||envelope.method!==request.method)throw invalid()
 }catch{throw invalid()}
 const bodyBytes=await readBoundedRequestBody(request)
 let value:unknown
 try{
  const call=db.rpc.bind(db) as unknown as (name:'local_text_device_identity',args:{p_device_id:string})=>PromiseLike<{data:unknown;error:unknown}>
  const response=await call('local_text_device_identity',{p_device_id:envelope.deviceId});if(response.error)throw Error('unavailable');value=response.data
 }catch{throw Error('LOCAL_TEXT_STATE_UNAVAILABLE')}
 if(value===null)throw invalid()
 if(!record(value)||!isUuid(value.deviceId)||!isUuid(value.ownerId)||!isUuid(value.keyId)||!isSha256(value.buildHash)||typeof value.serverOrigin!=='string'||typeof value.counter!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(value.counter)||typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt))||!Array.isArray(value.allowedProjects)||value.allowedProjects.length>128||!value.allowedProjects.every(isUuid)||!Array.isArray(value.allowedTasks)||!value.allowedTasks.every(x=>['classify','extract','summarize'].includes(x)))throw Error('LOCAL_TEXT_STATE_UNAVAILABLE')
 if(value.serverOrigin!==envelope.origin||value.deviceId!==envelope.deviceId||value.keyId!==envelope.keyId||value.buildHash!==envelope.buildHash||!(value.status==='active'||value.status==='pending'&&operation==='enroll')||Date.parse(value.expiresAt)<=now.getTime()||BigInt(envelope.counter)<=BigInt(value.counter)||!verifyWorkerSignature(envelope,bodyBytes,value.publicJwk,now))throw invalid()
 return {deviceId:value.deviceId,ownerId:value.ownerId,keyId:value.keyId,buildHash:value.buildHash,allowedProjects:value.allowedProjects as string[],allowedTasks:value.allowedTasks as VerifiedDeviceRequest['allowedTasks'],envelope,bodyBytes,requestId:envelope.nonce}
}

export function publicIdentityFingerprint(value:unknown):string { publicKey(value);return sha256(canonicalJson(value)) }
