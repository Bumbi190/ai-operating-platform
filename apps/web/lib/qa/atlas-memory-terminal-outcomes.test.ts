/**
 * Atlas Memory Slice 2B-1 — terminal runtime outcomes.
 *
 * Two producers join the canonical event log, both recording only outcomes that
 * have already committed:
 *
 *   DRAIN — the three cancel branches Slice 2A deferred:
 *     • a legacy-runner step checkpoint that cancelled the run. The runner throws
 *       `CANCELLED` only after its own settle landed, but the error carries no
 *       proof, so the drain reads the row back: `cancelled` AND this claim.
 *     • a cancellation winning the final success write (done path), and
 *     • the same on the awaiting-approval path. There `finalizeOwnedRunUnlessCancelled`
 *       returns CANCELLED only when its conditional cancel changed the row.
 *   WORKFLOW — an instance that completed. The only terminal state any shipped
 *     definition declares is `complete`; the append RPC closes the instance in the
 *     same statement, so completion is read back rather than inferred, and the
 *     transition id is the event's identity.
 *
 * The REAL recordMemoryEvent runs (ATLAS_MEMORY=1). The fake wrapper answers on a
 * later timer tick, so an event is only stored if the producer awaited it, and it
 * mirrors the two database rules that matter — the (source, source_id,
 * event_type) unique index and the project-scope CHECK — which are proven in real
 * Postgres by atlas-memory-emit-idempotency-sql.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { advanceCompletedWorkflowState, recordWorkflowCompletion } from '../workflows/advance-completed'
import { advanceAuthorizedWorkflow } from '../workflows/advance'
import { computeEvidenceTargetHash } from '../workflows/attestation'
import { parseWorkflowSpec } from '../workflows/spec'

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// ── Shared M4 wrapper double ─────────────────────────────────────────────────

interface StoredEvent {
  source: unknown; source_id: unknown; event_type: unknown; scope: unknown
  project_id: unknown; entity_kind: unknown; entity_id: unknown
  subject: unknown; content: unknown; structured: Record<string, unknown>
}
let memoryEvents: StoredEvent[]
let wrapperCalls: number
let wrapperFault: 'none' | 'error' | 'throw'
const WRAPPER_LATENCY_MS = 25

async function atlasRecordEvent(p: Record<string, unknown>) {
  wrapperCalls++
  await new Promise((r) => setTimeout(r, WRAPPER_LATENCY_MS))
  if (wrapperFault === 'throw') throw new Error('connection reset by peer')
  if (wrapperFault === 'error') return { data: null, error: { message: 'wrapper unavailable' } }
  if ((p.p_scope === 'project') !== (p.p_project_id != null)) {
    return { data: null, error: { message: 'violates check constraint "memory_events_project_scope"' } }
  }
  if (p.p_source_id != null && memoryEvents.some((e) =>
    e.source === p.p_source && e.source_id === p.p_source_id && e.event_type === p.p_event_type)) {
    return { data: null, error: null }
  }
  memoryEvents.push({
    source: p.p_source, source_id: p.p_source_id, event_type: p.p_event_type, scope: p.p_scope,
    project_id: p.p_project_id, entity_kind: p.p_entity_kind, entity_id: p.p_entity_id,
    subject: p.p_subject, content: p.p_content, structured: (p.p_structured ?? {}) as Record<string, unknown>,
  })
  return { data: `evt-${memoryEvents.length}`, error: null }
}

// ── Drain harness ────────────────────────────────────────────────────────────

const PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const RUN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const CLAIM = 'claim-ours'
const CRON = 'cron-secret-under-test'

let claimQueue: Record<string, unknown>[]
let runsTable: Map<string, Record<string, unknown>>
let approvalUpdates: Record<string, unknown>[]
let lifecycleWrites: Record<string, unknown>[]
/** What the legacy runner throws for the claimed run (null = runs cleanly). */
let runnerThrows: Error | null
/** What finalizeOwnedRunUnlessCancelled answers, keyed by the transition it attempts. */
let finalize: { done: string; awaiting_approval: string }

function refusal(r: 'CANCELLED' | 'FENCED' | 'STOPPED'): Error {
  return Object.assign(new Error(`run checkpoint refused (${r}): test`), {
    name: 'RunCheckpointRefusedError', refusal: r, boundary: 'legacy:step:1',
  })
}

class QueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  private mode: 'select' | 'update' | 'insert' | null = null
  private filters: Record<string, unknown> = {}
  private payload: Record<string, unknown> | null = null
  constructor(private readonly table: string) {}
  select() { if (this.mode === null) this.mode = 'select'; return this }
  update(v: Record<string, unknown>) { this.mode = 'update'; this.payload = v; return this }
  insert(v: Record<string, unknown>) { this.mode = 'insert'; this.payload = v; return this }
  eq(c: string, v: unknown) { this.filters[c] = v; return this }
  in() { return this }
  lt() { return this }
  order() { return this }
  limit() { return this }
  private result(): { data: unknown; error: unknown } {
    switch (this.table) {
      case 'runs':
        if (this.mode === 'update') { lifecycleWrites.push(this.payload ?? {}); return { data: [], error: null } }
        return { data: runsTable.get(String(this.filters.id)) ?? null, error: null }
      case 'approvals':
        if (this.mode === 'update') { approvalUpdates.push({ set: this.payload, where: { ...this.filters } }); return { data: null, error: null } }
        if (this.mode === 'insert') return { data: null, error: null }
        return { data: null, error: null }
      case 'workflows':
        return { data: { steps: [], name: 'wf', projects: { name: 'p' } }, error: null }
      case 'run_logs':
        return { data: null, error: null }
      default:
        throw new Error(`unexpected table: ${this.table}`)
    }
  }
  async single() { return this.result() }
  async maybeSingle() { return this.result() }
  then<R1 = { data: unknown; error: unknown }, R2 = never>(
    ok?: ((v: { data: unknown; error: unknown }) => R1 | PromiseLike<R1>) | null,
    bad?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.result()).then(ok, bad)
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => new QueryBuilder(t),
    rpc: async (name: string, params: Record<string, unknown>) => {
      if (name === 'atlas_record_event') return atlasRecordEvent(params)
      if (name === 'claim_runs') { const out = claimQueue; claimQueue = []; return { data: out, error: null } }
      return { data: null, error: null }
    },
  }),
}))
vi.mock('@/lib/ai/workflow-runner', () => ({
  runSteps: async () => { if (runnerThrows) throw runnerThrows },
}))
vi.mock('@/lib/ai/workflow-executor', () => ({
  executeRunSteps: async () => ({ outputContent: 'draft output', lastOutputKey: 'draft' }),
}))
vi.mock('@/lib/ai/checkpoint', () => ({ computeCheckpoint: async () => ({ startFromOrder: 0, existingContext: {} }) }))
vi.mock('@/lib/ai/policy-gate', () => ({ decideGate: () => 'awaiting_approval' }))
vi.mock('@/lib/ai/fencing', () => ({
  fencedRunUpdate: async (_db: unknown, _id: string, _c: unknown, patch: Record<string, unknown>) => {
    lifecycleWrites.push(patch); return { fenced: false }
  },
  isFencedError: () => false,
}))
vi.mock('@/lib/ai/cancel', () => ({ isCancelledError: () => false }))
vi.mock('@/lib/marketing/workflows', () => ({ MARKETING_HANDLERS: {}, isMarketingRun: () => false }))
vi.mock('@/lib/email/brevo', () => ({ sendAdminNotification: async () => {} }))
vi.mock('@/lib/email/templates', () => ({ getApprovalPendingEmail: () => ({ subject: '', html: '' }) }))
vi.mock('@/lib/workflows/action-executor', () => ({
  isWorkflowActionRun: (run: { workflow_instance_id?: string | null }) => run.workflow_instance_id != null,
  executeWorkflowAction: async () => ({ executed: true, detail: 'unused' }),
}))
vi.mock('@/lib/governance/run-execution-checkpoint', () => ({
  checkpointClaimedRun: async () => ({ allowed: true, detail: 'owned' }),
  settleRefusal: async () => 'STOPPED',
  terminalizeCancelledRun: async () => 'CANCELLED',
  recordDispatchUnknown: async () => 'UNKNOWN_WRITTEN',
  isRunCheckpointRefusal: (e: { name?: string }) => e?.name === 'RunCheckpointRefusedError',
  isRunLifecycleWriteError: (e: { name?: string }) => e?.name === 'RunLifecycleWriteError',
  checkOwnedFinalization: async () => 'CONTINUE_FINALIZATION',
  finalizeOwnedRunUnlessCancelled: async (_db: unknown, id: string, _c: unknown, payload: { status: 'done' | 'awaiting_approval' }) => {
    const outcome = finalize[payload.status]
    // A landed cancel is what the real function reports as CANCELLED.
    if (outcome === 'CANCELLED') runsTable.set(id, { ...runsTable.get(id), status: 'cancelled' })
    return { outcome, detail: `test ${outcome}` }
  },
}))
// Human-gated workflow path: the gate is granted; everything else stays real.
const AUTH_ID = '99999999-9999-4999-8999-999999999999'
let gateStatus: 'authorized' | 'pending'
vi.mock('@/lib/workflows/system-authorization', () => ({
  systemDeriveWorkflowGate: async () => gateStatus === 'authorized'
    ? { canAdvance: true, status: 'authorized', authorizationId: AUTH_ID }
    : { canAdvance: false, status: 'pending', authorizationId: null },
  systemAuthorizationVerifier: async () => ({ valid: true, status: 'authorized', reason: 'granted in test' }),
}))

/** The drain reads its executor flags at module load, so each configuration is its own import. */
async function loadDrain(flags: { unified: boolean }) {
  const prior = { u: process.env.H1_UNIFIED_EXECUTOR, p: process.env.H1_POLICY_GATE }
  if (flags.unified) { process.env.H1_UNIFIED_EXECUTOR = '1'; process.env.H1_POLICY_GATE = '1' }
  else { delete process.env.H1_UNIFIED_EXECUTOR; delete process.env.H1_POLICY_GATE }
  vi.resetModules()
  const mod = await import('@/app/api/runs/drain/route')
  if (prior.u === undefined) delete process.env.H1_UNIFIED_EXECUTOR; else process.env.H1_UNIFIED_EXECUTOR = prior.u
  if (prior.p === undefined) delete process.env.H1_POLICY_GATE; else process.env.H1_POLICY_GATE = prior.p
  return mod.GET
}

function claim(over: Record<string, unknown> = {}) {
  const run = { id: RUN_ID, project_id: PROJECT, status: 'running', claim_id: CLAIM, cancel_requested: false,
                kind: 'generic', attempts: 1, max_attempts: 3, workflow_id: 'wf-1', steps_snapshot: [],
                input: {}, workflow_instance_id: null, policy_class: null, ...over }
  runsTable.set(String(run.id), { ...run })
  claimQueue.push(run)
  return run
}
/** What the runner's own settle did to the row before it threw. */
const landCancel = (claimId = CLAIM) =>
  runsTable.set(RUN_ID, { ...runsTable.get(RUN_ID), status: 'cancelled', claim_id: claimId })

type DrainGet = (r: Request) => Promise<Response>
const call = async (get: DrainGet, query = '') => {
  const res = await get(new Request(`http://localhost/api/runs/drain${query}`, { headers: { authorization: `Bearer ${CRON}` } }))
  return { res, body: (await res.json()) as { ok: boolean; results: { status: string }[] } }
}
const cancelEvents = () => memoryEvents.filter((e) => e.subject === 'Run outcome: cancelled')

const ENV = ['ATLAS_MEMORY', 'CRON_SECRET'] as const
const priorEnv: Record<string, string | undefined> = {}
beforeEach(() => {
  for (const k of ENV) priorEnv[k] = process.env[k]
  process.env.ATLAS_MEMORY = '1'
  process.env.CRON_SECRET = CRON
  memoryEvents = []; wrapperCalls = 0; wrapperFault = 'none'
  claimQueue = []; runsTable = new Map(); approvalUpdates = []; lifecycleWrites = []
  runnerThrows = null
  finalize = { done: 'SUCCEEDED', awaiting_approval: 'SUCCEEDED' }
  gateStatus = 'authorized'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  for (const k of ENV) { if (priorEnv[k] === undefined) delete process.env[k]; else process.env[k] = priorEnv[k] }
  vi.restoreAllMocks()
})

// ── 1. Legacy-runner step checkpoint ─────────────────────────────────────────

describe('2B-1 · drain — cancelled at a legacy-runner step checkpoint', () => {
  it('records the cancelled outcome once the row proves this worker cancelled it', async () => {
    const drain = await loadDrain({ unified: false })
    claim(); runnerThrows = refusal('CANCELLED'); landCancel()
    const { res, body } = await call(drain)
    expect(res.status).toBe(200)
    expect(body.results[0].status).toBe('cancelled')
    expect(memoryEvents).toHaveLength(1) // present at response time: the emit was awaited
    expect(memoryEvents[0]).toMatchObject({
      source: 'drain', source_id: RUN_ID, event_type: 'outcome', scope: 'project',
      project_id: PROJECT, entity_kind: 'run', entity_id: RUN_ID, subject: 'Run outcome: cancelled',
    })
    expect(memoryEvents[0].structured).toMatchObject({ runId: RUN_ID, status: 'cancelled', error: null })
  })

  it('a FENCED checkpoint records nothing', async () => {
    const drain = await loadDrain({ unified: false })
    claim(); runnerThrows = refusal('FENCED')
    const { body } = await call(drain)
    expect(body.results[0].status).toBe('fenced')
    expect(memoryEvents).toEqual([])
  })

  it('a FENCED checkpoint records nothing even if the row looks like ours — both proofs are required', async () => {
    const drain = await loadDrain({ unified: false })
    claim(); runnerThrows = refusal('FENCED'); landCancel()
    await call(drain)
    expect(memoryEvents).toEqual([])
  })

  it('a failed cancellation write (ERROR → lifecycle error) records nothing', async () => {
    const drain = await loadDrain({ unified: false })
    claim(); runnerThrows = Object.assign(new Error('run lifecycle write failed'), { name: 'RunLifecycleWriteError' })
    const { body } = await call(drain)
    expect(body.results[0].status).toBe('lifecycle_error')
    expect(memoryEvents).toEqual([])
  })

  it('a cancellation that belongs to another claim records nothing', async () => {
    const drain = await loadDrain({ unified: false })
    claim(); runnerThrows = refusal('CANCELLED'); landCancel('claim-someone-else')
    await call(drain)
    expect(memoryEvents).toEqual([])
  })

  it('a CANCELLED refusal whose write never landed (row still running) records nothing', async () => {
    const drain = await loadDrain({ unified: false })
    claim(); runnerThrows = refusal('CANCELLED')
    await call(drain)
    expect(memoryEvents).toEqual([])
  })

  it('a STOPPED checkpoint records nothing', async () => {
    const drain = await loadDrain({ unified: false })
    claim(); runnerThrows = refusal('STOPPED')
    const { body } = await call(drain)
    expect(body.results[0].status).toBe('deferred_by_stop')
    expect(memoryEvents).toEqual([])
  })
})

// ── 2. Final success write, done path ────────────────────────────────────────

describe('2B-1 · drain — cancellation wins the final success write (done path)', () => {
  it('records the cancelled outcome once the conditional cancel landed', async () => {
    const drain = await loadDrain({ unified: false })
    claim(); finalize.done = 'CANCELLED'
    const { body } = await call(drain)
    expect(body.results[0].status).toBe('cancelled')
    expect(memoryEvents).toHaveLength(1)
    expect(memoryEvents[0]).toMatchObject({ source: 'drain', source_id: RUN_ID, subject: 'Run outcome: cancelled', project_id: PROJECT })
  })

  it('a successful finish records its done outcome and nothing extra', async () => {
    const drain = await loadDrain({ unified: false })
    claim()
    const { body } = await call(drain)
    expect(body.results[0].status).toBe('done')
    expect(memoryEvents.map((e) => e.subject)).toEqual(['Run outcome: done'])
  })

  it.each(['FENCED', 'ERROR'])('a %s final write records nothing', async (outcome) => {
    const drain = await loadDrain({ unified: false })
    claim(); finalize.done = outcome
    await call(drain)
    expect(memoryEvents).toEqual([])
  })
})

// ── 3. Final success write, awaiting-approval path ──────────────────────────

describe('2B-1 · drain — cancellation wins the awaiting-approval write', () => {
  it('records the cancelled outcome after the approval is returned', async () => {
    const drain = await loadDrain({ unified: true })
    claim(); finalize.awaiting_approval = 'CANCELLED'
    const { body } = await call(drain)
    expect(body.results[0].status).toBe('cancelled')
    expect(approvalUpdates).toEqual([expect.objectContaining({
      set: expect.objectContaining({ status: 'returned' }), where: { run_id: RUN_ID, status: 'pending' },
    })])
    expect(memoryEvents).toHaveLength(1)
    expect(memoryEvents[0]).toMatchObject({ source: 'drain', source_id: RUN_ID, subject: 'Run outcome: cancelled', project_id: PROJECT })
    expect(String(memoryEvents[0].content)).toContain('before approval')
  })

  it('a run that reaches awaiting_approval records nothing — it is not terminal', async () => {
    const drain = await loadDrain({ unified: true })
    claim()
    const { body } = await call(drain)
    expect(body.results[0].status).toBe('awaiting_approval')
    expect(memoryEvents).toEqual([])
  })

  it.each(['FENCED', 'ERROR'])('a %s awaiting-approval write records nothing', async (outcome) => {
    const drain = await loadDrain({ unified: true })
    claim(); finalize.awaiting_approval = outcome
    await call(drain)
    expect(memoryEvents).toEqual([])
  })
})

// ── Drain: identity, scope and failure isolation ─────────────────────────────

describe('2B-1 · drain — dedupe, scope and failure isolation', () => {
  it('a run cancelled again after reclaim or reprocessing stays one event', async () => {
    const legacy = await loadDrain({ unified: false })
    claim(); runnerThrows = refusal('CANCELLED'); landCancel()
    await call(legacy)
    claim(); runnerThrows = refusal('CANCELLED'); landCancel()   // reclaimed and cancelled again
    await call(legacy)
    runnerThrows = null
    claim(); finalize.done = 'CANCELLED'                           // reprocessed through the final write
    await call(legacy)
    const unified = await loadDrain({ unified: true })
    claim(); finalize.awaiting_approval = 'CANCELLED'              // and through the approval write
    await call(unified)
    expect(wrapperCalls).toBe(4)
    expect(cancelEvents()).toHaveLength(1)
  })

  it('the event project comes from the run, never from the request', async () => {
    const drain = await loadDrain({ unified: false })
    claim(); finalize.done = 'CANCELLED'
    await call(drain, `?project_id=${FOREIGN}&projectId=${FOREIGN}`)
    expect(memoryEvents[0].project_id).toBe(PROJECT)
    expect(JSON.stringify(memoryEvents)).not.toContain(FOREIGN)
  })

  it.each(['throw', 'error'] as const)('a memory failure (%s) changes neither run state nor the drain response', async (fault) => {
    wrapperFault = fault
    const legacy = await loadDrain({ unified: false })
    claim(); runnerThrows = refusal('CANCELLED'); landCancel()
    const a = await call(legacy)
    runnerThrows = null
    claim(); finalize.done = 'CANCELLED'
    const b = await call(legacy)
    const unified = await loadDrain({ unified: true })
    claim(); finalize.awaiting_approval = 'CANCELLED'
    const c = await call(unified)
    for (const r of [a, b, c]) {
      expect(r.res.status).toBe(200)
      expect(r.body.results[0].status).toBe('cancelled')
    }
    expect(lifecycleWrites).toEqual([])            // no failure accounting ran
    expect(runsTable.get(RUN_ID)?.status).toBe('cancelled')
    expect(memoryEvents).toEqual([])
  })

  it('an unreadable row on the checkpoint path records nothing and never escapes the drain', async () => {
    const drain = await loadDrain({ unified: false })
    claim(); runnerThrows = refusal('CANCELLED')
    runsTable = new Proxy(runsTable, { get: (t, k) => k === 'get' ? () => { throw new Error('socket hang up') } : Reflect.get(t, k).bind?.(t) ?? Reflect.get(t, k) })
    const { res, body } = await call(drain)
    expect(res.status).toBe(200)
    expect(body.results[0].status).toBe('cancelled')
    expect(memoryEvents).toEqual([])
  })
})

// ── Workflow harness (real definitions, real store/machine, fake database) ──

const PV = 'omnira.probe-validation'
const FS = 'familje-stunden.monthly-release'
const PROBE_CHECK = 'anonymous_protected_access_denied'
const INSTANCE_ID = '00000000-0000-4000-8000-00000000c0de'
const DEF_ID = '00000000-0000-4000-8000-0000000000de'
const WF_PROJECT = '00000000-0000-4000-8000-0000000000b1'

function loadSpec(defKey: string) {
  const raw = JSON.parse(fs.readFileSync(path.join(WEB_ROOT, `lib/workflows/definitions/${defKey}.v1.json`), 'utf8'))
  const parsed = parseWorkflowSpec(raw)
  if (!parsed.ok) throw new Error(`${defKey} does not parse: ${parsed.errors.join('; ')}`)
  return parsed.spec
}
const spec: Record<string, ReturnType<typeof loadSpec>> = { [PV]: loadSpec(PV), [FS]: loadSpec(FS) }

function chainTo(defKey: string, target: string) {
  const s = spec[defKey]
  const out: Record<string, unknown>[] = []
  let seq = 1
  let cur: string | null = s.initial_state
  out.push({ id: 't1', seq: seq++, instance_id: INSTANCE_ID, from_state: null, to_state: cur, reason: 'open',
             actor: 'test', evidence_ref: null, authorization_id: null, occurred_at: '2026-01-01T00:00:00.000Z' })
  while (cur && cur !== target) {
    const st = s.states.find((x) => x.id === cur)
    if (!st?.next_state) throw new Error(`no path to ${target}`)
    out.push({ id: `t${seq}`, seq, instance_id: INSTANCE_ID, from_state: cur, to_state: st.next_state,
               reason: 'advance', actor: 'test', evidence_ref: null, authorization_id: null,
               occurred_at: `2026-01-01T00:00:${String(seq).padStart(2, '0')}.000Z` })
    seq += 1
    cur = st.next_state
  }
  return out
}

function inst(defKey: string, state: string, over: Record<string, unknown> = {}) {
  return {
    id: INSTANCE_ID, def_id: DEF_ID, def_key: defKey, def_version: 1, def_hash: 'a'.repeat(64),
    project_id: WF_PROJECT, instance_key: defKey === PV ? 'capability-validation-1' : '2099-01',
    current_state: state, status: 'active', wake_at: null, last_tick_at: null, last_tick_outcome: null,
    created_at: '2026-01-01T00:00:00.000Z', closed_at: null, ...over,
  }
}

function ev(defKey: string, state: string, checkKey: string, result: string) {
  return {
    id: `ev-${checkKey}`, instance_id: INSTANCE_ID, state, check_key: checkKey, result, source: 'automated',
    detail: {}, recorded_at: '2026-01-02T00:00:00.000Z', producer: null, producer_type: null,
    observed_at: null, payload_hash: null, attestation: {},
    target_hash: computeEvidenceTargetHash({ instance: inst(defKey, state) as never, spec: spec[defKey], state,
      checkKey, sourceCommit: null, artifactManifestHash: null }),
  }
}
const terminalRun = { id: 'run-1', status: 'done', attempts: 1, max_attempts: 5,
  created_at: '2026-01-02T00:00:00.000Z', action_outcome: 'SUCCEEDED', reconciliation_required: false }

/**
 * `stored` is the CANONICAL instance row. The append RPC advances it exactly as
 * workflow_append_transition does: current_state moves, and a state with no
 * successor closes the instance ('complete' + closed_at) in the same statement.
 */
function wfDb(stored: Record<string, unknown>, defKey: string, f: { evidence?: unknown[]; appendError?: string } = {}) {
  const rpcs: string[] = []
  let seq = 100
  const def = { id: DEF_ID, def_key: defKey, version: 1, def_hash: stored.def_hash, spec: spec[defKey], created_at: stored.created_at }
  const resolve = (q: Record<string, any>) => {
    switch (q._table) {
      case 'workflow_instances': return { data: stored, error: null }
      case 'projects': return { data: { execution_paused: false }, error: null }
      case 'workflow_defs': return { data: def, error: null }
      case 'workflow_evidence': return { data: f.evidence ?? [], error: null }
      case 'workflow_transitions': return { data: chainTo(defKey, stored.current_state as string), error: null }
      case 'runs': return { data: [terminalRun], error: null }
      default: return { data: null, error: null }
    }
  }
  const db = {
    rpcs,
    rpc: async (name: string, a: Record<string, unknown>) => {
      rpcs.push(name)
      if (name === 'atlas_record_event') return atlasRecordEvent(a)
      if (name !== 'workflow_append_transition') return { data: null, error: null }
      if (f.appendError) return { data: null, error: { message: f.appendError } }
      const to = a.p_to_state as string
      const terminal = !spec[defKey].states.find((s) => s.id === to)?.next_state
      stored.current_state = to
      if (terminal) { stored.status = 'complete'; stored.closed_at = '2026-01-03T00:00:00.000Z' }
      return { data: { id: `tr-${++seq}`, seq, instance_id: stored.id, from_state: a.p_from_state, to_state: to,
        reason: a.p_reason, actor: a.p_actor, evidence_ref: null, authorization_id: a.p_authorization_id ?? null,
        occurred_at: '2026-01-03T00:00:00.000Z' }, error: null }
    },
    from(table: string) {
      const q: Record<string, any> = { _table: table }
      const self = () => q
      q.select = self; q.eq = self; q.not = self; q.order = self; q.limit = self; q.in = self
      q.insert = self; q.update = self
      q.maybeSingle = async () => resolve(q)
      q.single = async () => resolve(q)
      q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(resolve(q)).then(ok, bad)
      return q
    },
  }
  return db
}
const probeDb = (stored = inst(PV, 'probe'), f: { evidence?: unknown[]; appendError?: string } = {}) =>
  wfDb(stored, PV, { evidence: [ev(PV, 'probe', PROBE_CHECK, 'pass')], ...f })

// ── 4. Workflow completion ───────────────────────────────────────────────────

describe('2B-1 · workflow — completion is recorded, and only completion', () => {
  it('an automated completion records one outcome keyed by the transition id', async () => {
    const stored = inst(PV, 'probe')
    const db = probeDb(stored)
    const r = await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
    expect(r.outcome).toBe('advanced')
    expect(stored.status).toBe('complete')
    expect(memoryEvents).toHaveLength(1) // present when the advance returns: the emit was awaited
    expect(memoryEvents[0]).toMatchObject({
      source: 'workflow', source_id: 'tr-101', event_type: 'outcome', scope: 'project',
      project_id: WF_PROJECT, entity_kind: 'workflow_instance', entity_id: INSTANCE_ID,
      subject: 'Workflow outcome: complete',
    })
    expect(memoryEvents[0].structured).toEqual({
      instanceId: INSTANCE_ID, defKey: PV, defVersion: 1, fromState: 'probe', toState: 'complete',
      transitionId: 'tr-101', actor: 'omnira.workflow.scheduler', authorized: false,
    })
  })

  it('a human-gated completion records authorized: true and never the authorization id', async () => {
    const stored = inst(FS, 'social')
    const db = wfDb(stored, FS)
    const r = await advanceAuthorizedWorkflow(db as never, inst(FS, 'social') as never)
    expect(r.outcome).toBe('advanced')
    expect(memoryEvents).toHaveLength(1)
    expect(memoryEvents[0]).toMatchObject({ source: 'workflow', subject: 'Workflow outcome: complete', project_id: WF_PROJECT })
    expect(memoryEvents[0].structured.authorized).toBe(true)
    expect(memoryEvents[0].structured).not.toHaveProperty('authorizationId')
    expect(JSON.stringify(memoryEvents)).not.toContain(AUTH_ID)
  })

  it('the same completion processed twice is one event', async () => {
    const stored = inst(PV, 'probe')
    const db = probeDb(stored)
    await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
    const transition = { id: 'tr-101', seq: 101, instance_id: INSTANCE_ID, from_state: 'probe', to_state: 'complete',
      reason: 'x', actor: 'omnira.workflow.scheduler', evidence_ref: null, authorization_id: null,
      occurred_at: '2026-01-03T00:00:00.000Z' }
    await recordWorkflowCompletion(db as never, inst(PV, 'probe') as never, transition)
    expect(wrapperCalls).toBe(2)
    expect(memoryEvents).toHaveLength(1)
  })

  it('a completed instance refuses a second transition, so nothing more is recorded', async () => {
    const stored = inst(PV, 'probe')
    const db = probeDb(stored)
    await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
    const again = await advanceCompletedWorkflowState(db as never, { ...stored } as never)
    expect(again.outcome).toBe('inactive_instance')
    expect(memoryEvents).toHaveLength(1)
  })

  it('an intermediate transition records nothing', async () => {
    // newsletter → social: gated, no required checks, and not terminal.
    const stored = inst(FS, 'newsletter')
    const db = wfDb(stored, FS)
    const r = await advanceAuthorizedWorkflow(db as never, inst(FS, 'newsletter') as never)
    expect(r.outcome).toBe('advanced')
    expect(stored.status).toBe('active')
    expect(memoryEvents).toEqual([])
  })

  it('a refused append records nothing', async () => {
    const db = probeDb(inst(PV, 'probe'), { appendError: 'stale transition' })
    const r = await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
    expect(r.outcome).toBe('append_refused')
    expect(memoryEvents).toEqual([])
  })

  it('a blocked tick records nothing and appends nothing', async () => {
    const db = probeDb(inst(PV, 'probe'), { evidence: [ev(PV, 'probe', PROBE_CHECK, 'blocked')] })
    const r = await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
    expect(r.outcome).not.toBe('advanced')
    expect(db.rpcs).not.toContain('workflow_append_transition')
    expect(memoryEvents).toEqual([])
  })

  it('a gate that is not yet granted (the wait/retry path) records nothing', async () => {
    gateStatus = 'pending'
    const db = wfDb(inst(FS, 'social'), FS)
    const r = await advanceAuthorizedWorkflow(db as never, inst(FS, 'social') as never)
    expect(r.outcome).toBe('not_authorized')
    expect(memoryEvents).toEqual([])
  })

  it('the project comes from the stored instance, not the caller’s copy', async () => {
    const db = probeDb(inst(PV, 'probe'))
    await advanceCompletedWorkflowState(db as never, inst(PV, 'probe', { project_id: FOREIGN }) as never)
    expect(memoryEvents).toHaveLength(1)
    expect(memoryEvents[0].project_id).toBe(WF_PROJECT)
    expect(JSON.stringify(memoryEvents)).not.toContain(FOREIGN)
  })

  it.each(['throw', 'error'] as const)('a memory failure (%s) leaves the transition committed and the advance result intact', async (fault) => {
    wrapperFault = fault
    const stored = inst(PV, 'probe')
    const db = probeDb(stored)
    const r = await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
    expect(r.outcome).toBe('advanced')
    expect(r.toState).toBe('complete')
    expect(db.rpcs).toContain('workflow_append_transition')
    expect(stored.status).toBe('complete')
    expect(memoryEvents).toEqual([])
  })

  it('an unreadable instance after the append records nothing and never becomes a failed advance', async () => {
    const stored = inst(PV, 'probe')
    const db = probeDb(stored)
    const realFrom = db.from.bind(db)
    let appended = false
    const origRpc = db.rpc
    db.rpc = async (n: string, a: Record<string, unknown>) => { const out = await origRpc(n, a); if (n === 'workflow_append_transition') appended = true; return out }
    db.from = (t: string) => { if (appended && t === 'workflow_instances') throw new Error('socket hang up'); return realFrom(t) }
    const r = await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
    expect(r.outcome).toBe('advanced')
    expect(memoryEvents).toEqual([])
  })
})

// ── Static contracts: placement, boundaries, scope of this slice ────────────

function codeOnly(src: string): string {
  let out = ''; let i = 0; let q: string | null = null
  while (i < src.length) {
    const c = src[i]; const n = src[i + 1]
    if (q) { out += c; if (c === '\\') { out += n ?? ''; i += 2; continue } if (c === q) q = null; i++; continue }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    if (c === '"' || c === "'" || c === '`') q = c
    out += c; i++
  }
  return out
}
const read = (rel: string) => fs.readFileSync(path.join(WEB_ROOT, rel), 'utf8')
const MEMORY_IMPORT = /lib\/atlas\/memory\/|recordMemoryEvent|recallMemories/

/** Runtime import graph from an entry file (type-only imports excluded). */
function importGraph(entry: string): Set<string> {
  const seen = new Set<string>()
  const stack = [path.join(WEB_ROOT, entry)]
  const spec = /(?:^|[^\w$])(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
  while (stack.length) {
    const file = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    let src = ''
    try { src = codeOnly(fs.readFileSync(file, 'utf8')) } catch { continue }
    for (const m of src.matchAll(spec)) {
      const s = m[1] ?? m[2]
      const base = s.startsWith('@/') ? path.join(WEB_ROOT, s.slice(2)) : s.startsWith('.') ? path.resolve(path.dirname(file), s) : null
      if (!base) continue
      const hit = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((c) => fs.existsSync(c) && fs.statSync(c).isFile())
      if (hit) stack.push(hit)
    }
  }
  return new Set([...seen].map((f) => path.relative(WEB_ROOT, f)))
}

describe('2B-1 · placement and boundaries', () => {
  it('the workflow emitter is not in store.ts, which authorization and read paths import', () => {
    expect(codeOnly(read('lib/workflows/store.ts'))).not.toMatch(MEMORY_IMPORT)
  })

  it('in the workflow runtime only advance-completed.ts writes memory, and nothing reads it back', () => {
    const dir = path.join(WEB_ROOT, 'lib/workflows')
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
    const writers = walk(dir).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))
      .filter((f) => /recordMemoryEvent\(/.test(codeOnly(fs.readFileSync(f, 'utf8'))))
      .map((f) => path.relative(WEB_ROOT, f))
    expect(writers).toEqual(['lib/workflows/advance-completed.ts'])
    const readers = walk(dir).filter((f) => /\.ts$/.test(f))
      .filter((f) => /recallMemories|resolveMemoryContext|atlas_recall/.test(fs.readFileSync(f, 'utf8')))
    expect(readers).toEqual([])
  })

  it('chat reaches neither workflow advance module nor the memory write path (Boundary A)', () => {
    const graph = new Set([...importGraph('app/api/chat/route.ts'), ...importGraph('app/api/chat/tts/route.ts')])
    for (const m of ['lib/workflows/advance.ts', 'lib/workflows/advance-completed.ts', 'lib/atlas/memory/record-event.ts']) {
      expect(graph.has(m), m).toBe(false)
    }
  })

  it('no authority surface reaches memory, including workflow authorization (Boundary E)', () => {
    const surfaces = [
      'app/api/atlas/executive/authorization/route.ts', 'app/api/atlas/executive/decision/route.ts',
      'app/api/atlas/executive/mission/route.ts', 'lib/atlas/authorization/build.ts',
      'lib/atlas/authorization/derive.ts', 'lib/atlas/authorization/store.ts',
      'lib/atlas/delegation/attenuate.ts', 'lib/atlas/delegation/derive.ts', 'lib/atlas/delegation/store.ts',
      'lib/workflows/authorization.ts', 'lib/workflows/system-authorization.ts',
    ]
    for (const s of surfaces) {
      const hits = [...importGraph(s)].filter((f) => f.startsWith('lib/atlas/memory/') || /advance(-completed)?\.ts$/.test(f))
      expect(hits, s).toEqual([])
    }
  })

  it('the workflow event is an outcome, never a decision, and carries no authorization id', () => {
    const helper = codeOnly(read('lib/workflows/advance-completed.ts'))
    const body = helper.slice(helper.indexOf('async function recordWorkflowCompletion'), helper.indexOf('export async function advanceCompletedWorkflowState'))
    expect(body).toMatch(/eventType:\s*'outcome'/)
    expect(body).not.toMatch(/eventType:\s*'(decision|feedback|observation)'/)
    expect(body).toMatch(/authorized:\s*transition\.authorization_id !== null/)
    expect(body).not.toMatch(/authorization_id,|authorizationId:\s*transition/)
    expect(body).toMatch(/sourceId:\s*transition\.id/)
  })

  it('the three new drain emits are awaited and follow their canonical writes', () => {
    const drain = codeOnly(read('app/api/runs/drain/route.ts'))
    const checkpoint = drain.slice(drain.indexOf('if (isRunCheckpointRefusal(e)) {'))
    expect(checkpoint.slice(0, 600)).toMatch(/if \(e\.refusal === 'CANCELLED'\) await recordCheckpointCancelOutcome\(db, run\)/)
    const done = drain.slice(drain.indexOf("if (done.outcome === 'CANCELLED') {"))
    expect(done.slice(0, 900)).toMatch(/await recordMemoryEvent\(/)
    const appr = drain.slice(drain.indexOf("if (appr.outcome === 'CANCELLED') {"))
    const apprBlock = appr.slice(0, 1400)
    expect(apprBlock.indexOf("status: 'returned'")).toBeGreaterThan(-1)
    expect(apprBlock.indexOf('await recordMemoryEvent(')).toBeGreaterThan(apprBlock.indexOf("status: 'returned'"))
  })

  it('Dream and the media pipeline gained no memory producer in this slice', () => {
    for (const f of ['lib/ai/dream.ts', 'lib/atlas/dream.ts', 'app/api/media/cron/dream/route.ts',
                     'app/api/projects/[slug]/dream/route.ts', 'lib/media/run-log.ts']) {
      expect(codeOnly(read(f)), f).not.toMatch(MEMORY_IMPORT)
    }
    const media = path.join(WEB_ROOT, 'app/api/media')
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
    const mediaWriters = walk(media).filter((f) => /\.ts$/.test(f) && MEMORY_IMPORT.test(codeOnly(fs.readFileSync(f, 'utf8'))))
    expect(mediaWriters.map((f) => path.relative(WEB_ROOT, f))).toEqual([])
    expect(codeOnly(read('app/api/runs/drain/route.ts'))).not.toMatch(/media_pipeline/)
  })
})
