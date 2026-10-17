import 'server-only'
import {createHash} from 'node:crypto'
import type {ProjectAccessOk} from '@/lib/auth/project-access'
import type {createAdminClient} from '@/lib/supabase/admin'
import {WebsiteBuildError} from '../store'
import {referenceUploadEnabled} from './availability'
import {readVerifiedReference} from './read'

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const MAX_REFERENCES=4
const MAX_MESSAGE_LENGTH=10_000
const SHA=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex')

export type TurnReferenceSelection={
  projectId:string
  conversationId:string
  turnId:string
  messageText:string
  ticketIds:string[]
}
export type VerifiedTurnReference={
  ticketId:string
  assetId:string
  mimeType:'image/webp'
  sha256:string
  bytes:Uint8Array
}
export type PreparedReferenceTurn={
  projectId:string
  conversationId:string
  turnId:string
  messageSha256:string
  referenceSha256:string
  images:VerifiedTurnReference[]
}

/**
 * This is PRE-DISPATCH ONLY, NOT a chat model call, persistence boundary or
 * authority to attach a past image automatically to a future message.
 * turnId is client-supplied and MUST later be bound to a server-persisted
 * conversation_messages.id before this can enter the chat transport.
 */
export function parseTurnReferenceSelection(value:unknown):TurnReferenceSelection {
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw new WebsiteBuildError('INVALID_BODY',400)
  const raw=value as Record<string,unknown>
  const keys=Object.keys(raw).sort().join(',')
  if(keys!=='conversationId,messageText,projectId,ticketIds,turnId')
    throw new WebsiteBuildError('INVALID_BODY',400)
  if(![raw.projectId,raw.conversationId,raw.turnId].every(x=>typeof x==='string'&&UUID.test(x)) ||
     typeof raw.messageText!=='string'||!raw.messageText.trim()||raw.messageText.length>MAX_MESSAGE_LENGTH)
    throw new WebsiteBuildError('INVALID_BODY',400)
  if(!Array.isArray(raw.ticketIds)||raw.ticketIds.length===0||raw.ticketIds.length>MAX_REFERENCES||
     !raw.ticketIds.every(x=>typeof x==='string'&&UUID.test(x))||
     new Set(raw.ticketIds).size!==raw.ticketIds.length)
    throw new WebsiteBuildError('INVALID_BODY',400)
  return raw as TurnReferenceSelection
}

/**
 * Proves that each exact attached image belongs to the current active owner,
 * selected project and selected conversation, and is byte-integrity verified.
 *
 * No hidden image fallback and no calls to providers: caller must explicitly
 * compare this entire selection with the current in-flight user turn.
 */
export async function prepareReferenceTurn(
  db:ReturnType<typeof createAdminClient>,
  owner:ProjectAccessOk,
  raw:unknown,
  active:{projectId:string;conversationId:string;turnId:string;messageText:string},
):Promise<PreparedReferenceTurn>{
  if(!referenceUploadEnabled())throw new WebsiteBuildError('REFERENCE_UNAVAILABLE',503)
  const selection=parseTurnReferenceSelection(raw)
  if(selection.projectId!==active.projectId||
     selection.conversationId!==active.conversationId||
     selection.turnId!==active.turnId||
     selection.messageText!==active.messageText||
     !owner.allowedProjectIds.includes(selection.projectId))
    throw new WebsiteBuildError('NOT_FOUND',404)
  // Deliberately sequential and capped at four to bound storage reads.
  const images:VerifiedTurnReference[]=[]
  for(const ticketId of selection.ticketIds){
    const {assetId,bytes,mimeType}=await readVerifiedReference(db,owner,{
      projectId:selection.projectId,conversationId:selection.conversationId,ticketId,
    })
    images.push({ticketId,assetId,mimeType,bytes,sha256:SHA(bytes)})
  }
  return {
    projectId:selection.projectId,conversationId:selection.conversationId,
    turnId:selection.turnId,messageSha256:SHA(selection.messageText),
    referenceSha256:SHA(JSON.stringify(images.map(x=>[x.ticketId,x.assetId,x.sha256]))),
    images,
  }
}
