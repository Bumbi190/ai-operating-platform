/**
 * Website-article jobs against a REAL, ISOLATED database: PostgreSQL 17 +
 * PostgREST in throwaway containers, with the real repo.ts, store.ts and
 * runArticleJob. Only the paid/external calls (writer, reviewer, reviser,
 * Hermes reads) are fakes, so nothing is spent and nothing leaves the machine.
 *
 * ── SAFETY ─────────────────────────────────────────────────────────────────
 * Skipped unless ARTICLE_JOBS_IT_REST points at a loopback PostgREST that the
 * driver started (docs/workflows/proposed-migrations/...integration.sh). The
 * test refuses any non-loopback URL and overwrites the Supabase env for this
 * process only, so the admin client can only reach the throwaway stack.
 */

import { createHmac } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PostgrestClient } from '@supabase/postgrest-js'
import { runArticleJob, type ArticleJobDeps } from '@/lib/article/jobs/runner'
import {
  claimArticleJob, createArticleJobDeps, enqueueFromSocialSelections, finishArticleJob, resolveSystemAProjectId,
} from '@/lib/article/jobs/repo'
import type { ArticleJob, ArticleJobCheckpoint } from '@/lib/article/jobs/types'
import type { ArticleJobsConfig } from '@/lib/article/jobs/config'
import { publicationGate } from '@/lib/article/factcheck/gate'
import type { ArticleDraft } from '@/lib/article/types'

const REST = process.env.ARTICLE_JOBS_IT_REST ?? ''
const SECRET = process.env.ARTICLE_JOBS_IT_JWT_SECRET ?? ''
const ENABLED = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(REST) && SECRET.length >= 32

function serviceJwt(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64({ role: 'service_role', iss: 'article-jobs-it', exp: Math.floor(Date.now() / 1000) + 3600 })
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

// ── fixtures (no fact signals in the filler, so coverage applies to the claims only) ──
const SOURCE_TEXT =
  'Acme released Model X on Tuesday, according to the company. The model costs $2 per million input tokens. ' +
  'Acme said availability starts in the United States and expands to Europe next quarter. '.repeat(8)
const TITLE = 'Acme releases Model X'
const SUMMARY = 'Acme released Model X on Tuesday.'
function body(): string {
  const words = ['enterprise', 'consumer', 'developer', 'education', 'research', 'startup', 'cloud', 'mobile', 'hardware']
  const filler = Array.from({ length: 90 }, (_, i) =>
    `This suggests that pricing pressure in the ${words[i % words.length]} segment will shape how rivals respond over time.`).join(' ')
  return ['According to The Verge, Acme released Model X on Tuesday.', 'The model costs $2 per million input tokens.', filler].join('\n\n')
}
function draft(): ArticleDraft {
  const b = body()
  return {
    title: TITLE, summary: SUMMARY, body: b, category: 'models',
    tags: [{ slug: 'acme', name: 'Acme' }, { slug: 'models', name: 'Models' }, { slug: 'pricing', name: 'Pricing' }],
    hero_image_prompt: null, source_name: 'The Verge', source_url: 'https://www.theverge.com/acme',
    _meta: { grounding: 'strong', tier: 'deep', model: 'fake', tokensIn: 1, tokensOut: 1, estCostUsd: 0.05,
      bodyWordCount: b.trim().split(/\s+/).length },
  }
}
const ok = (sentence: string, quote: string) => ({
  sentence, claim: sentence, importance: 'central', verdict: 'supported', note: '', evidence: [{ sourceId: 's1', exactQuote: quote }],
})
const CLAIMS = [
  ok('According to The Verge, Acme released Model X on Tuesday.', 'Acme released Model X on Tuesday'),
  ok('The model costs $2 per million input tokens.', 'costs $2 per million input tokens'),
  ok(TITLE, 'Acme released Model X on Tuesday'),
  ok(SUMMARY, 'Acme released Model X on Tuesday'),
]

const CFG: ArticleJobsConfig = {
  enabled: true, since: '2000-01-01T00:00:00.000Z', dailyMax: 6, maxAttempts: 3, leaseSeconds: 600, deferMinutes: 60,
}

let db: PostgrestClient
let proxy: Server
let projectId: string

/** Real deps; only the paid/external calls are fakes that count their calls. */
function workerDeps(latest: { checkpoint: ArticleJobCheckpoint | null }, over: Partial<ArticleJobDeps> = {}) {
  const calls = { write: 0, review: 0, revise: 0, read: 0 }
  const deps: ArticleJobDeps = {
    ...createArticleJobDeps(db, CFG, latest),
    readSource: async (url) => { calls.read++; return { success: true, url, title: 'Origin', text: SOURCE_TEXT } },
    write: async () => { calls.write++; return { draft: draft() } },
    review: async () => { calls.review++; return { claims: CLAIMS, model: 'fake', costUsd: 0.1 } },
    revise: async () => { calls.revise++; throw new Error('revise must not be needed') },
    ...over,
  }
  return { deps, calls }
}

async function newSelection(): Promise<string> {
  const newsId = crypto.randomUUID()
  const { error: e1 } = await db.from('media_news_items').insert({
    id: newsId, project_id: projectId, title: 'Acme ships Model X', url: 'https://www.theverge.com/acme', source_name: 'The Verge',
  })
  const { error: e2 } = await db.from('media_scripts').insert({ project_id: projectId, news_item_id: newsId, status: 'approved' })
  if (e1 || e2) throw new Error(`fixture insert failed: ${(e1 ?? e2)!.message}`)
  return newsId
}

async function contentRows(newsId: string) {
  const { data, error } = await db.from('website_content').select('id, status, title, payload, qa, meta, updated_at')
    .eq('external_id', `omnira_${newsId}`)
  if (error) throw new Error(error.message)
  return data as Array<Record<string, unknown>>
}
async function jobFor(newsId: string) {
  const { data } = await db.from('website_article_jobs').select('*').eq('news_item_id', newsId).single()
  return data as ArticleJob & { website_content_id: string | null }
}
/** Claim until we get the job for this news item (other tests' jobs are finished first). */
async function claimFor(newsId: string): Promise<ArticleJob | null> {
  const job = await claimArticleJob(db, CFG)
  if (job && job.news_item_id !== newsId) throw new Error('claimed an unexpected job; tests must finish their jobs')
  return job
}

describe.runIf(ENABLED)('article jobs on an isolated PostgreSQL 17 + PostgREST', () => {
  beforeAll(async () => {
    // supabase-js (used inside store.ts) talks to <url>/rest/v1; PostgREST serves at /. Strip the prefix.
    proxy = createServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const target = REST + (req.url ?? '/').replace(/^\/rest\/v1/, '')
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'content-length', 'connection'].includes(k))) as Record<string, string>
      const r = await fetch(target, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined })
      res.writeHead(r.status, Object.fromEntries([...r.headers].filter(([k]) => !['content-encoding', 'transfer-encoding', 'content-length'].includes(k))))
      res.end(Buffer.from(await r.arrayBuffer()))
    })
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
    const port = (proxy.address() as AddressInfo).port
    const jwt = serviceJwt()
    // This process only: the admin client inside store.ts can reach nothing but the throwaway stack.
    process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`
    process.env.SUPABASE_SERVICE_ROLE_KEY = jwt
    db = new PostgrestClient(REST, { headers: { Authorization: `Bearer ${jwt}`, apikey: jwt } })
    const probe = await db.from('projects').select('id').limit(1)
    if (probe.error) throw new Error(`isolated PostgREST not usable: ${probe.error.message}`)
    projectId = (await resolveSystemAProjectId(db))!
    expect(projectId).toBeTruthy()
  })
  afterAll(async () => { await new Promise<void>((r) => proxy?.close(() => r())) })
  // Each test owns its job: anything a failed test left open is closed so it cannot leak into the next one.
  afterEach(async () => {
    await db.from('website_article_jobs').update({ state: 'cancelled', lease_token: null, lease_expires_at: null })
      .in('state', ['queued', 'running'])
  })

  it('I1 happy path: enqueue → claim → run → save once → finish; the stored row passes the gate', async () => {
    const newsId = await newSelection()
    const enq = await enqueueFromSocialSelections(db, projectId, CFG)
    expect(enq.enqueued).toBe(1)
    const job = (await claimFor(newsId))!
    const latest = { checkpoint: job.checkpoint ?? null }
    const { deps, calls } = workerDeps(latest)
    const out = await runArticleJob(job, deps)
    expect(out).toMatchObject({ state: 'saved', factcheck: 'passed' })
    expect(await finishArticleJob(db, job, out, latest.checkpoint, CFG)).toBe(true)
    expect(calls).toMatchObject({ write: 1, review: 1, revise: 0 })
    const rows = await contentRows(newsId)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('pending_review')
    expect(publicationGate(rows[0] as { payload: unknown; qa: unknown; meta: unknown })).toEqual({ ok: true })
    const j = await jobFor(newsId)
    expect(j.state).toBe('saved')
    expect(j.website_content_id).toBe(rows[0].id)
    // A re-trigger of the same selection creates nothing.
    expect((await enqueueFromSocialSelections(db, projectId, CFG)).enqueued).toBe(0)
  })

  it('I2 lease taken over right before the final save: the stale worker writes NOTHING; the new owner saves once, with zero AI calls', async () => {
    const newsId = await newSelection()
    await enqueueFromSocialSelections(db, projectId, CFG)
    const jobA = (await claimFor(newsId))!
    const latestA = { checkpoint: jobA.checkpoint ?? null }
    let jobB: ArticleJob | null = null
    const a = workerDeps(latestA)
    const realSave = a.deps.save
    a.deps.save = async (args) => {
      // Worker A has finished every paid step and checkpointed. Its lease now expires and worker B takes over.
      await db.from('website_article_jobs').update({ lease_expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', jobA.id)
      jobB = await claimFor(newsId)
      expect(jobB?.id).toBe(jobA.id)
      expect(jobB?.lease_token).not.toBe(jobA.lease_token)
      return realSave(args)
    }
    const outA = await runArticleJob(jobA, a.deps)
    const afterA = await contentRows(newsId)
    expect({ outcome: outA.state, staleRowsWritten: afterA.length }).toEqual({ outcome: 'lease_lost', staleRowsWritten: 0 })
    expect(await finishArticleJob(db, jobA, outA, latestA.checkpoint, CFG)).toBe(false)

    const latestB = { checkpoint: jobB!.checkpoint ?? null }
    const b = workerDeps(latestB)
    const outB = await runArticleJob(jobB!, b.deps)
    expect(outB).toMatchObject({ state: 'saved', factcheck: 'passed' })
    expect(b.calls).toMatchObject({ write: 0, review: 0, revise: 0, read: 0 })   // resumed from A's checkpoint
    expect(await finishArticleJob(db, jobB!, outB, latestB.checkpoint, CFG)).toBe(true)
    expect(await contentRows(newsId)).toHaveLength(1)
    expect((await jobFor(newsId)).state).toBe('saved')
  })

  it('I3 lease expired but not yet reclaimed at save: no write; the next claim resumes and saves with zero AI calls', async () => {
    const newsId = await newSelection()
    await enqueueFromSocialSelections(db, projectId, CFG)
    const jobA = (await claimFor(newsId))!
    const latestA = { checkpoint: jobA.checkpoint ?? null }
    const a = workerDeps(latestA)
    const realSave = a.deps.save
    a.deps.save = async (args) => {
      await db.from('website_article_jobs').update({ lease_expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', jobA.id)
      return realSave(args)
    }
    const outA = await runArticleJob(jobA, a.deps)
    expect(outA.state).toBe('lease_lost')
    expect(await contentRows(newsId)).toHaveLength(0)
    await finishArticleJob(db, jobA, outA, latestA.checkpoint, CFG)

    const jobB = (await claimFor(newsId))!
    const latestB = { checkpoint: jobB.checkpoint ?? null }
    const b = workerDeps(latestB)
    const outB = await runArticleJob(jobB, b.deps)
    expect(outB.state).toBe('saved')
    expect(b.calls).toMatchObject({ write: 0, review: 0 })
    await finishArticleJob(db, jobB, outB, latestB.checkpoint, CFG)
    expect(await contentRows(newsId)).toHaveLength(1)
  })

  it('I4 two ticks at once on one job: exactly one claims it', async () => {
    const newsId = await newSelection()
    await enqueueFromSocialSelections(db, projectId, CFG)
    const [x, y] = await Promise.all([claimArticleJob(db, CFG), claimArticleJob(db, CFG)])
    expect([x, y].filter((j) => j?.news_item_id === newsId)).toHaveLength(1)
    expect([x, y].filter(Boolean)).toHaveLength(1)
    const job = (x ?? y)!
    const latest = { checkpoint: job.checkpoint ?? null }
    const out = await runArticleJob(job, workerDeps(latest).deps)
    await finishArticleJob(db, job, out, latest.checkpoint, CFG)
    expect(await contentRows(newsId)).toHaveLength(1)
  })

  it('I5 an existing published article is never overwritten by a job', async () => {
    const newsId = await newSelection()
    const { error } = await db.from('website_content').insert({
      project_id: projectId, external_id: `omnira_${newsId}`, title: 'Published by the owner', status: 'published',
      payload: { version: 1, external_id: `omnira_${newsId}`, title: 'Published by the owner' },
    })
    expect(error).toBeNull()
    const before = await contentRows(newsId)
    await enqueueFromSocialSelections(db, projectId, CFG)
    const job = (await claimFor(newsId))!
    const latest = { checkpoint: job.checkpoint ?? null }
    const out = await runArticleJob(job, workerDeps(latest).deps)
    expect(out).toEqual({ state: 'blocked', reason: 'existing_row_published' })
    await finishArticleJob(db, job, out, latest.checkpoint, CFG)
    expect(await contentRows(newsId)).toEqual(before)
  })
})
