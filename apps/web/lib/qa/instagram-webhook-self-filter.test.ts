/**
 * Webhook self-reply filter — incident 2026-06-06.
 *
 * Proves that the Instagram/Facebook webhook does NOT queue replies to OUR OWN
 * comments (which caused the self-reply feedback loop). The handler must call
 * comment_replies.upsert for genuine third-party comments, and skip our own.
 *
 * QA.1 — why this file needed repairing rather than just fixing one assertion.
 *
 * The handler now verifies the Meta signature before any processing, and does so
 * fail-closed: no META_APP_SECRET, or a missing/invalid x-hub-signature-256, and
 * the request is rejected outright. The fixtures here were written before that
 * control and sent neither, so every request was rejected at the door.
 *
 * Case A failed honestly. Cases B and C did not: they assert that upsert was NOT
 * called, and it could not be called for ANY input while the gate rejected
 * everything. Two thirds of this suite was green while proving nothing, which is
 * worse than the one red test that was visible.
 *
 * So the fixtures are now signed for real, against the production verifier, and
 * every case additionally asserts the handler returned 200 — a status only
 * reachable AFTER signature verification passes. That is what separates
 * "suppressed by the self-filter" from "rejected before the self-filter ran",
 * and it uses an observable the handler already had rather than instrumentation
 * added for the test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'

const upsert = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ upsert }) }),
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

const igComment = (from: Record<string, string>) => ({
  object: 'instagram',
  entry: [{ changes: [{ field: 'comments',
    value: { id: 'c1', text: 'Real third-party comment', media: { id: 'm1' }, from } }] }],
})
const fbComment = (from: Record<string, string>) => ({
  object: 'page',
  entry: [{ changes: [{ field: 'feed',
    value: { item: 'comment', comment_id: 'fc1', message: 'Real third-party comment', post_id: 'p1', from } }] }],
})

describe('instagram webhook — self-reply filter', () => {
  beforeEach(() => {
    upsert.mockClear()
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
    process.env.META_APP_SECRET = TEST_SECRET
    process.env.IG_SELF_USERNAME = 'theprompt.news'
    process.env.FACEBOOK_PAGE_ID = 'PAGE_123'
    delete process.env.IG_SELF_ACCOUNT_ID
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const prior = savedEnv[key]
      if (prior === undefined) delete process.env[key]
      else process.env[key] = prior
    }
    savedEnv = {}
  })

  it('A — normal IG user → upsert IS called', async () => {
    const res = await post(igComment({ username: 'random_user', id: '999' }))
    expect(res.status).toBe(200)
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('B — IG self (theprompt.news) → upsert NOT called', async () => {
    const res = await post(igComment({ username: 'theprompt.news', id: '1' }))
    // 200 proves the request cleared signature verification, so the only thing
    // left that can have suppressed the write is the self-filter.
    expect(res.status).toBe(200)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('C — FB page self (FACEBOOK_PAGE_ID) → upsert NOT called', async () => {
    const res = await post(fbComment({ name: 'The Prompt', id: 'PAGE_123' }))
    expect(res.status).toBe(200)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('the 200 above actually discriminates — an unsigned request never gets one', async () => {
    // Guards the guard. Without this, "status 200" in B and C could be asserting
    // something the handler returns regardless, and the suite would be vacuous
    // again in a new way. Scoped deliberately to the observable those two cases
    // rely on; this is not webhook-security coverage.
    const res = await post(igComment({ username: 'random_user', id: '999' }), { sign: false })
    expect(res.status).not.toBe(200)
    expect(upsert).not.toHaveBeenCalled()
  })
})
