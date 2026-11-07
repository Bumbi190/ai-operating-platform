import 'server-only'
import {createHash} from 'node:crypto'
import type {ProjectAccessOk} from '@/lib/auth/project-access'
import type {createAdminClient} from '@/lib/supabase/admin'
import {WebsiteBuildError} from '../store'
import {referenceUploadEnabled} from './availability'
import {parseTurnReferenceSelection,prepareReferenceTurn} from './turn-references'
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/
const hash=(text:string)=>createHash('sha256').update(text).digest('hex')
export type ReferenceUserTurn={projectId:string;conversationId:string;messageText:string;ticketIds:string[];idempotencyKey:string}
export type ReferenceMessageReceipt={
 messageId:string;projectId:string;conversationId:string;messageSha256:string;
 referenceSha256:string;bindingSha256:string;imageCount:number
}
export function parseReferenceUserTurn(value:unknown):ReferenceUserTurn{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new WebsiteBuildError('INVALID_BODY',400)
 const v=value as Record<string,unknown>
 if(Object.keys(v).sort().join(',')!=='conversationId,idempotencyKey,messageText,projectId,ticketIds'||
    typeof v.idempotencyKey!=='string'||!UUID.test(v.idempotencyKey.toLowerCase()))
   throw new WebsiteBuildError('INVALID_BODY',400)
 const normalize=(id:unknown)=>typeof id==='string'?id.toLowerCase():id
 const key=v.idempotencyKey.toLowerCase()
 const selected=parseTurnReferenceSelection({projectId:normalize(v.projectId),conversationId:normalize(v.conversationId),
  messageText:v.messageText,ticketIds:Array.isArray(v.ticketIds)?v.ticketIds.map(normalize):v.ticketIds,turnId:key})
 return {projectId:selected.projectId,conversationId:selected.conversationId,messageText:selected.messageText,
  ticketIds:selected.ticketIds,idempotencyKey:key}
}
/**
 * Atomic persistence only. The RPC assigns the actual message ID; the browser
 * cannot select one. No model, public route or execution authority is added.
 * Retrying an ambiguous failure MUST use the same original intent key.
 */
export async function persistReferenceUserTurn(
 db:ReturnType<typeof createAdminClient>,owner:ProjectAccessOk,raw:unknown,
):Promise<ReferenceMessageReceipt>{
 if(!referenceUploadEnabled())throw new WebsiteBuildError('REFERENCE_UNAVAILABLE',503)
 const input=parseReferenceUserTurn(raw)
 if(!owner.allowedProjectIds.includes(input.projectId))throw new WebsiteBuildError('NOT_FOUND',404)
 // Here turnId is a draft correlation only. It is never persisted as message ID.
 const draft={projectId:input.projectId,conversationId:input.conversationId,turnId:input.idempotencyKey,messageText:input.messageText,ticketIds:input.ticketIds}
 const prepared=await prepareReferenceTurn(db,owner,draft,draft)
 if(!referenceUploadEnabled())throw new WebsiteBuildError('REFERENCE_UNAVAILABLE',503)
 const rpc=db as unknown as {rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{message?:string}|null}>}
 let response
 try{response=await rpc.rpc('website_build_persist_reference_turn',{
  p_owner_id:owner.userId,p_project_id:input.projectId,p_conversation_id:input.conversationId,
  p_idempotency_key:input.idempotencyKey,p_message_text:input.messageText,
  p_images:prepared.images.map(i=>({ticketId:i.ticketId,assetId:i.assetId,mimeType:i.mimeType,sha256:i.sha256})),
 })}catch{throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)}
 if(response.error){
  const known:Record<string,[string,number]>={ATLAS_REFERENCE_CONFLICT:['CONFLICT',409],
   ATLAS_REFERENCE_NOT_FOUND:['NOT_FOUND',404],ATLAS_REFERENCE_INVALID:['INVALID_BODY',400]}
  const [code,status]=known[response.error.message??'']??['BUILD_UNAVAILABLE',503]
  throw new WebsiteBuildError(code,status)
 }
 const r=response.data as ReferenceMessageReceipt|null
 if(!r||typeof r!=='object'||Array.isArray(r)||
    Object.keys(r).sort().join(',')!=='bindingSha256,conversationId,imageCount,messageId,messageSha256,projectId,referenceSha256'||
    typeof r.messageId!=='string'||!UUID.test(r.messageId)||r.projectId!==input.projectId||
    r.conversationId!==input.conversationId||r.messageSha256!==prepared.messageSha256||
    r.referenceSha256!==prepared.referenceSha256||r.imageCount!==prepared.images.length||
    r.bindingSha256!==hash(JSON.stringify(['omnira.website-reference-turn.v1',owner.userId,
      input.projectId,input.conversationId,r.messageId,prepared.messageSha256,prepared.referenceSha256])))
   throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 return r
}
