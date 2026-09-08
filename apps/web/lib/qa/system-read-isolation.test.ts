/**
 * /system read isolation (Phase 9B).
 *
 * Phase 9A scoped `fetchDashboardSnapshot`. Four service-role readers on the
 * SAME page were left global, so /system still leaked:
 *
 *   fetchActiveExecution   runs ×2, run_logs, agents
 *   fetchMemorySnapshot    memories ×2
 *   fetchPublishPipeline   media_scripts
 *   fetchAgentScorecards   agents, runs, run_logs
 *
 * Two failure shapes matter here and neither raises an error, which is why
 * these tests are behavioural rather than source-matching:
 *
 *  1. ORDER. `fetchActiveExecution` takes `.limit(1)` of the newest run. Scope
 *     applied AFTER that limit would return null whenever a foreign run
 *     happened to be newer — leaking the existence of foreign activity through
 *     an empty panel. The scope has to be inside the query.
 *
 *  2. AGGREGATION. A scorecard is only as isolated as its weakest input.
 *     Scoped agents joined against global logs still lets a foreign project's
 *     steps inflate an owned agent's tokens, success rate and last-active
 *     time. Filtering has to happen before grouping, not after.
 *
 * `run_logs` has no project_id at all — its only link is `run_id NOT NULL
 * REFERENCES runs(id)` — so its scope travels through the parent run.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  fetchActiveExecution,
  fetchMemorySnapshot,
  fetchPublishPipeline,
} from '@/lib/os/data'
import { fetchAgentScorecards } from '@/lib/os/scoring'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const DATA = read('lib/os/data.ts')
const SCORING = read('lib/os/scoring.ts')
const SYSTEM = read('app/(platform)/system/page.tsx')

const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const DATA_CODE = codeOnly(DATA)
const SCORING_CODE = codeOnly(SCORING)
const SYSTEM_CODE = codeOnly(SYSTEM)

// ── A fake PostgREST builder that APPLIES filters ────────────────────────────

/**
 * Chainable, thenable, and it actually filters. A recorder would only prove a
 * clause was written; a filter proves the clause excludes the row it exists to
 * exclude, which is the property under test.
 *
 * Dotted paths resolve through embedded rows, so `runs.project_id` behaves the
 * way PostgREST's `!inner` does. That equivalence was checked directly against
 * the live database: an impossible project id returns zero rows there.
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
      select: (_c?: string, o?: { head?: boolean }) => { if (o?.head) head = true; return q },
      in: (col: string, vals: unknown[]) => {
        rec.filters.push([col, vals])
        rows = rows.filter(r => vals.includes(get(r, col) as never))
        return q
      },
      eq: (col: string, val: unknown) => { rows = rows.filter(r => get(r, col) === val); return q },
      gte: () => q,
      not: () => q,
      order: () => q,
      limit: (n: number) => { rows = rows.slice(0, n); return q },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (ok: any, err?: any) =>
        Promise.resolve(head ? { data: null, count: rows.length, error: null }
                             : { data: rows, count: rows.length, error: null }).then(ok, err),
    }
    return q
  }
  return { db: { from } as any, seen }
}

const MINE = 'p-mine'
const THEIRS = 'p-theirs'

// ═══ fetchActiveExecution ════════════════════════════════════════════════════

describe('9B · active execution', () => {
  const AGENT_MINE = 'ag-mine'
  const AGENT_THEIRS = 'ag-theirs'

  const run = (id: string, project_id: string, status: string, created_at: string) => ({
    id, project_id, status, created_at, workflow_id: 'w1',
    workflows: { id: 'w1', project_id, name: 'WF', steps: [
      { order: 1, name: 'Step', agent_id: AGENT_MINE },
      { order: 2, name: 'Other', agent_id: AGENT_THEIRS },
    ] },
    projects: { id: project_id, name: project_id, slug: project_id, color: '#fff' },
  })

  const seed = () => fakeDb({
    // The FOREIGN run is the newest. Scope applied after `.limit(1)` would
    // pick it and then discard it, producing a null execution panel.
    runs: [
      run('r-theirs', THEIRS, 'running', '2026-09-08T10:00:00Z'),
      run('r-mine', MINE, 'running', '2026-09-08T09:00:00Z'),
    ],
    run_logs: [
      { id: 'l1', run_id: 'r-mine', step_order: 1, role: 'assistant', content: 'x', created_at: '2026-09-08T09:01:00Z' },
      { id: 'l2', run_id: 'r-theirs', step_order: 1, role: 'assistant', content: 'secret', created_at: '2026-09-08T10:01:00Z' },
    ],
    agents: [
      { id: AGENT_MINE, project_id: MINE, name: 'Mine' },
      { id: AGENT_THEIRS, project_id: THEIRS, name: 'Theirs' },
    ],
  })

  it('includes the operator’s own run', async () => {
    const { db } = seed()
    const exec = await fetchActiveExecution(db, [MINE])
    expect(exec?.run.id).toBe('r-mine')
  })

  it('a NEWER foreign run never wins the limit(1) — scope is inside the query', async () => {
    const { db } = seed()
    const exec = await fetchActiveExecution(db, [MINE])
    expect(exec).not.toBeNull()
    expect(exec!.run.project_id).toBe(MINE)
    expect(exec!.run.id).not.toBe('r-theirs')
  })

  it('foreign run_logs are excluded — they belong to a run that was never selected', async () => {
    const { db } = seed()
    const exec = await fetchActiveExecution(db, [MINE])
    expect(exec!.logs.map((l: any) => l.id)).toEqual(['l1'])
    expect(JSON.stringify(exec!.logs)).not.toContain('secret')
  })

  it('a foreign agent named by a workflow step is NOT hydrated', async () => {
    // `workflows.steps` is JSONB the engine wrote, not a foreign key — nothing
    // stops a step naming an agent in another project.
    const { db } = seed()
    const exec = await fetchActiveExecution(db, [MINE])
    expect(Object.keys(exec!.agentsById)).toEqual([AGENT_MINE])
    expect(exec!.agentsById[AGENT_THEIRS]).toBeUndefined()
  })

  it('an EMPTY scope returns no execution at all, never a foreign one', async () => {
    const { db, seen } = seed()
    const exec = await fetchActiveExecution(db, [])
    expect(exec).toBeNull()
    expect(seen[0].filters).toContainEqual(['project_id', [IMPOSSIBLE_PROJECT_ID]])
  })

  it('the fallback query is scoped too, not just the running one', async () => {
    // No running run anywhere → the fallback path is taken. It must not reach
    // the foreign row either.
    const { db } = fakeDb({
      runs: [run('r-theirs', THEIRS, 'done', '2026-09-08T10:00:00Z')],
      run_logs: [], agents: [],
    })
    expect(await fetchActiveExecution(db, [MINE])).toBeNull()
  })
})

// ═══ fetchMemorySnapshot ═════════════════════════════════════════════════════

describe('9B · memory snapshot', () => {
  const seed = () => fakeDb({
    memories: [
      { id: 'm-mine', project_id: MINE, key: 'k1', value: 'v', source: 'atlas', updated_at: '2026-09-08' },
      { id: 'm-theirs', project_id: THEIRS, key: 'k2', value: 'secret', source: 'other', updated_at: '2026-09-09' },
    ],
  })

  it('includes the operator’s own memory', async () => {
    const { db } = seed()
    const snap = await fetchMemorySnapshot(db, [MINE])
    expect(snap.recent.map((m: any) => m.id)).toEqual(['m-mine'])
  })

  it('foreign-project memory is excluded from rows, total AND bySource', async () => {
    const { db } = seed()
    const snap = await fetchMemorySnapshot(db, [MINE])
    expect(JSON.stringify(snap)).not.toContain('secret')
    expect(snap.total).toBe(1)
    expect(snap.bySource).toEqual({ atlas: 1 })
  })

  it('an EMPTY scope excludes all project data', async () => {
    const { db, seen } = seed()
    const snap = await fetchMemorySnapshot(db, [])
    expect(snap.recent).toEqual([])
    expect(snap.total).toBe(0)
    for (const q of seen) {
      expect(q.filters).toContainEqual(['project_id', [IMPOSSIBLE_PROJECT_ID]])
    }
  })
})

// ═══ fetchPublishPipeline ════════════════════════════════════════════════════

describe('9B · publish pipeline', () => {
  const seed = () => fakeDb({
    media_scripts: [
      { id: 'ms-mine', project_id: MINE, hook: 'mine', generated_at: '2026-09-08' },
      { id: 'ms-theirs', project_id: THEIRS, hook: 'secret', generated_at: '2026-09-09' },
    ],
  })

  it('includes the operator’s own media row', async () => {
    const { db } = seed()
    expect((await fetchPublishPipeline(db, [MINE])).map(r => r.id)).toEqual(['ms-mine'])
  })

  it('a foreign-project media row is excluded', async () => {
    const { db } = seed()
    const rows = await fetchPublishPipeline(db, [MINE])
    expect(rows.map(r => r.project_id)).not.toContain(THEIRS)
    expect(JSON.stringify(rows)).not.toContain('secret')
  })

  it('an EMPTY scope fails closed', async () => {
    const { db, seen } = seed()
    expect(await fetchPublishPipeline(db, [])).toEqual([])
    expect(seen[0].filters).toContainEqual(['project_id', [IMPOSSIBLE_PROJECT_ID]])
  })
})

// ═══ fetchAgentScorecards ════════════════════════════════════════════════════

describe('9B · agent scorecards — aggregates are scoped BEFORE they are computed', () => {
  // One owned agent. Logs attach to it by `step_name === agent.name`, so a
  // foreign project's log with the same step name would be attributed to it
  // unless the log itself is scoped.
  const log = (id: string, run_id: string, project_id: string, tokens: number) => ({
    id, run_id, step_order: 1, step_name: 'Writer', role: 'assistant', content: '',
    tokens_in: tokens, tokens_out: 0, duration_ms: 100, created_at: '2026-09-08T00:00:00Z',
    runs: { project_id },
  })

  const seed = () => fakeDb({
    agents: [
      { id: 'a-mine', project_id: MINE, name: 'Writer', model: 'm', skill_ids: [], created_at: 'x' },
      { id: 'a-theirs', project_id: THEIRS, name: 'Ghost', model: 'm', skill_ids: [], created_at: 'x' },
    ],
    run_logs: [
      log('l-mine', 'r-mine', MINE, 10),
      log('l-theirs', 'r-theirs', THEIRS, 990),
    ],
    runs: [
      { id: 'r-mine', status: 'done', workflow_id: 'w', project_id: MINE },
      { id: 'r-theirs', status: 'failed', workflow_id: 'w', project_id: THEIRS },
    ],
  })

  it('includes the operator’s own agent', async () => {
    const { db } = seed()
    const cards = await fetchAgentScorecards(db, [MINE])
    expect(cards.map(c => c.agent.id)).toEqual(['a-mine'])
  })

  it('a foreign agent never gets a scorecard', async () => {
    const { db } = seed()
    const cards = await fetchAgentScorecards(db, [MINE])
    expect(cards.find(c => c.agent.id === 'a-theirs')).toBeUndefined()
  })

  it('foreign LOGS cannot inflate an owned agent’s totals', async () => {
    const { db } = seed()
    const [card] = await fetchAgentScorecards(db, [MINE])
    // 10 from the owned log only. 1000 would mean the foreign log was counted
    // through the shared step_name.
    expect(card.tokens).toBe(10)
    expect(card.steps).toBe(1)
  })

  it('foreign RUNS cannot affect an owned agent’s success rate', async () => {
    const { db } = seed()
    const [card] = await fetchAgentScorecards(db, [MINE])
    // Only the owned run (done) is in scope → 100%. Including the foreign
    // failed run would give 50%.
    expect(card.runs).toBe(1)
    expect(card.successRate).toBe(100)
  })

  it('averages are computed only over scoped rows', async () => {
    const { db } = fakeDb({
      agents: [{ id: 'a-mine', project_id: MINE, name: 'Writer', model: 'm', skill_ids: [], created_at: 'x' }],
      run_logs: [
        { ...log('l1', 'r-mine', MINE, 0), duration_ms: 100 },
        { ...log('l2', 'r-theirs', THEIRS, 0), duration_ms: 9000 },
      ],
      runs: [{ id: 'r-mine', status: 'done', workflow_id: 'w', project_id: MINE }],
    })
    const [card] = await fetchAgentScorecards(db, [MINE])
    expect(card.avgDurationMs).toBe(100)   // not 4550
  })

  it('an EMPTY scope yields no scorecards and issues the impossible id everywhere', async () => {
    const { db, seen } = seed()
    expect(await fetchAgentScorecards(db, [])).toEqual([])
    for (const q of seen) {
      expect(q.filters.length, `${q.table} issued no scope clause`).toBeGreaterThan(0)
      expect(
        q.filters.some(([, vals]) => (vals as string[]).includes(IMPOSSIBLE_PROJECT_ID)),
        `${q.table} was not scoped to the impossible id`,
      ).toBe(true)
    }
  })

  it('agentIds NARROWS an already-scoped set — it cannot reach outside it', async () => {
    const { db } = seed()
    const cards = await fetchAgentScorecards(db, [MINE], { agentIds: ['a-theirs'] })
    expect(cards).toEqual([])
  })

  it('run_logs are scoped through the parent run, since they have no project_id', () => {
    const stmt = SCORING_CODE.slice(SCORING_CODE.indexOf("from('run_logs')"))
    const bounded = stmt.slice(0, stmt.indexOf("from('runs')"))
    expect(bounded).toMatch(/runs!inner\(project_id\)/)
    expect(bounded).toMatch(/\.in\('runs\.project_id', scopedIds\)/)
  })
})

// ═══ Source contract — every reader, every query ═════════════════════════════

describe('9B · every /system reader query carries a scope clause', () => {
  /** Statement-bounded: the body is cut at the start of the NEXT query, so a
   *  clause belonging to a neighbour can never satisfy this one. A fixed-width
   *  window did exactly that in Phase 8B and passed on unscoped code. */
  const slice = (src: string, startMarker: string, endMarker: string) => {
    const from = src.indexOf(startMarker)
    const to = src.indexOf(endMarker)
    // A marker that is not found returns -1, and `slice(x, -1)` silently runs
    // to the end of the file — which is how this very helper first reported a
    // neighbouring function's queries as its own. Both bounds are asserted.
    expect(from, `start marker not found: ${startMarker}`).toBeGreaterThan(-1)
    expect(to, `end marker not found: ${endMarker}`).toBeGreaterThan(from)
    return src.slice(from, to)
  }

  const queriesIn = (src: string, fnName: string, endMarker: string) => {
    const body = slice(src, `export async function ${fnName}`, endMarker)
    return body.split(/(?=\(?(?:admin|supabase)\.from\()/).filter(s => s.includes('.from('))
  }

  const SCOPE_RE = /\.in\('(?:project_id|runs\.project_id)', scopedIds\)|\.in\('project_id', scopeProjectFilter\(/

  it('fetchActiveExecution — both run queries and the agent query', () => {
    const qs = queriesIn(DATA_CODE, 'fetchActiveExecution', 'async function hydrateExecution')
    expect(qs.length).toBe(2)
    for (const q of qs) expect(SCOPE_RE.test(q), q.slice(0, 80)).toBe(true)

    const hydrate = DATA_CODE.slice(
      DATA_CODE.indexOf('async function hydrateExecution'),
      DATA_CODE.indexOf('export interface MemorySnapshot'),
    )
    const agentQ = hydrate.slice(hydrate.indexOf("from('agents')"))
    expect(agentQ).toMatch(/\.in\('project_id', scopedIds\)/)
    // run_logs is scoped transitively by run id, which only holds because the
    // run itself was scoped before `.limit(1)`.
    expect(hydrate).toMatch(/from\('run_logs'\)[\s\S]{0,300}\.eq\('run_id', run\.id\)/)
  })

  it('fetchMemorySnapshot — both memory queries', () => {
    const qs = queriesIn(DATA_CODE, 'fetchMemorySnapshot', 'export async function fetchPublishPipeline')
    expect(qs.length).toBe(2)
    for (const q of qs) expect(SCOPE_RE.test(q), q.slice(0, 80)).toBe(true)
  })

  it('fetchPublishPipeline — the media query', () => {
    const qs = queriesIn(DATA_CODE, 'fetchPublishPipeline', 'export function classifyRunStatus')
    expect(qs.length).toBe(1)
    expect(SCOPE_RE.test(qs[0])).toBe(true)
  })

  it('fetchAgentScorecards — agents (both branches), logs and runs', () => {
    const body = SCORING_CODE.slice(
      SCORING_CODE.indexOf('export async function fetchAgentScorecards'),
      SCORING_CODE.indexOf('const agents: Agent[]'),
    )
    const qs = body.split(/(?=\(admin\.from\()/).filter(s => s.includes('.from('))
    expect(qs.length).toBe(4)   // agents ×2 branches, run_logs, runs
    for (const q of qs) expect(SCOPE_RE.test(q), q.slice(0, 80)).toBe(true)
  })

  it('every reader takes a REQUIRED allow-list — none is optional or defaulted', () => {
    for (const [src, fn, end] of [
      [DATA_CODE, 'fetchActiveExecution', '): Promise<ActiveExecution | null>'],
      [DATA_CODE, 'fetchMemorySnapshot', '): Promise<MemorySnapshot>'],
      [DATA_CODE, 'fetchPublishPipeline', '): Promise<PublishRow[]>'],
      [SCORING_CODE, 'fetchAgentScorecards', '): Promise<AgentScorecard[]>'],
    ] as const) {
      const sigFrom = src.indexOf(`export async function ${fn}`)
      const sigTo = src.indexOf(end)
      expect(sigFrom, `${fn} not found`).toBeGreaterThan(-1)
      expect(sigTo, `${fn} signature end not found: ${end}`).toBeGreaterThan(sigFrom)
      const sig = src.slice(sigFrom, sigTo)
      expect(sig, `${fn} must require a scope`).toMatch(/allowedProjectIds: string\[\]/)
      expect(sig, `${fn} scope must not be optional`).not.toMatch(/allowedProjectIds\?:/)
      expect(sig, `${fn} scope must not be defaulted`).not.toMatch(/allowedProjectIds[^,)]*=\s*\[\]/)
    }
  })

  it('no reader derives a scope of its own', () => {
    // None of them has a session. If one could resolve a scope itself, a
    // caller could omit one and still get data back.
    for (const [src, fn, end] of [
      [DATA_CODE, 'fetchActiveExecution', 'export interface MemorySnapshot'],
      [DATA_CODE, 'fetchMemorySnapshot', 'export async function fetchPublishPipeline'],
      [DATA_CODE, 'fetchPublishPipeline', 'export function classifyRunStatus'],
      [SCORING_CODE, 'fetchAgentScorecards', 'export function scorecardToSnapshot'],
    ] as const) {
      const from = src.indexOf(`export async function ${fn}`)
      const to = src.indexOf(end)
      expect(from, `${fn} not found`).toBeGreaterThan(-1)
      expect(to, `${fn} end marker not found: ${end}`).toBeGreaterThan(from)
      expect(src.slice(from, to), fn).not.toMatch(/getAllowedProjectIds|auth\.getUser|resolveProjectAccess/)
    }
  })
})

// ═══ The /system caller ══════════════════════════════════════════════════════

describe('9B · /system passes canonical scope to every project-owned reader', () => {
  const READERS = [
    'fetchDashboardSnapshot(supabase, db, access.allowedProjectIds)',
    'fetchActiveExecution(db, access.allowedProjectIds)',
    'fetchMemorySnapshot(db, access.allowedProjectIds)',
    'fetchPublishPipeline(db, access.allowedProjectIds)',
    'fetchAgentScorecards(db, access.allowedProjectIds)',
  ]

  it('all five readers receive the same resolved allow-list', () => {
    for (const call of READERS) expect(SYSTEM_CODE, call).toContain(call)
  })

  it('no project-owned reader is invoked with a bare client', () => {
    // `getPlatformConfig(db)` is the sole legitimate single-argument call: it
    // reads the platform_config singleton, which has no project dimension.
    const bare = [...SYSTEM_CODE.matchAll(/\b(fetch[A-Z]\w+)\(db\)/g)].map(m => m[1])
    expect(bare).toEqual([])
    expect(SYSTEM_CODE).toContain('getPlatformConfig(db)')
  })

  it('scope is resolved before any reader runs, and failure is explicit', () => {
    const resolveAt = SYSTEM_CODE.indexOf('resolveProjectAccess()')
    expect(resolveAt).toBeGreaterThan(-1)
    for (const call of READERS) {
      expect(SYSTEM_CODE.indexOf(call)).toBeGreaterThan(resolveAt)
    }
    expect(SYSTEM_CODE).toMatch(/if \(!access\.ok\) redirect\(/)
  })

  it('no first-project or global fallback on the page or in either reader module', () => {
    for (const src of [SYSTEM_CODE, DATA_CODE, SCORING_CODE]) {
      expect(src).not.toMatch(/allowedProjectIds\[0\]/)
      expect(src).not.toMatch(/projects\[0\]\.id/)
      expect(src).not.toMatch(/applyProjectScope\([^)]*undefined/)
    }
  })
})
