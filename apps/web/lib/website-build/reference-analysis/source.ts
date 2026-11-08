import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {ProjectAccessOk} from '@/lib/auth/project-access'
import {WebsiteBuildError} from '../store'
import {assertReferenceWorkspace} from '../assets/tickets'
import {preparePersistedReferenceTurn} from '../assets/turn-references'
import type {AnalysisSource} from './contract'
export type AnalysisDb=ReturnType<typeof createAdminClient>
// Proposal tables are deliberately absent from generated hosted database types.
export const analysisTable=(db:AnalysisDb,name:string)=>(db as unknown as {from:(name:string)=>any}).from(name)
export async function readAnalysisSource(db:AnalysisDb,owner:ProjectAccessOk,source:AnalysisSource){
 await assertReferenceWorkspace(db,owner,source.projectId,source.conversationId)
 const {data:manifest,error}=await analysisTable(db,'website_build_reference_messages').select('*')
  .eq('owner_id',owner.userId).eq('project_id',source.projectId).eq('conversation_id',source.conversationId).eq('message_id',source.messageId).maybeSingle()
 if(error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 if(!manifest||manifest.message_id!==source.messageId||manifest.owner_id!==owner.userId||
  manifest.project_id!==source.projectId||manifest.conversation_id!==source.conversationId||!Array.isArray(manifest.images)||
  manifest.images.length<1||manifest.images.length>4)throw new WebsiteBuildError('NOT_FOUND',404)
 const {data:message,error:messageError}=await db.from('conversation_messages').select('content').eq('id',source.messageId).eq('conversation_id',source.conversationId).eq('role','user').maybeSingle()
 if(messageError)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 if(!message||typeof message.content!=='string')throw new WebsiteBuildError('NOT_FOUND',404)
 const active={projectId:source.projectId,conversationId:source.conversationId,turnId:source.messageId,messageText:message.content}
 const prepared=await preparePersistedReferenceTurn(db,owner,{...active,ticketIds:manifest.images.map((i:Record<string,unknown>)=>i?.ticketId)},active)
 if(prepared.bindingSha256!==manifest.binding_sha256||prepared.messageSha256!==manifest.message_sha256||prepared.referenceSha256!==manifest.reference_sha256||
  JSON.stringify(prepared.images.map(({ticketId,assetId,mimeType,sha256})=>({ticketId,assetId,mimeType,sha256})))!==
  JSON.stringify(manifest.images.map((i:Record<string,unknown>)=>({ticketId:i.ticketId,assetId:i.assetId,mimeType:i.mimeType,sha256:i.sha256}))))
  throw new WebsiteBuildError('CONFLICT',409)
 return {...prepared,messageText:message.content}
}
