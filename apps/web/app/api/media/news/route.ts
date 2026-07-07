/**
 * GET  /api/media/news?project_id=&status=&limit=
 * POST /api/media/news  — create a news item manually
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { scopeProjectFilter } from '@/lib/atlas/isolation'
import type { Database } from '@/lib/supabase/types'
import { NextResponse } from 'next/server'

type NewsInsert = Database['public']['Tables']['media_news_items']['Insert']

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('project_id')
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') ?? '50')

  // A supplied project_id must be one the caller owns; if omitted, scope to all
  // owned projects (never an unscoped query → no cross-project dump).
  if (projectId && !assertProjectAllowed(projectId, access.allowedProjectIds)) return projectForbidden()

  const db = createAdminClient()
  let query = db
    .from('media_news_items')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  query = projectId
    ? query.eq('project_id', projectId)
    : query.in('project_id', scopeProjectFilter(access.allowedProjectIds))
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const body = await request.json() as NewsInsert
  // The target project must be explicit AND owned — no caller-chosen project_id
  // into someone else's pipeline.
  const projectId = typeof body.project_id === 'string' ? body.project_id : null
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) return projectForbidden()

  const db = createAdminClient()
  const { data, error } = await db.from('media_news_items').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
