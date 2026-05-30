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
import { uploadAudio, uploadTimingData, uploadSceneImage } from '@/lib/media/storage'
import { generateNewsImages } from '@/lib/media/ideogram'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Also support ?scriptId=xxx for manual testing (bypasses time window)
  const { searchParams } = new URL(request.url)
  const scriptIdParam = searchParams.get('scriptId')

  let query = db
    .from('media_scripts')
    .select('id, project_id, hook, script, media_news_items(title)')
    .eq('status', 'approved')
    .order('generated_at', { ascending: false })
    .limit(1)

  if (scriptIdParam) {
    // Manual override — find by ID regardless of age
    query = query.eq('id', scriptIdParam)
  } else {
    // Automatic cron — only look at last 60 min, voice not yet generated
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    query = query
      .or('voice_status.eq.none,voice_status.is.null')
      .gte('generated_at', cutoff)
  }

  const { data: script } = await query.single()

  if (!script) {
    return NextResponse.json({ status: 'nothing_to_do', reason: 'No script waiting for voice in last 15 min' })
  }

  console.log(`[cron/step2] Generating voice for script ${script.id}`)

  // Mark as generating to prevent double-processing
  await db.from('media_scripts').update({ voice_status: 'generating' }).eq('id', script.id)

  try {
    // Get news title for image generation
    const newsTitle = Array.isArray(script.media_news_items)
      ? (script.media_news_items[0] as { title?: string })?.title ?? script.hook
      : (script.media_news_items as { title?: string } | null)?.title ?? script.hook

    // Generate voice + images in parallel (independent operations)
    console.log(`[cron/step2] Generating voice + 3 images in parallel...`)
    const [voiceResult, rawImageUrls] = await Promise.all([
      generateVoiceover(script.script, 'victoria'),
      generateNewsImages(newsTitle, script.script, 3),
    ])

    // Upload everything in parallel
    const [audioUrl, timingUrl, ...storedImageUrls] = await Promise.all([
      uploadAudio(script.project_id, script.id, voiceResult.audioBuffer),
      uploadTimingData(script.project_id, script.id, { words: voiceResult.words, durationMs: voiceResult.durationMs }),
      ...rawImageUrls.map((url, i) => uploadSceneImage(script.project_id, script.id, i, url)),
    ])

    await db.from('media_scripts').update({
      audio_url:    audioUrl,
      timing_url:   timingUrl,
      duration_ms:  voiceResult.durationMs,
      images:       storedImageUrls,
      composition:  'SimpleNewsReel',
      voice_status: 'ready',
    }).eq('id', script.id)

    console.log(`[cron/step2] Done — ${(voiceResult.durationMs / 1000).toFixed(1)}s voice + ${storedImageUrls.length} images for script ${script.id}`)

    return NextResponse.json({
      status:     'step2_done',
      scriptId:   script.id,
      durationMs: voiceResult.durationMs,
      imageCount: storedImageUrls.length,
      next:       'step3 will run in 5 min',
    })
  } catch (err) {
    await db.from('media_scripts').update({ voice_status: 'none' }).eq('id', script.id)
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error(`[cron/step2] Failed: ${msg}`)
    return NextResponse.json({ status: 'voice_failed', error: msg }, { status: 500 })
  }
}
