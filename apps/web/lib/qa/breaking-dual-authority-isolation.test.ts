/**
 * Phase 9W — dual-mode breaking-news authorization.
 *
 * `POST /api/media/breaking` accepts EITHER `Bearer ${CRON_SECRET}` (unattended)
 * OR an authenticated session. The machine branch was fine. The SESSION branch
 * was not: `body.project_id` went straight into a service-role project lookup
 * with no ownership check, and everything the route does descends from that one
 * lookup — Anthropic, scoreScript, the media_news_items and media_scripts
 * inserts, then cron-authenticated sub-requests that drive ElevenLabs, Ideogram,
 * Lambda render, Instagram, Facebook and YouTube.
 *
 * So a signed-in operator could name another tenant's project and spend their
 * budget, write into their project and publish under their accounts. That was a
 * genuine cross-tenant READ + WRITE + SPEND + PUBLISH hole, live in production
 * behind a Settings-adjacent button (BreakingButton.tsx) — not a theoretical one.
 * The closure audit found it only because it stopped trusting the per-file sweep,
 * which had filed the route MACHINE on the strength of the string CRON_SECRET and
 * never looked at the session branch.
 *
 * These tests keep the two principals apart. The machine branch must NOT acquire
 * a project guard (its global reach is the point), and the session branch must
 * NOT acquire machine authority. The counters matter more than the status code:
 * denial has to cost zero provider calls, zero writes, zero publishes and zero
 * cron-authenticated sub-requests — not merely return 404 after paying.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

const ME = 'user-me'
const MINE = '11111111-1111-1111-1111-111111111111'
const THEIRS = '22222222-2222-2222-2222-222222222222'
const NOBODY = 'user-nobody'
const SECRET = 'test-cron-secret'

/** Every paid provider call, DB write and outbound sub-request, in order. */
let CALLS: string[] = []
interface Seen { table: string; ops: [string, string, unknown][]; writes: unknown[] }
const get = (r: any, p: string): unknown => p.split('.').reduce((a: any, k) => (a == null ? a : a[k]), r)

function fakeDb(tables: Record<string, any[]>) {
  const seen: Seen[] = []
  const from = (table: string) => {
    const rec: Seen = { table, ops: [], writes: [] }
    seen.push(rec)
    let rows: any[] = (tables[table] ?? []).map(r => ({ ...r }))
    const q: any = {
      select: () => q,
      insert: (row: any) => {
        rec.ops.push(['insert', table, row]); rec.writes.push(row); CALLS.push(`write:${table}`)
        // Land it in the backing table: the route re-reads media_scripts through a
        // FRESH chain while polling the render, and `video_status: 'ready'` is what
        // lets that poll exit on its first pass instead of sleeping 14x12s.
        const stored = { ...row, id: `new-${table}`, video_status: 'ready' }
        ;(tables[table] ??= []).push(stored)
        rows = [stored]
        return q
      },
      update: (patch: any) => { rec.ops.push(['update', table, patch]); rec.writes.push(patch); CALLS.push(`write:${table}`); return q },
      eq: (c: string, v: unknown) => { rec.ops.push(['eq', c, v]); rows = rows.filter(r => get(r, c) === v); return q },
      in: (c: string, v: unknown[]) => { rec.ops.push(['in', c, v]); rows = rows.filter(r => v.includes(get(r, c) as never)); return q },
      limit: (n: number) => { rec.ops.push(['limit', String(n), n]); rows = rows.slice(0, n); return q },
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (ok: any, err?: any) => Promise.resolve({ data: rows, error: null }).then(ok, err),
    }
    return q
  }
  return { db: { from } as any, seen }
}

let CURRENT: ReturnType<typeof fakeDb>
let CURRENT_USER: { id: string } | null = { id: ME }

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: CURRENT_USER } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => CURRENT.db }))
vi.mock('@/lib/ai/anthropic', () => ({
  getAnthropic: () => ({
    messages: {
      create: async () => {
        CALLS.push('anthropic')
        const n = CALLS.filter(c => c === 'anthropic').length
        const body = n === 1
          ? JSON.stringify({ title: 'T', summary: 'S', key_insight: 'K', virality_score: 9,
                             target_audience: 'intermediate', content_angle: 'educational' })
          : JSON.stringify({ hook: 'H', script: 'B', captions: ['c'], hashtags: ['#a'],
                             cta: 'x', tone: 'insider', estimated_duration: '~20s' })
        return { content: [{ type: 'text', text: body }] }
      },
    },
  }),
}))
vi.mock('@/lib/media/quality', () => ({
  scoreScript: async () => { CALLS.push('scoreScript'); return { overall: 9, hook_strength: 9, verdict: 'ok', weak_spots: [] } },
}))
vi.mock('@/lib/media/news-hunter', () => ({
  runNewsHunter: async () => { CALLS.push('news-hunter'); return { candidates: [] } },
}))
vi.mock('@/lib/media/hermes', () => ({
  callHermesRead: async () => { CALLS.push('hermes'); return { success: true, title: 'T', text: 'x' } },
  isHermesConfigured: () => false,
}))
vi.mock('@/lib/atlas/content-tags', () => ({ classifyTopic: () => 'ai' }))

const req = (body: unknown, auth?: string) =>
  new Request('https://x.test/api/media/breaking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  })
const post = async (body: unknown, auth?: string) => {
  vi.resetModules()
  const { POST } = await import('@/app/api/media/breaking/route')
  return POST(req(body, auth))
}
const seed = () => ({
  projects: [
    { id: MINE, owner_id: ME, slug: 'mine' },
    { id: THEIRS, owner_id: 'user-other', slug: 'theirs' },
    { id: 'plat', owner_id: 'user-platform', slug: 'ai-media-automation' },
  ],
  media_news_items: [], media_scripts: [],
})
const writesFor = (s: Seen[]) => s.flatMap(x => x.writes)
const providerCalls = () => CALLS.filter(c => !c.startsWith('write:') && c !== 'fetch')
const chained = () => CALLS.filter(c => c === 'fetch')

beforeEach(() => {
  CURRENT_USER = { id: ME }
  CURRENT = fakeDb(seed())
  CALLS = []
  process.env.CRON_SECRET = SECRET
  ;(globalThis as any).fetch = async () => { CALLS.push('fetch'); return { ok: true, status: 200, json: async () => ({}) } }
  // The route polls the render with `await sleep(12_000)` at the top of every
  // pass, so the owned path costs 12 real seconds before it can finish. Collapse
  // the timer rather than the assertion: the route is untouched, every step still
  // runs, and only the waiting is removed.
  vi.stubGlobal('setTimeout', ((fn: () => void) => { fn(); return 0 }) as unknown as typeof setTimeout)
})
afterEach(() => { vi.unstubAllGlobals() })

// ═══ USER / SESSION branch ═══════════════════════════════════════════════════

describe('9W · breaking — a session may only name a project it owns', () => {
  it('an unauthenticated request is refused before any query', async () => {
    CURRENT_USER = null
    const res = await post({ project_id: MINE, text: 'a' })
    expect(res.status).toBe(401)
    expect(CURRENT.seen).toHaveLength(0)
    expect(CALLS).toEqual([])
  })

  it('a FOREIGN project spends nothing, writes nothing, publishes nothing', async () => {
    const res = await post({ project_id: THEIRS, text: 'a' })
    expect(res.status).toBe(404)
    expect(providerCalls(), 'reached a paid provider on a foreign project').toEqual([])
    expect(writesFor(CURRENT.seen)).toEqual([])
    expect(chained(), 'escalated to a cron-authenticated sub-request').toEqual([])
  })

  it('the PLATFORM project cannot be reached by naming it either', async () => {
    const res = await post({ project_id: 'plat', text: 'a' })
    expect(res.status).toBe(404)
    expect(providerCalls()).toEqual([])
    expect(writesFor(CURRENT.seen)).toEqual([])
  })

  it('an OMITTED project_id does not silently inherit the machine default', async () => {
    // The machine branch falls back to DEFAULT_PROJECT_SLUG. A session must not:
    // that would be a fallback to authority the caller never proved.
    const res = await post({ text: 'a' })
    expect(res.status).toBe(404)
    expect(providerCalls()).toEqual([])
    expect(writesFor(CURRENT.seen)).toEqual([])
  })

  it('an unknown project id is refused', async () => {
    const res = await post({ project_id: '99999999-9999-9999-9999-999999999999', text: 'a' })
    expect(res.status).toBe(404)
    expect(writesFor(CURRENT.seen)).toEqual([])
  })

  it('foreign, unknown and omitted are indistinguishable', async () => {
    const a = await post({ project_id: THEIRS, text: 'x' })
    const b = await post({ project_id: '99999999-9999-9999-9999-999999999999', text: 'x' })
    const c = await post({ text: 'x' })
    const [ja, jb, jc] = [await a.json(), await b.json(), await c.json()]   // read each body once
    expect(a.status).toBe(b.status); expect(b.status).toBe(c.status)
    expect(ja).toEqual(jb); expect(jb).toEqual(jc)
  })

  it('the denial never returns project metadata', async () => {
    const res = await post({ project_id: THEIRS, text: 'x' })
    const txt = JSON.stringify(await res.json())
    expect(txt).not.toContain('theirs')
    expect(txt).not.toContain(THEIRS)
  })

  it('an operator who owns nothing is refused, at zero cost', async () => {
    CURRENT_USER = { id: NOBODY }
    const res = await post({ project_id: MINE, text: 'a' })
    expect(res.status).toBe(404)
    expect(providerCalls()).toEqual([])
    expect(writesFor(CURRENT.seen)).toEqual([])
  })

  it('the named project is never READ before authorization', async () => {
    // Ordering, not just outcome. The allow-list read is `.eq('owner_id', me)`;
    // the project lookup is `.eq('id', <named>)`. On a denial the second must
    // never have run — otherwise the service-role client has already fetched a
    // row belonging to another tenant, which is a cross-tenant read even though
    // nothing was spent or written.
    await post({ project_id: THEIRS, text: 'a' })
    const projectQueries = CURRENT.seen.filter(s => s.table === 'projects')
    expect(projectQueries.length).toBeGreaterThan(0)
    const allowList = projectQueries.filter(s => s.ops.some(([op, c]) => op === 'eq' && c === 'owner_id'))
    const namedLookup = projectQueries.filter(s => s.ops.some(([op, c, v]) => op === 'eq' && c === 'id' && v === THEIRS))
    expect(allowList.length, 'the allow-list read must happen').toBeGreaterThan(0)
    expect(namedLookup, 'the foreign project row was read before authorization').toEqual([])
    expect(CURRENT.seen.some(s => s.table === 'media_news_items' || s.table === 'media_scripts')).toBe(false)
  })

  it('an owned request DOES perform the project lookup — the guard is not just a short-circuit', async () => {
    await post({ project_id: MINE, text: 'a' })
    const named = CURRENT.seen.filter(s => s.table === 'projects')
      .filter(s => s.ops.some(([op, c, v]) => op === 'eq' && c === 'id' && v === MINE))
    expect(named.length).toBeGreaterThan(0)
  })

  it('an OWNED project is accepted and does reach the pipeline', async () => {
    const res = await post({ project_id: MINE, text: 'an article' })
    expect(res.status).toBe(200)
    expect(CALLS).toContain('anthropic')
    const inserted = CURRENT.seen.filter(s => s.table === 'media_news_items' || s.table === 'media_scripts')
      .flatMap(s => s.writes) as any[]
    expect(inserted.length).toBeGreaterThan(0)
    for (const row of inserted) if ('project_id' in row) expect(row.project_id).toBe(MINE)
  })
})

// ═══ MACHINE / CRON branch ═══════════════════════════════════════════════════

describe('9W · breaking — the machine branch keeps its global authority', () => {
  it('a valid CRON_SECRET is accepted with NO user session at all', async () => {
    CURRENT_USER = null
    const res = await post({ text: 'a' }, `Bearer ${SECRET}`)
    expect(res.status).toBe(200)
    expect(CALLS).toContain('anthropic')
  })

  it('the machine branch may still name any project — that reach is the point', async () => {
    CURRENT_USER = null
    const res = await post({ project_id: THEIRS, text: 'a' }, `Bearer ${SECRET}`)
    expect(res.status).toBe(200)
    const inserted = CURRENT.seen.filter(s => s.table === 'media_news_items').flatMap(s => s.writes) as any[]
    expect(inserted[0]?.project_id).toBe(THEIRS)
  })

  it('a WRONG secret is refused', async () => {
    CURRENT_USER = null
    const res = await post({ text: 'a' }, 'Bearer not-the-secret')
    expect(res.status).toBe(401)
    expect(CALLS).toEqual([])
  })

  it('a missing bearer with no session is refused', async () => {
    CURRENT_USER = null
    const res = await post({ text: 'a' })
    expect(res.status).toBe(401)
    expect(CALLS).toEqual([])
  })

  it('an UNSET server CRON_SECRET makes machine auth unavailable, not open', async () => {
    delete process.env.CRON_SECRET
    CURRENT_USER = null
    const res = await post({ text: 'a' }, 'Bearer ')
    expect(res.status).toBe(401)
    expect(CALLS).toEqual([])
  })

  it('a user session does NOT acquire machine-global authority', async () => {
    // The whole finding in one assertion: same body, two principals, two answers.
    CURRENT_USER = { id: ME }
    const asUser = await post({ project_id: THEIRS, text: 'a' })
    CURRENT_USER = null
    CURRENT = fakeDb(seed()); CALLS = []
    const asCron = await post({ project_id: THEIRS, text: 'a' }, `Bearer ${SECRET}`)
    expect(asUser.status).toBe(404)
    expect(asCron.status).toBe(200)
  })

  it('the machine branch is not given a user project guard', async () => {
    CURRENT_USER = null
    await post({ project_id: THEIRS, text: 'a' }, `Bearer ${SECRET}`)
    const scoped = CURRENT.seen.flatMap(s => s.ops)
      .some(([op, c, v]) => op === 'in' && c === 'id' && Array.isArray(v) && (v as string[]).includes(IMPOSSIBLE_PROJECT_ID))
    expect(scoped, 'cron must not be bounded by a user allow-list').toBe(false)
  })
})

// ═══ Chained sub-requests + the security register ════════════════════════════

describe('9W · breaking — the machine escalation cannot change project', () => {
  it('every chained sub-request selects by scriptId only — no project selector', async () => {
    // The route hands its sub-requests `Authorization: Bearer ${CRON_SECRET}`, so
    // a session request does cross into machine authority. That is only safe
    // because the sub-requests cannot be pointed anywhere else: they carry a
    // scriptId, and that script was written into the ALREADY-AUTHORIZED project.
    const urls: string[] = []
    ;(globalThis as any).fetch = async (u: string) => { urls.push(String(u)); CALLS.push('fetch'); return { ok: true, status: 200, json: async () => ({}) } }
    await post({ project_id: MINE, text: 'a' })
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) {
      expect(u, 'a sub-request carried a project selector').not.toMatch(/project_?id=/i)
      expect(u).toMatch(/scriptId=/)
    }
  })

  it('the scriptId handed downstream belongs to the authorized project', async () => {
    const urls: string[] = []
    ;(globalThis as any).fetch = async (u: string) => { urls.push(String(u)); CALLS.push('fetch'); return { ok: true, status: 200, json: async () => ({}) } }
    await post({ project_id: MINE, text: 'a' })
    const scriptRows = CURRENT.seen.filter(s => s.table === 'media_scripts').flatMap(s => s.writes) as any[]
    expect(scriptRows[0]?.project_id).toBe(MINE)
    const id = 'new-media_scripts'
    for (const u of urls) expect(u).toContain(`scriptId=${id}`)
  })
})

describe('9W · breaking — the security register tells the truth', () => {
  it('the route is declared, and NOT as machine-only', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/isolation/route-manifest.json'), 'utf8'))
    const rows = Array.isArray(raw) ? raw : raw.routes
    const entry = rows.find((r: any) => r?.path === '/media/breaking')
    expect(entry, '/media/breaking must be in the register — its absence is why this hole survived').toBeDefined()
    // Machine-only would be a lie: the session branch exists and is guarded.
    expect(entry.auth).toContain('User')
    expect(entry.auth).toContain('Cron-secret')
    expect(entry.serviceRole).toBe(true)
    expect(String(entry.scope)).toMatch(/project_id/)
  })
})
