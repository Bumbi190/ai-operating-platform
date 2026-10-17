import { resolveProjectAccess } from '@/lib/auth/project-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertSameOrigin } from '@/lib/atlas/executive/http'
import { buildErrorResponse, readWebsiteBuildBody } from '@/lib/website-build/api'
import { issueReferenceTicket, parseTicketInput } from '@/lib/website-build/assets/tickets'

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
    const input = parseTicketInput(await readWebsiteBuildBody(request))
    const ticket = await issueReferenceTicket(createAdminClient(),access,input)
    return Response.json(ticket,{status:201,headers})
  } catch (error) {
    return buildErrorResponse(error)
  }
}
