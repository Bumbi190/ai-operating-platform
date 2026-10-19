import 'server-only'
import {NextResponse} from 'next/server'
import {authenticateBrokerRequest} from '../principal'
import {isBrokerClaimToken} from '../../code-work/claim-credential/claim-credential'
import type {HeartbeatBody} from '../control-channel/dto'
import {executionLeaseForBroker} from './service'
import {projectExecutionLease} from './projection'
import {EXECUTION_LEASE_PATH,type ExecutionLeaseService} from './types'
interface ExecutionLeaseHandlerDeps{enabled?:()=>boolean;auth?:Parameters<typeof authenticateBrokerRequest>[2];service?:ExecutionLeaseService}
const response=(status:number,error:string)=>NextResponse.json({ok:false,error},{status,headers:{'Cache-Control':'no-store'}})
async function rawBody(request:Request):Promise<string|null>{
 const reader=request.body?.getReader();if(!reader)return ''
 const chunks:Uint8Array[]=[];let total=0
 try{
  for(;;){const next=await reader.read();if(next.done)break;total+=next.value.byteLength;if(total>1024){void reader.cancel().catch(()=>{});return null}chunks.push(next.value)}
  return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))
 }finally{reader.releaseLock()}
}
function parse(raw:string):HeartbeatBody|null{
 let at=0;const ws=()=>{while(/[ \r\n\t]/.test(raw[at]??'x'))at++},bad=():never=>{throw Error('invalid')},str=():string=>{const start=at;if(raw[at++]!=='"')bad();while(at<raw.length){const c=raw[at++];if(c==='"')return JSON.parse(raw.slice(start,at));if(c==='\\')at++}return bad()}
 try{
  ws();if(raw[at++]!=='{')return null;ws();const v:Record<string,unknown>={},seen=new Set<string>()
  if(raw[at]!=='}')for(;;){
   ws();const key=str();if(seen.has(key)||!['workId','claimId','fence','claimToken'].includes(key))return null;seen.add(key);ws();if(raw[at++]!==':')return null;ws();let value:unknown
   if(raw[at]==='"')value=str();else{const m=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(raw.slice(at));if(!m)return null;at+=m[0].length;value=JSON.parse(m[0])}
   v[key]=value;ws();if(raw[at]===','){at++;continue}break
  }
  if(raw[at++]!=='}')return null;ws();if(at!==raw.length||seen.size!==4)return null
  const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
  if(!uuid(v.workId)||!uuid(v.claimId)||typeof v.fence!=='number'||!Number.isSafeInteger(v.fence)||v.fence<1||!isBrokerClaimToken(v.claimToken))return null
  return v as unknown as HeartbeatBody
 }catch{return null}
}
export async function handleExecutionLeaseRequest(request:Request,deps?:ExecutionLeaseHandlerDeps):Promise<NextResponse>{
 if(!(deps?.enabled?.()??process.env.ATLAS_CODE_WORK_EXECUTION_LEASE_ENABLED==='true'))return response(503,'unavailable')
 const url=new URL(request.url);if(request.method!=='POST'||url.pathname!==EXECUTION_LEASE_PATH||url.search)return response(400,'invalid_request')
 let raw:string|null;try{raw=await rawBody(request)}catch{return response(400,'invalid_request')}if(raw===null)return response(413,'invalid_request')
 const principal=await authenticateBrokerRequest(request,raw,deps?.auth);if(principal.status!=='ok')return response(401,'broker_auth_rejected')
 const body=parse(raw);if(!body)return response(400,'invalid_request')
 try{
  const result=await(deps?.service??executionLeaseForBroker)(principal.broker,body)
  if(result.status!=='live')return response(409,'lease_not_live')
  const lease=projectExecutionLease(result.lease);if(!lease)return response(503,'unavailable')
  return NextResponse.json({ok:true,lease},{headers:{'Cache-Control':'no-store'}})
 }catch{return response(503,'unavailable')}
}
