/**
 * The workflow gate target hash — what a human is actually authorizing.
 *
 * The hash is the mechanism that makes a grant stop being effective when the
 * thing it approved changes. Every assertion below is therefore either "the same
 * semantic target hashes the same" or "this material change must move the hash".
 * A field that can change without moving the hash is a field a stale grant
 * would silently keep covering.
 */

import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  WORKFLOW_GATE_ACTION_KIND,
  WORKFLOW_GATE_TARGET_TYPE,
  canAdvanceThroughGate,
  computeWorkflowGateTarget,
  deriveWorkflowGate,
  gateStatusFromEffectiveness,
  workflowGateTargetId,
  workflowGateTargetPayload,
} from '@/lib/workflows/gate'
import { canonicalTargetVersionHash } from '@/lib/atlas/authorization/build'
import { FAMILJE_STUNDEN_MONTHLY_RELEASE, findVendoredDefinition } from '@/lib/workflows/definitions'
import type { WorkflowEvidence, WorkflowInstance, WorkflowSpec } from '@/lib/workflows/types'
import type { AuthorizationEffectivenessResult } from '@/lib/atlas/authorization/types'

const SPEC: WorkflowSpec = findVendoredDefinition(FAMILJE_STUNDEN_MONTHLY_RELEASE, 1)!.spec

const INSTANCE: WorkflowInstance = {
  id: '11111111-1111-4111-8111-111111111111',
  def_id: '22222222-2222-4222-8222-222222222222',
  def_key: FAMILJE_STUNDEN_MONTHLY_RELEASE,
  def_version: 1,
  def_hash: 'a'.repeat(64),
  project_id: '33333333-3333-4333-8333-333333333333',
  instance_key: '2026-11',
  current_state: 'local_qa',
  status: 'active',
  wake_at: null,
  last_tick_at: null,
  last_tick_outcome: null,
  created_at: '2026-08-01T00:00:00.000Z',
  closed_at: null,
}

function evidence(over: Partial<WorkflowEvidence> = {}): WorkflowEvidence {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    instance_id: INSTANCE.id,
    state: 'local_qa',
    check_key: 'audio_files_19_of_19',
    result: 'pass',
    source: 'attested',
    detail: {},
    recorded_at: '2026-08-02T10:00:00.000Z',
    producer: null, producer_type: null, observed_at: null,
    payload_hash: null, target_hash: null, attestation: {},
    ...over,
  }
}

const base = (over: Partial<Parameters<typeof computeWorkflowGateTarget>[0]> = {}) => ({
  instance: INSTANCE,
  spec: SPEC,
  state: 'local_qa',
  evidence: [evidence()],
  ...over,
})

const hash = (input: Parameters<typeof computeWorkflowGateTarget>[0]) =>
  computeWorkflowGateTarget(input).versionHash

// ── Shape ────────────────────────────────────────────────────────────────────

describe('gate target — shape', () => {
  it('names the workflow_gate target type and an instance:state id', () => {
    const target = computeWorkflowGateTarget(base())
    expect(target.targetType).toBe(WORKFLOW_GATE_TARGET_TYPE)
    expect(target.targetId).toBe(`${INSTANCE.id}:local_qa`)
    expect(target.targetId).toBe(workflowGateTargetId(INSTANCE.id, 'local_qa'))
    expect(target.versionHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('uses the SAME hash function the ledger validates targetPayload with', () => {
    // If these ever diverge, every grant would read as permanently stale.
    expect(hash(base())).toBe(canonicalTargetVersionHash(workflowGateTargetPayload(base())))
  })

  it('binds the requested action, not just the state', () => {
    const payload = workflowGateTargetPayload(base()) as Record<string, unknown>
    expect(payload.requested_action).toEqual({
      kind: WORKFLOW_GATE_ACTION_KIND,
      from_state: 'local_qa',
      to_state: 'approval_content',
    })
  })

  it('refuses a state the definition does not declare', () => {
    expect(() => computeWorkflowGateTarget(base({ state: 'ghost' }))).toThrow(/is not declared by/)
  })
})

// ── Stability ────────────────────────────────────────────────────────────────

describe('gate target — the same semantic target hashes the same', () => {
  it('is stable across repeated computation', () => {
    expect(hash(base())).toBe(hash(base()))
  })

  it('is insensitive to evidence order', () => {
    const a = evidence({ id: 'e1', check_key: 'aaa' })
    const b = evidence({ id: 'e2', check_key: 'bbb' })
    expect(hash(base({ evidence: [a, b] }))).toBe(hash(base({ evidence: [b, a] })))
  })

  it('ignores evidence recorded against OTHER states', () => {
    const other = evidence({ id: 'e9', state: 'pdf_build', check_key: 'zzz' })
    expect(hash(base({ evidence: [evidence(), other] }))).toBe(hash(base()))
  })

  it('ignores evidence detail, which is annotation rather than outcome', () => {
    expect(hash(base({ evidence: [evidence({ detail: { note: 'anything' } })] })))
      .toBe(hash(base()))
  })

  it('binds exactly the intended fields and nothing else', () => {
    // Stronger than asserting that some field is ignored: the payload is a
    // closed set, so a field added later cannot silently join the pin — and
    // `WorkflowGateInput` accepts only a Pick of the instance, so timestamps and
    // status are not even reachable here.
    expect(Object.keys(workflowGateTargetPayload(base())).sort()).toEqual([
      'def_hash', 'def_key', 'def_version', 'evidence', 'gate', 'instance_id',
      'instance_key', 'kind', 'project_id', 'requested_action', 'state_inputs',
    ])
  })

  it('reduces evidence to outcome facts, dropping annotation', () => {
    const payload = workflowGateTargetPayload(base()) as Record<string, unknown>
    expect((payload.evidence as Record<string, unknown>[])[0]).toEqual({
      check_key: 'audio_files_19_of_19',
      result: 'pass',
      source: 'attested',
      recorded_at: '2026-08-02T10:00:00.000Z',
    })
  })
})

// ── Every material change must move the hash ─────────────────────────────────

describe('gate target — material changes invalidate a prior grant', () => {
  it('changed state changes the hash', () => {
    expect(hash(base({ state: 'admin_qa' }))).not.toBe(hash(base()))
  })

  it('changed def_hash changes the hash', () => {
    expect(hash(base({ instance: { ...INSTANCE, def_hash: 'b'.repeat(64) } })))
      .not.toBe(hash(base()))
  })

  it('changed def_version changes the hash', () => {
    expect(hash(base({ instance: { ...INSTANCE, def_version: 2 } }))).not.toBe(hash(base()))
  })

  it('changed instance changes the hash', () => {
    expect(hash(base({ instance: { ...INSTANCE, id: '99999999-9999-4999-8999-999999999999' } })))
      .not.toBe(hash(base()))
  })

  it('changed instance_key (a different month) changes the hash', () => {
    expect(hash(base({ instance: { ...INSTANCE, instance_key: '2026-12' } })))
      .not.toBe(hash(base()))
  })

  it('changed project changes the hash', () => {
    expect(hash(base({ instance: { ...INSTANCE, project_id: '55555555-5555-4555-8555-555555555555' } })))
      .not.toBe(hash(base()))
  })

  it('ADDED evidence changes the hash', () => {
    expect(hash(base({ evidence: [evidence(), evidence({ id: 'e2', check_key: 'speech_rate_in_band' })] })))
      .not.toBe(hash(base()))
  })

  it('REMOVED evidence changes the hash', () => {
    expect(hash(base({ evidence: [] }))).not.toBe(hash(base()))
  })

  it('a flipped evidence result changes the hash', () => {
    // The load-bearing case: a grant given on "pass" must not survive a "fail".
    expect(hash(base({ evidence: [evidence({ result: 'fail' })] }))).not.toBe(hash(base()))
  })

  it('re-recorded evidence (new timestamp) changes the hash', () => {
    expect(hash(base({ evidence: [evidence({ recorded_at: '2026-08-03T10:00:00.000Z' })] })))
      .not.toBe(hash(base()))
  })

  it('evidence promoted from attested to automated changes the hash', () => {
    expect(hash(base({ evidence: [evidence({ source: 'automated' })] }))).not.toBe(hash(base()))
  })

  it('a changed declared input changes the hash', () => {
    const mutated: WorkflowSpec = {
      ...SPEC,
      states: SPEC.states.map(s => s.id === 'local_qa' ? { ...s, inputs: [...s.inputs, 'extra_input'] } : s),
    }
    expect(hash(base({ spec: mutated }))).not.toBe(hash(base()))
  })

  it('a changed gate decision text changes the hash', () => {
    // What the editor is asked to confirm is part of what they approved.
    const mutated: WorkflowSpec = {
      ...SPEC,
      states: SPEC.states.map(s =>
        s.id === 'local_qa'
          ? { ...s, human_gate: { ...s.human_gate, decision: 'Something else entirely' } }
          : s),
    }
    expect(hash(base({ spec: mutated }))).not.toBe(hash(base()))
  })

  it('a changed next_state changes the hash', () => {
    const mutated: WorkflowSpec = {
      ...SPEC,
      states: SPEC.states.map(s => s.id === 'local_qa' ? { ...s, next_state: 'admin_qa' } : s),
    }
    expect(hash(base({ spec: mutated }))).not.toBe(hash(base()))
  })

  it('every distinct gated state in the definition yields a distinct hash', () => {
    const gated = SPEC.states.filter(s => s.human_gate.required)
    const hashes = gated.map(s => hash(base({ state: s.id, evidence: [] })))
    expect(new Set(hashes).size).toBe(gated.length)
  })
})

// ── Status mapping ───────────────────────────────────────────────────────────

const eff = (over: Partial<AuthorizationEffectivenessResult>): AuthorizationEffectivenessResult =>
  ({ effective: false, reason: 'not_yet_decided', state: null, ...over } as AuthorizationEffectivenessResult)

describe('gate status mapping', () => {
  it('maps every effectiveness reason to a gate status', () => {
    expect(gateStatusFromEffectiveness(eff({ effective: true, reason: 'effective' }))).toBe('authorized')
    expect(gateStatusFromEffectiveness(eff({ reason: 'not_yet_decided' }))).toBe('waiting_for_authorization')
    expect(gateStatusFromEffectiveness(eff({ reason: 'denied' }))).toBe('denied')
    expect(gateStatusFromEffectiveness(eff({ reason: 'expired' }))).toBe('expired')
    expect(gateStatusFromEffectiveness(eff({ reason: 'revoked' }))).toBe('revoked')
    expect(gateStatusFromEffectiveness(eff({ reason: 'superseded' }))).toBe('superseded')
    expect(gateStatusFromEffectiveness(eff({ reason: 'conditions_unverified' }))).toBe('conditions_unverified')
    expect(gateStatusFromEffectiveness(eff({ reason: 'version_mismatch' }))).toBe('stale')
    expect(gateStatusFromEffectiveness(eff({ reason: 'action_mismatch' }))).toBe('stale')
    expect(gateStatusFromEffectiveness(eff({ reason: 'project_mismatch' }))).toBe('stale')
    expect(gateStatusFromEffectiveness(eff({ reason: 'malformed_chain' }))).toBe('malformed')
  })

  it('ONLY authorized and not_required may cross the gate', () => {
    const allowed = ([
      'not_required', 'waiting_for_authorization', 'authorized', 'denied', 'expired',
      'revoked', 'superseded', 'stale', 'conditions_unverified', 'malformed',
    ] as const).filter(canAdvanceThroughGate)
    expect(allowed).toEqual(['not_required', 'authorized'])
  })

  it('a conditional grant never advances a workflow', () => {
    // Stage 1 has no condition enforcement engine; treating it as effective
    // would be canonical failure mode 27.348.
    expect(canAdvanceThroughGate(gateStatusFromEffectiveness(eff({ reason: 'conditions_unverified' }))))
      .toBe(false)
  })
})

describe('deriveWorkflowGate', () => {
  it('reports not_required on an ungated state and allows advance', () => {
    const gate = deriveWorkflowGate(base({ state: 'pdf_build' }))
    expect(gate.required).toBe(false)
    expect(gate.status).toBe('not_required')
    expect(gate.canAdvance).toBe(true)
    expect(gate.target).toBeNull()
  })

  it('reports waiting_for_authorization on a gated state with no chain', () => {
    const gate = deriveWorkflowGate(base())
    expect(gate.required).toBe(true)
    expect(gate.status).toBe('waiting_for_authorization')
    expect(gate.canAdvance).toBe(false)
    expect(gate.target?.versionHash).toBe(hash(base()))
    expect(gate.approver).toBe('editor')
    expect(gate.decision).toBe('Lyssnat och godkänt')
  })

  it('surfaces the approver the definition names for each gated state', () => {
    for (const s of SPEC.states.filter(x => x.human_gate.required)) {
      expect(deriveWorkflowGate(base({ state: s.id, evidence: [] })).approver).toBe('editor')
    }
  })
})

describe('gate target — hash is a real sha256 of the canonical payload', () => {
  it('matches an independently computed digest', () => {
    const payload = workflowGateTargetPayload(base())
    const canonical = (function c(v: unknown): string {
      if (Array.isArray(v)) return `[${v.map(c).join(',')}]`
      if (v && typeof v === 'object') {
        return `{${Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => `${JSON.stringify(k)}:${c(x)}`).join(',')}}`
      }
      return JSON.stringify(v ?? null)
    })(payload)
    expect(hash(base())).toBe(createHash('sha256').update(canonical).digest('hex'))
  })
})
