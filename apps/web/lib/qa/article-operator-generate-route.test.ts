/**
 * Tests for POST /api/content/articles/operator-generate.
 *
 * Verifies the operator wrapper:
 *   • Requires a Supabase session (mirrors /review's auth posture)
 *   • Resolves the news_item from media_news_items via news_item_id
 *   • Delegates to the SAME generateArticle + saveGeneratedArticle library
 *     functions that the cron path uses — no parallel pipeline
 *   • Stamps generated_by with `atlas:<operator>` so Atlas reporting can
 *     distinguish operator-triggered articles from cron-triggered ones
 *   • Returns { id, external_id, status, qa, meta } on success
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

let mockUser: { id?: string; email?: string } | null = null
let mockNewsRow: Record<string, unknown> | null = null
let mockNewsError: { message: string } | null = null
let generateThrows: Error | null = null
let saveThrows: Error | null = null
let capturedSave: Record<string, unknown> | null = null
let capturedGenerateInput: { newsItem: unknown; opts: unknown } | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'media_news_items') throw new Error(`unexpected table: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockNewsRow, error: mockNewsError }),
          }),
        }),
      }
    },
  }),
}))

vi.mock('@/lib/article', () => ({
  generateArticle: async (newsItem: unknown, opts: unknown) => {
    capturedGenerateInput = { newsItem, opts }
    if (generateThrows) throw generateThrows
    return {
      draft: {
        title: 'Generated Article',
        summary: 'A summary.',
        body: 'Body.',
        category: 'news',
        tags: [],
        hero_image_prompt: null,
        source_url: null,
        source_name: 'Wired AI',
        _meta: { model: 'claude-sonnet-4-6', estCostUsd: 0.012 },
      },
      qa: { pass: true, issues: [], confidence: 'high' },
      payload: { external_id: 'omnira_news-1', title: 'Generated Article' },
    }
  },
}))

vi.mock('@/lib/article/store', () => ({
  saveGeneratedArticle: async (args: Record<string, unknown>) => {
    capturedSave = args
    if (saveThrows) throw saveThrows
    return { id: 'row-uuid', externalId: 'omnira_news-1', status: 'pending_review' as const }
  },
}))

import { POST } from '@/app/api/content/articles/operator-generate/route'

const NEWS_ITEM_ID = '7712219e-259a-43ce-ac51-5bdae071ebf1'

function jsonPost(body: unknown): Request {
  return new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/content/articles/operator-generate', () => {
  beforeEach(() => {
    mockUser = null
    mockNewsRow = null
    mockNewsError = null
    generateThrows = null
    saveThrows = null
    capturedSave = null
    capturedGenerateInput = null
  })

  it('401 when no session', async () => {
    mockUser = null
    const res = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID, tier: 'standard' }))
    expect(res.status).toBe(401)
    expect(capturedGenerateInput).toBeNull()
    expect(capturedSave).toBeNull()
  })

  it('400 when news_item_id is missing', async () => {
    mockUser = { id: 'op-1', email: 'op@example.com' }
    const res = await POST(jsonPost({ tier: 'standard' }))
    expect(res.status).toBe(400)
    expect(capturedGenerateInput).toBeNull()
  })

  it('404 when news_item is not in media_news_items', async () => {
    mockUser = { id: 'op-1', email: 'op@example.com' }
    mockNewsRow = null
    const res = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID, tier: 'standard' }))
    expect(res.status).toBe(404)
    expect(capturedGenerateInput).toBeNull()
  })

  it('happy path: delegates to generateArticle+saveGeneratedArticle and returns ids', async () => {
    mockUser = { id: 'op-1', email: 'andre@example.com' }
    mockNewsRow = {
      id: NEWS_ITEM_ID,
      title: 'Anthropic Files Confidential IPO',
      summary: 'Summary.',
      key_insight: null,
      url: 'https://wired.com/x',
      source_name: 'Wired AI',
      content_angle: null,
    }
    const res = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID, tier: 'deep' }))
    expect(res.status).toBe(200)
    const json = (await res.json()) as Record<string, unknown>
    expect(json).toMatchObject({
      ok: true,
      id: 'row-uuid',
      external_id: 'omnira_news-1',
      status: 'pending_review',
    })

    // tier flows through to generateArticle opts.
    expect(capturedGenerateInput).not.toBeNull()
    expect((capturedGenerateInput!.opts as Record<string, unknown>).tier).toBe('deep')
    expect((capturedGenerateInput!.opts as Record<string, unknown>).publishedAt).toBeNull()

    // save called with operator stamp + news_item linkage.
    expect(capturedSave).not.toBeNull()
    expect(capturedSave!.newsItemId).toBe(NEWS_ITEM_ID)
    expect(capturedSave!.sourceKind).toBe('news_item')
    expect(capturedSave!.contentType).toBe('article')
    expect(capturedSave!.generatedBy).toBe('atlas:andre@example.com')
  })

  it('500 (ok:false) when generateArticle throws', async () => {
    mockUser = { id: 'op-1', email: 'op@example.com' }
    mockNewsRow = {
      id: NEWS_ITEM_ID, title: 'X', summary: null, key_insight: null,
      url: null, source_name: null, content_angle: null,
    }
    generateThrows = new Error('Anthropic API error 503')
    const res = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID, tier: 'standard' }))
    expect(res.status).toBe(500)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.ok).toBe(false)
    expect(String(json.error)).toContain('Anthropic API error 503')
    expect(capturedSave).toBeNull()
  })
})
