import {resolveProjectAccess} from '@/lib/auth/project-access'
import {cinematicShowroomBaseHtml} from '@/lib/website-build/studio/demo-motors-readonly'
import {createCinematicDemoHtml} from '@/lib/website-build/studio/cinematic-demo'
import {listingViewerResponse} from '@/lib/website-build/studio/cinematic-listing'
import {reelResponse} from '@/lib/website-build/studio/cinematic-reel'
import {cinematicAssetNames} from '@/lib/website-build/studio/cinematic-assets'
import {roadsterResponse,roadsterDownloadResponse} from '@/lib/website-build/studio/roadster-preset'
import {cinematicPackageReviewResponse,cinematicPackageDownloadResponse} from '@/lib/website-build/studio/cinematic-package'
export const runtime='nodejs'
export const dynamic='force-dynamic'
/** Fixed fictional owner-only sales preview, no project/customer writes. */
export async function GET(request?:Request):Promise<Response>{
 const access=await resolveProjectAccess()
 if(!access.ok)return access.response
 if(!access.allowedProjectIds.length)return new Response('Forbidden',{status:403})
 if(request){
  const query=new URL(request.url).searchParams
  if(query.get('view')==='build-review')return cinematicPackageReviewResponse()
  if(query.get('download')==='showroom')return cinematicPackageDownloadResponse(query.get('sha256'))
  if(query.get('download')==='roadster')return roadsterDownloadResponse()
  if(query.get('view')==='roadster')return roadsterResponse()
  if(query.get('view')==='roadster-3d')return roadsterResponse(true)
 }
 if(request&&new URL(request.url).searchParams.get('view')==='visning'){
  const names=cinematicAssetNames()
  return reelResponse(names.reelRuntime)
 }
 if(request&&new URL(request.url).searchParams.get('view')==='nord-r')return listingViewerResponse()
 return new Response(createCinematicDemoHtml(cinematicShowroomBaseHtml()).replace('</body>','<p class="reel-link"><a href="?view=build-review">Byggunderlag och export</a></p></body>'),{headers:{
  'content-type':'text/html; charset=utf-8','cache-control':'private, no-store',
  'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
  'x-frame-options':'DENY','content-security-policy':"frame-ancestors 'none'"
 }})
}
