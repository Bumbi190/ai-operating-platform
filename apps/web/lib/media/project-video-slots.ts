/**
 * Pure, read-only project-owned MP4 selection for future reviewed renders.
 * This is NOT user authorization, editorial approval, video generation,
 * asset admission or permission to publish.
 *
 * The *calling server route* must first authorize its script and project.
 * A source is derived from canonical asset identity only, never a caller URL.
 */
import type {Asset} from './asset/types'

export type VideoSlotAsset = Pick<Asset,
  'id'|'projectId'|'kind'|'mimeType'|'status'|'visibility'|
  'durationMs'|'width'|'height'|'byteSize'|'checksumSha256'|'storage'
>

export type ResolvedVideoSlot={src:string;durationFrames:number}

export type VideoSlotRefusalCode =
  'invalid_slots'|'asset_unavailable'|'project_mismatch'|
  'invalid_asset'|'delivery_unavailable'

export class VideoSlotRefusal extends Error {
  readonly code:VideoSlotRefusalCode
  constructor(code:VideoSlotRefusalCode){
    super('PROJECT_VIDEO_SLOT_REFUSED')
    this.name='VideoSlotRefusal'
    this.code=code
  }
}

export interface ProjectVideoSlotRequest {
  /** Must be the owner project of an already-authorized script. */
  projectId:string
  /** Number of approved fallback stills; videos must align by index. */
  imageCount:number
  /** Canonical asset UUIDs or null for the original still. Omit for image-only. */
  videoAssetIds?:ReadonlyArray<string|null>
  load:(assetId:string)=>Promise<VideoSlotAsset|null>
  /** Derive an expiring URL from already validated canonical storage. */
  deliver:(asset:VideoSlotAsset)=>Promise<string>
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_CLIPS=5
const MAX_MP4_BYTES=512*1024*1024
const FPS=30

function usableAsset(asset:VideoSlotAsset):boolean {
  if(asset.kind!=='video'||asset.mimeType!=='video/mp4'||asset.status!=='active')return false
  if(!Number.isFinite(asset.durationMs)||asset.durationMs===null||
     asset.durationMs<1000||asset.durationMs>60000)return false
  if(!Number.isInteger(asset.width)||!Number.isInteger(asset.height)||
     asset.width===null||asset.height===null||
     asset.width<360||asset.height<640||
     Math.abs(asset.width/asset.height-9/16)>0.02)return false
  if(!Number.isInteger(asset.byteSize)||asset.byteSize<1||asset.byteSize>MAX_MP4_BYTES||
     !/^[0-9a-f]{64}$/.test(asset.checksumSha256))return false

  const requiredBucket=asset.visibility==='public'?'media-assets':
    asset.visibility==='internal'?'media-assets-private':null
  if(!requiredBucket||asset.storage?.bucket!==requiredBucket)return false
  const path=asset.storage?.path
  if(typeof path!=='string'||path.length===0||path.length>1024||
     path.startsWith('/')||path.includes('\\')||path.includes('?')||
     path.includes('#')||path.split('/').some(part=>part===''||part==='.'||part==='..'))return false
  return true
}

function isValidDeliveryUrl(value:unknown):value is string {
  if(typeof value!=='string'||value.length>4096)return false
  try{
    const url=new URL(value)
    return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password&&!url.hash
  }catch{return false}
}

/**
 * Every explicit UUID is checked before any URL is minted. Missing or
 * cross-project assets FAIL CLOSED, never silently become unrelated footage.
 * A null slot is the ONLY deliberate still-image fallback.
 */
export async function resolveProjectVideoSlots(
  request:ProjectVideoSlotRequest
):Promise<Array<ResolvedVideoSlot|null>> {
  const {projectId,imageCount,videoAssetIds,load,deliver}=request
  if(!UUID.test(projectId)||!Number.isInteger(imageCount)||imageCount<0||imageCount>MAX_CLIPS)
    throw new VideoSlotRefusal('invalid_slots')

  if(videoAssetIds===undefined)return Array<ResolvedVideoSlot|null>(imageCount).fill(null)
  if(!Array.isArray(videoAssetIds)||videoAssetIds.length!==imageCount)
    throw new VideoSlotRefusal('invalid_slots')
  const ids=new Set<string>()
  for(const id of videoAssetIds){
    if(id===null)continue
    if(typeof id!=='string'||!UUID.test(id)||ids.has(id))
      throw new VideoSlotRefusal('invalid_slots')
    ids.add(id)
  }

  // Resolve and validate ALL assets before producing any delivery URL.
  const selected:Array<VideoSlotAsset|null>=[]
  for(const id of videoAssetIds){
    if(id===null){selected.push(null);continue}
    let asset:VideoSlotAsset|null
    try{asset=await load(id)}catch{throw new VideoSlotRefusal('asset_unavailable')}
    if(!asset)throw new VideoSlotRefusal('asset_unavailable')
    if(asset.projectId!==projectId)throw new VideoSlotRefusal('project_mismatch')
    if(asset.id!==id||!usableAsset(asset))throw new VideoSlotRefusal('invalid_asset')
    selected.push(asset)
  }

  const urls:Array<ResolvedVideoSlot|null>=[]
  for(const asset of selected){
    if(!asset){urls.push(null);continue}
    let url:unknown
    try{url=await deliver(asset)}catch{throw new VideoSlotRefusal('delivery_unavailable')}
    if(!isValidDeliveryUrl(url))throw new VideoSlotRefusal('delivery_unavailable')
    const durationFrames=Math.round((asset.durationMs as number)*FPS/1000)
    if(durationFrames<1||durationFrames>FPS*60)
      throw new VideoSlotRefusal('invalid_asset')
    urls.push({src:url,durationFrames})
  }
  return urls
}
