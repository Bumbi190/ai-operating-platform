import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/collectors/handlarborsen-marketplace'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const fail = (status: number) => NextResponse.json({ error: 'Not permitted or unavailable' }, { status, headers })
export async function GET() {
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return fail(401)
  const db = createAdminClient()
  const scope = await resolveOrganizationReadScope(session, db, user.id)
  if (!scope.role.active) return fail(403)
  if (!scope.projectIds.length) return NextResponse.json({ proposals: [], events: [] }, { headers })
  const { data, error } = await ((db as any).from('omnira_collaborator_proposals') as any)
    .select('id, project_id, author_id, title, detail, status, decision_reason, decided_at, created_at')
    .in('project_id', [...scope.projectIds]).order('created_at', { ascending: false }).limit(60)
  if (error || !Array.isArray(data)) return fail(503)
  // Event rows are SERVER_ONLY and have no project_id. Bound them exclusively
  // through proposal IDs already scoped to the verified session's projects.
  const allowedProposals = data.filter((p: { id: unknown; project_id: unknown }) =>
    typeof p.id === 'string' && scope.projectIds.includes(p.project_id as string))
  if (allowedProposals.length === 0)
    return NextResponse.json({ proposals: [], events: [] }, { headers })
  const ids = allowedProposals.map((p: { id: string }) => p.id)
  const { data: eventRows, error: eventError } = await ((db as any).from('omnira_collaborator_proposal_events') as any)
    .select('proposal_id, event, created_at')
    .in('proposal_id', ids).order('created_at', { ascending: true }).limit(180)
  if (eventError || !Array.isArray(eventRows)) return fail(503)
  const permitted = new Set(ids)
  return NextResponse.json({
    proposals: allowedProposals,
    events: eventRows.filter((e: { proposal_id: string }) => permitted.has(e.proposal_id))
      .map((e: { proposal_id: string; event: string; created_at: string }) => ({
        proposal_id: e.proposal_id, event: e.event, created_at: e.created_at,
      })),
  }, { headers })
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin ||
      !/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) return fail(403)
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return fail(401)
  const db = createAdminClient()
  const scope = await resolveOrganizationReadScope(session, db, user.id)
  if (!scope.role.active || scope.role.role !== 'collaborator') return fail(403)
  let body: unknown
  try { body = await request.json() } catch { return fail(400) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400)
  const p = body as Record<string, unknown>
  if (Object.keys(p).sort().join(',') !== 'detail,project_id,title' ||
    typeof p.project_id !== 'string' || p.project_id !== HANDLARBORSEN_PROJECT_ID || !scope.projectIds.includes(p.project_id) ||
    typeof p.title !== 'string' || typeof p.detail !== 'string' ||
    p.title.trim().length < 3 || p.title.length > 120 ||
    p.detail.trim().length < 10 || p.detail.length > 4000) return fail(400)
  const { data, error } = await ((db as any).from('omnira_collaborator_proposals') as any)
    .insert({ project_id: p.project_id, author_id: user.id, title: p.title.trim(), detail: p.detail.trim() })
    .select('id, status').single()
  if (error || !data) return fail(503)
  return NextResponse.json({ proposal: data }, { status: 201, headers })
}
