import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const fail = (status: number) => NextResponse.json({ error: 'Not permitted or unavailable' }, { status, headers })
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (request.headers.get('origin') !== new URL(request.url).origin ||
    !/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) return fail(403)
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return fail(400)
  const operator = await resolvePlatformOperator()
  if (!operator.ok) return fail(403)
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user || user.id !== operator.userId) return fail(403)
  const db = createAdminClient()
  const scope = await resolveOrganizationReadScope(session, db, user.id)
  if (!scope.role.active || scope.role.role !== 'owner') return fail(403)
  let body: unknown
  try { body = await request.json() } catch { return fail(400) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400)
  const input = body as Record<string, unknown>
  if (Object.keys(input).sort().join(',') !== 'decision,reason' ||
      (input.decision !== 'approved' && input.decision !== 'rejected') ||
      typeof input.reason !== 'string' || input.reason.trim().length > 600) return fail(400)
  const { data: updated, error } = await ((db as any).from('omnira_collaborator_proposals') as any)
    .update({ status: input.decision, decision_by: user.id, decision_reason: input.reason.trim(), decided_at: new Date().toISOString() })
    .eq('id', params.id).eq('status', 'pending').neq('author_id', user.id)
    .in('project_id', [...scope.projectIds])
    .select('id, status, decided_at').maybeSingle()
  if (error) return fail(503)
  if (!updated) return fail(409)
  // A review changes proposal metadata ONLY. No executor call occurs here.
  return NextResponse.json({ proposal: updated }, { headers })
}
