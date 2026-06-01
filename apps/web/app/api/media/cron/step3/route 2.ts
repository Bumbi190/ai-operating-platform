/**
 * GET /api/media/cron/step3
 *
 * Autonomous pipeline — Step 3 of 3 (< 60s, runs on Vercel Hobby)
 * Schedule: 07:30 UTC and 17:30 UTC
 *
 * Does: Finds step2 output → generates 3 scene images → uploads → builds Remotion
 *       inputProps → QUEUES the render (video_status='render_pending').
 *       The heavy renderMediaOnLambda() call (>60s, would 504 here) now runs in the
 *       Supabase Edge Function `render-start`, triggered by the omnira_render_start
 *       pg_cron job — so step3 stays well under Vercel's 60s limit.
 * Next: render-start edge fn → publish cron picks up when video_status='ready'
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateNewsImages } from '@/lib/media/ideogram'
import { uploadSceneImage } from '@/lib/media/storage'
import { buildVideoInputProps } from '@/lib/media/video-props'

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
    .select('id, project_id, hook, audio_url, timing_url, duration_ms, images, script, composition, media_news_items(title)')
    .eq('voice_status', 'ready')
    .eq('status', 'approved')
    .order('generated_at', { ascending: false })
    .limit(1)

  if (scriptIdParam) {
    // Manual override — find by ID regardless of age
    query = query.eq('id', scriptIdParam)
  } else {
    // Automatic cron — only look at last 60 min, images not yet generated
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    query = query
      .or('video_status.eq.none,video_status.is.null')
      .gte('generated_at', cutoff)
  }

  const { data: script } = await query.single()

  if (!script) {
    return NextResponse.json({ status: 'nothing_to_do', reason: 'No script waiting for images in last 30 min' })
  }

  console.log(`[cron/step3] Generating images + starting render for script ${script.id}`)

  // Mark as processing to prevent double-runs
  await db.from('media_scripts').update({ video_status: 'generating_images' }).eq('id', script.id)

  try {
    // Images are generated in step2 (parallel with voice). Only generate here as fallback.
    let storedImageUrls: string[] = Array.isArray(script.images) && script.images.length > 0
      ? script.images as string[]
      : []

    if (storedImageUrls.length === 0) {
      console.log(`[cron/step3] No images from step2 — generating now as fallback...`)
      const newsTitle = Array.isArray(script.media_news_items)
        ? (script.media_news_items[0] as { title?: string })?.title ?? script.hook
        : (script.media_news_items as { title?: string } | null)?.title ?? script.hook

      const rawImageUrls = await generateNewsImages(newsTitle, script.script, 3)
      storedImageUrls = await Promise.all(
        rawImageUrls.map((url, i) => uploadSceneImage(script.project_id, script.id, i, url)),
      )
      await db.from('media_scripts').update({
        images:      storedImageUrls,
        composition: 'SimpleNewsReel',
      }).eq('id', script.id)
    } else {
      console.log(`[cron/step3] Using ${storedImageUrls.length} images from step2`)
    }

    // Build render input props (fast — only fetches the word-timing JSON) and QUEUE
    // the render. We deliberately do NOT call renderMediaOnLambda() here: it blocks
    // for >60s and was getting killed by Vercel's function timeout (→ 504, script
    // stuck in generating_images). Instead we persist the props and flip the status
    // to 'render_pending'; the Supabase Edge Function `render-start` (no 60s limit)
    // picks it up and starts the Lambda render.
    const inputProps = await buildVideoInputProps({
      hook:               script.hook,
      audioUrl:           script.audio_url!,
      timingUrl:          script.timing_url!,
      durationMs:         script.duration_ms ?? 60000,
      images:             storedImageUrls,
      accentColor:        '#6366f1',
      backgroundMusicUrl: undefined,
    })

    await db.from('media_scripts').update({
      video_status:       'render_pending',
      render_input_props: inputProps,
      composition:        'SimpleNewsReel',
    }).eq('id', script.id)

    console.log(`[cron/step3] Queued render for script ${script.id} (render-start edge fn will pick it up)`)

    return NextResponse.json({
      status:     'step3_done',
      scriptId:   script.id,
      imageCount: storedImageUrls.length,
      queued:     true,
      next:       'render-start edge function starts the Lambda render',
    })
  } catch (err) {
    await db.from('media_scripts').update({ video_status: 'none' }).eq('id', script.id)
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error(`[cron/step3] Failed: ${msg}`)
    return NextResponse.json({ status: 'step3_failed', error: msg }, { status: 500 })
  }
}
