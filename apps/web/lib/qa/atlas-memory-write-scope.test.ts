/**
 * Atlas Memory M4 — Foundation Slice 1, BOUNDARY C: write authorization.
 *
 * public.atlas_record_event is SECURITY DEFINER and service_role-only; it does
 * NOT resolve actor/project ownership itself (proven in atlas-memory-recall-sql
 * .test.ts). Write authorization is therefore a ROUTE-LAYER contract, and this
 * file is where that contract is pinned — at the layer that actually enforces it.
 *
 * For each of the three emitter surfaces we prove the same three things:
 *   1. PROVENANCE  — the emitted project_id comes from persisted server state,
 *                    never from the request.
 *   2. GATE        — a principal acting on a row outside their projects is
 *                    refused BEFORE recordMemoryEvent is reached (zero events).
 *   3. NO OVERRIDE — request-controlled input (body fields, query string,
 *                    headers) cannot substitute another project onto the event.
 *
 * The isolation helpers (lib/auth/project-access, lib/atlas/isolation) are kept
 * REAL: the allow-list is derived from projects.owner_id exactly as in
 * production. Only the DB, the session, and the Memory emitter are faked, so a
 * pass here cannot come from a stubbed-open gate.
 *
 * recordMemoryEvent is faked to a recorder. That is deliberate: this file tests
 * the ROUTE's authorization decision, not the emitter's own contract (which is
 * unit-tested in atlas-memory-emit.test.ts). No Memory flag is set anywhere —
 * the routes call the emitter identically whether or not ATLAS_MEMORY is on, so
 * these guarantees hold both before and after the flag is ever enabled.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mutable harness state (reset per test) ───────────────────────────────────

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OWNED_PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FOREIGN_PROJECT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const APPROVAL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ARTICLE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const RUN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

let mockUser: { id: string; email?: string } | null = null
/** Projects the session user owns, as projects.owner_id would report them. */
let ownedProjectIds: string[] = []
let approvalRow: Record<string, unknown> | null = null
let contentRow: Record<string, unknown> | null = null
let claimedRuns: Record<string, unknown>[] = []
/** Every recordMemoryEvent call the route made, in order. */
let memoryEvents: Record<string, unknown>[] = []
/** Every rpc name the route invoked, to prove a 401 never reaches the queue. */
let rpcCalls: string[] = []

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) },
  }),
}))

/**
 * Minimal chainable Supabase double. Every builder method returns the builder;
 * `single`/`maybeSingle` and awaiting the builder resolve against (table, mode).
 */
class QueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  private mode: 'select' | 'update' | null = null
  constructor(private readonly table: string) {}

  private setMode(m: 'select' | 'update') {
    if (this.mode === null) this.mode = m
    return this
  }
  select() { return this.setMode('select') }
  update() { return this.setMode('update') }
  eq() { return this }
  in() { return this }

  private result(): { data: unknown; error: unknown } {
    if (this.table === 'projects') {
      // The REAL getAllowedProjectIds runs against this.
      return { data: ownedProjectIds.map((id) => ({ id })), error: null }
    }
    if (this.table === 'approvals') {
      return this.mode === 'update'
        ? { data: { ...(approvalRow ?? {}), status: 'approved' }, error: null }
        : { data: approvalRow, error: null }
    }
    if (this.table === 'website_content') {
      return this.mode === 'update' ? { data: null, error: null } : { data: contentRow, error: null }
    }
    if (this.table === 'runs') return { data: null, error: null }
    throw new Error(`unexpected table: ${this.table}`)
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
    rpc: async (name: string) => {
      rpcCalls.push(name)
      if (name === 'claim_runs') return { data: claimedRuns, error: null }
      return { data: null, error: null }
    },
  }),
}))

vi.mock('@/lib/atlas/memory/record-event', () => ({
  recordMemoryEvent: async (input: Record<string, unknown>) => {
    memoryEvents.push(input)
    return { id: 'evt-1', deduped: false, skipped: false }
  },
}))

vi.mock('@/lib/ai/memory/feedback-store', () => ({
  saveFeedback: async () => ({ id: 'fb-1' }),
}))

vi.mock('@/lib/article/approval', () => ({
  ARTICLE_APPROVAL_KIND: 'article_publish',
  publishApprovedArticle: async () => ({ ok: true }),
}))

vi.mock('@/lib/publishing/publish', () => ({
  publishArticle: async () => ({
    ok: true, id: 'cms-1', external_id: 'x-1', slug: 's', status: 'published',
    published_at: '2026-08-29T00:00:00.000Z', published_url: 'https://example/a', operation: 'created',
  }),
}))

// Drain: force the cancel branch, which is the shortest real path to an emit.
vi.mock('@/lib/ai/cancel', () => ({
  isCancelEnabled: () => true,
  isCancelledError: () => false,
  cancelledError: (id: string) => new Error(`cancelled: ${id}`),
  isCancelRequested: async () => true,
}))
vi.mock('@/lib/ai/fencing', () => ({
  isFencingEnabled: () => true,
  isFencedError: () => false,
  fencedError: (id: string) => new Error(`fenced: ${id}`),
  // fenced:false = this executor owns the terminal write → the route emits.
  fencedRunUpdate: async () => ({ fenced: false }),
}))

import { PATCH as approvalsPatch } from '@/app/api/approvals/[id]/route'
import { POST as reviewPost } from '@/app/api/content/articles/[id]/review/route'
import { GET as drainGet } from '@/app/api/runs/drain/route'

beforeEach(() => {
  mockUser = { id: OWNER_ID, email: 'owner@example.com' }
  ownedProjectIds = [OWNED_PROJECT]
  approvalRow = null
  contentRow = null
  claimedRuns = []
  memoryEvents = []
  rpcCalls = []
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. /api/approvals/[id]
//    project_id ← approvals.project_id, else runs.project_id lineage.
//    gate: resolveProjectAccess + assertProjectAllowed, before any mutation.
// ─────────────────────────────────────────────────────────────────────────────

function patchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/approvals/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const approvalIn = (projectId: string | null, runProjectId?: string | null) => ({
  id: APPROVAL_ID,
  project_id: projectId,
  output_key: 'article',
  content: 'body',
  run_id: null,
  kind: 'generic',
  runs: runProjectId === undefined ? null : { project_id: runProjectId },
})

describe('BOUNDARY C — /api/approvals/[id] write scope', () => {
  it('emits with the project_id read from the approval row (server-derived)', async () => {
    approvalRow = approvalIn(OWNED_PROJECT)
    const res = await approvalsPatch(patchRequest({ action: 'approved' }), { params: { id: APPROVAL_ID } })
    expect(res.status).toBe(200)
    expect(memoryEvents).toHaveLength(1)
    expect(memoryEvents[0].projectId).toBe(OWNED_PROJECT)
    expect(memoryEvents[0].scope).toBe('project')
  })

  it('an approval in a foreign project is refused and emits NOTHING', async () => {
    approvalRow = approvalIn(FOREIGN_PROJECT)
    const res = await approvalsPatch(patchRequest({ action: 'approved' }), { params: { id: APPROVAL_ID } })
    expect(res.status).toBe(403)
    expect(memoryEvents).toEqual([])
  })

  it('a project_id in the request body cannot redirect the event', async () => {
    approvalRow = approvalIn(OWNED_PROJECT)
    const res = await approvalsPatch(
      patchRequest({ action: 'approved', project_id: FOREIGN_PROJECT, projectId: FOREIGN_PROJECT, scope: 'world' }),
      { params: { id: APPROVAL_ID } },
    )
    expect(res.status).toBe(200)
    expect(memoryEvents).toHaveLength(1)
    expect(memoryEvents[0].projectId).toBe(OWNED_PROJECT)
  })

  it('a body claiming an owned project cannot unlock a foreign approval', async () => {
    approvalRow = approvalIn(FOREIGN_PROJECT)
    const res = await approvalsPatch(
      patchRequest({ action: 'approved', project_id: OWNED_PROJECT }),
      { params: { id: APPROVAL_ID } },
    )
    expect(res.status).toBe(403)
    expect(memoryEvents).toEqual([])
  })

  it('run-lineage fallback stays gated: a foreign run project is refused', async () => {
    approvalRow = approvalIn(null, FOREIGN_PROJECT)
    const res = await approvalsPatch(patchRequest({ action: 'approved' }), { params: { id: APPROVAL_ID } })
    expect(res.status).toBe(403)
    expect(memoryEvents).toEqual([])
  })

  it('run-lineage fallback emits the run’s project when it is owned', async () => {
    approvalRow = approvalIn(null, OWNED_PROJECT)
    const res = await approvalsPatch(patchRequest({ action: 'approved' }), { params: { id: APPROVAL_ID } })
    expect(res.status).toBe(200)
    expect(memoryEvents).toHaveLength(1)
    expect(memoryEvents[0].projectId).toBe(OWNED_PROJECT)
  })

  it('no session → 401 and no event', async () => {
    mockUser = null
    approvalRow = approvalIn(OWNED_PROJECT)
    const res = await approvalsPatch(patchRequest({ action: 'approved' }), { params: { id: APPROVAL_ID } })
    expect(res.status).toBe(401)
    expect(memoryEvents).toEqual([])
  })

  it('a caller who owns no projects can never emit (fail-closed allow-list)', async () => {
    ownedProjectIds = []
    approvalRow = approvalIn(OWNED_PROJECT)
    const res = await approvalsPatch(patchRequest({ action: 'approved' }), { params: { id: APPROVAL_ID } })
    expect(res.status).toBe(403)
    expect(memoryEvents).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. /api/content/articles/[id]/review
//    project_id ← website_content.project_id.
//    gate: getAllowedProjectIds + assertProjectAllowed → 404 before any write.
// ─────────────────────────────────────────────────────────────────────────────

function reviewRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/content/articles/x/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const articleIn = (projectId: string) => ({
  id: ARTICLE_ID,
  project_id: projectId,
  status: 'pending_review',
  destination_key: 'the-prompt',
  payload: { version: 1, external_id: 'x-1', title: 'T', summary: 'S', body: 'B', category: { slug: 'news' }, tags: [], published_at: null },
  hero_image_url: null,
})

describe('BOUNDARY C — /api/content/articles/[id]/review write scope', () => {
  it('reject emits with the project_id read from the content row', async () => {
    contentRow = articleIn(OWNED_PROJECT)
    const res = await reviewPost(reviewRequest({ action: 'reject', notes: 'off-brand' }), { params: { id: ARTICLE_ID } })
    expect(res.status).toBe(200)
    expect(memoryEvents).toHaveLength(1)
    expect(memoryEvents[0].projectId).toBe(OWNED_PROJECT)
  })

  it('approve emits with the project_id read from the content row', async () => {
    contentRow = articleIn(OWNED_PROJECT)
    const res = await reviewPost(reviewRequest({ action: 'approve' }), { params: { id: ARTICLE_ID } })
    expect(res.status).toBe(200)
    expect(memoryEvents).toHaveLength(1)
    expect(memoryEvents[0].projectId).toBe(OWNED_PROJECT)
  })

  it('content in a foreign project is refused (404) and emits NOTHING', async () => {
    contentRow = articleIn(FOREIGN_PROJECT)
    const res = await reviewPost(reviewRequest({ action: 'reject' }), { params: { id: ARTICLE_ID } })
    expect(res.status).toBe(404)
    expect(memoryEvents).toEqual([])
  })

  it('a project_id in the request body cannot redirect the event', async () => {
    contentRow = articleIn(OWNED_PROJECT)
    const res = await reviewPost(
      reviewRequest({ action: 'reject', project_id: FOREIGN_PROJECT, projectId: FOREIGN_PROJECT }),
      { params: { id: ARTICLE_ID } },
    )
    expect(res.status).toBe(200)
    expect(memoryEvents).toHaveLength(1)
    expect(memoryEvents[0].projectId).toBe(OWNED_PROJECT)
  })

  it('a body claiming an owned project cannot unlock foreign content', async () => {
    contentRow = articleIn(FOREIGN_PROJECT)
    const res = await reviewPost(
      reviewRequest({ action: 'approve', project_id: OWNED_PROJECT }),
      { params: { id: ARTICLE_ID } },
    )
    expect(res.status).toBe(404)
    expect(memoryEvents).toEqual([])
  })

  it('no session → 401 and no event', async () => {
    mockUser = null
    contentRow = articleIn(OWNED_PROJECT)
    const res = await reviewPost(reviewRequest({ action: 'reject' }), { params: { id: ARTICLE_ID } })
    expect(res.status).toBe(401)
    expect(memoryEvents).toEqual([])
  })

  it('a caller who owns no projects can never emit (fail-closed allow-list)', async () => {
    ownedProjectIds = []
    contentRow = articleIn(OWNED_PROJECT)
    const res = await reviewPost(reviewRequest({ action: 'reject' }), { params: { id: ARTICLE_ID } })
    expect(res.status).toBe(404)
    expect(memoryEvents).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. /api/runs/drain
//    NOT a user-facing actor boundary: an internal pg_cron worker authorized by
//    Bearer CRON_SECRET. project_id ← the CLAIMED run row (persisted state).
//    There is no user ownership requirement here by design, so we prove the two
//    things that actually matter: the system authority gate, and that nothing
//    request-controlled can choose the project.
// ─────────────────────────────────────────────────────────────────────────────

function drainRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: 'GET', headers })
}

const cancelledRun = (projectId: string) => ({
  id: RUN_ID,
  project_id: projectId,
  claim_id: 'claim-1',
  cancel_requested: true,
  kind: 'generic',
  attempts: 1,
})

describe('BOUNDARY C — /api/runs/drain write scope (system worker)', () => {
  const REAL_SECRET = 'cron-secret-under-test'
  const priorSecret = process.env.CRON_SECRET
  beforeEach(() => { process.env.CRON_SECRET = REAL_SECRET })
  afterEach(() => {
    if (priorSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = priorSecret
  })

  it('emits with the project_id of the CLAIMED run (persisted state, not the request)', async () => {
    claimedRuns = [cancelledRun(OWNED_PROJECT)]
    const res = await drainGet(drainRequest('http://localhost/api/runs/drain', {
      authorization: `Bearer ${REAL_SECRET}`,
    }))
    expect(res.status).toBe(200)
    expect(rpcCalls).toContain('claim_runs')
    expect(memoryEvents).toHaveLength(1)
    expect(memoryEvents[0].projectId).toBe(OWNED_PROJECT)
    expect(memoryEvents[0].entityId).toBe(RUN_ID)
  })

  it('query string and headers cannot choose another project for the event', async () => {
    claimedRuns = [cancelledRun(OWNED_PROJECT)]
    const res = await drainGet(drainRequest(
      `http://localhost/api/runs/drain?project_id=${FOREIGN_PROJECT}&projectId=${FOREIGN_PROJECT}&scope=world`,
      { authorization: `Bearer ${REAL_SECRET}`, 'x-project-id': FOREIGN_PROJECT },
    ))
    expect(res.status).toBe(200)
    expect(memoryEvents).toHaveLength(1)
    expect(memoryEvents[0].projectId).toBe(OWNED_PROJECT)
    expect(JSON.stringify(memoryEvents[0])).not.toContain(FOREIGN_PROJECT)
  })

  it('the event follows whichever project the run row carries — no ambient default', async () => {
    claimedRuns = [cancelledRun(FOREIGN_PROJECT)]
    await drainGet(drainRequest('http://localhost/api/runs/drain', { authorization: `Bearer ${REAL_SECRET}` }))
    expect(memoryEvents).toHaveLength(1)
    // Correct for an internal worker: the run's own project, whoever owns it.
    expect(memoryEvents[0].projectId).toBe(FOREIGN_PROJECT)
  })

  it('a wrong bearer is refused before the queue is even claimed', async () => {
    claimedRuns = [cancelledRun(OWNED_PROJECT)]
    const res = await drainGet(drainRequest('http://localhost/api/runs/drain', { authorization: 'Bearer wrong' }))
    expect(res.status).toBe(401)
    expect(rpcCalls).toEqual([])
    expect(memoryEvents).toEqual([])
  })

  it('a missing bearer is refused and emits nothing', async () => {
    claimedRuns = [cancelledRun(OWNED_PROJECT)]
    const res = await drainGet(drainRequest('http://localhost/api/runs/drain'))
    expect(res.status).toBe(401)
    expect(rpcCalls).toEqual([])
    expect(memoryEvents).toEqual([])
  })

  it('an unset CRON_SECRET fails closed (no open worker endpoint)', async () => {
    delete process.env.CRON_SECRET
    claimedRuns = [cancelledRun(OWNED_PROJECT)]
    const res = await drainGet(drainRequest('http://localhost/api/runs/drain', { authorization: 'Bearer undefined' }))
    expect(res.status).toBe(401)
    expect(memoryEvents).toEqual([])
  })
})
