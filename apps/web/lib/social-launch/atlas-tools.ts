import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import {createAdminClient} from '@/lib/supabase/admin'
import type {SocialLaunchPrincipal} from './types'
import type {SocialLaunchProposal} from './store'
import {SocialLaunchError,socialLaunchFields,readSocialLaunchPlan,proposeSocialLaunchPlan} from './store'
import {loadSocialLaunchPage} from './loader'
const project={projectId:{type:'string' as const,description:'Existing project UUID in this owned conversation.'}}
export const SOCIAL_LAUNCH_TOOLS:Anthropic.Tool[]=[
 {name:'get_social_launch_plan',description:'Read the owned project channel plan and safe connection metadata. Never connects, approves or publishes.',input_schema:{type:'object',additionalProperties:false,properties:project,required:['projectId']}},
 {name:'propose_social_launch_plan',description:'Save a proposed channel plan after discussing purpose, format and cadence with the operator. The operator reviews and approves its exact revision at the returned URL. No account connection or publishing.',input_schema:{type:'object',additionalProperties:false,properties:{...project,expectedRevisionId:{type:['string','null']},idempotencyKey:{type:'string',maxLength:100},choices:{type:'array',maxItems:6,items:{type:'object',additionalProperties:false,properties:{channel:{type:'string',enum:['youtube','facebook','instagram','linkedin','x','pinterest']},purpose:{type:'string',minLength:1,maxLength:500},format:{type:'string',enum:['text','image','video','link']},cadence:{type:'string',enum:['manual','weekly','twice_weekly','daily']}},required:['channel','purpose','format','cadence']}}},required:['projectId','expectedRevisionId','idempotencyKey','choices']}},
]
export const SOCIAL_LAUNCH_TOOL_NAMES=SOCIAL_LAUNCH_TOOLS.map(t=>t.name)
export const SOCIAL_LAUNCH_GUIDE='\nSOCIAL CHANNEL PLANS: Discuss and agree the project, goals, destinations, formats and cadence with the operator first. Supported: YouTube, Facebook, Instagram, LinkedIn, X and Pinterest; no TikTok. Pinterest is intended first for Familje-Stunden, LinkedIn primarily for the Handlarbörsen company Page; do not select projects by name or autoassign channels. Use get_social_launch_plan in the current owned project conversation, then propose_social_launch_plan with its current revision ID. Reuse one idempotency key for retries of the same intent. A proposal is not approval. Only the operator can approve the exact saved revision in the returned workspaceUrl; always provide that Markdown review link. A changed revision needs a new decision. Plan choices, verified account connections and publishing authority are separate facts. LinkedIn company Page and Pinterest owned public board consent and explicit destination selection live at workspaceUrl after an approved channel plan. Use the returned safe setup metadata; missing app configuration is a real blocker. X runtime calls are blocked pending an approved enforced cost policy. Existing Instagram/Facebook/YouTube setup remains in project settings. Never request credentials in chat. Tools cannot connect accounts, create paid media, schedule or publish. Existing run_media_step remains limited to its current The Prompt pipeline and is not a general multi-project publisher. Read actual tool state before claiming completion.\n'
export async function handleSocialLaunchTool(name:string,input:Record<string,unknown>,principal:SocialLaunchPrincipal,conversationId:string|null,db=createAdminClient()):Promise<unknown>{
 try{
  if(!SOCIAL_LAUNCH_TOOL_NAMES.includes(name))throw new SocialLaunchError('INVALID_BODY')
  socialLaunchFields(input,name==='get_social_launch_plan'?['projectId']:['projectId','expectedRevisionId','idempotencyKey','choices'])
  if(!conversationId)throw new SocialLaunchError('NOT_FOUND')
  const plan=name==='get_social_launch_plan'?await readSocialLaunchPlan(db,principal,{projectId:input.projectId as string,conversationId}):await proposeSocialLaunchPlan(db,principal,{...input,conversationId} as SocialLaunchProposal)
  const model=await loadSocialLaunchPage(plan,{principal,db})
  return {...model,workspaceUrl:plan.workspaceUrl,publicationReady:false}
 }catch(error){const code=error instanceof SocialLaunchError?error.code:'PLAN_UNAVAILABLE';return {code,error:code==='NOT_FOUND'?'Projektet och konversationen kunde inte verifieras.':code==='REVISION_CONFLICT'?'Planen har ändrats. Läs aktuell version och granska igen.':'Kanalplanen kunde inte behandlas. Läs aktuell status innan du försöker igen.'}}
}
