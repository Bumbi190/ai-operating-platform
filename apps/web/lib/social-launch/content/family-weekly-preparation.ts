import {createHash} from 'node:crypto'
import type {SocialContentInput,SocialContentView,SocialContentPrincipal} from './types'
import type {ScheduleWorkspaceView} from '../scheduling/store'
import {buildFamilyWeekCoverage,FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'
import {FAMILY_PUBLIC_PREVIEW_EVIDENCE,getFamilyPublicEditorialSlot} from './family-editorial-packs'

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
  const source=getFamilyPublicEditorialSlot({
   projectId:FAMILY_WEEKLY_PROJECT_ID,
   planRevisionId:content.currentPlanRevisionId,kind:slot.kind,
   channel:slot.channel,date:slot.localMinute.slice(0,10),
  })
  if(!source)continue
  const channel=slot.channel
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
