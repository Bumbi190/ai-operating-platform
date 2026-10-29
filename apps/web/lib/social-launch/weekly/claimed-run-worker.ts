/**
 * Dedicated Family weekly editorial handler for ALREADY claimed Omnira runs.
 * Does not create jobs, opt-in, claims or Cron; cannot publish or schedule.
 * Trust comes from the LIVE database RPC (run_id + current claim_id + owner
 * + project conversation + latest explicit consent event + unique week row).
 */
import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import {FAMILY_WEEKLY_PROJECT_ID,findWeeklyAutomaticWindow} from './auto-preparation'
import {familyWeeklyRuntimeEnabled,getVerifiedOwnerWeeklyEnrollment} from './enrollment'
import {weeklyConsentReadPort} from './enrollment-store'
import {weeklyPaidAttemptDbPort} from './paid-attempt-db'
import {weeklyReviewNoticeWritePort} from './review-notice-db'
import {getWeeklyContext} from './service'
import {runStep} from '@/lib/ai/runner'
import {prepareWeekForOwnerReview,type WeeklyPipelineResult} from './review-pipeline'
import type {WeeklyAutoContext} from './auto-draft-model'

type Admin=ReturnType<typeof createAdminClient>
const ID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const KEY='family_weekly_editorial_drafts' as const
type Input={ownerId:string;conversationId:string;weekStart:string;eventId:number;source:'family_weekly_sunday_v1'}
export type FamilyClaimedRun={
 id:string;project_id:string;claim_id:string|null;status:string;kind:string|null;
 workflow_id:string|null;idempotency_key:string|null;
 attempts:number;max_attempts:number;input:unknown
}
export type VerifiedClaimedFamilyRun={
 ownerId:string;conversationId:string;weekStart:string;eventId:number;
 runId:string;claimId:string
}
const denied=(reason:string):WeeklyPipelineResult=>({
 status:'blocked',reason,modelCalls:0,publicationAuthority:false,
})
export function parseClaimedFamilyRun(row:unknown):VerifiedClaimedFamilyRun|null{
 if(!row||typeof row!=='object'||Array.isArray(row))return null
 const r=row as Partial<FamilyClaimedRun>
 if(!ID.test(r.id??'')||r.project_id!==FAMILY_WEEKLY_PROJECT_ID||
 !ID.test(r.claim_id??'')||r.status!=='running'||r.kind!==KEY||
 r.workflow_id!==null||r.idempotency_key!==null||
 r.attempts!==1||r.max_attempts!==1||
 !r.input||typeof r.input!=='object'||Array.isArray(r.input))return null
 const x=r.input as Partial<Input>
 if(Object.keys(x).sort().join('|')!=='conversationId|eventId|ownerId|source|weekStart'||
 !ID.test(x.ownerId??'')||!ID.test(x.conversationId??'')||
 typeof x.eventId!=='number'||!Number.isSafeInteger(x.eventId)||x.eventId<1||
 x.source!=='family_weekly_sunday_v1'||typeof x.weekStart!=='string'||
 !/^20\d\d-\d\d-\d\d$/.test(x.weekStart))return null
 const date=new Date(x.weekStart+'T12:00:00Z')
 if(!Number.isFinite(date.getTime())||date.getUTCDay()!==1||
 date.toISOString().slice(0,10)!==x.weekStart)return null
 return {
  ownerId:x.ownerId!,conversationId:x.conversationId!,weekStart:x.weekStart,
  eventId:x.eventId,runId:r.id!,claimId:r.claim_id!,
 }
}

export async function executeClaimedFamilyWeeklyRun(
 db:Admin,run:unknown,now=new Date().toISOString(),
):Promise<WeeklyPipelineResult>{
 if(!familyWeeklyRuntimeEnabled())return denied('runtime_disabled')
 const claimed=parseClaimedFamilyRun(run)
 if(!claimed)return denied('claim_shape_invalid')
 const w=findWeeklyAutomaticWindow(now)
 if(w.status!=='scheduled_window'||w.weekStart!==claimed.weekStart){
  return denied('review_window_closed')
 }
 // Only service_role may execute this source-of-truth verifier. A spoofed
 // runs.input cannot grant owner rights, claim status or a prior consent.
 type Rpc={rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>}
 try{
  const {data,error}=await (db as unknown as Rpc).rpc('family_weekly_authority_current',{
   p_owner_id:claimed.ownerId,p_run_id:claimed.runId,
   p_claim_id:claimed.claimId,p_consent_event_id:claimed.eventId,
   p_conversation_id:claimed.conversationId,p_week_start:claimed.weekStart,
  })
  if(error||data!==true)return denied('trusted_claim_unavailable')
 }catch{return denied('trusted_claim_unavailable')}
 const principal={userId:claimed.ownerId,allowedProjectIds:[FAMILY_WEEKLY_PROJECT_ID]}
 const scoped={
  projectId:FAMILY_WEEKLY_PROJECT_ID,
  weekStart:claimed.weekStart,
  conversationId:claimed.conversationId,
 }
 const consentPort=weeklyConsentReadPort(db)
 const attemptPort=weeklyPaidAttemptDbPort(db)
 const noticeWriter=weeklyReviewNoticeWritePort(db)
 return prepareWeekForOwnerReview({
  owner:principal,conversationId:claimed.conversationId,now,
  run:{kind:'RUN_BOUND',context:'AUTONOMOUS',
   runId:claimed.runId,claimId:claimed.claimId},
 },{
  ...attemptPort,noticeWriter,
  loadVerifiedEnrollment:async owner=>{
   const consent=await getVerifiedOwnerWeeklyEnrollment(
    consentPort,owner.userId,new Date().toISOString(),true)
   // The queued job's grant must still be CURRENT. Reissue or revoke blocks.
   return consent?.eventId===claimed.eventId?consent:null
  },
  loadWeeklyContext:async owner=>{
   const view=await getWeeklyContext(db,owner,scoped)
   return view as unknown as WeeklyAutoContext
  },
  runModel:runStep,
 })
}
