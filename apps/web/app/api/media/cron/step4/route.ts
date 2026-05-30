/**
 * GET /api/media/cron/step4
 *
 * Autonomous pipeline — Step 4 of 4 (< 60s, runs on Vercel Hobby)
 * Schedule: 07:45 UTC and 17:45 UTC (15 min after step3, 15 min before publish)
 *
 * Does:
 *   1. Polls Lambda until render is complete → saves video_url
 *      - On failure: retries up to 3 times (new Lambda render each time)
 *      - After 3 failures: sends alert email via Brevo
 *   2. Creates Instagram media container → saves instagram_creation_id
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLambdaRenderProgress, startLambdaRender } from '@/lib/media/lambda-render'
import { createReelContainer, buildInstagramCaption } from '@/lib/media/instagram'
import { buildVideoInputProps } from '@/lib/media/video-props'
import { sendPipelineAlert } from '@/lib/media/alert'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const MAX_RENDER_RETRIES = 3

function log(msg: string) {
  console.log(`[cron/step4] ${msg}`)
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  const { searchParams } = new URL(request.url)
  const scriptIdParam = searchParams.get('scriptId')

  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

  // Fetch all fields needed for both polling and potential re-render
  let query = db
    .from('media_scripts')
    .select(`
      id,
      hook,
      cta,
      hashtags,
      video_url,
      video_status,
      render_id,
      render_bucket,
      instagram_creation_id,
      retry_count,
      composition,
      audio_url,
      timing_url,
      duration_ms,
      images,
      media_news_items ( url, source_name )
    `)
    .eq('status', 'approved')
    .is('published_at', null)
    .is('instagram_creation_id', null)
    .order('generated_at', { ascending: false })
    .limit(1)

  if (scriptIdParam) {
    query = query.eq('id', scriptIdParam)
  } else {
    query = query
      .in('video_status', ['rendering', 'ready'])
      .gte('generated_at', cutoff)
  }

  const { data: script } = await query.single()

  if (!script) {
    log('Nothing to do — no pending renders without IG container')
    return NextResponse.json({ status: 'nothing_to_do' })
  }

  log(`Processing script ${script.id} (video_status: ${script.video_status}, retries: ${script.retry_count ?? 0})`)

  // ── Step 1: Poll Lambda if still rendering ────────────────────────────────────
  let videoUrl = script.video_url as string | null

  if (script.video_status === 'rendering') {
    if (!script.render_id || !script.render_bucket) {
      return NextResponse.json({ status: 'missing_render_info', scriptId: script.id })
    }

    const deadline = Date.now() + 45_000
    let renderDone = false

    while (Date.now() < deadline) {
      try {
        const prog = await getLambdaRenderProgress(script.render_id, script.render_bucket)

        if (prog.done && prog.videoUrl) {
          // ✅ Render succeeded
          videoUrl = prog.videoUrl
          await db.from('media_scripts').update({
            video_url:    prog.videoUrl,
            video_status: 'ready',
          }).eq('id', script.id)
          log(`Render complete: ${prog.videoUrl}`)
          renderDone = true
          break

        } else if (prog.done && prog.error) {
          // ❌ Render failed — check retry count
          const retryCount = (script.retry_count as number) ?? 0

          if (retryCount < MAX_RENDER_RETRIES) {
            // Re-trigger a fresh Lambda render with the same props
            log(`Render failed (attempt ${retryCount + 1}/${MAX_RENDER_RETRIES}): ${prog.error} — retrying...`)

            try {
              const inputProps = await buildVideoInputProps({
                hook:       script.hook as string,
                audioUrl:   script.audio_url as string,
                timingUrl:  script.timing_url as string,
                durationMs: script.duration_ms as number,
                images:     (script.images as string[]) ?? [],
              })

              const composition = (script.composition as string | null) ?? 'SimpleNewsReel'
              const { renderId, bucketName } = await startLambdaRender(
                script.id,
                inputProps,
                composition as 'SimpleNewsReel' | 'ShortFormVideo',
              )

              await db.from('media_scripts').update({
                render_id:    renderId,
                render_bucket: bucketName,
                video_status: 'rendering',
                retry_count:  retryCount + 1,
              }).eq('id', script.id)

              log(`New render started (attempt ${retryCount + 1}/${MAX_RENDER_RETRIES}): ${renderId}`)
              return NextResponse.json({
                status:   'render_retry',
                attempt:  retryCount + 1,
                renderId,
                scriptId: script.id,
              })
            } catch (retryErr) {
              const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
              log(`Failed to start retry render: ${retryMsg}`)
              // Fall through to permanent failure
            }
          }

          // 🚨 All retries exhausted (or retry-start itself failed) — mark as failed & alert
          log(`Render permanently failed after ${retryCount + 1} attempt(s): ${prog.error}`)
          await db.from('media_scripts').update({ video_status: 'failed' }).eq('id', script.id)

          await sendPipelineAlert({
            cronRoute: 'cron/step4',
            step:      'render_failed',
            error:     prog.error ?? 'Unknown render error',
            severity:  'error',
            context: {
              scriptId:   script.id,
              hook:       (script.hook as string)?.slice(0, 80) ?? null,
              retries:    retryCount + 1,
              render_id:  script.render_id as string,
            },
          })

          return NextResponse.json({
            status:   'render_failed_permanently',
            attempts: retryCount + 1,
            error:    prog.error,
            scriptId: script.id,
          })

        } else {
          log(`Still rendering (${Math.round(prog.progress * 100)}%)...`)
          await new Promise(r => setTimeout(r, 5_000))
        }
      } catch (err) {
        log(`Poll error: ${err instanceof Error ? err.message : err}`)
        break
      }
    }

    if (!renderDone) {
      log('Render still in progress after 45s — will retry next run')
      return NextResponse.json({ status: 'still_rendering', scriptId: script.id })
    }
  }

  if (!videoUrl) {
    return NextResponse.json({ status: 'no_video_url', scriptId: script.id })
  }

  // ── Step 2: Create Instagram container ───────────────────────────────────────
  const newsItem = Array.isArray(script.media_news_items)
    ? script.media_news_items[0]
    : script.media_news_items

  const caption = buildInstagramCaption({
    hook:       script.hook ?? '',
    cta:        script.cta ?? undefined,
    hashtags:   Array.isArray(script.hashtags) ? script.hashtags as string[] : [],
    sourceUrl:  (newsItem as { url?: string } | null)?.url ?? undefined,
    sourceName: (newsItem as { source_name?: string } | null)?.source_name ?? undefined,
  })

  try {
    const creationId = await createReelContainer(videoUrl, caption)
    await db.from('media_scripts')
      .update({ instagram_creation_id: creationId })
      .eq('id', script.id)
    log(`Instagram container created: ${creationId}`)

    return NextResponse.json({
      status:     'step4_done',
      scriptId:   script.id,
      creationId,
      next:       'publish cron runs at 08:00 / 18:00 UTC — Instagram will be ready by then',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    log(`Failed to create IG container: ${msg}`)
    return NextResponse.json({ status: 'ig_container_failed', error: msg, scriptId: script.id }, { status: 500 })
  }
}
