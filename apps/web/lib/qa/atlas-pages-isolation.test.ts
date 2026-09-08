/**
 * Remaining Atlas page isolation (Phase 9Q).
 *
 * Three pages read project-owned data through the SERVICE-ROLE client without
 * a scope, and the shape of the bug is the same in all three — and worth
 * naming, because it survived four earlier sweeps:
 *
 *   `applyProjectScope(query, undefined)` returns the query UNCHANGED.
 *
 * So `gatherAtlasContext(db)` and `getOperations(db)` were not "unscoped
 * helpers" — the helpers were scope-capable, and /api/chat passed the
 * allow-list correctly the whole time. The pages simply omitted the second
 * argument, and an optional parameter turned that omission into a silent
 * global read. Both signatures are now REQUIRED, which converts the same
 * mistake into a compile error.
 *
 * Atlas Marketing is different: `getMarketingReview` had no scope parameter at
 * all. Its whole chain (campaign_plans → campaign_briefs → draft_posts →
 * guard_reports → runs) is DERIVED from one root lookup of a hard-coded slug,
 * so exactly one guard is needed — authorization at that root — and inventing
 * five per-table guards would be theatre. The tests below assert the chain,
 * not a guard per table.
 *
 * Atlas Home's vNext path was already scoped inside `loadAtlasHomeViewModel`;
 * only the legacy rollback branch was exposed, and that is the branch these
 * tests drive. Its `projects` read uses the RLS client and was never global —
 * it is asserted here so a future refactor cannot quietly swap the client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

;(globalThis as any).React = React

const ME = 'user-me'
const MINE = '11111111-1111-1111-1111-111111111111'
const THEIRS = '22222222-2222-2222-2222-222222222222'

const iso = (d: number) => new Date(Date.now() - d * 864e5).toISOString()

/** The helper only looks at the active + next month, keyed `fs-YYYY-MM`. */
const ACTIVE_PLAN_KEY = (() => {
  const n = new Date()
  return `fs-${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`
})()

function seed() {
  const media_scripts: any[] = []
  // 12 foreign stuck videos, newer than the owned one, to fill `.limit(10)`.
  for (let i = 0; i < 12; i++) {
    media_scripts.push({
      id: `ms-theirs-${i}`, project_id: THEIRS, status: 'published',
      hook: `SECRET-HOOK-${i}`, voice_status: 'failed', video_status: 'ok',
      voice_attempts: 5, render_attempts: 0, pipeline_failed_reason: 'SECRET-REASON',
      published_at: iso(1), updated_at: iso(1),
    })
  }
  media_scripts.push({
    id: 'ms-mine', project_id: MINE, status: 'published',
    hook: 'MIN-HOOK', voice_status: 'failed', video_status: 'ok',
    voice_attempts: 5, render_attempts: 0, pipeline_failed_reason: 'min-orsak',
    published_at: iso(9), updated_at: iso(9),
  })

  return {
    projects: [
      { id: MINE, owner_id: ME, name: 'Mitt Projekt', slug: 'mitt-projekt', color: '#0f0', settings: {}, created_at: iso(9) },
      { id: THEIRS, owner_id: 'user-other', name: 'SECRET-PROJECT', slug: 'familje-stunden', color: '#f00', settings: {}, created_at: iso(1) },
    ],
    media_scripts,
    media_insights: [{ id: 'mi-theirs', project_id: THEIRS, platform: 'instagram', views: 9, reach: 9, impressions: 9 }],
    runs: [
      { id: 'run-mine', project_id: MINE, status: 'failed', error: 'MIN-FEL', last_error: 'MIN-FEL', created_at: iso(0), finished_at: iso(0), started_at: iso(0), workflows: { name: 'Mitt Flode' } },
      { id: 'run-theirs', project_id: THEIRS, status: 'failed', error: 'SECRET-ERROR', last_error: 'SECRET-ERROR', created_at: iso(0), finished_at: iso(0), started_at: iso(0), workflows: { name: 'SECRET-FLOW' } },
    ],
    leads: [
      { id: 'l-mine', project_id: MINE, status: 'new' },
      { id: 'l-theirs', project_id: THEIRS, status: 'new' },
    ],
    cost_events: [
      { project_id: MINE, cost_sek: 5, created_at: iso(0) },
      { project_id: THEIRS, cost_sek: 99_999, created_at: iso(0) },
    ],
    revenue_events: [
      { project_id: MINE, amount_sek: 100, occurred_at: iso(0) },
      { project_id: THEIRS, amount_sek: 99_999, occurred_at: iso(0) },
    ],
    approvals: [{ id: 'ap-theirs', project_id: THEIRS, status: 'pending' }],
    memories: [], outputs: [], media_news_items: [], campaigns: [],
    token_health: [], cron_heartbeat: [],
    // Marketing chain — the foreign project owns the hard-coded slug.
    campaign_plans: [{ id: 'cp-theirs', project_id: THEIRS, plan_key: ACTIVE_PLAN_KEY, theme_name: 'SECRET-THEME', status: 'active', run_id: null, target_month: ACTIVE_PLAN_KEY }],
    campaign_briefs: [{ id: 'cb-theirs', plan_id: 'cp-theirs', project_id: THEIRS, brief_key: 'b', status: 'drafting' }],
    draft_posts: [{ id: 'dp-theirs', brief_id: 'cb-theirs', project_id: THEIRS, draft_key: 'd', status: 'pending', version: 1, draft_payload: {} }],
    guard_reports: [{ id: 'gr-theirs', draft_id: 'dp-theirs', project_id: THEIRS, verdict: 'PASS' }],
  }
}

interface Seen { table: string; ops: [string, string, unknown][] }
const get = (r: any, p: string): unknown => p.split('.').reduce((a: any, k) => (a == null ? a : a[k]), r)

function fakeDb(tables: Record<string, any[]>) {
  const seen: Seen[] = []
  const from = (table: string) => {
    const rec: Seen = { table, ops: [] }
    seen.push(rec)
    let rows: any[] = (tables[table] ?? []).map(r => ({ ...r }))
    let head = false
    const q: any = {
      select: (_c?: string, o?: { head?: boolean; count?: string }) => { if (o?.head) head = true; return q },
      eq: (c: string, v: unknown) => { rec.ops.push(['eq', c, v]); rows = rows.filter(r => get(r, c) === v); return q },
      neq: (c: string, v: unknown) => { rec.ops.push(['neq', c, v]); rows = rows.filter(r => get(r, c) !== v); return q },
      in: (c: string, v: unknown[]) => { rec.ops.push(['in', c, v]); rows = rows.filter(r => v.includes(get(r, c) as never)); return q },
      gte: (c: string, v: string) => { rec.ops.push(['gte', c, v]); rows = rows.filter(r => String(get(r, c)) >= v); return q },
      lte: () => q, not: () => q, or: (s: string) => { rec.ops.push(['or', s, null]); return q },
      order: (c: string, o?: { ascending?: boolean }) => {
        rec.ops.push(['order', c, o?.ascending !== false])
        const dir = o?.ascending === false ? -1 : 1
        rows = [...rows].sort((a, b) => (String(get(a, c)) < String(get(b, c)) ? -1 : 1) * dir)
        return q
      },
      limit: (n: number) => { rec.ops.push(['limit', String(n), n]); rows = rows.slice(0, n); return q },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: null }),
      then: (ok: any, err?: any) =>
        Promise.resolve(head ? { data: null, count: rows.length, error: null }
                             : { data: rows, count: rows.length, error: null }).then(ok, err),
    }
    return q
  }
  return { db: { from } as any, seen }
}

let CURRENT_USER: { id: string } | null = { id: ME }
let CURRENT: ReturnType<typeof fakeDb>
/** The RLS client returns only rows the database would let this user read. */
let RLS: ReturnType<typeof fakeDb>

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: CURRENT_USER } }) },
    from: (t: string) => RLS.db.from(t),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => CURRENT.db }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`) } }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'legacy' }) }) }))

function collect(node: any, out: string[], depth = 0) {
  if (node == null || depth > 60) return
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return }
  if (Array.isArray(node)) { for (const c of node) collect(c, out, depth + 1); return }
  if (typeof node !== 'object') return
  const src = node.props ?? node
  for (const [k, v] of Object.entries(src)) {
    if (k === 'className' || k === 'icon') continue
    collect(v, out, depth + 1)
  }
}

async function renderPage(mod: string, props?: any) {
  vi.resetModules()
  const m = await import(mod)
  const el = await m.default(props)
  const out: string[] = []
  collect(el, out)
  return { text: out.join(' | '), parts: out, seen: CURRENT.seen }
}

const q = (seen: Seen[], table: string) => seen.filter(s => s.table === table)
/** Find a query on `table` whose recorded ops contain all of `must` ("op:col"). */
const find = (seen: Seen[], table: string, ...must: string[]) =>
  q(seen, table).find(r => {
    const o = r.ops.map(([op, c]) => `${op}:${c}`)
    return must.every(m => o.includes(m))
  })
const scopeArg = (rec: Seen | undefined, col: string) =>
  rec?.ops.find(([op, c]) => op === 'in' && c === col)?.[2] as string[] | undefined
const ops = (rec: Seen) => rec.ops.map(([op, c]) => `${op}:${c}`)

beforeEach(() => {
  CURRENT_USER = { id: ME }
  const s = seed()
  CURRENT = fakeDb(s)
  // The RLS client can only ever see the caller's own projects.
  RLS = fakeDb({ ...s, projects: s.projects.filter(p => p.owner_id === ME) })
})

// ═══ Atlas Home (legacy rollback path) ═══════════════════════════════════════

const HOME = '@/app/(platform)/atlas/page'

describe('9Q · Atlas Home — the legacy path now scopes every service-role read', () => {
  it('gatherAtlasContext receives the caller allow-list, so its sources are scoped', async () => {
    const { seen } = await renderPage(HOME, { searchParams: { ui: 'legacy' } })
    // These are gatherAtlasContext's project-owned reads.
    for (const t of ['cost_events', 'revenue_events', 'leads']) {
      expect(scopeArg(find(seen, t, 'in:project_id'), 'project_id'), `${t} unscoped`).toEqual([MINE])
    }
  })

  it('foreign financial and operational data never reaches the page', async () => {
    const { text } = await renderPage(HOME, { searchParams: { ui: 'legacy' } })
    expect(text).not.toContain('SECRET')
    expect(text).not.toContain('99999')
  })

  it('the attention-items project list comes from the RLS client, not the admin one', async () => {
    // It was never global — the database enforces ownership on that read. This
    // pins it so a refactor cannot quietly swap the client.
    await renderPage(HOME, { searchParams: { ui: 'legacy' } })
    const rlsProjects = RLS.seen.find(s => s.table === 'projects')
    expect(rlsProjects, 'the RLS client never read projects').toBeTruthy()
  })

  it('gatherAtlasContext scopes its own projects read on the identity column', async () => {
    const { seen } = await renderPage(HOME, { searchParams: { ui: 'legacy' } })
    expect(scopeArg(find(seen, 'projects', 'in:id'), 'id')).toEqual([MINE])
  })

  it('collectAttentionItems own reads are scoped, and no foreign hook is printed', async () => {
    // Its three own queries: a published-script count, an insights count, and
    // the stuck-pipeline scan. (`fetchBusinessSnapshots`, which it also calls,
    // is deliberately NOT changed in this phase — it has a global-by-design
    // cron caller — so its reads are excluded here by op signature, not by
    // pretending they are scoped.)
    const { seen, text } = await renderPage(HOME, { searchParams: { ui: 'legacy' } })
    expect(scopeArg(find(seen, 'media_scripts', 'in:project_id', 'eq:status'), 'project_id')).toEqual([MINE])
    expect(scopeArg(find(seen, 'media_insights', 'in:project_id'), 'project_id')).toEqual([MINE])
    expect(scopeArg(find(seen, 'media_scripts', 'in:project_id', 'limit:10'), 'project_id')).toEqual([MINE])
    expect(text).not.toContain('SECRET-HOOK')
    expect(text).not.toContain('SECRET-REASON')
  })

  it('the stuck-pipeline scan is scoped before its limit(10)', async () => {
    // 12 foreign stuck videos would otherwise fill the slice and hide the
    // operator's own broken pipeline completely.
    const { seen } = await renderPage(HOME, { searchParams: { ui: 'legacy' } })
    const stuck = find(seen, 'media_scripts', 'in:project_id', 'limit:10')
    expect(stuck).toBeTruthy()
    const o = ops(stuck!)
    expect(o.indexOf('in:project_id')).toBeGreaterThan(-1)
    expect(o.findIndex(x => x.startsWith('limit:'))).toBeGreaterThan(o.indexOf('in:project_id'))
  })

  it('an operator who owns nothing gets the impossible id, not a global read', async () => {
    CURRENT_USER = { id: 'nobody' }
    const { seen, text } = await renderPage(HOME, { searchParams: { ui: 'legacy' } })
    expect(text).not.toContain('SECRET')
    expect(scopeArg(find(seen, 'cost_events', 'in:project_id'), 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
    expect(scopeArg(find(seen, 'media_insights', 'in:project_id'), 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
  })
})

// ═══ Atlas Operations ════════════════════════════════════════════════════════

const OPS = '@/app/(platform)/atlas/operations/page'

describe('9Q · Atlas Operations — the page now passes the allow-list it always had', () => {
  it('EVERY project-owned read is scoped — not merely one of them', async () => {
    // Deliberately exhaustive. An earlier version of this test looked for *a*
    // scoped `runs` query and passed while the second one (status=running) was
    // global: getOperations issues two reads against that table. Asserting per
    // table instead of per query is how a guard gets missed.
    const { seen } = await renderPage(OPS)
    const PLATFORM = ['token_health', 'cron_heartbeat']   // no project_id at all
    const offenders: string[] = []
    for (const rec of seen) {
      if (PLATFORM.includes(rec.table)) continue
      const o = rec.ops.map(([op, c]) => `${op}:${c}`)
      if (o.includes('eq:owner_id')) continue             // the allow-list lookup itself
      const scoped = o.includes('in:project_id') || o.includes('in:id') ||
                     o.some(x => x.startsWith('eq:project_id')) || o.includes('in:runs.project_id')
      if (!scoped) offenders.push(`${rec.table} [${o.join(' ')}]`)
    }
    expect(offenders, `unscoped reads on the Operations page:\n  ${offenders.join('\n  ')}`).toEqual([])
  })

  it('each scoped read carries the caller allow-list, not some other value', async () => {
    const { seen } = await renderPage(OPS)
    for (const rec of seen) {
      const arg = scopeArg(rec, 'project_id') ?? scopeArg(rec, 'id')
      if (arg) expect(arg, `${rec.table} scoped to the wrong list`).toEqual([MINE])
    }
  })

  it('platform infrastructure stays unscoped on purpose', async () => {
    // Neither table has a project_id; scoping them would be wrong, not safer.
    const { seen } = await renderPage(OPS)
    for (const t of ['token_health', 'cron_heartbeat']) {
      const rec = q(seen, t)[0]
      expect(rec, `${t} not queried`).toBeTruthy()
      expect(rec.ops.some(([op, c]) => op === 'in' && c === 'project_id')).toBe(false)
    }
  })

  it('foreign runs, errors and workflow names never render', async () => {
    const { text } = await renderPage(OPS)
    expect(text).not.toContain('SECRET-ERROR')
    expect(text).not.toContain('SECRET-FLOW')
    expect(text).not.toContain('SECRET-PROJECT')
  })

  it('foreign cost cannot enter the month aggregate', async () => {
    const { text } = await renderPage(OPS)
    expect(text).not.toContain('99999')
    expect(text).not.toContain('100004')     // 5 + 99 999
  })

  it('an empty allow-list fails closed', async () => {
    CURRENT_USER = { id: 'nobody' }
    const { seen, text } = await renderPage(OPS)
    expect(text).not.toContain('SECRET')
    expect(scopeArg(find(seen, 'runs', 'in:project_id'), 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
    expect(scopeArg(find(seen, 'leads', 'in:project_id'), 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
  })
})

// ═══ Atlas Marketing ═════════════════════════════════════════════════════════

const MKT = '@/app/(platform)/atlas/marketing/page'

describe('9Q · Atlas Marketing — one root guard closes the whole derived chain', () => {
  it('the hard-coded slug lookup is authorized against the allow-list', async () => {
    const { seen } = await renderPage(MKT)
    const root = q(seen, 'projects').find(r => r.ops.some(([op, c]) => op === 'eq' && c === 'slug'))
    expect(root, 'root slug lookup not found').toBeTruthy()
    expect(scopeArg(root, 'id')).toEqual([MINE])
  })

  it('a project the operator does not own yields an empty review, not its pipeline', async () => {
    // The seed gives `familje-stunden` to the FOREIGN project, so this is the
    // real case: authenticated, but not entitled to that project.
    const { text, seen } = await renderPage(MKT)
    expect(text).not.toContain('SECRET-THEME')
    expect(text).not.toContain('SECRET')
    // The chain is derived, so it must stop at the root: nothing downstream ran.
    expect(q(seen, 'campaign_plans')).toHaveLength(0)
    expect(q(seen, 'campaign_briefs')).toHaveLength(0)
    expect(q(seen, 'draft_posts')).toHaveLength(0)
    expect(q(seen, 'guard_reports')).toHaveLength(0)
  })

  it('when the operator DOES own the project the chain runs and stays derived', async () => {
    vi.resetModules()
    const s = seed()
    s.projects[1].owner_id = ME              // hand the slug's project to the caller
    CURRENT = fakeDb(s)
    const { getMarketingReview } = await import('@/lib/marketing/review')
    await getMarketingReview(CURRENT.db, [THEIRS])
    const seen = CURRENT.seen
    expect(scopeArg(find(seen, 'projects', 'eq:slug', 'in:id'), 'id')).toEqual([THEIRS])
    // Each downstream read is keyed off the previous id set, never a table scan.
    expect(find(seen, 'campaign_plans', 'eq:project_id')!.ops).toContainEqual(['eq', 'project_id', THEIRS])
    expect(find(seen, 'campaign_briefs', 'in:plan_id'), 'briefs not derived from plans').toBeTruthy()
    expect(find(seen, 'draft_posts', 'in:brief_id'), 'drafts not derived from briefs').toBeTruthy()
  })

  it('an empty allow-list carries the impossible id into the root lookup', async () => {
    vi.resetModules()
    CURRENT = fakeDb(seed())
    const { getMarketingReview } = await import('@/lib/marketing/review')
    const review = await getMarketingReview(CURRENT.db, [])
    expect(review.cards).toEqual([])
    expect(review.months).toEqual([])
    expect(scopeArg(find(CURRENT.seen, 'projects', 'eq:slug', 'in:id'), 'id')).toEqual([IMPOSSIBLE_PROJECT_ID])
  })
})

// ═══ The API that shares the helper ══════════════════════════════════════════

describe('9Q · marketing approvals API — the read is scoped like the page', () => {
  it('GET resolves the caller allow-list and passes it to the shared helper', async () => {
    vi.resetModules()
    CURRENT = fakeDb(seed())
    const { GET } = await import('@/app/api/marketing/approvals/route')
    const res = await GET()
    const body = await res.json()
    expect(body.cards).toEqual([])          // the slug's project is foreign here
    const root = q(CURRENT.seen, 'projects').find(r => r.ops.some(([op, c]) => op === 'eq' && c === 'slug'))
    expect(scopeArg(root, 'id')).toEqual([MINE])
  })

  it('an unauthenticated GET never reaches the helper', async () => {
    vi.resetModules()
    CURRENT_USER = null
    CURRENT = fakeDb(seed())
    const { GET } = await import('@/app/api/marketing/approvals/route')
    const res = await GET()
    expect(res.status).toBe(401)
    expect(CURRENT.seen).toHaveLength(0)
  })
})
