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
import type { PublishPayload, PublishSuccess } from '@/lib/publishing/types'
import { publishArticle } from '@/lib/publishing/publish'

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

export interface PublishGeneratedResult {
  generated: GeneratedArticle
  /** The publish result, or null when QA blocked publishing. */
  published: PublishSuccess | null
  /** Set when publishing was skipped (QA failed); null when published. */
  skippedReason: string | null
}

/**
 * Seam that connects M1 generation to the M0 publishing spine:
 * generate → QA-gate → publish. Reuses generateArticle + publishArticle; adds no
 * infrastructure. Defaults to DRAFT (published_at = null) so the article lands
 * hidden in the destination's review queue (the website owns approval). Publishing
 * is skipped (never throws on QA) when the draft fails QA.
 */
export async function generateAndPublishArticle(
  newsItem: NewsItemInput,
  opts: GenerateArticleOptions & { destinationKey?: string } = {},
): Promise<PublishGeneratedResult> {
  const generated = await generateArticle(newsItem, opts)

  if (!generated.qa.pass) {
    const reason = generated.qa.issues.length ? generated.qa.issues.join('; ') : 'qa_failed'
    return { generated, published: null, skippedReason: reason }
  }

  const published = await publishArticle(opts.destinationKey ?? 'the-prompt', generated.payload)
  return { generated, published, skippedReason: null }
}

export * from './types'
export { writeArticle } from './writer'
export { reviewArticle, copyOverlap } from './qa'
export { toPublishPayload, externalIdForNewsItem } from './to-contract'
export { buildGroundingFromSource, resolveGrounding } from './ground'
