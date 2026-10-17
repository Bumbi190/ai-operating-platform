import 'server-only'
import type { ProjectAccessOk } from '@/lib/auth/project-access'
import type { createAdminClient } from '@/lib/supabase/admin'
import { admitAssetBytes } from '@/lib/media/asset/admission'
import { WebsiteBuildError } from '../store'
import { MAX_REFERENCE_INPUT_BYTES, normalizeReferenceImage, ReferenceImageError } from './normalize-reference'
import { assertReferenceWorkspace, stagingPath, STAGING_BUCKET } from './tickets'

type Db=ReturnType<typeof createAdminClient>
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
type Ref={projectId:string;conversationId:string;ticketId:string}
type Ticket={
  id:string;owner_id:string;project_id:string;conversation_id:string
  mime_type:'image/png'|'image/jpeg'|'image/webp'
  object_path:string;state:'issued'|'processing'|'ready'|'rejected'
  expires_at:string;asset_id:string|null
}
export function parseFinalizeInput(raw:Record<string,unknown>):Ref {
  if(Object.keys(raw).sort().join(',')!=='conversationId,projectId,ticketId'
      || ![raw.projectId,raw.conversationId,raw.ticketId].every(v=>typeof v==='string'&&UUID.test(v)))
    throw new WebsiteBuildError('INVALID_BODY',400)
  return raw as Ref
}

/**
 * Redeem one uploaded private staging object once. The ticket itself never
 * grants read authority; current owner, lifecycle and conversation are checked.
 * All persistence goes through the canonical private Asset admission boundary.
 */
export async function finalizeReferenceTicket(db:Db,p:ProjectAccessOk,ref:Ref):
  Promise<{status:'ready';ticketId:string;assetId:string}> {
  await assertReferenceWorkspace(db,p,ref.projectId,ref.conversationId)
  const tickets=(db as unknown as {from:(table:string)=>any}).from('website_build_reference_tickets')
  const {data,error}=await tickets.select('id,owner_id,project_id,conversation_id,mime_type,object_path,state,expires_at,asset_id')
    .eq('id',ref.ticketId).eq('owner_id',p.userId)
    .eq('project_id',ref.projectId).eq('conversation_id',ref.conversationId).maybeSingle()
  if(error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  const row=data as Ticket|null
  if(!row)throw new WebsiteBuildError('NOT_FOUND',404)
  if(row.owner_id!==p.userId||row.project_id!==ref.projectId||row.conversation_id!==ref.conversationId||
      !['image/png','image/jpeg','image/webp'].includes(row.mime_type)||
      row.object_path!==stagingPath(ref.projectId,ref.conversationId,row.id,row.mime_type))
    throw new WebsiteBuildError('NOT_FOUND',404)
  if(row.state==='ready' && UUID.test(row.asset_id??''))return {status:'ready',ticketId:row.id,assetId:row.asset_id!}
  if(row.state!=='issued'||Date.parse(row.expires_at)<=Date.now())
    throw new WebsiteBuildError('CONFLICT',409)

  // Compare-and-set fences simultaneous finalize attempts; no second writer.
  const claimed=await tickets.update({state:'processing',updated_at:new Date().toISOString()})
    .eq('id',row.id).eq('owner_id',p.userId).eq('state','issued')
    .select('id').maybeSingle()
  if(claimed.error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  if(!claimed.data)throw new WebsiteBuildError('CONFLICT',409)
  const staging=db.storage.from(STAGING_BUCKET)
  const downloaded=await staging.download(row.object_path)
  if(downloaded.error||!downloaded.data){
    // No bytes were admitted, so missing/failed upload may safely retry.
    const restored=await tickets.update({state:'issued'}).eq('id',row.id).eq('state','processing').select('id').maybeSingle()
    if(restored.error||!restored.data)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
    throw new WebsiteBuildError('CONFLICT',409)
  }
  const blob=downloaded.data
  let normalized:Awaited<ReturnType<typeof normalizeReferenceImage>>
  try{
    if(blob.size>MAX_REFERENCE_INPUT_BYTES)throw new ReferenceImageError('IMAGE_TOO_LARGE')
    normalized=await normalizeReferenceImage(new Uint8Array(await blob.arrayBuffer()),row.mime_type)
  }catch(e){
    if(!(e instanceof ReferenceImageError))throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
    const rejected=await tickets.update({state:'rejected',updated_at:new Date().toISOString()})
      .eq('id',row.id).eq('state','processing').select('id').maybeSingle()
    if(rejected.error||!rejected.data)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
    await staging.remove([row.object_path]).catch(()=>null)
    throw new WebsiteBuildError('INVALID_BODY',400)
  }

  // Revocation, archive or project stop may have happened during download/decode.
  await assertReferenceWorkspace(db,p,ref.projectId,ref.conversationId)
  // No path from the client, no public bucket, no unverified original in Assets.
  const admitted=await admitAssetBytes({
    projectId:ref.projectId,kind:'image',visibility:'internal',
    storage:{path:`website/references/${ref.projectId}/${ref.conversationId}/${row.id}`},
    bytes:normalized.bytes,mimeType:normalized.mimeType,width:normalized.width,height:normalized.height,
    provenance:{source:'uploaded',simulated:false,providerMetadata:{purpose:'atlas-website-reference',ticketId:row.id}},
  })
  const saved=await tickets.update({
    state:'ready',asset_id:admitted.asset.id,updated_at:new Date().toISOString(),
  }).eq('id',row.id).eq('state','processing').eq('owner_id',p.userId).select('id').maybeSingle()
  if(saved.error||!saved.data)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  // Cleanup is best effort and never changes the canonical Asset result.
  await staging.remove([row.object_path]).catch(()=>null)
  return {status:'ready',ticketId:row.id,assetId:admitted.asset.id}
}
