/**
 * POST /api/media/publish/instagram
 *
 * Publishes a rendered video to Instagram as a Reel.
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
        // Build caption with source attribution
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

        // Post to Instagram with live progress
        const result = await postReelToInstagram(
          script.video_url,
          caption,
          (step, pct) => {
            const labels: Record<string, string> = {
              uploading:  'Uploading video to Instagram...',
              processing: 'Instagram is processing the video...',
              publishing: 'Publishing Reel...',
            }
            emit({ step, label: labels[step] ?? step, progress: pct })
          },
        )

        // Update DB: mark as published
        await db
          .from('media_scripts')
          .update({
            status:           'published',
            published_at:     new Date().toISOString(),
            instagram_media_id: result.mediaId,
            instagram_url:    result.permalink ?? null,
          })
          .eq('id', scriptId)

        emit({
          step:      'done',
          label:     '🎉 Published on Instagram!',
          progress:  100,
          mediaId:   result.mediaId,
          permalink: result.permalink,
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
