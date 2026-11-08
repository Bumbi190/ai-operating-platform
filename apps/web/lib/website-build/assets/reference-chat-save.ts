import 'server-only'
import type {ProjectAccessOk} from '@/lib/auth/project-access'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {StudioTurnContext} from '../studio/turn-context'
import {WebsiteBuildError} from '../store'
import {referenceUploadEnabled} from './availability'
import {persistReferenceUserTurn} from './persist-reference-turn'
import {parseReferenceSaveSelection} from './reference-save-contract'
/** Save-only chat branch: returns before models, tools and the legacy writer. */
export async function saveStudioReferenceMessage(input:{
 db:ReturnType<typeof createAdminClient>;principal:ProjectAccessOk;studioContext:StudioTurnContext|null;
 conversationId:string|null;messages:unknown;selection:unknown;conflictingIntent:boolean;
}):Promise<Response>{
 if(process.env.ATLAS_REFERENCE_CHAT_SAVE_ENABLED!=='true'||!referenceUploadEnabled())
  throw new WebsiteBuildError('REFERENCE_UNAVAILABLE',503)
 const context=input.studioContext
 if(!context)throw new WebsiteBuildError('REFERENCE_STUDIO_REQUIRED',409)
 if(context.conversationId!==input.conversationId||!input.principal.allowedProjectIds.includes(context.projectId))
  throw new WebsiteBuildError('NOT_FOUND',404)
 if(input.conflictingIntent)throw new WebsiteBuildError('REFERENCE_SAVE_ONLY',409)
 const selection=parseReferenceSaveSelection(input.selection)
 const last=Array.isArray(input.messages)?input.messages.at(-1):null
 if(!selection||!last||last.role!=='user'||typeof last.content!=='string'||!last.content.trim())
  throw new WebsiteBuildError('INVALID_BODY',400)
 const receipt=await persistReferenceUserTurn(input.db,input.principal,{
  projectId:context.projectId,conversationId:context.conversationId,messageText:last.content,...selection,
 })
 return Response.json({status:'reference_saved',analysis:'not_started',receipt},
  {status:202,headers:{'cache-control':'private, no-store'}})
}
