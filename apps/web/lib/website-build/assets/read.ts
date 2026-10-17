import 'server-only'
import {createHash} from 'node:crypto'
import type {ProjectAccessOk} from '@/lib/auth/project-access'
import type {createAdminClient} from '@/lib/supabase/admin'
import {WebsiteBuildError} from '../store'
import {assertReferenceWorkspace} from './tickets'

type Db=ReturnType<typeof createAdminClient>
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const BYTE_LIMIT=10*1024*1024
const PRIVATE_BUCKET='media-assets-private'
const query=(db:Db,table:string)=>(db as unknown as {from:(name:string)=>any}).from(table)
export type ReferenceRef={projectId:string;conversationId:string}
export type ReferenceImageRef=ReferenceRef&{ticketId:string}
export type StoredReference={ticketId:string;assetId:string;issuedAt:string}

function assertIdentifiers(ref:ReferenceRef&{ticketId?:string}):void{
  if(!UUID.test(ref.projectId)||!UUID.test(ref.conversationId)||
      (ref.ticketId!==undefined&&!UUID.test(ref.ticketId)))
    throw new WebsiteBuildError('INVALID_BODY',400)
}
export function parseReferenceQuery(queryParams:URLSearchParams,withTicket:boolean):ReferenceRef|ReferenceImageRef{
  const allowed=withTicket?'conversationId,projectId,ticketId':'conversationId,projectId'
  if([...queryParams.keys()].sort().join(',')!==allowed ||
     [...queryParams.keys()].some(k=>queryParams.getAll(k).length!==1))
    throw new WebsiteBuildError('INVALID_BODY',400)
  const ref={projectId:queryParams.get('projectId')!,
    conversationId:queryParams.get('conversationId')!,
    ...(withTicket?{ticketId:queryParams.get('ticketId')!}:{})}
  assertIdentifiers(ref)
  return ref
}

async function ownerRef(db:Db,p:ProjectAccessOk,ref:ReferenceRef):Promise<void>{
  assertIdentifiers(ref)
  await assertReferenceWorkspace(db,p,ref.projectId,ref.conversationId)
}

/** Returns identifiers only. The UI never sees a storage path or a privileged URL. */
export async function listStoredReferences(db:Db,p:ProjectAccessOk,ref:ReferenceRef):
  Promise<StoredReference[]>{
  await ownerRef(db,p,ref)
  const {data,error}=await query(db,'website_build_reference_tickets')
    .select('id,asset_id,issued_at').eq('owner_id',p.userId)
    .eq('project_id',ref.projectId).eq('conversation_id',ref.conversationId)
    .eq('state','ready').order('issued_at',{ascending:false}).limit(40)
  if(error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  return (data??[]).filter((row:any)=>UUID.test(row.id)&&UUID.test(row.asset_id))
    .map((row:any)=>({ticketId:row.id,assetId:row.asset_id,issuedAt:row.issued_at}))
}

export async function readStoredReference(db:Db,p:ProjectAccessOk,ref:ReferenceImageRef):
  Promise<Uint8Array>{
  assertIdentifiers(ref)
  await ownerRef(db,p,ref)
  const {data:t,error:tError}=await query(db,'website_build_reference_tickets')
    .select('id,owner_id,project_id,conversation_id,state,asset_id')
    .eq('id',ref.ticketId).eq('owner_id',p.userId)
    .eq('project_id',ref.projectId).eq('conversation_id',ref.conversationId)
    .eq('state','ready').maybeSingle()
  if(tError)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  if(!t?.asset_id||!UUID.test(t.asset_id)||t.id!==ref.ticketId||
    t.owner_id!==p.userId||t.project_id!==ref.projectId||
    t.conversation_id!==ref.conversationId||t.state!=='ready')
    throw new WebsiteBuildError('NOT_FOUND',404)

  const expected=`website/references/${ref.projectId}/${ref.conversationId}/${ref.ticketId}.webp`
  const {data:a,error:aError}=await query(db,'assets')
    .select('id,project_id,visibility,kind,mime_type,status,byte_size,checksum_sha256,storage_bucket,storage_path')
    .eq('id',t.asset_id).eq('project_id',ref.projectId).maybeSingle()
  if(aError)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  if(!a||a.storage_bucket!==PRIVATE_BUCKET||a.storage_path!==expected||
    a.visibility!=='internal'||a.kind!=='image'||a.status!=='active'||
    a.mime_type!=='image/webp'||!Number.isSafeInteger(a.byte_size)||
    a.byte_size<1||a.byte_size>BYTE_LIMIT||
    typeof a.checksum_sha256!=='string'||!/^[a-f0-9]{64}$/.test(a.checksum_sha256))
    throw new WebsiteBuildError('NOT_FOUND',404)

  const {data:source,error:sourceError}=await query(db,'asset_provenance')
    .select('asset_id,source,provider_metadata').eq('asset_id',a.id).maybeSingle()
  if(sourceError)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  if(!source||source.source!=='uploaded'||
    source.provider_metadata?.purpose!=='atlas-website-reference'||
    source.provider_metadata?.ticketId!==ref.ticketId)
    throw new WebsiteBuildError('NOT_FOUND',404)

  const {data:blob,error:storageError}=await db.storage.from(PRIVATE_BUCKET).download(expected)
  if(storageError||!blob)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  if(blob.size!==a.byte_size || blob.size>BYTE_LIMIT)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  const bytes=new Uint8Array(await blob.arrayBuffer())
  if(createHash('sha256').update(bytes).digest('hex')!==a.checksum_sha256)
    throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  // Ownership may have changed while the private object was being downloaded.
  await ownerRef(db,p,ref)
  return bytes
}
