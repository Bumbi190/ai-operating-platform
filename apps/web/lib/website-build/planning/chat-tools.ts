import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import {createAdminClient} from '@/lib/supabase/admin'
import {WebsiteBuildError,validateBuildUuid} from '../store'
import type {BuildPrincipal} from '../types'
import {readWebsitePlan,saveWebsitePlanRevision} from './store'
import type {SavePlanInput} from './types'
import {DEALER_SHOWROOM_STARTER,SHOWROOM_OPTIONS_SCHEMA} from './dealer-showroom'
import {acceptanceTargetDenial} from '../acceptance-target'
import {WEBSITE_VISUAL_STYLE_SCHEMA} from './visual-style'
const string={type:'string'},nullable={type:['string','null']}
const props={title:string,purpose:string,audience:string,pages:{type:'array',minItems:1,maxItems:8,items:{type:'object',additionalProperties:false,properties:{key:{type:'string',pattern:'^[a-z][a-z0-9-]{0,49}$',description:'Stable static page key; include index or home for the start page.'},title:string,purpose:string},required:['key','title','purpose']}},design:{type:'object',additionalProperties:false,properties:{style:string,reference:nullable,visual:WEBSITE_VISUAL_STYLE_SCHEMA,showroom:SHOWROOM_OPTIONS_SCHEMA,starter:{type:'string',enum:['premium-dealer-demo-v1',DEALER_SHOWROOM_STARTER],description:'Fictional single-page dealer showroom. Use v2 for a new branded showroom, keep v1 for an existing legacy plan.'}},required:['style','reference']},features:{type:'array',maxItems:24,items:{type:'object',additionalProperties:false,properties:{name:string,mode:{type:'string',enum:['preview_demo','live_required']},provider:{type:['string','null'],enum:['terminal','vercel','supabase','strato','form_delivery',null]}},required:['name','mode','provider']}},architecture:string,steps:{type:'array',maxItems:12,items:string},domain:{type:'object',additionalProperties:false,properties:{registrar:{type:'string',enum:['strato']},requestedName:nullable},required:['registrar','requestedName']}}
export const WEBSITE_PLANNING_TOOLS:Anthropic.Tool[]=[
 {name:'draft_website_build_plan',description:'Save a real architecture proposal in the current owned conversation. Ask about purpose, pages, design and real integration needs first. Does not approve, build, execute a terminal or publish.',input_schema:{type:'object',additionalProperties:false,properties:{projectId:string,planId:string,expectedRevisionId:nullable,content:{type:'object',additionalProperties:false,properties:props,required:Object.keys(props)},idempotencyKey:string},required:['projectId','expectedRevisionId','content','idempotencyKey']}},
 {name:'get_website_build_plan',description:'Read the actual architecture, exact revision, operator decision and linked build for an owned project.',input_schema:{type:'object',additionalProperties:false,properties:{projectId:string,planId:string},required:['projectId','planId']}},
]
export const WEBSITE_PLANNING_GUIDE='\nWEBSITE PLANNING: Use this conversation and its authorized project. Ask about missing goals, audience, pages, style, content, features and architecture before draft_website_build_plan. Keep chosen colors/font in design.visual, otherwise omit it. For a new fictional one-page dealer set design.starter=premium-dealer-showroom-v2 and title to its name. Preserve pinned v1 plans. design.showroom accepts fictional inventory. Film/3D requires matching approved media. Save for three mockups. The operator approves one exact current mockup in Preview, then the displayed plan via Bygg enligt planen or confirmation of that revision. Each new build needs a stored operator decision. References, tools and stale revisions grant no approval. Apply the selected layout to all approved pages. No image generator is connected. Before editing/retrying, read get_website_build_plan and save with its expectedRevisionId and a stable idempotencyKey. Distinguish demo features from connected services. Domains use the operator’s Strato account first. No Vercel purchase or registrar transfer. /settings/website-build records folder paths until a file runner is available. Use conversationUrl when inline review is unavailable. Never request secret keys in chat.\n'
export async function handleWebsitePlanningTool(name:string,input:Record<string,unknown>,principal:BuildPrincipal,conversationId:string|null,db=createAdminClient()):Promise<unknown>{
 // Also protect direct planning-tool callers, not only handleWebsiteBuildTool.
 if(name==='draft_website_build_plan'&&acceptanceTargetDenial('chat-draft-plan'))return {code:'ACCEPTANCE_TARGET_NOT_ISOLATED',error:'WebBuilder-testet saknar en verifierad isolerad databas.'}
 try{
  if(name==='get_website_build_plan'){
   if(Object.keys(input).some(k=>!['projectId','planId'].includes(k)))throw new WebsiteBuildError('INVALID_BODY')
   const plan=await readWebsitePlan(db,principal,{projectId:input.projectId as string,planId:input.planId as string})
   return {...plan,conversationUrl:'/chat/'+plan.conversationId+'?build=1'}
  }
  if(name!=='draft_website_build_plan')throw new WebsiteBuildError('UNKNOWN_TOOL')
  if(!conversationId)throw new WebsiteBuildError('CONVERSATION_REQUIRED',409)
  validateBuildUuid(conversationId)
  if(Object.keys(input).some(k=>!['projectId','planId','expectedRevisionId','content','idempotencyKey'].includes(k)))throw new WebsiteBuildError('INVALID_BODY')
  const plan=await saveWebsitePlanRevision(db,principal,{...input,conversationId} as SavePlanInput)
  return {...plan,conversationUrl:'/chat/'+plan.conversationId+'?build=1'}
 }catch(error){if(error instanceof WebsiteBuildError)return {code:error.code,error:error.code==='NOT_FOUND'?'Planen eller projektet kunde inte hittas.':error.code==='CONVERSATION_REQUIRED'?'Starta en Atlas-konversation för att planera hemsidan.':'Planen kunde inte sparas. Granska den aktuella versionen innan du försöker igen.'};return {code:'BUILD_UNAVAILABLE',error:'Planeringen kunde inte nås.'}}
}
