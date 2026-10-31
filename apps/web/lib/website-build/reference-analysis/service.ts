import 'server-only'
import {createHash} from 'node:crypto'
import type {ProjectAccessOk} from '@/lib/auth/project-access'
import {ProviderNotDispatchedError,SpendRefusedError} from '@/lib/cost/governed-spend'
import {WebsiteBuildError} from '../store'
import {assertReferenceWorkspace} from '../assets/tickets'
import {readAnalysisSource,analysisTable,type AnalysisDb} from './source'
import {prepareAnalysisRequest,quoteAnalysisRequest,runAnalysisProvider,referenceAnalysisEnabled,ANALYSIS_MODEL,ANALYSIS_MAX_TOKENS} from './provider'
import {createReferenceConcepts} from './concepts'
import {ANALYSIS_HARD_CAP_SEK,isUuid,parseReferenceAnalysis,type AnalysisAction,type AnalysisSource} from './contract'
type Job={id:string;owner_id:string;project_id:string;conversation_id:string;message_id:string;binding_sha256:string;payload_sha256:string;
 model:string;max_tokens:number;maximum_sek:number;quote_token:string;quote_expires_at:string;status:'quoted'|'processing'|'succeeded'|'failed'|'unknown';
 canonical_result:string|null;result_sha256:string|null}
function available(){if(!referenceAnalysisEnabled())throw new WebsiteBuildError('REFERENCE_UNAVAILABLE',503)}
function job(value:unknown,owner:ProjectAccessOk,source:AnalysisSource,binding:string):Job{
 const r=value as Job|null
 if(!r||!isUuid(r.id)||r.owner_id!==owner.userId||r.project_id!==source.projectId||r.conversation_id!==source.conversationId||
  r.message_id!==source.messageId||r.binding_sha256!==binding||!/^([a-f0-9]{64})$/.test(r.payload_sha256)||
  r.model!==ANALYSIS_MODEL||r.max_tokens!==ANALYSIS_MAX_TOKENS||typeof r.maximum_sek!=='number'||!Number.isFinite(r.maximum_sek)||
  r.maximum_sek<=0||r.maximum_sek>ANALYSIS_HARD_CAP_SEK||!isUuid(r.quote_token)||!Number.isFinite(Date.parse(r.quote_expires_at))||
  !['quoted','processing','succeeded','failed','unknown'].includes(r.status))throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 return r
}
async function rpc(db:AnalysisDb,name:string,args:Record<string,unknown>):Promise<any>{
 const response=await (db as unknown as {rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{message?:string}|null}>}).rpc(name,args)
 if(response.error){
  const code=response.error.message
  throw new WebsiteBuildError(code==='ATLAS_ANALYSIS_CONFLICT'?'CONFLICT':code==='ATLAS_ANALYSIS_NOT_FOUND'?'NOT_FOUND':'BUILD_UNAVAILABLE',
   code==='ATLAS_ANALYSIS_CONFLICT'?409:code==='ATLAS_ANALYSIS_NOT_FOUND'?404:503)
 }
 return response.data
}
const scopeArgs=(owner:ProjectAccessOk,source:AnalysisSource)=>({p_owner_id:owner.userId,p_project_id:source.projectId,p_conversation_id:source.conversationId,p_message_id:source.messageId})
function view(row:Job,imageCount:number){
 const base={analysisId:row.id,messageId:row.message_id,status:row.status,model:row.model,maximumSek:row.maximum_sek,
  ...(row.status==='quoted'?{quoteToken:row.quote_token,quoteExpiresAt:row.quote_expires_at}:{})}
 if(row.status!=='succeeded')return {...base,analysis:null,concepts:[]}
 if(typeof row.canonical_result!=='string'||row.canonical_result.length>24000||
  createHash('sha256').update(row.canonical_result).digest('hex')!==row.result_sha256)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 let analysis
 try{analysis=parseReferenceAnalysis(JSON.parse(row.canonical_result),imageCount)}catch{throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)}
 return {...base,analysis,concepts:createReferenceConcepts(analysis).map(({key,title,summary,mobile,html,artifact})=>({key,title,summary,mobile,html,sha256:artifact.sha256}))}
}
export async function executeAnalysisAction(db:AnalysisDb,owner:ProjectAccessOk,input:AnalysisAction,signal:AbortSignal){
 available()
 const source=await readAnalysisSource(db,owner,input),prepared=await prepareAnalysisRequest(source)
 available()
 const args=scopeArgs(owner,input)
 if(input.action==='quote'){
  const maximum=await quoteAnalysisRequest(prepared)
  available();if(signal.aborted)throw new WebsiteBuildError('CONFLICT',409)
  const row=job(await rpc(db,'website_build_reference_analysis_quote',{...args,p_binding_sha256:source.bindingSha256,p_payload_sha256:prepared.payloadSha256,p_maximum_sek:maximum}),owner,input,source.bindingSha256)
  // A prior completed/claimed job never creates a second billable attempt.
  available()
  const current=await readAnalysisSource(db,owner,input)
  if(current.bindingSha256!==source.bindingSha256)throw new WebsiteBuildError('CONFLICT',409)
  return view(row,current.images.length)
 }
 if(signal.aborted)throw new WebsiteBuildError('CONFLICT',409)
 const claim=await rpc(db,'website_build_reference_analysis_claim',{...args,p_analysis_id:input.analysisId,p_quote_token:input.quoteToken,
  p_approved_maximum_sek:input.approvedMaximumSek,p_binding_sha256:source.bindingSha256,p_payload_sha256:prepared.payloadSha256})
 const row=job(claim?.job,owner,input,source.bindingSha256)
 if(row.id!==input.analysisId||row.payload_sha256!==prepared.payloadSha256||row.maximum_sek!==input.approvedMaximumSek||
  row.quote_token!==input.quoteToken||typeof claim.claimed!=='boolean')throw new WebsiteBuildError('CONFLICT',409)
 if(!claim.claimed){
  available();const current=await readAnalysisSource(db,owner,input)
  if(current.bindingSha256!==source.bindingSha256)throw new WebsiteBuildError('CONFLICT',409)
  return view(row,current.images.length)
 }
 if(row.status!=='processing'||!isUuid(claim.claimToken))throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 let status:'succeeded'|'failed'|'unknown'='unknown',canonical:string|null=null
 try{
  available()
  // Claim acquisition is another asynchronous boundary. Reverify before any provider work.
  try{
   const current=await readAnalysisSource(db,owner,input)
   if(current.bindingSha256!==source.bindingSha256)throw Error('source binding changed')
  }catch(error){throw new ProviderNotDispatchedError('source no longer verified before dispatch',error)}
  if(signal.aborted)throw new ProviderNotDispatchedError('request already aborted',undefined)
  const analysis=await runAnalysisProvider(prepared,{projectId:input.projectId,analysisId:row.id,maximumSek:row.maximum_sek,signal})
  // Compile before completion so an invalid/render-incompatible result cannot masquerade as succeeded.
  createReferenceConcepts(analysis);canonical=JSON.stringify(analysis);status='succeeded'
 }catch(error){
  // Only typed pre-dispatch proof counts. No error text matching or automatic retry.
  status=error instanceof ProviderNotDispatchedError||error instanceof SpendRefusedError?'failed':'unknown'
 }
 const completed=job(await rpc(db,'website_build_reference_analysis_finish',{...args,p_analysis_id:row.id,p_claim_token:claim.claimToken,
  p_status:status,p_canonical_result:canonical}),owner,input,source.bindingSha256)
 // Recording paid work is durable even if access changes; disclosure needs fresh byte/source proof.
 available()
 const current=await readAnalysisSource(db,owner,input)
 if(current.bindingSha256!==source.bindingSha256)throw new WebsiteBuildError('CONFLICT',409)
 return view(completed,current.images.length)
}
export async function readAnalysisJob(db:AnalysisDb,owner:ProjectAccessOk,input:AnalysisSource){
 available()
 await assertReferenceWorkspace(db,owner,input.projectId,input.conversationId)
 const {data,error}=await analysisTable(db,'website_build_reference_analyses').select('*')
  .eq('owner_id',owner.userId).eq('project_id',input.projectId).eq('conversation_id',input.conversationId).eq('message_id',input.messageId).maybeSingle()
 if(error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 // Job lookup is asynchronous: check current ownership and exact private bytes AFTER it.
 available();const source=await readAnalysisSource(db,owner,input)
 if(!data)return {messageId:input.messageId,status:'not_started',analysis:null,concepts:[]}
 return view(job(data,owner,input,source.bindingSha256),source.images.length)
}
export async function listAnalysisSources(db:AnalysisDb,owner:ProjectAccessOk,scope:{projectId:string;conversationId:string}){
 available();await assertReferenceWorkspace(db,owner,scope.projectId,scope.conversationId)
 const {data,error}=await analysisTable(db,'website_build_reference_messages').select('message_id,created_at,images,conversation_messages!inner(content,role,conversation_id)')
  .eq('owner_id',owner.userId).eq('project_id',scope.projectId).eq('conversation_id',scope.conversationId).order('created_at',{ascending:false}).limit(20)
 if(error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 await assertReferenceWorkspace(db,owner,scope.projectId,scope.conversationId)
 return {items:(data??[]).filter((r:any)=>isUuid(r.message_id)&&r.conversation_messages?.role==='user'&&r.conversation_messages.conversation_id===scope.conversationId&&typeof r.conversation_messages.content==='string'&&Array.isArray(r.images))
  .map((r:any)=>({messageId:r.message_id,createdAt:r.created_at,imageCount:r.images.length,comment:r.conversation_messages.content.slice(0,240)}))}
}
