/**
 * GET /api/media/cron/step3
 *
 * Autonomous pipeline — Step 3 of 3 (< 60s, runs on Vercel Hobby)
 * Schedule: 07:30 UTC and 17:30 UTC
 *
 * Does: Finds step2 output → generates 3 scene images → uploads → starts Lambda render
 * Next: /api/media/cron/publish runs at 08:00 / 18:00 (30 min for render to complete)
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateNewsImages } from '@/lib/media/ideogram'
import { uploadSceneImage } from '@/lib/media/storage'
import { buildVideoInputProps } from '@/lib/media/video-props'
import { startLambdaRender } from '@/lib/media/lambda-render'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Find a script from last 30 min with voice ready but no images yet
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data: script } = await db
    .from('media_scripts')
    .select('id, project_id, hook, audio_url, timing_url, duration_ms, images, script, media_news_items(title)')
    .eq('voice_status', 'ready')
    .eq('video_status', 'none')
    .eq('status', 'approved')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!script) {
    return NextResponse.json({ status: 'nothing_to_do', reason: 'No script waiting for images in last 30 min' })
  }

  console.log(`[cron/step3] Generating images + starting render for script ${script.id}`)

  // Mark as processing to prevent double-runs
  await db.from('media_scripts').update({ video_status: 'generating_images' }).eq('id', script.id)

  try {
    // Get news title for image generation
    const newsTitle = Array.isArray(script.media_news_items)
      ? (script.media_news_items[0] as { title?: string })?.title ?? script.hook
      : (script.media_news_items as { title?: string } | null)?.title ?? script.hook

    // Generate 3 images (fewer than 5 to stay under 60s)
    const rawImageUrls = await generateNewsImages(newsTitle, script.script, 3)

    // Upload images
    const storedImageUrls = await Promise.all(
      rawImageUrls.map((url, i) => uploadSceneImage(script.project_id, script.id, i, url)),
    )

    await db.from('media_scripts').update({
      images:      storedImageUrls,
      composition: 'SimpleNewsReel',
      // Note: background music skipped (Pixabay blocked by Lambda)
    }).eq('id', script.id)

    // Start Lambda render
    const inputProps = await buildVideoInputProps({
      hook:               script.hook,
      audioUrl:           script.audio_url!,
      timingUrl:          script.timing_url!,
      durationMs:         script.duration_ms ?? 60000,
      images:             storedImageUrls,
      accentColor:        '#6366f1',
      backgroundMusicUrl: undefined,
    })

    const { renderId, bucketName } = await startLambdaRender(script.id, inputProps, 'SimpleNewsReel')

    await db.from('media_scripts').update({
      video_status:  'rendering',
      render_id:     renderId,
      render_bucket: bucketName,
    }).eq('id', script.id)

    console.log(`[cron/step3] Render started: ${renderId} for script ${script.id}`)

    return NextResponse.json({
      status:     'step3_done',
      scriptId:   script.id,
      imageCount: storedImageUrls.length,
      renderId,
      next:       'publish cron runs at 08:00 / 18:00 UTC',
    })
  } catch (err) {
    await db.from('media_scripts').update({ video_status: 'none' }).eq('id', script.id)
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error(`[cron/step3] Failed: ${msg}`)
    return NextResponse.json({ status: 'step3_failed', error: msg }, { status: 500 })
  }
}
