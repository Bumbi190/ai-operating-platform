/**
 * Tests for POST /api/content/articles/[id]/hero-image — MVP Commit 4 endpoint contract.
 *
 * The route is a thin wrapper around generateHeroImage(); the underlying logic
 * is exercised by lib/qa/article-hero-image.test.ts. These tests pin the
 * auth/response shape: 401 unauth, 200 ok, 200 skipped, 502 failed, plus the
 * article id flows through to the module.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

let mockUser: { id?: string; email?: string } | null = null
let mockResult:
  | { ok: true; url: string; status: 'ready' }
  | { ok: false; url: null; status: 'failed' | 'skipped'; reason: string }
  | null = null
let receivedArticleId: string | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) },
  }),
}))

vi.mock('@/lib/article/hero-image', () => ({
  generateHeroImage: async (id: string) => {
    receivedArticleId = id
    if (!mockResult) throw new Error('test forgot to set mockResult')
    return mockResult
  },
}))

import { POST } from '@/app/api/content/articles/[id]/hero-image/route'

beforeEach(() => {
  mockUser = null
  mockResult = null
  receivedArticleId = null
})

describe('POST /api/content/articles/[id]/hero-image — MVP Commit 4', () => {
  it('401 when unauthenticated; module never called', async () => {
    mockUser = null
    const req = new Request('http://localhost/x', { method: 'POST' })
    const res = await POST(req, { params: { id: 'article-1' } })
    expect(res.status).toBe(401)
    expect(receivedArticleId).toBeNull()
  })

  it('happy path: 200 with status=ready, url forwarded, article id threaded into module', async () => {
    mockUser = { id: 'u-1', email: 'op@example.com' }
    mockResult = {
      ok: true,
      url: 'https://iboepohjwrhtgshrqaol.supabase.co/storage/v1/object/public/media-assets/images/articles/p1/a1-hero-1234.jpg',
      status: 'ready',
    }
    const req = new Request('http://localhost/x', { method: 'POST' })
    const res = await POST(req, { params: { id: 'article-1' } })
    expect(res.status).toBe(200)
    expect(receivedArticleId).toBe('article-1')
    const json = (await res.json()) as Record<string, unknown>
    expect(json.ok).toBe(true)
    expect(json.status).toBe('ready')
    expect(json.url).toBe(mockResult.url)
  })

  it('skipped (already_generating, paused, etc.): 200 with status=skipped and reason in body', async () => {
    mockUser = { id: 'u-1' }
    mockResult = { ok: false, url: null, status: 'skipped', reason: 'already_generating' }
    const req = new Request('http://localhost/x', { method: 'POST' })
    const res = await POST(req, { params: { id: 'article-2' } })
    expect(res.status).toBe(200)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.ok).toBe(false)
    expect(json.status).toBe('skipped')
    expect(json.reason).toBe('already_generating')
    expect(json.url).toBeNull()
  })

  it('failed (downstream Ideogram/upload error): 502 so fetch().ok flips on the client', async () => {
    mockUser = { id: 'u-1' }
    mockResult = { ok: false, url: null, status: 'failed', reason: 'Ideogram API error 503' }
    const req = new Request('http://localhost/x', { method: 'POST' })
    const res = await POST(req, { params: { id: 'article-3' } })
    expect(res.status).toBe(502)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.ok).toBe(false)
    expect(json.status).toBe('failed')
    expect(json.reason).toBe('Ideogram API error 503')
    expect(json.url).toBeNull()
  })
})
