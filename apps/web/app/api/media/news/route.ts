/**
 * GET  /api/media/news?project_id=&status=&limit=
 * POST /api/media/news  — create a news item manually
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { scopeProjectFilter } from '@/lib/atlas/isolation'
import type { Database } from '@/lib/supabase/types'
import { NextResponse } from 'next/server'
import { persistCandidateWithNoveltyReview } from '@/lib/media/novelty'

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
  if (!projectId) return projectForbidden()
  if (typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const db = createAdminClient()
  try {
    const result = await persistCandidateWithNoveltyReview(db, {
      project_id: projectId,
      run_id: typeof body.run_id === 'string' ? body.run_id : null,
      title: body.title,
      summary: body.summary ?? null,
      key_insight: body.key_insight ?? null,
      url: body.url ?? null,
      source_name: body.source_name ?? null,
      target_audience: body.target_audience ?? null,
      content_angle: body.content_angle ?? null,
      virality_score: body.virality_score ?? 0,
      raw_output: typeof body.raw_output === 'object' && body.raw_output !== null
        ? body.raw_output as Record<string, unknown>
        : null,
    })
    const { data } = await db.from('media_news_items').select('*').eq('id', result.newsItemId).single()
    return NextResponse.json({ ...data, novelty_outcome: result.status, novelty_verdict_result: result.verdict }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save news item' }, { status: 500 })
  }
}
