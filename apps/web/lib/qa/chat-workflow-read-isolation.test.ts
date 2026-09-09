/**
 * Phase 9X.2 — Atlas chat tool read isolation.
 *
 * `list_workflows` read the `workflows` table through the SERVICE-ROLE client with
 * no project scope, and the formatter handed the result straight back: workflow
 * id, name, description, project name, step count and the input-variable names
 * parsed out of every step template. Any authenticated chat user therefore saw
 * every tenant's workflow metadata.
 *
 * It was a plain omission rather than a design choice — `allowedProjectIds` has
 * always been a parameter of `executeTool`, and every sibling that touches a
 * project-owned row already guards: `trigger_workflow`, `get_run_status`,
 * `ask_manager`, `save_workflow`. Only the list read was missed, and it survived
 * the first closure audit because a sliding-window scan bled into the neighbouring
 * guard and reported it as scoped.
 *
 * This is a TENANT-ISOLATION class, deliberately not the platform-authority class
 * Phase 9X closed: listing workflows is an ordinary project-scoped capability, so
 * it must NOT require operator status. The tests below assert both halves —
 * foreign rows are invisible, and an ordinary non-operator can still list their
 * own.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

const A_USER = 'user-a', A_EMAIL = 'a@example.test', A_PROJECT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const B_USER = 'user-b', B_EMAIL = 'b@example.test', B_PROJECT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const OPERATOR = 'ops@omnira.test'

let CURRENT_USER: { id: string; email: string } | null = null
let TOOL_RESULTS: any[] = []
let TOOL_NAME = 'list_workflows'
let TOOL_INPUT: Record<string, unknown> = {}
/** Every filter the workflows query received, in call order. */
let WORKFLOW_OPS: [string, string, unknown][] = []

const WORKFLOWS = [
  { id: 'A1', project_id: A_PROJECT, name: 'Alpha One',  description: 'owned one',   steps: [{ input_template: 'x {{a_var}}', output_key: 'k1' }], created_at: '2026-01-01', projects: { name: 'Project A', slug: 'proj-a' } },
  { id: 'A2', project_id: A_PROJECT, name: 'Alpha Two',  description: 'owned two',   steps: [{ input_template: 'y {{a_two}}', output_key: 'k2' }], created_at: '2026-02-01', projects: { name: 'Project A', slug: 'proj-a' } },
  // Foreign, and NEWER — so ordering alone would surface them first.
  { id: 'B1', project_id: B_PROJECT, name: 'SECRET-Beta One', description: 'foreign one', steps: [{ input_template: 'z {{b_secret}}', output_key: 'k3' }], created_at: '2026-09-01', projects: { name: 'Project B', slug: 'proj-b' } },
  { id: 'B2', project_id: B_PROJECT, name: 'SECRET-Beta Two', description: 'foreign two', steps: [{ input_template: 'w {{b_other}}', output_key: 'k4' }], created_at: '2026-09-02', projects: { name: 'Project B', slug: 'proj-b' } },
]
const PROJECTS = [
  { id: A_PROJECT, owner_id: A_USER, name: 'Project A', slug: 'proj-a' },
  { id: B_PROJECT, owner_id: B_USER, name: 'Project B', slug: 'proj-b' },
]
const get = (r: any, p: string): unknown => p.split('.').reduce((a: any, k) => (a == null ? a : a[k]), r)

/** Service-role double: returns EVERYTHING unless the query filters it. */
function makeDb() {
  const from = (table: string) => {
    let rows: any[] = table === 'workflows' ? [...WORKFLOWS] : table === 'projects' ? [...PROJECTS] : []
    const rec = (op: string, c: string, v: unknown) => { if (table === 'workflows') WORKFLOW_OPS.push([op, c, v]) }
    const q: any = {
      select: () => q, insert: () => q, update: () => q,
      eq: (c: string, v: unknown) => { rec('eq', c, v); rows = rows.filter(r => get(r, c) === v); return q },
      in: (c: string, v: unknown[]) => { rec('in', c, v); rows = rows.filter(r => v.includes(get(r, c) as never)); return q },
      gte: () => q, not: () => q, limit: (n: number) => { rec('limit', String(n), n); rows = rows.slice(0, n); return q },
      order: (c: string, o?: { ascending?: boolean }) => {
        rec('order', c, o?.ascending !== false)
        const dir = o?.ascending === false ? -1 : 1
        rows = [...rows].sort((a, b) => (String(get(a, c)) < String(get(b, c)) ? -1 : 1) * dir)
        return q
      },
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (ok: any, e?: any) => Promise.resolve({ data: rows, error: null }).then(ok, e),
    }
    return q
  }
  return { from, rpc: async () => ({ data: null, error: null }) } as any
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/cost/governed-spend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cost/governed-spend')>()
  return { ...actual, withGovernedSpend: async (_i: unknown, run: () => Promise<unknown>) => run() }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: CURRENT_USER } }) }, from: () => makeDb().from('x') }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeDb() }))

let streamCall = 0
vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = {
      stream: (args: any) => {
        streamCall += 1
        const turn = streamCall
        if (turn > 1) for (const m of args.messages ?? []) {
          const c = (m as any).content
          if (Array.isArray(c)) for (const b of c) if (b?.type === 'tool_result') TOOL_RESULTS.push(b.content)
        }
        const h: Record<string, (d: any) => void> = {}
        return {
          on(e: string, cb: (d: any) => void) { h[e] = cb; return this },
          async finalMessage() {
            if (turn === 1) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: TOOL_NAME, input: TOOL_INPUT }] }
            h.text?.('Klart.'); return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Klart.' }] }
          },
        }
      },
    }
  }
  return { default: FakeAnthropic }
})

async function ask(name = 'list_workflows', input: Record<string, unknown> = {}) {
  TOOL_NAME = name; TOOL_INPUT = input
  streamCall = 0; TOOL_RESULTS = []; WORKFLOW_OPS = []
  vi.resetModules()
  const { POST } = await import('@/app/api/chat/route')
  const res: any = await POST(new Request('http://localhost/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'lista mina workflows' }] }),
  }) as any)
  if (res?.body) await new Response(res.body).text()
  await new Promise(r => setTimeout(r, 30))
  const raw = JSON.stringify(TOOL_RESULTS)
  let rows: any[] = []
  try { for (const r of TOOL_RESULTS) { const p = typeof r === 'string' ? JSON.parse(r) : r; if (Array.isArray(p)) rows = p } } catch { /* non-array result */ }
  return { res, raw, rows }
}

beforeEach(() => {
  CURRENT_USER = { id: A_USER, email: A_EMAIL }
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR   // A and B are NOT operators
  ;(globalThis as any).fetch = async () => ({ ok: true, status: 200, json: async () => ({}) })
})
afterEach(() => { delete process.env.PLATFORM_OPERATOR_EMAILS })

describe('9X.2 · list_workflows — a chat user sees only their own projects', () => {
  it('MIXED TENANT: user A receives A1 and A2 only', async () => {
    const { rows } = await ask()
    expect(rows.map(r => r.id).sort()).toEqual(['A1', 'A2'])
  })

  it('no foreign metadata leaks in any form — name, description or project', async () => {
    const { raw } = await ask()
    for (const leak of ['SECRET-Beta', 'foreign one', 'foreign two', 'Project B', 'proj-b', 'b_secret', 'b_other', 'B1', 'B2']) {
      expect(raw, `foreign metadata leaked: ${leak}`).not.toContain(leak)
    }
  })

  it('DISPLACEMENT: the foreign rows are NEWER, so ordering alone would surface them first', async () => {
    const { rows } = await ask()
    // B1/B2 sort ahead of A1/A2 under created_at DESC; they are absent regardless.
    expect(rows.map(r => r.id)).not.toContain('B1')
    expect(rows[0]?.id).toBe('A2')   // newest OWNED row leads
  })

  it('the scope is applied BEFORE the ordering', async () => {
    await ask()
    const i = (p: (o: [string, string, unknown]) => boolean) => WORKFLOW_OPS.findIndex(p)
    const scopeAt = i(o => o[0] === 'in' && o[1] === 'project_id')
    const orderAt = i(o => o[0] === 'order')
    expect(scopeAt, 'no project scope was applied to the workflows query').toBeGreaterThanOrEqual(0)
    expect(scopeAt).toBeLessThan(orderAt)
  })

  it('the scope filters on project_id, the canonical NOT NULL ownership field', async () => {
    await ask()
    const scope = WORKFLOW_OPS.find(o => o[0] === 'in' && o[1] === 'project_id')
    expect(scope?.[2]).toEqual([A_PROJECT])
  })

  it('SECOND ACCOUNT: user B receives B1 and B2 only — isolation runs both ways', async () => {
    CURRENT_USER = { id: B_USER, email: B_EMAIL }
    const { rows, raw } = await ask()
    expect(rows.map(r => r.id).sort()).toEqual(['B1', 'B2'])
    for (const leak of ['Alpha One', 'Alpha Two', 'owned one', 'Project A', 'proj-a', 'a_var']) {
      expect(raw).not.toContain(leak)
    }
  })

  it('an operator owning nothing sees nothing — operator status is not a bypass here', async () => {
    CURRENT_USER = { id: 'user-ops', email: OPERATOR }
    const { rows } = await ask()
    expect(rows).toEqual([])
  })

  it('EMPTY SCOPE fails closed with the impossible id, never an unscoped query', async () => {
    CURRENT_USER = { id: 'user-nobody', email: 'nobody@example.test' }
    const { rows } = await ask()
    expect(rows).toEqual([])
    const scope = WORKFLOW_OPS.find(o => o[0] === 'in' && o[1] === 'project_id')
    expect(scope?.[2]).toEqual([IMPOSSIBLE_PROJECT_ID])
  })

  it('the owned path still returns real content — the guard is not a blanket empty', async () => {
    const { rows } = await ask()
    const a1 = rows.find(r => r.id === 'A1')
    expect(a1).toMatchObject({ name: 'Alpha One', description: 'owned one', project: 'Project A' })
    expect(a1.input_variables).toContain('a_var')
  })

  it('the formatter performs no second, unscoped lookup', async () => {
    await ask()
    // Exactly one workflows query ran, and it carried the scope.
    const scopes = WORKFLOW_OPS.filter(o => o[0] === 'in' && o[1] === 'project_id')
    expect(scopes).toHaveLength(1)
    expect(WORKFLOW_OPS.filter(o => o[0] === 'order')).toHaveLength(1)
  })
})

describe('9X.2 · listing workflows is NOT an operator capability', () => {
  it('an ordinary NON-operator can list their own workflows', async () => {
    CURRENT_USER = { id: A_USER, email: A_EMAIL }   // not in PLATFORM_OPERATOR_EMAILS
    const { rows, raw } = await ask()
    expect(raw).not.toContain('platform_operator_required')
    expect(rows.map(r => r.id).sort()).toEqual(['A1', 'A2'])
  })

  it('the handler does not consult the operator gate at all', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(process.cwd(), 'app/api/chat/route.ts'), 'utf8').split('\n')
    const starts: { n: string; s: number; e: number }[] = []
    src.forEach((l, i) => { const m = l.match(/if \(name === '([a-z_0-9]+)'\)/); if (m) starts.push({ n: m[1], s: i, e: src.length }) })
    starts.forEach((h, i) => { if (starts[i + 1]) h.e = starts[i + 1].s })
    const lw = starts.find(h => h.n === 'list_workflows')!
    const body = src.slice(lw.s, lw.e).join('\n')
    expect(body).not.toContain('resolvePlatformOperator')
    expect(body, 'the scope must be present').toContain('allowedProjectIds')
  })
})

// ═══ Structural invariant — the mirror of Phase 9X's escalation guard ════════
//
// Phase 9X pinned that every chat handler escalating with CRON_SECRET gates first.
// This is the read-side twin, and it exists because `list_workflows` is exactly the
// shape that slipped past a whole closure audit: a service-role read of a
// project-owned table with the scope simply missing. A per-handler invariant
// catches the next one automatically.
//
// Boundaries are computed from the dispatch markers themselves, never a fixed
// window — the earlier false "already scoped" verdict came from a 50-line window
// bleeding into the neighbouring guard.

describe('9X.2 · every chat handler reading a project-owned table is bounded', () => {
  /** Tables whose rows belong to a project (owner-rooted RLS in production). */
  const PROJECT_OWNED = [
    'workflows', 'runs', 'agents', 'media_scripts', 'media_news_items',
    'approvals', 'outputs', 'manager_tasks', 'platform_memory', 'leads', 'revenue_events',
  ]
  /** Handlers with a DIFFERENT proven authority model, named one by one. */
  const OTHER_MODEL: Record<string, string> = {
    // Phase 9X: platform-global by design, gated on operator capability instead.
    run_media_step: 'resolvePlatformOperator',
  }

  it('scopes by allowed projects, or carries a named different authority model', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(process.cwd(), 'app/api/chat/route.ts'), 'utf8').split('\n')
    const hs: { n: string; s: number; e: number }[] = []
    src.forEach((l, i) => { const m = l.match(/if \(name === '([a-z_0-9]+)'\)/); if (m) hs.push({ n: m[1], s: i, e: src.length }) })
    hs.forEach((h, i) => { if (hs[i + 1]) h.e = hs[i + 1].s })
    expect(hs.length, 'no tool handlers found — the invariant would be vacuous').toBeGreaterThan(5)

    const offenders: string[] = []
    for (const h of hs) {
      const body = src.slice(h.s, h.e).join('\n')
      const code = body.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
      const reads = PROJECT_OWNED.filter(t => code.includes(`.from('${t}')`))
      if (reads.length === 0) continue
      const scoped = /allowedProjectIds|assertProjectAllowed|scopeToProjects|scopeProjectFilter/.test(code)
      const excused = OTHER_MODEL[h.n] && code.includes(OTHER_MODEL[h.n])
      if (!scoped && !excused) offenders.push(`${h.n} reads ${reads.join(',')} with no project scope`)
    }
    expect(offenders, 'a chat tool handler reads a project-owned table unbounded').toEqual([])
  })

  it('the excused handler really does carry its named model — the excuse is not a loophole', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(process.cwd(), 'app/api/chat/route.ts'), 'utf8').split('\n')
    const hs: { n: string; s: number; e: number }[] = []
    src.forEach((l, i) => { const m = l.match(/if \(name === '([a-z_0-9]+)'\)/); if (m) hs.push({ n: m[1], s: i, e: src.length }) })
    hs.forEach((h, i) => { if (hs[i + 1]) h.e = hs[i + 1].s })
    const rms = hs.find(h => h.n === 'run_media_step')
    expect(rms, 'run_media_step must still exist for the excuse to be meaningful').toBeDefined()
    expect(src.slice(rms!.s, rms!.e).join('\n')).toContain('resolvePlatformOperator()')
  })
})
