/**
 * POST /api/media/publish/instagram
 *
 * Publishes a rendered video to Instagram as a Reel,
 * and simultaneously to Facebook Page if FACEBOOK_PAGE_ACCESS_TOKEN is set.
 * Streams progress as Server-Sent Events.
 *
 * Body: { scriptId: string }
 *
 * SSE events:
 *   { step: 'uploading',   label: '...', progress: 10 }
 *   { step: 'processing',  label: '...', progress: 30 }
 *   { step: 'publishing',  label: '...', progress: 90 }
 *   { step: 'done',        label: '...', progress: 100, permalink: '...', mediaId: '...' }
 *   { step: 'error',       message: '...' }
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { postReelToInstagram, buildInstagramCaption } from '@/lib/media/instagram'
import { postReelToFacebook } from '@/lib/media/facebook'
import { projectScope, type ExecutionContract } from '@/lib/governance/execution-stop'
import { assertExecutionDispatchAllowed, isExecutionStopped } from '@/lib/governance/execution-dispatch'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300  // Video processing can take up to 5 min

function sseEvent(controller: ReadableStreamDefaultController, payload: Record<string, unknown>) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`))
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { scriptId } = await request.json() as { scriptId: string }
  if (!scriptId) return new Response('scriptId required', { status: 400 })

  const db = createAdminClient()

  // Load script
  const { data: script, error } = await db
    .from('media_scripts')
    .select('id, project_id, hook, script, cta, hashtags, video_url, video_status, status, media_news_items(url, source_name)')
    .eq('id', scriptId)
    .single()

  if (error || !script) {
    return new Response('Script not found', { status: 404 })
  }
  if (script.video_status !== 'ready' || !script.video_url) {
    return new Response('Video not rendered yet', { status: 400 })
  }
  if (script.status === 'published') {
    return new Response('Already published', { status: 409 })
  }

  // Capture as local — the `!script.video_url` narrowing above doesn't survive
  // into the ReadableStream start() closure.
  const videoUrl = script.video_url

  // Session-authenticated, but a human pressing publish is still EXECUTION and a
  // stop refuses it. Authority is the script's own project.
  const execution: ExecutionContract = {
    context: 'OPERATOR_EXECUTION',
    scope: projectScope({ projectId: script.project_id as string }),
  }

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (payload: Record<string, unknown>) => sseEvent(controller, payload)

      try {
        // Build caption
        const newsItem = Array.isArray(script.media_news_items)
          ? script.media_news_items[0]
          : script.media_news_items

        const caption = buildInstagramCaption({
          hook:        script.hook ?? '',
          cta:         script.cta ?? undefined,
          hashtags:    Array.isArray(script.hashtags) ? script.hashtags as string[] : [],
          sourceUrl:   newsItem?.url ?? undefined,
          sourceName:  newsItem?.source_name ?? undefined,
        })

        const hasFacebook = !!(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID)

        // ── Instagram ────────────────────────────────────────────────────────
        emit({ step: 'uploading', label: 'Uploading to Instagram...', progress: 10 })

        // ── GOVERNANCE BOUNDARY: Instagram publish ──
        await assertExecutionDispatchAllowed(
          execution, { system: 'instagram', operation: 'post_reel' })

        const igResult = await postReelToInstagram(
          videoUrl,
          caption,
          (step, pct) => {
            const labels: Record<string, string> = {
              uploading:  'Uploading video to Instagram...',
              processing: 'Instagram is processing the video...',
              publishing: 'Publishing to Instagram...',
            }
            emit({ step, label: labels[step] ?? step, progress: Math.round(pct * (hasFacebook ? 0.6 : 1)) })
          },
        )

        // ── Facebook (optional) ───────────────────────────────────────────────
        let fbResult: { postId: string; url?: string } | null = null
        if (hasFacebook) {
          emit({ step: 'uploading', label: 'Publicerar på Facebook...', progress: 65 })
          try {
            // ── GOVERNANCE BOUNDARY: Facebook is a SEPARATE authorization ──
            // A pause committing after Instagram went out must stop this one.
            await assertExecutionDispatchAllowed(
              execution, { system: 'facebook', operation: 'post_reel' })

            fbResult = await postReelToFacebook(
              videoUrl,
              caption,
              (step, pct) => {
                emit({
                  step,
                  label: step === 'uploading' ? 'Uploading to Facebook...' : 'Publishing to Facebook...',
                  progress: 65 + Math.round(pct * 0.3),
                })
              },
            )
          } catch (fbErr) {
            if (isExecutionStopped(fbErr)) {
              // Not a Facebook failure: nothing was sent. Instagram is not rolled
              // back, and the operator is told why rather than shown a fault that
              // never happened.
              emit({ step: 'fb_deferred', progress: 95,
                     label: `⏸️ Facebook uppskjuten av stopp (${fbErr.reason}) — Instagram OK` })
            } else {
              // Facebook failure is non-fatal — Instagram already succeeded
              console.error('[publish/facebook]', fbErr instanceof Error ? fbErr.message : fbErr)
              emit({ step: 'fb_warning', label: '⚠️ Facebook posting failed (Instagram OK)', progress: 95 })
            }
          }
        }

        // ── Update DB ─────────────────────────────────────────────────────────
        await db
          .from('media_scripts')
          .update({
            status:             'published',
            published_at:       new Date().toISOString(),
            instagram_media_id: igResult.mediaId,
            instagram_url:      igResult.permalink ?? null,
            ...(fbResult ? {
              facebook_post_id: fbResult.postId,
              facebook_url:     fbResult.url ?? null,
            } : {}),
          })
          .eq('id', scriptId)

        const platforms = ['Instagram', ...(fbResult ? ['Facebook'] : [])].join(' & ')

        emit({
          step:      'done',
          label:     `🎉 Publicerat på ${platforms}!`,
          progress:  100,
          mediaId:   igResult.mediaId,
          permalink: igResult.permalink,
          facebookUrl: fbResult?.url ?? null,
        })

      } catch (err) {
        if (isExecutionStopped(err)) {
          // A stop is a deferral, not a publish error. Nothing was dispatched,
          // the script keeps its unpublished state, and it stays resumable.
          sseEvent(controller, { step: 'stopped', reason: err.reason,
                                 message: 'Publicering uppskjuten av stopp' })
          return
        }
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('[publish/instagram]', message)
        sseEvent(controller, { step: 'error', message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
