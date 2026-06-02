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

export async function contentScore(db: AnyDb, projectId?: string, days = 90): Promise<ContentScoreResult> {
  const since = new Date(Date.now() - days * 864e5).toISOString()

  let rows: any[] = []
  try {
    let q = db.from('media_insights')
      .select('script_id, reach, likes, comments, saved, shares, views, published_at, media_scripts ( hook, topic )')
      .gte('published_at', since)
    if (projectId) q = q.eq('project_id', projectId)
    const { data } = await q
    rows = data ?? []
  } catch { rows = [] }

  const empty: ContentScoreResult = {
    hasData: false, sampleSize: 0, confidence: 'low', posts: [], best: null, worst: null, byTopic: [],
  }
  if (rows.length === 0) return empty

  // Rådata per inlägg
  const base = rows.map(r => {
    const script = Array.isArray(r.media_scripts) ? r.media_scripts[0] : r.media_scripts
    const reach = n(r.reach), likes = n(r.likes), comments = n(r.comments), saved = n(r.saved), shares = n(r.shares), views = n(r.views)
    const engagement = likes + 2 * comments + 3 * saved + 3 * shares   // hög-intent-handlingar väger mer
    const engagementRate = reach > 0 ? engagement / reach : 0
    return {
      scriptId: r.script_id ?? null,
      hook: script?.hook ?? null,
      topic: script?.topic ?? 'other',
      publishedAt: r.published_at ?? null,
      reach, likes, comments, saved, shares, views,
      engagement, engagementRate, savesShares: saved + shares,
    }
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
