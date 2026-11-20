import 'server-only'
import {NextResponse} from 'next/server'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {createAdminClient} from '@/lib/supabase/admin'
import {localTextDispatchEnabled} from './activation-fence'
import {isUuid,isSha256} from '@omnira/local-text-contract'
import {publicIdentityFingerprint,readBoundedRequestBody} from './identity'

const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
// Both operands have passed isUuid; UUID identity is case-insensitive.
const sameUuid=(left:string,right:string)=>left.toLowerCase()===right.toLowerCase()
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}})
const error=(status:number)=>json({error:status===401?'UNAUTHENTICATED':status===403?'FORBIDDEN':status===400?'INVALID_REQUEST':'LOCAL_TEXT_UNAVAILABLE'},status)
const safeDevice=(v:unknown)=>{
 if(!object(v)||!isUuid(v.deviceId)||!isUuid(v.projectId)||typeof v.status!=='string'||!['pending','active','paused','revoked','lost','retired'].includes(v.status)||!Number.isSafeInteger(v.version)||Number(v.version)<1||!isSha256(v.fingerprint))throw Error('INVALID_DEVICE_RECEIPT')
 return {deviceId:v.deviceId,projectId:v.projectId,status:v.status,version:v.version,fingerprint:v.fingerprint,...(typeof v.enrolled==='boolean'?{enrolled:v.enrolled}:{}),...(v.lastHeartbeatAt===null||typeof v.lastHeartbeatAt==='string'?{lastHeartbeatAt:v.lastHeartbeatAt}:{})}
}
export async function handleOwnerDeviceRequest(request:Request,deviceId?:string):Promise<NextResponse>{
 const enabled=localTextDispatchEnabled()
 if(request.method==='POST'&&!enabled)return error(503)
 let operator;try{operator=await resolvePlatformOperator()}catch{return error(503)}
 if(!operator.ok)return error(operator.reason==='unauthenticated'?401:operator.reason==='no_operator_configured'?503:403)
 if(deviceId!==undefined&&!isUuid(deviceId))return error(400)
 try{
  const db=createAdminClient(),call=db.rpc.bind(db) as unknown as (name:'local_text_owner_device'|'local_text_owner_devices',args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>
  if(request.method==='GET'){
   const projectId=new URL(request.url).searchParams.get('projectId');if(!isUuid(projectId))return error(400)
   const response=await call('local_text_owner_devices',{p_owner_id:operator.userId,p_project_id:projectId});if(response.error)return error(503)
   if(!object(response.data)||response.data.kind!=='applied'||!Array.isArray(response.data.value))return error(403)
   const devices=response.data.value.map(safeDevice)
   if(devices.some(v=>!sameUuid(v.projectId,projectId)))return error(503)
   return json({enabled,devices:devices.filter(v=>deviceId===undefined||sameUuid(v.deviceId,deviceId))})
  }
  if(!['POST','PATCH'].includes(request.method))return error(400)
  if(request.headers.get('origin')!==new URL(request.url).origin||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return error(403)
  let body:unknown;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedRequestBody(request,4096)))}catch{return error(400)}
  let projectId:string,action:string,version:number|null,registration:Record<string,unknown>,target:string
  if(request.method==='POST'){
   if(new URL(request.url).protocol!=='https:')return error(400)
   if(deviceId!==undefined||!exact(body,['projectId','deviceId','keyId','publicJwk','buildHash'])||!isUuid(body.projectId)||!isUuid(body.deviceId)||!isUuid(body.keyId)||!isSha256(body.buildHash))return error(400)
   let fingerprint;try{fingerprint=publicIdentityFingerprint(body.publicJwk)}catch{return error(400)}
   projectId=body.projectId;target=body.deviceId;action='register';version=null;registration={keyId:body.keyId,publicJwk:body.publicJwk,buildHash:body.buildHash,fingerprint,origin:new URL(request.url).origin}
  }else{
   if(!deviceId||!object(body)||typeof body.action!=='string'||!['approve','revoke'].includes(body.action)||!exact(body,body.action==='approve'?['projectId','action','expectedVersion','confirmFingerprint']:['projectId','action','expectedVersion'])||!isUuid(body.projectId)||!Number.isInteger(body.expectedVersion)||Number(body.expectedVersion)<1||Number(body.expectedVersion)>2147483647)return error(400)
   if(body.action==='approve'&&!isSha256(body.confirmFingerprint))return error(400)
   if(!enabled&&body.action!=='revoke')return error(503)
   projectId=body.projectId;target=deviceId;action=body.action;version=Number(body.expectedVersion);registration=action==='approve'?{confirmFingerprint:body.confirmFingerprint}:{}
  }
  const response=await call('local_text_owner_device',{p_owner_id:operator.userId,p_project_id:projectId,p_device_id:target,p_action:action,p_expected_version:version,p_registration:registration})
  if(response.error||!object(response.data))return error(503)
  if(response.data.kind==='refused')return response.data.reason==='SCOPE_REFUSED'?error(403):json({error:'DEVICE_DECISION_REFUSED',reason:response.data.reason==='STALE_VERSION'?'STALE_VERSION':'INVALID_DEVICE_STATE'},409)
  if(response.data.kind!=='applied')return error(503)
  const receipt=safeDevice(response.data.value)
  // Revocation is owner/device scoped: the RPC returns the device's pairing
  // project, which can differ from this request. Registration/approval bind it.
  if(!sameUuid(receipt.deviceId,target)||(action!=='revoke'&&!sameUuid(receipt.projectId,projectId)))return error(503)
  return json({device:receipt})
 }catch{return error(503)}
}
