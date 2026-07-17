/**
 * PATCH /api/media/scripts/[id]  — approve / reject / update feedback
 * GET   /api/media/scripts/[id]  — fetch single script
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import type { Database } from '@/lib/supabase/types'
import { NextResponse } from 'next/server'
import { assertMediaProductionEligible, eligibilityResponse } from '@/lib/media/eligibility'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const { id } = await params
  const db = createAdminClient()
  const { data, error } = await db
    .from('media_scripts')
    .select('*, media_news_items(title, source_name, virality_score)')
    .eq('id', id)
    .single()
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
  const body = await request.json() as {
    status?: string
    feedback?: string
    hook?: string
    script?: string
  }

  const allowed = ['pending_review', 'approved', 'rejected', 'published']
  if (body.status && !allowed.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const updates: Database['public']['Tables']['media_scripts']['Update'] = {}
  if (body.status) {
    updates.status = body.status
    if (body.status === 'approved' || body.status === 'rejected') {
      updates.reviewed_at = new Date().toISOString()
    }
    if (body.status === 'published') {
      updates.published_at = new Date().toISOString()
    }
  }
  if (body.feedback !== undefined) updates.feedback = body.feedback
  if (body.hook !== undefined) updates.hook = body.hook
  if (body.script !== undefined) updates.script = body.script

  const db = createAdminClient()

  // Verify ownership BEFORE mutating — fetch the row's project first.
  const { data: existing } = await db
    .from('media_scripts')
    .select('id, project_id')
    .eq('id', id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!assertProjectAllowed(existing.project_id, access.allowedProjectIds)) return projectForbidden()
  if (body.status === 'approved') {
    try {
      await assertMediaProductionEligible(db, { projectId: existing.project_id, scriptId: id, stage: 'script' })
    } catch (guardError) {
      const res = eligibilityResponse(guardError)
      return NextResponse.json(res.body, { status: res.status })
    }
  }

  const { data, error } = await db
    .from('media_scripts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
