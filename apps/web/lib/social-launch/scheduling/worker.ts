import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import {assertExecutionDispatchAllowed,isExecutionStopped} from '@/lib/governance/execution-dispatch'
import {projectScope} from '@/lib/governance/execution-stop'
import {executeApprovedPublication,PublicationBudgetError,type PublicationJournal} from '../publication/executor'
import {MetaManualProvider,ManualProviderError,type ManualCredential} from '../publication/provider'
import {resolvePublicationCredential} from '../publication/credentials'
import {verifyPublicationImage} from '../publication/media'
import {ScheduleError,type ScheduleClaim} from './types'
import {enabledScheduleProjects,checkScheduleWrite,recordScheduleStep,readScheduleReceipt,recoverScheduleCheckpoint,claimScheduleJob,peekScheduleJobs,type ScheduleStepResult} from './store'
type Db=ReturnType<typeof createAdminClient>
export type ScheduledPublicationDependencies={provider:MetaManualProvider;resolveCredential:(projectId:string,channel:'facebook'|'instagram')=>Promise<ManualCredential&{bindingId:string}>;verifyImage:typeof verifyPublicationImage;now:()=>number}
const defaults=():ScheduledPublicationDependencies=>({provider:new MetaManualProvider(),resolveCredential:resolvePublicationCredential,verifyImage:verifyPublicationImage,now:()=>Date.now()})
const terminal=['published','failed','uncertain','blocked','cancelled','missed']
function refusal(error:unknown):'release_required'|'stopped'|'review_required'|'disabled'|'budget_exhausted'{
 if(isExecutionStopped(error)||error instanceof ScheduleError&&error.code==='STOPPED')return 'stopped'
 if(error instanceof ScheduleError&&error.code==='RELEASE_REQUIRED')return 'release_required'
 if(error instanceof ScheduleError&&error.code==='DISABLED')return 'disabled'
 if(error instanceof PublicationBudgetError||error instanceof ManualProviderError||error instanceof ScheduleError&&error.code==='EXPIRED')return 'budget_exhausted'
 return 'review_required'
}
export async function runScheduledPublication(db:Db,claim:ScheduleClaim,deps:ScheduledPublicationDependencies=defaults(),signal:AbortSignal=AbortSignal.timeout(45000)):Promise<ScheduleStepResult>{
 let current=claim,jobState='claimed'
 try{
  const snapshot=await checkScheduleWrite(db,current);current={...current,snapshot}
  if(signal.aborted)throw new PublicationBudgetError()
  const credential=await deps.resolveCredential(snapshot.projectId,snapshot.item.channel)
  if(credential.channel!==snapshot.item.channel||credential.bindingId!==snapshot.item.bindingId||credential.accountId!==snapshot.item.accountId)throw new ScheduleError('REVIEW_REQUIRED')
  const journal:PublicationJournal={
   prepare:async()=>{const result=await recordScheduleStep(db,current,{action:'prepare'});current=result.claim;jobState=result.jobState;if(!result.publication)throw new ScheduleError('UNAVAILABLE');return result.publication},
   step:async(record,action,extra={})=>{
    const result=await recordScheduleStep(db,current,{action,expectedVersion:record.version,...extra});current=result.claim;jobState=result.jobState
    if(!result.publication)throw new ScheduleError('UNAVAILABLE')
    return {changed:result.publication.version>record.version,record:result.publication}
   }
  }
  await executeApprovedPublication({db,snapshot:{projectId:snapshot.projectId,postId:snapshot.item.postId,revision:snapshot.revision},record:snapshot.publication,credential,journal,authorizeWrite:async()=>{
   const fresh=await checkScheduleWrite(db,current)
   if(fresh.approvalId!==snapshot.approvalId||fresh.manifestSha256!==snapshot.manifestSha256)throw new ScheduleError('REVIEW_REQUIRED')
   await assertExecutionDispatchAllowed({context:'AUTONOMOUS',scope:projectScope({projectId:fresh.projectId})},{system:fresh.item.channel,operation:'publish'})
  }},{provider:deps.provider,verifyImage:deps.verifyImage,now:deps.now,signal})
  if(terminal.includes(jobState))return readScheduleReceipt(db,current)
  return await recordScheduleStep(db,current,{action:'checkpoint',...(signal.aborted?{reason:'budget_exhausted' as const}:{})})
 }catch(error){
  const saved=await readScheduleReceipt(db,current)
  if(terminal.includes(saved.jobState))return saved
  // Readback cannot transfer another worker's lease to this process.
  if(saved.claim.claimId!==claim.claimId)return saved
  if(saved.publication&&['creating','publishing','published','failed','uncertain'].includes(saved.publication.state))return recoverScheduleCheckpoint(db,saved.claim)
  try{return await recordScheduleStep(db,saved.claim,{action:'checkpoint',reason:refusal(error)})}
  catch{return recoverScheduleCheckpoint(db,saved.claim)}
 }
}
export async function runScheduleTick(db:Db,input:{workerId:string;now:string;dryRun:boolean},deps:ScheduledPublicationDependencies=defaults()){
 const mode=input.dryRun?'dry_run' as const:'execute' as const,projects=enabledScheduleProjects()
 if(!projects.length)return {mode,jobId:null,result:'disabled'}
 if(input.dryRun){const peek=await peekScheduleJobs(db,projects);return {mode,...peek}}
 const signal=AbortSignal.timeout(45000),claim=await claimScheduleJob(db,input)
 if(!claim)return {mode,jobId:null,result:'no_jobs'}
 const result=await runScheduledPublication(db,claim,deps,signal)
 return {mode,jobId:claim.jobId,result:result.jobState}
}
