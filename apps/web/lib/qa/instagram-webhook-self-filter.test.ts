/**
 * Webhook self-reply filter — incident 2026-06-06, re-anchored on verified bindings
 * (project-scoped social credentials, 2026-09-14).
 *
 * Proves that the Instagram/Facebook webhook does NOT queue replies to OUR OWN
 * comments (which caused the self-reply feedback loop). The handler must call
 * comment_replies.upsert for genuine third-party comments, and skip our own.
 *
 * WHO "OUR OWN" IS. It used to come from environment variables and a hard-coded
 * handle (IG_SELF_USERNAME defaulting to theprompt.news, IG_SELF_ACCOUNT_ID,
 * FACEBOOK_PAGE_ID) — one global identity for every project. It now comes only from
 * the project's verified account binding: the Instagram account Meta names in the
 * entry, or the binding of the project whose own post was commented on; the Facebook
 * page Meta names in the entry. A comment for an account with no verified binding is
 * not queued at all.
 *
 * QA.1 — the fixtures are signed for real, against the production verifier, and every
 * case asserts the handler returned 200 — a status only reachable AFTER signature
 * verification passes. That separates "suppressed by the self-filter" from "rejected
 * before the self-filter ran".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROJECT = '11111111-1111-4111-8111-111111111111'
const IG_ACCOUNT = '17841400000000001'
const PAGE = '1000000000000001'

const upsert = vi.fn().mockResolvedValue({ error: null })
let SCRIPTS: Record<string, string> = {}
let BINDINGS: Array<{ projectId: string; platform: string; externalAccountId: string; accountLabel: string | null }> = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => table === 'media_scripts'
      ? {
          select: () => ({
            eq: (_column: string, mediaId: string) => ({
              maybeSingle: async () => ({ data: SCRIPTS[mediaId] ? { project_id: SCRIPTS[mediaId] } : null, error: null }),
            }),
          }),
        }
      : { upsert },
  }),
}))

vi.mock('@/lib/media/social-bindings', () => ({
  isProjectId: (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
  readActiveBindingForAccount: async (platform: string, accountId: string) =>
    ({ ok: true, binding: BINDINGS.find(b => b.platform === platform && b.externalAccountId === accountId) ?? null }),
  readActiveBinding: async (projectId: string, platform: string) =>
    ({ ok: true, binding: BINDINGS.find(b => b.projectId === projectId && b.platform === platform) ?? null }),
}))

import { POST } from '@/app/api/webhooks/instagram/route'

/** Synthetic and deterministic. Never a developer's real secret. */
const TEST_SECRET = 'qa1-synthetic-webhook-secret-not-a-real-credential'

const ENV_KEYS = [
  'META_APP_SECRET',
  'IG_SELF_USERNAME',
  'IG_SELF_ACCOUNT_ID',
  'FACEBOOK_PAGE_ID',
] as const

/** Saved so this suite cannot leak its secret into unrelated suites. */
let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

/**
 * Sign and send. The bytes signed and the bytes sent are the SAME string —
 * serialising twice would produce a valid-looking header over different bytes
 * and the gate would reject it for a reason the test never intended.
 */
function post(body: unknown, opts: { sign?: boolean } = {}) {
  const raw = JSON.stringify(body)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.sign !== false) {
    const digest = createHmac('sha256', TEST_SECRET).update(raw, 'utf8').digest('hex')
    headers['x-hub-signature-256'] = `sha256=${digest}`
  }
  return POST(new Request('http://test/api/webhooks/instagram', {
    method: 'POST',
    headers,
    body: raw,
  }))
}

const igComment = (from: Record<string, string>, opts: { media?: string; entryId?: string } = {}) => ({
  object: 'instagram',
  entry: [{
    ...(opts.entryId ? { id: opts.entryId } : {}),
    changes: [{ field: 'comments',
      value: { id: 'c1', text: 'Real third-party comment', media: { id: opts.media ?? 'm1' }, from } }],
  }],
})
const fbComment = (from: Record<string, string>, pageId: string = PAGE) => ({
  object: 'page',
  entry: [{ id: pageId, changes: [{ field: 'feed',
    value: { item: 'comment', comment_id: 'fc1', message: 'Real third-party comment', post_id: 'p1', from } }] }],
})

describe('instagram webhook — self-reply filter from verified bindings', () => {
  beforeEach(() => {
    upsert.mockClear()
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
    process.env.META_APP_SECRET = TEST_SECRET
    delete process.env.IG_SELF_USERNAME
    delete process.env.IG_SELF_ACCOUNT_ID
    delete process.env.FACEBOOK_PAGE_ID
    SCRIPTS = { m1: PROJECT }
    BINDINGS = [
      { projectId: PROJECT, platform: 'instagram', externalAccountId: IG_ACCOUNT, accountLabel: 'theprompt.news' },
      { projectId: PROJECT, platform: 'facebook', externalAccountId: PAGE, accountLabel: 'The Prompt' },
    ]
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const prior = savedEnv[key]
      if (prior === undefined) delete process.env[key]
      else process.env[key] = prior
    }
    savedEnv = {}
  })

  it('A — a third-party comment on the project\'s own post → upsert IS called', async () => {
    const res = await post(igComment({ username: 'random_user', id: '999' }))
    expect(res.status).toBe(200)
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('B — the bound account\'s attested username → upsert NOT called', async () => {
    const res = await post(igComment({ username: 'theprompt.news', id: '1' }))
    // 200 proves the request cleared signature verification, so the only thing
    // left that can have suppressed the write is the self-filter.
    expect(res.status).toBe(200)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('B2 — the bound account\'s own id → upsert NOT called', async () => {
    const res = await post(igComment({ username: 'someone-else', id: IG_ACCOUNT }))
    expect(res.status).toBe(200)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('B3 — the account Meta names in the entry decides, even for a post Omnira did not publish', async () => {
    SCRIPTS = {}
    const third = await post(igComment({ username: 'random_user', id: '999' }, { media: 'not-ours', entryId: IG_ACCOUNT }))
    expect(third.status).toBe(200)
    expect(upsert).toHaveBeenCalledTimes(1)
    upsert.mockClear()
    const self = await post(igComment({ username: 'theprompt.news', id: '1' }, { media: 'not-ours', entryId: IG_ACCOUNT }))
    expect(self.status).toBe(200)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('B4 — no verified binding can be established → nothing is queued (fail closed)', async () => {
    SCRIPTS = {}
    const res = await post(igComment({ username: 'random_user', id: '999' }, { media: 'not-ours', entryId: '17849999999999999' }))
    expect(res.status).toBe(200)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('B5 — a bound post of a project without an Instagram binding → nothing is queued', async () => {
    BINDINGS = BINDINGS.filter(b => b.platform !== 'instagram')
    const res = await post(igComment({ username: 'random_user', id: '999' }))
    expect(res.status).toBe(200)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('C — the bound page\'s own comment → upsert NOT called', async () => {
    const res = await post(fbComment({ name: 'The Prompt', id: PAGE }))
    expect(res.status).toBe(200)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('C2 — a third-party comment on the bound page → upsert IS called', async () => {
    const res = await post(fbComment({ name: 'Someone', id: '555' }))
    expect(res.status).toBe(200)
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('C3 — a comment for a page with no verified binding → nothing is queued', async () => {
    const res = await post(fbComment({ name: 'Someone', id: '555' }, '2000000000000002'))
    expect(res.status).toBe(200)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('D — identity never comes from the environment any more', async () => {
    process.env.IG_SELF_USERNAME = 'random_user'
    process.env.IG_SELF_ACCOUNT_ID = '999'
    process.env.FACEBOOK_PAGE_ID = '555'
    await post(igComment({ username: 'random_user', id: '999' }))
    await post(fbComment({ name: 'Someone', id: '555' }))
    expect(upsert, 'environment variables must not make a third party look like us').toHaveBeenCalledTimes(2)

    const source = readFileSync(resolve(__dirname, '../../app/api/webhooks/instagram/route.ts'), 'utf8')
    for (const legacy of ['IG_SELF_USERNAME', 'IG_SELF_ACCOUNT_ID', 'FACEBOOK_PAGE_ID', "'theprompt.news'"]) {
      expect(source, legacy).not.toContain(legacy)
    }
  })

  it('the 200 above actually discriminates — an unsigned request never gets one', async () => {
    // Guards the guard. Without this, "status 200" in the cases above could be
    // asserting something the handler returns regardless.
    const res = await post(igComment({ username: 'random_user', id: '999' }), { sign: false })
    expect(res.status).not.toBe(200)
    expect(upsert).not.toHaveBeenCalled()
  })
})
