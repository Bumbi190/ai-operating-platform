/**
 * Atlas — social analytics (reuse model).
 *
 * Aggregates the existing media_insights table (extended in Phase 3). Degrades
 * gracefully: if no rows exist yet (Meta insights not flowing), hasData=false
 * and the UI shows "Väntar på Meta-data" instead of an error or fake zeros.
 */

type AnyDb = any

export interface SocialPost {
  id: string
  reach: number
  saved: number
  comments: number
  likes: number
}

export interface SocialSummary {
  hasData: boolean
  days: number
  posts: number
  reach: number
  impressions: number
  comments: number
  saved: number
  shares: number
  likes: number
  profileVisits: number
  linkClicks: number
  followersGained: number
  topPosts: SocialPost[]
}

const n = (v: unknown) => Number(v ?? 0) || 0

export async function socialSummary(db: AnyDb, days = 30): Promise<SocialSummary> {
  const since = new Date(Date.now() - days * 864e5).toISOString()
  let rows: any[] = []
  try {
    const { data } = await db.from('media_insights')
      .select('id, reach, impressions, comments, saved, shares, likes, profile_visits, link_clicks, followers_gained, published_at')
      .gte('published_at', since)
    rows = data ?? []
  } catch { rows = [] }

  const sum = (k: string) => rows.reduce((s, r) => s + n(r[k]), 0)
  const topPosts: SocialPost[] = [...rows]
    .sort((a, b) => n(b.reach) - n(a.reach))
    .slice(0, 10)
    .map(r => ({ id: r.id, reach: n(r.reach), saved: n(r.saved), comments: n(r.comments), likes: n(r.likes) }))

  return {
    hasData: rows.length > 0,
    days,
    posts: rows.length,
    reach: sum('reach'),
    impressions: sum('impressions'),
    comments: sum('comments'),
    saved: sum('saved'),
    shares: sum('shares'),
    likes: sum('likes'),
    profileVisits: sum('profile_visits'),
    linkClicks: sum('link_clicks'),
    followersGained: sum('followers_gained'),
    topPosts,
  }
}
