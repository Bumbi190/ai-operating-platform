/**
 * Scoped read isolation (Phase 9A).
 *
 * Two surfaces read through the SERVICE-ROLE client, which bypasses RLS. That
 * is legitimate — they aggregate across a project set the database cannot infer
 * from the connection — but it means the project boundary has to be re-applied
 * by hand, and until this phase neither did it:
 *
 *   /releases              listInstances() filtered by def_key ONLY, so an
 *                          instance in a project the operator does not own was
 *                          READ and RENDERED. The page already resolved the
 *                          allow-list — it just spent it on `mayDecide`, which
 *                          hides CONTROLS, not data.
 *
 *   fetchDashboardSnapshot 12 of its 13 queries were unscoped admin reads.
 *                          Only `projects` was safe, and only because it went
 *                          through the RLS client.
 *
 * The failure these tests exist to catch is silent: an unscoped read returns
 * MORE data, never an error, so nothing breaks and nothing looks wrong. The
 * behavioural tests below therefore run the real functions against a fake
 * query builder seeded with foreign-project rows, and assert those rows do not
 * come back — rather than only asserting that a scope clause is spelled in the
 * source.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { listInstancesForProjects } from '@/lib/workflows/store'
import { fetchDashboardSnapshot } from '@/lib/os/data'
import { scopeProjectFilter, IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const RELEASES = read('app/(platform)/releases/page.tsx')
// Phase 12 moved this body verbatim into SystemLegacy (`?ui=legacy`); the
// route itself is now the generation branch.
const SYSTEM = read('app/(platform)/system/SystemLegacy.tsx')
const SYSTEM_HEALTH = read('lib/os/system-health.ts')
const DATA = read('lib/os/data.ts')
const STORE = read('lib/workflows/store.ts')

const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const RELEASES_CODE = codeOnly(RELEASES)
const SYSTEM_CODE = codeOnly(SYSTEM)
const DATA_CODE = codeOnly(DATA)

// ── A fake PostgREST builder ─────────────────────────────────────────────────

/**
 * Enough of the Supabase query builder to run the real functions: chainable,
 * thenable, and it actually APPLIES the filters rather than recording them.
 *
 * Applying them is the point. A recorder proves a clause was written; only a
 * filter proves the clause excludes the row it is supposed to exclude, which
 * is the property under test.
 *
 * `get(row, 'runs.project_id')` resolves a dotted path so an embedded filter
 * (`run_logs` → its parent run) behaves the way PostgREST's `!inner` does.
 * That equivalence was checked against the live database separately: an
 * impossible project id returns zero rows there, not every row.
 */
function get(row: any, path: string): unknown {
  return path.split('.').reduce((acc: any, k) => (acc == null ? acc : acc[k]), row)
}

interface Seen { table: string; filters: [string, unknown[]][] }

function fakeDb(tables: Record<string, any[]>) {
  const seen: Seen[] = []
  const from = (table: string) => {
    const rec: Seen = { table, filters: [] }
    seen.push(rec)
    let rows = [...(tables[table] ?? [])]
    let head = false
    const q: any = {
      select: (_cols?: string, opts?: { head?: boolean }) => {
        if (opts?.head) head = true
        return q
      },
      in: (col: string, vals: unknown[]) => {
        rec.filters.push([col, vals])
        rows = rows.filter(r => vals.includes(get(r, col) as never))
        return q
      },
      eq: (col: string, val: unknown) => {
        rows = rows.filter(r => get(r, col) === val)
        return q
      },
      gte: () => q,
      not: () => q,
      order: () => q,
      limit: (n: number) => { rows = rows.slice(0, n); return q },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (onOk: any, onErr?: any) =>
        Promise.resolve(head ? { data: null, count: rows.length, error: null }
                             : { data: rows, count: rows.length, error: null })
          .then(onOk, onErr),
    }
    return q
  }
  return { db: { from } as any, seen }
}

const MINE = 'p-mine'
const THEIRS = 'p-theirs'

// ═══ /releases ═══════════════════════════════════════════════════════════════

describe('9A · releases — the instance read is project-scoped', () => {
  const instance = (id: string, project_id: string, def_key = 'familje_stunden_monthly_release') => ({
    id, def_id: 'd1', def_key, def_version: 1, def_hash: 'h', project_id,
    instance_key: id, current_state: 'planning', status: 'active', wake_at: null,
    last_tick_at: null, last_tick_outcome: null, created_at: 'now', closed_at: null,
  })

  const seed = () => fakeDb({
    workflow_instances: [
      instance('a', MINE),
      instance('b', THEIRS),
      instance('c', MINE),
    ],
  })

  it('returns instances in the allow-list', async () => {
    const { db } = seed()
    const out = await listInstancesForProjects(db, [MINE], { defKey: 'familje_stunden_monthly_release' })
    expect(out.map(i => i.id).sort()).toEqual(['a', 'c'])
  })

  it('a FOREIGN project instance never comes back, even with a matching def_key', async () => {
    const { db } = seed()
    const out = await listInstancesForProjects(db, [MINE], { defKey: 'familje_stunden_monthly_release' })
    expect(out.map(i => i.project_id)).not.toContain(THEIRS)
    expect(out.find(i => i.id === 'b')).toBeUndefined()
  })

  it('defKey NARROWS and never widens — it cannot reach outside the allow-list', async () => {
    const { db } = fakeDb({
      workflow_instances: [instance('mine', MINE, 'other_def'), instance('theirs', THEIRS, 'wanted')],
    })
    const out = await listInstancesForProjects(db, [MINE], { defKey: 'wanted' })
    // The only row with the requested def_key belongs to a foreign project.
    expect(out).toEqual([])
  })

  it('an EMPTY allow-list returns nothing, never everything', async () => {
    const { db, seen } = seed()
    const out = await listInstancesForProjects(db, scopeProjectFilter([]), { defKey: 'familje_stunden_monthly_release' })
    expect(out).toEqual([])
    expect(seen[0].filters).toContainEqual(['project_id', [IMPOSSIBLE_PROJECT_ID]])
  })

  it('the scope clause is always issued — it is never skipped for an empty list', async () => {
    const { db, seen } = seed()
    await listInstancesForProjects(db, scopeProjectFilter([]), {})
    expect(seen[0].filters.some(([col]) => col === 'project_id')).toBe(true)
  })

  it('the page no longer has an unscoped listInstances path', () => {
    // The def_key-only reader must not be reachable from this page at all —
    // neither imported nor called.
    expect(RELEASES_CODE).not.toMatch(/\blistInstances\b(?!ForProjects)/)
    expect(RELEASES_CODE).toMatch(/listInstancesForProjects\(/)
  })

  it('the read is scoped through scopeProjectFilter, not the raw array', () => {
    const at = RELEASES_CODE.indexOf('listInstancesForProjects(')
    expect(at).toBeGreaterThan(-1)
    const call = RELEASES_CODE.slice(at, RELEASES_CODE.indexOf(')', RELEASES_CODE.indexOf('defKey', at)))
    expect(call).toMatch(/scopeProjectFilter\(allowedProjectIds\)/)
  })

  it('scope resolution failure FAILS CLOSED — it never degrades to an empty allow-list', () => {
    // The old line `access.ok ? access.allowedProjectIds : []` was harmless when
    // the value only gated buttons. Now that it scopes a READ, silently
    // substituting [] would render "no releases" for an authorization failure.
    expect(RELEASES_CODE).not.toMatch(/access\.ok\s*\?\s*access\.allowedProjectIds\s*:\s*\[\]/)
    expect(RELEASES_CODE).toMatch(/if \(!access\.ok\) redirect\(/)
  })

  it('no first-project or global fallback', () => {
    expect(RELEASES_CODE).not.toMatch(/allowedProjectIds\[0\]|projects\[0\]/)
    expect(RELEASES_CODE).not.toMatch(/\|\|\s*\[\]\s*\)/)
  })
})

// ═══ fetchDashboardSnapshot ══════════════════════════════════════════════════

describe('9A · dashboard snapshot — the service role cannot escape scope', () => {
  const seed = () => {
    const wf = (id: string, project_id: string) => ({ id, project_id, name: id, steps: [] })
    const run = (id: string, project_id: string, status = 'done') => ({
      id, project_id, status, workflow_id: 'w', started_at: null, finished_at: null,
    })
    return fakeDb({
      projects: [{ id: MINE, name: 'Mine' }, { id: THEIRS, name: 'Theirs' }],
      agents: [{ id: 'a-mine', project_id: MINE }, { id: 'a-theirs', project_id: THEIRS }],
      workflows: [wf('w-mine', MINE), wf('w-theirs', THEIRS)],
      runs: [run('r-mine', MINE), run('r-theirs', THEIRS), run('r-theirs2', THEIRS, 'failed')],
      approvals: [
        { id: 'ap-mine', project_id: MINE, status: 'pending' },
        { id: 'ap-theirs', project_id: THEIRS, status: 'pending' },
        // project_id is NULLABLE on this table; a null-project approval must be
        // excluded (fail closed), not counted globally.
        { id: 'ap-null', project_id: null, status: 'pending' },
      ],
      memories: [{ id: 'm-mine', project_id: MINE }, { id: 'm-theirs', project_id: THEIRS }],
      run_logs: [
        { tokens_in: 10, tokens_out: 5, runs: { project_id: MINE } },
        { tokens_in: 999, tokens_out: 999, runs: { project_id: THEIRS } },
      ],
    })
  }

  it('workflows are constrained to the allowed projects', async () => {
    const { db } = seed()
    const snap = await fetchDashboardSnapshot(db, db, [MINE])
    expect(snap.workflows.map((w: any) => w.id)).toEqual(['w-mine'])
  })

  it('a FOREIGN project workflow cannot enter the snapshot', async () => {
    const { db } = seed()
    const snap = await fetchDashboardSnapshot(db, db, [MINE])
    expect(snap.workflows.map((w: any) => w.project_id)).not.toContain(THEIRS)
  })

  it('agents, projects and recent runs are constrained too', async () => {
    const { db } = seed()
    const snap = await fetchDashboardSnapshot(db, db, [MINE])
    expect(snap.agents.map((a: any) => a.id)).toEqual(['a-mine'])
    expect(snap.projects.map((p: any) => p.id)).toEqual([MINE])
    expect(snap.recentRuns.map((r: any) => r.id)).toEqual(['r-mine'])
  })

  it('the metrics count only the operator’s own rows', async () => {
    const { db } = seed()
    const snap = await fetchDashboardSnapshot(db, db, [MINE])
    expect(snap.metrics.totalRuns).toBe(1)          // not 3
    expect(snap.memoriesCount).toBe(1)              // not 2
    expect(snap.pendingApprovals).toBe(1)           // not 3 — null-project excluded
  })

  it('token totals do not leak through run_logs, which has no project_id', async () => {
    const { db } = seed()
    const snap = await fetchDashboardSnapshot(db, db, [MINE])
    // 10 + 5 from the owned run only; the foreign run contributes 999 + 999.
    expect(snap.metrics.tokensLast24h).toBe(15)
  })

  it('an EMPTY allow-list yields an empty snapshot, never a global one', async () => {
    const { db } = seed()
    const snap = await fetchDashboardSnapshot(db, db, [])
    expect(snap.workflows).toEqual([])
    expect(snap.agents).toEqual([])
    expect(snap.projects).toEqual([])
    expect(snap.metrics.totalRuns).toBe(0)
    expect(snap.metrics.tokensLast24h).toBe(0)
  })

  it('the empty allow-list is issued as an impossible id, not as a skipped clause', async () => {
    const { db, seen } = seed()
    await fetchDashboardSnapshot(db, db, [])
    for (const q of seen) {
      expect(q.filters.length, `${q.table} issued no scope clause`).toBeGreaterThan(0)
      expect(q.filters.some(([, vals]) => (vals as string[]).includes(IMPOSSIBLE_PROJECT_ID))).toBe(true)
    }
  })

  it('EVERY query in the function carries a scope clause', () => {
    // Structural, not a substring window: the body is split at each query start
    // so a clause belonging to the NEXT query can never satisfy this one. That
    // exact bleed made an earlier scoping assertion pass on unscoped code.
    const body = DATA_CODE.slice(
      DATA_CODE.indexOf('export async function fetchDashboardSnapshot'),
      DATA_CODE.indexOf('const projects   = pick('),
    )
    const statements = body.split(/(?=\n {4}\(?(?:admin|supabase)\b)/).filter(s => s.includes('.from('))
    expect(statements.length).toBe(13)
    for (const st of statements) {
      const table = st.match(/\.from\('(\w+)'\)/)![1]
      expect(
        /\.in\('(?:project_id|id|runs\.project_id)', scopedIds\)/.test(st),
        `${table} query has no scope clause`,
      ).toBe(true)
    }
  })

  it('the allow-list is a REQUIRED parameter — there is no unscoped overload left', () => {
    const sig = DATA_CODE.slice(
      DATA_CODE.indexOf('export async function fetchDashboardSnapshot'),
      DATA_CODE.indexOf('): Promise<DashboardSnapshot>'),
    )
    expect(sig).toMatch(/allowedProjectIds: string\[\]/)
    // Optional (`?:`) or defaulted (`= []`) scope is one forgotten argument away
    // from global, which is the contract this phase removed.
    expect(sig).not.toMatch(/allowedProjectIds\?:/)
    expect(sig).not.toMatch(/allowedProjectIds[^,)]*=\s*\[\]/)
  })

  it('the function derives no scope of its own', () => {
    // It has no session. If it could resolve a scope itself, a caller could
    // omit one and still get data back.
    const body = DATA_CODE.slice(
      DATA_CODE.indexOf('export async function fetchDashboardSnapshot'),
      DATA_CODE.indexOf('// ─── Active execution'),
    )
    expect(body).not.toMatch(/getAllowedProjectIds|auth\.getUser|resolveProjectAccess/)
  })
})

// ═══ Callers ═════════════════════════════════════════════════════════════════

describe('9A · every caller supplies scope canonically', () => {
  it('has exactly one production caller, and it passes a resolved allow-list', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const hits = execSync(
      `grep -rln "fetchDashboardSnapshot(" app lib --include=*.ts --include=*.tsx || true`,
      { cwd: WEB_ROOT, encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean)
      .filter(f => !f.startsWith('lib/qa/'))
      .filter(f => f !== 'lib/os/data.ts')          // the definition itself
      .sort()
    expect(hits).toEqual(['app/(platform)/system/SystemLegacy.tsx'])
    expect(SYSTEM_CODE).toMatch(/fetchDashboardSnapshot\(supabase, db, access\.allowedProjectIds\)/)
  })

  it('the caller resolves scope through the canonical helper, before the read', () => {
    expect(SYSTEM_CODE).toMatch(/resolveProjectAccess\(\)/)
    const resolveAt = SYSTEM_CODE.indexOf('resolveProjectAccess()')
    const readAt = SYSTEM_CODE.indexOf('fetchDashboardSnapshot(')
    expect(resolveAt).toBeGreaterThan(-1)
    expect(readAt).toBeGreaterThan(resolveAt)
  })

  it('the vNext system loader resolves the same scope, and fails closed too', () => {
    // Phase 12. Systemhälsa reads the same project-owned tables through its own
    // loader, so it carries the same obligation: resolve the allow-list first,
    // hand it to every project read, and answer null — which the page turns into
    // a redirect — rather than reading globally.
    expect(SYSTEM_HEALTH).toMatch(/resolveProjectAccess\(\)/)
    expect(SYSTEM_HEALTH).toMatch(/if \(!access\.ok\) return null/)
    expect(SYSTEM_HEALTH.indexOf("from('projects')")).toBeGreaterThan(SYSTEM_HEALTH.indexOf('resolveProjectAccess()'))
    expect(SYSTEM_HEALTH).toMatch(/scopeProjectFilter\(access\.allowedProjectIds\)/)
    expect(SYSTEM_HEALTH).not.toMatch(/allowedProjectIds\[0\]/)
  })

  it('the caller fails closed rather than rendering an empty dashboard', () => {
    expect(SYSTEM_CODE).toMatch(/if \(!access\.ok\) redirect\(/)
    expect(SYSTEM_CODE).not.toMatch(/access\.ok\s*\?\s*[^:]+:\s*\[\]/)
  })

  it('no arbitrary first-project fallback anywhere in either surface', () => {
    for (const src of [SYSTEM_CODE, RELEASES_CODE, DATA_CODE]) {
      expect(src).not.toMatch(/allowedProjectIds\[0\]/)
      expect(src).not.toMatch(/projects\[0\]\.id/)
    }
  })

  it('no global fallback: the snapshot never reaches applyProjectScope with undefined', () => {
    // applyProjectScope(q, undefined) is the sanctioned "no scope" path for
    // legacy callers. It must not appear here.
    expect(DATA_CODE).not.toMatch(/applyProjectScope\([^)]*undefined/)
  })
})

// ═══ The scoped reader stays read-only ═══════════════════════════════════════

describe('9A · the scoped store reader is a SELECT and nothing else', () => {
  it('writes nothing', () => {
    const code = codeOnly(STORE)
    const fn = code.slice(code.indexOf('export async function listInstancesForProjects'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/)
  })

  it('applies the project scope before any narrowing filter', () => {
    const code = codeOnly(STORE)
    const fn = code.slice(code.indexOf('export async function listInstancesForProjects'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body.indexOf(".in('project_id'")).toBeGreaterThan(-1)
    expect(body.indexOf(".in('project_id'")).toBeLessThan(body.indexOf(".eq('def_key'"))
  })
})
