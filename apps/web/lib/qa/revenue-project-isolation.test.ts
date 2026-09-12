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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

// CostIntelligence money, chosen so a leak is never a rounding argument.
const COST_OWNED = 123
const COST_FOREIGN = 987_654
const COST_PLATFORM = 41
const BUDGET_OWNED = 1_000
const BUDGET_FOREIGN = 5_000_000

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
    // ── Phase 9N.5: CostIntelligence sources ──────────────────────────────
    cost_events: [
      { project_id: MINE, provider: 'anthropic', model: 'm', agent: 'Min Agent', operation: 'op',
        unit_type: 'tokens', units: 100, tokens_in: 100, tokens_out: 50, cost_sek: COST_OWNED, created_at: inMonth() },
      { project_id: THEIRS, provider: 'openai', model: 'm', agent: 'SECRET-AGENT', operation: 'SECRET-OP',
        unit_type: 'tokens', units: 9e6, tokens_in: 9e6, tokens_out: 9e6, cost_sek: COST_FOREIGN, created_at: inMonth() },
      // `cost_events.project_id` is NULLABLE and the DDL calls NULL
      // "plattformsglobal". These rows carry no run_id either (verified in
      // production: 87 of 87 null-project rows have run_id NULL), so there is
      // nothing to resolve them through and they are DROPPED — the same rule
      // Phase 9L applied to agent_messages, and the rule the three existing
      // Atlas call sites already enforce via applyProjectScope.
      { project_id: null, provider: 'anthropic', model: 'm', agent: 'PLATFORM-AGENT', operation: 'op',
        unit_type: 'tokens', units: 10, tokens_in: 10, tokens_out: 10, cost_sek: COST_PLATFORM, created_at: inMonth() },
    ],
    project_budgets: [
      { project_id: MINE, monthly_sek: BUDGET_OWNED },
      { project_id: THEIRS, monthly_sek: BUDGET_FOREIGN },
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

let lastPageTree: any = null

async function renderRevenue() {
  vi.resetModules()
  // The legacy body, which this suite is about: every aggregate it pins is the
  // service-role read Phase 9N scoped. vNext renders a different surface at the
  // same route and is covered by `money-overview.test.ts`; CostIntelligence is
  // still imported by this body, unchanged, so the child assertions hold too.
  const mod = await import('@/app/(platform)/revenue/RevenueLegacy')
  const el = await mod.RevenueLegacy()
  lastPageTree = el
  const out: string[] = []
  collect(el, out)
  // `text` keeps token boundaries; `tight` re-joins adjacent JSX children so a
  // value and its unit ("0.0" + "% förbrukat") can be asserted as one string.
  return { text: out.join(' | '), tight: out.join(''), parts: out, seen: CURRENT.seen }
}

/**
 * CostIntelligence is a nested async server component. Invoking the page only
 * CREATES its element — it does not run it — so these helpers find that element
 * and execute it with the props the page actually handed it. That is what makes
 * the propagation itself testable: drop the prop and the child either throws or
 * goes global, and either way these assertions move.
 */
function findChild(node: any, name: string, depth = 0): any {
  if (node == null || depth > 80) return null
  if (Array.isArray(node)) {
    for (const c of node) { const hit = findChild(c, name, depth + 1); if (hit) return hit }
    return null
  }
  if (typeof node !== 'object') return null
  if (typeof node.type === 'function' && node.type.name === name) return node
  if (node.props) {
    for (const [k, v] of Object.entries(node.props)) {
      if (k === 'className' || k === 'style') continue
      const hit = findChild(v, name, depth + 1); if (hit) return hit
    }
  }
  return null
}

async function renderCostIntelligence() {
  const { seen } = await renderRevenue()
  const el = findChild((await lastPageTree), 'CostIntelligence')
  expect(el, 'CostIntelligence element not found on the page').toBeTruthy()
  const rendered = await el.type(el.props)
  const out: string[] = []
  collect(rendered, out)
  return { props: el.props as { allowedProjectIds?: string[] }, text: out.join(' | '), tight: out.join(''), parts: out, seen }
}

/** The page's own formatter for cost figures (sv-SE, no decimals). */
const cost = (n: number) =>
  new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' kr'

const queryFor = (seen: Seen[], table: string) => seen.filter(s => s.table === table)
/**
 * `projects` is read up to three times per render, in a fixed order:
 *   [0] getAllowedProjectIds — the allow-list lookup (eq owner_id)
 *   [1] the page's own project cards
 *   [2] CostIntelligence's name lookup — only when the child is executed
 * Addressing them by position keeps an assertion from silently retargeting.
 */
const PROJECTS_ALLOWLIST = 0
const PROJECTS_PAGE = 1
const PROJECTS_COST_INTELLIGENCE = 2

/** The data read, i.e. not the allow-list lookup on `projects`. */
const dataQuery = (seen: Seen[], table: string) => {
  const all = queryFor(seen, table)
  return table === 'projects' ? all[PROJECTS_PAGE] : all[0]
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

// ═══ Phase 9N.5 · CostIntelligence ═══════════════════════════════════════════
//
// CostIntelligence renders INSIDE /revenue, so it sits behind the same
// authorization boundary. Scoping the page's own metrics while this section
// still summed every tenant's spend would leave the surface unisolated.

describe('9N.5 · CostIntelligence — the parent allow-list reaches the child', () => {
  it('the page hands its already-resolved allow-list to the component', async () => {
    const { props } = await renderCostIntelligence()
    expect(props.allowedProjectIds).toEqual([MINE])
  })

  it('its own projects read is scoped too, on the identity column', async () => {
    // Honest scope of this guard: every key CostIntelligence looks up in this
    // table already comes from a scoped source (cost_events project ids, and
    // the budget rows built from them), so on its own it changes no rendered
    // value. What it does is stop another tenant's project names and colours
    // being read into the process — and, together with the project_budgets
    // filter, it is what prevents a foreign budget bar. Neither guard alone
    // closes that path, which is why both are here.
    const { seen } = await renderCostIntelligence()
    expect(scopeArg(queryFor(seen, 'projects')[PROJECTS_COST_INTELLIGENCE], 'id')).toEqual([MINE])
  })

  it('the component performs no auth of its own — it only reads what it was given', async () => {
    // Its three queries must all carry the parent's scope; there is no second
    // ownership model, and no session lookup inside the child.
    const { seen } = await renderCostIntelligence()
    expect(scopeArg(dataQuery(seen, 'cost_events'), 'project_id')).toEqual([MINE])
    expect(scopeArg(queryFor(seen, 'project_budgets')[0], 'project_id')).toEqual([MINE])
  })
})

describe('9N.5 · CostIntelligence — foreign spend never reaches a displayed figure', () => {
  it('the month total is the owned cost, not the global one', async () => {
    const { text } = await renderCostIntelligence()
    expect(text).toContain(cost(COST_OWNED))
    expect(text).not.toContain(cost(COST_FOREIGN))
    expect(text).not.toContain(cost(COST_OWNED + COST_FOREIGN))
  })

  it('provider totals and rankings exclude the foreign provider', async () => {
    const { text } = await renderCostIntelligence()
    expect(text).not.toContain('OpenAI')
    expect(text).not.toContain('SECRET-AGENT')
    expect(text).not.toContain('SECRET-OP')
  })

  it('the forecast is projected from owned spend only', async () => {
    // Formula unchanged: (monthSek / dayOfMonth) * daysInMonth.
    const { text } = await renderCostIntelligence()
    const now = new Date()
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    expect(text).toContain(cost((COST_OWNED / now.getDate()) * days))
    expect(text).not.toContain(cost((COST_FOREIGN / now.getDate()) * days))
  })

  it('the per-project ranking shows only the owned project', async () => {
    const { text } = await renderCostIntelligence()
    expect(text).toContain('Mitt Projekt')
    expect(text).not.toContain('SECRET-PROJECT')
  })

  it('percentage insights are computed over the owned total', async () => {
    // "<provider> står för N% …" — with a leak the owned provider's share
    // collapses from 100% to well under 1%.
    const { tight } = await renderCostIntelligence()
    expect(tight).toContain('står för 100%')
  })

  it('platform-global (null project) cost is dropped, not attributed to the operator', async () => {
    // `cost_events.project_id` is NULLABLE; the DDL calls NULL
    // "plattformsglobal". Such a row belongs to no project, and in production
    // every one of them also has run_id NULL, so nothing can resolve it. It is
    // excluded rather than added to whichever operator happens to be looking.
    const { text } = await renderCostIntelligence()
    expect(text).not.toContain('PLATFORM-AGENT')
    expect(text).not.toContain(cost(COST_OWNED + COST_PLATFORM))
  })
})

describe('9N.5 · CostIntelligence — budgets', () => {
  it('the budget bar uses the owned budget and its own spend', async () => {
    const { text, tight } = await renderCostIntelligence()
    expect(text).toContain(cost(BUDGET_OWNED))
    expect(text).not.toContain(cost(BUDGET_FOREIGN))
    // 123 / 1 000 → 12%. A foreign budget or foreign spend would move this.
    expect(tight).toContain(`${((COST_OWNED / BUDGET_OWNED) * 100).toFixed(0)}% förbrukat`)
  })

  it('project_budgets is filtered in the query, so a foreign budget is never read', async () => {
    // Honest scope of this guard: while the `projects` scope holds, a foreign
    // budget could not reach a bar anyway — budget rows are built by iterating
    // the (scoped) project list. Filtering here is what stops another tenant's
    // budget figures being read into this process at all, and it means budget
    // isolation does not depend on the projects scope staying correct.
    const { seen } = await renderCostIntelligence()
    expect(scopeArg(queryFor(seen, 'project_budgets')[0], 'project_id')).toEqual([MINE])
  })
})

describe('9N.5 · CostIntelligence — fail closed, never fall back', () => {
  it('an operator who owns nothing gets the impossible id on every cost query', async () => {
    CURRENT_USER = { id: 'user-with-nothing' }
    const { text, seen } = await renderCostIntelligence()

    expect(text).not.toContain('SECRET-PROJECT')
    expect(text).not.toContain(cost(COST_OWNED))
    expect(text).not.toContain(cost(COST_FOREIGN))

    // Zeroes must come from an impossible-id query, not a skipped filter.
    expect(scopeArg(dataQuery(seen, 'cost_events'), 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
    expect(scopeArg(queryFor(seen, 'project_budgets')[0], 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
    expect(scopeArg(queryFor(seen, 'projects')[PROJECTS_COST_INTELLIGENCE], 'id')).toEqual([IMPOSSIBLE_PROJECT_ID])
  })

  it('there is no first-project fallback — an empty allow-list stays empty', async () => {
    CURRENT_USER = { id: 'user-with-nothing' }
    const { text } = await renderCostIntelligence()
    expect(text).toContain('Inga kostnadshändelser loggade ännu')
    expect(text).not.toContain('Mitt Projekt')
  })

  it('the child guarantees fail-closed itself, even if a caller passes []', async () => {
    // `allowedProjectIds` is the RAW list and scopeProjectFilter is applied
    // inside the component, so the impossible-id guarantee holds at the point
    // of use rather than depending on every future caller getting it right.
    vi.resetModules()
    CURRENT = fakeDb(seedTables())
    const mod = await import('@/app/(platform)/revenue/CostIntelligence')
    const rendered = await mod.CostIntelligence({ allowedProjectIds: [] })
    const out: string[] = []
    collect(rendered, out)
    expect(out.join(' | ')).not.toContain(cost(COST_FOREIGN))
    expect(scopeArg(dataQuery(CURRENT.seen, 'cost_events'), 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
  })
})

describe('9N.5 · CostIntelligence — scope precedes window, ordering and slicing', () => {
  it('cost_events is scoped before its date window and before the ordering', async () => {
    // The live stream renders `rows.slice(0, 22)` off this ordering, so a scope
    // applied after it would let foreign events displace owned ones on screen.
    const { seen } = await renderCostIntelligence()
    const ops = dataQuery(seen, 'cost_events')!.ops.map(([op, c]) => `${op}:${c}`)
    const scope = ops.indexOf('in:project_id')
    expect(scope).toBeGreaterThan(-1)
    expect(ops.findIndex(o => o.startsWith('gte:'))).toBeGreaterThan(scope)
    expect(ops.findIndex(o => o.startsWith('order:'))).toBeGreaterThan(scope)
  })

  it('the 22-row live stream can only contain owned events', async () => {
    const { text } = await renderCostIntelligence()
    expect(text).toContain('Min Agent')
    expect(text).not.toContain('SECRET-AGENT')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 14 — the vNext surface at the same route
// ─────────────────────────────────────────────────────────────────────────────
//
// The body above is the legacy one, reached by `?ui=legacy`. vNext renders
// Pengar at the same path, and it reads the SAME service-role-only sources —
// `cost_events` and the budget functions were revoked from `authenticated` in
// 9AB — so the rule this suite exists for applies again: the scope lands inside
// every query, before any sum. These assertions read the loader's code.

describe('9N · revenue — the vNext surface keeps the boundary', () => {
  const src = readFileSync(resolve(__dirname, '../../lib/os/money.ts'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

  it('resolves the scope from the session and fails closed without one', () => {
    expect(code).toMatch(/resolveProjectAccess\(\)/)
    expect(code).toMatch(/if \(!access\.ok\) return null/)
    expect(code).toMatch(/scopeProjectFilter\(access\.allowedProjectIds\)/)
  })

  it('scopes every project-owned read inside the query, never after a sum', () => {
    for (const table of ['cost_events', 'revenue_events', 'leads', 'spend_advisory_overrides']) {
      const re = new RegExp(`from\\('${table}'\\)[\\s\\S]{0,200}?\\.in\\('project_id', scope\\)`)
      expect(code, table).toMatch(re)
    }
  })

  it('re-filters in the assembler, so one layer failing cannot move a total', () => {
    expect(code).toMatch(/pid !== null && owned\.has\(pid\)/)
    expect(code).toMatch(/if \(!pid \|\| !owned\.has\(pid\)\) continue/)
  })

  it('keeps only PROJECT scopes from the gate, whose global rows sum every project', () => {
    expect(code).toMatch(/if \(!isProjectBudgetScope\(row\?\.scope\)\) continue/)
  })

  it('does not re-price and does not read the token estimate the legacy page used', () => {
    expect(code).not.toMatch(/run_logs|calculateCost|getModelPricing|getRates|MONTHLY_AI_BUDGET/)
  })

  it('narrowing by slug can only remove ids', () => {
    expect(code).toMatch(/scopeProjectFilter\(match \? \[match\.id\] : \[\]\)/)
  })

  it('both generations are mounted at the one route', () => {
    const page = readFileSync(resolve(__dirname, '../../app/(platform)/revenue/page.tsx'), 'utf8')
    expect(page).toMatch(/<RevenueLegacy \/>/)
    expect(page).toMatch(/<MoneyOverview model=/)
  })
})
