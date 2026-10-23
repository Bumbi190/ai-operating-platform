import 'server-only'
import {localTextDispatchEnabled} from './activation-fence'
import {NextResponse} from 'next/server'
import {isUuid,isSha256} from '@omnira/local-text-contract'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {createAdminClient} from '@/lib/supabase/admin'
import {readBoundedRequestBody} from './identity'
import {readCloudTextProfile} from './cloud-profile'
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'private, no-store'}})
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
/** This explicit operator decision authorizes spend; local admission caps do not. */
export async function handleCloudBudgetRequest(request:Request,admissionId:string){
 if(!isUuid(admissionId)||request.method!=='POST')return json({error:'INVALID_REQUEST'},400)
 let actor;try{actor=await resolvePlatformOperator()}catch{return json({error:'UNAVAILABLE'},503)}
 if(!actor.ok)return json({error:'FORBIDDEN'},actor.reason==='unauthenticated'?401:403)
 if(request.headers.get('origin')!==new URL(request.url).origin||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return json({error:'FORBIDDEN'},403)
 let v:unknown;try{v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedRequestBody(request,4096)))}catch{return json({error:'INVALID_REQUEST'},400)}
 let spec:Record<string,unknown>,projectId:string,action:string
 if(exact(v,['action','projectId','authorizationId','expectedVersion'])&&v.action==='revoke'&&isUuid(v.projectId)&&isUuid(v.authorizationId)&&Number.isInteger(v.expectedVersion)&&Number(v.expectedVersion)>0){projectId=v.projectId;action='revoke';spec={id:v.authorizationId,expectedVersion:v.expectedVersion}}
 else{
  if(!localTextDispatchEnabled())return json({error:'LOCAL_TEXT_UNAVAILABLE'},503)
  if(!exact(v,['action','projectId','profileHash','expiresAt','jobCostCapUsd','dailyCostCapUsd'])||v.action!=='authorize'||!isUuid(v.projectId)||!isSha256(v.profileHash)||typeof v.expiresAt!=='string'||!Number.isFinite(Date.parse(v.expiresAt))||Date.parse(v.expiresAt)<=Date.now()||typeof v.jobCostCapUsd!=='number'||v.jobCostCapUsd<=0||v.jobCostCapUsd>0.25||typeof v.dailyCostCapUsd!=='number'||v.dailyCostCapUsd<=0||v.dailyCostCapUsd>5)return json({error:'INVALID_REQUEST'},400)
  const profile=readCloudTextProfile()
  if(!profile||profile.qualificationHash!==v.profileHash||Date.parse(profile.expiresAt)<=Date.now())return json({error:'CLOUD_QUALIFICATION_REQUIRED'},409)
  projectId=v.projectId;action='authorize';spec={profileHash:profile.qualificationHash,expiresAt:new Date(Math.min(Date.parse(v.expiresAt),Date.parse(profile.expiresAt))).toISOString(),jobCostCapUsd:v.jobCostCapUsd,dailyCostCapUsd:v.dailyCostCapUsd}
 }
 try{
  const db=createAdminClient(),call=db.rpc.bind(db) as unknown as (name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>
  const r=await call('local_text_owner_cloud_budget',{p_owner_id:actor.userId,p_project_id:projectId,p_admission_id:admissionId,p_action:action,p_specification:spec})
  if(r.error||!r.data||typeof r.data!=='object')return json({error:'UNAVAILABLE'},503)
  const result=r.data as {kind?:string;value?:unknown;reason?:string}
  if(result.kind!=='applied')return json({error:result.reason==='SCOPE_REFUSED'?'FORBIDDEN':'BUDGET_REFUSED'},result.reason==='SCOPE_REFUSED'?403:409)
  return json({authorization:result.value})
 }catch{return json({error:'UNAVAILABLE'},503)}
}
