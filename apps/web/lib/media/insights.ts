/**
 * lib/media/insights.ts
 *
 * Instagram-engagemang: hämtar per-inlägg-insights (räckvidd, gillningar,
 * kommentarer, sparningar, delningar, interaktioner) via Graph API och cachar
 * dem i media_insights.
 *
 * Kräver att Instagram-tokenet har behörigheten `instagram_manage_insights`.
 * Saknas den misslyckas Graph-anropet — vi sväljer felet tyst och lämnar
 * tabellen tom (ärligt) istället för att hitta på siffror.
 *
 * CREDENTIALS (project-scoped social credentials, 2026-09-14): varje projekt mäts med
 * SIN verifierade credential (lib/media/social-credentials.ts). Ett projekt utan
 * verifierad bindning mäts inte på den plattformen — aldrig med ett annat projekts
 * credential. Credentials skickas som Authorization-header, aldrig i URL:en.
 *
 * BOUNDED RUN (insights recovery, 2026-09-15). The daily refresh used to fetch every
 * post one at a time inside a 60 s function. Vercel stopped it at 60 s before Facebook
 * finished — on every observed day, and since mid-June at the latest — so YouTube
 * insights and the opportunity pass never ran, and nothing said so. A run now has a
 * fixed, bounded shape:
 *   · projects come from their active account bindings, each measured with its own
 *     verified credential;
 *   · at most INSIGHTS_LIMIT posts per platform per project (YouTube: across projects),
 *     newest first — as before;
 *   · at most INSIGHTS_CONCURRENCY posts in flight per section;
 *   · no credential resolution or post starts at or after the caller's deadline, and
 *     every provider request times out after INSIGHTS_REQUEST_TIMEOUT_MS;
 *   · the summary is `complete` only when every selected post was fetched and written,
 *     and each section says how far it got.
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { listActiveBindings } from './social-bindings'
import { createCredentialResolver, type CredentialRefusal } from './social-credentials'
import { fetchVideoRetention } from './youtube'

/** Posts refreshed per platform per project (YouTube: across projects), newest first. */
export const INSIGHTS_LIMIT = 80
/** Posts fetched in parallel within one section. */
export const INSIGHTS_CONCURRENCY = 4
/** Timeout of every provider request this module makes. */
export const INSIGHTS_REQUEST_TIMEOUT_MS = 12_000
/**
 * The most provider requests one post can wait on: Facebook's video node, two post
 * metrics and shares; YouTube's statistics, the first video's credential exchange and
 * channel check, and retention; Instagram's two hosts.
 */
export const INSIGHTS_MAX_CALLS_PER_POST = 4
/** The daily route starts no post after this much of its run. */
export const INSIGHTS_WORK_BUDGET_MS = 200_000
/** The daily route skips the opportunity pass once this much of its run has gone. */
export const INSIGHTS_OPPORTUNITIES_BUDGET_MS = 240_000

// Stödjer både nya Instagram API with Instagram Login (graph.instagram.com,
// token börjar på "IGAA") och klassiska Instagram Graph API (graph.facebook.com,
// token börjar på "EAA"). Vi väljer rätt värd efter token-prefix och testar
// den andra som fallback.
const IG_HOST = 'https://graph.instagram.com/v22.0'
const FB_HOST = 'https://graph.facebook.com/v21.0'

function hostsForToken(token: string): string[] {
  return token.startsWith('IGAA') ? [IG_HOST, FB_HOST] : [FB_HOST, IG_HOST]
}

// Reels stöder dessa mått. Vi begär en bred uppsättning och tål att vissa saknas.
const METRICS = 'reach,likes,comments,saved,shares,total_interactions,views'

export interface MediaInsight {
  reach?: number
  views?: number
  impressions?: number
  likes?: number
  comments?: number
  saved?: number
  shares?: number
  total_interactions?: number
}

export interface InsightFetchResult {
  ok: boolean
  metrics?: MediaInsight
  error?: string
  /** Rått API-svar — används vid felsökning/probning av nya plattformar (t.ex. FB). */
  raw?: unknown
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

/** Hämtar insights för ett enskilt IG-media. Returnerar ok:false vid fel (t.ex. saknad behörighet). */
export async function fetchMediaInsights(mediaId: string, token: string): Promise<InsightFetchResult> {
  let lastError = 'okänt fel'
  for (const host of hostsForToken(token)) {
    try {
      const res = await fetch(
        `${host}/${mediaId}/insights?metric=${METRICS}`,
        { headers: bearer(token), signal: AbortSignal.timeout(INSIGHTS_REQUEST_TIMEOUT_MS) },
      )
      const json = await res.json() as { data?: { name: string; values?: { value: number }[] }[]; error?: { message: string } }

      if (!res.ok || json.error) {
        lastError = json.error?.message ?? `Graph API ${res.status}`
        continue   // testa nästa värd
      }

      const metrics: MediaInsight = {}
      for (const m of json.data ?? []) {
        const value = m.values?.[0]?.value ?? 0
        if (m.name in metricKeyMap) metrics[metricKeyMap[m.name]] = value
      }
      return { ok: true, metrics }
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'okänt fel'
    }
  }
  return { ok: false, error: lastError }
}

const metricKeyMap: Record<string, keyof MediaInsight> = {
  reach: 'reach',
  views: 'views',
  likes: 'likes',
  comments: 'comments',
  saved: 'saved',
  shares: 'shares',
  total_interactions: 'total_interactions',
}

const YT_HOST = 'https://www.googleapis.com/youtube/v3'

/**
 * Hämtar per-video-statistik från YouTube Data API v3 med API-nyckel (publik data,
 * ingen OAuth). viewCount → views, likeCount → likes, commentCount → comments.
 * YouTube exponerar inte räckvidd/sparningar publikt → de lämnas null (aldrig påhittat).
 */
export async function fetchYouTubeInsights(videoId: string, apiKey: string): Promise<InsightFetchResult> {
  try {
    const res = await fetch(
      `${YT_HOST}/videos?part=statistics&id=${videoId}&key=${apiKey}`,
      { signal: AbortSignal.timeout(INSIGHTS_REQUEST_TIMEOUT_MS), cache: 'no-store' },
    )
    const json = await res.json() as {
      items?: { statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[]
      error?: { message?: string }
    }
    if (!res.ok || json.error) return { ok: false, error: json.error?.message ?? `YouTube API ${res.status}` }
    const stats = json.items?.[0]?.statistics
    if (!stats) return { ok: false, error: 'Ingen video hittades (privat/raderad?)' }
    const views    = Number(stats.viewCount ?? 0) || 0
    const likes    = Number(stats.likeCount ?? 0) || 0
    const comments = Number(stats.commentCount ?? 0) || 0
    return {
      ok: true,
      metrics: { views, likes, comments, total_interactions: likes + comments },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'okänt fel' }
  }
}

const FB_GRAPH = 'https://graph.facebook.com/v21.0'

/**
 * Hämtar per-inlägg-statistik för en Facebook-video (page-post).
 * FB:s video-API är kläddigt → defensivt: vi tar det som finns och degraderar resten
 * till null. `facebookPostId` är video-id:t som /{pageId}/videos returnerade.
 *
 * Steg 1: video-noden → views, likes, comments, ev. post_id.
 * Steg 2 (om post_id finns): post-noden → shares + räckvidd (post_impressions_unique).
 * Returnerar även `raw` för probning av faktisk fältform.
 */
export async function fetchFacebookInsights(facebookPostId: string, pageToken: string, pageId?: string | null): Promise<InsightFetchResult> {
  try {
    // Steg 1 — video-noden.
    const vRes = await fetch(
      `${FB_GRAPH}/${facebookPostId}?fields=views,likes.summary(true),comments.summary(true),post_id`,
      { headers: bearer(pageToken), signal: AbortSignal.timeout(INSIGHTS_REQUEST_TIMEOUT_MS), cache: 'no-store' },
    )
    const v = await vRes.json() as {
      views?: number
      likes?: { summary?: { total_count?: number } }
      comments?: { summary?: { total_count?: number } }
      post_id?: string
      error?: { message?: string }
    }
    if (!vRes.ok || v.error) return { ok: false, error: v.error?.message ?? `FB video ${vRes.status}`, raw: v }

    const metrics: MediaInsight = {
      views:    typeof v.views === 'number' ? v.views : undefined,
      likes:    v.likes?.summary?.total_count,
      comments: v.comments?.summary?.total_count,
    }

    // Steg 2 — räckvidd/impressions/shares på POST-nivå (Reels exponerar inte
    // video_insights; rätt källa är post_impressions* via post_id). read_insights krävs.
    if (v.post_id) {
      // FB post-insights kräver det FULLA page-post-id:t: {sid-id}_{post-id}.
      // Video-noden ger ofta bara den numeriska delen → prefixa, annars #12-fel.
      const fullPostId = v.post_id.includes('_') || !pageId ? v.post_id : `${pageId}_${v.post_id}`

      // Hämta EN metrik isolerat (FB felar på HELA anropet vid en ogiltig metrik).
      const metricVal = async (metric: string): Promise<{ value: number | null; error?: string }> => {
        try {
          const r = await fetch(
            `${FB_GRAPH}/${fullPostId}/insights?metric=${metric}`,
            { headers: bearer(pageToken), signal: AbortSignal.timeout(INSIGHTS_REQUEST_TIMEOUT_MS), cache: 'no-store' },
          )
          const j = await r.json() as { data?: { values?: { value?: number }[] }[]; error?: { message?: string } }
          if (j?.error) return { value: null, error: j.error.message }
          const val = j.data?.[0]?.values?.[0]?.value
          return { value: typeof val === 'number' ? val : null }
        } catch (e) { return { value: null, error: e instanceof Error ? e.message : 'okänt' } }
      }

      // Isolerade metrik-anrop — FB felar på HELA anropet om en ogiltig/deprecerad
      // metrik blandas in (därför kraschade tidigare 'post_impressions_unique,post_impressions').
      // Giltiga metriker verifierade via discovery-prob 2026-06-05.
      const mv = await metricVal('post_media_view')          // Media Views (Metas nya standard, ersätter impressions)
      if (mv.value !== null) metrics.impressions = mv.value
      const ru = await metricVal('post_impressions_unique')  // unik räckvidd. OBS: Meta deprecerar 2026-06-15 → degraderar då till null
      if (ru.value !== null) metrics.reach = ru.value

      // shares via post-noden (rent fält, ingen insights-expansion).
      try {
        const r = await fetch(
          `${FB_GRAPH}/${fullPostId}?fields=shares`,
          { headers: bearer(pageToken), signal: AbortSignal.timeout(INSIGHTS_REQUEST_TIMEOUT_MS), cache: 'no-store' },
        )
        const j = await r.json() as { shares?: { count?: number }; error?: unknown }
        if (!j?.error && typeof j.shares?.count === 'number') metrics.shares = j.shares.count
      } catch { /* degradera */ }
    }

    const interactions = (metrics.likes ?? 0) + (metrics.comments ?? 0) + (metrics.shares ?? 0)
    metrics.total_interactions = interactions

    return { ok: true, metrics }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'okänt fel' }
  }
}

export type InsightPlatform = 'instagram' | 'facebook' | 'youtube'

export type InsightSectionStatus =
  /** Every selected post was fetched and written. */
  | 'complete'
  /** Every selected post was attempted, but some could not be fetched or written. */
  | 'partial'
  /** The project has no binding on the platform: there is nothing to measure. */
  | 'not_bound'
  /** YouTube without YOUTUBE_API_KEY — degrades quietly, as it always has. */
  | 'not_configured'
  /** Bound, but the project's credential could not be verified. */
  | 'credential_refused'
  /** The posts to measure could not be read. */
  | 'read_failed'
  /** The deadline came before every selected post was attempted. */
  | 'time_budget_exhausted'

export interface InsightSection {
  platform: InsightPlatform
  /** The measured project; null for the cross-project YouTube section. */
  projectId: string | null
  status: InsightSectionStatus
  refusal?: CredentialRefusal
  /** Posts selected for the section; null when the section ended before reading them. */
  planned: number | null
  attempted: number
  /** Posts whose insights were fetched and written. */
  written: number
  skipped: number
}

/** Section outcomes that leave nothing undone. */
export const INSIGHTS_DONE_STATUSES: ReadonlySet<InsightSectionStatus> = new Set(['complete', 'not_bound', 'not_configured'])

export interface RefreshSummary {
  updated: number
  failed: number
  firstError?: string
  byPlatform: Record<string, { updated: number; failed: number }>
  /** True only when every planned section wrote every selected post. A partial run is never reported complete. */
  complete: boolean
  /** The active bindings could not be read, so no project was measured on Instagram or Facebook. */
  bindingsUnreadable: boolean
  sections: InsightSection[]
}

export interface RefreshOptions {
  limit?: number
  concurrency?: number
  /** Epoch ms. No credential resolution or post starts at or after it. */
  deadlineAt?: number
  now?: () => number
}

/**
 * Runs `work` over `items` with at most `concurrency` in flight, starting nothing once
 * `expired()`. `work` resolves true when the item was written.
 */
async function eachBounded<T>(
  items: readonly T[],
  concurrency: number,
  expired: () => boolean,
  work: (item: T) => Promise<boolean>,
): Promise<{ attempted: number; written: number; skipped: number }> {
  let next = 0
  let attempted = 0
  let written = 0
  const lane = async () => {
    while (next < items.length && !expired()) {
      const item = items[next++]
      attempted++
      if (await work(item)) written++
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, lane))
  return { attempted, written, skipped: items.length - attempted }
}

/**
 * Uppdaterar per-inlägg-insights för publicerade inlägg, per plattform:
 *   • Instagram och Facebook per projekt med aktiv bindning, med projektets verifierade credential.
 *   • YouTube via Data API v3 (YOUTUBE_API_KEY, publik data) — degraderar tyst om
 *     nyckel saknas; genomtittning endast via videons eget projekts YouTube-credential.
 * Upsertar på (script_id, platform) så varje plattform får en egen rad per video.
 */
export async function refreshAllInsights(options: RefreshOptions = {}): Promise<RefreshSummary> {
  const limit = options.limit ?? INSIGHTS_LIMIT
  const concurrency = Math.max(1, options.concurrency ?? INSIGHTS_CONCURRENCY)
  const now = options.now ?? Date.now
  const expired = () => options.deadlineAt !== undefined && now() >= options.deadlineAt

  const db = createAdminClient()
  const byPlatform: Record<string, { updated: number; failed: number }> = {}
  const sections: InsightSection[] = []
  let updated = 0, failed = 0, firstError: string | undefined

  /** Counts one post's outcome and returns whether it was written. */
  const bump = (platform: InsightPlatform, ok: boolean, error?: string): boolean => {
    byPlatform[platform] ??= { updated: 0, failed: 0 }
    if (ok) { byPlatform[platform].updated++; updated++; return true }
    byPlatform[platform].failed++
    failed++
    if (!firstError) firstError = error ?? 'okänt fel'
    return false
  }
  const ended = (platform: InsightPlatform, projectId: string | null, status: InsightSectionStatus, extra: Partial<InsightSection> = {}) => {
    sections.push({ platform, projectId, status, planned: null, attempted: 0, written: 0, skipped: 0, ...extra })
  }
  const settle = (platform: InsightPlatform, projectId: string | null, planned: number, run: { attempted: number; written: number; skipped: number }) => {
    const status: InsightSectionStatus = run.skipped > 0 ? 'time_budget_exhausted' : run.written < planned ? 'partial' : 'complete'
    sections.push({ platform, projectId, status, planned, ...run })
  }
  const refused = (platform: InsightPlatform, projectId: string, refusal: CredentialRefusal) => {
    if (refusal === 'binding_missing') ended(platform, projectId, 'not_bound', { planned: 0 })
    else ended(platform, projectId, 'credential_refused', { refusal })
  }

  // Vem mäts var: ett projekt, på en plattform där det har en aktiv bindning, med sitt
  // eget verifierade konto. Aldrig ett annat projekts credential, aldrig ett standardprojekt.
  const bindings = await listActiveBindings(undefined, db)
  const bindingsUnreadable = !bindings.ok
  const boundOn = { instagram: new Set<string>(), facebook: new Set<string>() }
  if (bindings.ok) {
    for (const b of bindings.bindings) {
      if (b.platform === 'instagram' || b.platform === 'facebook') boundOn[b.platform].add(b.projectId)
    }
  }
  const projectIds = [...new Set([...boundOn.instagram, ...boundOn.facebook])]
  const credentials = createCredentialResolver()

  for (const projectId of projectIds) {
    // ─── Instagram (projektets verifierade credential) ────────────────────────
    if (!boundOn.instagram.has(projectId)) ended('instagram', projectId, 'not_bound', { planned: 0 })
    else if (expired()) ended('instagram', projectId, 'time_budget_exhausted')
    else {
      const ig = await credentials.instagram(projectId)
      if (!ig.ok) refused('instagram', projectId, ig.refusal)
      else {
        const token = ig.credential.token
        const { data: scripts, error: readError } = await (db.from('media_scripts') as any)
          .select('id, project_id, instagram_media_id, published_at')
          .eq('status', 'published').eq('project_id', projectId)
          .not('instagram_media_id', 'is', null)
          .order('published_at', { ascending: false })
          .limit(limit)
        if (readError || !Array.isArray(scripts)) ended('instagram', projectId, 'read_failed')
        else {
          const run = await eachBounded(scripts as any[], concurrency, expired, async (s) => {
            try {
              const result = await fetchMediaInsights(s.instagram_media_id, token)
              if (!result.ok || !result.metrics) return bump('instagram', false, result.error)
              const m = result.metrics
              const { error } = await (db.from('media_insights') as any).upsert({
                script_id: s.id,
                project_id: s.project_id,
                platform: 'instagram',
                instagram_media_id: s.instagram_media_id,
                reach: m.reach ?? null,
                views: m.views ?? null,
                likes: m.likes ?? null,
                comments: m.comments ?? null,
                saved: m.saved ?? null,
                shares: m.shares ?? null,
                total_interactions: m.total_interactions ?? null,
                published_at: s.published_at,
                fetched_at: new Date().toISOString(),
              }, { onConflict: 'script_id,platform' })
              return bump('instagram', !error, error?.message)
            } catch (e) {
              return bump('instagram', false, e instanceof Error ? e.message : 'okänt fel')
            }
          })
          settle('instagram', projectId, scripts.length, run)
        }
      }
    }

    // ─── Facebook (projektets verifierade sida) ───────────────────────────────
    if (!boundOn.facebook.has(projectId)) ended('facebook', projectId, 'not_bound', { planned: 0 })
    else if (expired()) ended('facebook', projectId, 'time_budget_exhausted')
    else {
      const fb = await credentials.facebook(projectId)
      if (!fb.ok) refused('facebook', projectId, fb.refusal)
      else {
        const { pageToken, pageId } = fb.credential
        const { data: fbScripts, error: readError } = await (db.from('media_scripts') as any)
          .select('id, project_id, facebook_post_id, published_at')
          .eq('status', 'published').eq('project_id', projectId)
          .not('facebook_post_id', 'is', null)
          .order('published_at', { ascending: false })
          .limit(limit)
        if (readError || !Array.isArray(fbScripts)) ended('facebook', projectId, 'read_failed')
        else {
          const run = await eachBounded(fbScripts as any[], concurrency, expired, async (s) => {
            try {
              const result = await fetchFacebookInsights(s.facebook_post_id, pageToken, pageId)
              if (!result.ok || !result.metrics) return bump('facebook', false, result.error)
              const m = result.metrics
              const { error } = await (db.from('media_insights') as any).upsert({
                script_id: s.id,
                project_id: s.project_id,
                platform: 'facebook',
                facebook_post_id: s.facebook_post_id,
                reach: m.reach ?? null,
                impressions: m.impressions ?? null,
                views: m.views ?? null,
                likes: m.likes ?? null,
                comments: m.comments ?? null,
                saved: null,
                shares: m.shares ?? null,
                total_interactions: m.total_interactions ?? null,
                published_at: s.published_at,
                fetched_at: new Date().toISOString(),
              }, { onConflict: 'script_id,platform' })
              return bump('facebook', !error, error?.message)
            } catch (e) {
              return bump('facebook', false, e instanceof Error ? e.message : 'okänt fel')
            }
          })
          settle('facebook', projectId, fbScripts.length, run)
        }
      }
    }
  }

  // ─── YouTube — publik statistik med API-nyckel; genomtittning per projekt ────
  const ytKey = process.env.YOUTUBE_API_KEY
  if (!ytKey) ended('youtube', null, 'not_configured', { planned: 0 })
  else if (expired()) ended('youtube', null, 'time_budget_exhausted')
  else {
    const { data: ytScripts, error: readError } = await (db.from('media_scripts') as any)
      .select('id, project_id, youtube_video_id, published_at')
      .eq('status', 'published')
      .not('youtube_video_id', 'is', null)
      .order('published_at', { ascending: false })
      .limit(limit)
    if (readError || !Array.isArray(ytScripts)) ended('youtube', null, 'read_failed')
    else {
      const run = await eachBounded(ytScripts as any[], concurrency, expired, async (s) => {
        try {
          const result = await fetchYouTubeInsights(s.youtube_video_id, ytKey)
          if (!result.ok || !result.metrics) return bump('youtube', false, result.error)
          const m = result.metrics
          // Genomtittning kräver en kanal-credential: bara videons EGET projekts, via dess bindning.
          const yt = await credentials.youtube(s.project_id)
          const retention = yt.ok ? await fetchVideoRetention(yt.credential, s.youtube_video_id) : null
          const { error } = await (db.from('media_insights') as any).upsert({
            script_id: s.id,
            project_id: s.project_id,
            platform: 'youtube',
            youtube_video_id: s.youtube_video_id,
            reach: null,           // YouTube exponerar inte räckvidd publikt
            views: m.views ?? null,
            likes: m.likes ?? null,
            comments: m.comments ?? null,
            saved: null,
            shares: null,
            total_interactions: m.total_interactions ?? null,
            avg_view_pct: retention,
            published_at: s.published_at,
            fetched_at: new Date().toISOString(),
          }, { onConflict: 'script_id,platform' })
          return bump('youtube', !error, error?.message)
        } catch (e) {
          return bump('youtube', false, e instanceof Error ? e.message : 'okänt fel')
        }
      })
      settle('youtube', null, ytScripts.length, run)
    }
  }

  return {
    updated,
    failed,
    firstError,
    byPlatform,
    complete: !bindingsUnreadable && sections.every(s => INSIGHTS_DONE_STATUSES.has(s.status)),
    bindingsUnreadable,
    sections,
  }
}
