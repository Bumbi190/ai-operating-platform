/**
 * Sub-page / API project isolation (Phase 9S).
 *
 * Three findings left after the page-level sweep closed. They are different
 * shapes, and the fixes deliberately differ:
 *
 * 1. `fetchBusinessSnapshots` served TWO callers with genuinely different
 *    authority — an operator page and the briefing cron — and told them apart
 *    by nothing at all. It read eleven tables globally and let the `projects`
 *    array sort it out in JS afterwards. That is correct for the cron, which
 *    legitimately wants the whole platform, and wrong for an operator. The fix
 *    is NOT to scope it: that would break the cron. It is to make the authority
 *    a REQUIRED, explicit argument, so global has to be asked for by name and
 *    can never be what you get by forgetting something.
 *
 * 2. `GET /api/marketing/guard` took a client-supplied draft_id/report_id and
 *    read `guard_reports` through the service-role client with no ownership
 *    check at all — the direct-by-id class. `guard_reports.project_id` is NOT
 *    NULL, so the shortest correct guard is a scope on the lookup itself; no
 *    relation walk to draft → brief → plan is needed, and inventing one would
 *    add assumptions the schema does not require.
 *
 * 3. `GET /api/marketing/plans` repeated the unauthorized hard-coded-slug root
 *    lookup that Phase 9Q fixed inside `getMarketingReview`. Every read below
 *    it derives from that one project id, so authorizing the root closes the
 *    whole route.
 *
 * On the limits: only ONE of the two limited reads actually feeds a value.
 * `limit(40)`'s result is shadowed inside the map and never read, so its
 * displacement is currently invisible; `limit(80)` feeds `decisions30d` and is
 * a real one. The tests say which is which rather than implying both matter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

const ME = 'user-me'
const MINE = '11111111-1111-1111-1111-111111111111'
const THEIRS = '22222222-2222-2222-2222-222222222222'

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString()
/** Must match `startOfMonthISO()` in the helper, which uses Date.UTC — a local
 *  month-start would land BEFORE it in any timezone ahead of UTC and be filtered
 *  straight back out by the .gte(). */
const monthISO = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)).toISOString() }

/** The route's hard-coded root slug. The FOREIGN project owns it on purpose:
 *  without that, a 404 would prove only that no project matched the slug. */
const FAMILJE_SLUG = 'familje-stunden'

/** Full `Project` row — every column, so this is type-checked against the real
 *  schema rather than an `as any` that would drift silently. */
const PROJECT = (id: string, name: string) => ({
  id, owner_id: id === MINE ? ME : 'user-other', name,
  slug: id === THEIRS ? FAMILJE_SLUG : name.toLowerCase(),
  color: '#000', settings: {}, created_at: iso(9999),
  atlas_mode: 'default', execution_paused: false, paused_at: null, paused_reason: null,
})

function seed() {
  // 100 foreign decided approvals, all newer than the owned ones, so an
  // unscoped limit(80) is filled entirely by them.
  const approvals: any[] = []
  for (let i = 0; i < 100; i++) {
    approvals.push({
      id: `ap-theirs-${i}`, status: 'approved', reviewed_at: iso(1 + i),
      runs: { project_id: THEIRS },
    })
  }
  approvals.push({ id: 'ap-mine-1', status: 'approved', reviewed_at: iso(5000), runs: { project_id: MINE } })
  approvals.push({ id: 'ap-mine-2', status: 'rejected', reviewed_at: iso(5001), runs: { project_id: MINE } })
  approvals.push({ id: 'ap-mine-pending', status: 'pending', reviewed_at: null, runs: { project_id: MINE } })
  approvals.push({ id: 'ap-theirs-pending', status: 'pending', reviewed_at: null, runs: { project_id: THEIRS } })

  const media_scripts: any[] = []
  for (let i = 0; i < 60; i++) {
    media_scripts.push({
      id: `ms-theirs-${i}`, project_id: THEIRS, status: 'published', video_status: 'done',
      hook: `SECRET-HOOK-${i}`, published_at: iso(1 + i), generated_at: monthISO(),
    })
  }
  media_scripts.push({
    id: 'ms-mine', project_id: MINE, status: 'published', video_status: 'done',
    hook: 'MIN-HOOK', published_at: iso(9000), generated_at: monthISO(),
  })

  return {
    projects: [PROJECT(MINE, 'Mitt'), PROJECT(THEIRS, 'SECRET')],
    outputs: [
      { project_id: MINE, type: 'text', created_at: monthISO() },
      { project_id: THEIRS, type: 'text', created_at: monthISO() },
    ],
    media_scripts,
    media_news_items: [
      { project_id: MINE, status: 'new', created_at: monthISO() },
      { project_id: THEIRS, status: 'new', created_at: monthISO() },
    ],
    runs: [
      { project_id: MINE, status: 'done', created_at: iso(10) },
      { project_id: THEIRS, status: 'failed', created_at: iso(10) },
    ],
    approvals,
    leads: [
      { project_id: MINE, created_at: monthISO() },
      { project_id: THEIRS, created_at: monthISO() },
    ],
    revenue_events: [
      { project_id: MINE, amount_sek: 100, occurred_at: monthISO() },
      { project_id: THEIRS, amount_sek: 99_999, occurred_at: monthISO() },
    ],
    campaigns: [
      { project_id: MINE, status: 'active' },
      { project_id: THEIRS, status: 'active' },
    ],
    media_insights: [
      { project_id: MINE, reach: 10, total_interactions: 2, published_at: monthISO() },
      { project_id: THEIRS, reach: 90_000, total_interactions: 9_000, published_at: monthISO() },
      { project_id: null, reach: 7, total_interactions: 7, published_at: monthISO() },
    ],
    guard_reports: [
      { id: 'gr-mine', draft_id: 'dp-mine', project_id: MINE, verdict: 'PASS' },
      { id: 'gr-theirs', draft_id: 'dp-theirs', project_id: THEIRS, verdict: 'SECRET-VERDICT' },
    ],
    campaign_plans: [
      { id: 'cp-theirs', project_id: THEIRS, plan_key: 'fs-2026-09', target_month: '2026-09',
        theme_key: 't', theme_name: 'SECRET-THEME', status: 'active', generated_at: iso(1) },
    ],
    campaign_briefs: [{ id: 'cb-theirs', plan_id: 'cp-theirs', project_id: THEIRS, brief_key: 'b' }],
  }
}

// ── A fake applying PostgREST semantics IN CALL ORDER ────────────────────────
interface Seen { table: string; ops: [string, string, unknown][]; inner: string[] }
const get = (r: any, p: string): unknown => p.split('.').reduce((a: any, k) => (a == null ? a : a[k]), r)

function fakeDb(tables: Record<string, any[]>) {
  const seen: Seen[] = []
  const from = (table: string) => {
    const rec: Seen = { table, ops: [], inner: [] }
    seen.push(rec)
    let rows: any[] = (tables[table] ?? []).map(r => ({ ...r }))
    let head = false
    const apply = (col: string, keep: (r: any) => boolean) => {
      if (col.includes('.')) {
        const embed = col.split('.')[0]
        if (rec.inner.includes(embed)) rows = rows.filter(keep)
        else rows = rows.map(r => (keep(r) ? r : { ...r, [embed]: null }))
      } else rows = rows.filter(keep)
    }
    const q: any = {
      select: (cols?: string, o?: { head?: boolean }) => {
        if (o?.head) head = true
        for (const m of String(cols ?? '').matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*!inner/g)) rec.inner.push(m[1])
        return q
      },
      eq: (c: string, v: unknown) => { rec.ops.push(['eq', c, v]); apply(c, r => get(r, c) === v); return q },
      in: (c: string, v: unknown[]) => { rec.ops.push(['in', c, v]); apply(c, r => v.includes(get(r, c) as never)); return q },
      gte: (c: string, v: string) => { rec.ops.push(['gte', c, v]); apply(c, r => String(get(r, c)) >= v); return q },
      order: (c: string, o?: { ascending?: boolean }) => {
        rec.ops.push(['order', c, o?.ascending !== false])
        const dir = o?.ascending === false ? -1 : 1
        rows = [...rows].sort((a, b) => (String(get(a, c)) < String(get(b, c)) ? -1 : 1) * dir)
        return q
      },
      limit: (n: number) => { rec.ops.push(['limit', String(n), n]); rows = rows.slice(0, n); return q },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (ok: any, err?: any) =>
        Promise.resolve(head ? { data: null, count: rows.length, error: null }
                             : { data: rows, count: rows.length, error: null }).then(ok, err),
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
// The briefing cron sends mail; the delivery is irrelevant to isolation.
vi.mock('@/lib/email/brevo', () => ({ sendEmail: async () => ({ ok: true }) }))

const q = (seen: Seen[], t: string) => seen.filter(s => s.table === t)
const find = (seen: Seen[], t: string, ...must: string[]) =>
  q(seen, t).find(r => { const o = r.ops.map(([op, c]) => `${op}:${c}`); return must.every(m => o.includes(m)) })
const scopeArg = (rec: Seen | undefined, col: string) =>
  rec?.ops.find(([op, c]) => op === 'in' && c === col)?.[2] as string[] | undefined
const opNames = (rec: Seen) => rec.ops.map(([op, c]) => `${op}:${c}`)

/** Every project-owned table this helper reads. None of them is platform data. */
const OWNED_TABLES = [
  'outputs', 'media_scripts', 'media_news_items', 'runs', 'approvals',
  'leads', 'revenue_events', 'campaigns', 'media_insights',
]

beforeEach(() => { CURRENT_USER = { id: ME }; CURRENT = fakeDb(seed()) })

// ═══ A · business snapshots — operator authority ═════════════════════════════

describe('9S · business snapshots — an operator sees only their own projects', () => {
  it('every project-owned read carries the operator scope', async () => {
    const { fetchBusinessSnapshots } = await import('@/lib/os/business')
    await fetchBusinessSnapshots(CURRENT.db, [PROJECT(MINE, 'Mitt')], { kind: 'operator', allowedProjectIds: [MINE] })
    const offenders: string[] = []
    for (const rec of CURRENT.seen) {
      if (!OWNED_TABLES.includes(rec.table)) continue
      const o = opNames(rec)
      if (!o.includes('in:project_id') && !o.includes('in:runs.project_id')) offenders.push(`${rec.table} [${o.join(' ')}]`)
    }
    expect(offenders, `unscoped operator reads:\n  ${offenders.join('\n  ')}`).toEqual([])
    expect(CURRENT.seen.length).toBeGreaterThanOrEqual(OWNED_TABLES.length)
  })

  it('foreign revenue, reach and counts cannot reach the snapshot', async () => {
    const { fetchBusinessSnapshots } = await import('@/lib/os/business')
    const snaps = await fetchBusinessSnapshots(CURRENT.db, [PROJECT(MINE, 'Mitt')], { kind: 'operator', allowedProjectIds: [MINE] })
    const json = JSON.stringify(snaps)
    expect(json).not.toContain('SECRET')
    expect(json).not.toContain('99999')
    expect(json).not.toContain('90000')
  })

  it('an empty allow-list fails closed with the impossible id', async () => {
    const { fetchBusinessSnapshots } = await import('@/lib/os/business')
    await fetchBusinessSnapshots(CURRENT.db, [PROJECT(MINE, 'Mitt')], { kind: 'operator', allowedProjectIds: [] })
    expect(scopeArg(find(CURRENT.seen, 'runs', 'in:project_id'), 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
    expect(scopeArg(find(CURRENT.seen, 'revenue_events', 'in:project_id'), 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
  })

  it('null-project media_insights are excluded, not attributed to the operator', async () => {
    const { fetchBusinessSnapshots } = await import('@/lib/os/business')
    await fetchBusinessSnapshots(CURRENT.db, [PROJECT(MINE, 'Mitt')], { kind: 'operator', allowedProjectIds: [MINE] })
    // `.in()` never matches NULL — the rule the Atlas call sites already apply.
    expect(scopeArg(find(CURRENT.seen, 'media_insights', 'in:project_id'), 'project_id')).toEqual([MINE])
  })
})

// ═══ A · limit displacement ══════════════════════════════════════════════════

describe('9S · business snapshots — foreign rows cannot consume the limited slots', () => {
  it('the decided-approvals limit(80) is scoped first, so decisions30d survives', async () => {
    // 100 foreign decided approvals are newer than the operator's two. Unscoped,
    // the limit(80) is filled entirely by them and decisions30d reports 0.
    const { fetchBusinessSnapshots } = await import('@/lib/os/business')
    const snaps = await fetchBusinessSnapshots(CURRENT.db, [PROJECT(MINE, 'Mitt')], { kind: 'operator', allowedProjectIds: [MINE] })
    const decided = find(CURRENT.seen, 'approvals', 'in:runs.project_id', 'limit:80')!
    const o = opNames(decided)
    expect(o.indexOf('in:runs.project_id')).toBeGreaterThan(-1)
    expect(o.findIndex(x => x.startsWith('order:'))).toBeGreaterThan(o.indexOf('in:runs.project_id'))
    expect(o.findIndex(x => x.startsWith('limit:'))).toBeGreaterThan(o.indexOf('in:runs.project_id'))
    expect(snaps[0].decisions30d).toBe(2)     // 0 would mean displacement
  })

  it('the published limit(40) is scoped before its order and limit', async () => {
    // Honest scope of this one: its result is shadowed inside the map and never
    // read today, so nothing displayed moves. The scope is here so the query
    // cannot start leaking the day it is revived.
    const { fetchBusinessSnapshots } = await import('@/lib/os/business')
    await fetchBusinessSnapshots(CURRENT.db, [PROJECT(MINE, 'Mitt')], { kind: 'operator', allowedProjectIds: [MINE] })
    const pub = find(CURRENT.seen, 'media_scripts', 'in:project_id', 'limit:40')!
    const o = opNames(pub)
    expect(o.findIndex(x => x.startsWith('order:'))).toBeGreaterThan(o.indexOf('in:project_id'))
    expect(o.findIndex(x => x.startsWith('limit:'))).toBeGreaterThan(o.indexOf('in:project_id'))
  })

  it('pending approvals are scoped through the parent run with an INNER embed', async () => {
    const { fetchBusinessSnapshots } = await import('@/lib/os/business')
    await fetchBusinessSnapshots(CURRENT.db, [PROJECT(MINE, 'Mitt')], { kind: 'operator', allowedProjectIds: [MINE] })
    const pending = find(CURRENT.seen, 'approvals', 'in:runs.project_id', 'eq:status')!
    expect(pending.inner).toContain('runs')
    expect(scopeArg(pending, 'runs.project_id')).toEqual([MINE])
  })
})

// ═══ A · machine authority ═══════════════════════════════════════════════════

describe('9S · business snapshots — the cron keeps its global authority, explicitly', () => {
  it('machine-global applies no project filter at all', async () => {
    const { fetchBusinessSnapshots } = await import('@/lib/os/business')
    await fetchBusinessSnapshots(CURRENT.db, [PROJECT(MINE, 'Mitt'), PROJECT(THEIRS, 'SECRET')], { kind: 'machine-global' })
    for (const rec of CURRENT.seen) {
      if (!OWNED_TABLES.includes(rec.table)) continue
      const o = opNames(rec)
      expect(o.includes('in:project_id') || o.includes('in:runs.project_id'), `${rec.table} was project-scoped for the cron`).toBe(false)
    }
  })

  it('machine-global still returns every project it was given', async () => {
    // The regression that matters: the briefing must not silently narrow.
    const { fetchBusinessSnapshots } = await import('@/lib/os/business')
    const snaps = await fetchBusinessSnapshots(
      CURRENT.db, [PROJECT(MINE, 'Mitt'), PROJECT(THEIRS, 'SECRET')], { kind: 'machine-global' })
    expect(snaps).toHaveLength(2)
    const theirs = snaps.find(s => s.id === THEIRS)!
    expect(theirs.revenueMonthSek).toBe(99_999)
    expect(theirs.decisions30d).toBeGreaterThan(0)
  })

  it('an operator authority narrows the same call to one project', async () => {
    const { fetchBusinessSnapshots } = await import('@/lib/os/business')
    const snaps = await fetchBusinessSnapshots(
      CURRENT.db, [PROJECT(MINE, 'Mitt'), PROJECT(THEIRS, 'SECRET')], { kind: 'operator', allowedProjectIds: [MINE] })
    const theirs = snaps.find(s => s.id === THEIRS)!
    expect(theirs.revenueMonthSek).toBe(0)    // the row was never read
    expect(theirs.decisions30d).toBe(0)
    expect(snaps.find(s => s.id === MINE)!.revenueMonthSek).toBe(100)
  })
})

// ═══ B · GET /api/marketing/guard ════════════════════════════════════════════

describe('9S · marketing guard GET — a client-supplied id is not a permission', () => {
  const call = async (qs: string) => {
    vi.resetModules()
    const { GET } = await import('@/app/api/marketing/guard/route')
    return GET(new Request(`https://x.test/api/marketing/guard?${qs}`))
  }

  it('an owned report is returned', async () => {
    const res = await call('report_id=gr-mine')
    expect(res.status).toBe(200)
    expect((await res.json()).report.id).toBe('gr-mine')
  })

  it('an owned draft resolves its report', async () => {
    const res = await call('draft_id=dp-mine')
    expect(res.status).toBe(200)
    expect((await res.json()).report.id).toBe('gr-mine')
  })

  it('a FOREIGN report id is refused and its content never returned', async () => {
    const res = await call('report_id=gr-theirs')
    expect(res.status).toBe(404)
    expect(JSON.stringify(await res.json())).not.toContain('SECRET-VERDICT')
  })

  it('a FOREIGN draft id is refused', async () => {
    const res = await call('draft_id=dp-theirs')
    expect(res.status).toBe(404)
  })

  it('foreign and missing are indistinguishable — no existence probing', async () => {
    const foreign = await call('report_id=gr-theirs')
    const missing = await call('report_id=does-not-exist')
    expect(foreign.status).toBe(missing.status)
    expect(await foreign.json()).toEqual(await missing.json())
  })

  it('the ownership filter is in the QUERY, not applied after the fetch', async () => {
    vi.resetModules()
    CURRENT = fakeDb(seed())
    const { GET } = await import('@/app/api/marketing/guard/route')
    await GET(new Request('https://x.test/api/marketing/guard?report_id=gr-theirs'))
    expect(scopeArg(find(CURRENT.seen, 'guard_reports', 'in:project_id'), 'project_id')).toEqual([MINE])
  })

  it('an operator who owns nothing gets the impossible id, not every report', async () => {
    vi.resetModules()
    CURRENT_USER = { id: 'nobody' }
    CURRENT = fakeDb(seed())
    const { GET } = await import('@/app/api/marketing/guard/route')
    const res = await GET(new Request('https://x.test/api/marketing/guard?report_id=gr-mine'))
    expect(res.status).toBe(404)
    expect(scopeArg(find(CURRENT.seen, 'guard_reports', 'in:project_id'), 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
  })

  it('an unauthenticated request never reaches a query', async () => {
    vi.resetModules()
    CURRENT_USER = null
    CURRENT = fakeDb(seed())
    const { GET } = await import('@/app/api/marketing/guard/route')
    const res = await GET(new Request('https://x.test/api/marketing/guard?report_id=gr-mine'))
    expect(res.status).toBe(401)
    expect(CURRENT.seen).toHaveLength(0)
  })
})

// ═══ C · GET /api/marketing/plans ════════════════════════════════════════════

describe('9S · marketing plans GET — the hard-coded slug is not authority', () => {
  const call = async (qs = '') => {
    vi.resetModules()
    const { GET } = await import('@/app/api/marketing/plans/route')
    return GET(new Request(`https://x.test/api/marketing/plans${qs ? '?' + qs : ''}`))
  }

  it('the root lookup is constrained to the caller allow-list', async () => {
    await call()
    const root = find(CURRENT.seen, 'projects', 'eq:slug', 'in:id')
    expect(root, 'root slug lookup not scoped').toBeTruthy()
    expect(scopeArg(root, 'id')).toEqual([MINE])
  })

  it('a project the operator does not own yields 404 and no plans', async () => {
    // The seed gives `familje-stunden` to the FOREIGN project on purpose.
    const res = await call()
    expect(res.status).toBe(404)
    expect(JSON.stringify(await res.json())).not.toContain('SECRET-THEME')
  })

  it('the derived reads never run when the root is refused', async () => {
    await call()
    expect(q(CURRENT.seen, 'campaign_plans')).toHaveLength(0)
    expect(q(CURRENT.seen, 'campaign_briefs')).toHaveLength(0)
  })

  it('detail mode is refused at the root too, not just list mode', async () => {
    const res = await call('plan_id=cp-theirs')
    expect(res.status).toBe(404)
    expect(JSON.stringify(await res.json())).not.toContain('SECRET-THEME')
  })

  it('when the operator DOES own the project, plans are returned and stay derived', async () => {
    vi.resetModules()
    const s = seed()
    s.projects[1].owner_id = ME              // caller now owns the slug's project
    CURRENT = fakeDb(s)
    const { GET } = await import('@/app/api/marketing/plans/route')
    const res = await GET(new Request('https://x.test/api/marketing/plans'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plans.map((p: any) => p.id)).toEqual(['cp-theirs'])
    expect(find(CURRENT.seen, 'campaign_plans', 'eq:project_id')!.ops).toContainEqual(['eq', 'project_id', THEIRS])
  })

  it('an empty allow-list fails closed', async () => {
    vi.resetModules()
    CURRENT_USER = { id: 'nobody' }
    CURRENT = fakeDb(seed())
    const { GET } = await import('@/app/api/marketing/plans/route')
    const res = await GET(new Request('https://x.test/api/marketing/plans'))
    expect(res.status).toBe(404)
    expect(scopeArg(find(CURRENT.seen, 'projects', 'eq:slug', 'in:id'), 'id')).toEqual([IMPOSSIBLE_PROJECT_ID])
  })

  it('an unauthenticated request never reaches a query', async () => {
    vi.resetModules()
    CURRENT_USER = null
    CURRENT = fakeDb(seed())
    const { GET } = await import('@/app/api/marketing/plans/route')
    const res = await GET(new Request('https://x.test/api/marketing/plans'))
    expect(res.status).toBe(401)
    expect(CURRENT.seen).toHaveLength(0)
  })
})

// ═══ Call sites — the helper is only as safe as what its callers ask for ═════
//
// The mode tests above prove the helper honours each authority. These prove the
// two callers pass the RIGHT one, which is a separate failure: a helper with a
// correct machine mode is no protection if an operator page asks for it.

describe('9S · call sites — each caller states the authority it is entitled to', () => {
  it('the operator path scopes every project-owned business read', async () => {
    vi.resetModules()
    CURRENT = fakeDb(seed())
    const { collectAttentionItems } = await import('@/lib/os/attention')
    await collectAttentionItems(CURRENT.db, [PROJECT(MINE, 'Mitt')], [MINE])
    const offenders: string[] = []
    for (const rec of CURRENT.seen) {
      if (!OWNED_TABLES.includes(rec.table)) continue
      const o = opNames(rec)
      if (!o.includes('in:project_id') && !o.includes('in:runs.project_id')) offenders.push(`${rec.table} [${o.join(' ')}]`)
    }
    expect(offenders, `the operator path issued unscoped reads:\n  ${offenders.join('\n  ')}`).toEqual([])
  })

  it('the operator path never requests machine-global', async () => {
    vi.resetModules()
    CURRENT = fakeDb(seed())
    const { collectAttentionItems } = await import('@/lib/os/attention')
    await collectAttentionItems(CURRENT.db, [PROJECT(MINE, 'Mitt')], [MINE])
    // Machine-global issues these same reads with no filter at all.
    expect(scopeArg(find(CURRENT.seen, 'revenue_events', 'in:project_id'), 'project_id')).toEqual([MINE])
    expect(scopeArg(find(CURRENT.seen, 'approvals', 'in:runs.project_id'), 'runs.project_id')).toEqual([MINE])
  })

  it('the briefing cron keeps global reads — it is not accidentally scoped', async () => {
    // The regression that would be invisible in production until a briefing
    // silently went blank: this job is Bearer-authenticated and global BY
    // DESIGN, and narrowing it is as much a bug as leaking on the operator path.
    vi.resetModules()
    process.env.CRON_SECRET = 'test-secret'
    process.env.BREVO_ADMIN_EMAIL = 'ops@example.test'
    CURRENT = fakeDb(seed())
    const { GET } = await import('@/app/api/briefing/cron/route')
    const res = await GET(new Request('https://x.test/api/briefing/cron', {
      headers: { authorization: 'Bearer test-secret' },
    }))
    expect(res.status).toBe(200)
    const scopedReads = CURRENT.seen.filter(r =>
      OWNED_TABLES.includes(r.table) &&
      opNames(r).some(o => o === 'in:project_id' || o === 'in:runs.project_id'))
    expect(scopedReads.map(r => r.table), 'the cron was project-scoped').toEqual([])
    expect(CURRENT.seen.some(r => r.table === 'revenue_events')).toBe(true)
  })

  it('an unauthenticated cron request reads nothing at all', async () => {
    vi.resetModules()
    process.env.CRON_SECRET = 'test-secret'
    CURRENT = fakeDb(seed())
    const { GET } = await import('@/app/api/briefing/cron/route')
    const res = await GET(new Request('https://x.test/api/briefing/cron'))
    expect(res.status).toBe(401)
    expect(CURRENT.seen).toHaveLength(0)
  })
})
