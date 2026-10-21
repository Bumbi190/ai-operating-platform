/**
 * Phase 3B1B — the bind seam with a CONTROLLED autonomy answer.
 *
 * `admitAutonomyAtBind` is replaced at its module boundary so the seam can be
 * driven through every outcome — including a licensed admission and a refusal
 * for a kind that passes every earlier gate — without a database. What is
 * proven here is the SEAM, not the decision (see autonomy-bind.test.ts):
 *
 *   • a refusal writes NOTHING: no RPC, no table write — no run, no trace;
 *   • the veto runs only AFTER every existing gate has passed; a run refused by
 *     an existing gate never even asks autonomy;
 *   • an admitted bind calls the ONE atomic RPC with identity only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('server-only', () => ({}))

const admitMock = vi.fn()
vi.mock('@/lib/atlas/autonomy-runtime/bind', () => ({
  admitAutonomyAtBind: (...a: unknown[]) => admitMock(...a),
}))

import { createWorkflowActionRun } from '@/lib/workflows/action-run'
import type { BindProvenance } from '@/lib/atlas/autonomy-runtime/bind'
import { BIND_RPC_PARAMS } from './bind-rpc-fake'

const INSTANCE = '00000000-0000-4000-8000-00000000c0de'
const PROJECT = '00000000-0000-4000-8000-0000000000b1'
const PROBE_DEF_KEY = 'omnira.probe-validation'
const PROBE_ACTION = 'probe_anonymous_protected_access'
const probeSpec = JSON.parse(readFileSync(
  join(process.cwd(), 'lib/workflows/definitions', `${PROBE_DEF_KEY}.v1.json`), 'utf8'))

function fakeDb(state = 'probe', paused = false) {
  const writes: string[] = []
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = []
  const instance = {
    id: INSTANCE, def_id: '00000000-0000-4000-8000-0000000000de',
    def_key: PROBE_DEF_KEY, def_version: 1, def_hash: 'a'.repeat(64),
    project_id: PROJECT, instance_key: 'fixture-1', current_state: state, status: 'active',
    wake_at: null, last_tick_at: null, last_tick_outcome: null,
    created_at: '2026-01-01T00:00:00.000Z', closed_at: null,
  }
  const def = { id: instance.def_id, def_key: PROBE_DEF_KEY, version: 1,
    def_hash: instance.def_hash, spec: probeSpec, created_at: instance.created_at }
  const resolve = (table: string) => {
    switch (table) {
      case 'workflow_instances': return { data: instance, error: null }
      case 'projects': return { data: { execution_paused: paused }, error: null }
      case 'workflow_defs': return { data: def, error: null }
      case 'workflow_evidence': return { data: [], error: null }
      default: return { data: null, error: null }
    }
  }
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      return { data: [{ bound_run_id: 'run-1', bind_event_id: 'evt-1' }], error: null }
    },
    from(table: string) {
      const q: Record<string, any> = {}
      const self = () => q
      q.select = self; q.eq = self; q.not = self; q.order = self; q.limit = self
      q.insert = () => { writes.push(`insert:${table}`); return q }
      q.update = () => { writes.push(`update:${table}`); return q }
      q.upsert = () => { writes.push(`upsert:${table}`); return q }
      q.maybeSingle = async () => resolve(table)
      q.single = async () => resolve(table)
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve(resolve(table)).then(ok)
      return q
    },
  }
  return { db, writes, rpcCalls }
}

const EXEMPT: BindProvenance = {
  policy_mode: 'license_exempt_observation', policy_reason: 'canonical_read_only_observation',
  reason: 'exempt_observation', required_level: 'L0',
}

beforeEach(() => admitMock.mockReset())

describe('refusal creates NOTHING', () => {
  it.each(['licensed_bind_not_serializable', 'licence_not_effective', 'action_not_in_licence_scope',
           'effective_level_below_required', 'unsupported_action', 'unknown_action_kind'])(
    '%s → autonomy_not_admitted, no RPC, no write', async reason => {
      admitMock.mockResolvedValue({ admitted: false, reason, detail: `autonomy: ${reason}` })
      const { db, writes, rpcCalls } = fakeDb()
      const r = await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION })
      expect(r).toMatchObject({ ok: false, refusal: 'autonomy_not_admitted' })
      expect(rpcCalls, 'no atomic bind was attempted → no run and no trace').toEqual([])
      expect(writes).toEqual([])
      expect(admitMock).toHaveBeenCalledWith(PROBE_ACTION, INSTANCE)
    })
})

describe('autonomy is an ADDITIONAL veto, after every existing gate', () => {
  it('a paused project is refused by the existing gate; autonomy is never asked', async () => {
    admitMock.mockResolvedValue({ admitted: true, provenance: EXEMPT })
    const { db, rpcCalls } = fakeDb('probe', true)
    const r = await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION })
    expect(r).toMatchObject({ ok: false, refusal: 'project_paused' })
    expect(admitMock).not.toHaveBeenCalled()
    expect(rpcCalls).toEqual([])
  })

  it('a state the definition does not have is refused first; an admitted autonomy answer cannot rescue it', async () => {
    admitMock.mockResolvedValue({ admitted: true, provenance: EXEMPT })
    const { db, rpcCalls } = fakeDb('no_such_state')
    const r = await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION })
    expect(r.ok).toBe(false)
    expect(admitMock).not.toHaveBeenCalled()
    expect(rpcCalls).toEqual([])
  })

  it('an unknown action kind is refused by the registry; autonomy is never asked', async () => {
    const { db, rpcCalls } = fakeDb()
    const r = await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: 'totally_made_up' })
    expect(r).toMatchObject({ ok: false, refusal: 'unknown_action_kind' })
    expect(admitMock).not.toHaveBeenCalled()
    expect(rpcCalls).toEqual([])
  })
})

describe('an admitted bind', () => {
  it('calls the ONE atomic RPC with the subject identity ONLY — never a classification or provenance claim', async () => {
    admitMock.mockResolvedValue({ admitted: true, provenance: EXEMPT })
    const { db, writes, rpcCalls } = fakeDb()
    const r = await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION })
    expect(r).toMatchObject({ ok: true, runId: 'run-1' })
    expect(writes).toEqual([])
    expect(rpcCalls).toHaveLength(1)
    const a = rpcCalls[0].args
    expect(Object.keys(a).sort()).toEqual([...BIND_RPC_PARAMS].sort())
    expect(a).toMatchObject({ p_action_kind: PROBE_ACTION, p_workflow_instance_id: INSTANCE, p_project_id: PROJECT })
  })

  it('a malformed RPC answer is not success', async () => {
    admitMock.mockResolvedValue({ admitted: true, provenance: EXEMPT })
    const { db } = fakeDb()
    ;(db as { rpc: unknown }).rpc = async () => ({ data: [{ bound_run_id: 'run-1' }], error: null })
    const r = await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION })
    expect(r).toMatchObject({ ok: false, refusal: 'insert_rejected' })
  })
})

// ── Phase 3B1B2 M4: a licensed V1 admission selects the licensed RPC ─────────

const LICENSED: BindProvenance = { policy_mode: 'licensed', admission_basis: 'db_conservative_proof_v1' }
/** The licensed RPC's ONLY parameters: identity, the pinned definition/state to CHECK, and the authorization. */
const LICENSED_RPC_PARAMS = [
  'p_workflow_instance_id', 'p_action_kind', 'p_workflow_def_hash', 'p_workflow_from_state',
  'p_target_version_hash', 'p_idempotency_key', 'p_attempt_group', 'p_authorization_id',
]

describe('a licensed admission (M4 V1)', () => {
  it('calls bind_licensed_workflow_action_run_v1 ONCE — no project, level, licence, Decision, ceiling, vector or anchor', async () => {
    admitMock.mockResolvedValue({ admitted: true, provenance: LICENSED })
    const { db, writes, rpcCalls } = fakeDb()
    const r = await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION })
    expect(r).toMatchObject({ ok: true, runId: 'run-1' })
    expect(writes).toEqual([])
    expect(rpcCalls.map(c => c.name)).toEqual(['bind_licensed_workflow_action_run_v1'])
    expect(Object.keys(rpcCalls[0].args).sort()).toEqual([...LICENSED_RPC_PARAMS].sort())
    expect(rpcCalls[0].args).toMatchObject({ p_workflow_instance_id: INSTANCE, p_action_kind: PROBE_ACTION,
      p_workflow_def_hash: 'a'.repeat(64), p_workflow_from_state: 'probe' })
  })

  it.each(['LB010', 'LB003', 'LB004', 'SV004', 'SV005', 'SV006', '40001'])(
    'a database refusal %s is autonomy_not_admitted — never success, never insert_rejected', async code => {
      admitMock.mockResolvedValue({ admitted: true, provenance: LICENSED })
      const { db } = fakeDb()
      ;(db as { rpc: unknown }).rpc = async () => ({ data: null, error: { code, message: 'refused' } })
      const r = await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION })
      expect(r).toMatchObject({ ok: false, refusal: 'autonomy_not_admitted' })
    })

  it('a duplicate identity stays duplicate_action_identity; any other error stays insert_rejected', async () => {
    admitMock.mockResolvedValue({ admitted: true, provenance: LICENSED })
    for (const [code, refusal] of [['23505', 'duplicate_action_identity'], ['22023', 'insert_rejected'], ['42501', 'insert_rejected']]) {
      const { db } = fakeDb()
      ;(db as { rpc: unknown }).rpc = async () => ({ data: null, error: { code, message: 'x' } })
      expect(await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION }), code)
        .toMatchObject({ ok: false, refusal })
    }
  })

  it('an EXEMPT admission never reaches the licensed RPC, and LB/SV codes from the exempt RPC are not reinterpreted', async () => {
    admitMock.mockResolvedValue({ admitted: true, provenance: EXEMPT })
    const { db, rpcCalls } = fakeDb()
    await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION })
    expect(rpcCalls.map(c => c.name)).toEqual(['bind_workflow_action_run'])
    const other = fakeDb()
    ;(other.db as { rpc: unknown }).rpc = async () => ({ data: null, error: { code: 'LB010', message: 'x' } })
    expect(await createWorkflowActionRun(other.db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION }))
      .toMatchObject({ ok: false, refusal: 'insert_rejected' })
  })
})
