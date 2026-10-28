/**
 * PATCH /api/media/scripts/[id]  — approve / reject / update feedback
 * GET   /api/media/scripts/[id]  — fetch single script
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import type { Database } from '@/lib/supabase/types'
import { NextResponse } from 'next/server'
import { toJson } from '@/lib/supabase/json'

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
    .select('id, project_id, version, raw_output')
    .eq('id', id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!assertProjectAllowed(existing.project_id, access.allowedProjectIds)) return projectForbidden()

  // Editing a public-facing claim creates a NEW manuscript revision. Even a
  // subsequent edit back to identical wording must not resurrect a previous
  // fact-check or provider provenance. Publication/admission is a separate gate.
  const editsPublicContent = body.hook !== undefined || body.script !== undefined
  if (editsPublicContent) {
    const previous = existing.raw_output
    const raw = previous && typeof previous === 'object' && !Array.isArray(previous)
      ? previous as Record<string,unknown> : {}
    updates.version = (existing.version ?? 1) + 1
    updates.raw_output = toJson({
      ...raw,
      writer_model: null, writer_provider: null, writer_provenance: null,
      writer_version: null, writer_content_sha256: null,
    })
    updates.quality_score = null
    updates.status = 'pending_review'
    updates.reviewed_at = null
    updates.voice_status = 'none'
    updates.audio_url = null
    updates.timing_url = null
    updates.duration_ms = null
    updates.video_status = 'none'
    updates.video_url = null
    updates.render_id = null
    updates.render_bucket = null
  }

  const { data, error } = await db
    .from('media_scripts')
    .update(updates)
    .eq('id', id)
    .eq('project_id', existing.project_id)
    // Optimistic version fence: a concurrent rewrite cannot silently re-use
    // an older provider or reviewer stamp.
    .eq('version', existing.version ?? 1)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  return NextResponse.json(data)
}
