/**
 * Manager + Approvals project isolation (Phase 9L).
 *
 * Both pages read project-owned data through the SERVICE-ROLE client, which
 * bypasses RLS, and neither re-applied the boundary. What makes these two
 * different from the surfaces already repaired is that they compute
 * AGGREGATES: a pending-approval count and a month-to-date cost. A scoped list
 * beside a global count still reports another operator's work as this one's, so
 * the scope has to land before the arithmetic, not after it.
 *
 * TWO NULLABLE COLUMNS DECIDE THE SHAPE OF THIS FIX.
 *
 *   `approvals.project_id` is nullable and 12 of 13 live rows leave it null.
 *   Filtering on that column alone would empty the review queue rather than
 *   isolate it. The repository had already settled what such a row means: the
 *   approval DECISION route resolves `project_id ?? runs.project_id` before it
 *   will act, and the operations graph includes null-project rows only when
 *   their run resolves to an allowed project, dropping them otherwise. Scoping
 *   through `runs!inner(project_id)` is that same rule written as a query, and
 *   it returns all 13 rows for their owner and none for anyone else.
 *
 *   `agent_messages.project_id` is nullable too — but those rows carry no
 *   run_id either, so there is nothing to resolve them through. They are
 *   dropped. That is a real reduction and the correct one: a message whose
 *   project cannot be established must not appear on every operator's page.
 *
 * The conversation on the Manager page is USER-owned and is NOT touched. A page
 * may hold two ownership dimensions; conflating them would weaken both.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scopeProjectFilter, IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const MANAGER = read('app/(platform)/manager/page.tsx')
const APPROVALS = read('app/(platform)/approvals/page.tsx')
const MANAGER_LIB = read('lib/ai/manager.ts')
const MANAGER_API = read('app/api/manager/route.ts')

const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const MANAGER_CODE = codeOnly(MANAGER)
const APPROVALS_CODE = codeOnly(APPROVALS)
const LIB_CODE = codeOnly(MANAGER_LIB)
const API_CODE = codeOnly(MANAGER_API)

/** Guarded slice — an unguarded indexOf pair yields '' and passes every negative. */
function between(src: string, start: string, end: string): string {
  const from = src.indexOf(start)
  expect(from, `start marker not found: ${start}`).toBeGreaterThan(-1)
  const to = src.indexOf(end, from + start.length)
  expect(to, `end marker not found after start: ${end}`).toBeGreaterThan(from)
  return src.slice(from, to)
}

// ── A fake builder that APPLIES filters, including embedded paths ────────────
function get(row: any, path: string): unknown {
  return path.split('.').reduce((acc: any, k) => (acc == null ? acc : acc[k]), row)
}
interface Seen { table: string; filters: [string, unknown][] }

function fakeDb(tables: Record<string, any[]>) {
  const seen: Seen[] = []
  const from = (table: string) => {
    const rec: Seen = { table, filters: [] }
    seen.push(rec)
    let rows = [...(tables[table] ?? [])]
    let head = false
    const q: any = {
      select: (_c?: string, o?: { head?: boolean }) => { if (o?.head) head = true; return q },
      eq: (c: string, v: unknown) => { rec.filters.push([c, v]); rows = rows.filter(r => get(r, c) === v); return q },
      in: (c: string, v: unknown[]) => { rec.filters.push([c, v]); rows = rows.filter(r => v.includes(get(r, c) as never)); return q },
      or: () => q, gte: () => q, not: () => q, order: () => q,
      limit: (n: number) => { rows = rows.slice(0, n); return q },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
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
const ME = 'user-me'

// A foreign row in every table, each carrying a marker so a leak is unambiguous.
const AGENTS = [
  { id: 'a-mine', project_id: MINE, name: 'Mine', model: 'm' },
  { id: 'a-theirs', project_id: THEIRS, name: 'SECRET-AGENT', model: 'm' },
]
const RUNS = [
  { id: 'r-mine', project_id: MINE, status: 'done', projects: { name: 'Mine' } },
  { id: 'r-theirs', project_id: THEIRS, status: 'failed', projects: { name: 'SECRET-PROJECT' } },
]
const APPROVALS_ROWS = [
  // The realistic shape: project_id null, resolvable only through the run.
  { id: 'ap-mine', project_id: null, status: 'pending', output_key: 'k1', content: 'mine', runs: { project_id: MINE } },
  { id: 'ap-theirs', project_id: null, status: 'pending', output_key: 'k2', content: 'SECRET-CONTENT', runs: { project_id: THEIRS } },
]
const RUN_LOGS = [
  { tokens_in: 10, tokens_out: 5, runs: { project_id: MINE } },
  { tokens_in: 9990, tokens_out: 9990, runs: { project_id: THEIRS } },
]
const TASKS = [
  { id: 't-mine', project_id: MINE, status: 'pending' },
  { id: 't-theirs', project_id: THEIRS, status: 'pending' },
  { id: 't-null', project_id: null, status: 'pending' },
]
const MESSAGES = [
  { id: 'm-mine', project_id: MINE, content: 'mine' },
  { id: 'm-theirs', project_id: THEIRS, content: 'SECRET-MESSAGE' },
  { id: 'm-null', project_id: null, content: 'unresolvable' },
]
const CONVERSATIONS = [
  { id: 'c-mine', user_id: ME, conversation_messages: [] },
  { id: 'c-theirs', user_id: 'user-other', conversation_messages: [] },
]

const seed = () => fakeDb({
  agents: AGENTS, runs: RUNS, approvals: APPROVALS_ROWS,
  run_logs: RUN_LOGS, manager_tasks: TASKS, agent_messages: MESSAGES,
  conversations: CONVERSATIONS,
})

// The reads, exactly as the pages/helpers perform them.
const q = {
  agents: (db: any, a: string[]) => db.from('agents').select('*').in('project_id', scopeProjectFilter(a)),
  runs: (db: any, a: string[]) => db.from('runs').select('*').in('project_id', scopeProjectFilter(a)).gte().order().limit(50),
  approvalCount: (db: any, a: string[]) => db.from('approvals').select('id', { count: 'exact', head: true }).in('runs.project_id', scopeProjectFilter(a)).eq('status', 'pending'),
  approvalRows: (db: any, a: string[]) => db.from('approvals').select('*').in('runs.project_id', scopeProjectFilter(a)).order().limit(50),
  runLogs: (db: any, a: string[]) => db.from('run_logs').select('*').in('runs.project_id', scopeProjectFilter(a)).gte().not(),
  tasks: (db: any, a: string[]) => db.from('manager_tasks').select('*').in('project_id', scopeProjectFilter(a)).in('status', ['pending', 'in_progress']).or().order().limit(20),
  messages: (db: any, a: string[]) => db.from('agent_messages').select('*').in('project_id', scopeProjectFilter(a)).order().limit(10),
  conversation: (db: any, uid: string) => db.from('conversations').select('*').eq('user_id', uid).order().limit(1).maybeSingle(),
}

// ═══ Manager · rows ══════════════════════════════════════════════════════════

describe('9L · manager — every project-owned source is scoped', () => {
  it('an owned agent appears; a foreign agent does not', async () => {
    const { db } = seed()
    const rows = (await q.agents(db, [MINE])).data
    expect(rows.map((r: any) => r.id)).toEqual(['a-mine'])
    expect(JSON.stringify(rows)).not.toContain('SECRET-AGENT')
  })

  it('an owned run appears; a foreign run and its project name do not', async () => {
    const { db } = seed()
    const rows = (await q.runs(db, [MINE])).data
    expect(rows.map((r: any) => r.id)).toEqual(['r-mine'])
    expect(JSON.stringify(rows)).not.toContain('SECRET-PROJECT')
  })

  it('an owned manager task appears; foreign AND null-project tasks do not', async () => {
    const { db } = seed()
    const rows = (await q.tasks(db, [MINE])).data
    expect(rows.map((r: any) => r.id)).toEqual(['t-mine'])
  })

  it('an owned agent message appears; foreign AND unresolvable ones do not', async () => {
    // agent_messages has no run to resolve a null project through, so those
    // rows are dropped rather than shown globally.
    const { db } = seed()
    const rows = (await q.messages(db, [MINE])).data
    expect(rows.map((r: any) => r.id)).toEqual(['m-mine'])
    expect(JSON.stringify(rows)).not.toContain('SECRET-MESSAGE')
  })

  it('foreign run_logs are excluded — they are scoped through the parent run', async () => {
    const { db } = seed()
    const rows = (await q.runLogs(db, [MINE])).data
    expect(rows).toHaveLength(1)
    expect(rows[0].tokens_in).toBe(10)
  })
})

// ═══ Manager · aggregates ════════════════════════════════════════════════════

describe('9L · manager — aggregates are scoped BEFORE they are computed', () => {
  it('a foreign pending approval cannot inflate the count', async () => {
    const { db } = seed()
    const { count } = await q.approvalCount(db, [MINE])
    expect(count).toBe(1)          // 2 would mean the foreign approval was counted
  })

  it('foreign token usage cannot inflate the cost total', async () => {
    // The foreign log carries ~2000x the tokens; if the scope landed after the
    // arithmetic, the total would be dominated by another project's spend.
    const { db } = seed()
    const rows = (await q.runLogs(db, [MINE])).data
    const total = rows.reduce((n: number, l: any) => n + (l.tokens_in ?? 0) + (l.tokens_out ?? 0), 0)
    expect(total).toBe(15)         // not 19,995
  })

  it('an EMPTY allow-list yields empty rows and zero aggregates', async () => {
    const { db, seen } = seed()
    expect((await q.agents(db, [])).data).toEqual([])
    expect((await q.runs(db, [])).data).toEqual([])
    expect((await q.approvalCount(db, [])).count).toBe(0)
    expect((await q.runLogs(db, [])).data).toEqual([])
    expect((await q.tasks(db, [])).data).toEqual([])
    expect((await q.messages(db, [])).data).toEqual([])
    for (const s of seen) {
      expect(
        s.filters.some(([, v]) => Array.isArray(v) && (v as string[]).includes(IMPOSSIBLE_PROJECT_ID)),
        `${s.table} did not issue the impossible id`,
      ).toBe(true)
    }
  })
})

// ═══ Manager · the user dimension is not replaced ════════════════════════════

describe('9L · manager — the conversation stays USER-owned', () => {
  it('the conversation query still uses user_id, not project scope', () => {
    const conv = between(MANAGER_CODE, "from('conversations')", 'as unknown as Promise')
    expect(conv).toMatch(/\.eq\('user_id', user\.id\)/)
    expect(conv).not.toMatch(/scopeProjectFilter|\.in\('project_id'/)
  })

  it("a foreign user's conversation is still excluded behaviourally", async () => {
    const { db } = seed()
    const { data } = await q.conversation(db, ME)
    expect(data?.id).toBe('c-mine')
  })
})

// ═══ Manager · source contract, statement-bounded ════════════════════════════

describe('9L · manager — every query carries its own scope clause', () => {
  const SOURCES = ['supabase\n      .from(', 'db\n      .from(', 'manager.get']
  const statement = (anchor: string, end: string) => between(MANAGER_CODE, anchor, end)

  it('projects, agents and runs each carry a scope clause', () => {
    expect(statement("from('projects')", "from('agents')")).toMatch(/\.in\('id', scopedIds\)/)
    expect(statement("from('agents')", "from('runs')")).toMatch(/\.in\('project_id', scopedIds\)/)
    expect(statement("from('runs')", "from('approvals')")).toMatch(/\.in\('project_id', scopedIds\)/)
  })

  it('approvals and run_logs are scoped through the parent run', () => {
    expect(statement("from('approvals')", "from('run_logs')")).toMatch(/runs!inner\(project_id\)[\s\S]*\.in\('runs\.project_id', scopedIds\)/)
    expect(statement("from('run_logs')", 'manager.getActiveTasks')).toMatch(/runs!inner\(project_id[\s\S]*\.in\('runs\.project_id', scopedIds\)/)
  })

  it('both manager helpers receive the scope', () => {
    expect(MANAGER_CODE).toMatch(/manager\.getActiveTasks\(scopedIds\)/)
    expect(MANAGER_CODE).toMatch(/manager\.getRecentMessages\(scopedIds, 10\)/)
  })

  it('scope comes from the canonical boundary, with no fallback', () => {
    expect(MANAGER_CODE).toMatch(/getAllowedProjectIds\(db, user\.id\)/)
    expect(MANAGER_CODE).toMatch(/scopeProjectFilter\(allowedProjectIds\)/)
    expect(MANAGER_CODE).not.toMatch(/allowedProjectIds\[0\]|projects\[0\]/)
  })
})

// ═══ Approvals page ══════════════════════════════════════════════════════════

describe('9L · approvals page', () => {
  it('an owned approval appears', async () => {
    const { db } = seed()
    const rows = (await q.approvalRows(db, [MINE])).data
    expect(rows.map((r: any) => r.id)).toEqual(['ap-mine'])
  })

  it('a foreign approval is excluded — content never reaches the page', async () => {
    const { db } = seed()
    const rows = (await q.approvalRows(db, [MINE])).data
    expect(JSON.stringify(rows)).not.toContain('SECRET-CONTENT')
  })

  it('a NULL-project approval is resolved through its run, not dropped', async () => {
    // Both fixtures carry project_id: null. The owned one must still appear —
    // scoping on approvals.project_id alone would have emptied the queue.
    const { db } = seed()
    const rows = (await q.approvalRows(db, [MINE])).data
    expect(rows).toHaveLength(1)
    expect(rows[0].project_id).toBeNull()
    expect(rows[0].id).toBe('ap-mine')
  })

  it('an EMPTY scope fails closed', async () => {
    const { db, seen } = seed()
    expect((await q.approvalRows(db, [])).data).toEqual([])
    expect(seen[0].filters).toContainEqual(['runs.project_id', [IMPOSSIBLE_PROJECT_ID]])
  })

  it('the page scopes through the run and uses the canonical boundary', () => {
    const stmt = between(APPROVALS_CODE, "from('approvals')", '.order(')
    expect(stmt).toMatch(/runs!inner\(project_id\)/)
    expect(stmt).toMatch(/\.in\('runs\.project_id', scopeProjectFilter\(allowedProjectIds\)\)/)
    expect(APPROVALS_CODE).toMatch(/getAllowedProjectIds\(db, user\.id\)/)
    expect(APPROVALS_CODE).not.toMatch(/allowedProjectIds\[0\]/)
  })

  it('the authorization embed does not change what is rendered', () => {
    // ApprovalCard's contract is `runs: null`; the embed exists only to scope.
    expect(APPROVALS_CODE).toMatch(/runs: null/)
  })
})

// ═══ Shared helpers — scope is required, both callers pass it ════════════════

describe('9L · the manager helpers cannot be called unscoped', () => {
  it('getActiveTasks requires an allow-list and applies it', () => {
    const sig = between(LIB_CODE, 'async getActiveTasks(', '): Promise<ManagerTask[]>')
    expect(sig).toMatch(/scopedProjectIds: string\[\]/)
    expect(sig).not.toMatch(/scopedProjectIds\?:/)
    expect(sig).not.toMatch(/scopedProjectIds[^,)]*=\s*\[\]/)
    const body = between(LIB_CODE, 'async getActiveTasks(', '\n  }')
    expect(body).toMatch(/\.in\('project_id', scopedProjectIds\)/)
  })

  it('getRecentMessages requires an allow-list FIRST, so it cannot be defaulted away', () => {
    const sig = between(LIB_CODE, 'async getRecentMessages(', '): Promise<unknown\\[\\]>'.replace(/\\/g, ''))
    expect(sig).toMatch(/scopedProjectIds: string\[\]/)
    expect(sig).not.toMatch(/scopedProjectIds[^,)]*=\s*\[\]/)
    const body = between(LIB_CODE, 'async getRecentMessages(', '\n  }')
    expect(body).toMatch(/\.in\('project_id', scopedProjectIds\)/)
  })

  it('the OTHER caller was updated too — the leak was closed, not moved', () => {
    expect(API_CODE).toMatch(/manager\.getActiveTasks\(scopedProjectIds\)/)
    expect(API_CODE).toMatch(/manager\.getRecentMessages\(scopedProjectIds, 20\)/)
    expect(API_CODE).toMatch(/scopeProjectFilter\(await getAllowedProjectIds\(adminDb, user\.id\)\)/)
  })

  it('a narrowing projectId cannot reach outside the scope', async () => {
    // getActiveTasks(scoped, projectId) applies BOTH; the optional narrowing
    // filters within the allow-list rather than replacing it.
    const { db } = seed()
    const rows = (await db.from('manager_tasks').select('*')
      .in('project_id', scopeProjectFilter([MINE]))
      .eq('project_id', THEIRS)).data
    expect(rows).toEqual([])
  })
})
