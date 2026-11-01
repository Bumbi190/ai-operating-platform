import 'server-only'
import {campaignImageOrigins} from './config'
import type {createAdminClient} from '@/lib/supabase/admin'
import {getCurrentImageRates} from '@/lib/cost/current-image-rates'
import {estimateImageSek} from '@/lib/cost/budget-gate'
import {isSpendGateEnforced} from '@/lib/cost/spend-gate-flag'
import {CampaignError,type CampaignPrincipal,type CampaignView,type CampaignWriter,type CampaignItem} from './types'
import {campaignId,campaignObject,parseCampaignInput} from './validate'
export type CampaignDb=ReturnType<typeof createAdminClient>
export type CampaignSnapshot={campaign:CampaignView;item:CampaignItem;shouldGenerate?:boolean;alreadyRunning?:boolean}
export function isCampaignEnabled(projectId:string):boolean{
 const projects=process.env.SOCIAL_CAMPAIGN_PROJECT_IDS?.split(',').map(v=>v.trim().toLowerCase())??[]
 try{for(const id of projects)campaignId(id)}catch{return false}
 return process.env.SOCIAL_CAMPAIGN_PREPARATION==='1'&&isSpendGateEnforced()&&projects.includes(projectId.toLowerCase())
}
export function requireCampaignEnabled(projectId:string){if(!isCampaignEnabled(projectId))throw new CampaignError('DISABLED')}
function scope(p:CampaignPrincipal,projectId:unknown){campaignId(p.userId);campaignId(projectId);if(!p.allowedProjectIds.includes(projectId))throw new CampaignError('NOT_FOUND')}
async function call<T>(db:CampaignDb,name:string,args:Record<string,unknown>,signal?:AbortSignal):Promise<T>{
 const request=(db as unknown as {rpc:(n:string,a:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string;code?:string}|null}>&{abortSignal:(s:AbortSignal)=>PromiseLike<{data:unknown;error:{message?:string;code?:string}|null}>}}).rpc(name,args)
 const {data,error}=await (signal?request.abortSignal(signal):request)
 if(error){
 const message=error.message??''
 const code=error.code==='P0002'||error.code==='42501'?'NOT_FOUND':error.code==='23505'?'CONFLICT':
 (['INVALID_BODY','NOT_FOUND','CONFLICT','REVIEW_REQUIRED','PROFILE_REQUIRED','STOPPED','COST_LIMIT','FENCED','CANCELLED','UNCERTAIN'] as const).find(k=>message.includes('_'+k))??'UNAVAILABLE'
 throw new CampaignError(code)
 }
 if(data===null&&name!=='social_campaign_replay')throw new CampaignError('UNAVAILABLE')
 return data as T
}
export async function enqueueCampaign(db:CampaignDb,p:CampaignPrincipal,conversationId:string,raw:unknown):Promise<CampaignView>{
 const input=parseCampaignInput(raw,undefined,true);requireCampaignEnabled(input.projectId);campaignImageOrigins()
 scope(p,input.projectId);campaignId(conversationId)
 const replay=await call<CampaignView|null>(db,'social_campaign_replay',{p_principal:p,p_input:{...input,conversationId}})
 if(replay)return replay
 parseCampaignInput(raw)
 const estimate=await estimateImageSek(1,'ideogram',await getCurrentImageRates(db))
 const unitCeilingSek=Math.ceil(estimate*10000)/10000
 if(!Number.isFinite(unitCeilingSek)||unitCeilingSek<=0||unitCeilingSek*input.items.length>5)throw new CampaignError('COST_LIMIT')
 return call(db,'social_campaign_enqueue',{p_principal:p,p_input:{...input,conversationId},p_unit_ceiling_sek:unitCeilingSek})
}
export async function readCampaign(db:CampaignDb,p:CampaignPrincipal,input:{projectId:string;campaignId:string}):Promise<CampaignView>{
 campaignObject(input,['projectId','campaignId']);scope(p,input.projectId);campaignId(input.campaignId)
 return call(db,'social_campaign_read',{p_principal:p,p_input:input})
}
export async function cancelCampaign(db:CampaignDb,p:CampaignPrincipal,input:{projectId:string;campaignId:string}):Promise<CampaignView>{
 campaignObject(input,['projectId','campaignId']);scope(p,input.projectId);campaignId(input.campaignId)
 return call(db,'social_campaign_cancel',{p_principal:p,p_input:input})
}
function writer(w:CampaignWriter){campaignObject(w,['projectId','campaignId','itemId','runId','claimId']);for(const value of Object.values(w))campaignId(value)}
function write(db:CampaignDb,w:CampaignWriter,name:string,input:Record<string,unknown>={},signal?:AbortSignal):Promise<CampaignSnapshot>{writer(w);return call(db,name,{p_writer:w,p_input:input},signal)}
export const checkCampaignItemAuthority=(db:CampaignDb,w:CampaignWriter,signal?:AbortSignal)=>write(db,w,'social_campaign_check_item',{},signal)
export const claimCampaignItem=(db:CampaignDb,w:CampaignWriter,signal?:AbortSignal)=>write(db,w,'social_campaign_claim_item',{},signal)
export const recordCampaignAsset=(db:CampaignDb,w:CampaignWriter,assetId:string,signal?:AbortSignal)=>{campaignId(assetId);return write(db,w,'social_campaign_record_asset',{assetId},signal)}
export const commitCampaignItem=(db:CampaignDb,w:CampaignWriter,signal?:AbortSignal)=>write(db,w,'social_campaign_commit_item',{},signal)
export const markCampaignItem=(db:CampaignDb,w:CampaignWriter,reason:'provider_unknown'|'admission_failed'|'save_failed'|'deadline'|'disabled'|'context_changed'|'cancelled'|'cost_limit'|'provider_refused',uncertain:boolean,signal?:AbortSignal)=>write(db,w,'social_campaign_mark_item',{reason,uncertain},signal)
