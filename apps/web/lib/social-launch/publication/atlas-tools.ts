import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import {createAdminClient} from '@/lib/supabase/admin'
import {contentFields} from '../content/validate'
import {publicationPreview} from './dispatch'
import {PublicationError,type PublicationPrincipal} from './types'
export const SOCIAL_PUBLICATION_TOOLS:Anthropic.Tool[]=[{name:'get_social_publication',description:'Read the saved manual Facebook/Instagram publication attempt and receipt for this project’s exact post. Does not send, retry, continue, approve or connect. Never claim publication without the recorded provider confirmation.',input_schema:{type:'object',additionalProperties:false,properties:{projectId:{type:'string'},postId:{type:'string'}},required:['projectId','postId']}}]
export const SOCIAL_PUBLICATION_TOOL_NAMES=SOCIAL_PUBLICATION_TOOLS.map(t=>t.name)
export async function handleSocialPublicationTool(name:string,input:Record<string,unknown>,p:PublicationPrincipal,conversationId:string|null,db=createAdminClient()):Promise<unknown>{
 try{
  if(name!=='get_social_publication')throw new PublicationError('INVALID_BODY')
  try{contentFields(input,['projectId','postId'])}catch{throw new PublicationError('INVALID_BODY')}
  if(!conversationId)throw new PublicationError('NOT_FOUND')
  return await publicationPreview(db,p,{projectId:input.projectId as string,postId:input.postId as string,conversationId})
 }catch(e){return {code:e instanceof PublicationError?e.code:'UNAVAILABLE',error:'Publiceringskvittot kunde inte läsas. Kontrollera sparad status i projektets innehållsvy.'}}
}
