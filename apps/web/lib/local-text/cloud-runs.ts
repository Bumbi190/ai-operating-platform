import 'server-only'
import {localTextDispatchEnabled} from './activation-fence'
import {isUuid,isSha256,parseTask,validateTaskResult,hashTask,canonicalJson,sha256} from '@omnira/local-text-contract'
import type {Run} from '@/lib/supabase/types'
import {checkpointClaimedRun,settleRefusal,recordDispatchUnknown,finalizeOwnedRunUnlessCancelled} from '@/lib/governance/run-execution-checkpoint'
import {createGovernedReviewer,reviewResult,reviewerFlight} from './review'
import {executeCloudTextTask} from './cloud-task'
import {advanceLocalText} from './fallback'
import {MODEL_PRICING} from '@/lib/ai/pricing'
import {readCloudTextProfile} from './cloud-profile'
import type {Db,TransitionResult} from './types'
export type CloudStage='local_review'|'cloud_task'|'cloud_review'
type Rpc='local_text_enqueue_cloud'|'local_text_cloud_snapshot'|'local_text_cloud_operation'
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
async function rpc(db:Db,name:Rpc,args:Record<string,unknown>):Promise<Record<string,unknown>|null>{try{const call=db.rpc.bind(db) as unknown as (n:Rpc,a:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>;const {data,error}=await call(name,args);return !error&&object(data)?data:null}catch{return null}}
export async function enqueueCloudStage(db:Db,input:{jobId:string;attemptId:string;stage:CloudStage;inputHash:string;resultHash:string|null}):Promise<TransitionResult<{runId:string}>>{
 if(![input.jobId,input.attemptId].every(isUuid)||!['local_review','cloud_task','cloud_review'].includes(input.stage)||!isSha256(input.inputHash)||!(input.resultHash===null||isSha256(input.resultHash)))return {kind:'refused',reason:'INVALID_STAGE'}
 const r=await rpc(db,'local_text_enqueue_cloud',{p_job_id:input.jobId,p_attempt_id:input.attemptId,p_stage:input.stage,p_input_hash:input.inputHash,p_result_hash:input.resultHash})
 if(r?.kind==='refused'&&typeof r.reason==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/.test(r.reason))return {kind:'refused',reason:r.reason}
 if((r?.kind==='applied'||r?.kind==='duplicate')&&object(r.value)&&isUuid(r.value.runId))return {kind:r.kind,value:{runId:r.value.runId}}
 return {kind:'unknown',reconcileId:input.jobId}
}
/** Owns terminal writes for only this dedicated run kind. Drain must continue
 * immediately afterward; generic workflow retry/email logic never handles it. */
export async function executeLocalTextCloudRun(db:Db,run:Run,claimId:string,now:Date):Promise<void>{
 if(run.kind!=='local_text_cloud'||run.workflow_id!==null||run.workflow_instance_id!==null||run.claim_id!==claimId||!isUuid(claimId)||!isUuid(run.project_id))throw Error('INVALID_LOCAL_TEXT_RUN')
 const checkpoint=async()=>checkpointClaimedRun(db,{runId:run.id,projectId:run.project_id,claimId,boundary:'local_text:cloud'})
 const entry=await checkpoint();if(!entry.allowed){if(entry.refusal!=='FENCED')await settleRefusal(db,entry.refusal,run.id,claimId);return}
 const snapshot=await rpc(db,'local_text_cloud_snapshot',{p_run_id:run.id,p_claim_id:claimId})
 if(snapshot?.kind!=='applied'||!object(snapshot.value)){await finalizeOwnedRunUnlessCancelled(db,run.id,claimId,{status:'failed',error:'LOCAL_TEXT_SOURCE_UNAVAILABLE',finished_at:now.toISOString(),claimed_at:null,lease_until:null});return}
 const s=snapshot.value
 // Saved responses and held human routing also require primitive scoped IDs.
 // Validate before terminal context, apply or continuation can consume them.
 if(!isUuid(s.jobId)||!isUuid(s.stageId)||!isUuid(s.attemptId)||!isUuid(s.projectId)||s.projectId!==run.project_id){await finalizeOwnedRunUnlessCancelled(db,run.id,claimId,{status:'failed',error:'LOCAL_TEXT_SOURCE_UNAVAILABLE',finished_at:now.toISOString(),claimed_at:null,lease_until:null});return}
 const jobId=s.jobId
 const operate=(operation:string,value:Record<string,unknown>)=>rpc(db,'local_text_cloud_operation',{p_run_id:run.id,p_claim_id:claimId,p_operation:operation,p_value:value})
 async function apply(){const r=await operate('apply',{});if(!r||typeof r.kind!=='string'||!['applied','duplicate'].includes(r.kind))throw Error('LOCAL_TEXT_APPLY_PENDING');await advanceLocalText(db,jobId,new Date())}
 async function human(reasonCode:string){
  const r=await operate('human',{reasonCode});if(r?.kind!=='applied')return
  const terminal=await finalizeOwnedRunUnlessCancelled(db,run.id,claimId,{status:'awaiting_approval',context:{localText:{jobId:s.jobId,stageId:s.stageId,reasonCode}},finished_at:now.toISOString(),claimed_at:null,lease_until:null})
  if(terminal.outcome==='SUCCEEDED')await apply()
 }
 async function unknown(){const recorded=await recordDispatchUnknown(db,run.id,claimId,'LOCAL_TEXT_PROVIDER_DISPATCH_UNKNOWN');if(recorded==='UNKNOWN_WRITTEN')await operate('unknown',{})}
 if(s.state==='applied')return
 if(s.state==='response_ready'||s.state==='human_ready'){
  // Recover saved evidence only. Never issue another provider request.
  const terminal=await finalizeOwnedRunUnlessCancelled(db,run.id,claimId,{status:s.state==='human_ready'?'awaiting_approval':'done',context:{localText:{jobId:s.jobId,stageId:s.stageId}},finished_at:now.toISOString(),claimed_at:null,lease_until:null})
  if(terminal.outcome==='SUCCEEDED')await apply();return
 }
 if(s.state!=='pending'){await unknown();return}
 if(!localTextDispatchEnabled()){await human('LOCAL_TEXT_DISABLED');return}
 if(typeof s.stage!=='string'||!['local_review','cloud_task','cloud_review'].includes(s.stage)){await human('INVALID_STAGE');return}
 if(s.reviewMode!=='human'&&s.reviewMode!=='governed_openai'){await human('INVALID_REVIEW_MODE');return}
 if(s.reviewMode==='human'){await human(s.stage==='cloud_task'?'HUMAN_MODE_NO_CLOUD_TASK':'HUMAN_REVIEW_REQUIRED');return}
 const profile=readCloudTextProfile()
 if(!profile||Date.parse(profile.expiresAt)<=now.getTime()){await human('REVIEW_QUALIFICATION_REQUIRED');return}
 const price=MODEL_PRICING[profile.deployment]
 if(!price||price.inputPer1M!==0.75||price.outputPer1M!==4.5||!profile.textEnvelopeEvidence){await human('PRICING_OR_ENVELOPE_UNVERIFIED');return}
 const task=parseTask(s.task),result=s.stage==='cloud_task'?null:validateTaskResult(task,s.result)
 if(!isUuid(s.jobId)||!isUuid(s.attemptId)||s.projectId!==run.project_id||hashTask(task)!==s.inputHash||(result!==null&&sha256(canonicalJson(result))!==s.resultHash)||!isSha256(profile.qualificationHash)){await human('STAGE_BINDING_MISMATCH');return}
 const dispatch=await operate('dispatch',{deployment:profile.deployment,qualificationHash:profile.qualificationHash})
 if(dispatch?.kind!=='applied'){if(dispatch?.reason==='BUDGET_UNVERIFIED')await human('BUDGET_UNVERIFIED');return}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000)
 try{
  if(s.stage==='cloud_task'){
   const output=await executeCloudTextTask({db,task,binding:{jobId,inputHash:hashTask(task),runId:run.id,claimId,projectId:run.project_id},profile,budgetReserved:true,signal:controller.signal})
   if(output.flight==='unknown'){await unknown();return}
   if(output.flight==='not_started'){await human('CLOUD_TASK_NOT_ADMITTED');return}
   const cost=await db.from('cost_events').select('id').eq('run_id',run.id).eq('project_id',run.project_id).eq('provider','openai').eq('operation','local_text.task').limit(2)
   if(cost.error||!Array.isArray(cost.data)||cost.data.length!==1||!isUuid(cost.data[0].id)){await unknown();return}
   const saved=await operate('response',{receipt:{jobId:s.jobId,runId:run.id,claimId,inputHash:s.inputHash,resultHash:output.result===null?null:sha256(canonicalJson(output.result)),usageRef:cost.data[0].id,status:output.result===null?'invalid':'completed'},result:output.result})
   if(saved?.kind!=='applied'){await unknown();return}
   const terminal=await finalizeOwnedRunUnlessCancelled(db,run.id,claimId,{status:'done',context:{localText:{jobId:s.jobId,stageId:s.stageId}},finished_at:new Date().toISOString(),claimed_at:null,lease_until:null})
   if(terminal.outcome==='SUCCEEDED')await apply();return
  }
  if(result===null)throw Error('INVALID_REVIEW')
  const binding={jobId:s.jobId,attemptId:s.attemptId,inputHash:hashTask(task),resultHash:sha256(canonicalJson(result)),reviewRunId:run.id,reviewAttemptId:claimId,projectId:run.project_id,reviewerDeployment:profile.deployment,usageRef:null}
  const provider=createGovernedReviewer({db,binding,readiness:{...profile,qualified:true,budgetReserved:true},signal:controller.signal})
  const receipt=await reviewResult({task,result,binding},provider)
  const flight=reviewerFlight(provider)
  if(flight==='unknown'){await unknown();return}
  if(flight==='not_started'){await human('REVIEW_NOT_DISPATCHED');return}
  const cost=await db.from('cost_events').select('id').eq('run_id',run.id).eq('project_id',run.project_id).eq('provider','openai').limit(2)
  if(cost.error||!Array.isArray(cost.data)||cost.data.length!==1||!isUuid(cost.data[0].id)){await unknown();return}
  const recorded=await operate('response',{receipt:{...receipt,usageRef:cost.data[0].id}})
  if(recorded?.kind!=='applied')return
  const terminal=await finalizeOwnedRunUnlessCancelled(db,run.id,claimId,{status:'done',context:{localText:{jobId:s.jobId,stageId:s.stageId,reviewStatus:receipt.status}},finished_at:new Date().toISOString(),claimed_at:null,lease_until:null})
  if(terminal.outcome==='SUCCEEDED')await apply()
 }catch{await unknown()}finally{clearTimeout(timer)}
}
