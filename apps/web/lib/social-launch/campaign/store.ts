import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import {getRates} from '@/lib/cost/rates'
import {estimateImageSek} from '@/lib/cost/budget-gate'
import {isSpendGateEnforced} from '@/lib/cost/spend-gate-flag'
import {CampaignError,type CampaignPrincipal,type CampaignView,type CampaignWriter,type CampaignItem} from './types'
import {campaignId,campaignObject,parseCampaignInput} from './validate'
export type CampaignDb=ReturnType<typeof createAdminClient>
export type CampaignSnapshot={campaign:CampaignView;item:CampaignItem;shouldGenerate?:boolean}
export const isCampaignEnabled=()=>process.env.SOCIAL_CAMPAIGN_PREPARATION==='1'&&isSpendGateEnforced()
export function requireCampaignEnabled(){if(!isCampaignEnabled())throw new CampaignError('DISABLED')}
function scope(p:CampaignPrincipal,projectId:unknown){campaignId(p.userId);campaignId(projectId);if(!p.allowedProjectIds.includes(projectId))throw new CampaignError('NOT_FOUND')}
async function call<T>(db:CampaignDb,name:string,args:Record<string,unknown>):Promise<T>{
 const {data,error}=await (db as unknown as {rpc:(n:string,a:Record<string,unknown>)=>Promise<{data:unknown;error:{message?:string;code?:string}|null}>}).rpc(name,args)
 if(error){
 const message=error.message??''
 const code=error.code==='P0002'||error.code==='42501'?'NOT_FOUND':error.code==='23505'?'CONFLICT':
 (['INVALID_BODY','NOT_FOUND','CONFLICT','REVIEW_REQUIRED','PROFILE_REQUIRED','STOPPED','COST_LIMIT','FENCED','CANCELLED','UNCERTAIN'] as const).find(k=>message.includes('_'+k))??'UNAVAILABLE'
 throw new CampaignError(code)
 }
 if(!data)throw new CampaignError('UNAVAILABLE')
 return data as T
}
export async function enqueueCampaign(db:CampaignDb,p:CampaignPrincipal,conversationId:string,raw:unknown):Promise<CampaignView>{
 requireCampaignEnabled()
 const input=parseCampaignInput(raw);scope(p,input.projectId);campaignId(conversationId)
 const estimate=await estimateImageSek(1,'ideogram',await getRates())
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
function write(db:CampaignDb,w:CampaignWriter,name:string,input:Record<string,unknown>={}):Promise<CampaignSnapshot>{writer(w);return call(db,name,{p_writer:w,p_input:input})}
export const claimCampaignItem=(db:CampaignDb,w:CampaignWriter)=>write(db,w,'social_campaign_claim_item')
export const recordCampaignAsset=(db:CampaignDb,w:CampaignWriter,assetId:string)=>{campaignId(assetId);return write(db,w,'social_campaign_record_asset',{assetId})}
export const commitCampaignItem=(db:CampaignDb,w:CampaignWriter)=>write(db,w,'social_campaign_commit_item')
export const markCampaignItem=(db:CampaignDb,w:CampaignWriter,reason:'provider_unknown'|'admission_failed'|'save_failed'|'deadline'|'disabled'|'context_changed'|'cancelled'|'cost_limit'|'provider_refused',uncertain:boolean)=>write(db,w,'social_campaign_mark_item',{reason,uncertain})
