/**
 * Insights recovery (2026-09-15) — the daily insights run is bounded and truthful.
 *
 * Production 2026-09-15 09:00 UTC: 504 after 60 s. Read back from media_insights, the
 * same stop at 09:01:04 happened on every observed day since 2026-09-11. Posts were
 * fetched one at a time: Instagram's 80, then Facebook until Vercel stopped the function.
 * YouTube and the opportunity pass were never reached, and nothing was reported. These
 * tests pin the contract that replaces it:
 *
 *   · RUNTIME — the route's maxDuration covers the work budget, the slowest post and the
 *     opportunity pass; every provider request the run makes carries a timeout no longer
 *     than INSIGHTS_REQUEST_TIMEOUT_MS.
 *   · WORKLOAD — at most INSIGHTS_LIMIT posts per platform per project (YouTube: across
 *     projects), newest first, and at most INSIGHTS_CONCURRENCY in flight.
 *   · TRUTH — `complete` only when every selected post was fetched and written. A
 *     deadline, a refused post, a failed write, a failed read, a refused credential or
 *     unreadable bindings make the run incomplete and say where; the route answers 200
 *     only for a complete run whose opportunity pass ran.
 *   · SCOPE — every project is measured with its own verified credential, never another's.
 *   · FUNCTIONALITY — Instagram, Facebook and YouTube rows and the opportunity pass, as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  INSIGHTS_CONCURRENCY,
  INSIGHTS_LIMIT,
  INSIGHTS_MAX_CALLS_PER_POST,
  INSIGHTS_OPPORTUNITIES_BUDGET_MS,
  INSIGHTS_REQUEST_TIMEOUT_MS,
  INSIGHTS_WORK_BUDGET_MS,
  refreshAllInsights,
} from '@/lib/media/insights'
import * as route from '@/app/api/media/cron/insights/route'

const PROMPT = '33333333-3333-4333-8333-333333333333'
const FAMILY = '44444444-4444-4444-8444-444444444444'
const CRON = 'test-cron-secret'
/** A credential that a provider error message echoes back. It must never leave the run. */
const LEAKED = 'IGAAsecretvalue123'

type Row = Record<string, any>

let SCRIPTS: Row[] = []
let UPSERTS: Row[] = []
let WRITE_FAILS = new Set<string>()
let READ_FAILS = new Set<string>()
let PROVIDER_REFUSES: string[] = []
let BINDINGS: { ok: true; bindings: Row[] } | { ok: false } = { ok: true, bindings: [] }
let RESOLUTIONS: string[] = []
let REFUSALS: Record<string, string> = {}
let FETCHES: { url: string; auth: string | null; at: number }[] = []
let IN_FLIGHT = 0
let MAX_IN_FLIGHT = 0
let CLOCK = 0
let MS_PER_FETCH = 0
let RETENTION: { token: string; videoId: string }[] = []
let OPPORTUNITIES: 'ok' | 'throw' = 'ok'
let OPPORTUNITY_CALLS = 0
let LOGS: string[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'media_insights') {
        return {
          upsert: async (row: Row, options: { onConflict?: string }) => {
            if (WRITE_FAILS.has(row.script_id)) return { error: { message: 'write failed' } }
            UPSERTS.push({ ...row, onConflict: options?.onConflict })
            return { error: null }
          },
        }
      }
      if (table === 'projects') {
        const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: PROMPT }, error: null }) }
        return q
      }
      let rows = SCRIPTS.map(r => ({ ...r }))
      let idColumn = ''
      let projectFilter: string | null = null
      let limitN = Number.POSITIVE_INFINITY
      const q: any = {
        select: () => q,
        eq: (column: string, value: unknown) => {
          if (column === 'project_id') projectFilter = String(value)
          rows = rows.filter(r => r[column] === value)
          return q
        },
        not: (column: string) => { idColumn = column; rows = rows.filter(r => r[column] != null); return q },
        order: (column: string, o: { ascending: boolean }) => {
          rows.sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) * (o.ascending ? 1 : -1))
          return q
        },
        limit: (n: number) => { limitN = n; return q },
        then: (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) => {
          const failing = READ_FAILS.has(`${idColumn}:${projectFilter ?? 'all'}`)
          return Promise.resolve(failing
            ? { data: null, error: { code: 'XX000', message: 'read failed' } }
            : { data: rows.slice(0, limitN), error: null }).then(ok, err)
        },
      }
      return q
    },
  }),
}))

vi.mock('@/lib/media/social-bindings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/social-bindings')>()),
  listActiveBindings: async () => BINDINGS,
}))

vi.mock('@/lib/media/social-credentials', () => ({
  createCredentialResolver: () => {
    const resolverFor = (platform: string) => {
      const memo = new Map<string, Promise<unknown>>()
      return (projectId: string) => {
        if (!memo.has(projectId)) {
          memo.set(projectId, (async () => {
            RESOLUTIONS.push(`${platform}:${projectId}`)
            const refusal = REFUSALS[`${platform}:${projectId}`]
            if (refusal) return { ok: false, refusal, binding: null }
            const credential = platform === 'instagram' ? { token: `IGAA-token-${projectId}` }
              : platform === 'facebook' ? { pageToken: `EAAP-page-${projectId}`, pageId: `page-${projectId.slice(0, 4)}` }
              : { accessToken: `ya29-${projectId}`, channelId: `UC-${projectId.slice(0, 4)}` }
            return { ok: true, credential, binding: { projectId } }
          })())
        }
        return memo.get(projectId)
      }
    }
    return { instagram: resolverFor('instagram'), facebook: resolverFor('facebook'), youtube: resolverFor('youtube') }
  },
}))

vi.mock('@/lib/media/youtube', () => ({
  fetchVideoRetention: async (credential: { accessToken: string }, videoId: string) => {
    RETENTION.push({ token: credential.accessToken, videoId })
    return 55.5
  },
}))

vi.mock('@/lib/atlas/opportunities', () => ({
  detectAndStoreOpportunities: async () => {
    OPPORTUNITY_CALLS++
    if (OPPORTUNITIES === 'throw') throw new Error('opportunities down')
    return { detected: 1, stored: 0 }
  },
}))

function reply(url: string): unknown {
  if (url.includes('/insights?metric=reach,')) {
    return { data: [{ name: 'reach', values: [{ value: 10 }] }, { name: 'likes', values: [{ value: 2 }] }] }
  }
  if (url.includes('?fields=views,likes.summary(true)')) {
    return { views: 100, likes: { summary: { total_count: 5 } }, comments: { summary: { total_count: 1 } }, post_id: '999' }
  }
  if (url.includes('/insights?metric=post_media_view')) return { data: [{ values: [{ value: 300 }] }] }
  if (url.includes('/insights?metric=post_impressions_unique')) return { data: [{ values: [{ value: 200 }] }] }
  if (url.endsWith('?fields=shares')) return { shares: { count: 3 } }
  if (url.includes('/videos?part=statistics')) return { items: [{ statistics: { viewCount: '40', likeCount: '4', commentCount: '2' } }] }
  return { error: { message: `unexpected ${url}` } }
}

function binding(projectId: string, platform: string): Row {
  return {
    bindingId: `77777777-7777-4777-8777-${platform === 'instagram' ? '1' : '2'}${projectId.slice(0, 11)}`,
    projectId, platform, externalAccountId: 'x', accountLabel: null,
    credentialSource: 'project_store', verification: 'provider_attested',
    verifiedAt: '2026-09-15T06:15:00Z', boundBy: 'migration:x', boundAt: '2026-09-14T12:00:00Z',
    blockedAt: null, blockedReason: null,
  }
}

function posts(projectId: string, count: number, kind: 'instagram' | 'facebook' | 'youtube'): Row[] {
  const tag = projectId.slice(0, 4)
  return Array.from({ length: count }, (_, i) => ({
    id: `${kind}-${tag}-${String(i).padStart(3, '0')}`,
    project_id: projectId,
    status: 'published',
    published_at: new Date(Date.UTC(2026, 8, 14) - i * 3_600_000).toISOString(),
    instagram_media_id: kind === 'instagram' ? `ig-${tag}-${i}` : null,
    facebook_post_id: kind === 'facebook' ? `fb-${tag}-${i}` : null,
    youtube_video_id: kind === 'youtube' ? `yt-${tag}-${i}` : null,
  }))
}

const saved = { cron: process.env.CRON_SECRET, yt: process.env.YOUTUBE_API_KEY }

beforeEach(() => {
  SCRIPTS = []
  UPSERTS = []
  WRITE_FAILS = new Set()
  READ_FAILS = new Set()
  PROVIDER_REFUSES = []
  BINDINGS = { ok: true, bindings: [] }
  RESOLUTIONS = []
  REFUSALS = {}
  FETCHES = []
  IN_FLIGHT = 0
  MAX_IN_FLIGHT = 0
  CLOCK = 0
  MS_PER_FETCH = 0
  RETENTION = []
  OPPORTUNITIES = 'ok'
  OPPORTUNITY_CALLS = 0
  LOGS = []
  process.env.CRON_SECRET = CRON
  delete process.env.YOUTUBE_API_KEY
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { LOGS.push(args.map(String).join(' ')) })
  vi.stubGlobal('fetch', async (input: unknown, init?: { headers?: Record<string, string> }) => {
    const url = String(input)
    IN_FLIGHT++
    MAX_IN_FLIGHT = Math.max(MAX_IN_FLIGHT, IN_FLIGHT)
    FETCHES.push({ url, auth: init?.headers?.Authorization ?? null, at: CLOCK })
    await new Promise(r => setTimeout(r, 0))
    CLOCK += MS_PER_FETCH
    IN_FLIGHT--
    const refused = PROVIDER_REFUSES.some(fragment => url.includes(fragment))
    const body = refused ? { error: { message: `Invalid OAuth access token access_token=${LEAKED}` } } : reply(url)
    return { ok: !refused, status: refused ? 400 : 200, json: async () => body }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (saved.cron === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved.cron
  if (saved.yt === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = saved.yt
})

const cronRequest = (authorized = true) => new Request('https://omnira.test/api/media/cron/insights', {
  headers: authorized ? { authorization: `Bearer ${CRON}` } : {},
})
const rows = (platform: string, projectId?: string) =>
  UPSERTS.filter(u => u.platform === platform && (!projectId || u.project_id === projectId))
const cronLine = () => LOGS.find(l => l.startsWith('[cron/insights]'))
const source = (file: string) => readFileSync(resolve(__dirname, file), 'utf8')
const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length

// ─────────────────────────────────────────────────────────────────────────────

describe('insights · runtime contract', () => {
  it('the route’s maxDuration covers the work budget, the slowest post and the opportunity pass', () => {
    expect(route.maxDuration).toBe(300)
    const limitMs = route.maxDuration * 1000
    expect(INSIGHTS_WORK_BUDGET_MS + INSIGHTS_MAX_CALLS_PER_POST * INSIGHTS_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(limitMs - 30_000)
    expect(INSIGHTS_WORK_BUDGET_MS).toBeLessThan(INSIGHTS_OPPORTUNITIES_BUDGET_MS)
    expect(INSIGHTS_OPPORTUNITIES_BUDGET_MS + 30_000).toBeLessThanOrEqual(limitMs)
  })

  it('every provider request the run makes carries a timeout no longer than INSIGHTS_REQUEST_TIMEOUT_MS', () => {
    const insights = source('../media/insights.ts')
    const fetches = count(insights, /await fetch\(/g)
    expect(fetches).toBeGreaterThanOrEqual(5)
    expect(count(insights, /signal: AbortSignal\.timeout\(INSIGHTS_REQUEST_TIMEOUT_MS\)/g)).toBe(fetches)
    expect(count(insights, /AbortSignal\.timeout\(/g)).toBe(fetches)

    const youtube = source('../media/youtube.ts')
    const start = youtube.indexOf('export async function fetchVideoRetention')
    const retention = youtube.slice(start, youtube.indexOf('\nexport ', start + 1))
    expect(count(retention, /await fetch\(/g)).toBe(1)
    const retentionTimeout = retention.match(/signal: AbortSignal\.timeout\(([0-9_]+)\)/)?.[1]
    expect(Number(retentionTimeout?.replace(/_/g, ''))).toBeLessThanOrEqual(INSIGHTS_REQUEST_TIMEOUT_MS)

    // Credential resolution: Instagram, Facebook and YouTube identity requests.
    const identity = source('../media/social-identity.ts')
    expect(count(identity, /await fetch\(/g)).toBeGreaterThanOrEqual(2)
    expect(count(identity, /signal: AbortSignal\.timeout\(TIMEOUT_MS\)/g)).toBe(count(identity, /await fetch\(/g))
    expect(Number(identity.match(/const TIMEOUT_MS = ([0-9_]+)/)?.[1].replace(/_/g, ''))).toBeLessThanOrEqual(INSIGHTS_REQUEST_TIMEOUT_MS)
  })

  it('no post waits on more provider requests than the contract allows', async () => {
    BINDINGS = { ok: true, bindings: [binding(PROMPT, 'facebook')] }
    SCRIPTS = posts(PROMPT, 1, 'facebook')
    await refreshAllInsights()
    expect(rows('facebook')).toHaveLength(1)
    expect(FETCHES.length).toBeLessThanOrEqual(INSIGHTS_MAX_CALLS_PER_POST)
  })
})

describe('insights · a bounded workload', () => {
  it('at most INSIGHTS_LIMIT posts per platform per project, newest first — YouTube across projects', async () => {
    BINDINGS = { ok: true, bindings: [binding(PROMPT, 'instagram'), binding(PROMPT, 'facebook'), binding(FAMILY, 'instagram')] }
    SCRIPTS = [
      ...posts(PROMPT, 120, 'instagram'), ...posts(PROMPT, 120, 'facebook'), ...posts(FAMILY, 90, 'instagram'),
      ...posts(PROMPT, 70, 'youtube'), ...posts(FAMILY, 70, 'youtube'),
    ]
    process.env.YOUTUBE_API_KEY = 'yt-key'
    const summary = await refreshAllInsights()
    expect(summary.complete).toBe(true)
    expect(rows('instagram', PROMPT)).toHaveLength(INSIGHTS_LIMIT)
    expect(rows('instagram', FAMILY)).toHaveLength(INSIGHTS_LIMIT)
    expect(rows('facebook', PROMPT)).toHaveLength(INSIGHTS_LIMIT)
    expect(rows('youtube')).toHaveLength(INSIGHTS_LIMIT)
    expect(new Set(rows('instagram', PROMPT).map(r => r.script_id))).toEqual(new Set(posts(PROMPT, INSIGHTS_LIMIT, 'instagram').map(p => p.id)))
    expect(summary.sections).toEqual([
      { platform: 'instagram', projectId: PROMPT, status: 'complete', planned: 80, attempted: 80, written: 80, skipped: 0 },
      { platform: 'facebook', projectId: PROMPT, status: 'complete', planned: 80, attempted: 80, written: 80, skipped: 0 },
      { platform: 'instagram', projectId: FAMILY, status: 'complete', planned: 80, attempted: 80, written: 80, skipped: 0 },
      { platform: 'facebook', projectId: FAMILY, status: 'not_bound', planned: 0, attempted: 0, written: 0, skipped: 0 },
      { platform: 'youtube', projectId: null, status: 'complete', planned: 80, attempted: 80, written: 80, skipped: 0 },
    ])
  })

  it(`never more than INSIGHTS_CONCURRENCY (${INSIGHTS_CONCURRENCY}) provider requests in flight`, async () => {
    BINDINGS = { ok: true, bindings: [binding(PROMPT, 'instagram'), binding(PROMPT, 'facebook')] }
    SCRIPTS = [...posts(PROMPT, 40, 'instagram'), ...posts(PROMPT, 40, 'facebook'), ...posts(PROMPT, 40, 'youtube')]
    process.env.YOUTUBE_API_KEY = 'yt-key'
    await refreshAllInsights()
    expect(MAX_IN_FLIGHT).toBeGreaterThan(1)
    expect(MAX_IN_FLIGHT).toBeLessThanOrEqual(INSIGHTS_CONCURRENCY)
  })
})

describe('insights · a partial run is never reported complete', () => {
  it('no post starts at or after the deadline: attempted and skipped add up, skipped posts are not written, later sections never start', async () => {
    BINDINGS = { ok: true, bindings: [binding(PROMPT, 'instagram'), binding(PROMPT, 'facebook')] }
    SCRIPTS = [...posts(PROMPT, 80, 'instagram'), ...posts(PROMPT, 80, 'facebook'), ...posts(PROMPT, 20, 'youtube')]
    process.env.YOUTUBE_API_KEY = 'yt-key'
    MS_PER_FETCH = 1_000
    const summary = await refreshAllInsights({ deadlineAt: 30_000, now: () => CLOCK })
    expect(summary.complete).toBe(false)
    const [instagram, ...rest] = summary.sections
    expect(instagram).toMatchObject({ platform: 'instagram', projectId: PROMPT, status: 'time_budget_exhausted', planned: 80 })
    expect(instagram.attempted + instagram.skipped).toBe(80)
    expect(instagram.skipped).toBeGreaterThan(0)
    expect(instagram.written).toBe(instagram.attempted)
    expect(rows('instagram')).toHaveLength(instagram.written)
    expect(FETCHES.every(f => f.at < 30_000)).toBe(true)
    expect(rest).toEqual([
      { platform: 'facebook', projectId: PROMPT, status: 'time_budget_exhausted', planned: null, attempted: 0, written: 0, skipped: 0 },
      { platform: 'youtube', projectId: null, status: 'time_budget_exhausted', planned: null, attempted: 0, written: 0, skipped: 0 },
    ])
    expect(RESOLUTIONS).toEqual([`instagram:${PROMPT}`])
    expect(FETCHES.some(f => f.url.includes('fields=views') || f.url.includes('/videos?'))).toBe(false)
  })

  it('a post the provider refuses or a write that fails leaves the section partial — counted, never complete', async () => {
    BINDINGS = { ok: true, bindings: [binding(PROMPT, 'instagram')] }
    SCRIPTS = posts(PROMPT, 5, 'instagram')
    PROVIDER_REFUSES = ['/ig-3333-1/insights']
    WRITE_FAILS = new Set(['instagram-3333-003'])
    const summary = await refreshAllInsights()
    expect(summary.complete).toBe(false)
    expect(summary.sections[0]).toEqual({ platform: 'instagram', projectId: PROMPT, status: 'partial', planned: 5, attempted: 5, written: 3, skipped: 0 })
    expect(summary.byPlatform.instagram).toEqual({ updated: 3, failed: 2 })
    expect(rows('instagram').map(r => r.script_id).sort()).toEqual(['instagram-3333-000', 'instagram-3333-002', 'instagram-3333-004'])
  })

  it('a failed read or a refused credential is named, and the refused project is never fetched with any credential', async () => {
    BINDINGS = { ok: true, bindings: [
      binding(PROMPT, 'instagram'), binding(PROMPT, 'facebook'), binding(FAMILY, 'instagram'), binding(FAMILY, 'facebook'),
    ] }
    SCRIPTS = [...posts(PROMPT, 5, 'instagram'), ...posts(PROMPT, 5, 'facebook'), ...posts(FAMILY, 5, 'instagram'), ...posts(FAMILY, 5, 'facebook')]
    REFUSALS[`instagram:${FAMILY}`] = 'credential_invalid'
    READ_FAILS.add(`facebook_post_id:${PROMPT}`)
    const summary = await refreshAllInsights()
    expect(summary.complete).toBe(false)
    expect(summary.sections).toEqual([
      { platform: 'instagram', projectId: PROMPT, status: 'complete', planned: 5, attempted: 5, written: 5, skipped: 0 },
      { platform: 'facebook', projectId: PROMPT, status: 'read_failed', planned: null, attempted: 0, written: 0, skipped: 0 },
      { platform: 'instagram', projectId: FAMILY, status: 'credential_refused', refusal: 'credential_invalid', planned: null, attempted: 0, written: 0, skipped: 0 },
      { platform: 'facebook', projectId: FAMILY, status: 'complete', planned: 5, attempted: 5, written: 5, skipped: 0 },
      { platform: 'youtube', projectId: null, status: 'not_configured', planned: 0, attempted: 0, written: 0, skipped: 0 },
    ])
    expect(FETCHES.filter(f => f.url.includes('/ig-4444-'))).toEqual([])
  })

  it('a missing binding is nothing to measure; unreadable bindings measure no project and are incomplete', async () => {
    BINDINGS = { ok: true, bindings: [binding(PROMPT, 'instagram')] }
    REFUSALS[`instagram:${PROMPT}`] = 'binding_missing'
    SCRIPTS = posts(PROMPT, 3, 'instagram')
    const notBound = await refreshAllInsights()
    expect(notBound.sections[0]).toEqual({ platform: 'instagram', projectId: PROMPT, status: 'not_bound', planned: 0, attempted: 0, written: 0, skipped: 0 })
    expect(notBound.complete).toBe(true)

    FETCHES = []
    BINDINGS = { ok: false }
    const unreadable = await refreshAllInsights()
    expect(unreadable).toMatchObject({ complete: false, bindingsUnreadable: true })
    expect(unreadable.sections).toEqual([{ platform: 'youtube', projectId: null, status: 'not_configured', planned: 0, attempted: 0, written: 0, skipped: 0 }])
    expect(FETCHES).toEqual([])
  })
})

describe('insights · every project with its own verified credential', () => {
  it('each request carries the measured project’s own credential; retention uses the video’s own project’s credential', async () => {
    BINDINGS = { ok: true, bindings: [binding(PROMPT, 'instagram'), binding(PROMPT, 'facebook'), binding(FAMILY, 'instagram')] }
    SCRIPTS = [
      ...posts(PROMPT, 2, 'instagram'), ...posts(PROMPT, 2, 'facebook'), ...posts(FAMILY, 2, 'instagram'),
      ...posts(PROMPT, 2, 'youtube'), ...posts(FAMILY, 2, 'youtube'),
    ]
    process.env.YOUTUBE_API_KEY = 'yt-key'
    const summary = await refreshAllInsights()
    expect(summary.complete).toBe(true)
    const instagram = FETCHES.filter(f => f.url.includes('/ig-'))
    expect(instagram).toHaveLength(4)
    for (const f of instagram) expect(f.auth).toBe(`Bearer IGAA-token-${f.url.includes('/ig-3333-') ? PROMPT : FAMILY}`)
    const facebook = FETCHES.filter(f => f.url.startsWith('https://graph.facebook.com'))
    expect(facebook.length).toBeGreaterThan(0)
    for (const f of facebook) expect(f.auth).toBe(`Bearer EAAP-page-${PROMPT}`)
    expect(RETENTION.map(r => `${r.videoId.slice(3, 7)}:${r.token}`).sort()).toEqual([
      `3333:ya29-${PROMPT}`, `3333:ya29-${PROMPT}`, `4444:ya29-${FAMILY}`, `4444:ya29-${FAMILY}`,
    ])
    expect(rows('youtube').every(r => r.avg_view_pct === 55.5)).toBe(true)
    expect(rows('facebook', PROMPT)[0]).toMatchObject({ impressions: 300, reach: 200, shares: 3, views: 100, likes: 5, comments: 1, total_interactions: 9 })
  })

  it('the module takes no credential from the environment — only YouTube’s public API key', () => {
    const insights = source('../media/insights.ts')
    expect([...insights.matchAll(/process\.env\.([A-Z_]+)/g)].map(m => m[1])).toEqual(['YOUTUBE_API_KEY'])
  })
})

describe('insights · the daily route answers for what it did', () => {
  it('without the cron secret nothing runs', async () => {
    const res = await route.GET(cronRequest(false))
    expect(res.status).toBe(401)
    expect({ FETCHES, RESOLUTIONS, OPPORTUNITY_CALLS }).toEqual({ FETCHES: [], RESOLUTIONS: [], OPPORTUNITY_CALLS: 0 })
  })

  it('a complete run whose opportunity pass ran is 200 ok, and logs every section in one line', async () => {
    BINDINGS = { ok: true, bindings: [binding(PROMPT, 'instagram')] }
    SCRIPTS = posts(PROMPT, 3, 'instagram')
    const res = await route.GET(cronRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, complete: true, updated: 3, failed: 0, opportunities: { detected: 1, stored: 0 } })
    expect(OPPORTUNITY_CALLS).toBe(1)
    expect(cronLine()).toMatch(new RegExp(
      `^\\[cron/insights\\] ok=true complete=true seconds=\\d+ sections=instagram:${PROMPT}:complete:3/3,`
      + `facebook:${PROMPT}:not_bound:0/0,youtube:all:not_configured:0/0 opportunities=ran$`))
  })

  it('past the work budget the route answers 503, logs how far each section got and skips the opportunity pass', async () => {
    BINDINGS = { ok: true, bindings: [binding(PROMPT, 'instagram')] }
    SCRIPTS = posts(PROMPT, 40, 'instagram')
    CLOCK = 1_000_000
    MS_PER_FETCH = 15_000
    vi.spyOn(Date, 'now').mockImplementation(() => CLOCK)
    const res = await route.GET(cronRequest())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, complete: false, opportunities: { skipped: 'time_budget_exhausted' } })
    expect(body.sections[0]).toMatchObject({ platform: 'instagram', status: 'time_budget_exhausted', planned: 40 })
    expect(OPPORTUNITY_CALLS).toBe(0)
    expect(cronLine()).toMatch(new RegExp(
      `^\\[cron/insights\\] ok=false complete=false seconds=\\d+ sections=instagram:${PROMPT}:time_budget_exhausted:${body.sections[0].written}/40,`
      + `facebook:${PROMPT}:not_bound:0/0,youtube:all:not_configured:0/0 opportunities=skipped$`))
  })

  it('a partial run answers 503 with its first error redacted, and neither the answer nor the log carries provider text', async () => {
    BINDINGS = { ok: true, bindings: [binding(PROMPT, 'instagram')] }
    SCRIPTS = posts(PROMPT, 2, 'instagram')
    PROVIDER_REFUSES = ['/ig-3333-0/insights']
    const res = await route.GET(cronRequest())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, complete: false, updated: 1, failed: 1, opportunities: { detected: 1, stored: 0 } })
    expect(body.sections[0]).toEqual({ platform: 'instagram', projectId: PROMPT, status: 'partial', planned: 2, attempted: 2, written: 1, skipped: 0 })
    expect(typeof body.firstError).toBe('string')
    expect(JSON.stringify(body)).not.toContain(LEAKED)
    expect(cronLine()).toMatch(new RegExp(
      `^\\[cron/insights\\] ok=false complete=false seconds=\\d+ sections=instagram:${PROMPT}:partial:1/2,`
      + `facebook:${PROMPT}:not_bound:0/0,youtube:all:not_configured:0/0 opportunities=ran$`))
    expect(LOGS.join('\n')).not.toMatch(new RegExp(`${LEAKED}|IGAA-token|EAAP|ya29|Bearer|OAuth`))
  })

  it('an opportunity pass that fails is not ok (503), while the refresh itself is reported complete', async () => {
    BINDINGS = { ok: true, bindings: [binding(PROMPT, 'instagram')] }
    SCRIPTS = posts(PROMPT, 2, 'instagram')
    OPPORTUNITIES = 'throw'
    const res = await route.GET(cronRequest())
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ ok: false, complete: true, opportunities: { error: 'opportunities down' } })
    expect(cronLine()).toMatch(/ ok=false complete=true .* opportunities=error$/)
  })
})
