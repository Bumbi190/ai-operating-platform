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
import { buildInstagramCaption } from '@/lib/media/instagram'
import { publishInstagramWithLedger } from '@/lib/media/instagram-publication'
import { postReelToFacebook, isFacebookAmbiguousOutcomeError } from '@/lib/media/facebook'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { assertMediaProductionEligible, eligibilityResponse } from '@/lib/media/eligibility'
import {
  claimPublicationChannel,
  markPublicationFailed,
  markPublicationPublished,
  markPublicationUnknownExternalOutcome,
} from '@/lib/media/publication-ledger'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300  // Video processing can take up to 5 min

function sseEvent(controller: ReadableStreamDefaultController, payload: Record<string, unknown>) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`))
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const { scriptId } = await request.json() as { scriptId: string }
  if (!scriptId) return new Response('scriptId required', { status: 400 })

  const db = createAdminClient()

  // Load script
  const { data: script, error } = await db
    .from('media_scripts')
    .select('id, project_id, hook, script, cta, hashtags, video_url, video_status, status, instagram_creation_id, media_news_items(id, url, source_name)')
    .eq('id', scriptId)
    .single()

  if (error || !script) {
    return new Response('Script not found', { status: 404 })
  }
  if (!assertProjectAllowed(script.project_id, access.allowedProjectIds)) return projectForbidden()
  try {
    await assertMediaProductionEligible(db, { projectId: script.project_id, scriptId, stage: 'publish' })
  } catch (guardError) {
    const res = eligibilityResponse(guardError)
    return Response.json(res.body, { status: res.status })
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

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (payload: Record<string, unknown>) => sseEvent(controller, payload)

      try {
        // Build caption
        const newsItem = Array.isArray(script.media_news_items)
          ? script.media_news_items[0]
          : script.media_news_items
        const newsItemId = newsItem?.id ?? null

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

        let igResult: { mediaId: string; permalink?: string }
        const igPublication = await publishInstagramWithLedger(db, {
          projectId: script.project_id,
          newsItemId,
          scriptId: script.id,
          mediaAssetId: videoUrl,
          caption,
          existingContainerId: script.instagram_creation_id,
          scheduledTime: new Date().toISOString(),
          persistContainerId: async (creationId) => {
            const { error: persistError } = await db.from('media_scripts')
              .update({ instagram_creation_id: creationId })
              .eq('id', script.id)
            if (persistError) throw new Error(`script Instagram container persist failed: ${persistError.message}`)
          },
          onProgress: (step, pct) => {
            emit({
              step,
              label: step === 'uploading'
                ? 'Uploading video to Instagram...'
                : step === 'processing'
                  ? 'Instagram is processing the video...'
                  : 'Publishing to Instagram...',
              progress: hasFacebook ? Math.min(60, pct) : pct,
            })
          },
        })

        if (igPublication.status === 'not_claimed' || igPublication.status === 'reconciliation_required') {
          emit({ step: 'blocked', label: `Instagram publication blocked: ${igPublication.status}`, progress: 100, claim: igPublication.claim })
          return
        }
        igResult = igPublication.result
        if (igPublication.status === 'already_published') {
          emit({ step: 'skipped', label: 'Instagram already published for this asset.', progress: hasFacebook ? 60 : 90 })
        }

        // ── Facebook (optional) ───────────────────────────────────────────────
        let fbResult: { postId: string; url?: string } | null = null
        if (hasFacebook) {
          emit({ step: 'uploading', label: 'Publicerar på Facebook...', progress: 65 })
          const fbClaim = await claimPublicationChannel(db, {
            projectId: script.project_id,
            newsItemId,
            scriptId: script.id,
            mediaAssetId: videoUrl,
            channel: 'facebook',
            scheduledTime: new Date().toISOString(),
          })
          try {
            if (fbClaim.status === 'already_published') {
              fbResult = { postId: fbClaim.externalPublicationId ?? 'already-published' }
            } else if (fbClaim.status === 'claimed' || fbClaim.status === 'retry_claimed' || fbClaim.status === 'stale_claim_recovered') {
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
              try {
                await markPublicationPublished(db, fbClaim.ledgerId, fbResult.postId)
              } catch (ledgerErr) {
                await markPublicationUnknownExternalOutcome(
                  db,
                  fbClaim.ledgerId,
                  ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr),
                  fbResult.postId,
                )
                throw ledgerErr
              }
            } else {
              emit({ step: 'fb_warning', label: `Facebook publication not claimed: ${fbClaim.status}`, progress: 95, claim: fbClaim })
            }
          } catch (fbErr) {
            // Facebook failure is non-fatal — Instagram already succeeded
            if (fbResult?.postId) {
              await markPublicationUnknownExternalOutcome(db, fbClaim.ledgerId, fbErr instanceof Error ? fbErr.message : String(fbErr), fbResult.postId)
            } else if (isFacebookAmbiguousOutcomeError(fbErr)) {
              // The post was dispatched but no definitive response was read —
              // the reel may exist on Facebook. Fail closed: never auto-retry.
              await markPublicationUnknownExternalOutcome(db, fbClaim.ledgerId, fbErr instanceof Error ? fbErr.message : String(fbErr))
            } else {
              await markPublicationFailed(db, fbClaim.ledgerId, fbErr instanceof Error ? fbErr.message : String(fbErr))
            }
            console.error('[publish/facebook]', fbErr instanceof Error ? fbErr.message : fbErr)
            emit({ step: 'fb_warning', label: 'Facebook posting failed (Instagram OK)', progress: 95 })
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
