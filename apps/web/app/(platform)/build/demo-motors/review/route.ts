import {resolveProjectAccess} from '@/lib/auth/project-access'
import {renderVehicleReviewPrototype} from '@/lib/website-build/vehicle-verification/review-prototype'

export const dynamic='force-dynamic'
export const runtime='nodejs'

/** Read-only synthetic UI, never an approval or customer review endpoint. */
export async function GET():Promise<Response>{
 const access=await resolveProjectAccess()
 if(!access.ok)return access.response
 if(!access.allowedProjectIds.length)return new Response('Forbidden',{status:403})
 return new Response(renderVehicleReviewPrototype(),{
  status:200,
  headers:{
   'content-type':'text/html; charset=utf-8',
   'cache-control':'private, no-store',
   'referrer-policy':'no-referrer',
   'x-content-type-options':'nosniff',
   'x-frame-options':'DENY',
   'content-security-policy':
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'"
  }
 })
}
