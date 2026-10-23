import 'server-only'
import {localTextDispatchEnabled} from './activation-fence'
import {NextResponse} from 'next/server'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {createAdminClient} from '@/lib/supabase/admin'
import {getAllowedProjectIds} from '@/lib/atlas/isolation'
import {isUuid} from '@omnira/local-text-contract'
import {readBoundedRequestBody} from './identity'
import {handleLocalTextTool} from './atlas-tools'
import {localTextReceiptLink} from './receipt'
import {LOCAL_TEXT_PILOT} from './pilot-constants'

const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}})
/** Operator's fixed, zero-provider-call connection test. Normal Atlas admission,
 * selection, retry fences and review still decide whether any GPU job can run. */
export async function handleLocalTextPilotRequest(request:Request){
 const project=process.env.ATLAS_LOCAL_TEXT_PILOT_PROJECT_ID
 if(!localTextDispatchEnabled()||!isUuid(project))return json({error:'LOCAL_TEXT_DISABLED'},503)
 const operator=await resolvePlatformOperator()
 if(!operator.ok)return json({error:'FORBIDDEN'},operator.reason==='unauthenticated'?401:403)
 if(request.method!=='POST'||request.headers.get('origin')!==new URL(request.url).origin||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return json({error:'FORBIDDEN'},403)
 let body:Record<string,unknown>
 try{
  body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedRequestBody(request,1024)))
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='conversationId,idempotencyKey,projectId'||![body.projectId,body.conversationId,body.idempotencyKey].every(isUuid))throw Error()
 }catch{return json({error:'INVALID_REQUEST'},400)}
 if(body.projectId!==project)return json({error:'FORBIDDEN'},403)
 try{
  const db=createAdminClient(),allowed=await getAllowedProjectIds(db,operator.userId)
  if(!allowed.includes(project))return json({error:'FORBIDDEN'},403)
  const {data,error}=await db.from('conversations').select('id,project_id').eq('id',String(body.conversationId)).eq('user_id',operator.userId).maybeSingle()
  if(error||!data||data.project_id!==project)return json({error:'NOT_FOUND'},404)
  const receipt=await handleLocalTextTool('request_local_text_job',{projectId:project,idempotencyKey:body.idempotencyKey,task:structuredClone(LOCAL_TEXT_PILOT.task)},{userId:operator.userId,allowedProjectIds:allowed},String(body.conversationId),db,'text',{humanReviewOnly:true})
  const link=localTextReceiptLink(receipt)
  if(!link||link.projectId!==project||link.conversationId!==body.conversationId)return json({error:'LOCAL_TEXT_UNAVAILABLE'},409)
  return json({receipt})
 }catch{return json({error:'LOCAL_TEXT_UNAVAILABLE'},503)}
}
