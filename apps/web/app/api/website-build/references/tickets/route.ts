import { resolveProjectAccess } from '@/lib/auth/project-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertSameOrigin } from '@/lib/atlas/executive/http'
import { buildErrorResponse, readWebsiteBuildBody } from '@/lib/website-build/api'
import { issueReferenceTicket, parseTicketInput, assertReferenceWorkspace } from '@/lib/website-build/assets/tickets'
import { referenceUploadEnabled } from '@/lib/website-build/assets/availability'
import { WebsiteBuildError } from '@/lib/website-build/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = { 'cache-control': 'private, no-store' }

/** Mints a path-limited upload token, not a signed read URL. */
export async function POST(request: Request): Promise<Response> {
  const access = await resolveProjectAccess()
  if (!access.ok) {
    access.response.headers.set('cache-control',headers['cache-control'])
    return access.response
  }
  const denied = assertSameOrigin(request)
  if (denied) { denied.headers.set('cache-control',headers['cache-control']); return denied }
  try {
    if (!referenceUploadEnabled()) throw new WebsiteBuildError('REFERENCE_UNAVAILABLE', 503)
    const input = parseTicketInput(await readWebsiteBuildBody(request))
    const ticket = await issueReferenceTicket(createAdminClient(),access,input)
    return Response.json(ticket,{status:201,headers})
  } catch (error) {
    return buildErrorResponse(error)
  }
}

/** Read-only capability check for the exact selected conversation. */
export async function GET(request:Request):Promise<Response> {
  const access=await resolveProjectAccess()
  if(!access.ok){access.response.headers.set('cache-control',headers['cache-control']);return access.response}
  if(!referenceUploadEnabled())
    return Response.json({available:false,reason:'not_activated'},{headers})
  try {
    const q=new URL(request.url).searchParams
    if([...q.keys()].sort().join(',')!=='conversationId,projectId' ||
       q.getAll('conversationId').length!==1 || q.getAll('projectId').length!==1)
      throw new WebsiteBuildError('INVALID_BODY',400)
    const projectId=q.get('projectId')!,conversationId=q.get('conversationId')!
    await assertReferenceWorkspace(createAdminClient(),access,projectId,conversationId)
    return Response.json({available:true},{headers})
  }catch(error){return buildErrorResponse(error)}
}
