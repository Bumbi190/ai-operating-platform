/**
 * lib/article/index.ts
 *
 * Orchestrator: news item → ground (Hermes) → write (Sonnet) → QA → contract payload.
 * Generation only — does NOT publish. Publishing is the M0 spine (lib/publishing).
 */

import { buildGroundingFromSource } from './ground'
import { writeArticle } from './writer'
import { reviewArticle } from './qa'
import { toPublishPayload } from './to-contract'
import type { ArticleDraft, ArticleQa, LengthTier, NewsItemInput } from './types'
import type { PublishPayload } from '@/lib/publishing/types'

export interface GenerateArticleOptions {
  tier?: LengthTier
  trendingTopics?: string[]
  model?: string
  /** Lifecycle for the produced payload (default draft = null). */
  publishedAt?: string | null
  heroImageUrl?: string | null
}

export interface GeneratedArticle {
  draft: ArticleDraft
  qa: ArticleQa
  payload: PublishPayload
}

/**
 * Full M1 flow for one news item. Fetches grounding via Hermes (with fallback),
 * writes, QA-reviews, and maps to the publish payload. The caller decides whether
 * to hand `payload` to publishArticle('the-prompt', …) based on `qa`.
 */
export async function generateArticle(
  newsItem: NewsItemInput,
  opts: GenerateArticleOptions = {},
): Promise<GeneratedArticle> {
  const grounding = await buildGroundingFromSource(newsItem)

  const { draft } = await writeArticle({
    newsItem,
    groundingText: grounding.text,
    trendingTopics: opts.trendingTopics,
    tier: opts.tier,
    model: opts.model,
  })

  const qa = reviewArticle(draft, grounding)

  const payload = toPublishPayload(draft, {
    newsItemId: newsItem.id,
    publishedAt: opts.publishedAt ?? null,
    heroImageUrl: opts.heroImageUrl ?? null,
  })

  return { draft, qa, payload }
}

export * from './types'
export { writeArticle } from './writer'
export { reviewArticle, copyOverlap } from './qa'
export { toPublishPayload, externalIdForNewsItem } from './to-contract'
export { buildGroundingFromSource, resolveGrounding } from './ground'
