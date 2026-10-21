import 'server-only'
import {decode} from 'jpeg-js'
import {createHash} from 'node:crypto'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {SocialContentAsset} from '../content/types'
import {PublicationError} from './types'
import {readJpegDimensions} from './validate'
export async function verifyPublicationImage(db:ReturnType<typeof createAdminClient>,projectId:string,expected:Pick<SocialContentAsset,'id'|'sha256'>,deps:{storageOrigin?:string;fetcher?:typeof fetch}={}):Promise<{bytes:Uint8Array;width:number;height:number}>{
 try{
  const {data:asset,error}=await db.from('assets').select('id,project_id,status,kind,mime_type,byte_size,checksum_sha256,storage_bucket,storage_path,width,height').eq('id',expected.id).eq('project_id',projectId).maybeSingle()
  if(error)throw new PublicationError('UNAVAILABLE')
  if(!asset||asset.status!=='active'||asset.kind!=='image'||asset.mime_type!=='image/jpeg'||asset.checksum_sha256!==expected.sha256)throw new PublicationError('REVIEW_REQUIRED')
  const byteSize=Number(asset.byte_size);if(!Number.isSafeInteger(byteSize)||byteSize<1||byteSize>8388608)throw new PublicationError('UNSUPPORTED')
  const origin=new URL(deps.storageOrigin??process.env.NEXT_PUBLIC_SUPABASE_URL??'')
  if(origin.protocol!=='https:'||origin.username||origin.password)throw new PublicationError('UNAVAILABLE')
  const signed=await db.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path,60)
  if(signed.error||!signed.data?.signedUrl)throw new PublicationError('UNAVAILABLE')
  const url=new URL(signed.data.signedUrl)
  if(url.origin!==origin.origin||url.username||url.password||url.hash||!url.pathname.startsWith('/storage/v1/object/sign/'))throw new PublicationError('UNAVAILABLE')
  const response=await (deps.fetcher??fetch)(url.toString(),{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)})
  if(!response.ok||!response.body)throw new PublicationError('UNAVAILABLE')
  if(Number(response.headers.get('content-length'))>8388608){await response.body.cancel();throw new PublicationError('UNAVAILABLE')}
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8388608){await reader.cancel();throw new PublicationError('UNAVAILABLE')}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  if(size!==byteSize||createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw new PublicationError('REVIEW_REQUIRED')
  const dimensions=readJpegDimensions(bytes)
  if(asset.width!==null&&asset.width!==dimensions.width||asset.height!==null&&asset.height!==dimensions.height)throw new PublicationError('REVIEW_REQUIRED')
  try{const decoded=decode(bytes,{useTArray:true,formatAsRGBA:false,tolerantDecoding:false,maxResolutionInMP:3,maxMemoryUsageInMB:64});if(decoded.width!==dimensions.width||decoded.height!==dimensions.height||decoded.data.length!==dimensions.width*dimensions.height*3)throw Error()}catch{throw new PublicationError('UNSUPPORTED')}
  return {bytes,...dimensions}
 }catch(e){if(e instanceof PublicationError)throw e;throw new PublicationError('UNAVAILABLE')}
}
