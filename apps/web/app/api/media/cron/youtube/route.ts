/**
 * GET /api/media/cron/youtube
 *
 * Laddar upp publicerade videor som YouTube Shorts.
 * Körs ~5 min efter publish-cronen (08:05 / 18:05 UTC via pg_cron).
 *
 * Hittar scripts som:
 *   - har en renderad video (video_url IS NOT NULL)
 *   - redan publicerats på IG/FB (published_at IS NOT NULL)  — vi återanvänder samma video
 *   - ännu inte laddats upp till YouTube (youtube_video_id IS NULL)
 *   - publicerats inom WINDOW_HOURS (default 48h)
 *
 * HÄRDAT: tar INTE bara senaste videon utan loopar över ALLA som saknas på
 * YouTube inom fönstret (äldst först). På så vis hoppas ingen video över om en
 * publicering blir försenad (t.ex. morgon + kväll samma dag, eller en sen
 * publicering). Fönstret på 48h gör att gammal historik INTE backfillas.
 * Taket MAX_PER_RUN skyddar mot timeout (maxDuration 60s) — resten tas nästa körning.
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
import {
  claimPublicationChannel,
  markPublicationFailed,
  markPublicationProviderAttempt,
  markPublicationPublished,
  markPublicationUnknownExternalOutcome,
} from '@/lib/media/publication-ledger'
import { assertMediaProductionEligible } from '@/lib/media/eligibility'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const WINDOW_HOURS = 48   // publicerade inom detta fönster är kandidater (utesluter gammal historik)
const MAX_PER_RUN  = 3    // tak per körning för att hålla oss inom maxDuration

type ScriptRow = {
  id: string
  project_id: string
  hook: string | null
  cta: string | null
  hashtags: unknown
  video_url: string | null
  youtube_video_id: string | null
  media_news_items: unknown
}

function log(msg: string) {
  console.log(`[cron/youtube] ${msg}`)
}

async function uploadOne(db: ReturnType<typeof createAdminClient>, script: ScriptRow) {
  await assertMediaProductionEligible(db, { projectId: script.project_id, scriptId: script.id, stage: 'youtube' })

  const newsItem = Array.isArray(script.media_news_items)
    ? script.media_news_items[0]
    : script.media_news_items

  const claim = await claimPublicationChannel(db, {
    projectId: script.project_id,
    newsItemId: (newsItem as { id?: string } | null)?.id ?? null,
    scriptId: script.id,
    mediaAssetId: script.video_url!,
    channel: 'youtube',
    scheduledTime: new Date().toISOString(),
  })
  if (claim.status === 'already_published') {
    return claim.externalPublicationId
      ? `https://www.youtube.com/shorts/${claim.externalPublicationId}`
      : 'already_published'
  }
  if (claim.status !== 'claimed' && claim.status !== 'retry_claimed' && claim.status !== 'stale_claim_recovered') {
    return `not_claimed:${claim.status}`
  }

  const { title, description, tags } = buildYouTubeMeta({
    hook:       script.hook ?? 'AI news update',
    cta:        script.cta ?? undefined,
    hashtags:   Array.isArray(script.hashtags) ? script.hashtags as string[] : [],
    sourceName: (newsItem as { source_name?: string } | null)?.source_name ?? null,
    sourceUrl:  (newsItem as { url?: string } | null)?.url ?? null,
  })

  let externalVideoId: string | null = null
  try {
    const { videoId, url } = await uploadShort({
      videoUrl: script.video_url!,
      title,
      description,
      tags,
      onUploadSession: uploadUrl => markPublicationProviderAttempt(db, claim.ledgerId, {
        providerAttemptId: uploadUrl,
        providerUploadUrl: uploadUrl,
      }),
    })
    externalVideoId = videoId

    const { error: scriptUpdateError } = await db.from('media_scripts')
      .update({ youtube_video_id: videoId, youtube_url: url })
      .eq('id', script.id)
    if (scriptUpdateError) throw new Error(`youtube script update failed: ${scriptUpdateError.message}`)

    try {
      await markPublicationPublished(db, claim.ledgerId, videoId)
    } catch (ledgerErr) {
      await markPublicationUnknownExternalOutcome(
        db,
        claim.ledgerId,
        ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr),
        videoId,
      )
      throw ledgerErr
    }
    await logRun({ workflow: 'Publish to YouTube', context: { scriptId: script.id, youtubeUrl: url } })
    return url
  } catch (error) {
    if (externalVideoId) {
      await markPublicationUnknownExternalOutcome(db, claim.ledgerId, error instanceof Error ? error.message : String(error), externalVideoId)
    } else {
      await markPublicationFailed(db, claim.ledgerId, error instanceof Error ? error.message : String(error))
    }
    throw error
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isYouTubeConfigured()) {
    log('YouTube ej konfigurerat (saknar OAuth-env) — hoppar över')
    return NextResponse.json({ status: 'youtube_not_configured' })
  }

  const db = createAdminClient()

  const { searchParams } = new URL(request.url)
  const scriptIdParam = searchParams.get('scriptId')

  // ── Hämta kandidater ──────────────────────────────────────────────────────
  let query = db
    .from('media_scripts')
    .select('id, project_id, hook, cta, hashtags, video_url, youtube_video_id, media_news_items ( id, url, source_name )')
    .not('video_url', 'is', null)
    .is('youtube_video_id', null)

  if (scriptIdParam) {
    query = query.eq('id', scriptIdParam).limit(1)
  } else {
    const cutoff = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString()
    // Äldst först → en missad video åker upp före den nyaste, i kronologisk ordning.
    query = query
      .not('published_at', 'is', null)
      .gte('published_at', cutoff)
      .order('published_at', { ascending: true })
      .limit(MAX_PER_RUN)
  }

  const { data: scripts } = await query

  if (!scripts || scripts.length === 0) {
    return NextResponse.json({ status: 'nothing_to_upload', ranAt: new Date().toISOString() })
  }

  // ── Ladda upp var och en — fel på en stoppar inte de andra ────────────────
  const uploaded: { scriptId: string; youtubeUrl: string }[] = []
  const failed:   { scriptId: string; error: string }[] = []

  for (const script of scripts as ScriptRow[]) {
    if (!script.video_url) continue
    log(`Laddar upp script ${script.id} till YouTube...`)
    try {
      const url = await uploadOne(db, script)
      log(`YouTube OK: ${url}`)
      uploaded.push({ scriptId: script.id, youtubeUrl: url })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`YouTube misslyckades för ${script.id}: ${msg}`)
      failed.push({ scriptId: script.id, error: msg })
      await logRun({ workflow: 'Publish to YouTube', status: 'failed', context: { scriptId: script.id }, error: msg })
      await sendPipelineAlert({
        cronRoute: 'cron/youtube',
        step:      'youtube_upload',
        error:     msg,
        severity:  'warning',
        context:   { scriptId: script.id, note: 'IG/FB publicerades OK — endast YouTube failade' },
      })
    }
  }

  const status = failed.length === 0 ? 'uploaded' : (uploaded.length === 0 ? 'youtube_failed' : 'partial')
  return NextResponse.json(
    { status, uploadedCount: uploaded.length, failedCount: failed.length, uploaded, failed, ranAt: new Date().toISOString() },
    { status: failed.length > 0 && uploaded.length === 0 ? 500 : 200 },
  )
}
