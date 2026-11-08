import {resolveProjectAccess} from '@/lib/auth/project-access'
import {readPublicWebsitePreviewAsset} from '@/lib/website-build/public-preview-assets'

import {cinematicAssetResponse,isListingViewerAsset} from '@/lib/website-build/studio/cinematic-assets'
export const runtime='nodejs'
export const dynamic='force-dynamic'

/** Only vetted immutable GLB, poster and JS can be read; no uploads or user files. */
export async function GET(_request:Request,{params}:{params:{path:string[]}}):Promise<Response>{
 const access=await resolveProjectAccess()
 if(!access.ok)return access.response
 if(!access.allowedProjectIds.length)return new Response('Forbidden',{status:403})
 if(isListingViewerAsset(params.path))return cinematicAssetResponse(_request,params.path[1])
 let asset:ReturnType<typeof readPublicWebsitePreviewAsset>
 try{asset=readPublicWebsitePreviewAsset(params.path)}catch{
  return new Response(null,{status:500,headers:{'cache-control':'no-store'}})
 }
 if(!asset)return new Response(null,{status:404,headers:{'cache-control':'no-store'}})
 return new Response(Buffer.from(asset.bytes),{
  status:200,
  headers:{
   'content-type':asset.contentType,
   'cache-control':'private, no-store',
   'x-content-type-options':'nosniff',
   'referrer-policy':'no-referrer'
  }
 })
}
