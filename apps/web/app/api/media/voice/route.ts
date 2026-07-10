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

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { generateVoiceover, type VoiceName } from '@/lib/media/elevenlabs'
import { uploadAudio, uploadTimingData } from '@/lib/media/storage'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { assertMediaProductionEligible, eligibilityResponse } from '@/lib/media/eligibility'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

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
  const { data: script } = await db
    .from('media_scripts')
    .select('id, project_id')
    .eq('id', script_id)
    .single()

  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  const projectId = script.project_id
  if (!projectId) {
    return NextResponse.json({ error: 'Script is missing project_id' }, { status: 422 })
  }
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) return projectForbidden()

  try {
    await assertMediaProductionEligible(db, { projectId, scriptId: script_id, stage: 'voice' })
  } catch (error) {
    const res = eligibilityResponse(error)
    return NextResponse.json(res.body, { status: res.status })
  }

  try {
    // Generate voiceover with word-level timing
    const result = await generateVoiceover(text, voice ?? 'victoria')

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
