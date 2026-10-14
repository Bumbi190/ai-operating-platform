import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'

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

  const { data, error } = await admin.from('workflows')
    .select('id, name, description, trigger, active, created_at')
    .eq('project_id', project.id).order('created_at', { ascending: false }).limit(30)
  if (error) return NextResponse.json({ error: 'Unavailable' }, { status: 503, headers })
  return NextResponse.json({
    workflows: (data ?? []).map(row => ({
      id: row.id, name: row.name, description: row.description,
      trigger: row.trigger, active: row.active, created_at: row.created_at,
    })),
  }, { headers })
}
