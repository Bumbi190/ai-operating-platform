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
    .select('id, hook, script, cta, hashtags, video_url, video_status, status, media_news_items(url, source_name)')
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

        const igResult = await postReelToInstagram(
          script.video_url,
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
            fbResult = await postReelToFacebook(
              script.video_url,
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
            // Facebook failure is non-fatal — Instagram already succeeded
            console.error('[publish/facebook]', fbErr instanceof Error ? fbErr.message : fbErr)
            emit({ step: 'fb_warning', label: '⚠️ Facebook posting failed (Instagram OK)', progress: 95 })
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
