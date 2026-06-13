/**
 * PATCH /api/media/news/[id]  — update status (approve / reject / scripted)
 * GET   /api/media/news/[id]  — fetch single news item
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const { id } = await params
  const db = createAdminClient()
  const { data, error } = await db.from('media_news_items').select('*').eq('id', id).single()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!assertProjectAllowed(data.project_id, access.allowedProjectIds)) return projectForbidden()
  return NextResponse.json(data)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const { id } = await params
  const body = await request.json() as { status?: string }

  const allowed = ['new', 'approved', 'rejected', 'scripted']
  if (body.status && !allowed.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const db = createAdminClient()

  // Verify ownership BEFORE mutating — fetch the row's project first.
  const { data: existing } = await db
    .from('media_news_items')
    .select('id, project_id')
    .eq('id', id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!assertProjectAllowed(existing.project_id, access.allowedProjectIds)) return projectForbidden()

  const { data, error } = await db
    .from('media_news_items')
    .update({ status: body.status })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
