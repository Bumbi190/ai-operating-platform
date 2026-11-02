import {resolveProjectAccess} from '@/lib/auth/project-access'
import {demoMotorsReadOnlyHtml} from '@/lib/website-build/studio/demo-motors-readonly'

export const runtime='nodejs'
export const dynamic='force-dynamic'

/**
 * Trusted, fixed fictional preview only. It is NOT a user-authored website,
 * so it may run on its own authenticated origin without iframe sandbox changes.
 * Every subresource remains owner-gated and is validated by its immutable hash.
 */
export async function GET():Promise<Response>{
 const access=await resolveProjectAccess()
 if(!access.ok)return access.response
 if(!access.allowedProjectIds.length)return new Response('Forbidden',{status:403})
 return new Response(demoMotorsReadOnlyHtml(),{
  status:200,
  headers:{
   'content-type':'text/html; charset=utf-8',
   'cache-control':'private, no-store',
   'referrer-policy':'no-referrer',
   'x-content-type-options':'nosniff',
   'x-frame-options':'DENY',
   'content-security-policy':"frame-ancestors 'none'"
  }
 })
}
