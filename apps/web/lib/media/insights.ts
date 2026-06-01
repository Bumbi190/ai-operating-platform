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

// Stödjer både klassiska Instagram Graph API (graph.facebook.com) och nya
// Instagram API with Instagram Login (graph.instagram.com). Vi testar båda.
const HOSTS = ['https://graph.facebook.com/v21.0', 'https://graph.instagram.com/v21.0']

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
  for (const host of HOSTS) {
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

/**
 * Uppdaterar insights för alla publicerade IG-inlägg.
 * Returnerar en sammanfattning: hur många som uppdaterades och ev. första felet.
 */
export async function refreshAllInsights(limit = 80): Promise<{ updated: number; failed: number; firstError?: string }> {
  const db = createAdminClient()
  const stored = await getToken('instagram')
  if (!stored) return { updated: 0, failed: 0, firstError: 'Inget Instagram-token' }

  const { data: scripts } = await (db.from('media_scripts') as any)
    .select('id, project_id, instagram_media_id, published_at')
    .eq('status', 'published')
    .not('instagram_media_id', 'is', null)
    .order('published_at', { ascending: false })
    .limit(limit)

  let updated = 0, failed = 0, firstError: string | undefined

  for (const s of (scripts ?? []) as any[]) {
    const result = await fetchMediaInsights(s.instagram_media_id, stored.accessToken)
    if (!result.ok || !result.metrics) {
      failed++
      if (!firstError) firstError = result.error
      continue
    }
    const m = result.metrics
    const { error } = await (db.from('media_insights') as any).upsert({
      script_id: s.id,
      project_id: s.project_id,
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
    }, { onConflict: 'instagram_media_id' })
    if (error) { failed++; if (!firstError) firstError = error.message }
    else updated++
  }

  return { updated, failed, firstError }
}
