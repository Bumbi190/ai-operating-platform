/**
 * Agent Activity project isolation (Phase 9P).
 *
 * `fetchAgentActivity` read `runs` through the SERVICE-ROLE client with no
 * project filter at all, and — the part that makes this different from every
 * earlier read-isolation slice — it did so as
 *
 *     order(newest first) → limit(10) / limit(8)
 *
 * A limit applied to a global read is not merely a leak, it is DISPLACEMENT.
 * The newest runs anywhere in the database consume the slots, so an operator
 * does not just see other people's work: their own runs disappear from the
 * page entirely. Production makes that concrete — 947 runs belong to one
 * project and 53 to another, and the unscoped `limit(8)` slice is 100% the
 * first project. Post-filtering a global read would therefore be the WRONG
 * fix: it would hide the foreign rows and leave the smaller tenant with a
 * blank page. The scope has to land before the limit.
 *
 * `runs.project_id` is NOT NULL (verified live), so there is no nullable
 * ownership question here and nothing to resolve through a relation.
 *
 * `run_logs` has no project_id — only `run_id`. Its rows are owned by
 * DERIVATION: the run id comes out of the already-scoped query above. The
 * transitive `runs!inner(project_id)` filter is added anyway so the query is
 * safe by construction rather than by caller discipline; the tests below say
 * plainly which of the two is doing the work.
 *
 * These tests execute the REAL page component and read the REAL strings it
 * renders. Removing a filter changes what these assertions see.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

;(globalThis as any).React = React

const ME = 'user-me'
const OTHER = 'user-other'
const MINE = '11111111-1111-1111-1111-111111111111'
const THEIRS = '22222222-2222-2222-2222-222222222222'

const RUNNING_LIMIT = 10
const RECENT_LIMIT = 8

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()

const STEPS = [
  { order: 1, name: 'Steg ett' },
  { order: 2, name: 'Steg tva' },
  { order: 3, name: 'Steg tre' },
]

function seedTables() {
  const runs: any[] = []

  // ── Displacement fixture ──────────────────────────────────────────────────
  // Foreign runs are NEWER and outnumber both limits; owned runs are OLDER.
  // Unscoped, the limits are spent entirely on foreign rows and the owned runs
  // never render. Scoped first, the owned runs are all there is to slice.
  for (let i = 0; i < 12; i++) {
    runs.push({
      id: `r-theirs-running-${i}`, project_id: THEIRS, status: 'running',
      started_at: at(1 + i), created_at: at(1 + i), finished_at: null,
      workflows: { name: `SECRET-WORKFLOW-${i}`, steps: STEPS },
      projects: { name: 'SECRET-PROJECT', color: '#ff0000' },
    })
    runs.push({
      id: `r-theirs-recent-${i}`, project_id: THEIRS, status: 'success',
      started_at: at(1 + i), created_at: at(1 + i), finished_at: at(i),
      workflows: { name: `SECRET-DONE-${i}`, steps: STEPS },
      projects: { name: 'SECRET-PROJECT', color: '#ff0000' },
    })
  }

  runs.push({
    id: 'r-mine-running', project_id: MINE, status: 'running',
    started_at: at(500), created_at: at(500), finished_at: null,
    workflows: { name: 'Mitt Arbetsflode', steps: STEPS },
    projects: { name: 'Mitt Projekt', color: '#00ff00' },
  })
  runs.push({
    id: 'r-mine-done-1', project_id: MINE, status: 'success',
    started_at: at(600), created_at: at(600), finished_at: at(595),
    workflows: { name: 'Min Klara Korning', steps: STEPS },
    projects: { name: 'Mitt Projekt', color: '#00ff00' },
  })
  runs.push({
    id: 'r-mine-done-2', project_id: MINE, status: 'failed',
    started_at: at(700), created_at: at(700), finished_at: at(690),
    workflows: { name: 'Min Trasiga Korning', steps: STEPS },
    projects: { name: 'Mitt Projekt', color: '#00ff00' },
  })

  const run_logs = [
    // Owned: one completed step, so progress is 1/3 and the ETA is derivable.
    { run_id: 'r-mine-running', step_order: 1, step_name: 'Steg ett', role: 'assistant',
      content: 'MIN-SENASTE-ATGARD', duration_ms: 6000, created_at: at(480),
      runs: { project_id: MINE } },
    // Foreign: many completed steps and a wildly different duration, so a leak
    // would visibly move the step counter, the progress bar and the ETA.
    { run_id: 'r-theirs-running-0', step_order: 1, step_name: 'x', role: 'assistant',
      content: 'SECRET-ACTION', duration_ms: 900_000, created_at: at(3),
      runs: { project_id: THEIRS } },
    { run_id: 'r-theirs-running-0', step_order: 2, step_name: 'y', role: 'assistant',
      content: 'SECRET-ACTION-2', duration_ms: 900_000, created_at: at(2),
      runs: { project_id: THEIRS } },
  ]

  return {
    projects: [
      { id: MINE, owner_id: ME, name: 'Mitt Projekt', color: '#00ff00' },
      { id: THEIRS, owner_id: OTHER, name: 'SECRET-PROJECT', color: '#ff0000' },
    ],
    runs,
    run_logs,
  }
}

// ── A fake that applies PostgREST semantics IN CALL ORDER ────────────────────
// Call order is the whole point here: `.limit()` truncates whatever it is
// handed, so a scope applied after it cannot restore the rows it removed.
interface Seen { table: string; ops: [string, string, unknown][]; inner: string[] }

const get = (row: any, path: string): unknown =>
  path.split('.').reduce((a: any, k) => (a == null ? a : a[k]), row)

function fakeDb(tables: Record<string, any[]>) {
  const seen: Seen[] = []
  const from = (table: string) => {
    const rec: Seen = { table, ops: [], inner: [] }
    seen.push(rec)
    let rows: any[] = (tables[table] ?? []).map(r => ({ ...r }))

    const apply = (col: string, keep: (r: any) => boolean) => {
      if (col.includes('.')) {
        const embed = col.split('.')[0]
        if (rec.inner.includes(embed)) rows = rows.filter(keep)
        else rows = rows.map(r => (keep(r) ? r : { ...r, [embed]: null }))
      } else rows = rows.filter(keep)
    }

    const q: any = {
      select: (cols?: string) => {
        for (const m of String(cols ?? '').matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*!inner/g)) rec.inner.push(m[1])
        return q
      },
      eq: (c: string, v: unknown) => { rec.ops.push(['eq', c, v]); apply(c, r => get(r, c) === v); return q },
      neq: (c: string, v: unknown) => { rec.ops.push(['neq', c, v]); apply(c, r => get(r, c) !== v); return q },
      in: (c: string, v: unknown[]) => { rec.ops.push(['in', c, v]); apply(c, r => v.includes(get(r, c) as never)); return q },
      order: (c: string, o?: { ascending?: boolean }) => {
        rec.ops.push(['order', c, o?.ascending !== false])
        const dir = o?.ascending === false ? -1 : 1
        rows = [...rows].sort((a, b) => (String(get(a, c)) < String(get(b, c)) ? -1 : 1) * dir)
        return q
      },
      limit: (n: number) => { rec.ops.push(['limit', String(n), n]); rows = rows.slice(0, n); return q },
      then: (ok: any, err?: any) =>
        Promise.resolve({ data: rows, count: rows.length, error: null }).then(ok, err),
    }
    return q
  }
  return { db: { from } as any, seen }
}

let CURRENT_USER: { id: string } | null = { id: ME }
let CURRENT: ReturnType<typeof fakeDb>

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: CURRENT_USER } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => CURRENT.db }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`) } }))

/**
 * Collect every string/number the tree carries. Nested components are NOT
 * executed, so the values they will render live in their props — including
 * plain data objects like `<RunningCard agent={...} />`, which must be walked
 * too or the whole card contributes nothing to the assertions.
 */
function collect(node: any, out: string[], depth = 0) {
  if (node == null || depth > 80) return
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return }
  if (Array.isArray(node)) { for (const c of node) collect(c, out, depth + 1); return }
  if (typeof node !== 'object') return
  const source = node.props ?? node          // React element, or a plain data prop
  for (const [k, v] of Object.entries(source)) {
    if (k === 'className' || k === 'icon') continue
    collect(v, out, depth + 1)
  }
}

/** Pull the ViewVisibleSync refs out of the tree — what the page announces to Atlas. */
function findRefs(node: any, depth = 0): any[] | null {
  if (node == null || depth > 80) return null
  if (Array.isArray(node)) { for (const c of node) { const h = findRefs(c, depth + 1); if (h) return h } return null }
  if (typeof node !== 'object') return null
  if (typeof node.type === 'function' && node.type.name === 'ViewVisibleSync') return node.props.refs
  if (node.props) {
    for (const [k, v] of Object.entries(node.props)) {
      if (k === 'className' || k === 'style') continue
      const h = findRefs(v, depth + 1); if (h) return h
    }
  }
  return null
}

/**
 * `RunningCard` composes strings like "Steg 2 av 3" and "~12s kvar" from the
 * loader's numbers, and a nested component is not executed by simply invoking
 * the page. Find every card and run it, so the assertions read the text an
 * operator would actually see rather than the raw props behind it.
 */
function renderChildren(node: any, name: string, out: string[], depth = 0) {
  if (node == null || depth > 80) return
  if (Array.isArray(node)) { for (const c of node) renderChildren(c, name, out, depth + 1); return }
  if (typeof node !== 'object') return
  if (typeof node.type === 'function' && node.type.name === name) {
    collect(node.type(node.props), out)
    return
  }
  const source = node.props ?? node
  for (const [k, v] of Object.entries(source)) {
    if (k === 'className' || k === 'icon') continue
    renderChildren(v, name, out, depth + 1)
  }
}

async function render() {
  vi.resetModules()
  // The legacy body, which this suite is about: it is the service-role read
  // that the `.limit()` ordering argument below concerns. vNext renders a
  // different, RLS-bound surface and is covered by `activity-stream.test.ts`.
  const mod = await import('@/app/(platform)/agent-activity/AgentActivityLegacy')
  const el = await mod.AgentActivityLegacy()
  const out: string[] = []
  collect(el, out)
  const cards: string[] = []
  renderChildren(el, 'RunningCard', cards)
  const all = [...out, ...cards]
  return {
    text: all.join(' | '), tight: all.join(''), parts: all,
    cardText: cards.join(''), refs: findRefs(el) ?? [], seen: CURRENT.seen,
  }
}

const runQueries = (seen: Seen[]) => seen.filter(s => s.table === 'runs')
const logQueries = (seen: Seen[]) => seen.filter(s => s.table === 'run_logs')
/**
 * `runQueries` holds only the `runs` reads — the allow-list lookup goes to
 * `projects`, so it is not in this list. [0] running, [1] recent.
 */
const RUNNING_Q = 0
const RECENT_Q = 1
const scopeArg = (rec: Seen | undefined, col: string) =>
  rec?.ops.find(([op, c]) => op === 'in' && c === col)?.[2] as string[] | undefined
const opNames = (rec: Seen) => rec.ops.map(([op, c]) => `${op}:${c}`)

beforeEach(() => {
  CURRENT_USER = { id: ME }
  CURRENT = fakeDb(seedTables())
})

// ═══ The headline risk: displacement ═════════════════════════════════════════

describe('9P · agent activity — foreign runs cannot consume the limited slots', () => {
  it('owned runs still render even though 12 newer foreign runs exist per limit', async () => {
    // Unscoped this is the failure mode: 12 foreign runs are newer than both
    // owned ones, the limits are 10 and 8, so a global read returns foreign
    // rows only and the operator sees an empty page of their own work.
    const { text } = await render()
    expect(text).toContain('Mitt Arbetsflode')      // running card survived
    expect(text).toContain('Min Klara Korning')     // recent row survived
    expect(text).toContain('Min Trasiga Korning')
    expect(text).not.toContain('SECRET-WORKFLOW')
    expect(text).not.toContain('SECRET-DONE')
  })

  it('the scope is applied BEFORE the limit on both run reads', async () => {
    const { seen } = await render()
    for (const [label, idx, lim] of [['running', RUNNING_Q, RUNNING_LIMIT], ['recent', RECENT_Q, RECENT_LIMIT]] as const) {
      const ops = opNames(runQueries(seen)[idx])
      const scope = ops.indexOf('in:project_id')
      const limit = ops.findIndex(o => o.startsWith('limit:'))
      const order = ops.findIndex(o => o.startsWith('order:'))
      expect(scope, `${label}: no scope`).toBeGreaterThan(-1)
      expect(order, `${label}: order must follow scope`).toBeGreaterThan(scope)
      expect(limit, `${label}: limit must follow scope`).toBeGreaterThan(scope)
      expect(runQueries(seen)[idx].ops.find(([op]) => op === 'limit')?.[2]).toBe(lim)
    }
  })

  it('the running count reflects owned work only', async () => {
    // 12 foreign runs are running; a leak would report 10 (the limit), not 1.
    const { tight } = await render()
    expect(tight).toContain('1 agent arbetar just nu')
    expect(tight).not.toContain('10 agenter arbetar just nu')
  })
})

// ═══ Raw isolation ═══════════════════════════════════════════════════════════

describe('9P · agent activity — foreign rows and their metadata never render', () => {
  it('foreign workflow names, project names and colours are absent', async () => {
    const { text, parts } = await render()
    expect(text).toContain('Mitt Projekt')
    expect(text).not.toContain('SECRET-PROJECT')
    expect(parts).toContain('#00ff00')      // owned colour, carried on the card
    expect(parts).not.toContain('#ff0000')  // foreign colour never reaches the tree
  })

  it('foreign run_logs cannot supply the "last action" line', async () => {
    const { text } = await render()
    expect(text).toContain('MIN-SENASTE-ATGARD')
    expect(text).not.toContain('SECRET-ACTION')
  })

  it('the refs published to Atlas view awareness carry only owned runs', async () => {
    const { refs } = await render()
    expect(refs.length).toBeGreaterThan(0)
    expect(refs.every((r: any) => String(r.id).startsWith('r-mine'))).toBe(true)
    expect(JSON.stringify(refs)).not.toContain('SECRET')
  })
})

// ═══ Activity semantics ══════════════════════════════════════════════════════

describe('9P · agent activity — every displayed figure is computed from owned rows', () => {
  it('step index, total and progress come from the owned run only', async () => {
    // Owned run: 1 assistant log of 3 steps → step 2 of 3, 33%.
    // The foreign run has 2 completed steps; a leak would move these numbers.
    const { cardText, parts } = await render()
    expect(cardText).toContain('Steg 2 av 3')
    expect(cardText).toContain('Steg tva')       // the owned step's name
    expect(parts).toContain('33')                // progress bar, 1 of 3 steps
    // The foreign run has 2 of 3 steps done → step 3 of 3 at 67%.
    expect(cardText).not.toContain('Steg 3 av 3')
    expect(parts).not.toContain('67')
  })

  it('the ETA is averaged over owned step durations only', async () => {
    // owned: one 6 000 ms step, 2 remaining → 12 s. Foreign steps are 900 000 ms.
    const { cardText } = await render()
    expect(cardText).toContain('~12s kvar')
    // Foreign steps average 900 000 ms → "~15 min kvar" if they ever leaked in.
    expect(cardText).not.toContain('min kvar')
  })

  it('recent-run durations and statuses are the owned ones', async () => {
    const { parts, text } = await render()
    expect(parts).toContain('300s')   // r-mine-done-1: 600 → 595 min
    expect(parts).toContain('600s')   // r-mine-done-2: 700 → 690 min
    expect(text).toContain('success')
    expect(text).toContain('failed')
  })

  it('exactly the owned runs appear — no foreign row survives anywhere', async () => {
    const { text } = await render()
    expect(text).not.toContain('SECRET')
  })
})

// ═══ Ownership chain for the log fan-out ═════════════════════════════════════

describe('9P · agent activity — the run_logs fan-out is owned twice over', () => {
  it('logs are only ever requested for run ids that came from the scoped read', async () => {
    // This is the derivational half of the chain, and it is the half that
    // actually protects the rendered values today.
    const { seen } = await render()
    const ids = logQueries(seen).map(q => q.ops.find(([op, c]) => op === 'eq' && c === 'run_id')?.[2])
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every(id => String(id).startsWith('r-mine'))).toBe(true)
  })

  it('each log query also carries the transitive scope through runs!inner', async () => {
    // Honest scope of this guard: while the runs scope holds, the derivation
    // above already prevents a foreign log from being read, so on its own this
    // changes no rendered value. It is what keeps the query safe if a run id
    // ever reaches this helper from somewhere other than the scoped read.
    const { seen } = await render()
    for (const q of logQueries(seen)) {
      expect(q.inner).toContain('runs')
      expect(scopeArg(q, 'runs.project_id')).toEqual([MINE])
    }
  })
})

// ═══ Fail closed ═════════════════════════════════════════════════════════════

describe('9P · agent activity — an empty allow-list fails closed', () => {
  it('an operator who owns nothing sees the empty state, not the platform', async () => {
    CURRENT_USER = { id: 'user-with-nothing' }
    const { text, seen } = await render()
    expect(text).not.toContain('SECRET')
    expect(text).toContain('Inga agenter arbetar just nu')
    expect(text).toContain('Alla agenter vilar')

    // Emptiness must come from an impossible-id query, not a skipped filter.
    expect(scopeArg(runQueries(seen)[RUNNING_Q], 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
    expect(scopeArg(runQueries(seen)[RECENT_Q], 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
  })

  it('there is no first-project fallback', async () => {
    CURRENT_USER = { id: 'user-with-nothing' }
    const { text, refs } = await render()
    expect(text).not.toContain('Mitt Projekt')
    expect(refs).toEqual([])
  })

  it('an unauthenticated request never reaches a query', async () => {
    CURRENT_USER = null
    await expect(render()).rejects.toThrow('REDIRECT:/login')
    expect(CURRENT.seen).toHaveLength(0)
  })

  it('the allow-list is derived from the session user, not the request', async () => {
    const { seen } = await render()
    expect(seen.filter(s => s.table === 'projects')[0].ops).toContainEqual(['eq', 'owner_id', ME])
  })
})

// ═══ Helper contract ═════════════════════════════════════════════════════════

describe('9P · agent activity — the loader cannot be called without a scope', () => {
  it('an empty array passed directly still yields the impossible id, never global', async () => {
    vi.resetModules()
    CURRENT = fakeDb(seedTables())
    const { fetchAgentActivity } = await import('@/lib/os/agents-activity')
    const activity = await fetchAgentActivity(CURRENT.db, [])
    expect(activity.running).toEqual([])
    expect(activity.recent).toEqual([])
    expect(scopeArg(runQueries(CURRENT.seen)[0], 'project_id')).toEqual([IMPOSSIBLE_PROJECT_ID])
  })

  it('a caller passing one project gets only that project', async () => {
    vi.resetModules()
    CURRENT = fakeDb(seedTables())
    const { fetchAgentActivity } = await import('@/lib/os/agents-activity')
    const activity = await fetchAgentActivity(CURRENT.db, [MINE])
    expect(activity.running.map(r => r.runId)).toEqual(['r-mine-running'])
    expect(activity.recent.map(r => r.runId).sort()).toEqual(['r-mine-done-1', 'r-mine-done-2'])
    expect(JSON.stringify(activity)).not.toContain('SECRET')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 13 — the vNext surface at the same route
// ─────────────────────────────────────────────────────────────────────────────
//
// The body above is the legacy one, reached by `?ui=legacy`. vNext renders a
// different read at the same path, so the boundary has to hold twice. It is a
// STRONGER read, not a looser one: RLS-bound rather than service-role, which is
// why these assertions are about what it must NOT contain.

describe('9P · agent activity — the vNext surface is bound at least as tightly', () => {
  const src = readFileSync(resolve(__dirname, '../../lib/os/activity.ts'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

  it('does not reach for the service-role client at all', () => {
    expect(code).not.toMatch(/createAdminClient|service_role/)
  })

  it('reads through the RLS client, so the owner boundary is the database\'s', () => {
    expect(code).toMatch(/from '@\/lib\/supabase\/server'/)
    expect(code).toMatch(/createClient\(\)/)
  })

  it('fails closed without a session rather than rendering a scopeless page', () => {
    expect(code).toMatch(/if \(!user\) return null/)
  })

  it('scopes approvals through the run, never through approvals.project_id', () => {
    // `approvals.project_id` is null on 12 of 13 production rows; gating on it
    // would drop almost every review instead of placing it.
    expect(code).toMatch(/runs!inner\(id, projects!inner\(/)
    expect(code).not.toMatch(/\.eq\('project_id'/)
  })

  it('bounds every read it makes', () => {
    const limits = code.match(/\.limit\(/g) ?? []
    expect(limits.length).toBeGreaterThanOrEqual(3)
    expect(code).not.toMatch(/\.limit\(\s*\)/)
  })

  it('fans out to run_logs only over ids that came from the scoped read', () => {
    expect(code).toMatch(/\.in\('run_id', runIds\)/)
    expect(code).toMatch(/runIds = runRows\.map/)
  })

  it('both generations are mounted at the one route', () => {
    const page = readFileSync(resolve(__dirname, '../../app/(platform)/agent-activity/page.tsx'), 'utf8')
    expect(page).toMatch(/<AgentActivityLegacy \/>/)
    expect(page).toMatch(/<ActivityStream model=/)
  })
})
