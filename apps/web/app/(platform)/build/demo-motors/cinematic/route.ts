import {resolveProjectAccess} from '@/lib/auth/project-access'
import {demoMotorsReadOnlyHtml} from '@/lib/website-build/studio/demo-motors-readonly'
import {createCinematicDemoHtml} from '@/lib/website-build/studio/cinematic-demo'
export const runtime='nodejs'
export const dynamic='force-dynamic'
/** Fixed fictional owner-only sales preview, no project/customer writes. */
export async function GET():Promise<Response>{
 const access=await resolveProjectAccess()
 if(!access.ok)return access.response
 if(!access.allowedProjectIds.length)return new Response('Forbidden',{status:403})
 return new Response(createCinematicDemoHtml(demoMotorsReadOnlyHtml()),{headers:{
  'content-type':'text/html; charset=utf-8','cache-control':'private, no-store',
  'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
  'x-frame-options':'DENY','content-security-policy':"frame-ancestors 'none'"
 }})
}
