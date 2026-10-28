/**
 * POST /api/content/articles/[id]/review — fact-check precondition.
 *
 * Proves that a row from the fact-checked workflow can reach publishArticle
 * only after an explicit operator approval AND a passed fact-check bound to
 * the exact body, and that the website's confirmation is what marks it
 * published (with the URL the website returned).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sha256 } from '@/lib/article/factcheck/contract'

let mockRow: Record<string, unknown> | null = null
let mockUser: { id?: string; email?: string } | null = null
let ownedProjectIds: string[] = []
let publishCalls = 0
let publishShouldThrow: Error | null = null
let updates: Array<Record<string, unknown>> = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) } }),
}))
vi.mock('@/lib/atlas/memory/record-event', () => ({ recordMemoryEvent: async () => undefined }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'projects') {
        return { select: () => ({ eq: async (c: string, v: string) => ({ data: c === 'owner_id' && v === mockUser?.id ? ownedProjectIds.map((id) => ({ id })) : [], error: null }) }) }
      }
      if (table !== 'website_content') throw new Error(`unexpected table: ${table}`)
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockRow, error: null }) }) }),
        update: (u: Record<string, unknown>) => { updates.push(u); return { eq: async () => ({ error: null }) } },
      }
    },
  }),
}))
vi.mock('@/lib/publishing/publish', () => ({
  publishArticle: async (_d: string, payload: Record<string, unknown>) => {
    publishCalls++
    if (publishShouldThrow) throw publishShouldThrow
    return { ok: true, id: 'cms-1', external_id: payload.external_id, slug: 's', status: 'published',
      published_at: '2026-10-28T10:00:00.000Z', published_url: 'https://theprompt.nu/articles/s', operation: 'created' }
  },
}))

import { POST } from '@/app/api/content/articles/[id]/review/route'

const BODY = 'According to The Verge, Acme released Model X on Tuesday.'
const passedReport = { version: 1, verdict: 'passed', bodySha256: sha256(BODY), reasons: [], claims: [], sources: [] }

function row(meta: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    id: 'wc-1', project_id: 'p1', status: 'pending_review', destination_key: 'the-prompt', hero_image_url: null,
    payload: { version: 1, external_id: 'omnira_n1', title: 'T', body: BODY },
    qa: { pass: true }, meta, ...extra,
  }
}
const req = (action: string) => new Request('http://x/api/content/articles/wc-1/review', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
})

beforeEach(() => {
  mockUser = { id: 'op-1', email: 'op@example.com' }
  ownedProjectIds = ['p1']
  publishCalls = 0
  publishShouldThrow = null
  updates = []
})

describe('review route fact-check gate', () => {
  it('passed fact-check + explicit approve → publishes and stores the URL the website returned', async () => {
    mockRow = row({ factcheck_required: true, factcheck: passedReport })
    const res = await POST(req('approve'), { params: { id: 'wc-1' } })
    expect(res.status).toBe(200)
    expect(publishCalls).toBe(1)
    expect(updates[0]).toMatchObject({ status: 'published', destination_url: 'https://theprompt.nu/articles/s' })
  })

  it.each([
    ['blocked report', { factcheck_required: true, factcheck: { ...passedReport, verdict: 'blocked' } }, {}, 'factcheck_blocked'],
    ['needs_revision report', { factcheck_required: true, factcheck: { ...passedReport, verdict: 'needs_revision' } }, {}, 'factcheck_needs_revision'],
    ['missing report', { factcheck_required: true }, {}, 'factcheck_missing'],
    ['body edited after check', { factcheck_required: true, factcheck: passedReport },
      { payload: { version: 1, external_id: 'omnira_n1', body: BODY + ' New unchecked claim.' } }, 'factcheck_body_mismatch'],
    ['QA failed', { factcheck_required: true, factcheck: passedReport }, { qa: { pass: false } }, 'article_qa_not_passed'],
  ])('%s → 409, nothing published, row untouched', async (_l, meta, extra, reason) => {
    mockRow = row(meta, extra)
    const res = await POST(req('approve'), { params: { id: 'wc-1' } })
    expect(res.status).toBe(409)
    expect((await res.json()).reason).toBe(reason)
    expect(publishCalls).toBe(0)
    expect(updates).toHaveLength(0)
  })

  it('reject still works on a blocked row (operator can clear it)', async () => {
    mockRow = row({ factcheck_required: true, factcheck: { ...passedReport, verdict: 'blocked' } })
    const res = await POST(req('reject'), { params: { id: 'wc-1' } })
    expect(res.status).toBe(200)
    expect(publishCalls).toBe(0)
    expect(updates[0]).toMatchObject({ status: 'rejected' })
  })

  it('without a session nothing is published', async () => {
    mockUser = null
    mockRow = row({ factcheck_required: true, factcheck: passedReport })
    expect((await POST(req('approve'), { params: { id: 'wc-1' } })).status).toBe(401)
    expect(publishCalls).toBe(0)
  })

  it('a row from another project is not found, even with a passed fact-check', async () => {
    ownedProjectIds = ['other']
    mockRow = row({ factcheck_required: true, factcheck: passedReport })
    expect((await POST(req('approve'), { params: { id: 'wc-1' } })).status).toBe(404)
    expect(publishCalls).toBe(0)
  })

  it('an already published row cannot be approved again', async () => {
    mockRow = row({ factcheck_required: true, factcheck: passedReport }, { status: 'published' })
    expect((await POST(req('approve'), { params: { id: 'wc-1' } })).status).toBe(409)
    expect(publishCalls).toBe(0)
  })

  it('website failure → status failed, never published, no URL stored', async () => {
    publishShouldThrow = new Error('destination down')
    mockRow = row({ factcheck_required: true, factcheck: passedReport })
    const res = await POST(req('approve'), { params: { id: 'wc-1' } })
    expect(res.status).toBe(502)
    expect(updates[0]).toMatchObject({ status: 'failed' })
    expect(updates[0]).not.toHaveProperty('destination_url')
  })

  it('legacy rows without the marker keep their existing behaviour', async () => {
    mockRow = row({ model: 'claude-sonnet-4-6' }, { qa: { pass: false } })
    expect((await POST(req('approve'), { params: { id: 'wc-1' } })).status).toBe(200)
    expect(publishCalls).toBe(1)
  })
})
