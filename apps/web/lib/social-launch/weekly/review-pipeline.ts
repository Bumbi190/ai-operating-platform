/**
 * Owner-reviewed weekly draft orchestrator. INERT: no cron/API or enrollment
 * adapter is wired. Only a future trusted claimed-run worker may call this.
 *
 * The existing weekly save RPC owns race/idempotency/source-hash checks.
 * This module never authorizes scheduling, publishing, sending or paid images.
 */
import 'server-only'
import {FAMILY_WEEKLY_PROJECT_ID,findWeeklyAutomaticWindow,evaluateAutomaticWeeklyPreparation} from './auto-preparation'
import {
 generateReviewOnlyWeeklyDrafts,buildWeeklyDraftPrompt,type WeeklyAutoContext,
 type VerifiedWeeklyEnrollment,type WeeklyModelInvocation,
} from './auto-draft-model'
import type {RunStepInput,RunStepResult} from '@/lib/ai/runner'
import type {WeeklySave} from './service'
import {acquirePaidAttemptOnce,saveEditorialWithFrozenAuthority,type PaidAttemptPort} from './paid-attempt'
import {recordWeeklyReviewNotice,type ReviewNoticeWritePort} from './review-notice-store'

type Owner={userId:string;allowedProjectIds:string[]}
type AutoRun=WeeklyModelInvocation['run']
type AutoPort=PaidAttemptPort&{
 /** A service-role adapter, never a client or email delivery endpoint. */
 noticeWriter:ReviewNoticeWritePort
 /** MUST read a durable authenticated operator grant; never trust the model or request body. */
 loadVerifiedEnrollment:(owner:Owner,projectId:string)=>Promise<VerifiedWeeklyEnrollment|null>
 /** Existing getWeeklyContext, with owner principal and an owner-owned conversation. */
 loadWeeklyContext:(owner:Owner,scope:{projectId:string;weekStart:string;conversationId:string})=>Promise<WeeklyAutoContext>
 /** Never use the direct social_weekly_save writer here: only the atomic
  * verified SQL wrapper under the shared consent/revocation lock is allowed. */
 /** Existing cost/governance-controlled runner; replace with a mock in unit tests. */
 runModel:(request:RunStepInput)=>Promise<RunStepResult>
}
export type ReviewNotification={
 kind:'familje-stunden-weekly-editorial-review'
 projectId:string;weekStart:string;preparationId:string;count:number
 workspaceUrl:string;message:string
}
export type WeeklyPipelineResult=
 | {status:'blocked';reason:string;modelCalls:0|1;publicationAuthority:false}
 | {status:'review_ready';weekStart:string;notice:ReviewNotification;
    preparationId:string;noticeStored:boolean;modelCalls:1;publicationAuthority:false}

const ID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const HASH=/^[a-f0-9]{64}$/
const REVIEW_URL='https://app.omniraos.se/projects/familje-stunden/social#content'
const reject=(reason:string,modelCalls:0|1=0):WeeklyPipelineResult=>
 ({status:'blocked',reason,modelCalls,publicationAuthority:false})
function sameConsent(a:VerifiedWeeklyEnrollment,b:VerifiedWeeklyEnrollment):boolean{
 return a.status==='owner_verified'&&b.status==='owner_verified'&&
 a.eventId===b.eventId&&a.ownerId===b.ownerId&&a.projectId===b.projectId&&
 a.validThrough===b.validThrough&&a.permittedOperation===b.permittedOperation
}
export function buildWeeklyReviewNotice(
 saved:unknown,weekStart:string,expectedCount:number
):ReviewNotification|null{
 if(!saved||typeof saved!=='object'||Array.isArray(saved)||
 !/^20\d\d-\d\d-\d\d$/.test(weekStart)||expectedCount<1||expectedCount>4)return null
 const r=saved as Record<string,unknown>
 if(typeof r.preparationId!=='string'||!ID.test(r.preparationId)||
  r.status!=='editorial_review_required'||r.publicationAuthority!==false||
  !Array.isArray(r.posts)||r.posts.length!==expectedCount)return null
 return {kind:'familje-stunden-weekly-editorial-review',
  projectId:FAMILY_WEEKLY_PROJECT_ID,weekStart,
  preparationId:r.preparationId,count:expectedCount,
  // Never let a stored or model-supplied URL change the owner review destination.
  workspaceUrl:REVIEW_URL,
  message:'Atlas har förberett '+expectedCount+' utkast för veckan '+weekStart+
   '. Granska versionerna i Familje-Stundens sociala arbetsyta. '+
   'Ingenting är ännu godkänt, schemalagt eller publicerat.'}
}

/** Does not deliver the returned notice. Future notifier must verify saved ID. */
export async function prepareWeekForOwnerReview(
 input:{owner:Owner;conversationId:string;now:string;run:AutoRun},
 deps:AutoPort,
):Promise<WeeklyPipelineResult>{
 const {owner,conversationId,now,run}=input
 if(!owner||!ID.test(owner.userId)||
 !owner.allowedProjectIds?.includes(FAMILY_WEEKLY_PROJECT_ID)||
 !ID.test(conversationId)||!run||run.kind!=='RUN_BOUND'||
 run.context!=='AUTONOMOUS'||!ID.test(run.runId)||!ID.test(run.claimId)){
  return reject('owner_or_run_unavailable')
 }
 const window=findWeeklyAutomaticWindow(now)
 if(window.status!=='scheduled_window')return reject(window.status)
 const consent=await deps.loadVerifiedEnrollment(owner,FAMILY_WEEKLY_PROJECT_ID)
 if(!consent||consent.status!=='owner_verified'||consent.projectId!==FAMILY_WEEKLY_PROJECT_ID||
 consent.ownerId!==owner.userId||consent.permittedOperation!=='family_weekly_caption_drafts'||
 !Number.isFinite(Date.parse(consent.validThrough))||
 Date.parse(consent.validThrough)<=Date.parse(now))return reject('owner_enrollment_unavailable')
 const scope={projectId:FAMILY_WEEKLY_PROJECT_ID,weekStart:window.weekStart,conversationId}
 const context=await deps.loadWeeklyContext(owner,scope)
 if(!context||!HASH.test(context.contextHash)||context.project?.id!==FAMILY_WEEKLY_PROJECT_ID){
  return reject('trusted_weekly_context_unavailable')
 }
 // Do not permanently consume a week when current facts are already blocked:
 // only the actual billable model admission needs the irrevocable DB receipt.
 const preflight=evaluateAutomaticWeeklyPreparation({
  projectId:FAMILY_WEEKLY_PROJECT_ID,ownerOptIn:true,now,evidence:context,
 })
 if(preflight.status!=='ready_to_prepare_drafts')return reject(preflight.status)
 if(!buildWeeklyDraftPrompt(context,preflight.slotKeys))return reject('verified_content_missing')
 const admission=await acquirePaidAttemptOnce(deps,{
  projectId:FAMILY_WEEKLY_PROJECT_ID,ownerId:owner.userId,
  weekStart:window.weekStart,conversationId,
  runId:run.runId,claimId:run.claimId,eventId:consent.eventId,
 })
 if(!admission)return reject('paid_attempt_not_authorized')
 const result=await generateReviewOnlyWeeklyDrafts({
  projectId:FAMILY_WEEKLY_PROJECT_ID,ownerId:owner.userId,conversationId,now,
  context,run,verifiedEnrollment:consent,paidAttempt:admission,
 },deps.runModel)
 if(result.status!=='candidates_ready')return result
 // An owner may revoke consent while the paid model runs. Re-check before
 // touching the native editor; never retry the paid call automatically.
 const refreshed=await deps.loadVerifiedEnrollment(owner,FAMILY_WEEKLY_PROJECT_ID)
 if(!refreshed||!sameConsent(consent,refreshed)||
 Date.parse(refreshed.validThrough)<=Math.max(Date.now(),Date.parse(now))){
  return reject('owner_enrollment_revoked',1)
 }
 let saved:unknown
 try{
  // This SQL RPC serializes with consent INSERT/revoke and re-verifies the
  // real RUN_BOUND claim, owner conversation and source hash atomically.
  saved=await saveEditorialWithFrozenAuthority(deps,admission,{
   ...scope,generation:1,contextHash:result.contextHash,
   idempotencyKey:'weekly_'+window.weekStart.replace(/-/g,'')+'_'+context.contextHash.slice(0,24),
   drafts:result.drafts,
  })
 }catch{
  // An ambiguous save receipt cannot authorize retries or a new charge.
  return reject('editorial_save_unavailable',1)
 }
 const notice=buildWeeklyReviewNotice(saved,window.weekStart,result.drafts.length)
 if(!notice)return reject('review_receipt_unverified',1)
 // Record only the existing native save receipt. The SQL unique preparation
 // key makes re-delivery idempotent; a failed notice must NEVER trigger a new
 // model attempt or imply the editorial draft was not already saved.
 const noticeStatus=await recordWeeklyReviewNotice(deps.noticeWriter,owner.userId,notice)
 return {status:'review_ready',weekStart:window.weekStart,
  notice,noticeStored:noticeStatus==='recorded',preparationId:notice.preparationId,
  modelCalls:1,publicationAuthority:false}
}
