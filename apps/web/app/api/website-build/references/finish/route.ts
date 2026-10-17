import { resolveProjectAccess } from '@/lib/auth/project-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertSameOrigin } from '@/lib/atlas/executive/http'
import { buildErrorResponse, readWebsiteBuildBody } from '@/lib/website-build/api'
import { finalizeReferenceTicket, parseFinalizeInput } from '@/lib/website-build/assets/finalize'

export const dynamic='force-dynamic'
export const runtime='nodejs'
export const maxDuration=30
const headers={'cache-control':'private, no-store'}

export async function POST(request:Request):Promise<Response> {
  const access=await resolveProjectAccess()
  if(!access.ok){access.response.headers.set('cache-control',headers['cache-control']);return access.response}
  const denied=assertSameOrigin(request)
  if(denied){denied.headers.set('cache-control',headers['cache-control']);return denied}
  try{
    const input=parseFinalizeInput(await readWebsiteBuildBody(request))
    const receipt=await finalizeReferenceTicket(createAdminClient(),access,input)
    return Response.json(receipt,{headers})
  }catch(error){return buildErrorResponse(error)}
}
