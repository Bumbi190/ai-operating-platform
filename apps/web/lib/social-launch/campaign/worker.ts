import 'server-only'
import type {Run} from '@/lib/supabase/types'
import {recordDispatchUnknown} from '@/lib/governance/run-execution-checkpoint'
import {requireCampaignEnabled,claimCampaignItem,recordCampaignAsset,commitCampaignItem,markCampaignItem,type CampaignDb} from './store'
import {prepareCampaignImage} from './image'
import {CampaignError,type CampaignWriter} from './types'
import {campaignId,campaignObject} from './validate'
async function bounded<T>(signal:AbortSignal,job:()=>Promise<T>):Promise<T>{
 signal.throwIfAborted()
 let abort:()=>void=()=>{}
 const timeout=new Promise<never>((_,reject)=>{abort=()=>reject(new CampaignError('UNCERTAIN'));signal.addEventListener('abort',abort,{once:true})})
 try{return await Promise.race([job(),timeout])}finally{signal.removeEventListener('abort',abort)}
}
export const CAMPAIGN_RUN_KIND='social.campaign.image.v1'
export const isCampaignRun=(kind:unknown)=>kind===CAMPAIGN_RUN_KIND
export async function executeCampaignImageRun(db:CampaignDb,run:Run,claimId:string,invocationDeadline:number):Promise<'review_ready'|'blocked'|'uncertain'>{
 if(!isCampaignRun(run.kind))throw new CampaignError('INVALID_BODY')
 campaignObject(run.input,['campaignId','itemId']);for(const id of [run.id,run.project_id,claimId,run.input.campaignId,run.input.itemId])campaignId(id)
 const w:CampaignWriter={projectId:run.project_id,runId:run.id,claimId,campaignId:run.input.campaignId as string,itemId:run.input.itemId as string}
 try{requireCampaignEnabled();if(invocationDeadline-Date.now()<80000)throw new CampaignError('STOPPED')}
 catch(error){try{await markCampaignItem(db,w,error instanceof CampaignError&&error.code==='DISABLED'?'disabled':'deadline',false)}catch{/* Durable run failure remains the fallback evidence. */}throw error}
 const snapshot=await claimCampaignItem(db,w)
 if(snapshot.item.state==='review_ready')return 'review_ready'
 if(!snapshot.shouldGenerate&&snapshot.item.state!=='asset_admitted'){
  if(snapshot.item.state==='uncertain'){await recordDispatchUnknown(db,run.id,claimId,'SOCIAL_CAMPAIGN_PREVIOUS_DISPATCH');return 'uncertain'}
  throw new CampaignError('UNCERTAIN')
 }
 const controller=new AbortController(),signal=controller.signal
 const timer=setTimeout(()=>controller.abort(),65000)
 try{
  if(snapshot.shouldGenerate){
   const assetId=await bounded(signal,()=>prepareCampaignImage(w,snapshot.item,signal))
   // Evidence survives cancellation/expiry; permission to save content is separate.
   await bounded(signal,()=>recordCampaignAsset(db,w,assetId))
  }
  signal.throwIfAborted()
  const saved=await bounded(signal,()=>commitCampaignItem(db,w))
  if(saved.item.state!=='review_ready'||!saved.item.revisionId)throw new CampaignError('UNCERTAIN')
  return 'review_ready'
 }catch(error){
  const reason=snapshot.shouldGenerate?'provider_unknown':'save_failed'
  try{await markCampaignItem(db,w,reason,true)}catch{/* Never turn failed bookkeeping into another paid attempt. */}
  await recordDispatchUnknown(db,run.id,claimId,'SOCIAL_CAMPAIGN_'+(error instanceof CampaignError?error.code:'UNCERTAIN'))
  return 'uncertain'
 }finally{clearTimeout(timer)}
}
