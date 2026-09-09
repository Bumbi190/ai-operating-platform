/**
 * POST /api/media/voice
 *
 * Generates a voiceover for a given script using ElevenLabs.
 * Stores audio + word timing in Supabase Storage.
 * Updates media_scripts table with audio_url, timing_url, duration_ms.
 *
 * Body:
 *   script_id  — uuid of the media_scripts row
 *   text       — the script text to speak
 *   voice?     — BrandVoiceName (default: 'victoria' — see lib/voice/config.ts)
 */

import { getAllowedProjectIds, scopeProjectFilter } from '@/lib/atlas/isolation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { generateVoiceover, type VoiceName } from '@/lib/media/elevenlabs'
import { uploadAudio, uploadTimingData } from '@/lib/media/storage'
import { GLOBAL_ONLY, projectScope } from '@/lib/governance/execution-stop'
import { MEDIA_PIPELINE_PROJECT } from '@/lib/cost/governed-spend'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { script_id, text, voice } = await request.json() as {
    script_id: string
    text: string
    voice?: VoiceName
  }

  if (!script_id || !text) {
    return NextResponse.json({ error: 'script_id and text are required' }, { status: 400 })
  }

  const db = createAdminClient()

  // Verify the script belongs to a project the user owns
  // ISOLATION. The script id is a SELECTOR, not a permission: it arrives from the
  // caller and this lookup runs through the service-role client, so nothing about
  // the id proves the caller may act on it. The row's `project_id` was already
  // being read here — it was simply never checked against the caller's projects.
  //
  // NOTE ON governed spend: `projectScope({ projectId })` below is BILLING
  // attribution, not authorization. `lib/cost/governed-spend.ts` contains no
  // session check and no allow-list, and it attributes to a fixed platform slug.
  // A reader who sees `withGovernedSpend` and assumes the route is guarded would
  // be wrong; this is the guard.
  //
  // Selection and authorization are the SAME query, so a foreign script and a
  // missing one are indistinguishable, and the check cannot drift out of order.
  const allowedProjectIds = await getAllowedProjectIds(db, user.id)

  const { data: script, error: scriptError } = await db
    .from('media_scripts')
    .select('id, project_id')
    .eq('id', script_id)
    .in('project_id', scopeProjectFilter(allowedProjectIds))
    .maybeSingle()

  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  const projectId = script.project_id
  if (!projectId) {
    return NextResponse.json({ error: 'Script is missing project_id' }, { status: 422 })
  }

  try {
    // Generate voiceover with word-level timing
    const result = await generateVoiceover(text, { context: 'OPERATOR_EXECUTION' as const, scope: projectScope({ projectId }) }, voice ?? 'victoria')

    // Upload audio + timing to Supabase Storage
    const [audioUrl, timingUrl] = await Promise.all([
      uploadAudio(projectId, script_id, result.audioBuffer),
      uploadTimingData(projectId, script_id, {
        words: result.words,
        durationMs: result.durationMs,
      }),
    ])

    // Update media_scripts row with voice data
    await db
      .from('media_scripts')
      .update({
        audio_url: audioUrl,
        timing_url: timingUrl,
        duration_ms: result.durationMs,
        voice_status: 'ready',
      })
      .eq('id', script_id)

    return NextResponse.json({
      ok: true,
      audio_url: audioUrl,
      timing_url: timingUrl,
      duration_ms: result.durationMs,
      word_count: result.words.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Voice] Generation failed:', message)

    await db
      .from('media_scripts')
      .update({ voice_status: 'failed' })
      .eq('id', script_id)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
