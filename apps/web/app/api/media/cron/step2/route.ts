/**
 * GET /api/media/cron/step2
 *
 * Autonomous pipeline — Step 2 of 3 (< 60s, runs on Vercel Hobby)
 * Schedule: 07:25 UTC and 17:25 UTC
 *
 * Does: Finds step1 output → generates voiceover → uploads audio + timing
 * Next: /api/media/cron/step3 picks up 5 min later
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateVoiceover } from '@/lib/media/elevenlabs'
import { uploadAudio, uploadTimingData } from '@/lib/media/storage'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Find a script from the last 15 min waiting for voice
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data: script } = await db
    .from('media_scripts')
    .select('id, project_id, script')
    .eq('voice_status', 'none')
    .eq('status', 'approved')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!script) {
    return NextResponse.json({ status: 'nothing_to_do', reason: 'No script waiting for voice in last 15 min' })
  }

  console.log(`[cron/step2] Generating voice for script ${script.id}`)

  // Mark as generating to prevent double-processing
  await db.from('media_scripts').update({ voice_status: 'generating' }).eq('id', script.id)

  try {
    const voiceResult = await generateVoiceover(script.script, 'victoria')

    const [audioUrl, timingUrl] = await Promise.all([
      uploadAudio(script.project_id, script.id, voiceResult.audioBuffer),
      uploadTimingData(script.project_id, script.id, { words: voiceResult.words, durationMs: voiceResult.durationMs }),
    ])

    await db.from('media_scripts').update({
      audio_url:    audioUrl,
      timing_url:   timingUrl,
      duration_ms:  voiceResult.durationMs,
      voice_status: 'ready',
    }).eq('id', script.id)

    console.log(`[cron/step2] Done — ${(voiceResult.durationMs / 1000).toFixed(1)}s voice for script ${script.id}`)

    return NextResponse.json({
      status:    'step2_done',
      scriptId:  script.id,
      durationMs: voiceResult.durationMs,
      next:      'step3 will run in 5 min',
    })
  } catch (err) {
    await db.from('media_scripts').update({ voice_status: 'none' }).eq('id', script.id)
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error(`[cron/step2] Failed: ${msg}`)
    return NextResponse.json({ status: 'voice_failed', error: msg }, { status: 500 })
  }
}
