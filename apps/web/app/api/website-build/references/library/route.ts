import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {referenceUploadEnabled} from '@/lib/website-build/assets/availability'
import {listStoredReferences,parseReferenceQuery} from '@/lib/website-build/assets/read'
import {buildErrorResponse} from '@/lib/website-build/api'

export const dynamic='force-dynamic'
export const runtime='nodejs'
const headers={'cache-control':'private, no-store'}

export async function GET(request:Request):Promise<Response>{
  const access=await resolveProjectAccess()
  if(!access.ok){access.response.headers.set('cache-control',headers['cache-control']);return access.response}
  if(!referenceUploadEnabled())return Response.json({available:false,items:[]},{headers})
  try{
    const ref=parseReferenceQuery(new URL(request.url).searchParams,false)
    const items=await listStoredReferences(createAdminClient(),access,ref)
    return Response.json({available:true,items},{headers})
  }catch(error){return buildErrorResponse(error)}
}
