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
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getToken } from './token-store'

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
}

/** Hämtar insights för ett enskilt IG-media. Returnerar ok:false vid fel (t.ex. saknad behörighet). */
export async function fetchMediaInsights(mediaId: string, token: string): Promise<InsightFetchResult> {
  let lastError = 'okänt fel'
  for (const host of hostsForToken(token)) {
    try {
      const res = await fetch(
        `${host}/${mediaId}/insights?metric=${METRICS}&access_token=${token}`,
        { signal: AbortSignal.timeout(12_000) },
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
      { signal: AbortSignal.timeout(12_000), cache: 'no-store' },
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

export interface RefreshSummary {
  updated: number
  failed: number
  firstError?: string
  byPlatform: Record<string, { updated: number; failed: number }>
}

/**
 * Uppdaterar per-inlägg-insights för alla publicerade inlägg, per plattform:
 *   • Instagram via Graph API (token).
 *   • YouTube via Data API v3 (YOUTUBE_API_KEY, publik data) — degraderar tyst om nyckel saknas.
 * Upsertar på (script_id, platform) så varje plattform får en egen rad per video.
 */
export async function refreshAllInsights(limit = 80): Promise<RefreshSummary> {
  const db = createAdminClient()
  const byPlatform: Record<string, { updated: number; failed: number }> = {}
  let updated = 0, failed = 0, firstError: string | undefined

  const bump = (platform: string, ok: boolean) => {
    byPlatform[platform] ??= { updated: 0, failed: 0 }
    if (ok) { byPlatform[platform].updated++; updated++ }
    else    { byPlatform[platform].failed++;  failed++ }
  }

  // ─── Instagram ──────────────────────────────────────────────────────────────
  const ig = await getToken('instagram')
  if (ig) {
    const { data: scripts } = await (db.from('media_scripts') as any)
      .select('id, project_id, instagram_media_id, published_at')
      .eq('status', 'published')
      .not('instagram_media_id', 'is', null)
      .order('published_at', { ascending: false })
      .limit(limit)

    for (const s of (scripts ?? []) as any[]) {
      const result = await fetchMediaInsights(s.instagram_media_id, ig.accessToken)
      if (!result.ok || !result.metrics) { if (!firstError) firstError = result.error; bump('instagram', false); continue }
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
      if (error) { if (!firstError) firstError = error.message; bump('instagram', false) }
      else bump('instagram', true)
    }
  } else if (!firstError) {
    firstError = 'Inget Instagram-token'
  }

  // ─── YouTube ────────────────────────────────────────────────────────────────
  const ytKey = process.env.YOUTUBE_API_KEY
  if (ytKey) {
    const { data: ytScripts } = await (db.from('media_scripts') as any)
      .select('id, project_id, youtube_video_id, published_at')
      .eq('status', 'published')
      .not('youtube_video_id', 'is', null)
      .order('published_at', { ascending: false })
      .limit(limit)

    for (const s of (ytScripts ?? []) as any[]) {
      const result = await fetchYouTubeInsights(s.youtube_video_id, ytKey)
      if (!result.ok || !result.metrics) { if (!firstError) firstError = result.error; bump('youtube', false); continue }
      const m = result.metrics
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
        published_at: s.published_at,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'script_id,platform' })
      if (error) { if (!firstError) firstError = error.message; bump('youtube', false) }
      else bump('youtube', true)
    }
  }

  return { updated, failed, firstError, byPlatform }
}
