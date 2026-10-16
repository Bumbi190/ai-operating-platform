import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import {createAdminClient} from '@/lib/supabase/admin'
import {WebsiteBuildError,validateBuildUuid} from '../store'
import type {BuildPrincipal} from '../types'
import {readWebsitePlan,saveWebsitePlanRevision} from './store'
import type {SavePlanInput} from './types'
const string={type:'string'},nullable={type:['string','null']}
const props={title:string,purpose:string,audience:string,pages:{type:'array',minItems:1,maxItems:8,items:{type:'object',additionalProperties:false,properties:{key:{type:'string',pattern:'^[a-z][a-z0-9-]{0,49}$',description:'Stable static page key; include index or home for the start page.'},title:string,purpose:string},required:['key','title','purpose']}},design:{type:'object',additionalProperties:false,properties:{style:string,reference:nullable},required:['style','reference']},features:{type:'array',maxItems:24,items:{type:'object',additionalProperties:false,properties:{name:string,mode:{type:'string',enum:['preview_demo','live_required']},provider:{type:['string','null'],enum:['terminal','vercel','supabase','strato','form_delivery',null]}},required:['name','mode','provider']}},architecture:string,steps:{type:'array',maxItems:12,items:string},domain:{type:'object',additionalProperties:false,properties:{registrar:{type:'string',enum:['strato']},requestedName:nullable},required:['registrar','requestedName']}}
export const WEBSITE_PLANNING_TOOLS:Anthropic.Tool[]=[
 {name:'draft_website_build_plan',description:'Save a real architecture proposal in the current owned conversation. Ask about purpose, pages, design and real integration needs first. Does not approve, build, execute a terminal or publish.',input_schema:{type:'object',additionalProperties:false,properties:{projectId:string,planId:string,expectedRevisionId:nullable,content:{type:'object',additionalProperties:false,properties:props,required:Object.keys(props)},idempotencyKey:string},required:['projectId','expectedRevisionId','content','idempotencyKey']}},
 {name:'get_website_build_plan',description:'Read the actual architecture, exact revision, operator decision and linked build for an owned project.',input_schema:{type:'object',additionalProperties:false,properties:{projectId:string,planId:string},required:['projectId','planId']}},
]
export const WEBSITE_PLANNING_GUIDE='\nWEBSITE PLANNING: Start in this conversation. Resolve an existing authorized project; ask about project choice when ambiguous. Clarify and agree goals, audience, all pages, visual direction, real content, features and architecture before calling draft_website_build_plan. Ask about missing facts instead of inventing them. Saving the agreed brief prepares three rendered layout proposals with no extra model call. The operator compares them in Preview and approves one exact mockup before approving the build. Mockup approval is an operator UI action, never your tool permission. An unapproved or stale design cannot start construction. Keep the original approved page count. Reference the approved layout across all pages; a homepage mockup never reduces the website to one page. Image placeholders are not generated assets; this adapter has no image-generation tool. The operator reviews the displayed plan card and chooses Bygg enligt planen, or confirms that exact visible revision. You cannot approve plans with a tool. All new builds require a stored operator decision. Use get_website_build_plan before a retry/edit; include its expectedRevisionId and a stable idempotencyKey for that edit. A static preview can demonstrate a backend feature but cannot claim it is connected. Domain search and purchase go through the operator’s Strato account first; no Vercel purchase or registrar transfer. Project directory preferences are at /settings/website-build; stored paths are pending a real file runner, not created folders. Use the returned conversationUrl to open the plan when a client cannot display it inline. Never request secret key values in chat.\n'
export async function handleWebsitePlanningTool(name:string,input:Record<string,unknown>,principal:BuildPrincipal,conversationId:string|null,db=createAdminClient()):Promise<unknown>{
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
