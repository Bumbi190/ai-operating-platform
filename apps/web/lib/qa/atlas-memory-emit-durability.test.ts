/**
 * Atlas Memory Slice 2A — emit durability.
 *
 * Production recorded 2 of 11 article reviews, each 90–114 s late: the routes
 * called `void recordMemoryEvent(...)`, and a detached promise does not survive a
 * serverless request. This file pins the fix on every EXISTING write path:
 *
 *   • every emit is awaited — proven statically (no detached call can remain) and
 *     behaviourally (the fake wrapper answers on a later timer tick, so the event
 *     is only stored if the route waited for it);
 *   • sourceId and project scope are required, and malformed input is refused
 *     before any write; no product emitter can create world memory;
 *   • article reviews keep source 'approval', so consolidation weighs them exactly as
 *     before (the trust CASE is read from the shipped SQL function, not assumed); their
 *     provenance rides in `structured.producer`, which consolidation never reads; and
 *     the reviewer's email no longer enters the memory payload;
 *   • the two drain branches that used to skip memory now emit their terminal
 *     outcome, under the same canonical model as every other drain outcome;
 *   • retries resolve to one event, and a memory failure never fails the action.
 *
 * The REAL recordMemoryEvent runs throughout (ATLAS_MEMORY=1). Only the database,
 * the session and the non-memory collaborators are faked. The fake wrapper mirrors
 * the two database rules that matter here — the (source, source_id, event_type)
 * unique index and the project-scope CHECK — which are proven against real
 * Postgres in atlas-memory-emit-idempotency-sql.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// ── Harness state (reset per test) ───────────────────────────────────────────

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const APPROVAL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ARTICLE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const RUN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const ACTION_RUN_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const REVIEWER_EMAIL = 'reviewer.person@example.com'
const CRON = 'cron-secret-under-test'

/** One row of atlas.memory_events as the fake wrapper stores it. */
interface StoredEvent {
  id: string
  scope: unknown
  event_type: unknown
  source: unknown
  source_id: unknown
  project_id: unknown
  dedupe_key: unknown
  content: unknown
  subject: unknown
  structured: Record<string, unknown>
}

let mockUser: { id: string; email?: string } | null
let ownedProjectIds: string[]
let approvalRow: Record<string, unknown> | null
let contentRow: Record<string, unknown> | null
let contentUpdates: Record<string, unknown>[]
let claimQueue: Record<string, unknown>[]
let runsTable: Map<string, Record<string, unknown>>
let resolveVerdict: string
let rpcCalls: string[]
let memoryEvents: StoredEvent[]
let wrapperCalls: number
let wrapperFault: 'none' | 'error' | 'throw'
let finalizationVerdict: 'CONTINUE_FINALIZATION' | 'CANCELLED' | 'FENCED'
let terminalizeResult: 'CANCELLED' | 'FENCED' | 'ERROR'
let runnerError: string | null
/** Makes the drain's read of a run row throw (a transport failure, not a PostgREST error). */
let runsReadThrows: boolean
/** Every lifecycle write the drain attempted through fencedRunUpdate. */
let lifecycleWrites: Record<string, unknown>[]
/** What the mocked action executor makes of a run: the durable status it writes, and what it returns. */
let actionPlan: { status: string; actionOutcome: string | null; lastError?: string; result: Record<string, unknown> }

/**
 * The wrapper answers on a LATER timer tick. A caller that awaits sees the event
 * stored; a caller that detached the promise returns before it lands.
 */
const WRAPPER_LATENCY_MS = 25

async function atlasRecordEvent(p: Record<string, unknown>) {
  wrapperCalls++
  await new Promise((r) => setTimeout(r, WRAPPER_LATENCY_MS))
  if (wrapperFault === 'throw') throw new Error('connection reset by peer')
  if (wrapperFault === 'error') return { data: null, error: { message: 'wrapper unavailable' } }
  // memory_events_project_scope: (scope = 'project') = (project_id is not null)
  if ((p.p_scope === 'project') !== (p.p_project_id != null)) {
    return { data: null, error: { message: 'violates check constraint "memory_events_project_scope"' } }
  }
  // memory_events_idem: unique (source, source_id, event_type) where source_id is not null
  const duplicate = p.p_source_id != null && memoryEvents.some(
    (e) => e.source === p.p_source && e.source_id === p.p_source_id && e.event_type === p.p_event_type,
  )
  if (duplicate) return { data: null, error: null }
  const id = `evt-${memoryEvents.length + 1}`
  memoryEvents.push({
    id, scope: p.p_scope, event_type: p.p_event_type, source: p.p_source, source_id: p.p_source_id,
    project_id: p.p_project_id, dedupe_key: p.p_dedupe_key, content: p.p_content, subject: p.p_subject,
    structured: (p.p_structured ?? {}) as Record<string, unknown>,
  })
  return { data: id, error: null }
}

// ── Fake Supabase admin client ───────────────────────────────────────────────

class QueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  private mode: 'select' | 'update' | 'insert' | null = null
  private filters: Record<string, unknown> = {}
  private payload: Record<string, unknown> | null = null
  constructor(private readonly table: string) {}

  select() { if (this.mode === null) this.mode = 'select'; return this }
  update(v: Record<string, unknown>) { this.mode = 'update'; this.payload = v; return this }
  insert(v: Record<string, unknown>) { this.mode = 'insert'; this.payload = v; return this }
  eq(col: string, val: unknown) { this.filters[col] = val; return this }
  in() { return this }
  lt() { return this }
  order() { return this }
  limit() { return this }

  private result(): { data: unknown; error: unknown } {
    switch (this.table) {
      case 'projects':
        return { data: ownedProjectIds.map((id) => ({ id })), error: null }
      case 'approvals':
        return { data: approvalRow, error: null }
      case 'website_content':
        if (this.mode === 'update') { contentUpdates.push(this.payload ?? {}); return { data: null, error: null } }
        return { data: contentRow, error: null }
      case 'runs': {
        if (runsReadThrows) throw new Error('fetch failed: socket hang up')
        const row = runsTable.get(String(this.filters.id)) ?? null
        return { data: row, error: null }
      }
      case 'workflows':
        return { data: { steps: [] }, error: null }
      case 'run_logs':
        return { data: null, error: null }
      default:
        throw new Error(`unexpected table: ${this.table}`)
    }
  }

  async single() { return this.result() }
  async maybeSingle() { return this.result() }
  then<R1 = { data: unknown; error: unknown }, R2 = never>(
    onfulfilled?: ((v: { data: unknown; error: unknown }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected)
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => new QueryBuilder(table),
    rpc: async (name: string, params: Record<string, unknown>) => {
      rpcCalls.push(name)
      if (name === 'atlas_record_event') return atlasRecordEvent(params)
      if (name === 'claim_runs') { const out = claimQueue; claimQueue = []; return { data: out, error: null } }
      if (name === 'resolve_approval') return { data: resolveVerdict, error: null }
      return { data: null, error: null }
    },
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) },
  }),
}))

// Non-memory collaborators of the three routes.
vi.mock('@/lib/ai/memory/feedback-store', () => ({ saveFeedback: async () => ({ id: 'fb-1' }) }))
vi.mock('@/lib/article/approval', () => ({
  ARTICLE_APPROVAL_KIND: 'article_publish',
  publishApprovedArticle: async () => ({ ok: true }),
}))
vi.mock('@/lib/publishing/publish', () => ({
  publishArticle: async () => ({
    ok: true, id: 'cms-1', external_id: 'x-1', slug: 's', status: 'published',
    published_at: '2026-09-11T00:00:00.000Z', published_url: 'https://example.test/a', operation: 'created',
  }),
}))
vi.mock('@/lib/ai/workflow-runner', () => ({
  runSteps: async () => { if (runnerError) throw new Error(runnerError) },
}))
vi.mock('@/lib/ai/workflow-executor', () => ({ executeRunSteps: async () => ({}) }))
vi.mock('@/lib/ai/checkpoint', () => ({ computeCheckpoint: async () => ({ startFromOrder: 0, existingContext: {} }) }))
vi.mock('@/lib/ai/fencing', () => ({
  fencedRunUpdate: async (_db: unknown, _id: string, _claim: unknown, patch: Record<string, unknown>) => {
    lifecycleWrites.push(patch)
    return { fenced: false }
  },
  isFencedError: () => false,
}))
vi.mock('@/lib/ai/cancel', () => ({ isCancelledError: () => false }))
vi.mock('@/lib/marketing/workflows', () => ({ MARKETING_HANDLERS: {}, isMarketingRun: () => false }))
vi.mock('@/lib/email/brevo', () => ({ sendAdminNotification: async () => {} }))
vi.mock('@/lib/email/templates', () => ({ getApprovalPendingEmail: () => ({ subject: '', html: '' }) }))
vi.mock('@/lib/governance/run-execution-checkpoint', () => ({
  checkpointClaimedRun: async () => ({ allowed: true, detail: 'owned' }),
  settleRefusal: async () => 'STOPPED',
  terminalizeCancelledRun: async () => terminalizeResult,
  recordDispatchUnknown: async () => 'UNKNOWN_WRITTEN',
  isRunCheckpointRefusal: () => false,
  isRunLifecycleWriteError: () => false,
  checkOwnedFinalization: async () => finalizationVerdict,
  finalizeOwnedRunUnlessCancelled: async () => ({ outcome: 'SUCCEEDED', detail: 'done' }),
}))
vi.mock('@/lib/workflows/action-executor', () => ({
  isWorkflowActionRun: (run: { workflow_instance_id?: string | null }) => run.workflow_instance_id != null,
  executeWorkflowAction: async (_db: unknown, run: { id: string }) => {
    const row = runsTable.get(run.id)
    if (row) {
      row.status = actionPlan.status
      row.action_outcome = actionPlan.actionOutcome
      row.last_error = actionPlan.lastError ?? null
    }
    return actionPlan.result
  },
}))

import { PATCH as approvalsPatch } from '@/app/api/approvals/[id]/route'
import { POST as reviewPost } from '@/app/api/content/articles/[id]/review/route'
import { GET as drainGet } from '@/app/api/runs/drain/route'
import {
  recordMemoryEvent, validateMemoryEventInput, type RecordMemoryEventInput,
} from '@/lib/atlas/memory/record-event'
import { readMemoryFlags } from '@/lib/atlas/memory/flags'

const ENV_KEYS = ['ATLAS_MEMORY', 'ATLAS_MEMORY_RECALL', 'ATLAS_MEMORY_INJECT', 'CRON_SECRET'] as const
const priorEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) priorEnv[k] = process.env[k]
  process.env.ATLAS_MEMORY = '1'
  process.env.CRON_SECRET = CRON
  mockUser = { id: OWNER_ID, email: REVIEWER_EMAIL }
  ownedProjectIds = [PROJECT]
  approvalRow = null
  contentRow = null
  contentUpdates = []
  claimQueue = []
  runsTable = new Map()
  resolveVerdict = 'APPROVED'
  rpcCalls = []
  memoryEvents = []
  wrapperCalls = 0
  wrapperFault = 'none'
  finalizationVerdict = 'CONTINUE_FINALIZATION'
  terminalizeResult = 'CANCELLED'
  runnerError = null
  runsReadThrows = false
  lifecycleWrites = []
  actionPlan = { status: 'done', actionOutcome: 'SUCCEEDED', result: { executed: true, detail: 'observe → pass' } }
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (priorEnv[k] === undefined) delete process.env[k]
    else process.env[k] = priorEnv[k]
  }
  vi.restoreAllMocks()
})

// ── Request builders and fixtures ────────────────────────────────────────────

function approvalRequest(action: string, notes?: string): NextRequest {
  return new NextRequest('http://localhost/api/approvals/x', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, reviewer_notes: notes }),
  })
}
const decideApproval = (action = 'approved', notes?: string) =>
  approvalsPatch(approvalRequest(action, notes), { params: { id: APPROVAL_ID } })

function reviewRequest(action: 'approve' | 'reject', notes?: string): Request {
  return new Request('http://localhost/api/content/articles/x/review', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, notes }),
  })
}
const review = (action: 'approve' | 'reject', notes?: string) =>
  reviewPost(reviewRequest(action, notes), { params: { id: ARTICLE_ID } })

const drain = (query = '') =>
  drainGet(new Request(`http://localhost/api/runs/drain${query}`, { headers: { authorization: `Bearer ${CRON}` } }))

function givenApproval(projectId = PROJECT) {
  approvalRow = { id: APPROVAL_ID, project_id: projectId, output_key: 'article', content: 'body',
                  run_id: RUN_ID, kind: 'generic', runs: null }
}
function givenArticle(projectId = PROJECT) {
  contentRow = { id: ARTICLE_ID, status: 'pending_review', destination_key: 'the-prompt',
                 payload: { title: 't' }, hero_image_url: null, project_id: projectId }
}
function claimLegacyRun(over: Record<string, unknown> = {}) {
  const run = { id: RUN_ID, project_id: PROJECT, status: 'running', claim_id: 'claim-1',
                cancel_requested: false, kind: 'generic', attempts: 1, max_attempts: 3,
                workflow_id: 'wf-1', steps_snapshot: [], input: {}, workflow_instance_id: null, ...over }
  runsTable.set(String(run.id), { ...run })
  claimQueue.push(run)
  return run
}
function claimActionRun(over: Record<string, unknown> = {}) {
  const run = { id: ACTION_RUN_ID, project_id: PROJECT, status: 'running', claim_id: 'claim-2',
                kind: 'workflow.action:observe_release_gate', attempts: 1, max_attempts: 3,
                workflow_instance_id: 'inst-1', action_kind: 'observe_release_gate', ...over }
  runsTable.set(String(run.id), { ...run })
  claimQueue.push(run)
  return run
}
const eventsFor = (sourceId: string) => memoryEvents.filter((e) => e.source_id === sourceId)

// ── Static contracts ─────────────────────────────────────────────────────────

/** Source with comments removed (strings kept), so prose can never satisfy or break a check. */
function codeOnly(src: string): string {
  let out = ''
  let i = 0
  let quote: string | null = null
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (quote) {
      out += c
      if (c === '\\') { out += n ?? ''; i += 2; continue }
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    if (c === '"' || c === "'" || c === '`') quote = c
    out += c
    i++
  }
  return out
}

function productionFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'qa') continue
      out.push(...productionFiles(full))
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const PRODUCTION = [...productionFiles(path.join(WEB_ROOT, 'app')), ...productionFiles(path.join(WEB_ROOT, 'lib'))]
const rel = (f: string) => path.relative(WEB_ROOT, f)
const DEFINITION = 'lib/atlas/memory/record-event.ts'

/** Every call of `name(` in production code, with whether it is directly awaited. */
function callSites(name: string) {
  const sites: { file: string; awaited: boolean; snippet: string }[] = []
  const call = new RegExp(`(^|[^\\w$.])${name}\\(`, 'g')
  for (const file of PRODUCTION) {
    const code = codeOnly(fs.readFileSync(file, 'utf8'))
    for (const m of code.matchAll(call)) {
      const at = (m.index ?? 0) + m[1].length
      const before = code.slice(Math.max(0, at - 40), at)
      if (/function\s+$/.test(before)) continue // the definition itself
      sites.push({ file: rel(file), awaited: /await\s+$/.test(before), snippet: code.slice(at, at + 60) })
    }
  }
  return sites
}

describe('Slice 2A — no memory emit is ever detached', () => {
  it('every recordMemoryEvent call in production code is awaited, at exactly the known sites', () => {
    const sites = callSites('recordMemoryEvent')
    const perFile: Record<string, number> = {}
    for (const s of sites) perFile[s.file] = (perFile[s.file] ?? 0) + 1
    // Pinned inventory: new producers are Slice 2B work and must change this deliberately.
    expect(perFile).toEqual({
      'app/api/approvals/[id]/route.ts': 1,
      'app/api/content/articles/[id]/review/route.ts': 2,
      'app/api/runs/drain/route.ts': 6,
    })
    expect(sites.filter((s) => !s.awaited).map((s) => `${s.file}: ${s.snippet}`)).toEqual([])
  })

  it('the drain helper that emits workflow-action outcomes is itself awaited', () => {
    const sites = callSites('recordActionRunOutcome')
    expect(sites).toHaveLength(1)
    expect(sites[0]).toMatchObject({ file: 'app/api/runs/drain/route.ts', awaited: true })
  })

  it('no `void recordMemoryEvent` (or any detached memory emit) remains in production code', () => {
    const detached = PRODUCTION.filter((f) =>
      /\bvoid\s+(recordMemoryEvent|recordActionRunOutcome)\b|\b(recordMemoryEvent|recordActionRunOutcome)\([^;]*?\)\s*\.then\(/
        .test(codeOnly(fs.readFileSync(f, 'utf8'))))
    expect(detached.map(rel)).toEqual([])
  })

  it('no [atlas-diag] logging remains anywhere in production code', () => {
    const hits = PRODUCTION.filter((f) => fs.readFileSync(f, 'utf8').includes('[atlas-diag]'))
    expect(hits.map(rel)).toEqual([])
  })

  it('every product emitter payload is explicitly project-scoped; none names world or org', () => {
    for (const file of ['app/api/approvals/[id]/route.ts', 'app/api/content/articles/[id]/review/route.ts', 'app/api/runs/drain/route.ts']) {
      const code = codeOnly(fs.readFileSync(path.join(WEB_ROOT, file), 'utf8'))
      const emits = code.split(/recordMemoryEvent\(/).slice(1).map((s) => s.slice(0, 700))
      expect(emits.length, file).toBeGreaterThan(0)
      for (const body of emits) {
        expect(body, file).toMatch(/scope:\s*'project'/)
        expect(body, file).not.toMatch(/scope:\s*'(world|org)'/)
      }
    }
  })
})

// ── The emit API contract ────────────────────────────────────────────────────

describe('Slice 2A — recordMemoryEvent refuses malformed identity before any write', () => {
  const valid: RecordMemoryEventInput = {
    scope: 'project', eventType: 'outcome', content: 'c', source: 'drain', projectId: PROJECT, sourceId: RUN_ID,
  }
  const fakeDb = () => {
    const calls: Record<string, unknown>[] = []
    return { calls, db: { rpc: async (_n: string, p: Record<string, unknown>) => { calls.push(p); return { data: 'id-1', error: null } } } }
  }

  it('a valid project event reaches the wrapper with its exact scope, project and source id', async () => {
    const { db, calls } = fakeDb()
    const r = await recordMemoryEvent(valid, db)
    expect(r).toEqual({ id: 'id-1', deduped: false, skipped: false })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ p_scope: 'project', p_project_id: PROJECT, p_source_id: RUN_ID, p_source: 'drain' })
  })

  it('sourceId is required — a missing one is refused and never becomes an undeduped event', async () => {
    const { db, calls } = fakeDb()
    // @ts-expect-error — sourceId is required at compile time
    const missing: RecordMemoryEventInput = { scope: 'project', eventType: 'outcome', content: 'c', source: 'drain', projectId: PROJECT }
    expect(await recordMemoryEvent(missing, db)).toEqual({ id: null, deduped: false, skipped: false, rejected: 'missing_source_id' })
    expect(await recordMemoryEvent({ ...valid, sourceId: null as unknown as string }, db)).toMatchObject({ rejected: 'missing_source_id' })
    expect(calls).toEqual([])
  })

  it('an empty or whitespace-only sourceId is refused', async () => {
    const { db, calls } = fakeDb()
    for (const sourceId of ['', '   ', '\n\t']) {
      expect(await recordMemoryEvent({ ...valid, sourceId }, db)).toMatchObject({ id: null, rejected: 'missing_source_id' })
    }
    expect(calls).toEqual([])
  })

  it('project scope is required — a missing or empty project is refused, never globalized', async () => {
    const { db, calls } = fakeDb()
    for (const projectId of [undefined, null, '', '  ']) {
      const r = await recordMemoryEvent({ ...valid, projectId: projectId as unknown as string }, db)
      expect(r).toMatchObject({ id: null, rejected: 'missing_project' })
    }
    expect(calls).toEqual([])
  })

  it('an ordinary product emitter cannot create world (or org, or unscoped) memory', async () => {
    const { db, calls } = fakeDb()
    // @ts-expect-error — the product API only admits scope 'project'
    const world: RecordMemoryEventInput = { ...valid, scope: 'world' }
    expect(await recordMemoryEvent(world, db)).toMatchObject({ id: null, rejected: 'invalid_scope' })
    for (const scope of ['org', 'global', undefined]) {
      const r = await recordMemoryEvent({ ...valid, scope: scope as 'project' }, db)
      expect(r).toMatchObject({ id: null, rejected: 'invalid_scope' })
    }
    expect(calls).toEqual([])
  })

  it('validation is a pure check on the received value', () => {
    expect(validateMemoryEventInput(valid)).toBeNull()
    expect(validateMemoryEventInput({ ...valid, sourceId: ' ' })).toBe('missing_source_id')
    expect(validateMemoryEventInput({ ...valid, projectId: '' })).toBe('missing_project')
    expect(validateMemoryEventInput({ ...valid, scope: 'world' as 'project' })).toBe('invalid_scope')
  })

  it('stays an inert no-op with the flag off, whatever it is handed', async () => {
    delete process.env.ATLAS_MEMORY
    const { db, calls } = fakeDb()
    expect(await recordMemoryEvent({ ...valid, sourceId: '' }, db)).toEqual({ id: null, deduped: false, skipped: true })
    expect(calls).toEqual([])
  })
})

// ── Flag readback ────────────────────────────────────────────────────────────

describe('Slice 2A — memory flags read back as booleans only', () => {
  it('returns exactly memory/recall/inject, each a boolean', () => {
    const flags = readMemoryFlags()
    expect(Object.keys(flags).sort()).toEqual(['inject', 'memory', 'recall'])
    for (const v of Object.values(flags)) expect(typeof v).toBe('boolean')
  })

  it('everything is off when the variables are absent — inject included', () => {
    for (const k of ['ATLAS_MEMORY', 'ATLAS_MEMORY_RECALL', 'ATLAS_MEMORY_INJECT']) delete process.env[k]
    expect(readMemoryFlags()).toEqual({ memory: false, recall: false, inject: false })
  })

  it('uses the runtime predicates (strict "1") and never echoes a raw value', () => {
    process.env.ATLAS_MEMORY = '1'
    process.env.ATLAS_MEMORY_RECALL = 'raw-secret-looking-value'
    delete process.env.ATLAS_MEMORY_INJECT
    const flags = readMemoryFlags()
    expect(flags).toEqual({ memory: true, recall: false, inject: false })
    expect(JSON.stringify(flags)).not.toContain('raw-secret-looking-value')
  })

  it('inject stays false when absent even with memory and recall on', () => {
    process.env.ATLAS_MEMORY = '1'
    process.env.ATLAS_MEMORY_RECALL = '1'
    delete process.env.ATLAS_MEMORY_INJECT
    expect(readMemoryFlags().inject).toBe(false)
  })

  it('is an internal helper — no route or page imports it', () => {
    const importers = PRODUCTION.filter((f) => rel(f).startsWith('app/'))
      .filter((f) => /memory\/flags['"]/.test(fs.readFileSync(f, 'utf8')))
    expect(importers.map(rel)).toEqual([])
  })
})

// ── Approval decisions ───────────────────────────────────────────────────────

describe('Slice 2A — approval decision', () => {
  it('records its feedback event before the response returns (awaited, not detached)', async () => {
    givenApproval()
    const res = await decideApproval('approved')
    expect(res.status).toBe(200)
    // The wrapper answered 25 ms after the call; a detached emit would not be here yet.
    expect(memoryEvents).toHaveLength(1)
    expect(memoryEvents[0]).toMatchObject({
      scope: 'project', event_type: 'feedback', source: 'approval', source_id: APPROVAL_ID,
      project_id: PROJECT, dedupe_key: 'feedback:article',
    })
  })

  it('a retry of the same approval dedupes onto the one event', async () => {
    givenApproval()
    await decideApproval('approved')
    await decideApproval('approved') // e.g. the first response was lost and the client retried
    expect(wrapperCalls).toBe(2)
    expect(eventsFor(APPROVAL_ID)).toHaveLength(1)
    resolveVerdict = 'ALREADY_RESOLVED' // the realistic retry: the database refuses the second decision
    const again = await decideApproval('approved')
    expect(again.status).toBe(409)
    expect(eventsFor(APPROVAL_ID)).toHaveLength(1)
  })

  it.each(['throw', 'error'] as const)('a memory failure (%s) does not fail the decision', async (fault) => {
    givenApproval()
    wrapperFault = fault
    const res = await decideApproval('rejected', 'too generic')
    expect(res.status).toBe(200)
    expect(rpcCalls).toContain('resolve_approval')
    expect(memoryEvents).toEqual([])
  })
})

// ── Article review ───────────────────────────────────────────────────────────

describe('Slice 2A — article review', () => {
  it.each(['reject', 'approve'] as const)('%s records source approval, event feedback, the content id — provenance in structured.producer', async (action) => {
    givenArticle()
    const res = await review(action, action === 'reject' ? 'weak hook' : undefined)
    expect(res.status).toBe(200)
    expect(memoryEvents).toHaveLength(1)
    expect(memoryEvents[0]).toMatchObject({
      scope: 'project', event_type: 'feedback', source: 'approval', source_id: ARTICLE_ID,
      project_id: PROJECT, dedupe_key: 'feedback:article',
    })
    expect(memoryEvents[0].structured).toMatchObject({ producer: 'article_review', contentId: ARTICLE_ID })
  })

  it.each(['reject', 'approve'] as const)('%s keeps the reviewer email out of the memory payload', async (action) => {
    givenArticle()
    await review(action)
    expect(memoryEvents).toHaveLength(1)
    expect(memoryEvents[0].structured).not.toHaveProperty('reviewer')
    expect(JSON.stringify(memoryEvents[0])).not.toContain(REVIEWER_EMAIL)
    // The product record is untouched: the content row still names its reviewer.
    expect(contentUpdates.some((u) => u.reviewed_by === REVIEWER_EMAIL)).toBe(true)
  })

  it('a double-submitted review dedupes onto the one event', async () => {
    givenArticle()
    await review('reject')
    await review('reject') // both requests read pending_review before either write landed
    expect(wrapperCalls).toBe(2)
    expect(eventsFor(ARTICLE_ID)).toHaveLength(1)
  })

  it.each(['throw', 'error'] as const)('a memory failure (%s) does not fail the review', async (fault) => {
    givenArticle()
    wrapperFault = fault
    const rejected = await review('reject')
    expect(rejected.status).toBe(200)
    expect(await rejected.json()).toMatchObject({ ok: true, status: 'rejected' })

    givenArticle()
    contentUpdates = []
    const published = await review('approve')
    expect(published.status).toBe(200)
    expect(await published.json()).toMatchObject({ ok: true, status: 'published' })
    // Memory can never be mistaken for a publish failure.
    expect(contentUpdates.some((u) => u.status === 'failed')).toBe(false)
    expect(memoryEvents).toEqual([])
  })
})

// ── Consolidation semantics (Slice 2A must not change them) ──────────────────

const MIGRATION_DIRS = [path.join(WEB_ROOT, 'supabase/migrations'), path.resolve(WEB_ROOT, '../../supabase/migrations')]
const CONSOLIDATE_DEF = /create\s+or\s+replace\s+function\s+atlas\.consolidate_memory_events\b/i

/** Every shipped definition of atlas.consolidate_memory_events, in apply (filename) order. */
function consolidationDefinitions(): { file: string; body: string }[] {
  const defs: { file: string; body: string }[] = []
  for (const dir of MIGRATION_DIRS) {
    if (!fs.existsSync(dir)) continue
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8')
      const at = sql.search(CONSOLIDATE_DEF)
      if (at < 0) continue
      const rest = sql.slice(at)
      const where = dir === MIGRATION_DIRS[0] ? 'apps/web' : 'root'
      defs.push({ file: `${where}/${file}`, body: rest.slice(0, rest.indexOf('end $$;') + 'end $$;'.length) })
    }
  }
  return defs
}

/** The source → trust weights the live consolidation function assigns, parsed from its CASE. */
function consolidationTrust(body: string): { bySource: Record<string, number>; fallback: number } {
  const expr = body.match(/v_trust\s*:=\s*case\s+r\.source([\s\S]*?)\bend\s*;/i)
  if (!expr) throw new Error('trust CASE not found in atlas.consolidate_memory_events')
  const bySource: Record<string, number> = {}
  for (const [, source, weight] of expr[1].matchAll(/when\s+'([^']+)'\s+then\s+([0-9.]+)/gi)) bySource[source] = Number(weight)
  const fallback = expr[1].match(/else\s+([0-9.]+)/i)
  if (!fallback) throw new Error('trust CASE has no ELSE fallback')
  return { bySource, fallback: Number(fallback[1]) }
}

/** The `source` values a route file passes to recordMemoryEvent. */
function emittedSources(routeRel: string): string[] {
  const code = codeOnly(fs.readFileSync(path.join(WEB_ROOT, routeRel), 'utf8'))
  return code.split(/recordMemoryEvent\(/).slice(1)
    .map((payload) => payload.slice(0, 700).match(/\bsource:\s*'([^']+)'/)?.[1] ?? '(none)')
}

describe('Slice 2A — consolidation trust semantics are unchanged', () => {
  it('there is exactly one live definition of the consolidation function', () => {
    expect(consolidationDefinitions().map((d) => d.file)).toEqual(['apps/web/20260617140100_atlas_consolidate_fn.sql'])
  })

  it('article reviews keep the approval trust weight — never the unknown-source fallback', () => {
    const [{ body }] = consolidationDefinitions()
    const trust = consolidationTrust(body)
    const sources = emittedSources('app/api/content/articles/[id]/review/route.ts')
    expect(sources).toHaveLength(2)
    for (const source of sources) {
      expect(Object.keys(trust.bySource), `source '${source}' must be a named trust class`).toContain(source)
      expect(trust.bySource[source], `'${source}' weighs like an approval`).toBe(trust.bySource.approval)
      expect(trust.bySource[source], `'${source}' must not fall to the unknown-source weight`).not.toBe(trust.fallback)
    }
  })

  it('approval decisions keep the same trust class as before', () => {
    const [{ body }] = consolidationDefinitions()
    const trust = consolidationTrust(body)
    expect(emittedSources('app/api/approvals/[id]/route.ts')).toEqual(['approval'])
    expect(trust.bySource.approval).toBeGreaterThan(trust.fallback)
  })

  it('consolidation weighs evidence by source alone — structured (where provenance lives) never reaches it', () => {
    const [{ body }] = consolidationDefinitions()
    expect(body).not.toMatch(/structured|producer/i)
  })
})

// ── Drain ────────────────────────────────────────────────────────────────────

describe('Slice 2A — drain terminal outcomes', () => {
  it('a legacy run that completes records its outcome before the drain returns', async () => {
    claimLegacyRun()
    const res = await drain()
    expect(res.status).toBe(200)
    expect(eventsFor(RUN_ID)).toHaveLength(1)
    expect(eventsFor(RUN_ID)[0]).toMatchObject({
      scope: 'project', event_type: 'outcome', source: 'drain', project_id: PROJECT, subject: 'Run outcome: done',
    })
  })

  it('a workflow-action run records the terminal outcome its durable row carries', async () => {
    claimActionRun()
    actionPlan = { status: 'done', actionOutcome: 'FAILED', result: { executed: true, detail: 'observe → fail' } }
    const res = await drain()
    expect(res.status).toBe(200)
    const [evt] = eventsFor(ACTION_RUN_ID)
    expect(evt).toMatchObject({
      scope: 'project', event_type: 'outcome', source: 'drain', source_id: ACTION_RUN_ID,
      project_id: PROJECT, subject: 'Run outcome: done',
    })
    expect(evt.structured).toMatchObject({ runId: ACTION_RUN_ID, status: 'done', actionOutcome: 'FAILED' })
  })

  it('a permanently refused workflow action records a rejected outcome', async () => {
    claimActionRun()
    actionPlan = { status: 'rejected', actionOutcome: 'REJECTED', lastError: 'not_ready: target drift',
                   result: { executed: false, refusal: 'not_ready', disposition: 'permanent', detail: 'drift' } }
    await drain()
    const [evt] = eventsFor(ACTION_RUN_ID)
    expect(evt).toMatchObject({ subject: 'Run outcome: rejected' })
    expect(String(evt.content)).toContain('target drift')
  })

  it.each([
    ['requeued (temporary refusal)', 'pending', { executed: false, refusal: 'spend_refused', disposition: 'temporary', detail: 'budget' }],
    ['partial (reconciliation owns it)', 'partial', { executed: true, detail: 'evidence pending' }],
    ['fenced (another owner holds it)', 'done', { executed: false, refusal: 'fenced', detail: 'claim rotated' }],
  ])('a workflow action that is %s records nothing', async (_label, status, result) => {
    claimActionRun()
    actionPlan = { status, actionOutcome: null, result }
    await drain()
    expect(eventsFor(ACTION_RUN_ID)).toEqual([])
  })

  it('a cancellation that lands at finalization records a cancelled outcome', async () => {
    claimLegacyRun()
    finalizationVerdict = 'CANCELLED'
    terminalizeResult = 'CANCELLED'
    const res = await drain()
    expect(((await res.json()) as { results: { status: string }[] }).results[0].status).toBe('cancelled')
    expect(eventsFor(RUN_ID)).toHaveLength(1)
    expect(eventsFor(RUN_ID)[0]).toMatchObject({ source: 'drain', event_type: 'outcome', subject: 'Run outcome: cancelled', project_id: PROJECT })
  })

  it.each(['FENCED', 'ERROR'] as const)('a finalization cancel whose write did not land (%s) records nothing', async (term) => {
    claimLegacyRun()
    finalizationVerdict = 'CANCELLED'
    terminalizeResult = term
    await drain()
    expect(eventsFor(RUN_ID)).toEqual([])
  })

  it('an unreadable run row after a workflow action records nothing and never becomes a run failure', async () => {
    claimActionRun()
    runsReadThrows = true
    const res = await drain()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { results: { status: string }[] }).results[0].status).toBe('action_executed')
    expect(lifecycleWrites).toEqual([])   // the drain's failure accounting never ran
    expect(memoryEvents).toEqual([])
  })

  it('the event project comes from the run, never from the request', async () => {
    claimActionRun()
    await drain(`?project_id=${FOREIGN}&scope=world`)
    expect(eventsFor(ACTION_RUN_ID)[0].project_id).toBe(PROJECT)
    expect(JSON.stringify(memoryEvents)).not.toContain(FOREIGN)
  })

  it('retries of the same run resolve to one event on every drain path', async () => {
    claimLegacyRun()
    await drain()
    claimLegacyRun()               // reclaimed after a lease expiry, completes again
    await drain()
    finalizationVerdict = 'CANCELLED'
    claimLegacyRun()               // a later cancellation cannot add a second outcome
    await drain()
    claimActionRun()
    await drain()
    claimActionRun()
    await drain()
    expect(wrapperCalls).toBe(5)
    expect(eventsFor(RUN_ID)).toHaveLength(1)
    expect(eventsFor(ACTION_RUN_ID)).toHaveLength(1)
  })

  it.each(['throw', 'error'] as const)('a memory failure (%s) does not fail the drain', async (fault) => {
    wrapperFault = fault
    claimLegacyRun()
    claimActionRun()
    claimLegacyRun({ id: 'abababab-abab-4bab-8bab-abababababab', attempts: 3, max_attempts: 3 })
    runnerError = null
    const res = await drain()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; results: { status: string }[] }
    expect(body.ok).toBe(true)
    expect(body.results.map((r) => r.status)).toEqual(['done', 'action_executed', 'done'])
    expect(memoryEvents).toEqual([])
  })

  it('a terminal failure still records its outcome, and a memory failure there does not mask it', async () => {
    runnerError = 'provider unavailable'
    claimLegacyRun({ attempts: 3, max_attempts: 3 })
    const res = await drain()
    expect(((await res.json()) as { results: { status: string }[] }).results[0].status).toBe('failed')
    expect(eventsFor(RUN_ID)[0]).toMatchObject({ subject: 'Run outcome: failed' })

    memoryEvents = []
    wrapperFault = 'throw'
    claimLegacyRun({ attempts: 3, max_attempts: 3 })
    const again = await drain()
    expect(again.status).toBe(200)
    expect(((await again.json()) as { results: { status: string }[] }).results[0].status).toBe('failed')
  })
})
