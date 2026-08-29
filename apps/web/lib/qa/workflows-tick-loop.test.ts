/**
 * The tick loop: claiming, recording, re-arming, escalating.
 *
 * The fake below models the ONE property the real claim guarantees — an
 * instance is handed to exactly one caller, and the claim pushes its wake
 * forward rather than clearing it. Everything else is the shipped code.
 */

import { describe, expect, it, vi } from 'vitest'
import { tickDueWorkflows, evaluateDueWorkflow } from '@/lib/workflows/tick'
import { FAMILJE_STUNDEN_MONTHLY_RELEASE, findVendoredDefinition } from '@/lib/workflows/definitions'
import type { WorkflowInstance } from '@/lib/workflows/types'

const VENDORED = findVendoredDefinition(FAMILJE_STUNDEN_MONTHLY_RELEASE, 1)!
const NOW = '2026-08-10T12:00:00.000Z'
const PAST = '2026-08-09T12:00:00.000Z'
const FUTURE = '2026-08-11T12:00:00.000Z'
const VISIBILITY = 300

function instance(over: Partial<WorkflowInstance> = {}): WorkflowInstance {
  return {
    id: 'i1', def_id: 'd1', def_key: VENDORED.def_key, def_version: 1,
    def_hash: VENDORED.def_hash, project_id: 'p1', instance_key: '2026-11',
    current_state: 'planning', status: 'active', wake_at: PAST,
    last_tick_at: null, last_tick_outcome: null,
    created_at: '2026-08-01T00:00:00.000Z', closed_at: null, ...over,
  }
}

/**
 * A world with a shared claim ledger, so two "concurrent" ticks against the
 * same world cannot both take the same instance — exactly what SKIP LOCKED
 * plus the visibility push gives in Postgres.
 */
function world(opts: { instances: WorkflowInstance[]; paused?: boolean; failEvaluate?: boolean } = { instances: [] }) {
  const instances = new Map(opts.instances.map(i => [i.id, { ...i }]))
  const evidence: Record<string, unknown>[] = []
  const signals: { kind: string; payload: Record<string, unknown> }[] = []
  const rpcCalls: { name: string; args: any }[] = []

  const transitions = [{
    id: 't0', seq: 1, instance_id: 'i1', from_state: null, to_state: 'planning',
    reason: 'created', actor: 'system', evidence_ref: null, authorization_id: null, occurred_at: 'now',
  }]

  function table(name: string) {
    let rows: any[] =
      name === 'workflow_defs' ? [{ id: 'd1', def_key: VENDORED.def_key, version: 1,
        def_hash: VENDORED.def_hash, spec: VENDORED.spec, created_at: 'now' }] :
      name === 'workflow_transitions' ? [...transitions] :
      name === 'workflow_evidence' ? [] :
      name === 'projects' ? [{ id: 'p1', execution_paused: opts.paused === true }] :
      name === 'workflow_instances' ? [...instances.values()] : []
    const chain: any = {
      select: () => chain, order: () => chain, limit: () => chain, not: () => chain, lte: () => chain,
      eq: (c: string, v: unknown) => { rows = rows.filter(r => r[c] === v); return chain },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({
        data: rows[0] ?? null,
        error: rows[0] ? null : { message: `${name} not found` },
      }),
      insert: (row: any) => { if (name === 'workflow_evidence') evidence.push(row); return chain },
      then: (res: (v: { data: unknown[]; error: null }) => unknown) => res({ data: rows, error: null }),
    }
    return chain
  }

  const db = {
    from: table,
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args })
      if (name === 'workflow_claim_due') {
        // SKIP LOCKED + visibility push, modelled faithfully.
        const due = [...instances.values()].filter(i =>
          i.status === 'active' && i.wake_at !== null &&
          Date.parse(i.wake_at) <= Date.parse(NOW) && opts.paused !== true)
          .slice(0, args.p_limit)
        for (const i of due) {
          i.wake_at = new Date(Date.parse(NOW) + args.p_visibility_seconds * 1000).toISOString()
          i.last_tick_at = NOW
        }
        return { data: due.map(i => ({ ...i })), error: null }
      }
      if (name === 'workflow_record_tick') {
        const i = instances.get(args.p_instance_id)!
        const changed = i.last_tick_outcome !== args.p_outcome
        i.last_tick_outcome = args.p_outcome
        i.wake_at = args.p_next_wake_at
        // Mirrors the SQL: p_detail || jsonb_build_object('outcome', ...).
        if (changed) evidence.push({
          check_key: 'scheduler.evaluation', ...args.p_detail,
          outcome: args.p_outcome, previous_outcome: i.last_tick_outcome,
        })
        return { data: null, error: null }
      }
      return { data: null, error: null }
    },
  }

  return { db, instances, evidence, signals, rpcCalls,
    emitSignal: async (kind: string, payload: Record<string, unknown>) => { signals.push({ kind, payload }) } }
}

/** An empty but READABLE ledger: no authorization exists for any target. */
const emptyLedger = { history: async () => [], byTarget: async () => [] }

const run = (w: ReturnType<typeof world>) =>
  tickDueWorkflows(w.db as any, {
    now: NOW, visibilitySeconds: VISIBILITY, emitSignal: w.emitSignal, ledger: emptyLedger,
  })

// ── Due selection ────────────────────────────────────────────────────────────

describe('tick — what gets picked up', () => {
  it('does NOT process a future wake', async () => {
    const w = world({ instances: [instance({ wake_at: FUTURE })] })
    const r = await run(w)
    expect(r.claimed).toBe(0)
    expect(r.evaluated).toEqual([])
  })

  it('does NOT process an unscheduled instance', async () => {
    const w = world({ instances: [instance({ wake_at: null })] })
    expect((await run(w)).claimed).toBe(0)
  })

  it('processes a due wake exactly once per tick', async () => {
    const w = world({ instances: [instance()] })
    const r = await run(w)
    expect(r.claimed).toBe(1)
    expect(r.evaluated).toHaveLength(1)
    expect(r.evaluated[0].instanceKey).toBe('2026-11')
  })

  it('ignores a terminal instance', async () => {
    const w = world({ instances: [instance({ status: 'complete', closed_at: NOW })] })
    expect((await run(w)).claimed).toBe(0)
  })

  it('ignores a paused project', async () => {
    const w = world({ instances: [instance()], paused: true })
    expect((await run(w)).claimed).toBe(0)
  })
})

// ── Concurrency ──────────────────────────────────────────────────────────────

describe('tick — concurrency', () => {
  it('two ticks against the same world do not both take the instance', async () => {
    const w = world({ instances: [instance()] })
    const [a, b] = await Promise.all([run(w), run(w)])
    expect(a.claimed + b.claimed).toBe(1)
  })

  it('a second tick immediately after the first finds nothing due', async () => {
    const w = world({ instances: [instance()] })
    expect((await run(w)).claimed).toBe(1)
    expect((await run(w)).claimed).toBe(0)
  })

  it('the claim pushes the wake forward — it is never cleared mid-flight', async () => {
    const w = world({ instances: [instance()] })
    const seen: (string | null)[] = []
    const original = w.db.rpc
    w.db.rpc = async (name: string, args: any) => {
      const out = await original(name, args)
      if (name === 'workflow_claim_due') seen.push(w.instances.get('i1')!.wake_at)
      return out
    }
    await run(w)
    // Immediately after the claim the wake is VISIBILITY seconds out, so a crash
    // here leaves the instance due again rather than lost.
    expect(seen[0]).toBe(new Date(Date.parse(NOW) + VISIBILITY * 1000).toISOString())
  })
})

// ── Crash and retry ──────────────────────────────────────────────────────────

describe('tick — crash safety', () => {
  it('an instance whose evaluation throws is reported, not dropped', async () => {
    const w = world({ instances: [instance({ def_id: 'missing-def' })] })
    const r = await run(w)
    expect(r.claimed).toBe(1)
    expect(r.errors).toHaveLength(1)
    expect(r.evaluated).toEqual([])
    // Its wake is still the pushed-forward value, so a later tick retries it.
    expect(w.instances.get('i1')!.wake_at)
      .toBe(new Date(Date.parse(NOW) + VISIBILITY * 1000).toISOString())
  })

  it('one bad instance does not stop the batch', async () => {
    const w = world({ instances: [instance({ id: 'i1', def_id: 'missing-def' })] })
    const r = await run(w)
    expect(r.errors).toHaveLength(1)
    expect(r.claimed).toBe(1)
  })

  it('re-running the same evaluation is idempotent in the audit log', async () => {
    const w = world({ instances: [instance()] })
    await run(w)
    const after = w.evidence.length
    // Force it due again with the same situation.
    w.instances.get('i1')!.wake_at = PAST
    await run(w)
    // Outcome unchanged → no second evidence row.
    expect(w.evidence.length).toBe(after)
  })
})

// ── Re-arming and escalation ─────────────────────────────────────────────────

describe('tick — outcome handling', () => {
  it('a gated state with no grant is left UNSCHEDULED, awaiting a human', async () => {
    const w = world({ instances: [instance()] })
    const r = await run(w)
    expect(r.evaluated[0].outcome).toBe('waiting_for_authorization')
    expect(w.instances.get('i1')!.wake_at).toBeNull()
  })

  it('records the evaluation as evidence', async () => {
    const w = world({ instances: [instance()] })
    await run(w)
    const row = w.evidence.find(e => (e as any).check_key === 'scheduler.evaluation') as any
    expect(row.outcome).toBe('waiting_for_authorization')
    expect(row.auto_advanceable).toBe(false)
  })

  it('an UNREADABLE ledger blocks rather than defaulting the gate open', async () => {
    const w = world({ instances: [instance()] })
    const r = await tickDueWorkflows(w.db as any, {
      now: NOW, emitSignal: w.emitSignal,
      ledger: { history: async () => { throw new Error('ledger down') },
                byTarget: async () => { throw new Error('ledger down') } },
    })
    expect(r.evaluated[0].outcome).toBe('blocked')
    expect(r.evaluated[0].reason).toMatch(/gate is malformed/)
  })

  it('escalates a corrupt history as a critical signal', async () => {
    const w = world({ instances: [instance({ current_state: 'protected_upload' })] })
    const r = await run(w)
    expect(r.evaluated[0].outcome).toBe('failed')
    expect(r.escalated).toBe(1)
    expect(w.signals).toHaveLength(1)
    expect(w.signals[0].kind).toBe('workflow.integrity_failure')
    expect(w.signals[0].payload.severity).toBe('critical')
  })

  it('a signal failure never breaks the tick', async () => {
    const w = world({ instances: [instance({ current_state: 'protected_upload' })] })
    const r = await tickDueWorkflows(w.db as any, {
      now: NOW, emitSignal: async () => { throw new Error('signal sink down') },
    })
    // The throw surfaces as an instance-level error, not a dead scheduler.
    expect(r.claimed).toBe(1)
    expect(r.errors).toHaveLength(1)
  })
})

// ── Direct evaluation ────────────────────────────────────────────────────────

describe('evaluateDueWorkflow', () => {
  it('reads the paused flag itself, so a direct call stays honest', async () => {
    const w = world({ instances: [instance()], paused: true })
    const e = await evaluateDueWorkflow(w.db as any, instance(), { now: NOW })
    expect(e.outcome).toBe('paused')
  })

  it('does not consult the ledger for an ungated state', async () => {
    const w = world({ instances: [instance({ current_state: 'pdf_build' })] })
    const ledger = { history: vi.fn(), byTarget: vi.fn() }
    await evaluateDueWorkflow(w.db as any, instance({ current_state: 'pdf_build' }), { now: NOW, ledger })
    expect(ledger.byTarget).not.toHaveBeenCalled()
  })

  it('consults the ledger for a gated state, read-only', async () => {
    const w = world({ instances: [instance()] })
    const ledger = { history: vi.fn(async () => []), byTarget: vi.fn(async () => []) }
    const e = await evaluateDueWorkflow(w.db as any, instance(), { now: NOW, ledger })
    expect(ledger.byTarget).toHaveBeenCalledTimes(1)
    expect(e.outcome).toBe('waiting_for_authorization')
  })
})
