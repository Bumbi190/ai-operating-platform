/**
 * G3C-3B — the route-level halves of durable cancellation, proven BEHAVIOURALLY.
 *
 * Each of these drives the real route handler. Source pins are rot detectors and
 * live elsewhere; nothing here asserts on text, because every presence-shaped
 * guard this programme has written was eventually satisfied by code that did the
 * wrong thing.
 *
 * What is proven:
 *   • the cancel route reports the RPC's ROW COUNT, never a pre-read status
 *   • an approval operation that LOST the run transition publishes nothing
 *   • an explicit human resume clears old cancellation intent; automatic paths
 *     never do
 *   • manual re-execution is failed→pending only, so terminal history and
 *     unresolved remote effects cannot be rewritten
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

type Row = Record<string, unknown>

const RUN = '55555555-5555-5555-5555-555555555551'
const PROJ = '11111111-1111-1111-1111-111111111111'
const APPR = '66666666-6666-6666-6666-666666666661'

const state = {
  run: {} as Row,
  approval: {} as Row,
  /** What the RPC answers, and how many rows it claims to have touched. */
  cancelRows: 0,
  approvalVerdict: 'APPROVED' as string,
  rpcCalls: [] as { fn: string; args: Row }[],
  updates: [] as { table: string; payload: Row; predicates: Row }[],
}

const published: string[] = []
vi.mock('@/lib/article/approval', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/article/approval')),
  publishApprovedArticle: (c: string) => { published.push(c); return Promise.resolve({ ok: true }) },
}))
const feedback: string[] = []
vi.mock('@/lib/ai/memory/feedback-store', () => ({
  saveFeedback: (a: { decision: string }) => { feedback.push(a.decision); return Promise.resolve() },
}))
vi.mock('@/lib/atlas/memory/record-event', () => ({ recordMemoryEvent: () => Promise.resolve() }))
vi.mock('@/lib/auth/project-access', () => ({
  resolveProjectAccess: () => Promise.resolve({ ok: true, userId: 'u1', allowedProjectIds: [PROJ] }),
  assertProjectAllowed: () => true,
  projectForbidden: () => new Response('forbidden', { status: 403 }),
}))

function makeDb() {
  const builder = (table: string) => {
    const predicates: Row = {}
    let payload: Row | null = null
    const resolve = () => {
      if (table === 'runs') return { data: { ...state.run }, error: null }
      if (table === 'approvals') return { data: { ...state.approval }, error: null }
      return { data: null, error: null }
    }
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: (p: Row) => { payload = p; return chain },
      eq: (c: string, v: unknown) => { predicates[c] = v; return chain },
      single: async () => resolve(),
      maybeSingle: async () => resolve(),
      then: (ok: (v: unknown) => unknown) => {
        if (payload !== null) {
          state.updates.push({ table, payload, predicates })
          const target = table === 'runs' ? state.run : state.approval
          const hit = Object.entries(predicates).every(([k, v]) => k === 'id' || target[k] === v)
          if (hit) Object.assign(target, payload)
          return Promise.resolve({ data: hit ? [{ id: RUN }] : [], error: null }).then(ok)
        }
        return Promise.resolve(resolve()).then(ok)
      },
    }
    return chain
  }
  return {
    from: (t: string) => builder(t),
    rpc: async (fn: string, args: Row) => {
      state.rpcCalls.push({ fn, args })
      if (fn === 'request_run_cancel') return { data: state.cancelRows, error: null }
      if (fn === 'resolve_approval') return { data: state.approvalVerdict, error: null }
      return { data: null, error: null }
    },
  }
}
/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeDb() as any }))

const post = (url: string, body: unknown = {}) =>
  new Request(url, { method: 'POST', body: JSON.stringify(body),
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret'
  state.run = { id: RUN, project_id: PROJ, status: 'pending', cancel_requested: false }
  state.approval = { id: APPR, run_id: RUN, project_id: PROJ, kind: 'article_publish',
                     status: 'pending', content: '{}', output_key: 'k' }
  state.cancelRows = 0
  state.approvalVerdict = 'APPROVED'
  state.rpcCalls = []
  state.updates = []
  published.length = 0
  feedback.length = 0
  vi.resetModules()
})

// ───────────────────────────────────────────────────────────────────────────
describe('G3C-3B · the cancel route reports the mutation, not a pre-read', () => {
  const cancel = async () => {
    const { POST } = await import('@/app/api/runs/[id]/cancel/route')
    const res = await POST(post(`http://t/api/runs/${RUN}/cancel`, { reason: 'op' }) as never,
      { params: { id: RUN } })
    return { res, body: await res.json() as Row }
  }

  it('every cancellable state goes through the ONE canonical RPC', async () => {
    // Not three route-side branches on a stale status — one writer, whose row
    // lock decides which state actually exists.
    state.cancelRows = 1
    state.run.status = 'cancelled'
    await cancel()
    const rpcs = state.rpcCalls.filter(c => c.fn === 'request_run_cancel')
    expect(rpcs.length, 'exactly one canonical call').toBe(1)
    expect(state.updates.filter(u => u.table === 'runs'),
      'and NO route-side lifecycle write').toEqual([])
  })

  it('n>0 + cancelled → success', async () => {
    state.cancelRows = 1; state.run.status = 'cancelled'
    const { res, body } = await cancel()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, status: 'cancelled', mutated: true, enforced: true })
  })

  it('n>0 + still running → durable intent, honestly described', async () => {
    state.cancelRows = 1
    state.run.status = 'running'; state.run.cancel_requested = true
    const { res, body } = await cancel()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, status: 'cancel_requested', mutated: true })
    expect(String(body.note), 'it must not claim a remote cancellation')
      .toMatch(/not remotely cancelled/)
  })

  it('M13 — n=0 on a DONE run is a 409, never success', async () => {
    // The defect this replaces: the route branched on a status it had READ,
    // issued a conditional UPDATE, never checked the row count, and answered
    // {ok:true,status:'cancelled'} regardless. A claim landing in between made
    // that a lie, and the run ran to completion.
    state.cancelRows = 0; state.run.status = 'done'
    const { res, body } = await cancel()
    expect(res.status, 'a lost cancellation is a conflict').toBe(409)
    expect(body.ok, 'and never reported as success').toBe(false)
    expect(body).toMatchObject({ status: 'already_terminal', mutated: false, current_status: 'done' })
  })

  it('n=0 on an ALREADY-cancelled run is an honest idempotent no-op', async () => {
    // The caller's desired end state holds, so this is success — but it must not
    // claim a mutation that did not happen. "Already cancelled" and "you lost"
    // are different answers and the API says which.
    state.cancelRows = 0; state.run.status = 'cancelled'
    const { res, body } = await cancel()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, status: 'cancelled', noop: true, mutated: false })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('G3C-3B · an approval operation that LOST causes no side effects', () => {
  const patch = async (action: string) => {
    const { PATCH } = await import('@/app/api/approvals/[id]/route')
    const req = new Request(`http://t/api/approvals/${APPR}`, {
      method: 'PATCH', body: JSON.stringify({ action, reviewer_notes: 'n' }) })
    const res = await PATCH(req as never, { params: { id: APPR } })
    return { res, body: await res.json() as Row }
  }

  it('the run transition is decided by the RPC, not by a route-side write', async () => {
    state.approvalVerdict = 'APPROVED'
    await patch('approved')
    expect(state.rpcCalls.filter(c => c.fn === 'resolve_approval').length).toBe(1)
    expect(state.updates.filter(u => u.table === 'runs'),
      'the route must not flip the run itself').toEqual([])
    expect(state.updates.filter(u => u.table === 'approvals'),
      'nor write the approval ahead of the run').toEqual([])
  })

  it('M16 — a LOST approval publishes nothing and records no feedback', async () => {
    // The cancel route won the run: it is cancelled and the approval returned.
    // Publishing here would put an article live for a cancelled run — and the
    // old code would have, because its hook was gated on `action === 'approved'`
    // rather than on having won.
    state.approvalVerdict = 'LOST'
    const { res, body } = await patch('approved')
    expect(res.status).toBe(409)
    expect(body.ok).toBe(false)
    expect(published, 'no external effect from a loser').toEqual([])
    expect(feedback, 'and no "approved" feedback either').toEqual([])
  })

  it('an ALREADY_RESOLVED approval publishes nothing', async () => {
    state.approvalVerdict = 'ALREADY_RESOLVED'
    const { res } = await patch('approved')
    expect(res.status).toBe(409)
    expect(published).toEqual([])
  })

  it('a WINNING approval does publish, exactly once', async () => {
    // Non-vacuity: if the publish path were simply broken, M16 would pass for
    // the wrong reason.
    state.approvalVerdict = 'APPROVED'
    const { res } = await patch('approved')
    expect(res.status).toBe(200)
    expect(published.length).toBe(1)
    expect(feedback).toEqual(['approved'])
  })

  it('M16b — the RPC verdict outranks the request: approved-asked, rejected-decided', async () => {
    // Defense in depth behind the loser early-return. If the database ever
    // answers something other than what was asked — a future branch, a narrowed
    // transition — the route must follow the VERDICT, never the caller's
    // `action`. Gating publish on the request instead is how an external effect
    // fires on a decision that was not made.
    state.approvalVerdict = 'REJECTED'
    const { res } = await patch('approved')
    expect(res.status).toBe(200)
    expect(published, 'publish follows the decision, not the request').toEqual([])
  })

  it('a winning REJECTED decision does not publish', async () => {
    state.approvalVerdict = 'REJECTED'
    await patch('rejected')
    expect(published).toEqual([])
    expect(feedback).toEqual(['rejected'])
  })

  it('revised is a first-class action, resolved through the same RPC', async () => {
    state.approvalVerdict = 'REVISED'
    const { res } = await patch('revised')
    expect(res.status).toBe(200)
    expect(state.rpcCalls.some(c => c.fn === 'resolve_approval' && c.args.p_action === 'revised')).toBe(true)
    expect(published).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('G3C-3B · manual requeue is failed→pending, and clears old intent', () => {
  const execute = async (body: Row = { run_id: RUN }) => {
    const { POST } = await import('@/app/api/runs/execute/route')
    const res = await POST(post('http://t/api/runs/execute', body))
    return { res, body: await res.json() as Row }
  }

  it('M14 — an explicit resume CLEARS the old cancellation intent', async () => {
    // Nothing else in the system ever clears this flag. Without it a resumed run
    // is cancelled again on sight by the canonical checkpoint — permanently
    // un-resumable. A deliberate human resume IS an override of that intent.
    state.run = { id: RUN, project_id: PROJ, status: 'failed', cancel_requested: true,
                  cancel_reason: 'operator', cancelled_by: 'u1', steps_snapshot: [], workflow_id: 'w' }
    const { res } = await execute()
    expect(res.status).toBe(202)
    const w = state.updates.find(u => u.table === 'runs')!
    expect(w.payload.status).toBe('pending')
    expect(w.payload.cancel_requested, 'the override').toBe(false)
    expect(w.payload.cancel_reason).toBeNull()
    expect(w.payload.cancelled_by).toBeNull()
    expect(w.predicates.status, 'still conditioned on failed — no second truth table')
      .toBe('failed')
  })

  it('M20 — a DONE run cannot be requeued', async () => {
    // Rewriting durable history: the deliverable would be produced twice.
    state.run = { id: RUN, project_id: PROJ, status: 'done', cancel_requested: false }
    const { res } = await execute()
    expect(res.status).toBe(409)
    expect(state.updates.filter(u => u.table === 'runs'), 'and nothing was written').toEqual([])
  })

  it('M20 — a CANCELLED run cannot be requeued', async () => {
    // Erasing terminal meaning — and the path that could collide with the
    // replacement run holding the same action identity.
    state.run = { id: RUN, project_id: PROJ, status: 'cancelled', cancel_requested: true }
    const { res } = await execute()
    expect(res.status).toBe(409)
    expect(state.updates.filter(u => u.table === 'runs')).toEqual([])
  })

  it('M20 — an UNKNOWN run cannot be requeued', async () => {
    // Its remote effect is by definition unresolved; restarting on top of that
    // ambiguity is how one side effect becomes two.
    state.run = { id: RUN, project_id: PROJ, status: 'unknown', reconciliation_required: true }
    const { res } = await execute()
    expect(res.status).toBe(409)
    expect(state.updates.filter(u => u.table === 'runs')).toEqual([])
  })

  it('M20 — a RUNNING run cannot be torn out from under its owner', async () => {
    state.run = { id: RUN, project_id: PROJ, status: 'running', claim_id: 'c1' }
    const { res } = await execute()
    expect(res.status).toBe(409)
    expect(state.updates.filter(u => u.table === 'runs')).toEqual([])
  })
})
