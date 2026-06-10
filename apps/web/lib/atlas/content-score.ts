/**
 * lib/atlas/content-score.ts — Content Score (Fas 4, Feature 3).
 *
 * Ger varje publicerat inlägg en RELATIV poäng 0-100 inom projektets senaste
 * inlägg, utifrån befintliga media_insights (reach, likes, comments, saves,
 * shares). Rankar bästa/sämsta och aggregerar per ämne.
 *
 * Viktigt (ärlighet): poängen är RELATIV inom urvalet, inte ett absolut betyg.
 * sampleSize + confidence följer alltid med så Atlas aldrig påstår mer än datan
 * bär. Vid <2 inlägg blir poängen neutral (50) och confidence 'low'.
 *
 * Läser befintliga tabeller (media_insights + media_scripts). Read-only, deterministisk.
 */

import { applyProjectScope } from './isolation'

type AnyDb = any

export interface ScoredPost {
  scriptId: string | null
  hook: string | null
  topic: string | null
  publishedAt: string | null
  reach: number; likes: number; comments: number; saved: number; shares: number; views: number
  engagementRate: number
  score: number
}

export interface TopicScore { topic: string; posts: number; avgScore: number; avgEngagementRate: number }

export interface ContentScoreResult {
  hasData: boolean
  sampleSize: number
  confidence: 'low' | 'medium' | 'high'
  posts: ScoredPost[]
  best: ScoredPost | null
  worst: ScoredPost | null
  byTopic: TopicScore[]
}

const n = (v: unknown) => Number(v ?? 0) || 0
const round1 = (x: number) => Math.round(x * 10) / 10

function confidenceFor(size: number): 'low' | 'medium' | 'high' {
  if (size >= 20) return 'high'
  if (size >= 8) return 'medium'
  return 'low'
}

export async function contentScore(db: AnyDb, projectId?: string, allowedProjectIds?: string[], days = 90): Promise<ContentScoreResult> {
  const since = new Date(Date.now() - days * 864e5).toISOString()

  let rows: any[] = []
  try {
    let q = applyProjectScope(db.from('media_insights')
      .select('script_id, platform, reach, likes, comments, saved, shares, views, published_at, media_scripts ( hook, topic )')
      .gte('published_at', since), allowedProjectIds)
    if (projectId) q = q.eq('project_id', projectId)
    const { data } = await q
    rows = data ?? []
  } catch { rows = [] }

  const empty: ContentScoreResult = {
    hasData: false, sampleSize: 0, confidence: 'low', posts: [], best: null, worst: null, byTopic: [],
  }
  if (rows.length === 0) return empty

  // Aggregera per VIDEO (script_id) — annars räknas samma video en gång per plattform
  // (IG+FB+YouTube) och skevar poängen. Summera måtten över plattformarna.
  const byScript = new Map<string, any>()
  for (const r of rows) {
    const script = Array.isArray(r.media_scripts) ? r.media_scripts[0] : r.media_scripts
    const key = r.script_id ?? `noscript:${r.published_at}`
    const acc = byScript.get(key) ?? {
      scriptId: r.script_id ?? null,
      hook: script?.hook ?? null,
      topic: script?.topic ?? 'other',
      publishedAt: r.published_at ?? null,
      reach: 0, likes: 0, comments: 0, saved: 0, shares: 0, views: 0,
    }
    acc.reach += n(r.reach); acc.likes += n(r.likes); acc.comments += n(r.comments)
    acc.saved += n(r.saved); acc.shares += n(r.shares); acc.views += n(r.views)
    byScript.set(key, acc)
  }

  // Rådata per video
  const base = [...byScript.values()].map(a => {
    const engagement = a.likes + 2 * a.comments + 3 * a.saved + 3 * a.shares   // hög-intent-handlingar väger mer
    const engagementRate = a.reach > 0 ? engagement / a.reach : 0
    return { ...a, engagement, engagementRate, savesShares: a.saved + a.shares }
  })

  // Min-max-normalisering inom urvalet → relativ poäng
  const norm = (vals: number[]) => {
    const min = Math.min(...vals), max = Math.max(...vals)
    return (v: number) => (max > min ? (v - min) / (max - min) : 0.5)
  }
  const nEng = norm(base.map(b => b.engagementRate))
  const nReach = norm(base.map(b => b.reach))
  const nSS = norm(base.map(b => b.savesShares))

  const posts: ScoredPost[] = base.map(b => {
    const raw = 0.45 * nEng(b.engagementRate) + 0.30 * nReach(b.reach) + 0.25 * nSS(b.savesShares)
    return {
      scriptId: b.scriptId, hook: b.hook, topic: b.topic, publishedAt: b.publishedAt,
      reach: b.reach, likes: b.likes, comments: b.comments, saved: b.saved, shares: b.shares, views: b.views,
      engagementRate: round1(b.engagementRate * 100),  // i procent
      score: Math.round(raw * 100),
    }
  }).sort((a, b) => b.score - a.score)

  // Per ämne
  const byTopicMap = new Map<string, ScoredPost[]>()
  for (const p of posts) {
    const t = p.topic ?? 'other'
    if (!byTopicMap.has(t)) byTopicMap.set(t, [])
    byTopicMap.get(t)!.push(p)
  }
  const byTopic: TopicScore[] = [...byTopicMap.entries()].map(([topic, ps]) => ({
    topic,
    posts: ps.length,
    avgScore: Math.round(ps.reduce((s, p) => s + p.score, 0) / ps.length),
    avgEngagementRate: round1(ps.reduce((s, p) => s + p.engagementRate, 0) / ps.length),
  })).sort((a, b) => b.avgScore - a.avgScore)

  return {
    hasData: true,
    sampleSize: posts.length,
    confidence: confidenceFor(posts.length),
    posts,
    best: posts[0] ?? null,
    worst: posts[posts.length - 1] ?? null,
    byTopic,
  }
}
