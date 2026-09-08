/**
 * Revenue project isolation (Phase 9N).
 *
 * /revenue is the money page, and every number on it is an AGGREGATE. That is
 * what makes it different from the list surfaces already repaired: a foreign
 * row does not merely appear somewhere on screen, it silently MOVES A TOTAL.
 * Month revenue, net profit, pipeline value, AI cost, ROI and the budget bar
 * are all sums, so the scope has to land inside the query — before the
 * arithmetic — not as a filter over an already-summed service-role read.
 *
 * On main all six sources were read with the SERVICE-ROLE client and none of
 * them carried a project filter:
 *   projects, revenue_events, leads, run_logs (via runs), agents, runs.
 * The RLS `supabase` client was created only to call `auth.getUser()`; it never
 * ran a data query, so `projects` here really was globally exposed — unlike the
 * Manager page, where that same table was already RLS-scoped.
 *
 * THE SEMANTIC CHANGE IS EXACTLY ONE THING:
 *   GLOBAL DATABASE TOTAL  →  AUTHORIZED PROJECT TOTAL.
 * No formula, time window, rounding, currency assumption, status set, event
 * inclusion rule, sort order or date boundary is altered. The tests below pin
 * that by computing every expectation from the page's OWN helpers.
 *
 * These tests execute the REAL page component and read the REAL strings it
 * renders. They are not source-text assertions: removing a filter from the
 * page changes the numbers these assertions see.
 *
 * `run_logs` has no project_id — its only ownership link is the parent run —
 * so the scope travels through `runs!inner(project_id)`. Verified against live
 * PostgREST: with a PLAIN embed the same filter does NOT drop parent rows, it
 * only nulls the embedded object, so every foreign log row is still shipped to
 * the render process. `!inner` is what actually removes them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'
import { calculateCost, formatCost } from '@/lib/ai/pricing'

// The page is compiled with the classic JSX runtime.
;(globalThis as any).React = React

// ── Identities ───────────────────────────────────────────────────────────────
const ME = 'user-me'
const OTHER = 'user-other'
const MINE = '11111111-1111-1111-1111-111111111111'
const THEIRS = '22222222-2222-2222-2222-222222222222'

const MODEL_MINE = 'claude-sonnet-4-6'
const MODEL_THEIRS = 'claude-opus-4-6'

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 864e5).toISOString()

/** The page's own formatter — sv-SE separates thousands with U+00A0, so never
 *  hand-write these strings in an assertion. */
const sek = (n: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n)

// Month-to-date is the window every headline metric uses, so seed inside it.
const inMonth = () => {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), 1, 12, 0, 0).toISOString()
}

// ── Seed: owned 1 000 kr vs foreign 99 000 kr (the leak must be unmissable) ──
const REVENUE_OWNED = 1_000
const REVENUE_FOREIGN = 99_000

const TOKENS_OWNED = { in: 1_000, out: 500 }
const TOKENS_FOREIGN = { in: 5_000_000, out: 2_000_000 }

const STEPS_MINE = [{ order: 1, agent_id: 'ag-mine' }]
const STEPS_THEIRS = [{ order: 1, agent_id: 'ag-theirs' }]

function seedTables() {
  return {
    projects: [
      { id: MINE, owner_id: ME, name: 'Mitt Projekt', color: '#0f0' },
      { id: THEIRS, owner_id: OTHER, name: 'SECRET-PROJECT', color: '#f00' },
    ],
    revenue_events: [
      { id: 're-mine', project_id: MINE, amount_sek: REVENUE_OWNED, source: 'manual', description: 'mine', occurred_at: inMonth() },
      { id: 're-theirs', project_id: THEIRS, amount_sek: REVENUE_FOREIGN, source: 'stripe', description: 'SECRET-REVENUE', occurred_at: inMonth() },
    ],
    leads: [
      { id: 'l-mine', project_id: MINE, name: 'Min Lead', company: 'MineCo', status: 'new', estimated_value: 5_000, actual_value: null, created_at: iso(1), last_contact_at: null },
      { id: 'l-theirs', project_id: THEIRS, name: 'SECRET-LEAD', company: 'SECRET-CO', status: 'new', estimated_value: 900_000, actual_value: null, created_at: iso(0), last_contact_at: null },
    ],
    run_logs: [
      { tokens_in: TOKENS_OWNED.in, tokens_out: TOKENS_OWNED.out, created_at: inMonth(), step_order: 1, role: 'assistant',
        runs: { project_id: MINE, workflows: { steps: STEPS_MINE } } },
      { tokens_in: TOKENS_FOREIGN.in, tokens_out: TOKENS_FOREIGN.out, created_at: inMonth(), step_order: 1, role: 'assistant',
        runs: { project_id: THEIRS, workflows: { steps: STEPS_THEIRS } } },
    ],
    agents: [
      { id: 'ag-mine', project_id: MINE, model: MODEL_MINE },
      { id: 'ag-theirs', project_id: THEIRS, model: MODEL_THEIRS },
    ],
    runs: [
      { id: 'r-mine-1', project_id: MINE, created_at: iso(1) },
      { id: 'r-theirs-1', project_id: THEIRS, created_at: iso(1) },
      { id: 'r-theirs-2', project_id: THEIRS, created_at: iso(2) },
    ],
  }
}

// ── A fake that APPLIES PostgREST semantics, including embed kind ────────────
// Modelled on live behaviour, not on guesswork:
//   `runs!inner(...)` + a filter on `runs.project_id` DROPS the parent row.
//   `runs(...)`       + the same filter keeps the parent and NULLS the embed.
interface Seen { table: string; ops: [string, string, unknown][]; inner: string[] }

function get(row: any, path: string): unknown {
  return path.split('.').reduce((a: any, k) => (a == null ? a : a[k]), row)
}

function fakeDb(tables: Record<string, any[]>) {
  const seen: Seen[] = []
  const from = (table: string) => {
    const rec: Seen = { table, ops: [], inner: [] }
    seen.push(rec)
    let rows: any[] = (tables[table] ?? []).map(r => ({ ...r }))

    const embedFilter = (col: string, keep: (r: any) => boolean) => {
      const embed = col.split('.')[0]
      if (rec.inner.includes(embed)) rows = rows.filter(keep)
      else rows = rows.map(r => (keep(r) ? r : { ...r, [embed]: null }))
    }
    const apply = (col: string, keep: (r: any) => boolean) => {
      if (col.includes('.')) embedFilter(col, keep)
      else rows = rows.filter(keep)
    }

    const q: any = {
      select: (cols?: string) => {
        for (const m of String(cols ?? '').matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*!inner/g)) rec.inner.push(m[1])
        return q
      },
      eq: (c: string, v: unknown) => { rec.ops.push(['eq', c, v]); apply(c, r => get(r, c) === v); return q },
      in: (c: string, v: unknown[]) => { rec.ops.push(['in', c, v]); apply(c, r => v.includes(get(r, c) as never)); return q },
      gte: (c: string, v: string) => { rec.ops.push(['gte', c, v]); apply(c, r => String(get(r, c)) >= v); return q },
      not: (c: string, _op: string, _v: unknown) => { rec.ops.push(['not', c, null]); apply(c, r => get(r, c) != null); return q },
      order: (c: string, o?: { ascending?: boolean }) => {
        rec.ops.push(['order', c, o?.ascending !== false])
        const dir = o?.ascending === false ? -1 : 1
        rows = [...rows].sort((a, b) => (String(get(a, c)) < String(get(b, c)) ? -1 : 1) * dir)
        return q
      },
      limit: (n: number) => { rec.ops.push(['limit', String(n), n]); rows = rows.slice(0, n); return q },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (ok: any, err?: any) => Promise.resolve({ data: rows, count: rows.length, error: null }).then(ok, err),
    }
    return q
  }
  return { db: { from } as any, seen }
}

// ── Module mocks ─────────────────────────────────────────────────────────────
let CURRENT_USER: { id: string } | null = { id: ME }
let CURRENT: ReturnType<typeof fakeDb>

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: CURRENT_USER } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => CURRENT.db }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`) } }))

// ── Render the real page and collect every string it displays ────────────────
function collect(node: any, out: string[], depth = 0) {
  if (node == null || depth > 80) return
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return }
  if (Array.isArray(node)) { for (const c of node) collect(c, out, depth + 1); return }
  if (typeof node === 'object' && node.props) {
    for (const [k, v] of Object.entries(node.props)) {
      if (k === 'className' || k === 'style' || k === 'icon') continue
      collect(v, out, depth + 1)
    }
  }
}

async function renderRevenue() {
  vi.resetModules()
  const mod = await import('@/app/(platform)/revenue/page')
  const el = await mod.default()
  const out: string[] = []
  collect(el, out)
  // `text` keeps token boundaries; `tight` re-joins adjacent JSX children so a
  // value and its unit ("0.0" + "% förbrukat") can be asserted as one string.
  return { text: out.join(' | '), tight: out.join(''), parts: out, seen: CURRENT.seen }
}

const queryFor = (seen: Seen[], table: string) => seen.filter(s => s.table === table)
/** The data read, i.e. not the allow-list lookup on `projects`. */
const dataQuery = (seen: Seen[], table: string) => {
  const all = queryFor(seen, table)
  return table === 'projects' ? all[all.length - 1] : all[0]
}
const scopeArg = (rec: Seen | undefined, col: string) =>
  rec?.ops.find(([op, c]) => op === 'in' && c === col)?.[2] as string[] | undefined

beforeEach(() => {
  CURRENT_USER = { id: ME }
  CURRENT = fakeDb(seedTables())
})

// ═══ Displayed metrics ═══════════════════════════════════════════════════════

describe('9N · revenue — foreign money never reaches a displayed total', () => {
  it('month revenue shows the owned 1 000 kr, not the 100 000 kr global sum', async () => {
    const { text } = await renderRevenue()
    expect(text).toContain(sek(REVENUE_OWNED))
    expect(text).not.toContain(sek(REVENUE_OWNED + REVENUE_FOREIGN))
    expect(text).not.toContain(sek(REVENUE_FOREIGN))
    expect(text).not.toContain('SECRET-REVENUE')
  })

  it('AI cost is priced from owned tokens only', async () => {
    const { text } = await renderRevenue()
    const owned = calculateCost(MODEL_MINE, TOKENS_OWNED.in, TOKENS_OWNED.out)
    const global = owned + calculateCost(MODEL_THEIRS, TOKENS_FOREIGN.in, TOKENS_FOREIGN.out)
    expect(text).toContain(formatCost(owned))
    expect(text).not.toContain(formatCost(global))
  })

  it('net profit is derived from the scoped revenue and the scoped cost', async () => {
    // Same formula as the page — only the inputs are scoped.
    const { text } = await renderRevenue()
    const owned = calculateCost(MODEL_MINE, TOKENS_OWNED.in, TOKENS_OWNED.out)
    const net = REVENUE_OWNED - owned * 10.5
    expect(text).toContain(sek(net))
    // The global figure (100 000 kr revenue minus a 225-dollar bill) must not appear.
    const globalCost = owned + calculateCost(MODEL_THEIRS, TOKENS_FOREIGN.in, TOKENS_FOREIGN.out)
    expect(text).not.toContain(sek(REVENUE_OWNED + REVENUE_FOREIGN - globalCost * 10.5))
  })

  it('the budget bar reports the owned percentage, not the platform-wide one', async () => {
    const { tight } = await renderRevenue()
    const owned = calculateCost(MODEL_MINE, TOKENS_OWNED.in, TOKENS_OWNED.out)
    const foreign = calculateCost(MODEL_THEIRS, TOKENS_FOREIGN.in, TOKENS_FOREIGN.out)
    // Budget is $100, so the global total blows straight past it: 225.0% vs 0.0%.
    expect(tight).toContain(`${(owned).toFixed(1)}% förbrukat`)
    expect(tight).not.toContain(`${(owned + foreign).toFixed(1)}% förbrukat`)
  })

  it('pipeline value and active-lead count exclude the foreign lead', async () => {
    const { text, tight } = await renderRevenue()
    expect(text).toContain(sek(5_000))
    expect(text).not.toContain(sek(905_000))
    expect(tight).toContain('1 aktiva leads')
    expect(tight).not.toContain('2 aktiva leads')
    expect(text).not.toContain('SECRET-LEAD')
  })

  it('provider token totals exclude foreign usage', async () => {
    // `ServiceCostCard` receives raw numbers and formats them itself, so these
    // are the pre-format prop values.
    const { parts } = await renderRevenue()
    expect(parts).toContain(String(TOKENS_OWNED.in))
    expect(parts).toContain(String(TOKENS_OWNED.out))
    expect(parts).not.toContain(String(TOKENS_FOREIGN.in))
    expect(parts).not.toContain(String(TOKENS_OWNED.in + TOKENS_FOREIGN.in))
  })
})

describe('9N · revenue — per-project rows and identities are scoped', () => {
  it('only the owned project card renders', async () => {
    const { text } = await renderRevenue()
    expect(text).toContain('Mitt Projekt')
    expect(text).not.toContain('SECRET-PROJECT')
  })

  it('the 7-day run count is the owned one, not the global one', async () => {
    // Foreign has 2 runs, owned has 1 — a global read would show 3 somewhere.
    const { seen } = await renderRevenue()
    const rec = dataQuery(seen, 'runs')
    expect(scopeArg(rec, 'project_id')).toEqual([MINE])
  })

  it('foreign agents are never read, so a foreign model cannot price anything', async () => {
    const { seen } = await renderRevenue()
    expect(scopeArg(dataQuery(seen, 'agents'), 'project_id')).toEqual([MINE])
  })
})

// ═══ Fail-closed ═════════════════════════════════════════════════════════════

describe('9N · revenue — an empty allow-list fails closed, it does not fall back', () => {
  it('a user who owns no project sees zeroes and every query carries the impossible id', async () => {
    CURRENT_USER = { id: 'user-with-nothing' }
    const { text, seen } = await renderRevenue()

    expect(text).not.toContain('SECRET-PROJECT')
    expect(text).not.toContain('1 000 kr')
    expect(text).not.toContain('99 000 kr')

    // Zeroes must come from an IMPOSSIBLE-id query, not from a skipped filter:
    // "empty result" and "no filter applied" look identical on screen.
    expect(scopeArg(dataQuery(seen, 'projects'), 'id')).toEqual([IMPOSSIBLE_PROJECT_ID])
    expect(scopeArg(dataQuery(seen, 'revenue_events'), 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
    expect(scopeArg(dataQuery(seen, 'leads'), 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
    expect(scopeArg(dataQuery(seen, 'run_logs'), 'runs.project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
    expect(scopeArg(dataQuery(seen, 'agents'), 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
    expect(scopeArg(dataQuery(seen, 'runs'), 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
  })

  it('an unauthenticated request never reaches a query at all', async () => {
    CURRENT_USER = null
    await expect(renderRevenue()).rejects.toThrow('REDIRECT:/login')
    expect(CURRENT.seen).toHaveLength(0)
  })
})

// ═══ Query construction ══════════════════════════════════════════════════════

describe('9N · revenue — the scope is in the query, ahead of everything else', () => {
  it('every project-owned source carries a filter; none is post-filtered', async () => {
    const { seen } = await renderRevenue()
    expect(scopeArg(dataQuery(seen, 'projects'), 'id')).toEqual([MINE])
    expect(scopeArg(dataQuery(seen, 'revenue_events'), 'project_id')).toEqual([MINE])
    expect(scopeArg(dataQuery(seen, 'leads'), 'project_id')).toEqual([MINE])
    expect(scopeArg(dataQuery(seen, 'run_logs'), 'runs.project_id')).toEqual([MINE])
    expect(scopeArg(dataQuery(seen, 'agents'), 'project_id')).toEqual([MINE])
    expect(scopeArg(dataQuery(seen, 'runs'), 'project_id')).toEqual([MINE])
  })

  it('leads are scoped BEFORE they are ordered, so no ordering can displace owned rows', async () => {
    const { seen } = await renderRevenue()
    const ops = dataQuery(seen, 'leads')!.ops.map(([op, c]) => `${op}:${c}`)
    expect(ops.indexOf('in:project_id')).toBeGreaterThan(-1)
    expect(ops.indexOf('order:created_at')).toBeGreaterThan(ops.indexOf('in:project_id'))
  })

  it('revenue_events and run_logs are scoped before their date windows', async () => {
    const { seen } = await renderRevenue()
    for (const [table, col] of [['revenue_events', 'project_id'], ['run_logs', 'runs.project_id']] as const) {
      const ops = dataQuery(seen, table)!.ops.map(([op, c]) => `${op}:${c}`)
      const scope = ops.indexOf(`in:${col}`)
      const gte = ops.findIndex(o => o.startsWith('gte:'))
      expect(scope).toBeGreaterThan(-1)
      expect(gte).toBeGreaterThan(scope)
    }
  })

  it('run_logs uses an INNER embed, so the filter drops rows instead of nulling them', async () => {
    // Proven against live PostgREST: a plain embed returns every foreign log
    // row with `runs: null`. The page would skip them when summing, but they
    // would still have been read out of the database into this process.
    const { seen } = await renderRevenue()
    expect(dataQuery(seen, 'run_logs')!.inner).toContain('runs')
  })

  it('the allow-list is derived from the session user, not from the request', async () => {
    const { seen } = await renderRevenue()
    const lookup = queryFor(seen, 'projects')[0]
    expect(lookup.ops).toContainEqual(['eq', 'owner_id', ME])
  })
})
