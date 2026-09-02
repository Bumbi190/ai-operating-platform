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
import { persistChannelSuccess } from '@/lib/media/channel-persistence'

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
    .select('id, project_id, hook, script, cta, hashtags, video_url, video_status, status, instagram_media_id, instagram_url, facebook_post_id, facebook_url, published_at, media_news_items(url, source_name)')
    .eq('id', scriptId)
    .single()

  if (error || !script) {
    return new Response('Script not found', { status: 404 })
  }
  if (script.video_status !== 'ready' || !script.video_url) {
    return new Response('Video not rendered yet', { status: 400 })
  }
  // ── Idempotency by CHANNEL ID, not by the coarse status ────────────────────
  // `status === 'published'` is too blunt once a channel can be deferred by a
  // stop: a script whose Instagram succeeded and whose Facebook was refused is
  // NOT finished, and rejecting it here is exactly what turned "deferred" into
  // "abandoned". The id columns are the stronger fact — they record what actually
  // happened on each channel.
  const igAlreadyDone = script.instagram_media_id != null
  const facebookConfigured = !!(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID)
  const fbAlreadyDone = !facebookConfigured || script.facebook_post_id != null

  if (igAlreadyDone && fbAlreadyDone) {
    return new Response('Already published', { status: 409 })
  }

  // Preserved so a governance deferral can put the row back exactly where it was.
  // Forcing 'approved' would guess at a state the operator may have chosen.
  const originalStatus = script.status as string | null

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

        const hasFacebook = facebookConfigured

        // ── Instagram ────────────────────────────────────────────────────────
        // A completed publication is externally true and permanent. If a prior
        // attempt published Instagram and was then stopped before Facebook, this
        // resumed request must NOT publish it a second time.
        let igResult: { mediaId: string; permalink?: string }
        if (igAlreadyDone) {
          emit({ step: 'uploading', label: 'Instagram redan publicerad — hoppar över', progress: 60 })
          igResult = {
            mediaId: script.instagram_media_id as string,
            permalink: (script.instagram_url as string | null) ?? undefined,
          }
        } else {
        emit({ step: 'uploading', label: 'Uploading to Instagram...', progress: 10 })

        // ── GOVERNANCE BOUNDARY: Instagram publish ──
        await assertExecutionDispatchAllowed(
          execution, { system: 'instagram', operation: 'post_reel' })

        igResult = await postReelToInstagram(
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

        // Persisted IMMEDIATELY, before Facebook is even authorised. This is the
        // idempotency fact "Instagram already happened": if the stop lands
        // between the channels, a later resume must find it and skip.
        await persistChannelSuccess(db, scriptId, {
          instagram_media_id: igResult.mediaId,
          instagram_url:      igResult.permalink ?? null,
        }, new Date().toISOString())
        }

        // ── Facebook (optional) ───────────────────────────────────────────────
        let fbResult: { postId: string; url?: string } | null = null
        let fbDeferredReason: string | null = null
        if (hasFacebook && script.facebook_post_id != null) {
          // Already published on a previous attempt — never post twice.
          fbResult = {
            postId: script.facebook_post_id as string,
            url: (script.facebook_url as string | null) ?? undefined,
          }
        } else if (hasFacebook) {
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
              fbDeferredReason = fbErr.reason
              emit({ step: 'fb_deferred', progress: 95, reason: fbErr.reason,
                     label: `⏸️ Facebook uppskjuten av stopp (${fbErr.reason}) — Instagram OK` })
            } else {
              // Facebook failure is non-fatal — Instagram already succeeded
              console.error('[publish/facebook]', fbErr instanceof Error ? fbErr.message : fbErr)
              emit({ step: 'fb_warning', label: '⚠️ Facebook posting failed (Instagram OK)', progress: 95 })
            }
          }
        }

        // ── Finalise ──────────────────────────────────────────────────────────
        // Instagram is already persisted above. What remains is Facebook's result
        // and the question of whether this script is FINISHED.
        //
        // A deferred channel is pending work, not completed work. Marking the
        // script `published` here would make it unreachable — this route rejects
        // a published script, and the cron queue only looks at `approved` — so a
        // Facebook the operator merely paused would never be sent at all. That is
        // abandonment wearing the word "deferred".
        if (fbResult) {
          await persistChannelSuccess(db, scriptId, {
            facebook_post_id: fbResult.postId,
            facebook_url:     fbResult.url ?? null,
          }, new Date().toISOString())
        }

        const everyChannelDone = !!fbResult || !hasFacebook
        await db
          .from('media_scripts')
          .update(everyChannelDone
            // Terminal only when every configured channel actually went out.
            ? { status: 'published' }
            // Otherwise put the row back exactly where it was, so the operator —
            // or the cron queue — can finish the remaining channel after resume.
            : { status: originalStatus })
          .eq('id', scriptId)

        const platforms = ['Instagram', ...(fbResult ? ['Facebook'] : [])].join(' & ')

        emit({
          step:      fbDeferredReason ? 'partial_deferred' : 'done',
          reason:    fbDeferredReason ?? undefined,
          label:     fbDeferredReason
            ? `✅ Publicerat på ${platforms}. Facebook uppskjuten av stopp — återupptas efter resume.`
            : `🎉 Publicerat på ${platforms}!`,
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
