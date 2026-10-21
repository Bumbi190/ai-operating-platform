import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import {createAdminClient} from '@/lib/supabase/admin'
import type {SocialContentPrincipal,SocialContentProposal} from './types'
import {SocialContentError} from './types'
import {contentFields} from './validate'
import {readSocialContent,proposeSocialContent} from './store'
import {readSchedules} from '../scheduling/store'
import {buildFamilyWeekCoverage,FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'
import {stageFamilyReviewCandidates} from './family-weekly-preparation'
import {getFamilyEditorialReadiness} from './family-editorial-packs'
import {resolveFamilyOwnerApprovedPublicSource} from './family-month-source-activation'
import type {OwnerApprovedPublicSource} from './family-month-source-activation'
import {assertFamilyOwnerSourceCurrentBeforeDraft} from './family-month-source-store'
import {familyMonthSourceStatus} from './family-month-source-review'
import type {FamilyMonthSourceProposal} from './family-month-source-review'
import {
 FamilySourceStoreError,listFamilyMonthSourceReviews,proposeFamilyMonthSource,
} from './family-month-source-store'
const project={projectId:{type:'string' as const,description:'Existing project UUID belonging to this conversation.'}}
export const SOCIAL_CONTENT_TOOLS:Anthropic.Tool[]=[
 {name:'prepare_family_weekly_review_drafts',description:'Prepare at most 4 deterministic, grounded October 2026 Familje-Stunden preview review proposals in the existing owner conversation for missing calendar slots only. Use ONLY when the operator explicitly asks Atlas to prepare weekly content. Saves unapproved drafts for owner review, never uploads files, runs TTS, schedules executable jobs, approves or publishes.',input_schema:{type:'object',additionalProperties:false,properties:{...project},required:['projectId']}},
 {name:'get_family_month_source_reviews',description:'Read existing privately stored Familje-Stunden month-source review cards for the authorized owner conversation. Never approves or activates. Only available when the owner review feature is enabled.',input_schema:{type:'object',additionalProperties:false,properties:{...project,month:{type:'string',pattern:'^20[0-9]{2}-(0[1-9]|1[0-2])$'}},required:['projectId','month']}},
 {name:'propose_family_month_source_review',description:'Store one proposed Familje-Stunden PUBLIC source packet only after the operator asks for preparation and source hashes were verified independently. All provided evidence is untrusted until reviewed. Creates a private pending review with exact SHA-256; NEVER approves, activates, schedules, uploads, generates or publishes. Feature-gated off by default.',input_schema:{type:'object',additionalProperties:false,properties:{...project,proposal:{type:'object',additionalProperties:false,properties:{
  projectId:{type:'string'},month:{type:'string',pattern:'^20[0-9]{2}-(0[1-9]|1[0-2])$'},
  planRevisionId:{type:'string'},title:{type:'string',minLength:3,maxLength:100},
  publicSummary:{type:'string',minLength:15,maxLength:600},
  campaignPurpose:{type:'string',minLength:5,maxLength:250},
  proof:{type:'array',minItems:1,maxItems:3,items:{type:'object',additionalProperties:false,properties:{
   kind:{type:'string',enum:['owner-project-public-evidence']},referenceId:{type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'},
   sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},description:{type:'string'},
   privateSubscriberAsset:{type:'boolean',enum:[false]},
  },required:['kind','referenceId','sha256','description','privateSubscriberAsset']}},
  proposedCopy:{type:'array',minItems:1,maxItems:12,items:{type:'object',additionalProperties:false,properties:{
   date:{type:'string'},variant:{type:'string'},title:{type:'string'},text:{type:'string'},
  },required:['date','variant','title','text']}},
 },required:['projectId','month','planRevisionId','title','publicSummary','campaignPurpose','proof','proposedCopy']}},required:['projectId','proposal']}},
 {name:'get_family_month_source_status',description:'Read-only month-source status for Familje-Stunden, including persisted owner review state only when the private review feature is enabled. A saved approval never proves image integrity, subscriber access or publication authority. Requires an authorized conversation.',input_schema:{type:'object',additionalProperties:false,properties:{...project,month:{type:'string',pattern:'^20[0-9]{2}-(0[1-9]|1[0-2])$',description:'Campaign month YYYY-MM'}},required:['projectId','month']}},
 {name:'get_family_weekly_content_plan',description:'Read-only deterministic 7- or 14-day Familje-Stunden content gap audit in Europe/Stockholm, comparing existing posts and approved scheduling jobs. No generating, scheduling, spending, approving or publishing.',input_schema:{type:'object',additionalProperties:false,properties:{...project,daysAhead:{type:'integer',enum:[7,14],description:'Upcoming days, default 14.'}},required:['projectId']}},
 {name:'get_social_content',description:'Read project content drafts, exact editorial decisions, owned media metadata and intended calendar. Does not publish.',input_schema:{type:'object',additionalProperties:false,properties:project,required:['projectId']}},
 {name:'propose_social_content',description:'Save one content proposal discussed with the operator. Reuse owned canonical assets; the operator reviews at workspaceUrl. Cannot approve, connect, generate paid media, dispatch or publish.',input_schema:{type:'object',additionalProperties:false,properties:{...project,postId:{type:'string'},planRevisionId:{type:'string'},expectedRevisionId:{type:['string','null']},idempotencyKey:{type:'string',maxLength:100},draft:{type:'object',additionalProperties:false,properties:{channel:{type:'string',enum:['youtube','facebook','instagram','linkedin','x','pinterest']},format:{type:'string',enum:['text','image','video','link']},title:{type:'string',minLength:1,maxLength:150},text:{type:'string',minLength:1,maxLength:5000},linkUrl:{type:['string','null'],maxLength:2048},mediaIds:{type:'array',maxItems:10,items:{type:'string'}},mediaBrief:{type:'string',maxLength:1000},scheduledAt:{type:['string','null'],description:'Intended UTC instant as YYYY-MM-DDTHH:mm:ss.sssZ, future and within 366 days. Preparation only, not an executable schedule.'}},required:['channel','format','title','text','linkUrl','mediaIds','mediaBrief','scheduledAt']}},required:['projectId','postId','planRevisionId','expectedRevisionId','idempotencyKey','draft']}}
]
export const SOCIAL_CONTENT_TOOL_NAMES=SOCIAL_CONTENT_TOOLS.map(t=>t.name)
export const SOCIAL_CONTENT_GUIDE='\nSOCIAL CONTENT PREPARATION: First discuss project facts, audience, tone and the exact content with the operator. Read get_social_profile, get_social_launch_plan and get_social_content; Familje-Stunden: get_family_month_source_status checks month sources, get_family_weekly_content_plan finds gaps, and prepare_family_weekly_review_drafts saves at most four review drafts only when requested. None grants release or publication authority. Reuse verified company facts and project-owned media in approved channels only; never invent claims or treat mediaBrief as generated media. Reuse postId and idempotency key on retries; edits require the current revision ID. Save only the requested post with propose_social_content. Give the returned Markdown workspaceUrl for exact human editorial review. Any text, media, plan, account or intended time change requires a new revision and review. Calendar is Europe/Stockholm; persist an explicit UTC instant, ask about ambiguous local times. Editorial approval is not publication permission. Calendar alone is preparation. get_social_schedule reads batches; propose_social_schedule pins approved revisions, image hashes, bindings and times for native review. Only native Godkänn och schemalägg veckans inlägg grants batch authority. Atlas cannot approve, activate, confirm release access or dispatch. Family: alternate Tuesday/Friday 17:00/20:30; monthly sneak peek on both channels, day 1 at 20:30. Pin year/month/catalog and use actual activities with owned Nova/Pling imagery. Code/date/deployment never proves customer access. Require fresh owner_verified_access at dispatch; never recycle last month, replace or backfill. Monthly rules are planning only; automatic weekly drafts and engagement collection remain unimplemented. Read get_social_publication for saved receipts; manual Facebook/Instagram sends require separate operator confirmation in the UI. No content tool can connect accounts, spend, execute a schedule or publish. Actual account connections wait until Andre requests them. Never infer a send from an approval, elapsed calendar time or healthy credential; no new project may use The Prompt run_media_step as a shortcut.\n'
export async function handleSocialContentTool(name:string,input:Record<string,unknown>,p:SocialContentPrincipal,conversationId:string|null,db=createAdminClient()):Promise<unknown>{
 try{
  if(!SOCIAL_CONTENT_TOOL_NAMES.includes(name))throw new SocialContentError('INVALID_BODY')
  contentFields(input,name==='get_social_content'?['projectId']:
    name==='get_family_month_source_reviews'?['projectId','month']:
    name==='propose_family_month_source_review'?['projectId','proposal']:
    name==='get_family_month_source_status'?['projectId','month']:
    name==='get_family_weekly_content_plan'?['projectId','daysAhead']:
    name==='prepare_family_weekly_review_drafts'?['projectId']:
    ['projectId','postId','expectedRevisionId','planRevisionId','idempotencyKey','draft'])
  if(!conversationId)throw new SocialContentError('NOT_FOUND')
  if(name==='get_family_month_source_reviews'||name==='propose_family_month_source_review'){
   if(input.projectId!==FAMILY_WEEKLY_PROJECT_ID)throw new SocialContentError('NOT_FOUND')
   if(process.env.FAMILY_MONTH_SOURCE_REVIEW_ENABLED!=='true')
    throw new SocialContentError('UNAVAILABLE')
   // Existing conversation RPC is the first authorization boundary.
   const content=await readSocialContent(db,p,{projectId:FAMILY_WEEKLY_PROJECT_ID,conversationId})
   if(!content.planApproved)throw new SocialContentError('REVIEW_REQUIRED')
   if(name==='get_family_month_source_reviews'){
    if(typeof input.month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.month))
     throw new SocialContentError('INVALID_BODY')
    return await listFamilyMonthSourceReviews(db,p,{month:input.month})
   }
   if(!input.proposal||typeof input.proposal!=='object'||
      (input.proposal as Record<string,unknown>).projectId!==input.projectId)
    throw new SocialContentError('INVALID_BODY')
   return await proposeFamilyMonthSource(db,p,input.proposal as FamilyMonthSourceProposal)
  }
  if(name==='get_family_month_source_status'){
   if(input.projectId!==FAMILY_WEEKLY_PROJECT_ID)throw new SocialContentError('NOT_FOUND')
   if(typeof input.month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.month))throw new SocialContentError('INVALID_BODY')
   const content=await readSocialContent(db,p,{projectId:FAMILY_WEEKLY_PROJECT_ID,conversationId})
   if(!content.planApproved||!content.currentPlanRevisionId)
    throw new SocialContentError('REVIEW_REQUIRED')
   const catalog=familyMonthSourceStatus(input.month)
   if(process.env.FAMILY_MONTH_SOURCE_REVIEW_ENABLED!=='true')
    return {...catalog,ownerReviewStatus:'review_feature_disabled' as const}
   // A persisted owner decision is separate from public-media verification
   // and separate again from social post/release authority.
   const history=await listFamilyMonthSourceReviews(db,p,{month:input.month})
   if(history.kind!=='family-month-source-owner-review-list-v1'||
      history.month!==input.month||history.canActivate!==false||
      history.canPublish!==false||!Array.isArray(history.records))
    throw new SocialContentError('UNAVAILABLE')
   const latest=history.records[0]
   const ownerReviewStatus=latest?
    latest.decision?.kind==='approve'?'approved_pending_media_verification':
    latest.decision?.kind==='reject'?'rejected':'needs_owner_review'
    :'no_candidate'
   const sourceStatus=catalog.sourceStatus==='pinned_public_preview'?
    catalog.sourceStatus:ownerReviewStatus==='approved_pending_media_verification'?
    'owner_approved_pending_media_verification':ownerReviewStatus==='needs_owner_review'?
    'owner_review_pending':'owner_source_material_needed'
   return {...catalog,sourceStatus,ownerReviewStatus,
    canActivateNewSource:false as const,canPublish:false as const,
    mediaIntegrityVerified:false as const}
  }
  if(name==='prepare_family_weekly_review_drafts'){
   if(input.projectId!==FAMILY_WEEKLY_PROJECT_ID)throw new SocialContentError('NOT_FOUND')
   const content=await readSocialContent(db,p,{projectId:FAMILY_WEEKLY_PROJECT_ID,conversationId})
   const schedule=await readSchedules(db,p,{projectId:FAMILY_WEEKLY_PROJECT_ID})
   const now=new Date().toISOString()
   let ownerApprovedSource:OwnerApprovedPublicSource|undefined
   if(process.env.FAMILY_PUBLIC_SOURCE_ACTIVATION_ENABLED==='true'){
    // Only a persisted owner decision and independently hash-verified
    // project-owned media can supply new-month content, not chat text.
    const localParts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Stockholm',
     year:'numeric',month:'2-digit'}).formatToParts(new Date(now))
    const y=Number(localParts.find(x=>x.type==='year')?.value)
    const m=Number(localParts.find(x=>x.type==='month')?.value)
    if(!Number.isInteger(y)||!Number.isInteger(m)||m<1||m>12)
     throw new SocialContentError('UNAVAILABLE')
    const nextMonth=m===12?String(y+1)+'-01':String(y)+'-'+String(m+1).padStart(2,'0')
    try{
     ownerApprovedSource=await resolveFamilyOwnerApprovedPublicSource(db,p,nextMonth)
    }catch(error){
     if(!(error instanceof FamilySourceStoreError)||
        error.code!=='REVIEW_REQUIRED')throw error
     // Unapproved next month remains missing. Existing pinned previews may
     // still fill their exact original dates, without future-month guesses.
    }
   }
   const result=await stageFamilyReviewCandidates({
    principal:p,conversationId,content,schedule,now,
    ownerApprovedSource,
    validateOwnerSourceBeforeSave:async candidate=>{
     if(!ownerApprovedSource)throw new SocialContentError('REVIEW_REQUIRED')
     if(candidate.sourceSha256!==ownerApprovedSource.candidateSha256)
      throw new SocialContentError('REVISION_CONFLICT')
     await assertFamilyOwnerSourceCurrentBeforeDraft(db,p,{
      month:ownerApprovedSource.sourceMonth,
      candidateId:ownerApprovedSource.candidateId,
      candidateSha256:ownerApprovedSource.candidateSha256,
      decisionId:ownerApprovedSource.decisionId,
      verifiedImageAssetIds:ownerApprovedSource.verifiedImageAssetIds,
     })
    },
    save:proposal=>proposeSocialContent(db,p,proposal),
   })
   return {...result,workspaceUrl:'/projects/familje-stunden/social#content'}
  }
  if(name==='get_family_weekly_content_plan'){
   if(input.projectId!==FAMILY_WEEKLY_PROJECT_ID)throw new SocialContentError('NOT_FOUND')
   const daysAhead=input.daysAhead??14
   if(daysAhead!==7&&daysAhead!==14)throw new SocialContentError('INVALID_BODY')
   const content=await readSocialContent(db,p,{projectId:FAMILY_WEEKLY_PROJECT_ID,conversationId})
   const schedule=await readSchedules(db,p,{projectId:FAMILY_WEEKLY_PROJECT_ID})
   const coverage=buildFamilyWeekCoverage({content,schedule,now:new Date().toISOString(),daysAhead})
   return {...coverage,sourceReadiness:getFamilyEditorialReadiness({
    projectId:FAMILY_WEEKLY_PROJECT_ID,
    planRevisionId:coverage.planRevisionId,
    slots:coverage.slots,
   })}
  }
  return name==='get_social_content'?await readSocialContent(db,p,{projectId:input.projectId as string,conversationId}):await proposeSocialContent(db,p,{...input,conversationId} as SocialContentProposal)
 }catch(error){
  const code=error instanceof SocialContentError?error.code:
   error instanceof FamilySourceStoreError?(
    error.code==='INVALID_INPUT'?'INVALID_BODY':
    error.code==='CONFLICT'?'REVISION_CONFLICT':
    error.code==='REVIEW_REQUIRED'?'REVIEW_REQUIRED':error.code
   ):'UNAVAILABLE'
  return {code,error:'Inneh?llet kunde inte behandlas. L?s aktuell projektstatus och granska exakt version innan du forts?tter.'}
 }
}
