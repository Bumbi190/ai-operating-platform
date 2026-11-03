import {resolveProjectAccess} from '@/lib/auth/project-access'
import {cinematicShowroomBaseHtml} from '@/lib/website-build/studio/demo-motors-readonly'
import {createCinematicDemoHtml} from '@/lib/website-build/studio/cinematic-demo'
import {listingViewerResponse} from '@/lib/website-build/studio/cinematic-listing'
import {reelResponse} from '@/lib/website-build/studio/cinematic-reel'
import {cinematicAssetNames} from '@/lib/website-build/studio/cinematic-assets'
export const runtime='nodejs'
export const dynamic='force-dynamic'
/** Fixed fictional owner-only sales preview, no project/customer writes. */
export async function GET(request?:Request):Promise<Response>{
 const access=await resolveProjectAccess()
 if(!access.ok)return access.response
 if(!access.allowedProjectIds.length)return new Response('Forbidden',{status:403})
 if(request&&new URL(request.url).searchParams.get('view')==='visning'){
  const names=cinematicAssetNames()
  return reelResponse(names.reelRuntime)
 }
 if(request&&new URL(request.url).searchParams.get('view')==='nord-r')return listingViewerResponse()
 return new Response(createCinematicDemoHtml(cinematicShowroomBaseHtml()),{headers:{
  'content-type':'text/html; charset=utf-8','cache-control':'private, no-store',
  'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
  'x-frame-options':'DENY','content-security-policy':"frame-ancestors 'none'"
 }})
}
