/**
 * POST /api/content/articles/jobs/tick — flag, auth, idempotent enqueue,
 * concurrency and social isolation.
 *
 * The fake DB records every call. Any write to a social/media table fails the
 * test, so "the article workflow never creates or restarts a social post" is
 * enforced, not described.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SOCIAL_TABLES = new Set(['media_scripts', 'media_news_items', 'social_posts', 'social_schedule', 'approvals'])
let adminCreated = 0
let rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
let jobsByNews = new Map<string, string>()
let claimQueue: unknown[] = []
let scripts: Array<{ id: string; news_item_id: string; created_at: string }> = []
let writeViolations: string[] = []
let finishCalls = 0

function chain(table: string, rows: unknown[]) {
  const q: Record<string, unknown> = {}
  const self = () => q
  for (const m of ['select', 'eq', 'in', 'not', 'gte', 'lte', 'neq', 'order', 'limit']) q[m] = self
  q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null })
  q.then = (res: (v: unknown) => unknown) => res({ data: rows, error: null })
  for (const w of ['insert', 'update', 'upsert', 'delete']) {
    q[w] = () => { if (SOCIAL_TABLES.has(table)) writeViolations.push(`${w}:${table}`); return q }
  }
  return q
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    adminCreated++
    return {
      from: (table: string) => {
        if (table === 'projects') return chain(table, [{ id: 'p1' }])
        if (table === 'media_scripts') return chain(table, scripts)
        return chain(table, [])
      },
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args })
        if (name === 'website_article_job_enqueue') {
          const key = String(args.p_news_item_id)
          if (jobsByNews.has(key)) return { data: 'exists', error: null }
          if (jobsByNews.size >= Number(args.p_daily_max)) return { data: 'daily_cap', error: null }
          jobsByNews.set(key, `job-${key}`)
          return { data: 'enqueued', error: null }
        }
        if (name === 'website_article_job_claim') return { data: claimQueue.length ? [claimQueue.shift()] : [], error: null }
        if (name === 'website_article_job_finish') { finishCalls++; return { data: true, error: null } }
        return { data: null, error: { message: `unknown rpc ${name}` } }
      },
    }
  },
}))

const runSpy = vi.fn()
vi.mock('@/lib/article/jobs/runner', async (orig) => ({
  ...(await orig<typeof import('@/lib/article/jobs/runner')>()),
  runArticleJob: (...a: unknown[]) => runSpy(...a),
}))

import { POST } from '@/app/api/content/articles/jobs/tick/route'

const authed = () => new Request('http://x/api/content/articles/jobs/tick', { method: 'POST', headers: { authorization: 'Bearer s3cret' } })

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret'
  process.env.THEPROMPT_ARTICLE_JOBS_ENABLED = 'true'
  process.env.THEPROMPT_ARTICLE_JOBS_SINCE = '2026-10-28T00:00:00Z'
  delete process.env.THEPROMPT_ARTICLE_JOBS_DAILY_MAX
  adminCreated = 0; rpcCalls = []; jobsByNews = new Map(); claimQueue = []; writeViolations = []; finishCalls = 0
  scripts = [
    { id: 'ms-1', news_item_id: 'n1', created_at: '2026-10-28T09:00:00Z' },
    { id: 'ms-1b', news_item_id: 'n1', created_at: '2026-10-28T09:05:00Z' }, // same story, rewritten script
    { id: 'ms-2', news_item_id: 'n2', created_at: '2026-10-28T19:00:00Z' },
  ]
  runSpy.mockReset()
  runSpy.mockResolvedValue({ state: 'saved', websiteContentId: 'wc-1', factcheck: 'passed', reason: 'ready_for_review' })
})
afterEach(() => { expect(writeViolations).toEqual([]) })

describe('article job tick route', () => {
  it('rejects missing/incorrect cron secret', async () => {
    expect((await POST(new Request('http://x', { method: 'POST' }))).status).toBe(401)
    expect((await POST(new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer nope' } }))).status).toBe(401)
    expect(adminCreated).toBe(0)
  })

  it.each([undefined, 'false', '1', 'TRUE', ' true'])('flag %s → disabled, no DB client, no run', async (v) => {
    if (v === undefined) delete process.env.THEPROMPT_ARTICLE_JOBS_ENABLED
    else process.env.THEPROMPT_ARTICLE_JOBS_ENABLED = v
    const body = await (await POST(authed())).json()
    expect(body.status).toBe('disabled')
    expect(adminCreated).toBe(0)
    expect(runSpy).not.toHaveBeenCalled()
  })

  it('without THEPROMPT_ARTICLE_JOBS_SINCE nothing is enqueued (no archive backfill)', async () => {
    delete process.env.THEPROMPT_ARTICLE_JOBS_SINCE
    await POST(authed())
    expect(rpcCalls.filter((c) => c.name === 'website_article_job_enqueue')).toHaveLength(0)
  })

  it('one job per news item: duplicate scripts and repeated ticks never enqueue twice', async () => {
    const first = await (await POST(authed())).json()
    expect(first.enqueue).toMatchObject({ scanned: 2, enqueued: 2 })
    const second = await (await POST(authed())).json()
    expect(second.enqueue).toMatchObject({ enqueued: 0, existing: 2 })
    expect(jobsByNews.size).toBe(2)
    const ids = rpcCalls.filter((c) => c.name === 'website_article_job_enqueue').map((c) => c.args.p_external_id)
    expect(new Set(ids)).toEqual(new Set(['omnira_n1', 'omnira_n2']))
  })

  it('daily cap stops enqueueing (cost guard)', async () => {
    process.env.THEPROMPT_ARTICLE_JOBS_DAILY_MAX = '1'
    const body = await (await POST(authed())).json()
    expect(body.enqueue).toMatchObject({ enqueued: 1, capped: 1 })
  })

  it('two concurrent ticks: only the one that claims runs; the other is idle', async () => {
    claimQueue = [{ id: 'job-n1', project_id: 'p1', news_item_id: 'n1', external_id: 'omnira_n1', state: 'running',
      attempts: 1, max_attempts: 3, lease_token: 'L1', checkpoint: {}, media_script_id: 'ms-1', website_content_id: null, last_error: null }]
    const [a, b] = await Promise.all([POST(authed()), POST(authed())])
    const statuses = [(await a.json()).status, (await b.json()).status].sort()
    expect(statuses).toEqual(['idle', 'ran'])
    expect(runSpy).toHaveBeenCalledTimes(1)
    expect(finishCalls).toBe(1)
  })

  it('finish is fenced with the claimed lease token', async () => {
    claimQueue = [{ id: 'job-n1', project_id: 'p1', news_item_id: 'n1', external_id: 'omnira_n1', state: 'running',
      attempts: 1, max_attempts: 3, lease_token: 'L1', checkpoint: {}, media_script_id: null, website_content_id: null, last_error: null }]
    await POST(authed())
    const finish = rpcCalls.find((c) => c.name === 'website_article_job_finish')!
    expect(finish.args).toMatchObject({ p_id: 'job-n1', p_lease_token: 'L1', p_outcome: 'saved', p_website_content_id: 'wc-1' })
  })
})
