/**
 * Server-only adapter for project-owned MP4 render inputs.
 *
 * PRIVATE READ PATH. Not wired to a route, cron or publisher. The future
 * caller MUST authorize its saved script/project and require editorial review
 * before providing video asset IDs. This module is not such authorization.
 */
import 'server-only'
import {asAssetId} from '@/lib/media/asset/types'
import {getAsset,publicDeliveryUrl,signedAssetUrl} from '@/lib/media/asset/store'
import {
  resolveProjectVideoSlots,
  type ResolvedVideoSlot,
} from './project-video-slots'

const PREVIEW_URL_LIFETIME_SECONDS=3600

export async function readProjectOwnedReelVideoInputs(params:{
  projectId:string
  imageCount:number
  videoAssetIds?:ReadonlyArray<string|null>
}):Promise<Array<ResolvedVideoSlot|null>>{
  return resolveProjectVideoSlots({
    ...params,
    // The canonical ID is the only lookup input. No URLs are accepted from
    // clients, and the pure selector checks the returned owner project/asset.
    load:async id=>getAsset(asAssetId(id)),
    deliver:async asset=>asset.visibility==='public'
      ?publicDeliveryUrl(asset.storage)
      :signedAssetUrl(asset.storage,PREVIEW_URL_LIFETIME_SECONDS),
  })
}
