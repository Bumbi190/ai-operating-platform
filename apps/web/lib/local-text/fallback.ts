import 'server-only'
import {isUuid,parseTask,hashTask} from '@omnira/local-text-contract'
import {parseStoredReceipt} from './store'
import type {CloudStage} from './cloud-runs'
import type {Db,JobReceipt,TransitionResult} from './types'
export type StageSnapshot={stage:CloudStage;state:'pending'|'dispatching'|'response_ready'|'human_ready'|'applied'|'unknown';verdict:'approved'|'rejected'|'unknown'|null;physicalCalls:number}
export type JobSnapshot={id:string;projectId:string;state:string;local:{startedCount:number;certainty:'not_started'|'completed'|'known_failed'|'unknown'};stages:StageSnapshot[];privacy:{dataClass:'synthetic'|'approved_cloud_text';placement:'cloud_control_review_allowed';sourceApproved:boolean;containsSecrets:boolean;payloadExpiresAt:string};stop:{globalClear:boolean;projectClear:boolean};budget:{authorized:boolean;pricingVerified:boolean;roleQualified:boolean;jobCapUsd:number;dailyCapUsd:number;dailyRemainingUsd:number;committedUsd:number;stageCeilingUsd:Record<CloudStage,number>}}
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)
const micro=(v:number)=>Math.ceil(v*1000000-1e-9)
/** Remaining worst-case model invocations for reservation. Existing pending
 * stages are not dispatch permission; SQL's unique stage and dispatch CAS own it. */
export function computeRemainingStages(j:JobSnapshot,now=new Date()):CloudStage[]{
 try{
  const p=j.privacy,b=j.budget
  if(!isUuid(j.id)||!isUuid(j.projectId)||!['reviewing','escalation_pending'].includes(j.state)||!['synthetic','approved_cloud_text'].includes(p.dataClass)||p.placement!=='cloud_control_review_allowed'||p.sourceApproved!==true||p.containsSecrets!==false||!Number.isFinite(Date.parse(p.payloadExpiresAt))||Date.parse(p.payloadExpiresAt)<=now.getTime()||j.stop.globalClear!==true||j.stop.projectClear!==true||b.authorized!==true||b.pricingVerified!==true||b.roleQualified!==true)return []
  if(!Number.isInteger(j.local.startedCount)||j.local.startedCount<0||j.local.startedCount>1||!['completed','known_failed'].includes(j.local.certainty)||!Array.isArray(j.stages)||j.stages.length>3||new Set(j.stages.map(s=>s.stage)).size!==j.stages.length||j.stages.some(s=>!['local_review','cloud_task','cloud_review'].includes(s.stage)||!['pending','dispatching','response_ready','human_ready','applied','unknown'].includes(s.state)||(s.verdict!==null&&!['approved','rejected','unknown'].includes(s.verdict))||!Number.isInteger(s.physicalCalls)||s.physicalCalls<0||s.physicalCalls>1||s.state==='unknown'||s.verdict==='unknown'||s.state==='human_ready'))return []
  const stages=new Map(j.stages.map(s=>[s.stage,s])),localReview=stages.get('local_review'),cloudTask=stages.get('cloud_task'),cloudReview=stages.get('cloud_review')
  let remaining:CloudStage[]
  if(cloudReview?.state==='applied'||localReview?.state==='applied'&&localReview.verdict==='approved')return []
  if(cloudTask?.state==='applied')remaining=['cloud_review']
  else if(j.local.certainty==='known_failed'||localReview?.state==='applied'&&localReview.verdict==='rejected')remaining=['cloud_task','cloud_review']
  else if(j.local.certainty==='completed'&&!cloudTask&&!cloudReview)remaining=['local_review','cloud_task','cloud_review']
  else return []
  if(![b.jobCapUsd,b.dailyCapUsd,b.dailyRemainingUsd,b.committedUsd].every(finite)||b.jobCapUsd<=0||b.dailyCapUsd<=0||b.dailyRemainingUsd<0||b.committedUsd<0)return []
  if(remaining.some(stage=>!finite(b.stageCeilingUsd[stage])||b.stageCeilingUsd[stage]<=0))return []
  const reserve=remaining.reduce((n,stage)=>n+micro(b.stageCeilingUsd[stage]),0)
  if(reserve+micro(b.committedUsd)>micro(Math.min(0.25,b.jobCapUsd))||reserve>micro(Math.min(5,b.dailyCapUsd,b.dailyRemainingUsd)))return []
  return remaining
 }catch{return []}
}
export function summarizeLocalTextCost(input:{localApiFeeUsd:0;localOperatingCostUsd:number|null;stages:{stage:CloudStage;apiCostUsd:number|null;usageRef:string|null}[];avoidedCloudTaskEstimateUsd:number|null}){
 const known=input.localApiFeeUsd===0&&input.stages.every(s=>finite(s.apiCostUsd)&&s.apiCostUsd>=0&&isUuid(s.usageRef))
 const totalApiCostUsd=known?input.stages.reduce((sum,s)=>sum+s.apiCostUsd!,0):null
 const totalOperatingCostUsd=totalApiCostUsd!==null&&finite(input.localOperatingCostUsd)&&input.localOperatingCostUsd>=0?totalApiCostUsd+input.localOperatingCostUsd:null
 const netApiSavingsEstimateUsd=totalApiCostUsd!==null&&finite(input.avoidedCloudTaskEstimateUsd)?input.avoidedCloudTaskEstimateUsd-totalApiCostUsd:null
 return {localApiFeeUsd:0,totalApiCostUsd,totalOperatingCostUsd,netApiSavingsEstimateUsd,guaranteedSavings:false as const,costUncertainty:[...(totalApiCostUsd===null?['api_usage_unknown']:[]),...(totalOperatingCostUsd===null?['operating_cost_unknown']:[])]}
}
/** Private server continuation. SQL must re-read source/stop/admission, atomically
 * reserve the remaining stages and create at most one next canonical run. */
export async function advanceLocalText(db:Db,jobId:string,now:Date):Promise<TransitionResult<JobReceipt>>{
 if(!isUuid(jobId)||!Number.isFinite(now.getTime()))return {kind:'refused',reason:'INVALID_JOB'}
 try{
  const call=db.rpc.bind(db) as unknown as (name:'local_text_advance',args:{p_job_id:string})=>PromiseLike<{data:unknown;error:unknown}>
  const {data,error}=await call('local_text_advance',{p_job_id:jobId})
  if(error||!data||typeof data!=='object')throw Error('unknown')
  const r=data as {kind?:unknown;reason?:unknown;value?:{receipt:unknown;task:unknown;inputHash:unknown}}
  if(r.kind==='refused'&&typeof r.reason==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/.test(r.reason))return {kind:'refused',reason:r.reason}
  // Shared store receipt parser validates untrusted SQL output and suppresses
  // unreviewed/expired output; this private wrapper never exposes raw RPC data.
  if((r.kind==='applied'||r.kind==='duplicate')&&r.value){const task=r.value.task===null?null:parseTask(r.value.task);if(task&&hashTask(task)!==r.value.inputHash)throw Error('hash');return {kind:r.kind,value:parseStoredReceipt(r.value.receipt,task,{jobId})}}
  throw Error('unknown')
 }catch{return {kind:'unknown',reconcileId:jobId}}
}
