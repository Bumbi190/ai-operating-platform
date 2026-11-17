import 'server-only'
import {createHash} from 'node:crypto'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {BuildPrincipal} from '../types'
import {WebsiteBuildError,validateBuildUuid} from '../store'
import {readProspect} from './store'
import type {ProspectRef} from './types'
export async function readProspectImage(db: ReturnType<typeof createAdminClient>,p: BuildPrincipal,ref: ProspectRef,assetId: string){
  validateBuildUuid(assetId)
  const current=await readProspect(db,p,ref),capture=current.content.capture,image=capture?.images.find(i=>i.assetId===assetId)
  if(!capture||!image)throw new WebsiteBuildError('NOT_FOUND',404)
  const path=`website/prospects/${ref.projectId}/${ref.prospectId}/${capture.id}/${image.viewport}.webp`
  const {data,error}=await db.from('assets').select('project_id,kind,mime_type,visibility,status,storage_bucket,storage_path,checksum_sha256,byte_size').eq('id',assetId).eq('project_id',ref.projectId).maybeSingle()
  if(error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  if(!data||data.visibility!=='internal'||data.status!=='active'||data.kind!=='image'||data.mime_type!=='image/webp'||data.storage_bucket!=='media-assets-private'||data.storage_path!==path||data.checksum_sha256!==image.sha256||data.byte_size<1||data.byte_size>10*1024*1024)throw new WebsiteBuildError('NOT_FOUND',404)
  const source=await db.from('asset_provenance').select('source,simulated,provider_metadata').eq('asset_id',assetId).maybeSingle()
  if(source.error||!source.data||source.data.source!=='imported'||source.data.simulated!==false||(source.data.provider_metadata as any)?.captureId!==capture.id)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  const response=await db.storage.from('media-assets-private').download(path)
  if(response.error||!response.data||response.data.size!==data.byte_size)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  const bytes=new Uint8Array(await response.data.arrayBuffer())
  if(createHash('sha256').update(bytes).digest('hex')!==image.sha256)throw new WebsiteBuildError('PROSPECT_INTEGRITY_ERROR',503)
  const latest=await readProspect(db,p,ref)
  if(latest.content.capture?.id!==capture.id)throw new WebsiteBuildError('PROSPECT_STALE',409)
  return bytes
}
