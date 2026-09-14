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
 *     Settings S0 then REMOVED it (owner decision), together with /api/migrate;
 *     block A pins the removal.
 *
 *   /api/media/insights/check    — a LIVE Settings diagnostic (TokenUpdater.tsx).
 *     It picked the most recent published script from EVERY tenant and echoed
 *     `script.hook` back. One slot, ORDER BY published_at DESC LIMIT 1, so the
 *     scope has to precede the ordering or the wrong row wins. → project guard.
 *     Settings S0 stopped it returning the provider's raw error text.
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
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
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
let INSIGHTS_RESULT: { ok: boolean; metrics?: Record<string, number>; error?: string } = { ok: true, metrics: { reach: 1 } }
vi.mock('@/lib/media/insights', () => ({
  fetchMediaInsights: async () => { CALLS.push('graph-api'); return INSIGHTS_RESULT },
}))

const writesFor = (seen: Seen[]) => seen.flatMap(s => s.writes)
const opsOn = (seen: Seen[], t: string) => seen.filter(s => s.table === t).flatMap(s => s.ops)
const scopeIn = (seen: Seen[], t: string, col: string) =>
  opsOn(seen, t).find(([op, c]) => op === 'in' && c === col)?.[2] as string[] | undefined

beforeEach(() => { CURRENT_USER = { id: ME }; CALLS = []; INSIGHTS_RESULT = { ok: true, metrics: { reach: 1 } }; process.env.CRON_SECRET = SECRET })

// ═══ A · /api/seed and /api/migrate — removed from the deployed product ═══════
//
// Phase 9V-4 scoped /api/seed to the caller's own projects. Settings S0 removed it
// (owner decision): production already held exactly what it wrote, nothing — no
// cron, CI path or code — called it, and its only live effects were risks: a GET
// that wrote, a reset by agent name, an oldest-project fallback and no audit. The
// development path survives as scripts/seed-familje-stunden.ts, outside the
// deployed app. /api/migrate went with it: its POST reported migrations it never
// ran and its GET handed schema DDL to any session. These tests keep both from
// returning unnoticed.

describe('Settings S0 · seed and migrate — removed, not merely guarded', () => {
  const APP = resolve(__dirname, '../..')
  const appSources = (dir: string): string[] => readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (entry === 'node_modules' || entry === '.next' || entry === 'qa') return []
    if (statSync(full).isDirectory()) return appSources(full)
    return /\.(ts|tsx)$/.test(entry) ? [full] : []
  })
  const deployed = () => ['app', 'components', 'lib'].flatMap((d) => appSources(resolve(APP, d)))

  it('the /api/seed route no longer exists', () => {
    expect(existsSync(resolve(APP, 'app/api/seed/route.ts'))).toBe(false)
    expect(existsSync(resolve(APP, 'app/api/seed'))).toBe(false)
  })

  it('the /api/migrate route no longer exists', () => {
    expect(existsSync(resolve(APP, 'app/api/migrate/route.ts'))).toBe(false)
    expect(existsSync(resolve(APP, 'app/api/migrate'))).toBe(false)
  })

  it('Settings no longer offers a seed control', () => {
    // Settings S1 moved the legacy body into SettingsLegacy.tsx and added the vNext
    // surface: the seed control stays gone from every file that renders /settings.
    for (const rel of [
      'app/(platform)/settings/page.tsx',
      'app/(platform)/settings/SettingsLegacy.tsx',
      'components/platform/vnext/SettingsSurface.tsx',
      'components/platform/vnext/SettingsCredentialForm.tsx',
      'lib/os/settings.ts',
      'lib/os/settings-shared.ts',
    ]) {
      expect(readFileSync(resolve(APP, rel), 'utf8'), rel).not.toMatch(/SeedButton|Exempeldata|\/api\/seed/)
    }
    expect(existsSync(resolve(APP, 'app/(platform)/settings/SeedButton.tsx'))).toBe(false)
  })

  it('no deployed code calls either route', () => {
    const callers = deployed().filter((f) => /\/api\/(seed|migrate)\b/.test(readFileSync(f, 'utf8')))
    expect(callers).toEqual([])
  })

  it('the development-only seed script remains, and nothing deployed imports it', () => {
    expect(existsSync(resolve(APP, 'scripts/seed-familje-stunden.ts'))).toBe(true)
    const importers = deployed().filter((f) => /seed-familje-stunden/.test(readFileSync(f, 'utf8')))
    expect(importers).toEqual([])
  })

  it('the removal carries no data statement — existing agents and workflows stay exactly as they are', () => {
    const sql = readFileSync(resolve(APP, 'supabase/migrations/20260914090000_platform_tokens_client_revoke.sql'), 'utf8')
      .replace(/--.*$/gm, '')
    expect(sql).not.toMatch(/\b(agents|workflows)\b/i)
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate|drop)\b/i)
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

  it('S0 · a provider refusal reaches the browser only as a class and a fixed sentence — never its text or a token', async () => {
    const token = `EAAB${'q'.repeat(40)}`
    INSIGHTS_RESULT = { ok: false, error: `(#10) Application does not have permission — https://graph.facebook.com/v21.0/ig-1/insights?access_token=${token}` }
    const res = await call()
    const body = await res.json()
    expect(body).toEqual({
      ok: false,
      reason: 'permission',
      message: 'Graph API nekade insights-anropet. Tokenet saknar troligen instagram_manage_insights.',
    })
    const text = JSON.stringify(body)
    for (const leak of [token, 'access_token', 'graph.facebook.com', 'Application does not have']) expect(text).not.toContain(leak)
  })

  it('S0 · any other provider failure is classified as an error, with no provider detail', async () => {
    INSIGHTS_RESULT = { ok: false, error: `fetch failed while sending EAAB${'r'.repeat(40)}` }
    const res = await call()
    const body = await res.json()
    expect(body).toEqual({ ok: false, reason: 'error', message: 'Insights kunde inte läsas från Graph API.' })
    expect(JSON.stringify(body)).not.toMatch(/EAAB|fetch failed/)
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
