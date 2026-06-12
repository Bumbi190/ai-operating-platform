/**
 * lib/article/types.ts
 *
 * Article Writer (M1) — shared types. Reusable Omnira capability: turns a selected
 * news item (+ grounding) into a website-shaped article that maps 1:1 to the v1
 * publishing contract. Destination-agnostic; not Prompt-specific.
 */

/** The 6 allowed category slugs (must match the destination's seeded categories). */
export const ARTICLE_CATEGORIES = ['news', 'models', 'tools', 'research', 'business', 'policy'] as const
export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number]

export function isArticleCategory(value: string): value is ArticleCategory {
  return (ARTICLE_CATEGORIES as readonly string[]).includes(value)
}

/** Length tier — decided by the caller from virality/grounding; controls word band. */
export type LengthTier = 'breaking' | 'standard' | 'deep'

export const TIER_WORD_BANDS: Record<LengthTier, { min: number; max: number }> = {
  breaking: { min: 150, max: 300 },
  standard: { min: 450, max: 750 },
  deep: { min: 900, max: 1300 },
}

export type GroundingMode = 'strong' | 'weak'

/** The news item the Writer works from (subset of media_news_items). */
export interface NewsItemInput {
  id: string
  title: string
  summary?: string | null
  key_insight?: string | null
  url?: string | null
  source_name?: string | null
  content_angle?: string | null
}

/** Full Writer input (pure function — caller assembles everything; Writer never fetches). */
export interface ArticleWriterInput {
  newsItem: NewsItemInput
  /** Source body text (from Hermes read) when available. */
  groundingText?: string | null
  /** Optional trending context to shape relevance/tags. */
  trendingTopics?: string[]
  /** Desired length tier; defaults to 'standard'. */
  tier?: LengthTier
  /** Model override; defaults to claude-sonnet-4-6. */
  model?: string
}

export interface GroundingResult {
  text: string
  mode: GroundingMode
  wordCount: number
  /** Where the grounding text came from. */
  source: 'hermes' | 'news_item'
}

/** A generated article, before contract mapping. */
export interface ArticleDraft {
  title: string
  summary: string
  body: string
  category: ArticleCategory
  tags: Array<{ slug: string; name: string }>
  hero_image_prompt: string | null
  source_name: string | null
  source_url: string | null
  _meta: {
    grounding: GroundingMode
    tier: LengthTier
    model: string
    tokensIn: number
    tokensOut: number
    estCostUsd: number
    bodyWordCount: number
  }
}

export type Confidence = 'high' | 'medium' | 'low'

export interface ArticleQa {
  /** Eligible to proceed (structural ok, no copy violation, slop within bounds). */
  pass: boolean
  confidence: Confidence
  issues: string[]
  slop: { score: number; verdict: string }
  copyOverlap: { ratio: number; violation: boolean; windowSize: number }
  structuralOk: boolean
}
