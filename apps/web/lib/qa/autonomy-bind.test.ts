/**
 * Phase 3B1B — bind-time autonomy admission (behaviour).
 *
 * Two layers, both with the REAL canonical policy table and the REAL pure
 * admission core:
 *
 *   1. `admitAutonomyAtBind` — exempt kinds are admitted with bare provenance;
 *      licensed kinds FAIL CLOSED before any mutable authority input is read;
 *      unsupported and unknown kinds are refused. The licence resolver and the
 *      Survival reader are mocked only to prove they are NEVER called.
 *   2. `createWorkflowActionRun` — the bind seam, against a chainable fake DB:
 *      an admitted bind writes run + provenance through the ONE atomic RPC and
 *      never a bare `runs` insert.
 *
 * The SQL properties (atomicity, rollback, concurrency, privileges) are proven
 * against real PostgreSQL in `autonomy-bind-sql.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('server-only', () => ({}))

const resolveMock = vi.fn()
const survivalMock = vi.fn()
vi.mock('@/lib/atlas/autonomy-license/resolve', () => ({
  resolveAutonomyLicense: (...a: unknown[]) => resolveMock(...a),
}))
vi.mock('@/lib/atlas/autonomy-runtime/platform-survival', () => ({
  readPlatformSurvivalCeiling: (...a: unknown[]) => survivalMock(...a),
}))

import { admitAutonomyAtBind } from '@/lib/atlas/autonomy-runtime/bind'
import {
  AUTONOMY_RUNTIME_POLICY, LICENCE_EXEMPT_OBSERVATION_KINDS, NOT_EXECUTABLE_KINDS,
} from '@/lib/atlas/autonomy-runtime/policy'
import { createWorkflowActionRun } from '@/lib/workflows/action-run'
import { BIND_RPC, type RecordedWrite } from './bind-rpc-fake'

const INSTANCE = '00000000-0000-4000-8000-00000000c0de'
const LICENSED_KINDS = Object.entries(AUTONOMY_RUNTIME_POLICY)
  .filter(([, p]) => p.mode === 'licensed').map(([k]) => k)

beforeEach(() => {
  resolveMock.mockReset()
  survivalMock.mockReset()
})

// ── 1 · admitAutonomyAtBind ──────────────────────────────────────────────────

describe('licence-exempt observation', () => {
  it('admits WITHOUT consulting any mutable input, and records the bare exemption', async () => {
    for (const kind of LICENCE_EXEMPT_OBSERVATION_KINDS) {
      const r = await admitAutonomyAtBind(kind, INSTANCE)
      expect(r, kind).toEqual({
        admitted: true,
        provenance: {
          policy_mode: 'license_exempt_observation',
          policy_reason: 'canonical_read_only_observation',
          reason: 'exempt_observation',
          required_level: 'L0',
        },
      })
    }
    expect(resolveMock).not.toHaveBeenCalled()
    expect(survivalMock).not.toHaveBeenCalled()
  })
})

describe('licensed kinds FAIL CLOSED at bind (Phase 3B1B scope)', () => {
  it('there is at least one licensed kind, so this proof is not vacuous', () => {
    expect(LICENSED_KINDS.length).toBeGreaterThan(0)
  })

  it('every licensed kind is refused — even with an effective licence and an EXPAND ceiling on offer', async () => {
    // If bind.ts ever consulted these, a permissive answer would be available.
    resolveMock.mockResolvedValue({ effective: true, reason: 'active', allowedActionKinds: LICENSED_KINDS,
      resolvedLevel: 'L6', licensedLevel: 'L6' })
    survivalMock.mockResolvedValue({ ok: true, ceiling: 'L6', state: 'EXPAND', asOf: '2026-10-01T00:00:00Z' })
    for (const kind of LICENSED_KINDS) {
      const r = await admitAutonomyAtBind(kind, INSTANCE)
      expect(r, kind).toMatchObject({ admitted: false, reason: 'licensed_bind_not_serializable' })
    }
    // Refused BEFORE any licence, Decision Ledger or Survival read.
    expect(resolveMock).not.toHaveBeenCalled()
    expect(survivalMock).not.toHaveBeenCalled()
  })
})

describe('unsupported and unknown kinds', () => {
  it('every unsupported kind is refused, with no read', async () => {
    for (const kind of ['generate_monthly_story', ...NOT_EXECUTABLE_KINDS]) {
      const r = await admitAutonomyAtBind(kind, INSTANCE)
      expect(r, kind).toMatchObject({ admitted: false, reason: 'unsupported_action' })
    }
    expect(resolveMock).not.toHaveBeenCalled()
    expect(survivalMock).not.toHaveBeenCalled()
  })

  it('an unknown kind is refused, with no fallback policy', async () => {
    const r = await admitAutonomyAtBind('totally_made_up', INSTANCE)
    expect(r).toMatchObject({ admitted: false, reason: 'unknown_action_kind' })
  })

  it('the admitted set is EXACTLY the reviewed exempt list', async () => {
    const admitted: string[] = []
    for (const kind of Object.keys(AUTONOMY_RUNTIME_POLICY)) {
      if ((await admitAutonomyAtBind(kind, INSTANCE)).admitted) admitted.push(kind)
    }
    expect(admitted.sort()).toEqual([...LICENCE_EXEMPT_OBSERVATION_KINDS].sort())
  })
})

// ── 2 · the bind seam in createWorkflowActionRun ─────────────────────────────

const PROBE_DEF_KEY = 'omnira.probe-validation'
const PROBE_ACTION = 'probe_anonymous_protected_access'   // licence-exempt
const probeSpec = JSON.parse(readFileSync(
  join(process.cwd(), 'lib/workflows/definitions', `${PROBE_DEF_KEY}.v1.json`), 'utf8'))

function fakeDb(opts: { rpcError?: { code: string; message: string } } = {}) {
  const writes: RecordedWrite[] = []
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = []
  const instance = {
    id: INSTANCE, def_id: '00000000-0000-4000-8000-0000000000de',
    def_key: PROBE_DEF_KEY, def_version: 1, def_hash: 'a'.repeat(64),
    project_id: '00000000-0000-4000-8000-0000000000b1',
    instance_key: 'fixture-1', current_state: 'probe', status: 'active',
    wake_at: null, last_tick_at: null, last_tick_outcome: null,
    created_at: '2026-01-01T00:00:00.000Z', closed_at: null,
  }
  const def = { id: instance.def_id, def_key: PROBE_DEF_KEY, version: 1,
    def_hash: instance.def_hash, spec: probeSpec, created_at: instance.created_at }
  const resolve = (table: string) => {
    switch (table) {
      case 'workflow_instances': return { data: instance, error: null }
      case 'projects': return { data: { execution_paused: false }, error: null }
      case 'workflow_defs': return { data: def, error: null }
      case 'workflow_evidence': return { data: [], error: null }
      default: return { data: null, error: null }
    }
  }
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      if (opts.rpcError) return { data: null, error: opts.rpcError }
      return { data: [{ bound_run_id: 'run-1', bind_event_id: 'evt-1' }], error: null }
    },
    from(table: string) {
      const q: Record<string, any> = {}
      const self = () => q
      q.select = self; q.eq = self; q.not = self; q.order = self; q.limit = self
      q.insert = (row: Record<string, unknown>) => { writes.push({ table, row }); return q }
      q.update = (row: Record<string, unknown>) => { writes.push({ table, row }); return q }
      q.maybeSingle = async () => resolve(table)
      q.single = async () => resolve(table)
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve(resolve(table)).then(ok)
      return q
    },
  }
  return { db, writes, rpcCalls }
}

describe('the bind seam', () => {
  it('admitted exempt bind → exactly ONE atomic RPC carrying the run AND its provenance', async () => {
    const { db, writes, rpcCalls } = fakeDb()
    const r = await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION })
    expect(r).toMatchObject({ ok: true, runId: 'run-1' })
    expect(writes, 'no bare table write — the RPC is the only write').toEqual([])
    expect(rpcCalls.map(c => c.name)).toEqual([BIND_RPC])
    const a = rpcCalls[0].args
    expect(a).toMatchObject({
      p_workflow_instance_id: INSTANCE, p_action_kind: PROBE_ACTION, p_action_class: 'READ_ONLY',
      p_project_id: '00000000-0000-4000-8000-0000000000b1',
      p_policy_mode: 'license_exempt_observation', p_reason: 'exempt_observation',
      p_policy_reason: 'canonical_read_only_observation', p_required_level: 'L0',
    })
    // No boundary, claim, licence or Survival argument exists at all.
    expect(Object.keys(a).filter(k => /boundary|claim|license|survival|effective|bounded/.test(k))).toEqual([])
    expect(a.p_idempotency_key).toMatch(/^[0-9a-f]{64}$/)
  })

  it('23505 from the RPC is the existing duplicate identity — nothing new exists', async () => {
    const { db } = fakeDb({ rpcError: { code: '23505', message: 'duplicate key' } })
    const r = await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION })
    expect(r).toMatchObject({ ok: false, refusal: 'duplicate_action_identity' })
  })

  it('any other RPC failure is insert_rejected, never success', async () => {
    for (const code of ['23514', '22023', '40001', '42501']) {
      const { db } = fakeDb({ rpcError: { code, message: 'x' } })
      const r = await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION })
      expect(r, code).toMatchObject({ ok: false, refusal: 'insert_rejected' })
    }
  })

  it('retries with the same attempt group derive the SAME identity — no second identity is minted', async () => {
    const a = fakeDb(), b = fakeDb()
    await createWorkflowActionRun(a.db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION, attemptGroup: '11111111-1111-4111-8111-111111111111' })
    await createWorkflowActionRun(b.db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION, attemptGroup: '11111111-1111-4111-8111-111111111111' })
    expect(a.rpcCalls[0].args.p_idempotency_key).toBe(b.rpcCalls[0].args.p_idempotency_key)
  })
})
