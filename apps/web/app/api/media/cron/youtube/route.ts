/**
 * GET /api/media/cron/youtube
 *
 * Laddar upp den senast publicerade videon som en YouTube Short.
 * Körs ~5 min efter publish-cronen (08:05 / 18:05 UTC via pg_cron).
 *
 * Hittar scripts som:
 *   - har en renderad video (video_url IS NOT NULL)
 *   - redan publicerats på IG/FB (published_at IS NOT NULL)  — vi återanvänder samma video
 *   - ännu inte laddats upp till YouTube (youtube_video_id IS NULL)
 *   - genererats inom 24h
 *
 * Stödjer ?scriptId=xxx för manuell testning (kringgår tidsfönstret).
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isYouTubeConfigured, uploadShort, buildYouTubeMeta } from '@/lib/media/youtube'
import { sendPipelineAlert } from '@/lib/media/alert'
import { logRun } from '@/lib/media/run-log'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

function log(msg: string) {
  console.log(`[cron/youtube] ${msg}`)
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isYouTubeConfigured()) {
    log('YouTube ej konfigurerat (saknar OAuth-env) — hoppar över')
    return NextResponse.json({ status: 'youtube_not_configured' })
  }

  const db = createAdminClient()

  const { searchParams } = new URL(request.url)
  const scriptIdParam = searchParams.get('scriptId')

  let query = db
    .from('media_scripts')
    .select('id, hook, cta, hashtags, video_url, youtube_video_id, media_news_items ( url, source_name )')
    .not('video_url', 'is', null)
    .is('youtube_video_id', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(1)

  if (scriptIdParam) {
    query = query.eq('id', scriptIdParam)
  } else {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    query = query.not('published_at', 'is', null).gte('generated_at', cutoff)
  }

  const { data: script } = await query.maybeSingle()

  if (!script) {
    return NextResponse.json({ status: 'nothing_to_upload', ranAt: new Date().toISOString() })
  }
  if (!script.video_url) {
    return NextResponse.json({ status: 'no_video_url', scriptId: script.id })
  }

  log(`Laddar upp script ${script.id} till YouTube...`)

  const newsItem = Array.isArray(script.media_news_items)
    ? script.media_news_items[0]
    : script.media_news_items

  const { title, description, tags } = buildYouTubeMeta({
    hook:       script.hook ?? 'AI news update',
    cta:        script.cta ?? undefined,
    hashtags:   Array.isArray(script.hashtags) ? script.hashtags as string[] : [],
    sourceName: (newsItem as { source_name?: string } | null)?.source_name ?? null,
    sourceUrl:  (newsItem as { url?: string } | null)?.url ?? null,
  })

  try {
    const { videoId, url } = await uploadShort({ videoUrl: script.video_url, title, description, tags })

    await db.from('media_scripts')
      .update({ youtube_video_id: videoId, youtube_url: url })
      .eq('id', script.id)

    log(`YouTube OK: ${url}`)
    await logRun({ workflow: 'Publish to YouTube', context: { scriptId: script.id, youtubeUrl: url } })

    return NextResponse.json({ status: 'uploaded', scriptId: script.id, youtubeUrl: url, ranAt: new Date().toISOString() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`YouTube misslyckades: ${msg}`)
    await logRun({ workflow: 'Publish to YouTube', status: 'failed', context: { scriptId: script.id }, error: msg })
    await sendPipelineAlert({
      cronRoute: 'cron/youtube',
      step:      'youtube_upload',
      error:     msg,
      severity:  'warning',
      context:   { scriptId: script.id, note: 'IG/FB publicerades OK — endast YouTube failade' },
    })
    return NextResponse.json({ status: 'youtube_failed', error: msg, scriptId: script.id }, { status: 500 })
  }
}
