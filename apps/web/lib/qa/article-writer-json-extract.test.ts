/**
 * Regression test for the article writer's structured output.
 *
 * Production E2E proved (chunk-7227 trace + 400 error from the prefill attempt):
 *  • Sonnet occasionally returns pure prose ("The source article describes…")
 *    with no `{` anywhere — JSON.parse threw `Unexpected token 'T'`.
 *  • claude-sonnet-4-6 rejects assistant-message prefill with 400
 *    invalid_request_error, so prefill is NOT a valid mitigation.
 *
 * Fix shipped in writer.ts: forced tool use. The model MUST call the
 * `submit_article` tool whose input_schema is the article shape. The SDK
 * returns the tool input pre-parsed — JSON.parse never runs in our code,
 * so the prose-vs-JSON failure mode is impossible at the protocol level.
 *
 * This file asserts:
 *  1. The SDK call includes `tools: [submit_article]` with the right schema.
 *  2. The SDK call includes `tool_choice: { type:'tool', name:'submit_article' }`.
 *  3. The messages array ENDS with a user message (no assistant prefill — the
 *     400-causing shape from a62ec4f is gone).
 *  4. The draft is populated from the tool_use block's structured input.
 *  5. If the model omits the tool_use block (degenerate case), writeArticle
 *     throws a clear error.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

interface CapturedCall {
  messages: Array<{ role: string; content: unknown }>
  tools: Array<{ name: string; input_schema: Record<string, unknown> }> | undefined
  tool_choice: { type: string; name?: string } | undefined
}

let lastCall: CapturedCall | null = null
let mockToolInput: Record<string, unknown> | null = null
let omitToolUse = false

vi.mock('@anthropic-ai/sdk', () => {
  const AnthropicCtor = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(async (params: CapturedCall) => {
        lastCall = params
        const content = omitToolUse
          ? [{ type: 'text', text: 'I cannot write this article.' }]
          : [
              {
                type: 'tool_use',
                id: 'toolu_01ABC',
                name: 'submit_article',
                input: mockToolInput,
              },
            ]
        return { content, usage: { input_tokens: 250, output_tokens: 600 } }
      }),
    },
  }))
  return { default: AnthropicCtor, Anthropic: AnthropicCtor }
})

// Must come AFTER vi.mock.
import { writeArticle } from '@/lib/article/writer'

const VALID_TOOL_INPUT = {
  title: 'Anthropic Files Confidential IPO',
  summary: 'Could be the largest tech IPO since 2012.',
  body: '## Lede\n\nAnthropic filed confidential paperwork on Friday.\n\n## Analysis\n\nThis matters because…',
  category: 'business',
  tags: ['anthropic', 'ipo', 'funding'],
  hero_image_prompt: 'Editorial photo: empty boardroom at dusk, single printed S-1 on the table.',
}

function makeInput() {
  return {
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
    tier: 'standard' as const,
  }
}

describe('writeArticle — forced tool use (post-prefill, post-prose-fail)', () => {
  beforeEach(() => {
    lastCall = null
    mockToolInput = { ...VALID_TOOL_INPUT }
    omitToolUse = false
  })

  it('sends submit_article tool + forced tool_choice + user-only messages', async () => {
    await writeArticle(makeInput())

    expect(lastCall).not.toBeNull()
    // 1. Tool registered with the expected name and schema shape.
    expect(lastCall!.tools).toBeDefined()
    expect(lastCall!.tools!.length).toBe(1)
    expect(lastCall!.tools![0].name).toBe('submit_article')
    expect(lastCall!.tools![0].input_schema.type).toBe('object')
    const props = (lastCall!.tools![0].input_schema.properties as Record<string, unknown>) ?? {}
    expect(Object.keys(props).sort()).toEqual(
      ['body', 'category', 'hero_image_prompt', 'summary', 'tags', 'title'].sort(),
    )

    // 2. Tool choice is forced (the protocol-level guarantee).
    expect(lastCall!.tool_choice).toEqual({ type: 'tool', name: 'submit_article' })

    // 3. No assistant prefill. claude-sonnet-4-6 rejected that with 400 —
    //    the last message MUST be a user message.
    const last = lastCall!.messages[lastCall!.messages.length - 1]
    expect(last.role).toBe('user')
  })

  it('extracts the tool_use input into a populated draft (no JSON.parse runs)', async () => {
    const result = await writeArticle(makeInput())

    expect(result.draft.title).toBe('Anthropic Files Confidential IPO')
    expect(result.draft.summary).toContain('largest tech IPO since 2012')
    expect(result.draft.body).toContain('## Lede')
    expect(result.draft.category).toBe('business')
    const tagSlugs = result.draft.tags.map((t) => t.slug)
    expect(tagSlugs).toEqual(expect.arrayContaining(['anthropic', 'ipo', 'funding']))
    expect(result.draft.hero_image_prompt).toContain('Editorial photo')

    // rawResponse is now JSON.stringify of the tool input so callers that
    // logged it before still get a well-formed object string.
    expect(JSON.parse(result.rawResponse)).toMatchObject({
      title: VALID_TOOL_INPUT.title,
      category: 'business',
    })
  })

  it('throws clearly when the model omits the tool_use block', async () => {
    omitToolUse = true
    await expect(writeArticle(makeInput())).rejects.toThrow(
      /missing submit_article tool_use block/,
    )
  })
})
