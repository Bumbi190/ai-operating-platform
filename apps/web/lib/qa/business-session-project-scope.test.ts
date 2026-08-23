/**
 * BUSINESS_SESSION_PROJECT_SCOPE — campaigns and revenue may only be read or
 * written within the caller's own projects.
 *
 * THE HOLES THIS CLOSES. Authenticating a user is not authorizing a project.
 *
 *   campaigns GET   with no filter returned EVERY campaign in EVERY project —
 *                   the service-role query had no project predicate at all.
 *   campaigns POST  took the project from the body verbatim.
 *   campaigns PATCH selected the row by `id` ALONE. Knowing an id was enough to
 *                   update another tenant's campaign.
 *   revenue   GET   same unfiltered read, over amounts.
 *   revenue   POST  same verbatim project.
 *
 * THE STORE IS NOT MOCKED. Only the database beneath it is. The scoping lives
 * inside `listCampaigns` / `updateCampaign` / `listRevenue` via
 * `applyProjectScope`, so stubbing the store would test a re-implementation
 * and prove nothing. These tests drive the real routes through the real store
 * and assert on the FILTERS that actually reached the query builder.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const CAMPAIGNS_ROUTE = 'app/api/business/campaigns/route.ts'
const REVENUE_ROUTE   = 'app/api/business/revenue/route.ts'
const SHARED_AUTH     = 'lib/business/business-auth.ts'

const LEGACY_KEY = 'legacy-global-key'
const USER       = 'user-owner-1'
const OTHER      = 'user-owner-2'
const PROJ_A     = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const PROJ_A2    = 'a2a2a2a2-1111-4111-8111-a2a2a2a2a2a2'
const PROJ_B     = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const UNKNOWN_P  = 'dddddddd-4444-4444-8444-dddddddddddd'
const CAMP_A     = 'ca000000-0000-4000-8000-00000000000a'
const CAMP_B     = 'cb000000-0000-4000-8000-00000000000b'
const IMPOSSIBLE = '00000000-0000-0000-0000-000000000000'

// ── Controllable world ───────────────────────────────────────────────────────

let sessionUser: { id: string } | null = null
let allProjects: { id: string; slug: string; owner_id: string }[] = []
let campaigns: Record<string, unknown>[] = []
let revenueRows: Record<string, unknown>[] = []
let dbError: unknown = null

/** Every insert/update that reached the database, with the filters applied. */
let inserts: { table: string; row: Record<string, unknown> }[] = []
let updates: { table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }[] = []
/** Filters seen on each SELECT, so scoping can be asserted directly. */
let selects: { table: string; filters: Record<string, unknown> }[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
}))

function rowsOf(table: string): Record<string, unknown>[] {
  if (table === 'projects') return allProjects as unknown as Record<string, unknown>[]
  if (table === 'campaigns') return campaigns
  if (table === 'revenue_events') return revenueRows
  throw new Error(`unexpected table: ${table}`)
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const f: Record<string, unknown> = {}
      let mode: 'select' | 'insert' | 'update' = 'select'
      let payload: Record<string, unknown> = {}

      const matching = () => rowsOf(table).filter(r =>
        Object.entries(f).every(([k, v]) => {
          if (k === '__inCol' || k === '__inVals') return true
          return r[k] === v
        }) &&
        (f.__inVals === undefined ||
          (f.__inVals as string[]).includes(r[f.__inCol as string] as string)))

      const b: Record<string, unknown> = {
        select: () => b,
        order: () => b,
        limit: () => b,
        gte: () => b,
        eq: (c: string, v: unknown) => { f[c] = v; return b },
        in: (c: string, v: string[]) => { f.__inCol = c; f.__inVals = v; return b },
        insert: (row: Record<string, unknown>) => { mode = 'insert'; payload = row; return b },
        update: (patch: Record<string, unknown>) => { mode = 'update'; payload = patch; return b },
        single: async () => {
          if (dbError) return { data: null, error: dbError }
          if (mode === 'insert') {
            const row = { id: 'new-row', ...payload }
            inserts.push({ table, row: payload })
            rowsOf(table).push(row)
            return { data: row, error: null }
          }
          return { data: matching()[0] ?? null, error: null }
        },
        maybeSingle: async () => {
          if (dbError) return { data: null, error: dbError }
          if (mode === 'update') {
            updates.push({ table, patch: payload, filters: { ...f } })
            const hit = matching()[0]
            if (!hit) return { data: null, error: null }
            Object.assign(hit, payload)
            return { data: hit, error: null }
          }
          return { data: matching()[0] ?? null, error: null }
        },
        then: (res: (x: unknown) => unknown, rej: (x: unknown) => unknown) => {
          selects.push({ table, filters: { ...f } })
          const out = dbError
            ? { data: null, error: dbError }
            : { data: matching(), error: null }
          return Promise.resolve(out).then(res, rej)
        },
      }
      return b
    },
  }),
}))

const campaignsRoute = await import('@/app/api/business/campaigns/route')
const revenueRoute   = await import('@/app/api/business/revenue/route')

// ── Helpers ─────────────────────────────────────────────────────────────────

const req = (url: string, init: RequestInit = {}, token?: string) =>
  new Request(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> ?? {}),
    },
  })

const getC = (qs = '', token?: string) => req(`https://x.test/api/business/campaigns${qs}`, {}, token)
const postC = (body: unknown, token?: string) =>
  req('https://x.test/api/business/campaigns', { method: 'POST', body: JSON.stringify(body) }, token)
const patchC = (body: unknown, token?: string) =>
  req('https://x.test/api/business/campaigns', { method: 'PATCH', body: JSON.stringify(body) }, token)
const getR = (qs = '', token?: string) => req(`https://x.test/api/business/revenue${qs}`, {}, token)
const postR = (body: unknown, token?: string) =>
  req('https://x.test/api/business/revenue', { method: 'POST', body: JSON.stringify(body) }, token)

/** The scope filter that reached the last SELECT on `table`, if any. */
const scopeOf = (table: string) => {
  const s = [...selects].reverse().find(x => x.table === table)
  return s?.filters.__inVals as string[] | undefined
}

beforeEach(() => {
  sessionUser = { id: USER }
  dbError = null
  inserts = []; updates = []; selects = []
  allProjects = [
    { id: PROJ_A,  slug: 'alpha',  owner_id: USER },
    { id: PROJ_A2, slug: 'alpha2', owner_id: USER },
    { id: PROJ_B,  slug: 'beta',   owner_id: OTHER },
  ]
  campaigns = [
    { id: CAMP_A, project_id: PROJ_A, name: 'A-kampanj', status: 'active' },
    { id: CAMP_B, project_id: PROJ_B, name: 'B-kampanj', status: 'active' },
  ]
  revenueRows = [
    { id: 'ra', project_id: PROJ_A, amount_sek: 100 },
    { id: 'rb', project_id: PROJ_B, amount_sek: 999 },
  ]
  process.env.AIOPS_API_KEY = LEGACY_KEY
})

afterEach(() => { vi.restoreAllMocks() })

// ── CAMPAIGNS — GET ──────────────────────────────────────────────────────────

describe('campaigns GET — session', () => {
  it('returns only the caller\'s own campaigns when no filter is given', async () => {
    const res = await campaignsRoute.GET(getC())
    expect(res.status).toBe(200)
    const rows = await res.json() as { project_id: string }[]
    expect(rows.map(r => r.project_id)).toEqual([PROJ_A])
  })

  it('scopes the QUERY, not the result — the predicate reached the database', async () => {
    await campaignsRoute.GET(getC())
    expect(scopeOf('campaigns')?.sort()).toEqual([PROJ_A, PROJ_A2].sort())
  })

  it('an explicit foreign project filter narrows to nothing, never widens', async () => {
    const res = await campaignsRoute.GET(getC(`?project_id=${PROJ_B}`))
    expect(await res.json()).toEqual([])
    // The allow-list predicate is still applied alongside the caller's filter.
    expect(scopeOf('campaigns')?.sort()).toEqual([PROJ_A, PROJ_A2].sort())
  })

  it('an own-project filter still works', async () => {
    const res = await campaignsRoute.GET(getC(`?project_id=${PROJ_A}`))
    expect((await res.json() as unknown[]).length).toBe(1)
  })

  it('a user who owns nothing sees nothing — impossible id, not an open query', async () => {
    sessionUser = { id: 'nobody' }
    const res = await campaignsRoute.GET(getC())
    expect(await res.json()).toEqual([])
    expect(scopeOf('campaigns')).toEqual([IMPOSSIBLE])
  })

  it('denies with no session and no key', async () => {
    sessionUser = null
    const res = await campaignsRoute.GET(getC())
    expect(res.status).toBe(401)
  })
})

// ── CAMPAIGNS — POST ─────────────────────────────────────────────────────────

describe('campaigns POST — session', () => {
  it('creates in an owned project and writes the VERIFIED id', async () => {
    const res = await campaignsRoute.POST(postC({ project_id: PROJ_A, name: 'ny' }))
    expect(res.status).toBe(201)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].row.project_id).toBe(PROJ_A)
  })

  it('resolves an owned slug to its id', async () => {
    await campaignsRoute.POST(postC({ project_slug: 'alpha', name: 'ny' }))
    expect(inserts[0].row.project_id).toBe(PROJ_A)
  })

  it.each([
    ['foreign project', { project_id: PROJ_B, name: 'x' }],
    ['unknown project', { project_id: UNKNOWN_P, name: 'x' }],
    ['foreign slug',    { project_slug: 'beta', name: 'x' }],
    ['unknown slug',    { project_slug: 'nope', name: 'x' }],
  ])('DENIES %s and never inserts', async (_l, body) => {
    const res = await campaignsRoute.POST(postC(body))
    expect(res.status).toBe(403)
    expect(inserts).toHaveLength(0)
  })

  it('answers identically for foreign and unknown — no existence oracle', async () => {
    const a = await campaignsRoute.POST(postC({ project_id: PROJ_B, name: 'x' }))
    const b = await campaignsRoute.POST(postC({ project_id: UNKNOWN_P, name: 'x' }))
    expect(a.status).toBe(b.status)
    expect(await a.text()).toBe(await b.text())
  })

  it('denies when the user owns nothing', async () => {
    sessionUser = { id: 'nobody' }
    const res = await campaignsRoute.POST(postC({ project_id: PROJ_A, name: 'x' }))
    expect(res.status).toBe(403)
    expect(inserts).toHaveLength(0)
  })

  it('keeps the pre-existing 400 when no project is named', async () => {
    const res = await campaignsRoute.POST(postC({ name: 'x' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Okänt projekt')
    expect(inserts).toHaveLength(0)
  })

  it('drops fields outside the documented contract', async () => {
    await campaignsRoute.POST(postC({
      project_id: PROJ_A, name: 'ny', channel: 'email', status: 'draft',
      project_slug: 'beta', injected: 'x', id: 'forged',
    }))
    const row = inserts[0].row
    expect(row.project_id).toBe(PROJ_A)
    expect(row.injected).toBeUndefined()
    expect(Object.keys(row)).not.toContain('project_slug')
  })
})

// ── CAMPAIGNS — PATCH ────────────────────────────────────────────────────────

describe('campaigns PATCH — the target must be owned', () => {
  it('updates an owned campaign', async () => {
    const res = await campaignsRoute.PATCH(patchC({ id: CAMP_A, name: 'ändrad' }))
    expect(res.status).toBe(200)
    expect(updates).toHaveLength(1)
    expect(campaigns.find(c => c.id === CAMP_A)!.name).toBe('ändrad')
  })

  it('DENIES a foreign campaign and changes nothing', async () => {
    const res = await campaignsRoute.PATCH(patchC({ id: CAMP_B, name: 'kapad' }))
    expect(res.status).toBe(404)
    expect(campaigns.find(c => c.id === CAMP_B)!.name).toBe('B-kampanj')
  })

  it('the decisive case: foreign campaign id + own project in the body', async () => {
    // This is the bypass the old code allowed in spirit — the body project was
    // never consulted, and the id alone selected the row. Both must fail now.
    const res = await campaignsRoute.PATCH(patchC({ id: CAMP_B, project_id: PROJ_A, name: 'kapad' }))
    expect(res.status).toBe(404)
    expect(campaigns.find(c => c.id === CAMP_B)!.name).toBe('B-kampanj')
  })

  it('scopes the UPDATE itself at the database boundary', async () => {
    await campaignsRoute.PATCH(patchC({ id: CAMP_A, name: 'x' }))
    expect(updates[0].filters.__inVals as string[]).toEqual(
      expect.arrayContaining([PROJ_A, PROJ_A2]),
    )
    expect(updates[0].filters.id).toBe(CAMP_A)
  })

  it('denies an unknown campaign id', async () => {
    const res = await campaignsRoute.PATCH(patchC({ id: 'nope', name: 'x' }))
    expect(res.status).toBe(404)
  })

  it('a user who owns nothing can update nothing', async () => {
    sessionUser = { id: 'nobody' }
    const res = await campaignsRoute.PATCH(patchC({ id: CAMP_A, name: 'x' }))
    expect(res.status).toBe(404)
    expect(updates[0].filters.__inVals).toEqual([IMPOSSIBLE])
    expect(campaigns.find(c => c.id === CAMP_A)!.name).toBe('A-kampanj')
  })

  // ── MASS ASSIGNMENT ────────────────────────────────────────────────────────
  //
  // Scoping the UPDATE protects WHICH ROW is selected. It says nothing about
  // WHAT THE ROW BECOMES. `{ id, ...patch }` carried every remaining body key
  // into the update payload, so an owned campaign could be MOVED into a
  // project the caller does not own: the `.in('project_id', allowed)` predicate
  // matches the row's value BEFORE the write, and the write then changes it.

  it('cannot move an owned campaign into a project the caller does not own', async () => {
    const res = await campaignsRoute.PATCH(patchC({ id: CAMP_A, project_id: PROJ_B, name: 'moved' }))
    expect(res.status).toBe(200)
    // The row must stay where it was.
    expect(campaigns.find(c => c.id === CAMP_A)!.project_id).toBe(PROJ_A)
    // And the project must never have reached the update payload at all.
    expect(updates[0].patch.project_id).toBeUndefined()
  })

  it('never passes project_slug into the update payload', async () => {
    await campaignsRoute.PATCH(patchC({ id: CAMP_A, project_slug: 'beta', name: 'x' }))
    expect(updates[0].patch.project_slug).toBeUndefined()
  })

  it('drops arbitrary injected fields from the update payload', async () => {
    await campaignsRoute.PATCH(patchC({
      id: CAMP_A, name: 'x', injected: 'evil', created_at: '1999-01-01', id_forged: 'y',
    }))
    const patch = updates[0].patch
    expect(patch.injected).toBeUndefined()
    expect(patch.created_at).toBeUndefined()
    expect(patch.id_forged).toBeUndefined()
    expect(patch.id).toBeUndefined()
  })

  it('still applies the documented campaign fields', async () => {
    await campaignsRoute.PATCH(patchC({
      id: CAMP_A, name: 'nytt', channel: 'email', status: 'paused',
      started_at: '2026-01-01', ended_at: null,
    }))
    expect(updates[0].patch).toEqual({
      name: 'nytt', channel: 'email', status: 'paused',
      started_at: '2026-01-01', ended_at: null,
    })
    expect(campaigns.find(c => c.id === CAMP_A)!.name).toBe('nytt')
  })

  it('a foreign campaign with an owned project in the body still writes nothing', async () => {
    const res = await campaignsRoute.PATCH(patchC({ id: CAMP_B, project_id: PROJ_A, name: 'kapad' }))
    expect(res.status).toBe(404)
    expect(campaigns.find(c => c.id === CAMP_B)!.name).toBe('B-kampanj')
    expect(campaigns.find(c => c.id === CAMP_B)!.project_id).toBe(PROJ_B)
  })

  it('a foreign campaign with a foreign project in the body writes nothing', async () => {
    const res = await campaignsRoute.PATCH(patchC({ id: CAMP_B, project_id: PROJ_B, name: 'kapad' }))
    expect(res.status).toBe(404)
    expect(campaigns.find(c => c.id === CAMP_B)!.name).toBe('B-kampanj')
  })

  it('empty project access writes nothing even with a project in the body', async () => {
    sessionUser = { id: 'nobody' }
    const res = await campaignsRoute.PATCH(patchC({ id: CAMP_A, project_id: PROJ_A, name: 'x' }))
    expect(res.status).toBe(404)
    expect(campaigns.find(c => c.id === CAMP_A)!.name).toBe('A-kampanj')
    expect(campaigns.find(c => c.id === CAMP_A)!.project_id).toBe(PROJ_A)
  })

  it('still requires an id', async () => {
    const res = await campaignsRoute.PATCH(patchC({ name: 'x' }))
    expect(res.status).toBe(400)
    expect(updates).toHaveLength(0)
  })
})

// ── REVENUE ──────────────────────────────────────────────────────────────────

describe('revenue GET — session', () => {
  it('returns only own rows with no filter', async () => {
    const res = await revenueRoute.GET(getR())
    const rows = await res.json() as { project_id: string }[]
    expect(rows.map(r => r.project_id)).toEqual([PROJ_A])
  })

  it('scopes the query at the database boundary', async () => {
    await revenueRoute.GET(getR())
    expect(scopeOf('revenue_events')?.sort()).toEqual([PROJ_A, PROJ_A2].sort())
  })

  it('a foreign filter yields nothing', async () => {
    const res = await revenueRoute.GET(getR(`?project_id=${PROJ_B}`))
    expect(await res.json()).toEqual([])
  })

  it('empty access yields zero rows, not all rows', async () => {
    sessionUser = { id: 'nobody' }
    const res = await revenueRoute.GET(getR())
    expect(await res.json()).toEqual([])
    expect(scopeOf('revenue_events')).toEqual([IMPOSSIBLE])
  })
})

describe('revenue POST — session', () => {
  it('logs to an owned project with the verified id', async () => {
    const res = await revenueRoute.POST(postR({ project_id: PROJ_A, amount_sek: 50 }))
    expect(res.status).toBe(201)
    expect(inserts[0].row.project_id).toBe(PROJ_A)
    expect(inserts[0].row.amount_sek).toBe(50)
  })

  it.each([
    ['foreign', { project_id: PROJ_B, amount_sek: 1 }],
    ['unknown', { project_id: UNKNOWN_P, amount_sek: 1 }],
    ['foreign slug', { project_slug: 'beta', amount_sek: 1 }],
  ])('DENIES %s and never inserts', async (_l, body) => {
    const res = await revenueRoute.POST(postR(body))
    expect(res.status).toBe(403)
    expect(inserts).toHaveLength(0)
  })

  it('denies when the user owns nothing', async () => {
    sessionUser = { id: 'nobody' }
    const res = await revenueRoute.POST(postR({ project_id: PROJ_A, amount_sek: 1 }))
    expect(res.status).toBe(403)
    expect(inserts).toHaveLength(0)
  })

  it('never lets a body project reach the row', async () => {
    await revenueRoute.POST(postR({ project_id: PROJ_A, project_slug: 'beta', amount_sek: 7 }))
    expect(inserts[0].row.project_id).toBe(PROJ_A)
  })
})

// ── Fail closed ─────────────────────────────────────────────────────────────

describe('fail closed', () => {
  it('denies a campaigns POST when the project lookup errors', async () => {
    dbError = { message: 'db down' }
    const res = await campaignsRoute.POST(postC({ project_id: PROJ_A, name: 'x' }))
    expect(res.status).toBe(403)
    expect(inserts).toHaveLength(0)
  })

  it('denies a revenue POST when the project lookup errors', async () => {
    dbError = { message: 'db down' }
    const res = await revenueRoute.POST(postR({ project_id: PROJ_A, amount_sek: 1 }))
    expect(res.status).toBe(403)
    expect(inserts).toHaveLength(0)
  })

  it('rejects a non-object body before authorizing', async () => {
    for (const route of [
      () => campaignsRoute.POST(postC(['nope'])),
      () => revenueRoute.POST(postR(['nope'])),
    ]) {
      inserts = []
      const res = await route()
      expect(res.status).toBe(400)
      expect(inserts).toHaveLength(0)
    }
  })
})

// ── Legacy must not regress ─────────────────────────────────────────────────

describe('legacy AIOPS_API_KEY — unchanged in 4B1', () => {
  it('campaigns GET is unscoped for legacy, exactly as before', async () => {
    sessionUser = null
    const res = await campaignsRoute.GET(getC('', LEGACY_KEY))
    expect(res.status).toBe(200)
    expect((await res.json() as unknown[]).length).toBe(2)
    // No allow-list predicate at all on the legacy path.
    expect(scopeOf('campaigns')).toBeUndefined()
  })

  it('campaigns POST still takes the project from the body', async () => {
    sessionUser = null
    const res = await campaignsRoute.POST(postC({ project_id: PROJ_B, name: 'x' }, LEGACY_KEY))
    expect(res.status).toBe(201)
    expect(inserts[0].row.project_id).toBe(PROJ_B)
  })

  it('campaigns PATCH still targets by id alone', async () => {
    sessionUser = null
    const res = await campaignsRoute.PATCH(patchC({ id: CAMP_B, name: 'legacy-ändrad' }, LEGACY_KEY))
    expect(res.status).toBe(200)
    expect(updates[0].filters.__inVals).toBeUndefined()
  })

  it('revenue GET and POST unchanged for legacy', async () => {
    sessionUser = null
    const g = await revenueRoute.GET(getR('', LEGACY_KEY))
    expect((await g.json() as unknown[]).length).toBe(2)
    const p = await revenueRoute.POST(postR({ project_id: PROJ_B, amount_sek: 3 }, LEGACY_KEY))
    expect(p.status).toBe(201)
    expect(inserts[0].row.project_id).toBe(PROJ_B)
  })

  it('a wrong key is still 401 on every method', async () => {
    sessionUser = null
    for (const r of [
      campaignsRoute.GET(getC('', 'wrong')),
      campaignsRoute.POST(postC({ name: 'x' }, 'wrong')),
      campaignsRoute.PATCH(patchC({ id: CAMP_A }, 'wrong')),
      revenueRoute.GET(getR('', 'wrong')),
      revenueRoute.POST(postR({ amount_sek: 1 }, 'wrong')),
    ]) expect((await r).status).toBe(401)
  })

  it('an unset verifier secret still yields the old 500', async () => {
    sessionUser = null
    delete process.env.AIOPS_API_KEY
    const res = await campaignsRoute.GET(getC('', 'anything'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('AIOPS_API_KEY')
  })
})

// ── Structure ───────────────────────────────────────────────────────────────

describe('structure', () => {
  it('uses the canonical boundary, with no parallel ownership logic', () => {
    const src = read(SHARED_AUTH)
    expect(src).toContain("from '@/lib/auth/project-access'")
    expect(src).toContain('resolveProjectAccess()')
    expect(src).toContain('assertProjectAllowed(')
    expect(src).toContain("from '@/lib/atlas/isolation'")
    expect(src).toContain('scopeToProjects(')
    expect(src).not.toContain('owner_id')
    expect(src).not.toContain('getAllowedProjectIds(')
  })

  it('cross-checks the two session reads', () => {
    expect(read(SHARED_AUTH)).toContain('access.userId !== sessionUserId')
  })

  it('scopes reads in the store, not by post-filtering', () => {
    const store = read('lib/business/store.ts')
    expect(store).toContain('applyProjectScope')
    for (const fn of ['listCampaigns', 'listRevenue', 'updateCampaign']) {
      const at = store.indexOf(`export async function ${fn}`)
      const body = store.slice(at, store.indexOf('\n}', at))
      expect(body).toContain('applyProjectScope')
    }
  })

  it('builds session writes by pick, never by spread', () => {
    for (const p of [CAMPAIGNS_ROUTE, REVENUE_ROUTE]) {
      const src = read(p)
      const at = src.indexOf("if (auth.auth.kind === 'user')")
      const body = src.slice(at, src.indexOf('// Legacy global-key path', at))
      expect(body).not.toContain('...body')
      expect(body).toContain('project.projectId')
    }
  })

  it('never reads a project out of the body in a session write branch', () => {
    // The resolver already validated body.project_id against the allow-list, so
    // a `body.project_id ?? project.projectId` fallback is equivalent TODAY and
    // therefore invisible to a behavioural test. Assert it at the source so the
    // fallback cannot be introduced and lie dormant until someone later relaxes
    // the validation, at which point it would silently become live.
    for (const p of [CAMPAIGNS_ROUTE, REVENUE_ROUTE]) {
      const src = read(p)
      const at = src.indexOf("if (auth.auth.kind === 'user')")
      const body = src.slice(at, src.indexOf('// Legacy global-key path', at))
      expect(body).not.toMatch(/body\.project_id/)
      expect(body).not.toMatch(/body\.project_slug/)
      expect(body).not.toMatch(/body\[['"]project_/)
    }
  })

  it('the campaigns PATCH session branch builds an allow-listed patch', () => {
    // The earlier assertion sliced from the FIRST "Legacy global-key path"
    // comment, which belongs to POST — so it never inspected PATCH at all, and
    // that is exactly how the mass-assignment hole survived review. This one
    // anchors on the PATCH function itself.
    const src = read(CAMPAIGNS_ROUTE)
    const patchFn = src.slice(src.indexOf('export async function PATCH'))
    const sessionBranch = patchFn.slice(
      patchFn.indexOf("if (auth.auth.kind === 'user')"),
      patchFn.indexOf('// Legacy global-key path'),
    )
    expect(sessionBranch.length).toBeGreaterThan(100)

    // Rebuilt from the documented field list, never handed the raw rest-spread.
    expect(sessionBranch).toContain('SESSION_CAMPAIGN_FIELDS')
    expect(sessionBranch).toContain('safePatch')
    expect(sessionBranch).toMatch(/updateCampaign\(\s*id,\s*safePatch,/)
    expect(sessionBranch).not.toMatch(/updateCampaign\(\s*id,\s*patch\b/)
    expect(sessionBranch).not.toContain('...patch')
    expect(sessionBranch).not.toContain('...body')
    expect(sessionBranch).not.toMatch(/body\.project_/)
    expect(sessionBranch).not.toMatch(/patch\.project_/)

    // The allow-list itself must not contain a project or identity key.
    const list = src.slice(src.indexOf('const SESSION_CAMPAIGN_FIELDS'))
      .slice(0, src.slice(src.indexOf('const SESSION_CAMPAIGN_FIELDS')).indexOf('\n'))
    for (const forbidden of ['project_id', 'project_slug', 'id', 'created_at']) {
      expect(list).not.toContain(`'${forbidden}'`)
    }
  })

  it('keeps chat/tts untouched by this phase', () => {
    const tts = read('app/api/chat/tts/route.ts')
    expect(tts).toContain('requireUserOrApiKey')
    expect(tts).not.toContain('business-auth')
  })

  it('records the legacy debt in both routes', () => {
    for (const p of [CAMPAIGNS_ROUTE, REVENUE_ROUTE]) {
      expect(read(p)).toContain('TRANSITIONAL SECURITY DEBT')
    }
  })

  it('leaves lib/api-auth.ts unchanged in shape', () => {
    const src = read('lib/api-auth.ts')
    expect(src).toContain('export function requireApiKey')
    expect(src).toContain('export async function requireUserOrApiKey')
    expect(src).toContain('process.env.AIOPS_API_KEY')
  })
})
