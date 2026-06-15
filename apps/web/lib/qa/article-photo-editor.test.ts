/**
 * Tests for the Photo Editor Agent (Hero Image V2 Commit C).
 *
 * The agent does editorial REASONING, not prompt engineering. These tests
 * pin:
 *   1. The system prompt contains the hard banlist (treated as a HARD
 *      constraint, not a soft preference per Phase 1 spec).
 *   2. The system prompt contains the editorial-style enum and the
 *      category→style guidance.
 *   3. The user prompt carries title, summary, body excerpt, category, tags.
 *   4. The forced tool_use shape produces a strongly-typed EditorBrief.
 *   5. A degenerate response (no tool_use block) throws clearly so the
 *      shadow integration in hero-image.ts can log it under [photo-editor].
 *   6. A model response that emits the tool but omits a required field
 *      throws via the shape-validation guard.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

interface CapturedCall {
  model: string
  system: string
  messages: Array<{ role: string; content: unknown }>
  tools: Array<{ name: string; input_schema: Record<string, unknown> }> | undefined
  tool_choice: { type: string; name?: string } | undefined
}

let lastCall: CapturedCall | null = null
let mockBriefInput: Record<string, unknown> | null = null
let omitToolUse = false

vi.mock('@anthropic-ai/sdk', () => {
  const AnthropicCtor = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(async (params: CapturedCall) => {
        lastCall = params
        const content = omitToolUse
          ? [{ type: 'text', text: 'I cannot brief this.' }]
          : [
              {
                type: 'tool_use',
                id: 'toolu_01ABC',
                name: 'submit_brief',
                input: mockBriefInput,
              },
            ]
        return { content, usage: { input_tokens: 320, output_tokens: 220 } }
      }),
    },
  }))
  return { default: AnthropicCtor, Anthropic: AnthropicCtor }
})

// cost/track is invoked fire-and-forget for visibility; mock to prevent real DB writes.
vi.mock('@/lib/cost/track', () => ({
  logLlmCost: vi.fn(async () => undefined),
  logImageCost: vi.fn(async () => undefined),
}))

import { runPhotoEditor, ANTI_STOCK_BANLIST, EDITORIAL_STYLES } from '@/lib/article/photo-editor'

const VALID_BRIEF = {
  story: 'Anthropic is taking Claude Fable 5 offline under a US government order.',
  visual_metaphor: 'A regulatory pause on a household name in AI.',
  shot: 'A printed compliance order under a single desk lamp on a polished wood desk, late evening.',
  avoid: ['glowing server racks', 'an anonymous figure pulling a plug'],
  editorial_style: 'Reuters',
}

function makeInput(over: Partial<Parameters<typeof runPhotoEditor>[0]> = {}) {
  return {
    title: 'Anthropic Takes Claude Fable 5 Offline Under US Government Order',
    summary: 'A US government order forces Anthropic to shut down Fable 5.',
    body: 'On Tuesday, Anthropic confirmed that it would take Claude Fable 5 offline under a Department of Commerce order. The order cited an alleged jailbreak vulnerability…',
    category: 'policy',
    tags: ['anthropic', 'regulation', 'safety'],
    ...over,
  }
}

describe('runPhotoEditor — Hero Image V2 Commit C', () => {
  beforeEach(() => {
    lastCall = null
    mockBriefInput = { ...VALID_BRIEF }
    omitToolUse = false
  })

  it('uses claude-sonnet-4-6 and the submit_brief forced tool_use', async () => {
    await runPhotoEditor(makeInput())
    expect(lastCall).not.toBeNull()
    expect(lastCall!.model).toBe('claude-sonnet-4-6')
    expect(lastCall!.tools).toHaveLength(1)
    expect(lastCall!.tools![0].name).toBe('submit_brief')
    expect(lastCall!.tool_choice).toEqual({ type: 'tool', name: 'submit_brief' })
    // Messages end with user (no assistant prefill — claude-sonnet-4-6 rejects it).
    const last = lastCall!.messages[lastCall!.messages.length - 1]
    expect(last.role).toBe('user')
  })

  it('system prompt enforces the hard banlist (every term verbatim)', async () => {
    await runPhotoEditor(makeInput())
    const sys = lastCall!.system
    for (const term of ANTI_STOCK_BANLIST) {
      expect(sys).toContain(term)
    }
    expect(sys.toLowerCase()).toMatch(/hard constraint/)
  })

  it('system prompt contains the editorial-style enum and three-question scaffold', async () => {
    await runPhotoEditor(makeInput())
    const sys = lastCall!.system
    for (const style of EDITORIAL_STYLES) {
      expect(sys).toContain(style)
    }
    expect(sys).toMatch(/What is the story\?/i)
    expect(sys).toMatch(/What is the tension\?/i)
    expect(sys).toMatch(/What would a magazine editor/i)
  })

  it('system prompt maps categories to editorial styles', async () => {
    await runPhotoEditor(makeInput())
    const sys = lastCall!.system
    expect(sys).toMatch(/business.*Bloomberg.*Financial Times/i)
    expect(sys).toMatch(/policy.*Economist.*Reuters/i)
    expect(sys).toMatch(/research.*MIT Technology Review/i)
    expect(sys).toMatch(/Wired/)
  })

  it('user prompt carries title, summary, body excerpt, category, tags', async () => {
    await runPhotoEditor(makeInput())
    const userMsg = lastCall!.messages[0]
    const text = String(userMsg.content)
    expect(text).toContain('Anthropic Takes Claude Fable 5 Offline')
    expect(text).toContain('A US government order forces Anthropic')
    expect(text).toContain('On Tuesday, Anthropic confirmed')
    expect(text).toMatch(/CATEGORY\s*\npolicy/i)
    expect(text).toContain('anthropic, regulation, safety')
  })

  it('returns a strongly-typed brief from the tool_use input', async () => {
    const brief = await runPhotoEditor(makeInput())
    expect(brief.story).toBe(VALID_BRIEF.story)
    expect(brief.visual_metaphor).toBe(VALID_BRIEF.visual_metaphor)
    expect(brief.shot).toBe(VALID_BRIEF.shot)
    expect(brief.avoid).toEqual(VALID_BRIEF.avoid)
    expect(brief.editorial_style).toBe('Reuters')
  })

  it('throws clearly when the model omits the tool_use block', async () => {
    omitToolUse = true
    await expect(runPhotoEditor(makeInput())).rejects.toThrow(/submit_brief tool_use block/)
  })

  it('throws via shape validation when the brief is missing a required field', async () => {
    mockBriefInput = { ...VALID_BRIEF, story: undefined }
    await expect(runPhotoEditor(makeInput())).rejects.toThrow(/shape validation/)
  })

  it('still includes Wired guidance when category is null (Consumer AI default)', async () => {
    await runPhotoEditor(makeInput({ category: null }))
    const text = String(lastCall!.messages[0].content)
    expect(text).toMatch(/Consumer AI/)
  })
})
