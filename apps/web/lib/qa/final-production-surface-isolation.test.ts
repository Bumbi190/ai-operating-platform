/**
 * Phase 9V-4 — the last four unguarded production surfaces.
 *
 * These did NOT share one shape, and the tests keep the differences rather than
 * flattening them:
 *
 *   /api/seed                    — a LIVE Settings button (SeedButton.tsx). It read
 *     every project in the database, picked one by name and fell back to
 *     `projects[0]` ACROSS ALL TENANTS, then wrote agents and workflows into it.
 *     GET delegates to POST, so a page load was enough. → project guard.
 *
 *   /api/media/insights/check    — a LIVE Settings diagnostic (TokenUpdater.tsx).
 *     It picked the most recent published script from EVERY tenant and echoed
 *     `script.hook` back. One slot, ORDER BY published_at DESC LIMIT 1, so the
 *     scope has to precede the ordering or the wrong row wins. → project guard.
 *
 *   /api/fix-image-agent         — rewrites EVERY dall-e agent in the database,
 *     across all projects. That is deliberately platform-wide, so a project guard
 *     would misdescribe it; what was wrong is that a mere session could fire it.
 *     → machine boundary, using the credential this repo already uses for
 *     unattended surfaces. Zero in-app callers; the dev path is the standalone
 *     scripts/fix-image-agent.ts, which talks to Supabase directly.
 *
 *   /api/intelligence/graph/operations — ALREADY SAFE. The sweep flagged it only
 *     because the route file contains createAdminClient with no visible
 *     allow-list call; the scoping lives one level down in buildOperationsGraph.
 *     No code changed. The last block below pins that, because an "already safe"
 *     claim with no test is a claim that can rot silently.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

const ME = 'user-me'
const MINE = '11111111-1111-1111-1111-111111111111'
const THEIRS = '22222222-2222-2222-2222-222222222222'
const NOBODY = 'user-nobody'
const SECRET = 'test-cron-secret'

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
      insert: (row: any) => { rec.ops.push(['insert', table, row]); rec.writes.push(row); return q },
      update: (patch: any) => { rec.ops.push(['update', table, patch]); rec.writes.push(patch); return q },
      eq: (c: string, v: unknown) => { rec.ops.push(['eq', c, v]); rows = rows.filter(r => get(r, c) === v); return q },
      in: (c: string, v: unknown[]) => { rec.ops.push(['in', c, v]); rows = rows.filter(r => v.includes(get(r, c) as never)); return q },
      or: (expr: string) => { rec.ops.push(['or', expr, expr]); return q },
      gte: (c: string, v: string) => { rec.ops.push(['gte', c, v]); rows = rows.filter(r => String(get(r, c)) >= v); return q },
      not: (c: string, _op: string, _v: unknown) => { rec.ops.push(['not', c, null]); rows = rows.filter(r => get(r, c) != null); return q },
      order: (c: string, o?: { ascending?: boolean }) => {
        rec.ops.push(['order', c, o?.ascending !== false])
        const dir = o?.ascending === false ? -1 : 1
        rows = [...rows].sort((a, b) => (String(get(a, c)) < String(get(b, c)) ? -1 : 1) * dir)
        return q
      },
      limit: (n: number) => { rec.ops.push(['limit', String(n), n]); rows = rows.slice(0, n); return q },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? { id: 'new-row' }, error: null }),
      then: (ok: any, err?: any) => Promise.resolve({ data: rows, error: null }).then(ok, err),
    }
    return q
  }
  return { db: { from } as any, seen }
}

let CURRENT: ReturnType<typeof fakeDb>
let CURRENT_USER: { id: string } | null = { id: ME }
let CALLS: string[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: CURRENT_USER } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => CURRENT.db }))
vi.mock('@/lib/media/token-store', () => ({
  getToken: async () => { CALLS.push('token'); return { accessToken: 'tok', accountId: 'acc' } },
}))
vi.mock('@/lib/media/insights', () => ({
  fetchMediaInsights: async () => { CALLS.push('graph-api'); return { ok: true, metrics: { reach: 1 } } },
}))

const writesFor = (seen: Seen[]) => seen.flatMap(s => s.writes)
const opsOn = (seen: Seen[], t: string) => seen.filter(s => s.table === t).flatMap(s => s.ops)
const scopeIn = (seen: Seen[], t: string, col: string) =>
  opsOn(seen, t).find(([op, c]) => op === 'in' && c === col)?.[2] as string[] | undefined

beforeEach(() => { CURRENT_USER = { id: ME }; CALLS = []; process.env.CRON_SECRET = SECRET })

// ═══ A · /api/seed — a live operator button, not dev tooling ═════════════════

describe('9V-4 · seed — the project it writes into must be one the caller owns', () => {
  const seedTables = () => ({
    projects: [
      { id: MINE,   owner_id: ME,           name: 'Familje-Stunden', created_at: '2026-01-02' },
      { id: THEIRS, owner_id: 'user-other', name: 'Familje-Stunden AB', created_at: '2026-01-01' },
    ],
    agents: [], workflows: [],
  })
  const call = async (method: 'GET' | 'POST') => {
    vi.resetModules()
    const mod = await import('@/app/api/seed/route')
    return method === 'GET' ? mod.GET() : mod.POST()
  }
  beforeEach(() => { CURRENT = fakeDb(seedTables()) })

  it('the project read is scoped to the caller allow-list', async () => {
    await call('POST')
    expect(scopeIn(CURRENT.seen, 'projects', 'id')).toEqual([MINE])
  })

  it('a foreign project is never written to, even though it sorts FIRST by created_at', async () => {
    // THEIRS is older, so an unscoped `.order('created_at')` would put it at
    // projects[0] — and its name matches 'familje' too.
    await call('POST')
    const written = [...opsOn(CURRENT.seen, 'agents'), ...opsOn(CURRENT.seen, 'workflows')]
      .filter(([op]) => op === 'insert').map(o => o[2] as any)
    expect(written.length).toBeGreaterThan(0)
    for (const row of written) expect(row.project_id).toBe(MINE)
  })

  it('an operator who owns nothing writes nothing', async () => {
    CURRENT_USER = { id: NOBODY }
    const res = await call('POST')
    expect(res.status).toBe(400)
    expect(writesFor(CURRENT.seen)).toEqual([])
  })

  it('an empty allow-list scopes to the impossible id, never to every project', async () => {
    CURRENT_USER = { id: NOBODY }
    await call('POST')
    expect(scopeIn(CURRENT.seen, 'projects', 'id')).toEqual([IMPOSSIBLE_PROJECT_ID])
  })

  it('GET delegation carries the same guard — a page load cannot write foreign rows', async () => {
    CURRENT_USER = { id: NOBODY }
    const res = await call('GET')
    expect(res.status).toBe(400)
    expect(writesFor(CURRENT.seen)).toEqual([])
  })

  it('an unauthenticated request never reaches a query', async () => {
    CURRENT_USER = null
    const res = await call('POST')
    expect(res.status).toBe(401)
    expect(CURRENT.seen).toHaveLength(0)
  })
})

// ═══ B · /api/media/insights/check — one slot, so scope precedes ordering ════

describe('9V-4 · insights/check — the probe row must be the caller own', () => {
  const script = (id: string, project: string, published: string) => ({
    id, project_id: project, status: 'published',
    instagram_media_id: `ig-${id}`, hook: `hook-${id}`, published_at: published,
  })
  const call = async () => {
    vi.resetModules()
    const { GET } = await import('@/app/api/media/insights/check/route')
    return GET()
  }
  beforeEach(() => {
    // The FOREIGN post is newer, so it wins ORDER BY published_at DESC LIMIT 1.
    CURRENT = fakeDb({
      projects: [{ id: MINE, owner_id: ME }, { id: THEIRS, owner_id: 'user-other' }],
      media_scripts: [
        script('mine-older',    MINE,   '2026-01-01'),
        script('theirs-newer',  THEIRS, '2026-09-01'),
      ],
    })
  })

  it('DISPLACEMENT — a newer foreign post never becomes the probe row', async () => {
    const res = await call()
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.testedPost).toBe('hook-mine-older')
    expect(JSON.stringify(body)).not.toContain('theirs-newer')
  })

  it('the scope is applied BEFORE order and limit', async () => {
    await call()
    const ops = opsOn(CURRENT.seen, 'media_scripts')
    const i = (pred: (o: [string, string, unknown]) => boolean) => ops.findIndex(pred)
    expect(i(o => o[0] === 'in' && o[1] === 'project_id')).toBeGreaterThanOrEqual(0)
    expect(i(o => o[0] === 'in' && o[1] === 'project_id')).toBeLessThan(i(o => o[0] === 'order'))
    expect(i(o => o[0] === 'order')).toBeLessThan(i(o => o[0] === 'limit'))
  })

  it('an operator who owns nothing gets no_media and makes no Graph call', async () => {
    CURRENT_USER = { id: NOBODY }
    const res = await call()
    const body = await res.json()
    expect(body.reason).toBe('no_media')
    expect(CALLS).not.toContain('graph-api')
  })

  it('an empty allow-list scopes to the impossible id', async () => {
    CURRENT_USER = { id: NOBODY }
    await call()
    expect(scopeIn(CURRENT.seen, 'media_scripts', 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
  })

  it('an unauthenticated request never reaches a query or the Graph API', async () => {
    CURRENT_USER = null
    const res = await call()
    expect(res.status).toBe(401)
    expect(CURRENT.seen).toHaveLength(0)
    expect(CALLS).toEqual([])
  })
})

// ═══ C · /api/fix-image-agent — a machine boundary, not a project guard ══════

describe('9V-4 · fix-image-agent — a session is the wrong credential', () => {
  const req = (auth?: string) => new Request('https://x.test/api/fix-image-agent', {
    method: 'POST', headers: auth ? { authorization: auth } : {},
  })
  const call = async (method: 'GET' | 'POST', auth?: string) => {
    vi.resetModules()
    const mod = await import('@/app/api/fix-image-agent/route')
    return method === 'GET' ? mod.GET(req(auth)) : mod.POST(req(auth))
  }
  beforeEach(() => {
    CURRENT = fakeDb({ agents: [
      { id: 'a-mine',   project_id: MINE,   name: 'DALL-E', model: 'dall-e-3' },
      { id: 'a-theirs', project_id: THEIRS, name: 'DALL-E', model: 'dall-e-3' },
    ] })
  })

  it('no credential is refused before any query or write', async () => {
    const res = await call('POST')
    expect(res.status).toBe(401)
    expect(CURRENT.seen).toHaveLength(0)
    expect(writesFor(CURRENT.seen)).toEqual([])
  })

  it('a WRONG credential is refused', async () => {
    const res = await call('POST', 'Bearer not-the-secret')
    expect(res.status).toBe(401)
    expect(writesFor(CURRENT.seen)).toEqual([])
  })

  it('a mere user session is no longer sufficient', async () => {
    CURRENT_USER = { id: ME }
    const res = await call('POST')
    expect(res.status).toBe(401)
    expect(writesFor(CURRENT.seen)).toEqual([])
  })

  it('an unset CRON_SECRET fails closed rather than opening the route', async () => {
    delete process.env.CRON_SECRET
    const res = await call('POST', 'Bearer ')
    expect(res.status).toBe(401)
    expect(CURRENT.seen).toHaveLength(0)
  })

  it('GET delegation cannot bypass the credential', async () => {
    const res = await call('GET')
    expect(res.status).toBe(401)
    expect(CURRENT.seen).toHaveLength(0)
  })

  it('the correct credential still performs the platform-wide repair', async () => {
    // Deliberately platform-wide: BOTH projects' agents are repaired. That is the
    // operation's contract, which is exactly why it needs a machine principal
    // rather than a project guard.
    const res = await call('POST', `Bearer ${SECRET}`)
    expect(res.status).toBe(200)
    const updates = opsOn(CURRENT.seen, 'agents').filter(([op]) => op === 'update')
    expect(updates).toHaveLength(2)
  })
})

// ═══ D · /api/intelligence/graph/operations — already safe, now pinned ══════

describe('9V-4 · operations graph — already safe, and kept that way', () => {
  it('buildOperationsGraph scopes every project-native source to the allow-list', async () => {
    const actual = await vi.importActual<typeof import('@/lib/intelligence/operations-graph')>(
      '@/lib/intelligence/operations-graph')
    const probe = fakeDb({
      projects: [{ id: MINE, owner_id: ME, name: 'Mine', slug: 'mine', color: '#fff' },
                 { id: THEIRS, owner_id: 'user-other', name: 'Theirs', slug: 'theirs', color: '#000' }],
      agents: [], workflows: [], runs: [], approvals: [], outputs: [], manager_tasks: [],
    })
    await actual.buildOperationsGraph(probe.db, ME)
    for (const table of ['projects', 'agents', 'workflows', 'runs']) {
      const col = table === 'projects' ? 'id' : 'project_id'
      expect(scopeIn(probe.seen, table, col), `${table} was read unscoped`).toEqual([MINE])
    }
  })

  it('the runs scope is applied before order and limit', async () => {
    const actual = await vi.importActual<typeof import('@/lib/intelligence/operations-graph')>(
      '@/lib/intelligence/operations-graph')
    const probe = fakeDb({ projects: [{ id: MINE, owner_id: ME, name: 'M', slug: 'm', color: '#fff' }],
      agents: [], workflows: [], runs: [], approvals: [], outputs: [], manager_tasks: [] })
    await actual.buildOperationsGraph(probe.db, ME)
    const ops = opsOn(probe.seen, 'runs')
    const i = (p: (o: [string, string, unknown]) => boolean) => ops.findIndex(p)
    expect(i(o => o[0] === 'in' && o[1] === 'project_id')).toBeLessThan(i(o => o[0] === 'order'))
    expect(i(o => o[0] === 'order')).toBeLessThan(i(o => o[0] === 'limit'))
  })

  it('a caller-supplied project outside the allow-list is ignored, not honoured', async () => {
    const actual = await vi.importActual<typeof import('@/lib/intelligence/operations-graph')>(
      '@/lib/intelligence/operations-graph')
    const probe = fakeDb({ projects: [{ id: MINE, owner_id: ME, name: 'M', slug: 'm', color: '#fff' }],
      agents: [], workflows: [], runs: [], approvals: [], outputs: [], manager_tasks: [] })
    await actual.buildOperationsGraph(probe.db, ME, { projectId: THEIRS })
    expect(scopeIn(probe.seen, 'runs', 'project_id')).toEqual([MINE])
  })

  it('an operator who owns nothing scopes to the impossible id', async () => {
    const actual = await vi.importActual<typeof import('@/lib/intelligence/operations-graph')>(
      '@/lib/intelligence/operations-graph')
    const probe = fakeDb({ projects: [], agents: [], workflows: [], runs: [],
      approvals: [], outputs: [], manager_tasks: [] })
    await actual.buildOperationsGraph(probe.db, NOBODY)
    expect(scopeIn(probe.seen, 'runs', 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
  })
})
