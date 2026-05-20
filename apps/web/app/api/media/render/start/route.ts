/**
 * POST /api/media/render/start
 *
 * Kicks off a Remotion Lambda cloud render for a script.
 * Body: { scriptId: string }
 *
 * Flow:
 *   1. Load script from DB (audio, timing, images)
 *   2. Build VideoInputProps (captions, hook timing, scene frames)
 *   3. Start renderMediaOnLambda()
 *   4. Store render_id + bucket in DB, set video_status = 'rendering'
 *   5. Return { renderId, bucketName }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildVideoInputProps } from '@/lib/media/video-props'
import { startLambdaRender } from '@/lib/media/lambda-render'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60  // Lambda kickoff is fast; 60s is plenty

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { scriptId } = await request.json() as { scriptId: string }
  if (!scriptId) return NextResponse.json({ error: 'scriptId required' }, { status: 400 })

  const db = createAdminClient()

  // ── Load script ──────────────────────────────────────────────────────────────
  const { data: script, error: scriptError } = await db
    .from('media_scripts')
    .select('id, project_id, hook, audio_url, timing_url, duration_ms, images, video_status')
    .eq('id', scriptId)
    .single()

  if (scriptError || !script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }
  if (!script.audio_url || !script.timing_url) {
    return NextResponse.json({ error: 'Voice not ready yet' }, { status: 400 })
  }
  if (script.video_status === 'rendering') {
    return NextResponse.json({ error: 'Already rendering' }, { status: 409 })
  }

  // ── Build VideoInputProps ────────────────────────────────────────────────────
  const inputProps = await buildVideoInputProps({
    hook:       script.hook ?? '',
    audioUrl:   script.audio_url,
    timingUrl:  script.timing_url,
    durationMs: script.duration_ms ?? 60000,
    images:     Array.isArray(script.images) ? script.images : [],
    accentColor: '#6366f1',
  })

  // ── Mark as queued ───────────────────────────────────────────────────────────
  await db
    .from('media_scripts')
    .update({ video_status: 'rendering' })
    .eq('id', scriptId)

  // ── Start Lambda render ──────────────────────────────────────────────────────
  try {
    const { renderId, bucketName } = await startLambdaRender(scriptId, inputProps)

    await db
      .from('media_scripts')
      .update({ render_id: renderId, render_bucket: bucketName })
      .eq('id', scriptId)

    return NextResponse.json({ renderId, bucketName })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lambda render failed to start'
    console.error('[render/start]', message)

    await db
      .from('media_scripts')
      .update({ video_status: 'failed' })
      .eq('id', scriptId)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
