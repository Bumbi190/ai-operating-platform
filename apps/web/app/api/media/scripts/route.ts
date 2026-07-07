/**
 * GET  /api/media/scripts?project_id=&status=
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { scopeProjectFilter } from '@/lib/atlas/isolation'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('project_id')
  const status = searchParams.get('status')

  if (projectId && !assertProjectAllowed(projectId, access.allowedProjectIds)) return projectForbidden()

  const db = createAdminClient()
  let query = db
    .from('media_scripts')
    .select('*, media_news_items(title, virality_score, content_angle)')
    .order('generated_at', { ascending: false })
    .limit(50)

  query = projectId
    ? query.eq('project_id', projectId)
    : query.in('project_id', scopeProjectFilter(access.allowedProjectIds))
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
