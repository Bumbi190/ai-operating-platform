import 'server-only'
import {NextResponse} from 'next/server'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {createAdminClient} from '@/lib/supabase/admin'
import {localTextDispatchEnabled} from './activation-fence'
import {isUuid,isSha256} from '@omnira/local-text-contract'
import {readBoundedRequestBody} from './identity'
import {LOCAL_TEXT_QUALIFICATIONS} from './catalog'
import {qualificationValid} from './policy'
import {writeOwnerAdmission} from './store'
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'private, no-store'}})
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
export async function handleOwnerAdmissionRequest(request:Request,deviceId:string):Promise<NextResponse>{
 if(request.method!=='POST'||!isUuid(deviceId))return json({error:'INVALID_REQUEST'},400)
 let operator;try{operator=await resolvePlatformOperator()}catch{return json({error:'LOCAL_TEXT_UNAVAILABLE'},503)}
 if(!operator.ok)return json({error:'FORBIDDEN'},operator.reason==='unauthenticated'?401:operator.reason==='no_operator_configured'?503:403)
 if(request.headers.get('origin')!==new URL(request.url).origin||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return json({error:'FORBIDDEN'},403)
 let body:unknown;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedRequestBody(request,4096)))}catch{return json({error:'INVALID_REQUEST'},400)}
 let projectId:string,action:'admit'|'revoke',specification:Record<string,unknown>
 if(exact(body,['projectId','action','admissionId','expectedVersion'])&&body.action==='revoke'&&isUuid(body.projectId)&&isUuid(body.admissionId)&&Number.isInteger(body.expectedVersion)&&Number(body.expectedVersion)>0){projectId=body.projectId;action='revoke';specification={id:body.admissionId,expectedVersion:body.expectedVersion}}
 else{
  if(!localTextDispatchEnabled())return json({error:'LOCAL_TEXT_UNAVAILABLE'},503)
  const admitKeys=['projectId','action','evidenceHash','approvedInputHashes','dataClass','expiresAt','jobCostCapUsd','dailyCostCapUsd',...(body&&typeof body==='object'&&Object.hasOwn(body,'reviewMode')?['reviewMode']:[])]
  if(!exact(body,admitKeys)||(body.reviewMode!==undefined&&!['human','governed_openai'].includes(String(body.reviewMode)))||body.action!=='admit'||!isUuid(body.projectId)||!isSha256(body.evidenceHash)||!Array.isArray(body.approvedInputHashes)||body.approvedInputHashes.length<1||body.approvedInputHashes.length>100||!body.approvedInputHashes.every(isSha256)||new Set(body.approvedInputHashes).size!==body.approvedInputHashes.length||!['synthetic','approved_cloud_text'].includes(String(body.dataClass))||typeof body.expiresAt!=='string'||!Number.isFinite(Date.parse(body.expiresAt))||Date.parse(body.expiresAt)<=Date.now()||Date.parse(body.expiresAt)>Date.now()+90*86400000||typeof body.jobCostCapUsd!=='number'||!Number.isFinite(body.jobCostCapUsd)||body.jobCostCapUsd<=0||body.jobCostCapUsd>0.25||typeof body.dailyCostCapUsd!=='number'||!Number.isFinite(body.dailyCostCapUsd)||body.dailyCostCapUsd<=0||body.dailyCostCapUsd>5)return json({error:'INVALID_REQUEST'},400)
  const qualified=LOCAL_TEXT_QUALIFICATIONS.find(q=>q.evidenceHash===body.evidenceHash)
  if(!qualified||!qualificationValid(qualified.qualification,qualified.evidenceHash))return json({error:'QUALIFICATION_UNAVAILABLE'},409)
  projectId=body.projectId;action='admit';specification={reviewMode:body.reviewMode??'governed_openai',evidenceHash:qualified.evidenceHash,qualification:qualified.qualification,approvedInputHashes:body.approvedInputHashes,dataClass:body.dataClass,placement:'cloud_control_review_allowed',expiresAt:new Date(body.expiresAt).toISOString(),jobCostCapUsd:body.jobCostCapUsd,dailyCostCapUsd:body.dailyCostCapUsd,policyVersion:'local_assist_v1'}
 }
 try{
  const result=await writeOwnerAdmission(createAdminClient(),operator.userId,projectId,deviceId,action,specification)
  if(result.kind==='unknown')return json({error:'LOCAL_TEXT_UNAVAILABLE',reconcileId:result.reconcileId},503)
  if(result.kind==='refused')return json({error:'ADMISSION_REFUSED'},result.reason==='SCOPE_REFUSED'?403:409)
  return json({admission:result.value})
 }catch{return json({error:'LOCAL_TEXT_UNAVAILABLE'},503)}
}
