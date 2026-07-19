/**
 * GET /api/media/cron/publish
 *
 * Phase-2 of the fully autonomous AI media engine.
 * Runs at 08:00 and 18:00 UTC — 30 min after the autonomous pipeline cron.
 *
 * Finds any scripts that:
 *   - video_status = 'ready'       (render finished)
 *   - status       = 'approved'    (kövakt — INTE published_at, se nedan)
 *   - generated_at   within FRESH_DAYS
 *
 * ── published_at-semantik ────────────────────────────────────────────────────
 * published_at = tidpunkten då scriptet först gick ut på NÅGON kanal. Den sätts
 * i samma skrivning som första lyckade kanal och skrivs aldrig om. Den är alltså
 * en redaktionell fakta, inte ett köflaggvärde: kön styrs av `status`, och om en
 * kanal lyckats medan en annan failade transient behåller scriptet status
 * 'approved' och plockas upp igen — med published_at redan satt.
 *
 * Also handles scripts still in 'rendering' state — polls Lambda once more
 * to give straggler renders a final chance before skipping them.
 *
 * ── Kanaloberoende publicering (incident 2026-07-19) ─────────────────────────
 * Varje kanal (Instagram, Facebook) har eget resultat, egen idempotens och egen
 * databasuppdatering. Ett Instagram-fel stoppar INTE Facebook. Partiell framgång
 * returneras som HTTP 207 med per-kanalstatus i stället för att hela körningen
 * kastas bort i ett generiskt 500. YouTube körs av en egen cron som inte längre
 * kräver att Instagram lyckats.
 *
 * ── Containerlivscykel ───────────────────────────────────────────────────────
 * Ett sparat instagram_creation_id återanvänds ENDAST efter att Meta bekräftat
 * att containern fortfarande är publicerbar (FINISHED/IN_PROGRESS) och att den
 * är yngre än CONTAINER_MAX_AGE_H. EXPIRED/ERROR/NOT_FOUND → containern rensas
 * och en ny skapas. PUBLISHED → Meta hann publicera trots att vårt svar gick
 * förlorat; vi återhämtar media-id:t i stället för att publicera igen.
 *
 * ── dryRun ───────────────────────────────────────────────────────────────────
 * ?dryRun=1 kör hela urvals- och beslutslogiken men anropar ALDRIG någon
 * skrivande publiceringsendpoint och rör aldrig databasen.
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAutomationPaused, handlePublishFailure } from '@/lib/media/safeguards'
import { getLambdaRenderProgress } from '@/lib/media/lambda-render'
import {
  createReelContainer,
  pollUntilReady,
  publishContainer,
  buildInstagramCaption,
  getContainerStatus,
  resolvePublishedMedia,
} from '@/lib/media/instagram'
import { postReelToFacebook } from '@/lib/media/facebook'
import { getToken } from '@/lib/media/token-store'
import { sendPipelineAlert, sendRunReport } from '@/lib/media/alert'
import { logRun } from '@/lib/media/run-log'
import { toJson } from '@/lib/supabase/json'
import { withRetry } from '@/lib/media/retry'
import { MetaApiError, errorSummary, isPermanentError, redactSecrets } from '@/lib/media/meta-errors'
import { decideContainerAction, containerAgeHours } from '@/lib/media/container-policy'

export const dynamic    = 'force-dynamic'
export const maxDuration = 120

function log(step: string, msg: string) {
  console.log(`[cron/publish/${step}] ${redactSecrets(msg)}`)
}

// ─── Per-kanalresultat ────────────────────────────────────────────────────────

type ChannelOk = {
  ok:       true
  id:       string | null
  url:      string | null
  skipped?: 'already_published' | 'not_configured' | 'dry_run'
  recovered?: boolean          // Meta hade redan publicerat — tappat svar återhämtat
  needsVerification?: boolean  // publicerad, men media-id kunde inte verifieras
}
type ChannelFail = {
  ok:        false
  error:     string
  permanent: boolean
  detail:    Record<string, unknown> | null
}
type ChannelResult = ChannelOk | ChannelFail

/** En kanal är "klar" när den lyckats eller failat permanent — inget mer att vänta på. */
function isSettled(r: ChannelResult): boolean {
  return r.ok || r.permanent
}

export async function GET(request: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === '1'

  const db = createAdminClient()

  // ── Global pauscheck ──────────────────────────────────────────────────────────
  const pauseCheck = await checkAutomationPaused(db)
  if (!pauseCheck.allowed) {
    log('safeguard', `PAUSAD — ${pauseCheck.reason}`)
    return NextResponse.json({ status: 'paused', reason: pauseCheck.reason })
  }

  if (dryRun) log('dryrun', 'DRY RUN — inga skrivande anrop, inga DB-uppdateringar')

  // ── Läs tokens från Supabase (med env-var fallback) ───────────────────────────
  // Prioritet: platform_tokens-tabellen → env-variabel
  // instagram.ts och facebook.ts läser alltid från process.env, så vi sätter
  // värdet här en gång per serverless-anrop om Supabase har ett färskare token.
  const igStored = await getToken('instagram')
  if (igStored?.source === 'supabase') {
    process.env.INSTAGRAM_ACCESS_TOKEN = igStored.accessToken
    log('token', `Instagram token läst från Supabase.`)
  }

  const fbStored = await getToken('facebook')
  if (fbStored?.source === 'supabase') {
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = fbStored.accessToken
    log('token', `Facebook token läst från Supabase.`)
  }

  // Scripts created in the last 24 hours — covers both cron windows (07:30 + 17:30 UTC)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // ── Check for stuck 'rendering' scripts and poll them one more time ───────────
  const { data: renderingScripts } = await db
    .from('media_scripts')
    .select('id, render_id, render_bucket')
    .eq('video_status', 'rendering')
    .eq('status', 'approved')
    .is('published_at', null)
    .gte('generated_at', cutoff)
    .limit(3)

  if (renderingScripts && renderingScripts.length > 0 && !dryRun) {
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

  // ── Idempotens: släpp hängda 'publishing'-hävdningar (krasch före slut) ────────
  if (!dryRun) {
    await db.from('media_scripts')
      .update({ status: 'approved' })
      .eq('status', 'publishing')
      .lt('updated_at', new Date(Date.now() - 15 * 60_000).toISOString())
  }

  // ── Färskhetspolicy: arkivera klara videor äldre än FRESH_DAYS ────────────────
  const FRESH_DAYS   = 4
  const freshCutoff  = new Date(Date.now() - FRESH_DAYS * 24 * 60 * 60 * 1000).toISOString()
  if (!dryRun) {
    const { data: archived } = await db.from('media_scripts')
      .update({ video_status: 'archived', publish_failed_reason: `Arkiverad: nyhet äldre än ${FRESH_DAYS} dagar — publiceras ej` })
      .eq('status', 'approved')
      .eq('video_status', 'ready')
      .is('published_at', null)
      .lt('generated_at', freshCutoff)
      .select('id')
    if (archived && archived.length > 0) log('freshness', `Arkiverade ${archived.length} inaktuella videor (>${FRESH_DAYS}d)`)
  }

  // ── Find ready-but-unpublished scripts (FIFO: äldsta FÄRSKA först) ─────────────
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
      instagram_creation_id,
      instagram_creation_id_at,
      instagram_media_id,
      instagram_url,
      facebook_post_id,
      facebook_url,
      published_at,
      media_news_items ( url, source_name )
    `)
    .eq('video_status', 'ready')
    // `status` är den auktoritativa kövakten, INTE published_at. Ett script som
    // publicerats på en kanal men vars andra kanal failade transient behåller
    // status 'approved' och ska plockas upp igen — trots att published_at nu är
    // satt. Lyckade kanaler skyddas av sina id-kolumner, inte av kön.
    .eq('status', 'approved')
    .gte('generated_at', freshCutoff)
    .order('generated_at', { ascending: true })
    .limit(1)

  if (!scripts || scripts.length === 0) {
    log('check', 'Nothing to publish — all clear')
    return NextResponse.json({
      status:  'nothing_to_publish',
      dryRun,
      ranAt:   new Date().toISOString(),
    })
  }

  const script = scripts[0]

  // ── Idempotens: hävda raden ATOMISKT (approved → publishing) ──────────────────
  if (!dryRun) {
    const { data: claim } = await db.from('media_scripts')
      .update({ status: 'publishing' })
      .eq('id', script.id)
      .eq('status', 'approved')
      .select('id')
      .maybeSingle()
    if (!claim) {
      log('claim', `Script ${script.id} hävdades redan av annan körning — hoppar över`)
      return NextResponse.json({ status: 'already_claimed', scriptId: script.id })
    }
  }

  log('publish', `Publishing script ${script.id}...${dryRun ? ' (dryRun)' : ''}`)

  if (!script.video_url) {
    if (!dryRun) await db.from('media_scripts').update({ status: 'approved' }).eq('id', script.id)
    return NextResponse.json({ status: 'no_video_url', scriptId: script.id, dryRun })
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

  const channelState: Record<string, unknown> = {}

  // Sätts av resolveContainer när Meta redan hunnit publicera containern.
  // Måste deklareras före första anropet till publishInstagram() (TDZ).
  let recoveredResult: ChannelOk | null = null

  // ══ KANAL 1: Instagram ═══════════════════════════════════════════════════════
  const instagram = await publishInstagram()
  channelState.instagram = { ...instagram, at: new Date().toISOString() }

  if (instagram.ok && instagram.id && !dryRun) {
    // Skriv direkt — en krasch efter den här punkten får aldrig leda till att
    // Instagram publiceras igen vid nästa körning.
    await db.from('media_scripts').update({
      instagram_media_id: instagram.id,
      instagram_url:      instagram.url,
      ...(script.published_at ? {} : { published_at: new Date().toISOString() }),
    }).eq('id', script.id)
  }

  // ══ KANAL 2: Facebook (körs OAVSETT hur Instagram gick) ══════════════════════
  const facebook = await publishFacebook()
  channelState.facebook = { ...facebook, at: new Date().toISOString() }

  if (facebook.ok && facebook.id && !dryRun) {
    await db.from('media_scripts').update({
      facebook_post_id: facebook.id,
      facebook_url:     facebook.url,
      ...(script.published_at || instagram.ok ? {} : { published_at: new Date().toISOString() }),
    }).eq('id', script.id)
  }

  // ── Sammanvägning ────────────────────────────────────────────────────────────
  const results: Record<string, ChannelResult> = { instagram, facebook }
  const anyOk       = Object.values(results).some(r => r.ok)
  const allSettled  = Object.values(results).every(isSettled)
  const hardFailure = Object.values(results).find((r): r is ChannelFail => !r.ok)

  const publishedChannels = [
    instagram.ok && !instagram.skipped ? 'Instagram' : null,
    facebook.ok  && !facebook.skipped  ? 'Facebook'  : null,
  ].filter(Boolean) as string[]
  const platforms = publishedChannels.join(' & ') || 'inga kanaler'

  if (dryRun) {
    return NextResponse.json({
      status:   'dry_run',
      scriptId: script.id,
      channels: results,
      wouldSetStatus: anyOk ? 'published' : (allSettled ? 'pending_review' : 'approved'),
      ranAt:    new Date().toISOString(),
    })
  }

  // Alla kanaler klara (lyckade eller permanent döda) → avsluta scriptet.
  // Annars: släpp tillbaka till kön så den transienta kanalen kan försöka igen —
  // lyckade kanaler är skyddade av sina id-kolumner och publiceras inte om.
  if (allSettled) {
    if (anyOk) {
      await db.from('media_scripts').update({
        status:              'published',
        publish_channel_state: toJson(channelState),
        ...(hardFailure ? { publish_failed_reason: hardFailure.error } : {}),
      }).eq('id', script.id)
      log('done', `Published on ${platforms}${hardFailure ? ' (partiellt)' : ''}`)
    } else {
      // Ingen kanal lyckades och inget är värt att försöka igen → granskning.
      const permanent = Object.values(results).every(r => r.ok || r.permanent)
      const { sentToReview, newRetryCount } = await handlePublishFailure(
        db, script.id, hardFailure?.error ?? 'okänt fel', { permanent },
      )
      await db.from('media_scripts')
        .update({ publish_channel_state: toJson(channelState) })
        .eq('id', script.id)
      log('publish', `Misslyckande ${newRetryCount} (cron-cykler)${sentToReview ? ' — SKICKAT TILL GRANSKNING' : ''}`)
    }
  } else {
    // Minst en kanal failade transient → tillbaka i kön för nästa cykel.
    const { sentToReview, newRetryCount } = await handlePublishFailure(
      db, script.id, hardFailure?.error ?? 'okänt fel', { permanent: false },
    )
    await db.from('media_scripts').update({
      publish_channel_state: toJson(channelState),
      ...(sentToReview ? {} : { status: 'approved' }),
    }).eq('id', script.id)
    log('publish', `Misslyckande ${newRetryCount} (cron-cykler)${sentToReview ? ' — SKICKAT TILL GRANSKNING' : ''}`)
  }

  // ── Alerts per felande kanal ─────────────────────────────────────────────────
  for (const [channel, r] of Object.entries(results)) {
    if (r.ok) continue
    await sendPipelineAlert({
      cronRoute: 'cron/publish',
      step:      `${channel}_publish`,
      error:     r.error,
      severity:  anyOk ? 'warning' : 'error',
      context:   {
        scriptId:  script.id,
        hook:      script.hook ?? null,
        permanent: r.permanent,
        meta:      r.detail ? JSON.stringify(r.detail) : null,
        note:      anyOk ? `Andra kanaler publicerades OK: ${platforms}` : 'Ingen kanal publicerades',
      },
    })
  }

  // ── Sammanfattnings-mail vid minst en lyckad kanal ───────────────────────────
  if (anyOk) {
    const warnings: string[] = []
    if (!instagram.ok) warnings.push(`Instagram misslyckades: ${instagram.error}`)
    if (!facebook.ok)  warnings.push(`Facebook misslyckades: ${facebook.error}`)
    if (facebook.ok && facebook.skipped === 'not_configured') warnings.push('Facebook ej konfigurerat')

    await sendRunReport({
      scriptId:     script.id,
      hook:         script.hook ?? '(ingen hook)',
      sourceName:   newsItem?.source_name ?? null,
      sourceUrl:    newsItem?.url ?? null,
      platforms,
      instagramUrl: instagram.ok ? instagram.url : null,
      facebookUrl:  facebook.ok  ? facebook.url  : null,
      warnings,
    })

    await logRun({
      workflow: 'Publish to Social',
      context: { scriptId: script.id, platforms, permalink: instagram.ok ? instagram.url : null },
    })
  } else {
    await logRun({
      workflow: 'Publish to Social',
      status:   'failed',
      context:  { scriptId: script.id, channels: results },
      error:    hardFailure?.error ?? 'okänt fel',
    })
  }

  // 200 = allt lyckades · 207 = partiell framgång · 500 = ingen kanal lyckades
  const httpStatus = anyOk ? (hardFailure ? 207 : 200) : 500
  return NextResponse.json({
    status:    anyOk ? (hardFailure ? 'partial' : 'published') : 'failed',
    scriptId:  script.id,
    platforms,
    channels:  results,
    ranAt:     new Date().toISOString(),
  }, { status: httpStatus })

  // ───────────────────────────────────────────────────────────────────────────
  // Kanalimplementationer
  // ───────────────────────────────────────────────────────────────────────────

  async function publishInstagram(): Promise<ChannelResult> {
    // Idempotens: redan publicerad → rör aldrig Meta igen.
    if (script.instagram_media_id) {
      log('instagram', `Redan publicerad (${script.instagram_media_id}) — hoppar över`)
      return { ok: true, id: script.instagram_media_id as string, url: (script.instagram_url as string) ?? null, skipped: 'already_published' }
    }

    try {
      const creationId = await resolveContainer()
      if (creationId === null && recoveredResult) {
        // Containern var redan publicerad hos Meta — resultatet är satt av resolveContainer
        return recoveredResult
      }
      if (creationId === null) {
        throw new Error('Kunde inte resolva Instagram-container')
      }

      if (dryRun) {
        log('instagram', `dryRun — skulle publicerat container ${creationId}`)
        return { ok: true, id: null, url: null, skipped: 'dry_run' }
      }

      await pollUntilReady(creationId, 90_000)

      // Faktiska, bundna retries med backoff — transienta fel försöks om DIREKT
      // i samma körning i stället för att vänta 10 timmar på nästa cron.
      const result = await withRetry(() => publishContainer(creationId), {
        attempts:    3,
        baseMs:      1_500,
        label:       'instagram media_publish',
        isPermanent: isPermanentError,
      })

      log('instagram', `Instagram OK: ${result.permalink}`)
      return { ok: true, id: result.mediaId, url: result.permalink ?? null }

    } catch (err) {
      const summary   = errorSummary(err)
      const permanent = isPermanentError(err)
      log('instagram', `Instagram failed (${permanent ? 'permanent' : 'transient'}): ${summary}`)
      return {
        ok: false,
        error: summary,
        permanent,
        detail: err instanceof MetaApiError ? err.toLogObject() : null,
      }
    }
  }

  /**
   * Returnerar ett publicerbart creation_id, eller null om containern redan var
   * publicerad (då är `recoveredResult` satt).
   */
  async function resolveContainer(): Promise<string | null> {
    const existing  = script.instagram_creation_id as string | null | undefined
    const createdAt = script.instagram_creation_id_at as string | null | undefined

    if (!existing) return await createFreshContainer()

    // Statusen läses ALLTID, även för en container med okänd eller hög ålder.
    // Att hoppa över statusläsningen och gå direkt på ålder vore en väg till
    // dubbelpublicering: en container som Meta redan publicerat, men vars svar
    // vi tappat, hade då fått en ny container och publicerats en gång till.
    const status = await getContainerStatus(existing)
    const ageH   = containerAgeHours(createdAt)
    const decision = decideContainerAction(status, ageH)

    log('instagram', `Container ${existing}: status=${status}, ålder=${
      Number.isFinite(ageH) ? `${ageH.toFixed(1)}h` : 'okänd'
    } → ${decision.action}`)

    if (decision.action === 'reuse') return existing

    if (decision.action === 'recover') {
      // Meta publicerade — vårt svar gick förlorat i en tidigare körning.
      // Vi publicerar ALDRIG om. Media-id skrivs bara om det kan resolvas
      // deterministiskt; annars flaggas kanalen för manuell verifiering hellre
      // än att ett felaktigt id skrivs in i instagram_media_id.
      const recovered = await resolvePublishedMedia(existing)
      if (recovered?.permalink) {
        log('instagram', `Container ${existing} var redan PUBLISHED — media återhämtat`)
        recoveredResult = { ok: true, id: recovered.mediaId, url: recovered.permalink, recovered: true }
      } else {
        log('instagram', `Container ${existing} var redan PUBLISHED men media-id kunde inte verifieras — kräver manuell kontroll`)
        recoveredResult = { ok: true, id: null, url: null, recovered: true, needsVerification: true }
      }
      return null
    }

    log('instagram', `Skapar ny container — ${decision.reason}`)
    return await createFreshContainer()
  }

  async function createFreshContainer(): Promise<string> {
    if (dryRun) {
      log('instagram', 'dryRun — skulle skapat ny container')
      return 'dry-run-container'
    }
    const creationId = await withRetry(() => createReelContainer(script.video_url!, caption), {
      attempts:    3,
      baseMs:      1_500,
      label:       'instagram media_create',
      isPermanent: isPermanentError,
    })
    await db.from('media_scripts')
      .update({
        instagram_creation_id:    creationId,
        instagram_creation_id_at: new Date().toISOString(),
      })
      .eq('id', script.id)
    log('instagram', `Container created: ${creationId}`)
    return creationId
  }

  async function publishFacebook(): Promise<ChannelResult> {
    if (script.facebook_post_id) {
      log('facebook', `Redan publicerad (${script.facebook_post_id}) — hoppar över`)
      return { ok: true, id: script.facebook_post_id as string, url: (script.facebook_url as string) ?? null, skipped: 'already_published' }
    }

    if (!(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID)) {
      log('facebook', 'Facebook ej konfigurerat — hoppar över')
      return { ok: true, id: null, url: null, skipped: 'not_configured' }
    }

    if (dryRun) {
      log('facebook', 'dryRun — skulle publicerat till Facebook')
      return { ok: true, id: null, url: null, skipped: 'dry_run' }
    }

    try {
      const result = await withRetry(() => postReelToFacebook(script.video_url!, caption), {
        attempts:    3,
        baseMs:      1_500,
        label:       'facebook reel',
        isPermanent: isPermanentError,
      })
      log('facebook', `Facebook OK: ${result.url}`)
      return { ok: true, id: result.postId, url: result.url ?? null }
    } catch (err) {
      const summary   = errorSummary(err)
      const permanent = isPermanentError(err)
      log('facebook', `Facebook failed (${permanent ? 'permanent' : 'transient'}): ${summary}`)
      return {
        ok: false,
        error: summary,
        permanent,
        detail: err instanceof MetaApiError ? err.toLogObject() : null,
      }
    }
  }
}
