import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'
import { HANDLARBORSEN_PROJECT_ID, HANDLARBORSEN_PROJECT_SLUG } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {
  authorizeHandlarborsenWorkflowWrite, isSameOriginJson,
  organizationWriteError, ORGANIZATION_WRITE_HEADERS, parseSafeWorkflowMetadata,
} from '@/lib/auth/organization-workflow-write'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const fail = (status: number) => NextResponse.json({ error: status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status, headers })

/** Scoped, deliberately non-executable workflow directory for organization members. */
export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  const session = await createClient()
  const { data: { user }, error: authError } = await session.auth.getUser()
  if (authError || !user) return fail(401)
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(params.slug)) return fail(403)
  const admin = createAdminClient()
  const scope = await resolveOrganizationReadScope(session, admin, user.id)
  if (!scope.role.active || scope.projectIds.length === 0) return fail(403)

  const { data: project, error: projectError } = await admin.from('projects')
    .select('id').eq('slug', params.slug).in('id', [...scope.projectIds]).maybeSingle()
  if (projectError || !project) return fail(403)
  // Owner Command Center intentionally scrubs workflow descriptions from
  // observer models. The metadata editor needs descriptions only on the
  // uniquely delegated Handlarbörsen project.
  const showDescription = project.id === HANDLARBORSEN_PROJECT_ID
    && params.slug === HANDLARBORSEN_PROJECT_SLUG

  const { data, error } = await admin.from('workflows')
    .select('id, name, description, trigger, active, created_at')
    .eq('project_id', project.id).order('created_at', { ascending: false }).limit(30)
  if (error) return NextResponse.json({ error: 'Unavailable' }, { status: 503, headers })
  return NextResponse.json({
    workflows: (data ?? []).map(row => ({
      id: row.id, name: row.name, description: showDescription ? row.description : null,
      trigger: row.trigger, active: row.active, created_at: row.created_at,
    })),
  }, { headers })
}


/** Only an INACTIVE manual workflow shell; never deploys or executes code. */
export async function POST(request: Request, { params }: { params: { slug: string } }) {
  if (!isSameOriginJson(request)) return organizationWriteError(403)
  const grant = await authorizeHandlarborsenWorkflowWrite(params.slug)
  if (!grant.ok) return grant.response

  let payload: unknown
  try { payload = await request.json() } catch { return organizationWriteError(400) }
  const safe = parseSafeWorkflowMetadata(payload, true)
  if (!safe?.name) return organizationWriteError(400)

  const { data, error } = await grant.db.from('workflows').insert({
    project_id: grant.projectId,
    name: safe.name,
    description: safe.description ?? null,
    steps: [],
    trigger: 'manual',
    cron_expr: null,
    active: false,
  }).select('id, name, description, trigger, active, created_at').single()
  if (error || !data) return organizationWriteError(503)
  return NextResponse.json({ workflow: data }, { status: 201, headers: ORGANIZATION_WRITE_HEADERS })
}
