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
import { logRun } from '@/lib/media/run-log'
import { withRetry, nextRetryDelayMs } from '@/lib/media/retry'
import { sendPipelineAlert } from '@/lib/media/alert'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

/**
 * Watchdog: ser till att en hängande extern call (t.ex. Remotion Lambda vid
 * versionsmismatch) kastar i tid så catch-blocket hinner köra INNAN Vercel
 * dödar funktionen vid maxDuration. Utan denna räknas inga render_attempts
 * upp och inget larm skickas (tyst 504-loop — hände 2026-06-10).
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timade ut efter ${Math.round(ms / 1000)}s (watchdog)`)), ms)
    }),
  ])
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Also support ?scriptId=xxx for manual testing (bypasses time window)
  const { searchParams } = new URL(request.url)
  const scriptIdParam = searchParams.get('scriptId')

  let query = db
    .from('media_scripts')
    .select('id, project_id, hook, audio_url, timing_url, duration_ms, images, script, composition, render_attempts, media_news_items(title)')
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
    const { script: scriptText, project_id: projectId, hook } = script
    if (!scriptText || !projectId || !hook) throw new Error('Script saknar obligatoriskt fält: script, project_id eller hook')

    // Images are generated in step2 (parallel with voice). Only generate here as fallback.
    let storedImageUrls: string[] = Array.isArray(script.images) && script.images.length > 0
      ? script.images as string[]
      : []

    if (storedImageUrls.length === 0) {
      console.log(`[cron/step3] No images from step2 — generating now as fallback...`)
      const newsTitle = Array.isArray(script.media_news_items)
        ? (script.media_news_items[0] as { title?: string })?.title ?? hook
        : (script.media_news_items as { title?: string } | null)?.title ?? hook

      const rawImageUrls = await withRetry(() => generateNewsImages(newsTitle, scriptText, 8), { attempts: 2, label: 'Ideogram images (step3)' })   // fler scener = bildbyte var ~6s (retention)
      storedImageUrls = await Promise.all(
        rawImageUrls.map((url, i) => uploadSceneImage(projectId, script.id, i, url)),
      )
      await db.from('media_scripts').update({
        images:      storedImageUrls,
        composition: 'SimpleNewsReel',
      }).eq('id', script.id)
    } else {
      console.log(`[cron/step3] Using ${storedImageUrls.length} images from step2`)
    }

    // Start Lambda render
    const inputProps = await withTimeout(buildVideoInputProps({
      hook:               hook,
      audioUrl:           script.audio_url!,
      timingUrl:          script.timing_url!,
      durationMs:         script.duration_ms ?? 60000,
      images:             storedImageUrls,
      accentColor:        '#6366f1',
      backgroundMusicUrl: undefined,
    }), 8_000, 'buildVideoInputProps (timing-fetch)')

    const { renderId, bucketName } = await withRetry(
      () => withTimeout(startLambdaRender(script.id, inputProps, 'SimpleNewsReel'), 20_000, 'Remotion Lambda render-start'),
      { attempts: 2, label: 'Remotion Lambda render-start' },
    )

    await db.from('media_scripts').update({
      video_status:  'rendering',
      render_id:     renderId,
      render_bucket: bucketName,
    }).eq('id', script.id)

    console.log(`[cron/step3] Render started: ${renderId} for script ${script.id}`)

    // Logga "Render Video"-körningen så Atlas/Activity Center får ett run-id för render-starten.
    await logRun({ workflow: 'Render Video', context: { scriptId: script.id, renderId, phase: 'started' } })

    return NextResponse.json({
      status:     'step3_done',
      scriptId:   script.id,
      imageCount: storedImageUrls.length,
      renderId,
      next:       'publish cron runs at 08:00 / 18:00 UTC',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    const attempts  = (script.render_attempts ?? 0) + 1
    const escalated = attempts >= 3
    await db.from('media_scripts').update({
      video_status:           'failed',
      render_attempts:        attempts,
      pipeline_next_retry_at: escalated ? null : new Date(Date.now() + nextRetryDelayMs(attempts - 1)).toISOString(),
      pipeline_failed_reason: msg,
    }).eq('id', script.id)
    console.error(`[cron/step3] Failed (försök ${attempts}/3): ${msg}`)
    await logRun({ workflow: 'Render Video', status: 'failed', context: { scriptId: script.id, attempts }, error: msg })
    await sendPipelineAlert({
      cronRoute: 'cron/step3', step: 'render', error: msg,
      severity:  escalated ? undefined : 'warning',
      context:   { scriptId: script.id, attempts, max: 3, escalated, note: escalated ? 'Max försök nått — kräver åtgärd' : 'Återförsök schemalagt' },
    })
    return NextResponse.json({ status: 'step3_failed', error: msg, attempts, escalated }, { status: 500 })
  }
}
