import 'server-only'
import type {Run} from '@/lib/supabase/types'
import {recordDispatchUnknown,finalizeOwnedRunUnlessCancelled} from '@/lib/governance/run-execution-checkpoint'
import {isPhysicalAdmissionRefusal} from '@/lib/governance/execution-signal'
import {ExecutionStoppedError} from '@/lib/governance/execution-stop'
import {ProviderNotDispatchedError,SpendRefusedError} from '@/lib/cost/governed-spend'
import {requireCampaignEnabled,claimCampaignItem,recordCampaignAsset,commitCampaignItem,markCampaignItem,type CampaignDb} from './store'
import {prepareCampaignImage} from './image'
import {CampaignError,type CampaignWriter} from './types'
import {campaignId,campaignObject} from './validate'
async function bounded<T>(signal:AbortSignal,job:()=>Promise<T>):Promise<T>{
 signal.throwIfAborted();let abort:()=>void=()=>{}
 const timeout=new Promise<never>((_,reject)=>{abort=()=>reject(new CampaignError('UNAVAILABLE'));signal.addEventListener('abort',abort,{once:true})})
 try{return await Promise.race([job(),timeout])}finally{signal.removeEventListener('abort',abort)}
}
function deadline(ms:number){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1,ms));return {signal:controller.signal,dispose:()=>clearTimeout(timer)}}
export const CAMPAIGN_RUN_KIND='social.campaign.image.v1'
export const isCampaignRun=(kind:unknown)=>kind===CAMPAIGN_RUN_KIND
export type CampaignRunResult='review_ready'|'blocked'|'uncertain'|'cancelled'|'deferred'|'fenced'|'lifecycle_error'|'already_running'
function knownRefusal(error:unknown){
 return error instanceof ProviderNotDispatchedError||error instanceof SpendRefusedError||isPhysicalAdmissionRefusal(error)||error instanceof ExecutionStoppedError
 ||error instanceof CampaignError&&error.code!=='UNAVAILABLE'&&error.code!=='UNCERTAIN'
}
export async function executeCampaignImageRun(db:CampaignDb,run:Run,claimId:string,invocationDeadline:number):Promise<CampaignRunResult>{
 if(!isCampaignRun(run.kind))throw new CampaignError('INVALID_BODY')
 campaignObject(run.input,['campaignId','itemId']);for(const id of [run.id,run.project_id,claimId,run.input.campaignId,run.input.itemId])campaignId(id)
 const w:CampaignWriter={projectId:run.project_id,runId:run.id,claimId,campaignId:run.input.campaignId as string,itemId:run.input.itemId as string}
 const totalDeadline=Math.min(Date.now()+65000,invocationDeadline-1000)
 async function settle(expected:'review_ready'|'blocked'|'uncertain'|'deferred',reason?:Parameters<typeof markCampaignItem>[2],uncertain=false):Promise<CampaignRunResult>{
  const clock=deadline(Math.min(10000,totalDeadline-Date.now()))
  try{
   if(reason){
    const marked=await bounded(clock.signal,()=>markCampaignItem(db,w,reason,uncertain,clock.signal))
    if(marked.item.state==='review_ready')expected='review_ready'
    else if(marked.item.state==='uncertain')expected='uncertain'
   }
   if(expected==='uncertain'){
    const result=await bounded(clock.signal,()=>recordDispatchUnknown(db,run.id,claimId,'SOCIAL_CAMPAIGN_'+(reason??'PREVIOUS_DISPATCH').toUpperCase(),{signal:clock.signal}))
    return result==='UNKNOWN_WRITTEN'?'uncertain':result==='FENCED'?'fenced':'lifecycle_error'
   }
   const payload=expected==='deferred'?{status:'pending',attempts:Math.max(0,(run.attempts??1)-1),claimed_at:null,lease_until:null}:
   {status:expected==='review_ready'?'done':'failed',finished_at:new Date().toISOString(),claimed_at:null,lease_until:null,...(expected==='blocked'?{last_error:'SOCIAL_CAMPAIGN_'+(reason??'BLOCKED').toUpperCase()}: {})}
   const result=await bounded(clock.signal,()=>finalizeOwnedRunUnlessCancelled(db,run.id,claimId,payload,{signal:clock.signal}))
   return result.outcome==='SUCCEEDED'?expected:result.outcome==='CANCELLED'?'cancelled':result.outcome==='FENCED'?'fenced':'lifecycle_error'
  }catch(error){return error instanceof CampaignError&&error.code==='FENCED'?'fenced':'lifecycle_error'}
  finally{clock.dispose()}
 }
 try{requireCampaignEnabled(run.project_id)}catch{return settle('blocked','disabled',false)}
 // Invocation congestion is not an authority or paid-request failure.
 if(invocationDeadline-Date.now()<80000)return settle('deferred')
 const work=deadline(Math.min(55000,totalDeadline-Date.now()-10000))
 let snapshot:Awaited<ReturnType<typeof claimCampaignItem>>
 try{snapshot=await bounded(work.signal,()=>claimCampaignItem(db,w,work.signal))}
 catch(error){
  work.dispose()
  // A lost claim response can belong to a still-running same-claim leader.
  // Leave its lease untouched; never manufacture a paid or terminal conclusion.
  if(!knownRefusal(error))return 'lifecycle_error'
  return settle('blocked','context_changed',true)
 }
 if(snapshot.alreadyRunning){work.dispose();return 'already_running'}
 if(snapshot.item.state==='review_ready'){work.dispose();return settle('review_ready')}
 if(!snapshot.shouldGenerate&&snapshot.item.state!=='asset_admitted'){
  work.dispose()
  return snapshot.item.state==='uncertain'?settle('uncertain'):settle('blocked')
 }
 let phase:'image'|'asset'|'save'=snapshot.shouldGenerate?'image':'save'
 try{
  if(snapshot.shouldGenerate){
   const assetId=await bounded(work.signal,()=>prepareCampaignImage(w,snapshot.item,work.signal,db))
   phase='asset'
   await bounded(work.signal,()=>recordCampaignAsset(db,w,assetId,work.signal))
  }
  phase='save'
  const saved=await bounded(work.signal,()=>commitCampaignItem(db,w,work.signal))
  if(saved.item.state!=='review_ready'||!saved.item.revisionId)throw new CampaignError('UNAVAILABLE')
  work.dispose();return settle('review_ready')
 }catch(error){
  work.dispose()
  const known=knownRefusal(error)
  const reason=phase==='save'?'save_failed':phase==='asset'?'admission_failed':error instanceof SpendRefusedError?'cost_limit':known?'provider_refused':'provider_unknown'
  return settle(known?'blocked':'uncertain',reason,!known)
 }finally{work.dispose()}
}
