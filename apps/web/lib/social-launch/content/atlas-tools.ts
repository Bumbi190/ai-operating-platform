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
const project={projectId:{type:'string' as const,description:'Existing project UUID belonging to this conversation.'}}
export const SOCIAL_CONTENT_TOOLS:Anthropic.Tool[]=[
 {name:'prepare_family_weekly_review_drafts',description:'Prepare at most 4 deterministic, grounded October 2026 Familje-Stunden preview review proposals in the existing owner conversation for missing calendar slots only. Use ONLY when the operator explicitly asks Atlas to prepare weekly content. Saves unapproved drafts for owner review, never uploads files, runs TTS, schedules executable jobs, approves or publishes.',input_schema:{type:'object',additionalProperties:false,properties:{...project},required:['projectId']}},
 {name:'get_family_weekly_content_plan',description:'Read-only deterministic 7- or 14-day Familje-Stunden content gap audit in Europe/Stockholm, comparing existing posts and approved scheduling jobs. No generating, scheduling, spending, approving or publishing.',input_schema:{type:'object',additionalProperties:false,properties:{...project,daysAhead:{type:'integer',enum:[7,14],description:'Upcoming days, default 14.'}},required:['projectId']}},
 {name:'get_social_content',description:'Read project content drafts, exact editorial decisions, owned media metadata and intended calendar. Does not publish.',input_schema:{type:'object',additionalProperties:false,properties:project,required:['projectId']}},
 {name:'propose_social_content',description:'Save one content proposal discussed with the operator. Reuse owned canonical assets; the operator reviews at workspaceUrl. Cannot approve, connect, generate paid media, dispatch or publish.',input_schema:{type:'object',additionalProperties:false,properties:{...project,postId:{type:'string'},planRevisionId:{type:'string'},expectedRevisionId:{type:['string','null']},idempotencyKey:{type:'string',maxLength:100},draft:{type:'object',additionalProperties:false,properties:{channel:{type:'string',enum:['youtube','facebook','instagram','linkedin','x','pinterest']},format:{type:'string',enum:['text','image','video','link']},title:{type:'string',minLength:1,maxLength:150},text:{type:'string',minLength:1,maxLength:5000},linkUrl:{type:['string','null'],maxLength:2048},mediaIds:{type:'array',maxItems:10,items:{type:'string'}},mediaBrief:{type:'string',maxLength:1000},scheduledAt:{type:['string','null'],description:'Intended UTC instant as YYYY-MM-DDTHH:mm:ss.sssZ, future and within 366 days. Preparation only, not an executable schedule.'}},required:['channel','format','title','text','linkUrl','mediaIds','mediaBrief','scheduledAt']}},required:['projectId','postId','planRevisionId','expectedRevisionId','idempotencyKey','draft']}}
]
export const SOCIAL_CONTENT_TOOL_NAMES=SOCIAL_CONTENT_TOOLS.map(t=>t.name)
export const SOCIAL_CONTENT_GUIDE='\nSOCIAL CONTENT PREPARATION: First discuss project facts, audience, tone and the exact content with the operator. Read get_social_profile, get_social_launch_plan and get_social_content; for Familje-Stunden weekly planning use get_family_weekly_content_plan to detect gaps from actual content and schedules without paid generation. When and only when the operator requests actual October-to-November content preparation, prepare_family_weekly_review_drafts can save up to four source-pinned draft proposals for manual review; never treat this as authority to publish or unlock November. Reuse the saved company facts, audience, tone and available preferred assets; do not invent missing claims. Use only channels in the current approved project plan. Reuse owned assets from the returned metadata; mediaBrief is an idea, never a generated image. For a new proposal create one UUID postId and reuse it and the idempotency key on retries; for editing use the existing postId/current revision ID. Save only the requested post with propose_social_content. Give the returned Markdown workspaceUrl for exact human editorial review. Any text, media, plan, account or intended time change requires a new revision and review. Calendar is Europe/Stockholm; persist an explicit UTC instant, ask about ambiguous local times. Editorial approval is not publication permission. Calendar alone is preparation. get_social_schedule reads batches; propose_social_schedule pins approved revisions, image hashes, bindings and times for native review. Only native Godkänn och schemalägg veckans inlägg grants batch authority. Atlas cannot approve, activate, confirm release access or dispatch. Family: alternate Tuesday/Friday 17:00/20:30; monthly sneak peek on both channels, day 1 at 20:30. Pin year/month/catalog and use actual activities with owned Nova/Pling imagery. Code/date/deployment never proves customer access. Require fresh owner_verified_access at dispatch; never recycle last month, replace or backfill. Monthly rules are planning only; automatic weekly drafts and engagement collection remain unimplemented. Read get_social_publication for saved receipts; manual Facebook/Instagram sends require separate operator confirmation in the UI. No content tool can connect accounts, spend, execute a schedule or publish. Actual account connections wait until Andre requests them. Never infer a send from an approval, elapsed calendar time or healthy credential; no new project may use The Prompt run_media_step as a shortcut.\n'
export async function handleSocialContentTool(name:string,input:Record<string,unknown>,p:SocialContentPrincipal,conversationId:string|null,db=createAdminClient()):Promise<unknown>{
 try{
  if(!SOCIAL_CONTENT_TOOL_NAMES.includes(name))throw new SocialContentError('INVALID_BODY')
  contentFields(input,name==='get_social_content'?['projectId']:
    name==='get_family_weekly_content_plan'?['projectId','daysAhead']:
    name==='prepare_family_weekly_review_drafts'?['projectId']:
    ['projectId','postId','expectedRevisionId','planRevisionId','idempotencyKey','draft'])
  if(!conversationId)throw new SocialContentError('NOT_FOUND')
  if(name==='prepare_family_weekly_review_drafts'){
   if(input.projectId!==FAMILY_WEEKLY_PROJECT_ID)throw new SocialContentError('NOT_FOUND')
   const content=await readSocialContent(db,p,{projectId:FAMILY_WEEKLY_PROJECT_ID,conversationId})
   const schedule=await readSchedules(db,p,{projectId:FAMILY_WEEKLY_PROJECT_ID})
   const result=await stageFamilyReviewCandidates({
    principal:p,conversationId,content,schedule,now:new Date().toISOString(),
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
   return buildFamilyWeekCoverage({content,schedule,now:new Date().toISOString(),daysAhead})
  }
  return name==='get_social_content'?await readSocialContent(db,p,{projectId:input.projectId as string,conversationId}):await proposeSocialContent(db,p,{...input,conversationId} as SocialContentProposal)
 }catch(error){const code=error instanceof SocialContentError?error.code:'UNAVAILABLE';return {code,error:'Innehållet kunde inte behandlas. Läs aktuell projektstatus och granska exakt version innan du fortsätter.'}}
}
