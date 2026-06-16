/**
 * Tests for syncPublishedArticle — the post-publish state sync primitive.
 *
 * The function reads a website_content row, applies four guards
 * (status='published', external_id present, destination_key present, row
 * found), spreads the frozen payload as the base, overlays the four
 * drift-prone columns plus the real published_at + external_id, and calls
 * publishArticle(destination_key, payload).
 *
 * Tests pin:
 *  1. row not found → skipped, no publish
 *  2. status≠published → skipped, no publish
 *  3. missing external_id → skipped
 *  4. missing destination_key → skipped
 *  5. happy path — payload built from frozen + live overlays; the four
 *     drift-prone columns reflect the row's current values, body/category/
 *     tags/source pass through from the frozen payload, published_at:null
 *     from frozen does NOT leak through (would unpublish on destination)
 *  6. external_id re-asserted from row even if frozen payload has a stale one
 *  7. publishArticle throws → returns failed; no website_content writes
 *  8. zero-drift case still sends the payload (lets the RPC's PATCH semantics
 *     decide what changes — pinned so future "skip if no diff" optimizations
 *     don't silently regress when only body/tags drifted)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { PublishPayload } from '@/lib/publishing/types'

// ── Mutable mock state ───────────────────────────────────────────────────────
let storedRow: Record<string, unknown> | null = null
let loadError: { message: string } | null = null
const updateCaptures: Array<Record<string, unknown>> = []
let publishCalls: Array<{ destinationKey: string; payload: PublishPayload }> = []
let publishShouldThrow: string | null = null

// ── Mocks (must come BEFORE the import of the module under test) ─────────────
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'website_content') throw new Error(`unexpected table: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: storedRow, error: loadError }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            updateCaptures.push(patch)
            return { error: null }
          },
        }),
      }
    },
  }),
}))

vi.mock('@/lib/publishing/publish', () => ({
  publishArticle: async (destinationKey: string, payload: PublishPayload) => {
    publishCalls.push({ destinationKey, payload })
    if (publishShouldThrow) throw new Error(publishShouldThrow)
    return {
      ok: true,
      version: 1,
      id: 'dest-uuid',
      external_id: payload.external_id,
      slug: payload.slug ?? 'auto-slug',
      status: 'published' as const,
      published_at: payload.published_at ?? null,
      operation: 'updated' as const,
      created: false,
      published_url: `https://theprompt.nu/articles/${payload.slug ?? 'auto-slug'}`,
    }
  },
}))

// Must come AFTER mocks
import { syncPublishedArticle } from '@/lib/publishing/sync'

const ARTICLE_ID = 'content-uuid-42'
const EXTERNAL_ID = 'omnira_news-uuid-7'
const DESTINATION = 'the-prompt'
const LIVE_HERO_URL = 'https://storage.example/new-hero.png'
const FROZEN_HERO_URL = 'https://storage.example/old-hero.png'

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ARTICLE_ID,
    status: 'published',
    external_id: EXTERNAL_ID,
    destination_key: DESTINATION,
    title: 'Live Title',
    summary: 'Live summary.',
    slug: 'live-slug',
    hero_image_url: LIVE_HERO_URL,
    published_at: '2026-06-15T06:54:58.227Z',
    payload: {
      version: 1,
      external_id: EXTERNAL_ID,
      title: 'Frozen Title',
      summary: 'Frozen summary.',
      slug: 'frozen-slug',
      body: 'Frozen body content.',
      hero_image_url: FROZEN_HERO_URL,
      category: { slug: 'research' },
      tags: [{ slug: 'ai-agents', name: 'AI agents' }],
      source: { url: 'https://example.com/article', name: 'Example' },
      published_at: null,  // frozen at draft time; real timestamp lives on the row
    },
    ...overrides,
  }
}

describe('syncPublishedArticle — guards', () => {
  beforeEach(() => {
    storedRow = null
    loadError = null
    updateCaptures.length = 0
    publishCalls = []
    publishShouldThrow = null
  })

  it('1. row not found → skipped, no publish', async () => {
    storedRow = null
    const result = await syncPublishedArticle(ARTICLE_ID)
    expect(result).toEqual({ ok: true, status: 'skipped', reason: 'not_found' })
    expect(publishCalls).toHaveLength(0)
    expect(updateCaptures).toHaveLength(0)
  })

  it('2. status≠published → skipped, no publish', async () => {
    storedRow = row({ status: 'pending_review' })
    const result = await syncPublishedArticle(ARTICLE_ID)
    expect(result).toEqual({ ok: true, status: 'skipped', reason: 'not_published' })
    expect(publishCalls).toHaveLength(0)
  })

  it('3. missing external_id → skipped', async () => {
    storedRow = row({ external_id: null })
    const result = await syncPublishedArticle(ARTICLE_ID)
    expect(result).toEqual({ ok: true, status: 'skipped', reason: 'missing_external_id' })
    expect(publishCalls).toHaveLength(0)

    storedRow = row({ external_id: '   ' })
    const result2 = await syncPublishedArticle(ARTICLE_ID)
    expect(result2.status).toBe('skipped')
    if (result2.ok && result2.status === 'skipped') {
      expect(result2.reason).toBe('missing_external_id')
    }
  })

  it('4. missing destination_key → skipped', async () => {
    storedRow = row({ destination_key: null })
    const result = await syncPublishedArticle(ARTICLE_ID)
    expect(result).toEqual({ ok: true, status: 'skipped', reason: 'missing_destination_key' })
    expect(publishCalls).toHaveLength(0)

    storedRow = row({ destination_key: '' })
    const result2 = await syncPublishedArticle(ARTICLE_ID)
    if (result2.ok && result2.status === 'skipped') {
      expect(result2.reason).toBe('missing_destination_key')
    }
  })
})

describe('syncPublishedArticle — payload construction', () => {
  beforeEach(() => {
    storedRow = null
    loadError = null
    updateCaptures.length = 0
    publishCalls = []
    publishShouldThrow = null
  })

  it('5. happy path: live overlays win; frozen body/category/tags/source pass through; published_at:null does NOT leak', async () => {
    storedRow = row()
    const result = await syncPublishedArticle(ARTICLE_ID)

    expect(result).toEqual({ ok: true, status: 'synced' })
    expect(publishCalls).toHaveLength(1)
    expect(publishCalls[0].destinationKey).toBe(DESTINATION)

    const sent = publishCalls[0].payload
    // Live overlays
    expect(sent.title).toBe('Live Title')
    expect(sent.summary).toBe('Live summary.')
    expect(sent.slug).toBe('live-slug')
    expect(sent.hero_image_url).toBe(LIVE_HERO_URL)
    expect(sent.published_at).toBe('2026-06-15T06:54:58.227Z')
    // Frozen passthrough
    expect(sent.body).toBe('Frozen body content.')
    expect(sent.category).toEqual({ slug: 'research' })
    expect(sent.tags).toEqual([{ slug: 'ai-agents', name: 'AI agents' }])
    expect(sent.source).toEqual({ url: 'https://example.com/article', name: 'Example' })
    // Envelope
    expect(sent.version).toBe(1)
    expect(sent.external_id).toBe(EXTERNAL_ID)
  })

  it('6. external_id re-asserted from row even if frozen payload has a stale one', async () => {
    storedRow = row({
      external_id: 'omnira_correct-news-id',
      payload: { ...(row().payload as Record<string, unknown>), external_id: 'omnira_stale-news-id' },
    })
    await syncPublishedArticle(ARTICLE_ID)
    expect(publishCalls).toHaveLength(1)
    expect(publishCalls[0].payload.external_id).toBe('omnira_correct-news-id')
  })

  it('5b. null payload column (defensive): still publishes the live overlays without crashing', async () => {
    storedRow = row({ payload: null })
    const result = await syncPublishedArticle(ARTICLE_ID)
    expect(result.ok).toBe(true)
    expect(publishCalls).toHaveLength(1)
    expect(publishCalls[0].payload.title).toBe('Live Title')
    expect(publishCalls[0].payload.external_id).toBe(EXTERNAL_ID)
  })
})

describe('syncPublishedArticle — failure handling', () => {
  beforeEach(() => {
    storedRow = null
    loadError = null
    updateCaptures.length = 0
    publishCalls = []
    publishShouldThrow = null
  })

  it('7. publishArticle throws → returns failed, no website_content writes', async () => {
    storedRow = row()
    publishShouldThrow = 'PublishError: invalid_category category_not_found'

    const result = await syncPublishedArticle(ARTICLE_ID)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe('failed')
      expect(result.reason).toContain('invalid_category')
    }
    expect(publishCalls).toHaveLength(1)
    // The primitive must NOT touch website_content on failure.
    expect(updateCaptures).toHaveLength(0)
  })

  it('row load error → returns failed with load context', async () => {
    storedRow = null
    loadError = { message: 'connection reset' }
    const result = await syncPublishedArticle(ARTICLE_ID)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('load failed')
      expect(result.reason).toContain('connection reset')
    }
    expect(publishCalls).toHaveLength(0)
  })

  it('8. zero-drift case still sends the payload (PATCH semantics decide; pins no silent skip-on-match optimization)', async () => {
    // Hero URL on row equals hero URL in frozen payload — i.e. no drift.
    storedRow = row({
      hero_image_url: FROZEN_HERO_URL,
      payload: { ...(row().payload as Record<string, unknown>), hero_image_url: FROZEN_HERO_URL },
    })
    const result = await syncPublishedArticle(ARTICLE_ID)
    expect(result).toEqual({ ok: true, status: 'synced' })
    expect(publishCalls).toHaveLength(1)
    expect(publishCalls[0].payload.hero_image_url).toBe(FROZEN_HERO_URL)
  })
})
