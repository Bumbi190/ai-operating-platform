/**
 * Regression test for the article writer's JSON output handling.
 *
 * Production E2E failure (proven via chunk-7227 stack trace):
 *   route → generateArticle → writeArticle → JSON.parse(extractJsonObject(rawResponse))
 *   rawResponse = "The source article describes…"  (pure prose, no `{` anywhere)
 *   extractJsonObject returned the prose unchanged → JSON.parse threw
 *   `SyntaxError: Unexpected token 'T', "The source"... is not valid JSON`
 *
 * Root cause: Sonnet refused / deflected and produced prose-only output for
 * a specific news_item (the Claude-Fable-5-offline story). `extractJsonObject`
 * only strips around an existing `{...}`; if there is no `{` at all, it cannot
 * synthesize one.
 *
 * Fix shipped in writer.ts: Anthropic assistant prefill of `{`. The model
 * must continue from inside a JSON object — the no-`{` failure mode becomes
 * structurally impossible. After the call, we prepend `{` to the tail to
 * reconstruct the full JSON before parsing.
 *
 * This file asserts BOTH halves:
 *   1. writeArticle sends a `{ role:'assistant', content:'{' }` message
 *   2. A continuation-style mock response (no leading `{`) parses cleanly
 */

import { describe, it, expect, vi } from 'vitest'

// What Sonnet returns AFTER the `{` prefill — i.e. just the continuation,
// no opening brace. writer.ts is responsible for prepending it.
const JSON_TAIL = `
  "title": "Anthropic Files Confidential IPO",
  "summary": "Could be the largest tech IPO since 2012.",
  "body": "## Lede\\n\\nAnthropic filed confidential paperwork on Friday.\\n\\n## Analysis\\n\\nThis matters because…",
  "category": "business",
  "tags": ["anthropic", "ipo", "funding"],
  "hero_image_prompt": "Editorial photo: empty boardroom at dusk, single printed S-1 on the table, single overhead light."
}`

// Capture the messages array the SDK is called with so we can prove the
// prefill is wired through.
const capturedMessages: Array<{ role: string; content: unknown }>[] = []

vi.mock('@anthropic-ai/sdk', () => {
  const AnthropicCtor = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(async (params: { messages: Array<{ role: string; content: unknown }> }) => {
        capturedMessages.push(params.messages)
        return {
          content: [{ type: 'text', text: JSON_TAIL }],
          usage: { input_tokens: 250, output_tokens: 600 },
        }
      }),
    },
  }))
  return { default: AnthropicCtor, Anthropic: AnthropicCtor }
})

// Must come AFTER vi.mock.
import { writeArticle } from '@/lib/article/writer'

describe('writeArticle — assistant prefill defends against pure-prose responses', () => {
  it('sends a `{`-prefill assistant message and parses the continuation cleanly', async () => {
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
      groundingText: 'word '.repeat(200),
      tier: 'standard',
    })

    // 1. The SDK call included the assistant prefill — this is the structural
    //    defense against the no-`{` refusal mode the production E2E hit.
    const lastCall = capturedMessages[capturedMessages.length - 1]
    expect(lastCall).toHaveLength(2)
    expect(lastCall[0]).toEqual(expect.objectContaining({ role: 'user' }))
    expect(lastCall[1]).toEqual({ role: 'assistant', content: '{' })

    // 2. The continuation-style response (no leading `{`) parsed cleanly after
    //    writer.ts prepended `{`.
    expect(result.draft.title).toBe('Anthropic Files Confidential IPO')
    expect(result.draft.summary).toContain('largest tech IPO since 2012')
    expect(result.draft.body).toContain('## Lede')
    expect(result.draft.category).toBe('business')
    const tagSlugs = result.draft.tags.map((t) => t.slug)
    expect(tagSlugs).toEqual(expect.arrayContaining(['anthropic', 'ipo', 'funding']))
    expect(result.draft.hero_image_prompt).toContain('Editorial photo')

    // 3. rawResponse is the reconstructed full JSON (prefill + tail) so callers
    //    that want to log/debug see a well-formed object, not just the tail.
    expect(result.rawResponse.startsWith('{')).toBe(true)
    expect(result.rawResponse.endsWith('}')).toBe(true)
  })
})
