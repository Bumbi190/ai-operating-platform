/**
 * Marketing decision ledger — the `approvals` insert contract.
 *
 * `POST /api/marketing/approvals` records each operator decision on a draft as
 * an `approvals` row with `kind = 'marketing_draft'`. The foundation migration
 * built the table for exactly that: it added the columns, widened the status
 * CHECK, and indexes `(project_id, status) where kind = 'marketing_draft'`.
 *
 * WHAT WAS WRONG. The insert also named `note`, a column `approvals` has never
 * had. PostgREST rejects the whole insert when a single key is unknown — proven
 * read-only against production: selecting the insert's column set succeeds,
 * adding `note` fails with 42703 — and the call never looked at the result. So
 * every marketing decision since June silently skipped its ledger row.
 * Production held 0 `marketing_draft` rows beside two real decisions.
 *
 * THE FIX IS SUBTRACTIVE. The same value was already written to
 * `reviewer_notes`, so dropping `note` loses nothing and needs no migration.
 * The result is now checked and a failure reported, without changing the
 * response: the draft status is the queue's source of truth and has already
 * moved.
 *
 * WHY THIS IS SAFE ONCE ROWS EXIST. A ledger row has no run. Every decision
 * surface that could act on it joins `runs!inner` or refuses a run-less row, so
 * restoring the ledger cannot make a marketing decision re-decidable anywhere
 * else. Those properties are pinned here too, because they are the reason the
 * fix is only a data-contract repair.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WEB_ROOT = resolve(__dirname, '../..')
const REPO_ROOT = resolve(WEB_ROOT, '../..')
const read = (rel: string) => readFileSync(resolve(WEB_ROOT, rel), 'utf8')
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

const ROUTE = read('app/api/marketing/approvals/route.ts')

// ── The canonical contract, read from its sources ────────────────────────────

/** Column names of `approvals` Insert, from the generated database types. */
function canonicalInsertColumns(): Set<string> {
  const types = read('lib/supabase/database.types.ts')
  const table = types.indexOf('      approvals: {')
  const insert = types.indexOf('Insert: {', table)
  const end = types.indexOf('}', insert)
  const block = types.slice(insert + 'Insert: {'.length, end)
  return new Set([...block.matchAll(/^\s*([a-z_]+)\??:/gm)].map((m) => m[1]))
}

/** The CHECK lists the foundation migration put on `approvals`. */
function migrationChecks(): { status: string[]; action: string[] } {
  const sql = readFileSync(
    resolve(REPO_ROOT, 'supabase/migrations/20260603_marketing_engine_foundation.sql'), 'utf8')
  const list = (re: RegExp) => [...(sql.match(re)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  return {
    action: list(/add column if not exists action\s+text\s+check \(action in \(([^)]*)\)\)/),
    status: list(/approvals_status_check\s+check \(status in \(([^)]*)\)\)/),
  }
}

/** The keys of the ledger insert, as written in the route. */
function routeInsertKeys(): string[] {
  const code = codeOnly(ROUTE)
  const start = code.indexOf("adb.from('approvals').insert({")
  const end = code.indexOf('})', start)
  return [...code.slice(start, end).matchAll(/^\s*([a-z_]+)(?::|,)/gm)].map((m) => m[1])
}

const COLUMNS = canonicalInsertColumns()
const CHECKS = migrationChecks()

// ── A fake admin client that refuses what PostgREST refuses ──────────────────

const USER = { id: 'user-me', email: 'operator@example.test' }
const MINE = '11111111-1111-1111-1111-111111111111'
const THEIRS = '22222222-2222-2222-2222-222222222222'

interface Call { table: string; op: string; payload?: any; filters: string[] }

function fakeAdmin(opts: { draftProject?: string; guardVerdict?: string; ledgerFails?: boolean } = {}) {
  const calls: Call[] = []
  const draft = {
    id: 'draft-1', project_id: opts.draftProject ?? MINE, brief_id: 'brief-1',
    draft_key: 'fs-2026-10-ig-01', status: 'guard_passed', draft_payload: { caption_rendered: 'x' },
  }
  const guard = { id: 'guard-1', verdict: opts.guardVerdict ?? 'passed', score_breakdown: {}, violations: [] }

  const from = (table: string) => {
    const call: Call = { table, op: 'select', filters: [] }
    calls.push(call)
    const q: any = {
      select: () => q,
      eq: (c: string, v: string) => { call.filters.push(`${c}=${v}`); return q },
      maybeSingle: async () => ({
        data: table === 'draft_posts' ? draft : table === 'guard_reports' ? guard : null, error: null,
      }),
      update: (payload: any) => { call.op = 'update'; call.payload = payload; return q },
      insert: (payload: any) => {
        call.op = 'insert'; call.payload = payload
        if (table !== 'approvals') return Promise.resolve({ data: null, error: null })
        if (opts.ledgerFails) return Promise.resolve({ data: null, error: { code: '57014', message: 'canceling statement' } })
        const unknown = Object.keys(payload).find((k) => !COLUMNS.has(k))
        if (unknown) {
          return Promise.resolve({ data: null, error: {
            code: 'PGRST204', message: `Could not find the '${unknown}' column of 'approvals' in the schema cache` } })
        }
        if (!CHECKS.status.includes(payload.status) || (payload.action != null && !CHECKS.action.includes(payload.action))) {
          return Promise.resolve({ data: null, error: { code: '23514', message: 'violates check constraint' } })
        }
        if (payload.content == null || payload.output_key == null) {
          return Promise.resolve({ data: null, error: { code: '23502', message: 'not-null violation' } })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok),
    }
    return q
  }
  return { db: { from }, calls }
}

let CURRENT: ReturnType<typeof fakeAdmin>
let CURRENT_USER: typeof USER | null = USER

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: CURRENT_USER } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => CURRENT.db }))
vi.mock('@/lib/atlas/isolation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/atlas/isolation')>()),
  getAllowedProjectIds: async () => [MINE],
}))

async function post(body: Record<string, unknown>) {
  vi.resetModules()
  const { POST } = await import('@/app/api/marketing/approvals/route')
  const res = await POST(new Request('http://omnira.test/api/marketing/approvals', {
    method: 'POST', body: JSON.stringify(body),
  }))
  return { res, json: await res.json() }
}

const ledger = () => CURRENT.calls.filter((c) => c.table === 'approvals' && c.op === 'insert')

beforeEach(() => {
  CURRENT_USER = USER
  CURRENT = fakeAdmin()
})

// ─────────────────────────────────────────────────────────────────────────────
// 1 · The contract
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing decision ledger · the insert names only real columns', () => {
  it('the canonical contract was actually read', () => {
    expect(COLUMNS.has('reviewer_notes')).toBe(true)
    expect(COLUMNS.has('draft_id')).toBe(true)
    expect(CHECKS.status).toEqual(['pending', 'approved', 'rejected', 'revised', 'returned', 'needs_input'])
    expect(CHECKS.action).toEqual(['approve', 'approve_with_fix', 'reject', 'return_to_drafter'])
  })

  it('approvals has no note column — the key the insert used to carry', () => {
    expect(COLUMNS.has('note')).toBe(false)
  })

  it('every key the route inserts is an approvals column', () => {
    const keys = routeInsertKeys()
    expect(keys.length).toBeGreaterThan(8)
    expect(keys.filter((k) => !COLUMNS.has(k))).toEqual([])
    expect(keys).not.toContain('note')
    expect(keys).toContain('reviewer_notes')
  })

  it('every status and action the route writes is allowed by the CHECKs', () => {
    const pairs = [...codeOnly(ROUTE).matchAll(/logDecision\('([a-z_]+)', '([a-z_]+)'/g)].map((m) => [m[1], m[2]])
    expect(pairs).toHaveLength(4)
    for (const [status, action] of pairs) {
      expect(CHECKS.status, status).toContain(status)
      expect(CHECKS.action, action).toContain(action)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Each decision now lands in the ledger
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing decision ledger · each decision is recorded', () => {
  it('reject records the note in reviewer_notes', async () => {
    const { res, json } = await post({ draft_id: 'draft-1', action: 'reject', note: 'Fel ton för oktober' })
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, status: 'rejected' })
    expect(ledger()).toHaveLength(1)
    expect(ledger()[0].payload).toMatchObject({
      kind: 'marketing_draft', project_id: MINE, draft_id: 'draft-1', guard_report_id: 'guard-1',
      output_key: 'marketing_draft', content: 'fs-2026-10-ig-01', status: 'rejected', action: 'reject',
      operator: 'operator@example.test', reviewer_notes: 'Fel ton för oktober',
    })
    expect(ledger()[0].payload.decided_at).toEqual(expect.any(String))
    expect(ledger()[0].payload).not.toHaveProperty('note')
    expect(ledger()[0].payload).not.toHaveProperty('run_id')
  })

  it('approve records an approval with no notes', async () => {
    const { json } = await post({ draft_id: 'draft-1', action: 'approve' })
    expect(json).toMatchObject({ ok: true, status: 'approved' })
    expect(ledger()[0].payload).toMatchObject({ status: 'approved', action: 'approve', reviewer_notes: null })
  })

  it('return records the note and still queues the drafter run', async () => {
    const { json } = await post({ draft_id: 'draft-1', action: 'return', note: 'Ny vinkel' })
    expect(json).toMatchObject({ ok: true, status: 'returned', requeued: true })
    expect(ledger()[0].payload).toMatchObject({ status: 'returned', action: 'return_to_drafter', reviewer_notes: 'Ny vinkel' })
    expect(CURRENT.calls.some((c) => c.table === 'runs' && c.op === 'insert')).toBe(true)
  })

  it('edit records the fix patch', async () => {
    const { json } = await post({ draft_id: 'draft-1', action: 'edit', caption_rendered: 'Ny text' })
    expect(json).toMatchObject({ ok: true, status: 'drafted', revalidating: true })
    expect(ledger()[0].payload).toMatchObject({
      status: 'revised', action: 'approve_with_fix', fix_patch: { caption_rendered: 'Ny text', landing_url: null },
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3 · A failed ledger write is reported, never silent — and never fails the decision
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing decision ledger · a failed ledger write is visible', () => {
  it('is reported with its code and leaves the response unchanged', async () => {
    CURRENT = fakeAdmin({ ledgerFails: true })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { res, json } = await post({ draft_id: 'draft-1', action: 'reject', note: 'x' })
      expect(res.status).toBe(200)
      expect(json).toMatchObject({ ok: true, status: 'rejected' })
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('decision not recorded in the approvals ledger'), '57014', 'canceling statement')
    } finally {
      spy.mockRestore()
    }
  })

  it('a successful write reports nothing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await post({ draft_id: 'draft-1', action: 'approve' })
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Nothing about who may decide changed
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing decision ledger · authority is unchanged', () => {
  it('an unauthenticated request writes nothing', async () => {
    CURRENT_USER = null
    const { res } = await post({ draft_id: 'draft-1', action: 'reject' })
    expect(res.status).toBe(401)
    expect(CURRENT.calls).toEqual([])
  })

  it('a foreign draft is a 404 with no draft update and no ledger row', async () => {
    CURRENT = fakeAdmin({ draftProject: THEIRS })
    const { res } = await post({ draft_id: 'draft-1', action: 'reject', note: 'x' })
    expect(res.status).toBe(404)
    expect(ledger()).toEqual([])
    expect(CURRENT.calls.some((c) => c.table === 'draft_posts' && c.op === 'update')).toBe(false)
  })

  it('a guard refusal still blocks approval before any write', async () => {
    CURRENT = fakeAdmin({ guardVerdict: 'rejected' })
    const { res } = await post({ draft_id: 'draft-1', action: 'approve' })
    expect(res.status).toBe(409)
    expect(ledger()).toEqual([])
    expect(CURRENT.calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('the route still writes through the existing tables only', () => {
    const tables = [...codeOnly(ROUTE).matchAll(/from\('([a-z_]+)'\)/g)].map((m) => m[1])
    expect(new Set(tables)).toEqual(new Set(['draft_posts', 'guard_reports', 'approvals', 'runs']))
    expect(codeOnly(ROUTE)).not.toMatch(/rpc\(|\.delete\(|\.upsert\(/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Why restoring the ledger cannot make a decision re-decidable elsewhere
// ─────────────────────────────────────────────────────────────────────────────

describe('marketing decision ledger · a ledger row is never decidable outside its route', () => {
  it('the generic approval decision route refuses a run-less approval before any mutation', () => {
    const code = codeOnly(read('app/api/approvals/[id]/route.ts'))
    const guard = code.indexOf('if (!existing.run_id)')
    const rpc = code.indexOf("rpc('resolve_approval'")
    expect(guard).toBeGreaterThan(-1)
    expect(rpc).toBeGreaterThan(guard)
  })

  it('the decision queues and lists reach approvals only through their run', () => {
    for (const [file, marker] of [
      ['lib/os/review-queue.ts', 'runs!inner ('],
      ['lib/os/activity.ts', 'runs!inner(id, projects!inner('],
      ['app/api/approvals/route.ts', 'runs!inner ('],
    ] as const) {
      expect(read(file), file).toContain(marker)
    }
  })
})
