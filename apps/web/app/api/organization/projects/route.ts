import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

/** Read-only organization project directory: only explicit non-secret fields. */
export async function GET() {
  const session = await createClient()
  const { data: { user }, error } = await session.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers })

  const admin = createAdminClient()
  const scope = await resolveOrganizationReadScope(session, admin, user.id)
  if (!scope.role.active) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
  if (scope.projectIds.length === 0) return NextResponse.json({ projects: [] }, { headers })

  const { data: rows, error: readError } = await admin.from('projects')
    .select('id, slug, name')
    .in('id', [...scope.projectIds])
    .order('name', { ascending: true })
  if (readError) return NextResponse.json({ error: 'Unavailable' }, { status: 503, headers })

  return NextResponse.json({
    projects: (rows ?? []).map(({ id, slug, name }) => ({ id, slug, name })),
  }, { headers })
}
