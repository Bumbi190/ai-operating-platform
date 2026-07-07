/**
 * Webhook self-reply filter — incident 2026-06-06.
 *
 * Proves that the Instagram/Facebook webhook does NOT queue replies to OUR OWN
 * comments (which caused the self-reply feedback loop). The handler must call
 * comment_replies.upsert for genuine third-party comments, and skip our own.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const upsert = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ upsert }) }),
}))

import { POST } from '@/app/api/webhooks/instagram/route'

const post = (body: unknown) =>
  POST(new Request('http://test/api/webhooks/instagram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))

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
    process.env.IG_SELF_USERNAME = 'theprompt.news'
    process.env.FACEBOOK_PAGE_ID = 'PAGE_123'
  })

  it('A — normal IG user → upsert IS called', async () => {
    await post(igComment({ username: 'random_user', id: '999' }))
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('B — IG self (theprompt.news) → upsert NOT called', async () => {
    await post(igComment({ username: 'theprompt.news', id: '1' }))
    expect(upsert).not.toHaveBeenCalled()
  })

  it('C — FB page self (FACEBOOK_PAGE_ID) → upsert NOT called', async () => {
    await post(fbComment({ name: 'The Prompt', id: 'PAGE_123' }))
    expect(upsert).not.toHaveBeenCalled()
  })
})
