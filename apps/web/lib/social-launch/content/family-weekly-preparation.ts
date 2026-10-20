import {createHash} from 'node:crypto'
import type {SocialContentInput,SocialContentView,SocialContentPrincipal} from './types'
import type {ScheduleWorkspaceView} from '../scheduling/store'
import {buildFamilyWeekCoverage,FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'

/**
 * Pinned public editorial facts from Familje-Stunden's verified November
 * teaser artwork and story/activities. These are *review facts*, NOT an
 * assertion that November subscription content has been released.
 */
export const FAMILY_NOVEMBER_PREVIEW_SOURCE=Object.freeze({
 projectId:FAMILY_WEEKLY_PROJECT_ID,
 month:'2026-11',
 source:'november-teaser-owner-canonical-v1',
 heroSha256:'5789a09f28ad95334d5d1a3a08af3cc3d3201468d28f66f310da860db0815a76',
 activitySha256:'ffd12c414aba2b71e2c39965c22e5c71f1028905eb5ed64217c054893604b31b',
 factualTheme:'Löv- och Skuggmånaden',
 characters:'Nova och Pling',
 })
const PLAN_REVISION='e745041f-ad3a-493f-bd3b-025525d561b2'
const PLAN_SOURCE_VERSION='family-november-2026-editorial-prep-v1'
const hash=(s:string)=>createHash('sha256').update(s).digest('hex')
function idempotentId(raw:string){
 const h=hash(raw)
 // UUIDv5-formatted deterministic digest; no random IDs on retries.
 return [h.slice(0,8),h.slice(8,12),'5'+h.slice(13,16),
  '8'+h.slice(17,20),h.slice(20,32)].join('-')
}
export type FamilyReviewProposal={
 postId:string
 idempotencyKey:string
 planRevisionId:string
 expectedRevisionId:null
 projectId:typeof FAMILY_WEEKLY_PROJECT_ID
 sourceId:typeof PLAN_SOURCE_VERSION
 draft:SocialContentInput
 requiresMediaReview:boolean
}

/** Up to four existing-calendar slots. October preview only; no automatic
 * future-month content, release claims, source expansion or generative AI.
 */
export function prepareFamilyReviewCandidates(input:{
 content:SocialContentView
 schedule:ScheduleWorkspaceView
 now:string
 maxDrafts?:number
}):FamilyReviewProposal[]{
 const {content,schedule,now}=input
 const maxDrafts=input.maxDrafts??4
 if(!Number.isInteger(maxDrafts)||maxDrafts<1||maxDrafts>4)throw Error('FAMILY_DRAFT_CAP_INVALID')
 if(content.project.id!==FAMILY_WEEKLY_PROJECT_ID||
  content.project.slug!=='familje-stunden'||
  content.currentPlanRevisionId!==PLAN_REVISION)
  throw Error('FAMILY_DRAFT_PLAN_CHANGED')
 const coverage=buildFamilyWeekCoverage({content,schedule,now,daysAhead:14})
 const candidates:FamilyReviewProposal[]=[]
 for(const slot of coverage.slots){
  if(slot.status!=='needs_content'||slot.kind!=='ordinary'||
    slot.localMinute.slice(0,10)<'2026-10-21'||
    slot.localMinute.slice(0,10)>'2026-10-30')continue
  // We only have specific sourced copy for the October preview dates.
  // Ordinary content after October is intentionally blocked.
  const date=slot.localMinute.slice(0,10)
  if(!['2026-10-23','2026-10-27','2026-10-30'].includes(date))continue
  const channel=slot.channel
  const variant=date==='2026-10-23'?'forest':date==='2026-10-27'?'shadows':'leaves'
  const title=variant==='forest'?'En smygtitt på november':
   variant==='shadows'?'Följ skuggorna med Nova och Pling':'Snart väntar Löv- och Skuggmånaden'
  const text=variant==='forest'?
   'Vi förbereder Löv- och Skuggmånaden med Nova och Pling. Snart väntar nya skogsäventyr och aktiviteter att upptäcka tillsammans. Vad hoppas ni få utforska?':
   variant==='shadows'?
   'Vilka former kan en skugga gömma? I november bjuder Nova och Pling in till Löv- och Skuggmånaden. En liten smygtitt på ett äventyr som snart väntar.':
   'Bland löv och skuggor väntar nya stunder med Nova och Pling. Vi förbereder november tillsammans – med fantasi, lek och tid för varandra.'
  const mediaBrief=channel==='instagram'?
   'Välj en redan godkänd, projektägd November-illustration med Nova och Pling. Registrera bilden i Omnira och granska hash och bild innan godkännande. Inga privata sagosidor eller filer får publiceras.':''
  const draft:SocialContentInput={
   channel,format:channel==='facebook'?'text':'image',
   title,text,linkUrl:null,mediaIds:[],mediaBrief,scheduledAt:slot.scheduledAt,
  }
  const identity=PLAN_SOURCE_VERSION+'|'+FAMILY_WEEKLY_PROJECT_ID+'|'+PLAN_REVISION+
   '|'+channel+'|'+slot.scheduledAt+'|'+variant
  const proposal:FamilyReviewProposal={
   projectId:FAMILY_WEEKLY_PROJECT_ID,
   postId:idempotentId(identity),
   idempotencyKey:'fmn'+hash(identity).slice(0,45),
   planRevisionId:PLAN_REVISION,
   expectedRevisionId:null,sourceId:PLAN_SOURCE_VERSION,
   draft,requiresMediaReview:channel==='instagram',
  }
  // Stable deterministic key avoids repeated new draft IDs on retries.
  candidates.push(proposal)
  if(candidates.length>=maxDrafts)break
 }
 return candidates
}

/**
 * An authenticated Atlas action can invoke this with its existing owned
 * conversation and project principal. This does NOT call TTS, LLM, schedule,
 * media upload or publishing. The only writes are ordinary review proposals
 * through the existing versioned Social Content RPC. No cron connection.
 */
export async function stageFamilyReviewCandidates(input:{
 principal:SocialContentPrincipal
 conversationId:string
 now:string
 content:SocialContentView
 schedule:ScheduleWorkspaceView
 save:(proposal:{
  projectId:string;postId:string;planRevisionId:string
  expectedRevisionId:null;idempotencyKey:string;conversationId:string
  draft:SocialContentInput
 })=>Promise<unknown>
 maxDrafts?:number
}){
 const {principal,conversationId}=input
 if(!principal.allowedProjectIds.includes(FAMILY_WEEKLY_PROJECT_ID)||
  typeof conversationId!=='string'||
  !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(conversationId))
  throw Error('FAMILY_DRAFT_AUTHORIZATION_REQUIRED')
 const pending=prepareFamilyReviewCandidates(input)
 const receipts:{postId:string;channel:string;scheduledAt:string}[]=[]
 for(const candidate of pending){
  // Existing RPC enforces caller/conversation scope, plan revision and
  // idempotency. Stop on first failure rather than guessing success.
  await input.save({
   projectId:candidate.projectId,postId:candidate.postId,
   planRevisionId:candidate.planRevisionId,expectedRevisionId:null,
   idempotencyKey:candidate.idempotencyKey,conversationId,
   draft:candidate.draft,
  })
  receipts.push({postId:candidate.postId,channel:candidate.draft.channel,
   scheduledAt:candidate.draft.scheduledAt!})
 }
 return {kind:'family_weekly_review_staging_v1' as const,created:receipts.length,
  receipts,needsImageOwnerReview:pending.filter(x=>x.requiresMediaReview).length,
  canPublish:false as const,canApprove:false as const,
  aiGenerationCalls:0 as const}
}
