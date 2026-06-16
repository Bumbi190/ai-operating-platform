/**
 * Tests for generateArticleHeroImage (Hero Image V2 Commit C / Phase 2A).
 *
 * The brief-driven renderer that bypasses the Haiku photo-director middle step
 * and sends brief.shot + STYLE_REFERENCE_MAP entry + framing hint directly to
 * Ideogram v3 REALISTIC at 16:10.
 *
 * Asserts:
 *  • Ideogram is called with aspect_ratio='16x10', style_type='REALISTIC',
 *    rendering_speed='DEFAULT' (not TURBO — quality matters for heroes).
 *  • The composed prompt contains brief.shot verbatim AND the
 *    STYLE_REFERENCE_MAP entry for brief.editorial_style.
 *  • The composed prompt includes the "centered subject, 16:10 framing" hint.
 *  • negative_prompt contains every term from ANTI_STOCK_BANLIST + brief.avoid +
 *    technical excludes (text, watermark, low quality).
 *  • STYLE_REFERENCE_MAP is exhaustive over EDITORIAL_STYLES — every enum value
 *    has an entry (catches drift if someone adds a style without a reference).
 *  • The returned `input` mirrors what was sent, so callers can persist it for
 *    failure inspection.
 *  • Throws cleanly on Ideogram error / missing URL / unknown editorial_style.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import { EDITORIAL_STYLES, ANTI_STOCK_BANLIST } from '@/lib/article/photo-editor'

// Capture the Ideogram POST body so we can assert on the request shape.
const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = []
let fetchShouldFail: { status: number; text: string } | null = null
let fetchReturnsNoUrl = false

const originalFetch = globalThis.fetch
beforeEach(() => {
  fetchCalls.length = 0
  fetchShouldFail = null
  fetchReturnsNoUrl = false
  vi.stubEnv('IDEOGRAM_API_KEY', 'test-key')
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    fetchCalls.push({ url: String(url), body })
    if (fetchShouldFail) {
      return new Response(fetchShouldFail.text, { status: fetchShouldFail.status })
    }
    return new Response(
      JSON.stringify({
        data: fetchReturnsNoUrl ? [] : [{ url: 'https://ideogram.example/test-hero.png' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
})

// Restore fetch after each test to be a good neighbor in the suite.
import { afterEach } from 'vitest'
afterEach(() => {
  globalThis.fetch = originalFetch
})

// Mock cost log so we don't try to write to Supabase.
vi.mock('@/lib/cost/track', () => ({
  logImageCost: vi.fn(async () => undefined),
  logLlmCost: vi.fn(async () => undefined),
}))

import {
  generateArticleHeroImage,
  STYLE_REFERENCE_MAP,
  STANDING_RENDER_NEGATIVES,
  ARTICLE_HERO_ASPECT,
} from '@/lib/media/ideogram'
import type { EditorBrief } from '@/lib/article/photo-editor'

const briefBase: EditorBrief = {
  story: 'The US government ordered Anthropic to take Claude Fable 5 offline.',
  visual_metaphor: 'the off switch, finally pulled',
  shot: 'A close overhead shot of a single printed government order on a federal desk, flat shadowless light.',
  avoid: ['humanoid robots', 'literal off-button imagery'],
  editorial_style: 'Economist',
}

describe('generateArticleHeroImage — Phase 2A brief-driven renderer', () => {
  it('calls Ideogram with aspect_ratio=16x10, style_type=REALISTIC, rendering_speed=DEFAULT', async () => {
    await generateArticleHeroImage(briefBase)
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].url).toBe('https://api.ideogram.ai/v1/ideogram-v3/generate')
    expect(fetchCalls[0].body.aspect_ratio).toBe('16x10')
    expect(fetchCalls[0].body.aspect_ratio).toBe(ARTICLE_HERO_ASPECT)
    expect(fetchCalls[0].body.style_type).toBe('REALISTIC')
    expect(fetchCalls[0].body.rendering_speed).toBe('DEFAULT')
  })

  it('prompt contains brief.shot verbatim and the STYLE_REFERENCE_MAP entry', async () => {
    await generateArticleHeroImage(briefBase)
    const prompt = fetchCalls[0].body.prompt as string
    expect(prompt).toContain(briefBase.shot)
    expect(prompt).toContain(STYLE_REFERENCE_MAP.Economist)
    expect(prompt).toMatch(/centered subject, 16:10 framing/i)
  })

  it('negative_prompt contains every ANTI_STOCK_BANLIST term + brief.avoid', async () => {
    await generateArticleHeroImage(briefBase)
    const neg = fetchCalls[0].body.negative_prompt as string
    for (const term of ANTI_STOCK_BANLIST) {
      expect(neg).toContain(term)
    }
    for (const term of briefBase.avoid) {
      expect(neg).toContain(term)
    }
    // Technical excludes always present.
    expect(neg).toMatch(/text/)
    expect(neg).toMatch(/watermark/)
    expect(neg).toMatch(/low quality/)
    expect(neg).toMatch(/cinematic lighting/)  // AI-prompt-language tell
    expect(neg).toMatch(/digital art/)
  })

  it('returned input mirrors the request body for downstream persistence', async () => {
    const result = await generateArticleHeroImage(briefBase)
    expect(result.url).toBe('https://ideogram.example/test-hero.png')
    expect(result.input.prompt).toBe(fetchCalls[0].body.prompt)
    expect(result.input.negative_prompt).toBe(fetchCalls[0].body.negative_prompt)
    expect(result.input.aspect_ratio).toBe('16x10')
    expect(result.input.style_type).toBe('REALISTIC')
  })

  it('STYLE_REFERENCE_MAP is exhaustive over EDITORIAL_STYLES', () => {
    for (const style of EDITORIAL_STYLES) {
      expect(STYLE_REFERENCE_MAP[style]).toBeDefined()
      expect(typeof STYLE_REFERENCE_MAP[style]).toBe('string')
      expect(STYLE_REFERENCE_MAP[style].length).toBeGreaterThan(20)
    }
  })

  it('STANDING_RENDER_NEGATIVES contains every ANTI_STOCK_BANLIST term', () => {
    for (const term of ANTI_STOCK_BANLIST) {
      expect(STANDING_RENDER_NEGATIVES).toContain(term)
    }
  })

  it.each(EDITORIAL_STYLES)('renders correctly for editorial_style=%s', async (style) => {
    await generateArticleHeroImage({ ...briefBase, editorial_style: style })
    const prompt = fetchCalls[0].body.prompt as string
    expect(prompt).toContain(STYLE_REFERENCE_MAP[style])
  })

  it('throws when Ideogram returns non-2xx', async () => {
    fetchShouldFail = { status: 503, text: 'upstream timeout' }
    await expect(generateArticleHeroImage(briefBase)).rejects.toThrow(/Ideogram API error 503/)
  })

  it('throws when Ideogram returns no image URL', async () => {
    fetchReturnsNoUrl = true
    await expect(generateArticleHeroImage(briefBase)).rejects.toThrow(/no image URL/)
  })

  it('throws when editorial_style is unknown (defensive guard)', async () => {
    await expect(
      generateArticleHeroImage({ ...briefBase, editorial_style: 'NotARealStyle' as never }),
    ).rejects.toThrow(/unknown editorial_style/)
    expect(fetchCalls).toHaveLength(0)  // never reached Ideogram
  })

  it('throws when IDEOGRAM_API_KEY is missing (so deploys fail loudly)', async () => {
    vi.stubEnv('IDEOGRAM_API_KEY', '')
    await expect(generateArticleHeroImage(briefBase)).rejects.toThrow(/IDEOGRAM_API_KEY/)
  })
})
