/**
 * Regression test for the article writer's JSON extraction.
 *
 * Failure repro that motivated the fix:
 *   POST /api/content/articles/generate → 500
 *   { "error": "SyntaxError: Unexpected token 'T', \"The source\"... is not valid JSON" }
 *
 * Root cause: writer.ts's local parseModelJson only stripped ```json fences
 * from start/end and then JSON.parse'd. When Sonnet ignored "no markdown
 * fences" and prefixed its response with a sentence like "The source article
 * describes…", the parser saw "T" first and threw.
 *
 * Fix: swap the naive cleanup for the existing extractJsonObject from
 * lib/ai/dream.ts (commit 3a44e90 fixed the same class of bug for the dream
 * pipeline) — strips fences with or without a closing fence, then snaps to
 * the outermost {…} if prose surrounds it.
 *
 * This test mocks @anthropic-ai/sdk so the model "returns" prose + JSON, then
 * asserts writeArticle parses cleanly and threads the fields through.
 */

import { describe, it, expect, vi } from 'vitest'

const PROSE_PREFIX =
  'The source article describes Anthropic\'s confidential S-1 filing with the SEC.\n\nHere is the JSON you requested:\n\n'

const VALID_JSON = JSON.stringify({
  title: 'Anthropic Files Confidential IPO',
  summary: 'Could be the largest tech IPO since 2012.',
  body: '## Lede\n\nAnthropic filed confidential paperwork on Friday.\n\n## Analysis\n\nThis matters because…',
  category: 'business',
  tags: ['anthropic', 'ipo', 'funding'],
  hero_image_prompt:
    'Editorial photo: empty boardroom at dusk, single printed S-1 on the table, single overhead light.',
})

// Mock @anthropic-ai/sdk so BOTH writer.ts (named import) and dream.ts
// (default import) get the same controllable stub. extractJsonObject lives in
// dream.ts and is a pure function — but importing it triggers dream.ts's
// module-level `new Anthropic(...)`, so the SDK must be mockable from both
// shapes for the test to even load.
vi.mock('@anthropic-ai/sdk', () => {
  const AnthropicCtor = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: 'text', text: PROSE_PREFIX + VALID_JSON }],
        usage: { input_tokens: 250, output_tokens: 600 },
      })),
    },
  }))
  return { default: AnthropicCtor, Anthropic: AnthropicCtor }
})

// Must come AFTER the vi.mock above.
import { writeArticle } from '@/lib/article/writer'

describe('writeArticle — robust JSON extraction (regression: "Unexpected token T")', () => {
  it('parses successfully when Sonnet prefixes the JSON object with prose', async () => {
    const result = await writeArticle({
      newsItem: {
        id: '7712219e-259a-43ce-ac51-5bdae071ebf1',
        title: 'Anthropic Confidentially Files for IPO',
        summary: 'Largest tech IPO speculation builds.',
        key_insight: null,
        url: 'https://www.wired.com/story/anthropic-ipo-confidential',
        source_name: 'Wired AI',
        content_angle: null,
      } as never,
      // 200 words → clears resolveGrounding's STRONG_MIN_WORDS=150 threshold,
      // so we exercise the "strong grounding" path the production call uses.
      groundingText: 'word '.repeat(200),
      tier: 'standard',
    })

    expect(result.draft.title).toBe('Anthropic Files Confidential IPO')
    expect(result.draft.summary).toContain('largest tech IPO since 2012')
    expect(result.draft.body).toContain('## Lede')
    expect(result.draft.category).toBe('business')
    const tagSlugs = result.draft.tags.map((t) => t.slug)
    expect(tagSlugs).toEqual(expect.arrayContaining(['anthropic', 'ipo', 'funding']))
    expect(result.draft.hero_image_prompt).toContain('Editorial photo')

    // Sanity: rawResponse round-trips the unparsed text so callers can debug.
    expect(result.rawResponse).toBe(PROSE_PREFIX + VALID_JSON)

    // Grounding mode flows into _meta so downstream code can tell which path ran.
    expect(result.draft._meta.grounding).toBe('strong')
    expect(result.draft._meta.tier).toBe('standard')
  })
})
