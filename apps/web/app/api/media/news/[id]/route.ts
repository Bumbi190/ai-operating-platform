/**
 * PATCH /api/media/news/[id]  — update status (approve / reject / scripted)
 * GET   /api/media/news/[id]  — fetch single news item
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { NextResponse } from 'next/server'
import { transitionNewsItemStatus, type NewsStatus } from '@/lib/media/news-state'
import { eligibilityResponse } from '@/lib/media/eligibility'

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
  const body = await request.json() as {
    status?: NewsStatus
    resolution_reason?: string
    reviewed_resolution?: boolean
  }

  const allowed = [
    'new',
    'pending_novelty_review',
    'novelty_passed',
    'pending_editorial_review',
    'approved',
    'rejected',
    'scripted',
    'duplicate_blocked',
    'material_update_pending',
    'uncertain_requires_review',
  ]
  if (body.status && !allowed.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const db = createAdminClient()

  // Verify ownership BEFORE mutating — fetch the row's project first.
  const { data: existing } = await (db.from('media_news_items') as any)
    .select('id, project_id, status, novelty_verdict, novelty_policy_outcome')
    .eq('id', id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!assertProjectAllowed(existing.project_id, access.allowedProjectIds)) return projectForbidden()
  if (body.status === 'approved' && (
    existing.novelty_verdict !== 'new' ||
    existing.novelty_policy_outcome !== 'novelty_passed' ||
    !['pending_editorial_review', 'novelty_passed', 'approved'].includes(String(existing.status))
  )) {
    return NextResponse.json({ error: 'Completed novelty review is required before editorial approval' }, { status: 409 })
  }

  if (!body.status) return NextResponse.json(existing)

  try {
    const data = await transitionNewsItemStatus(db, {
      projectId: existing.project_id,
      newsItemId: id,
      toStatus: body.status,
      actor: { id: access.userId, kind: 'user' },
      reason: body.resolution_reason ?? null,
      reviewedResolution: body.reviewed_resolution === true,
    })
    return NextResponse.json(data)
  } catch (error) {
    const res = eligibilityResponse(error)
    return NextResponse.json(res.body, { status: res.status })
  }
}
