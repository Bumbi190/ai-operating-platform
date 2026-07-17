/**
 * POST /api/media/render/complete
 *
 * Called by apps/remotion/src/upload.ts after a successful local render.
 * Updates media_scripts with the video URL and marks it render-ready.
 *
 * Auth: Bearer {SUPABASE_SERVICE_ROLE_KEY}   (internal CLI use)
 *
 * Body:
 *   script_id  — uuid of the media_scripts row
 *   video_url  — public Supabase Storage URL for the rendered MP4
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { assertMediaProductionEligible, eligibilityResponse } from '@/lib/media/eligibility'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  // Lightweight auth — accept the Supabase service role key as bearer token
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^bearer\s+/i, '').trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!token || token !== serviceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as {
    script_id: string
    video_url:  string
  }

  if (!body.script_id || !body.video_url) {
    return NextResponse.json(
      { error: 'script_id and video_url are required' },
      { status: 400 },
    )
  }

  const db = createAdminClient()
  const { data: script } = await db
    .from('media_scripts')
    .select('id, project_id')
    .eq('id', body.script_id)
    .single()
  if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  try {
    await assertMediaProductionEligible(db, { projectId: script.project_id, scriptId: body.script_id, stage: 'render' })
  } catch (guardError) {
    const res = eligibilityResponse(guardError)
    return NextResponse.json(res.body, { status: res.status })
  }

  const { error } = await db
    .from('media_scripts')
    .update({
      video_url: body.video_url,
      video_status: 'ready',
    })
    .eq('id', body.script_id)

  if (error) {
    console.error('[render/complete]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[render/complete] Script ${body.script_id} marked ready → ${body.video_url}`)
  return NextResponse.json({ ok: true, video_url: body.video_url })
}
