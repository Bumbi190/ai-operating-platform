import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import {createAdminClient} from '@/lib/supabase/admin'
import type {SocialLaunchPrincipal} from '../types'
import {contentFields} from '../content/validate'
import {SocialContentError} from '../content/types'
import {readSocialContent} from '../content/store'
import {ScheduleError} from './types'
import {readSchedules,proposeSchedule} from './store'
const string={type:'string' as const},hash={...string,pattern:'^[a-f0-9]{64}$'}
const condition={type:['object','null'],additionalProperties:false,properties:{releaseMonth:{...string,pattern:'^20[0-9]{2}-(0[1-9]|1[0-2])$'},catalogSha256:hash},required:['releaseMonth','catalogSha256']}
const itemProperties={postId:string,revisionId:string,sha256:hash,decisionId:string,planRevisionId:string,bindingId:string,accountId:string,channel:{...string,enum:['facebook','instagram']},asset:{type:'object',additionalProperties:false,properties:{id:string,sha256:hash},required:['id','sha256']},localMinute:{...string,description:'Exact Europe/Stockholm minute YYYY-MM-DDTHH:mm.'},scheduledAt:{...string,description:'Matching UTC instant with milliseconds.'},expiresAt:{...string,description:'Exactly ten minutes after scheduledAt.'},occasionId:{...string,description:'One UUID per content occasion; Facebook and Instagram may share it.'},kind:{...string,enum:['ordinary','month_release']},releaseCondition:condition}
const manifest={type:'object',additionalProperties:false,properties:{projectId:string,items:{type:'array',minItems:1,maxItems:6,items:{type:'object',additionalProperties:false,properties:itemProperties,required:Object.keys(itemProperties)}}},required:['projectId','items']}
export const SOCIAL_SCHEDULE_TOOLS:Anthropic.Tool[]=[
 {name:'get_social_schedule',description:'Read the latest owned weekly social batch and its saved queue status. Does not grant authority or dispatch.',input_schema:{type:'object',additionalProperties:false,properties:{projectId:string},required:['projectId']}},
 {name:'propose_social_schedule',description:'Save an exact proposal from already editorially approved revisions, owned JPEG assets, accounts and Stockholm times. Cannot approve, activate, confirm release access or dispatch. Return workspaceUrl for native owner review.',input_schema:{type:'object',additionalProperties:false,properties:{projectId:string,manifest,expectedRevisionId:{type:['string','null']},idempotencyKey:{...string,maxLength:100}},required:['projectId','manifest','expectedRevisionId','idempotencyKey']}}
]
export const SOCIAL_SCHEDULE_TOOL_NAMES=SOCIAL_SCHEDULE_TOOLS.map(t=>t.name)
export async function handleSocialScheduleTool(name:string,input:Record<string,unknown>,p:SocialLaunchPrincipal,conversationId:string|null,db=createAdminClient()):Promise<unknown>{
 try{
  if(!SOCIAL_SCHEDULE_TOOL_NAMES.includes(name))throw new ScheduleError('INVALID_BODY')
  contentFields(input,name==='get_social_schedule'?['projectId']:['projectId','manifest','expectedRevisionId','idempotencyKey'])
  if(!conversationId)throw new ScheduleError('NOT_FOUND')
  const content=await readSocialContent(db,p,{projectId:input.projectId as string,conversationId})
  const workspaceUrl='/projects/'+content.project.slug+'/social#schedule'
  if(name==='propose_social_schedule')return {...await proposeSchedule(db,p,input as Parameters<typeof proposeSchedule>[2]),workspaceUrl}
  const view=await readSchedules(db,p,{projectId:input.projectId as string})
  return view.batches[0]?{...view.batches[0],workspaceUrl}:{projectId:input.projectId,batch:null,workspaceUrl}
 }catch(error){const code=error instanceof ScheduleError||error instanceof SocialContentError?error.code:'UNAVAILABLE';return {code,error:'Schemat kunde inte behandlas. Läs projektets aktuella utkast och granska exakt version i arbetsytan.'}}
}
