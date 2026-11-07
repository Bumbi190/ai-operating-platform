import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {referenceUploadEnabled} from '@/lib/website-build/assets/availability'
import {parseReferenceQuery,readStoredReference} from '@/lib/website-build/assets/read'
import {WebsiteBuildError} from '@/lib/website-build/store'

export const dynamic='force-dynamic'
export const runtime='nodejs'
export const maxDuration=30
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff',
  'content-security-policy':"default-src 'none'; sandbox"}

export async function GET(request:Request):Promise<Response>{
  const access=await resolveProjectAccess()
  if(!access.ok){access.response.headers.set('cache-control',headers['cache-control']);return access.response}
  try{
    if(!referenceUploadEnabled())throw new WebsiteBuildError('REFERENCE_UNAVAILABLE',503)
    const ref=parseReferenceQuery(new URL(request.url).searchParams,true)
    if(!('ticketId' in ref))throw new WebsiteBuildError('INVALID_BODY',400)
    const bytes=await readStoredReference(createAdminClient(),access,ref)
    return new Response(new Uint8Array(bytes),{headers:{...headers,'content-type':'image/webp'}})
  }catch(error){
    const status=error instanceof WebsiteBuildError?error.status:503
    return Response.json({error:status===404?'Not found':'Bilden kunde inte läsas.'},
      {status,headers})
  }
}
