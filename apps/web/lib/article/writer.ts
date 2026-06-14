/**
 * lib/article/writer.ts
 *
 * The Article Writer core: ground → one Sonnet call → parse → ArticleDraft.
 * Pure-ish: grounding can be supplied (resolveGrounding) or fetched by the caller.
 */

import { Anthropic } from '@anthropic-ai/sdk'
import { calculateCost } from '@/lib/ai/pricing'
import { extractJsonObject } from '@/lib/ai/dream'
import { ARTICLE_SYSTEM_PROMPT, buildUserPrompt } from './prompt'
import { resolveGrounding } from './ground'
import {
  isArticleCategory,
  TIER_WORD_BANDS,
  type ArticleDraft,
  type ArticleWriterInput,
  type GroundingResult,
} from './types'

const DEFAULT_MODEL = 'claude-sonnet-4-6'

function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

interface RawModelOutput {
  title?: unknown
  summary?: unknown
  body?: unknown
  category?: unknown
  tags?: unknown
  hero_image_prompt?: unknown
}

// Reuses the robust extractor from the dream pipeline (lib/ai/dream.ts), which
// handles raw JSON, fenced JSON (with or without a closing fence — truncation-
// safe), and stray prose before/after the object. The writer's prior naive
// fence-strip-then-parse was hit by Sonnet occasionally prefixing its JSON with
// a sentence like "The source article describes…", producing a 500 with V8's
// classic `SyntaxError: Unexpected token 'T'`.
function parseModelJson(raw: string): RawModelOutput {
  return JSON.parse(extractJsonObject(raw)) as RawModelOutput
}

function normalizeTags(value: unknown): Array<{ slug: string; name: string }> {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: Array<{ slug: string; name: string }> = []
  for (const entry of value) {
    let name = ''
    let slug = ''
    if (typeof entry === 'string') {
      name = entry.trim()
      slug = slugify(name)
    } else if (entry && typeof entry === 'object') {
      const o = entry as { slug?: unknown; name?: unknown }
      name = typeof o.name === 'string' ? o.name.trim() : ''
      slug = typeof o.slug === 'string' && o.slug ? slugify(o.slug) : slugify(name)
    }
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    out.push({ slug, name: name || slug })
    if (out.length >= 6) break
  }
  return out
}

export interface WriteArticleResult {
  draft: ArticleDraft
  grounding: GroundingResult
  rawResponse: string
}

/**
 * Generate an article from an input. Grounding is taken from input.groundingText
 * (resolveGrounding); fetch it first with buildGroundingFromSource if you want Hermes.
 */
export async function writeArticle(input: ArticleWriterInput): Promise<WriteArticleResult> {
  const grounding = resolveGrounding(input)
  const tier = input.tier ?? 'standard'
  const model = input.model ?? DEFAULT_MODEL

  const maxTokens = tier === 'deep' ? 2600 : tier === 'breaking' ? 900 : 1800

  const claude = new Anthropic()
  const response = await claude.messages.create({
    model,
    max_tokens: maxTokens,
    system: ARTICLE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(input, grounding) }],
  })

  const rawResponse = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const parsed = parseModelJson(rawResponse)

  const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
  const body = typeof parsed.body === 'string' ? parsed.body.trim() : ''
  if (!title || !body) {
    throw new Error('[article] model output missing title or body')
  }

  const rawCategory = typeof parsed.category === 'string' ? parsed.category.trim().toLowerCase() : ''
  const category = isArticleCategory(rawCategory) ? rawCategory : 'news'

  const heroPrompt =
    typeof parsed.hero_image_prompt === 'string' && parsed.hero_image_prompt.trim()
      ? parsed.hero_image_prompt.trim()
      : null

  const tokensIn = response.usage?.input_tokens ?? 0
  const tokensOut = response.usage?.output_tokens ?? 0

  const draft: ArticleDraft = {
    title,
    summary,
    body,
    category,
    tags: normalizeTags(parsed.tags),
    hero_image_prompt: heroPrompt,
    source_name: input.newsItem.source_name ?? null,
    source_url: input.newsItem.url ?? null,
    _meta: {
      grounding: grounding.mode,
      tier,
      model,
      tokensIn,
      tokensOut,
      estCostUsd: calculateCost(model, tokensIn, tokensOut),
      bodyWordCount: wordCount(body),
    },
  }

  return { draft, grounding, rawResponse }
}

export { TIER_WORD_BANDS }
