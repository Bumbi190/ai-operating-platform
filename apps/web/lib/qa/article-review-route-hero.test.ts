/**
 * MVP Commit 5: verify the operator approve route threads
 * website_content.hero_image_url into the publish payload before calling
 * publishArticle('the-prompt', payload).
 *
 * Scope: ONLY the payload threading. The route's auth, reject path, error
 * handling, and 200/502 responses are unchanged from before and remain
 * uncovered by this file by design.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

let mockRow: Record<string, unknown> | null = null
let mockUser: { id?: string; email?: string } | null = null
let capturedDestination: string | null = null
let capturedPayload: Record<string, unknown> | null = null
let publishShouldThrow: Error | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'website_content') throw new Error(`unexpected table: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockRow, error: null }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }
    },
  }),
}))

vi.mock('@/lib/publishing/publish', () => ({
  publishArticle: async (destinationKey: string, payload: Record<string, unknown>) => {
    capturedDestination = destinationKey
    capturedPayload = payload
    if (publishShouldThrow) throw publishShouldThrow
    return {
      ok: true,
      id: 'cms-id-1',
      external_id: 'omnira_news-1',
      slug: 'test-article',
      status: 'published',
      published_at: '2026-06-14T00:00:00.000Z',
      published_url: 'https://the-prompt.example/articles/test-article',
      operation: 'created',
    }
  },
}))

// publish/types exports PublishError (named import in the route). Re-export from real module.
// (no mock — the route just constructs payload objects, doesn't throw PublishError itself)

import { POST } from '@/app/api/content/articles/[id]/review/route'

const ARTICLE_ID = 'article-uuid-1'
const PAYLOAD_BASE = {
  version: 1,
  external_id: 'omnira_news-1',
  title: 'Test Article',
  summary: 'Summary',
  body: 'Body content',
  category: { slug: 'news' },
  tags: [],
  published_at: null,
}

function makeApproveRequest(): Request {
  return new Request('http://localhost/api/content/articles/x/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'approve' }),
  })
}

describe('POST /review — MVP Commit 5: hero_image_url threading', () => {
  beforeEach(() => {
    mockRow = null
    mockUser = { id: 'op-1', email: 'op@example.com' }
    capturedDestination = null
    capturedPayload = null
    publishShouldThrow = null
  })

  it('threads hero_image_url=<url> when website_content.hero_image_url is set', async () => {
    const HERO_URL =
      'https://iboepohjwrhtgshrqaol.supabase.co/storage/v1/object/public/media-assets/images/articles/p1/a1-hero-1234.jpg'
    mockRow = {
      id: ARTICLE_ID,
      status: 'pending_review',
      destination_key: 'the-prompt',
      payload: { ...PAYLOAD_BASE },
      hero_image_url: HERO_URL,
    }
    const res = await POST(makeApproveRequest(), { params: { id: ARTICLE_ID } })
    expect(res.status).toBe(200)
    expect(capturedDestination).toBe('the-prompt')
    expect(capturedPayload).not.toBeNull()
    expect(capturedPayload!.hero_image_url).toBe(HERO_URL)
    expect(capturedPayload!.title).toBe('Test Article')
    expect(typeof capturedPayload!.published_at).toBe('string')
  })

  it('threads hero_image_url=null when website_content.hero_image_url is null (CMS clears field)', async () => {
    mockRow = {
      id: ARTICLE_ID,
      status: 'pending_review',
      destination_key: 'the-prompt',
      payload: { ...PAYLOAD_BASE },
      hero_image_url: null,
    }
    const res = await POST(makeApproveRequest(), { params: { id: ARTICLE_ID } })
    expect(res.status).toBe(200)
    expect(capturedPayload).not.toBeNull()
    // Key is PRESENT and explicitly null — the CMS's three-way semantics will
    // then clear the destination column rather than preserve a stale value.
    expect('hero_image_url' in capturedPayload!).toBe(true)
    expect(capturedPayload!.hero_image_url).toBeNull()
  })

  it('row.hero_image_url WINS over a value embedded in payload jsonb (live > snapshot)', async () => {
    const ROW_HERO =
      'https://iboepohjwrhtgshrqaol.supabase.co/storage/v1/object/public/media-assets/images/articles/p1/a1-hero-NEW.jpg'
    mockRow = {
      id: ARTICLE_ID,
      status: 'pending_review',
      destination_key: 'the-prompt',
      payload: { ...PAYLOAD_BASE, hero_image_url: 'https://old.example/stale.jpg' },
      hero_image_url: ROW_HERO,
    }
    const res = await POST(makeApproveRequest(), { params: { id: ARTICLE_ID } })
    expect(res.status).toBe(200)
    expect(capturedPayload!.hero_image_url).toBe(ROW_HERO)
  })

  it('reject path: hero_image_url is not threaded (publishArticle never called)', async () => {
    mockRow = {
      id: ARTICLE_ID,
      status: 'pending_review',
      destination_key: 'the-prompt',
      payload: { ...PAYLOAD_BASE },
      hero_image_url: 'https://example/hero.jpg',
    }
    const rejectReq = new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'reject', notes: 'off-brand' }),
    })
    const res = await POST(rejectReq, { params: { id: ARTICLE_ID } })
    expect(res.status).toBe(200)
    expect(capturedPayload).toBeNull()
    expect(capturedDestination).toBeNull()
  })
})
