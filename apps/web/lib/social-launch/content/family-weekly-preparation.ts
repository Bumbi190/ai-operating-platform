import {createHash} from 'node:crypto'
import type {SocialContentInput,SocialContentView,SocialContentPrincipal} from './types'
import type {ScheduleWorkspaceView} from '../scheduling/store'
import {buildFamilyWeekCoverage,FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'
import {FAMILY_PUBLIC_PREVIEW_EVIDENCE,getFamilyPublicEditorialSlot} from './family-editorial-packs'
import type {OwnerApprovedPublicSource} from './family-month-source-activation'

/**
 * Project-owned, vetted public evidence only. Captions still need human review.
 * Subscriber audio and protected November images are NOT sources for public posts.
 */
export const FAMILY_NOVEMBER_PREVIEW_SOURCE=FAMILY_PUBLIC_PREVIEW_EVIDENCE
const PLAN_REVISION='e745041f-ad3a-493f-bd3b-025525d561b2'
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
 sourceId:string
 sourceSha256:string
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
 ownerApprovedSource?:OwnerApprovedPublicSource
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
  if(slot.status!=='needs_content'||slot.kind!=='ordinary')continue
  // The source registry is the ONLY authority for eligible dates and claims.
  // Unknown months/dates return null. Never reuse a previous month's template.
  const pinned=getFamilyPublicEditorialSlot({
   projectId:FAMILY_WEEKLY_PROJECT_ID,
   planRevisionId:content.currentPlanRevisionId,kind:slot.kind,
   channel:slot.channel,date:slot.localMinute.slice(0,10),
  })
  const approved=input.ownerApprovedSource
  const approvedRelease=approved?.sourceMonth&&
   /^20\d{2}-(0[1-9]|1[0-2])$/.test(approved.sourceMonth)?
   Date.parse(approved.sourceMonth+'-01T00:00:00.000Z'):NaN
  const slotDate=Date.parse(slot.localMinute.slice(0,10)+'T00:00:00.000Z')
  const nextCalendarMonth=Number.isFinite(slotDate)?
   new Date(Date.UTC(
    new Date(slotDate).getUTCFullYear(),
    new Date(slotDate).getUTCMonth()+1,1,
   )).toISOString().slice(0,7):null
  const eligibleDate=Number.isFinite(approvedRelease)&&
   approved?.sourceMonth===nextCalendarMonth&&
   approvedRelease-slotDate>0&&approvedRelease-slotDate<=45*86400000
  const trustedApproved=eligibleDate&&
   approved?.kind==='family-owner-approved-public-source-v1'&&
   approved.projectId===FAMILY_WEEKLY_PROJECT_ID&&
   approved.sourceIntegrityVerified===true&&
   approved.canDraftReviewProposals===true&&
   approved.canPublish===false&&approved.canGenerateMedia===false&&
   approved.canOpenMemberContent===false&&approved.canSchedule===false&&
   approved.canSpend===false&&
   /^[a-f0-9]{64}$/.test(approved.candidateSha256)&&
   /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(approved.candidateId)&&
   /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(approved.decisionId)&&
   Array.isArray(approved.templates)&&
   Array.isArray(approved.verifiedImageAssetIds)&&
   approved.verifiedImageAssetIds.length>=1&&
   approved.verifiedImageAssetIds.length<=3&&
   approved.verifiedImageAssetIds.every(id=>/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
  const matched=trustedApproved?
   approved!.templates.find(template=>template.date===slot.localMinute.slice(0,10)):undefined
  // No source may override the existing pinned marketing preview silently.
  if(pinned&&matched)throw Error('FAMILY_DRAFT_SOURCE_OVERLAP')
  const channel=slot.channel
  const source=pinned??(matched?{
   sourceId:'owner-approved-'+approved!.candidateId,
   sourceSha256:approved!.candidateSha256,
   variant:matched.variant,
   draft:{
    channel,format:channel==='facebook'?'text' as const:'image' as const,
    title:matched.title,text:matched.text,linkUrl:null,
    // Owner verified a single public marketing asset: its image ID may
    // be attached to a review DRAFT, never to a published post automatically.
    mediaIds:channel==='instagram'&&approved!.verifiedImageAssetIds.length===1?
     [...approved!.verifiedImageAssetIds]:[],
    mediaBrief:channel==='instagram'?
     'Granska den projekt?gda, SHA-verifierade marknadsf?ringsbilden och texten innan inneh?llet godk?nns.':'',
   },
  }:null)
  if(!source)continue
  const draft:SocialContentInput={
   ...source.draft,scheduledAt:slot.scheduledAt,
  }
  // One stable post per calendar slot. A later source/copy revision may change
  // the idempotency key but NEVER create another post for the same slot.
  // expectedRevisionId=null then fails closed if the existing post changed.
  const slotIdentity=FAMILY_WEEKLY_PROJECT_ID+'|'+PLAN_REVISION+
   '|'+channel+'|'+slot.scheduledAt
  const sourceIdentity=slotIdentity+'|'+source.sourceId+'|'+source.sourceSha256
  const proposal:FamilyReviewProposal={
   projectId:FAMILY_WEEKLY_PROJECT_ID,
   postId:idempotentId(slotIdentity),
   idempotencyKey:'fmn'+hash(sourceIdentity).slice(0,45),
   planRevisionId:PLAN_REVISION,
   expectedRevisionId:null,sourceId:source.sourceId,
   sourceSha256:source.sourceSha256,
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
 ownerApprovedSource?:OwnerApprovedPublicSource
 validateOwnerSourceBeforeSave?:(candidate:FamilyReviewProposal)=>Promise<void>
}){
 const {principal,conversationId}=input
 if(!principal.allowedProjectIds.includes(FAMILY_WEEKLY_PROJECT_ID)||
  typeof conversationId!=='string'||
  !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(conversationId))
  throw Error('FAMILY_DRAFT_AUTHORIZATION_REQUIRED')
 const pending=prepareFamilyReviewCandidates(input)
 const receipts:{postId:string;channel:string;scheduledAt:string}[]=[]
 for(const candidate of pending){
  if(candidate.sourceId.startsWith('owner-approved-')){
   // The review source must be checked again immediately before each
   // draft save. A user-supplied object cannot bypass the durable store.
   if(!input.validateOwnerSourceBeforeSave)
    throw Error('FAMILY_DRAFT_LATEST_OWNER_APPROVAL_REQUIRED')
   await input.validateOwnerSourceBeforeSave(candidate)
  }
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
