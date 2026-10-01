/**
 * Phase 3B1B — bind-time autonomy admission (behaviour).
 *
 * Two layers, both with the REAL canonical policy table and the REAL pure
 * admission core:
 *
 *   1. `admitAutonomyAtBind` — the canonical licence resolver and the platform
 *      Survival reader are mocked at their module boundary (they need a
 *      database); every decision is the canonical core's.
 *   2. `createWorkflowActionRun` — the bind seam, against a chainable fake DB.
 *      Proves the autonomy veto runs AFTER every existing gate, that a refusal
 *      writes NOTHING, and that an admitted bind writes run + provenance through
 *      the ONE atomic RPC and never a bare `runs` insert.
 *
 * The SQL properties (atomicity, rollback, locking, privileges) are proven
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

import type { ResolvedAutonomyLicense } from '@/lib/atlas/autonomy-license/types'
import { admitAutonomyAtBind } from '@/lib/atlas/autonomy-runtime/bind'
import { LICENCE_EXEMPT_OBSERVATION_KINDS, NOT_EXECUTABLE_KINDS } from '@/lib/atlas/autonomy-runtime/policy'
import { createWorkflowActionRun } from '@/lib/workflows/action-run'
import { BIND_RPC, type RecordedWrite } from './bind-rpc-fake'

const INSTANCE = '00000000-0000-4000-8000-00000000c0de'
const LICENSED_KIND = 'proof_governed_effect'   // licensed, minimum L3

function licence(over: Partial<ResolvedAutonomyLicense> = {}): ResolvedAutonomyLicense {
  return {
    status: 'active', effective: true, reason: 'active', decisionReason: null,
    licenseId: '77777777-7777-4777-8777-777777777777',
    projectId: '00000000-0000-4000-8000-0000000000b1',
    workflowInstanceId: INSTANCE,
    boundDefKey: 'omnira.probe-validation', boundDefHash: 'a'.repeat(64),
    licensedLevel: 'L3', resolvedLevel: 'L3',
    allowedActionKinds: [LICENSED_KIND],
    actionScopeFingerprint: 'b'.repeat(64),
    decision: { decisionId: 'd', version: 1, recordId: 'r' },
    issuer: 'user:00000000-0000-4000-8000-000000000001',
    effectiveAt: '2026-09-01T00:00:00.000Z', expiresAt: '2027-09-01T00:00:00.000Z',
    generation: 2, eventCount: 3,
    resolvedAt: '2026-10-01T10:00:00.000Z',
    ledgerWatermark: 41,
    ...over,
  }
}
const ineffective = (reason: ResolvedAutonomyLicense['reason']) =>
  licence({ effective: false, reason, resolvedLevel: 'L0' })

const SURVIVAL_OK = { ok: true, ceiling: 'L4', state: 'NORMAL', asOf: '2026-10-01T09:59:00.000Z' }

beforeEach(() => {
  resolveMock.mockReset()
  survivalMock.mockReset()
})

// ── 1 · admitAutonomyAtBind ──────────────────────────────────────────────────

describe('licence-exempt observation', () => {
  it('admits WITHOUT consulting a licence or Survival, and records the bare exemption', async () => {
    for (const kind of LICENCE_EXEMPT_OBSERVATION_KINDS) {
      const r = await admitAutonomyAtBind(kind, INSTANCE)
      expect(r.admitted, kind).toBe(true)
      if (!r.admitted) continue
      expect(r.provenance).toEqual({
        policy_mode: 'license_exempt_observation',
        policy_reason: 'canonical_read_only_observation',
        reason: 'exempt_observation',
        license_id: null, license_generation: null, license_reason: null,
        required_level: 'L0', effective_level: null,
        survival_state: null, survival_ceiling: null, survival_reason: null,
        bounded_by: null, license_resolved_at: null, survival_as_of: null,
        license_watermark: null,
      })
    }
    // No fabricated licence or Survival evidence: neither source was even read.
    expect(resolveMock).not.toHaveBeenCalled()
    expect(survivalMock).not.toHaveBeenCalled()
  })
})

describe('licensed — admitted', () => {
  it('pins the exact effective licence event, the watermark, and the observed Survival', async () => {
    resolveMock.mockResolvedValue(licence())
    survivalMock.mockResolvedValue(SURVIVAL_OK)
    const r = await admitAutonomyAtBind(LICENSED_KIND, INSTANCE)
    expect(r.admitted).toBe(true)
    if (!r.admitted) return
    expect(r.provenance).toEqual({
      policy_mode: 'licensed', policy_reason: null, reason: 'allowed',
      license_id: '77777777-7777-4777-8777-777777777777', license_generation: 2,
      license_reason: 'active',
      required_level: 'L3', effective_level: 'L3',
      survival_state: 'NORMAL', survival_ceiling: 'L4', survival_reason: null,
      bounded_by: 'licence',
      license_resolved_at: '2026-10-01T10:00:00.000Z',
      survival_as_of: '2026-10-01T09:59:00.000Z',
      license_watermark: 41,
    })
    // The resolver is asked about the INSTANCE only — no level, no clock, no scope.
    expect(resolveMock).toHaveBeenCalledWith(INSTANCE)
    expect(survivalMock).toHaveBeenCalledWith()
  })

  it('Survival can only LOWER the level: L5 licence under an L3 ceiling is effective L3', async () => {
    resolveMock.mockResolvedValue(licence({ licensedLevel: 'L5', resolvedLevel: 'L5' }))
    survivalMock.mockResolvedValue({ ...SURVIVAL_OK, ceiling: 'L3', state: 'CONSERVE' })
    const r = await admitAutonomyAtBind(LICENSED_KIND, INSTANCE)
    expect(r.admitted).toBe(true)
    if (!r.admitted) return
    expect(r.provenance.effective_level).toBe('L3')
    expect(r.provenance.bounded_by).toBe('survival_ceiling')
  })
})

describe('licensed — every canonical refusal family refuses, and reads only what the order allows', () => {
  it('licence absent (no_license) → licence_not_effective; Survival never read', async () => {
    resolveMock.mockResolvedValue(ineffective('no_license'))
    const r = await admitAutonomyAtBind(LICENSED_KIND, INSTANCE)
    expect(r).toMatchObject({ admitted: false, reason: 'licence_not_effective' })
    expect(survivalMock).not.toHaveBeenCalled()
  })

  it.each(['expired', 'suspended', 'revoked', 'superseded', 'not_yet_effective',
           'ambiguous_licenses', 'malformed_lineage', 'unavailable', 'decision_not_governing',
           'workflow_definition_drifted', 'workflow_project_drifted', 'scope_drifted'] as const)(
    'licence not effective (%s) → refused, scope and Survival never consulted', async reason => {
      // An ineffective licence RETAINS its historical scope; it must not count.
      resolveMock.mockResolvedValue(ineffective(reason))
      const r = await admitAutonomyAtBind(LICENSED_KIND, INSTANCE)
      expect(r).toMatchObject({ admitted: false, reason: 'licence_not_effective' })
      expect(survivalMock).not.toHaveBeenCalled()
    })

  it('action outside licence scope → refused; Survival never read', async () => {
    resolveMock.mockResolvedValue(licence({ allowedActionKinds: ['observe_release_gate'] }))
    const r = await admitAutonomyAtBind(LICENSED_KIND, INSTANCE)
    expect(r).toMatchObject({ admitted: false, reason: 'action_not_in_licence_scope' })
    expect(survivalMock).not.toHaveBeenCalled()
  })

  it('effective level below required (L2 licence for an L3 kind) → refused', async () => {
    resolveMock.mockResolvedValue(licence({ licensedLevel: 'L2', resolvedLevel: 'L2' }))
    survivalMock.mockResolvedValue(SURVIVAL_OK)
    const r = await admitAutonomyAtBind(LICENSED_KIND, INSTANCE)
    expect(r).toMatchObject({ admitted: false, reason: 'effective_level_below_required' })
  })

  it('Survival ceiling below required (L6 licence, HIBERNATE L0) → refused', async () => {
    resolveMock.mockResolvedValue(licence({ licensedLevel: 'L6', resolvedLevel: 'L6' }))
    survivalMock.mockResolvedValue({ ...SURVIVAL_OK, ceiling: 'L0', state: 'HIBERNATE' })
    const r = await admitAutonomyAtBind(LICENSED_KIND, INSTANCE)
    expect(r).toMatchObject({ admitted: false, reason: 'effective_level_below_required' })
  })

  it.each(['population_unavailable', 'snapshot_unavailable'] as const)(
    'required Survival evidence unavailable (%s) → FAILS CLOSED, never the licensed level', async reason => {
      resolveMock.mockResolvedValue(licence({ licensedLevel: 'L6', resolvedLevel: 'L6' }))
      survivalMock.mockResolvedValue({ ok: false, ceiling: 'L0', reason })
      const r = await admitAutonomyAtBind(LICENSED_KIND, INSTANCE)
      expect(r).toMatchObject({ admitted: false, reason: 'effective_level_below_required' })
    })

  it('an admitted licensed decision missing its watermark is refused, never persisted partial', async () => {
    resolveMock.mockResolvedValue(licence({ ledgerWatermark: null }))
    survivalMock.mockResolvedValue(SURVIVAL_OK)
    const r = await admitAutonomyAtBind(LICENSED_KIND, INSTANCE)
    expect(r.admitted).toBe(false)
  })
})

describe('unsupported and unknown kinds', () => {
  it('every unsupported kind is refused BEFORE any read, whatever licence exists', async () => {
    resolveMock.mockResolvedValue(licence({
      licensedLevel: 'L6', resolvedLevel: 'L6',
      allowedActionKinds: ['generate_monthly_story', ...NOT_EXECUTABLE_KINDS],
    }))
    survivalMock.mockResolvedValue({ ...SURVIVAL_OK, ceiling: 'L6', state: 'EXPAND' })
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
    expect(resolveMock).not.toHaveBeenCalled()
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
    // The run identity and the provenance travel in the SAME call.
    expect(a).toMatchObject({
      p_workflow_instance_id: INSTANCE, p_action_kind: PROBE_ACTION, p_action_class: 'READ_ONLY',
      p_project_id: '00000000-0000-4000-8000-0000000000b1',
      p_policy_mode: 'license_exempt_observation', p_reason: 'exempt_observation',
      p_policy_reason: 'canonical_read_only_observation', p_required_level: 'L0',
      p_license_id: null, p_license_generation: null, p_license_watermark: null,
      p_survival_state: null, p_effective_level: null,
    })
    // There is no boundary or claim argument: the RPC fixes `bind` itself.
    expect(Object.keys(a)).not.toContain('p_boundary')
    expect(Object.keys(a)).not.toContain('p_claim_id')
    expect(a.p_idempotency_key).toMatch(/^[0-9a-f]{64}$/)
    expect(resolveMock).not.toHaveBeenCalled()
  })

  it('23505 from the RPC is the existing duplicate identity — nothing new exists', async () => {
    const { db } = fakeDb({ rpcError: { code: '23505', message: 'duplicate key' } })
    const r = await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION })
    expect(r).toMatchObject({ ok: false, refusal: 'duplicate_action_identity' })
  })

  it('40001 from the RPC (licence moved / expired / stale) is an autonomy refusal', async () => {
    const { db } = fakeDb({ rpcError: { code: '40001', message: 'licence ledger moved' } })
    const r = await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION })
    expect(r).toMatchObject({ ok: false, refusal: 'autonomy_not_admitted' })
  })

  it('any other RPC failure is insert_rejected, never success', async () => {
    const { db } = fakeDb({ rpcError: { code: '23514', message: 'check violation' } })
    const r = await createWorkflowActionRun(db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION })
    expect(r).toMatchObject({ ok: false, refusal: 'insert_rejected' })
  })

  it('retries with the same attempt group derive the SAME identity — no second identity is minted', async () => {
    const a = fakeDb(), b = fakeDb()
    await createWorkflowActionRun(a.db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION, attemptGroup: '11111111-1111-4111-8111-111111111111' })
    await createWorkflowActionRun(b.db as never, { instanceId: INSTANCE, actionKind: PROBE_ACTION, attemptGroup: '11111111-1111-4111-8111-111111111111' })
    expect(a.rpcCalls[0].args.p_idempotency_key).toBe(b.rpcCalls[0].args.p_idempotency_key)
  })
})
