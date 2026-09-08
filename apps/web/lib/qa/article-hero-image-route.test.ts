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

/**
 * The ownership guard (Phase 9D) reads the article's project and the caller's
 * allowed projects through the SERVICE-ROLE client, so the admin client has to
 * be mocked too. `mockArticle` is the row the route finds by id; `mockOwned`
 * is the caller's allow-list. Setting them apart is how a foreign article is
 * expressed.
 */
let mockArticle: { id: string; project_id: string } | null = null
let mockOwned: string[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'projects') {
        // getAllowedProjectIds: select('id').eq('owner_id', userId)
        return {
          select: () => ({ eq: async () => ({ data: mockOwned.map(id => ({ id })), error: null }) }),
        }
      }
      // website_content: select(...).eq('id', …).maybeSingle()
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: mockArticle, error: null }) }),
        }),
      }
    },
  }),
}))

let receivedExecution: unknown = null

vi.mock('@/lib/article/hero-image', () => ({
  // G3C-1: the route now supplies an explicit execution contract as the first
  // argument, so the mock captures it too — the route must classify, not the
  // module it calls.
  generateHeroImage: async (context: unknown, id: string) => {
    receivedExecution = context
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
  // Default: the article exists and belongs to the caller, so the pre-existing
  // response-shape tests below exercise the same paths they always did.
  mockArticle = { id: 'article-1', project_id: 'p-mine' }
  mockOwned = ['p-mine']
})

describe('POST /api/content/articles/[id]/hero-image — MVP Commit 4', () => {
  // ── Phase 9D · a directly addressable id is not an authorization ──────────

  it('404 when the article belongs to another project; module NEVER called', async () => {
    // The detail page only renders this button for an owned article, but the
    // request can be made without the page. Hiding a control is not a check.
    mockUser = { id: 'u-1', email: 'op@example.com' }
    mockArticle = { id: 'article-1', project_id: 'p-theirs' }
    mockOwned = ['p-mine']
    const res = await POST(new Request('http://localhost/x', { method: 'POST' }), { params: { id: 'article-1' } })
    expect(res.status).toBe(404)
    // The paid generation must not run for a foreign article.
    expect(receivedArticleId).toBeNull()
  })

  it('a foreign article is INDISTINGUISHABLE from a nonexistent one', async () => {
    mockUser = { id: 'u-1', email: 'op@example.com' }

    mockArticle = { id: 'article-1', project_id: 'p-theirs' }
    mockOwned = ['p-mine']
    const foreign = await POST(new Request('http://localhost/x', { method: 'POST' }), { params: { id: 'article-1' } })

    mockArticle = null
    const missing = await POST(new Request('http://localhost/x', { method: 'POST' }), { params: { id: 'nope' } })

    expect(foreign.status).toBe(missing.status)
    expect(await foreign.json()).toEqual(await missing.json())
  })

  it('an EMPTY allow-list fails closed — nothing is owned', async () => {
    mockUser = { id: 'u-1', email: 'op@example.com' }
    mockArticle = { id: 'article-1', project_id: 'p-mine' }
    mockOwned = []
    const res = await POST(new Request('http://localhost/x', { method: 'POST' }), { params: { id: 'article-1' } })
    expect(res.status).toBe(404)
    expect(receivedArticleId).toBeNull()
  })

  it('401 is still decided BEFORE any ownership read', async () => {
    mockUser = null
    mockArticle = { id: 'article-1', project_id: 'p-mine' }
    mockOwned = ['p-mine']
    const res = await POST(new Request('http://localhost/x', { method: 'POST' }), { params: { id: 'article-1' } })
    expect(res.status).toBe(401)
  })

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
    // The ROUTE owns the classification: a session-authenticated hero-image
    // request is human-requested EXECUTION, never interactive assistance.
    // The route declares WHY; the article's own project supplies WHICH — the
    // helper derives the scope from the row it loads, so a caller cannot name a
    // project the article does not belong to.
    expect(receivedExecution).toBe('OPERATOR_EXECUTION')
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
