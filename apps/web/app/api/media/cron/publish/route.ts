/**
 * GET /api/media/cron/publish
 *
 * Phase-2 of the fully autonomous AI media engine.
 * Runs at 08:00 and 18:00 UTC — 30 min after the autonomous pipeline cron.
 *
 * Finds any scripts that:
 *   - video_status = 'ready'       (render finished)
 *   - status       = 'approved'    (not yet published)
 *   - published_at IS NULL         (hasn't been published)
 *   - generated_at   within 3 hours  (fresh from today's cron run)
 *
 * Also handles scripts still in 'rendering' state — polls Lambda once more
 * to give straggler renders a final chance before skipping them.
 *
 * This endpoint is the fallback for cases where the Phase-1 cron timed out
 * before the render completed. In most cases, Phase-1 will have already
 * published and this cron will find nothing to do (which is fine).
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLambdaRenderProgress } from '@/lib/media/lambda-render'
import { postReelToInstagram, buildInstagramCaption } from '@/lib/media/instagram'
import { postReelToFacebook } from '@/lib/media/facebook'

export const dynamic    = 'force-dynamic'
export const maxDuration = 120

function log(step: string, msg: string) {
  console.log(`[cron/publish/${step}] ${msg}`)
}

export async function GET(request: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Scripts created in the last 3 hours (today's pipeline runs)
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()

  // ── Check for stuck 'rendering' scripts and poll them one more time ───────────
  const { data: renderingScripts } = await db
    .from('media_scripts')
    .select('id, render_id, render_bucket')
    .eq('video_status', 'rendering')
    .eq('status', 'approved')
    .is('published_at', null)
    .gte('generated_at', cutoff)
    .limit(3)

  if (renderingScripts && renderingScripts.length > 0) {
    log('poll', `Polling ${renderingScripts.length} still-rendering script(s)...`)

    for (const s of renderingScripts) {
      if (!s.render_id || !s.render_bucket) continue
      try {
        const prog = await getLambdaRenderProgress(s.render_id, s.render_bucket)
        if (prog.done && prog.videoUrl) {
          await db.from('media_scripts').update({
            video_url:    prog.videoUrl,
            video_status: 'ready',
          }).eq('id', s.id)
          log('poll', `Script ${s.id} render now complete`)
        } else if (prog.done && prog.error) {
          await db.from('media_scripts').update({ video_status: 'failed' }).eq('id', s.id)
          log('poll', `Script ${s.id} render failed: ${prog.error}`)
        } else {
          log('poll', `Script ${s.id} still rendering (${Math.round(prog.progress * 100)}%) — skip`)
        }
      } catch (err) {
        log('poll', `Error polling ${s.id}: ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  // ── Find ready-but-unpublished scripts ────────────────────────────────────────
  const { data: scripts } = await db
    .from('media_scripts')
    .select(`
      id,
      hook,
      script,
      cta,
      hashtags,
      video_url,
      video_status,
      status,
      media_news_items ( url, source_name )
    `)
    .eq('video_status', 'ready')
    .eq('status', 'approved')
    .is('published_at', null)
    .gte('generated_at', cutoff)
    .order('generated_at', { ascending: false })
    .limit(1)

  if (!scripts || scripts.length === 0) {
    log('check', 'Nothing to publish — all clear')
    return NextResponse.json({
      status:  'nothing_to_publish',
      ranAt:   new Date().toISOString(),
    })
  }

  const script = scripts[0]
  log('publish', `Publishing script ${script.id}...`)

  if (!script.video_url) {
    return NextResponse.json({ status: 'no_video_url', scriptId: script.id })
  }

  // ── Build caption ─────────────────────────────────────────────────────────────
  const newsItem = Array.isArray(script.media_news_items)
    ? script.media_news_items[0]
    : script.media_news_items

  const caption = buildInstagramCaption({
    hook:       script.hook ?? '',
    cta:        script.cta ?? undefined,
    hashtags:   Array.isArray(script.hashtags) ? script.hashtags as string[] : [],
    sourceUrl:  newsItem?.url ?? undefined,
    sourceName: newsItem?.source_name ?? undefined,
  })

  // ── Publish to Instagram ──────────────────────────────────────────────────────
  let igResult: { mediaId: string; permalink?: string }
  try {
    igResult = await postReelToInstagram(script.video_url, caption)
    log('publish', `Instagram OK: ${igResult.permalink}`)
  } catch (igErr) {
    const msg = igErr instanceof Error ? igErr.message : 'unknown'
    log('publish', `Instagram failed: ${msg}`)
    return NextResponse.json({ status: 'instagram_failed', error: msg, scriptId: script.id }, { status: 500 })
  }

  // ── Publish to Facebook (optional, non-fatal) ─────────────────────────────────
  let fbResult: { postId: string; url?: string } | null = null
  const hasFacebook = !!(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID)

  if (hasFacebook) {
    try {
      fbResult = await postReelToFacebook(script.video_url, caption)
      log('publish', `Facebook OK: ${fbResult.url}`)
    } catch (fbErr) {
      log('publish', `Facebook failed (non-fatal): ${fbErr instanceof Error ? fbErr.message : fbErr}`)
    }
  }

  // ── Update DB ─────────────────────────────────────────────────────────────────
  await db.from('media_scripts').update({
    status:             'published',
    published_at:       new Date().toISOString(),
    instagram_media_id: igResult.mediaId,
    instagram_url:      igResult.permalink ?? null,
    ...(fbResult ? {
      facebook_post_id: fbResult.postId,
      facebook_url:     fbResult.url ?? null,
    } : {}),
  }).eq('id', script.id)

  const platforms = ['Instagram', ...(fbResult ? ['Facebook'] : [])].join(' & ')
  log('done', `Published on ${platforms}`)

  return NextResponse.json({
    status:      'published',
    platforms,
    scriptId:    script.id,
    permalink:   igResult.permalink,
    facebookUrl: fbResult?.url ?? null,
    ranAt:       new Date().toISOString(),
  })
}
