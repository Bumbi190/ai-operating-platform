/**
 * lib/article/writer.ts
 *
 * The Article Writer core: ground → one Sonnet call → ArticleDraft.
 * Pure-ish: grounding can be supplied (resolveGrounding) or fetched by the caller.
 *
 * Structured-output strategy (post-incident, replaces a66de97/a62ec4f):
 *   The model is forced to call a single tool, `submit_article`, whose
 *   input_schema is the article shape. The Anthropic SDK returns the tool
 *   input pre-parsed as an object — there is NO JSON.parse in this file, so
 *   prose-only refusal responses (the production failure that hit the
 *   Claude-Fable-5-offline news_item) cannot crash the writer.
 *
 *   Assistant-message prefill was tried and rejected: claude-sonnet-4-6
 *   returned `400 invalid_request_error: "This model does not support
 *   assistant message prefill. The conversation must end with a user
 *   message."` Forced tool use is the supported equivalent.
 */

import { Anthropic } from '@anthropic-ai/sdk'
import { calculateCost } from '@/lib/ai/pricing'
import { ARTICLE_SYSTEM_PROMPT, buildUserPrompt } from './prompt'
import { resolveGrounding } from './ground'
import {
  ARTICLE_CATEGORIES,
  isArticleCategory,
  TIER_WORD_BANDS,
  type ArticleDraft,
  type ArticleWriterInput,
  type GroundingResult,
} from './types'

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const SUBMIT_ARTICLE_TOOL = 'submit_article'

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
    tools: [
      {
        name: SUBMIT_ARTICLE_TOOL,
        description:
          'Submit the finished article in the structured shape required by the editor. ' +
          'Call this tool exactly once with the article.',
        input_schema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Original headline, <= 75 chars, concrete, no hype.',
            },
            summary: {
              type: 'string',
              description: 'Meta description / dek, <= 160 chars.',
            },
            body: {
              type: 'string',
              description: 'The article body in Markdown.',
            },
            category: {
              type: 'string',
              enum: [...ARTICLE_CATEGORIES],
              description: 'Exactly one of the allowed category slugs.',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              minItems: 3,
              maxItems: 6,
              description: '3 to 6 short topical labels.',
            },
            hero_image_prompt: {
              type: 'string',
              description: 'A text-to-image prompt for the hero image. Omit if no good prompt fits.',
            },
          },
          required: ['title', 'summary', 'body', 'category', 'tags'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: SUBMIT_ARTICLE_TOOL },
  })

  // The model is forced to call submit_article, so a tool_use block MUST be
  // present. The SDK already parsed the tool input — no JSON.parse needed.
  const toolUse = response.content.find((b) => b.type === 'tool_use') as
    | { type: 'tool_use'; name: string; input: RawModelOutput }
    | undefined
  if (!toolUse) {
    throw new Error('[article] model response missing submit_article tool_use block')
  }
  const parsed = toolUse.input
  const rawResponse = JSON.stringify(parsed)

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
