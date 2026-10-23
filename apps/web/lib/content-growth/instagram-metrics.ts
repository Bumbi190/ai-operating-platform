/**
 * Read-only Instagram performance summarizer for approved first-party insight
 * exports. Inspired by the baseline/outlier approach from the MIT Instagram
 * Agent project (Jakeschincariol/instagram-agent-skill).
 *
 * Deliberately NO Meta API, scraping, credential handling, storage or actions.
 * Callers MUST provide posts from one and only one project/account.
 */
export type GrowthBrand = 'the-prompt' | 'familje-stunden'

export type InstagramPostInsights = {
  id: string
  brand: GrowthBrand
  views: number
  reach: number | null
  shares: number | null
  saves: number | null
  follows: number | null
  publishedAt?: string
}

export type InstagramPostEvaluation = InstagramPostInsights & {
  viewMultiple: number | null
  sharesPerReach: number | null
  savesPerReach: number | null
  followsPerReach: number | null
}

export type InstagramPerformanceSummary = {
  brand: GrowthBrand
  sampleSize: number
  medianViews: number | null
  confidence: 'insufficient' | 'exploratory' | 'descriptive'
  posts: InstagramPostEvaluation[]
}

function assertCount(value: number | null, name: string): void {
  if (value === null) return
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid Instagram insights field: ${name}`)
  }
}

function perReach(numerator: number | null, reach: number | null): number | null {
  return numerator === null || reach === null || reach === 0
    ? null
    : numerator / reach
}

/**
 * Only compares views to an account's OWN median. Rates are fractions,
 * e.g. 0.05 = 5% of reached accounts. No performance prediction.
 */
export function summarizeInstagramPerformance(
  brand: GrowthBrand,
  posts: readonly InstagramPostInsights[],
): InstagramPerformanceSummary {
  const ids = new Set<string>()
  for (const post of posts) {
    if (post.brand !== brand) throw new Error('Mixed Instagram brand data is not allowed')
    if (!post.id.trim() || ids.has(post.id)) throw new Error('Missing or duplicate Instagram post ID')
    ids.add(post.id)
    assertCount(post.views, 'views')
    assertCount(post.reach, 'reach')
    assertCount(post.shares, 'shares')
    assertCount(post.saves, 'saves')
    assertCount(post.follows, 'follows')
  }

  const sorted = posts.map(p => p.views).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const medianViews = sorted.length === 0 ? null
    : sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2

  const evaluated = posts.map(post => ({
    ...post,
    viewMultiple: medianViews !== null && medianViews > 0 ? post.views / medianViews : null,
    sharesPerReach: perReach(post.shares, post.reach),
    savesPerReach: perReach(post.saves, post.reach),
    followsPerReach: perReach(post.follows, post.reach),
  }))

  return {
    brand,
    sampleSize: posts.length,
    medianViews,
    confidence: posts.length < 6 ? 'insufficient' : posts.length < 30 ? 'exploratory' : 'descriptive',
    posts: evaluated,
  }
}
