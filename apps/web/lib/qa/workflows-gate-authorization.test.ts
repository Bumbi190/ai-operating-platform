/**
 * Workflow gates against the real authority ledger semantics.
 *
 * The chains below are real `AuthorizationEvent` chains evaluated by the
 * shipped `isEffectiveNow` — not mocks. What is proven here is that the workflow
 * gate INHERITS the ledger's answers rather than reinterpreting them, and that
 * the transition path refuses every answer except an unconditional live grant
 * for exactly this pin.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isEffectiveNow } from '@/lib/atlas/authorization/derive'
import type { AuthorizationEvent, AuthorizationTarget } from '@/lib/atlas/authorization/types'
import {
  WORKFLOW_GATE_ACTION_KIND,
  computeWorkflowGateTarget,
  gateStatusFromEffectiveness,
  canAdvanceThroughGate,
} from '@/lib/workflows/gate'
import { appendTransition, InvalidTransitionError } from '@/lib/workflows/store'
import { FAMILJE_STUNDEN_MONTHLY_RELEASE, findVendoredDefinition } from '@/lib/workflows/definitions'
import type { WorkflowEvidence, WorkflowInstance, WorkflowSpec } from '@/lib/workflows/types'

const SPEC: WorkflowSpec = findVendoredDefinition(FAMILJE_STUNDEN_MONTHLY_RELEASE, 1)!.spec
const PROJECT = '33333333-3333-4333-8333-333333333333'
const INSTANCE_ID = '11111111-1111-4111-8111-111111111111'
const PRINCIPAL = '77777777-7777-4777-8777-777777777777'
const AUTH_ID = '88888888-8888-4888-8888-888888888888'

const NOW = '2026-08-10T12:00:00.000Z'
const LATER = '2026-09-10T12:00:00.000Z'

const INSTANCE: WorkflowInstance = {
  id: INSTANCE_ID, def_id: '22222222-2222-4222-8222-222222222222',
  def_key: FAMILJE_STUNDEN_MONTHLY_RELEASE, def_version: 1, def_hash: 'a'.repeat(64),
  project_id: PROJECT, instance_key: '2026-11', current_state: 'local_qa',
  status: 'active', wake_at: null, created_at: '2026-08-01T00:00:00.000Z', closed_at: null,
}

const EVIDENCE: WorkflowEvidence[] = [{
  id: '44444444-4444-4444-8444-444444444444', instance_id: INSTANCE_ID, state: 'local_qa',
  check_key: 'audio_files_19_of_19', result: 'pass', source: 'attested',
  detail: {}, recorded_at: '2026-08-02T10:00:00.000Z',
}]

const TARGET = computeWorkflowGateTarget({
  instance: INSTANCE, spec: SPEC, state: 'local_qa', evidence: EVIDENCE,
})

// ── Chain builders ───────────────────────────────────────────────────────────

function ev(over: Partial<AuthorizationEvent> & Pick<AuthorizationEvent, 'type'>): AuthorizationEvent {
  return {
    eventId: `evt-${over.type}-${over.occurredAt ?? NOW}`,
    authorizationId: AUTH_ID,
    occurredAt: NOW,
    projectId: PROJECT,
    principalId: PRINCIPAL,
    authorityBasis: 'founder_owner',
    target: TARGET,
    authority: { actionKind: WORKFLOW_GATE_ACTION_KIND, description: 'Advance local_qa' },
    conditions: [],
    evidence: [],
    expiresAt: null,
    supersededBy: null,
    reason: null,
    ...over,
  }
}

const requested = (over: Partial<AuthorizationEvent> = {}) => ev({ type: 'requested', ...over })
const granted = (over: Partial<AuthorizationEvent> = {}) =>
  ev({ type: 'granted', occurredAt: NOW, expiresAt: LATER, ...over })

/** Evaluate a chain exactly as the workflow gate does. */
function gateStatus(chain: AuthorizationEvent[], at = NOW, target: AuthorizationTarget = TARGET) {
  return gateStatusFromEffectiveness(
    isEffectiveNow(chain, { at, target, projectId: PROJECT, actionKind: WORKFLOW_GATE_ACTION_KIND }),
  )
}

// ── Ledger answers the gate inherits ─────────────────────────────────────────

describe('gate inherits the ledger verdict', () => {
  it('a live unconditional grant for this pin authorizes', () => {
    expect(gateStatus([requested(), granted()])).toBe('authorized')
  })

  it('a request with no decision waits', () => {
    expect(gateStatus([requested()])).toBe('waiting_for_authorization')
  })

  it('a denial blocks', () => {
    expect(gateStatus([requested(), ev({ type: 'denied', reason: 'not ready' })])).toBe('denied')
  })

  it('a revoked grant blocks', () => {
    expect(gateStatus([
      requested(), granted(),
      ev({ type: 'revoked', occurredAt: '2026-08-11T00:00:00.000Z', reason: 'withdrawn' }),
    ], '2026-08-12T00:00:00.000Z')).toBe('revoked')
  })

  it('a superseded grant blocks', () => {
    expect(gateStatus([
      requested(), granted(),
      ev({ type: 'superseded', occurredAt: '2026-08-11T00:00:00.000Z', supersededBy: 'other-auth' }),
    ], '2026-08-12T00:00:00.000Z')).toBe('superseded')
  })

  it('an expired grant blocks — derived from time, with no expiry event', () => {
    // Safety must not depend on a background job writing `expired`.
    expect(gateStatus([requested(), granted()], '2026-10-01T00:00:00.000Z')).toBe('expired')
  })

  it('a conditional grant blocks — Stage 1 cannot verify conditions', () => {
    expect(gateStatus([
      requested(),
      ev({
        type: 'granted_with_conditions', expiresAt: LATER,
        conditions: [{ conditionId: 'c1', type: 'manual', value: 'x', description: 'check first' }],
      }),
    ])).toBe('conditions_unverified')
  })

  it('a malformed chain blocks rather than resolving permissively', () => {
    expect(gateStatus([granted()])).toBe('malformed')          // no opening request
    expect(gateStatus([])).toBe('malformed')
  })
})

// ── Pin mismatches ───────────────────────────────────────────────────────────

describe('a grant is bound to exactly one target', () => {
  const otherTarget = (over: Partial<Parameters<typeof computeWorkflowGateTarget>[0]>) =>
    computeWorkflowGateTarget({
      instance: INSTANCE, spec: SPEC, state: 'local_qa', evidence: EVIDENCE, ...over,
    })

  it('an authorization for ANOTHER INSTANCE is stale here', () => {
    const foreign = otherTarget({ instance: { ...INSTANCE, id: '99999999-9999-4999-8999-999999999999' } })
    expect(gateStatus([requested({ target: foreign }), granted({ target: foreign })])).toBe('stale')
  })

  it('an authorization for ANOTHER STATE is stale here', () => {
    const foreign = otherTarget({ state: 'admin_qa', evidence: [] })
    expect(gateStatus([requested({ target: foreign }), granted({ target: foreign })])).toBe('stale')
  })

  it('an authorization for ANOTHER ACTION is stale here', () => {
    const authority = { actionKind: 'workflow.gate.abandon', description: 'different act' }
    expect(gateStatus([requested({ authority }), granted({ authority })])).toBe('stale')
  })

  it('an authorization in ANOTHER PROJECT is stale here', () => {
    const other = '66666666-6666-4666-8666-666666666666'
    expect(gateStatus([requested({ projectId: other }), granted({ projectId: other })])).toBe('stale')
  })

  it('a DEFINITION VERSION BUMP invalidates the old grant', () => {
    const chain = [requested(), granted()]
    const afterBump = otherTarget({ instance: { ...INSTANCE, def_hash: 'b'.repeat(64), def_version: 2 } })
    expect(gateStatus(chain)).toBe('authorized')
    expect(gateStatus(chain, NOW, afterBump)).toBe('stale')
  })

  it('NEW EVIDENCE invalidates the old grant', () => {
    const chain = [requested(), granted()]
    const afterEvidence = otherTarget({
      evidence: [...EVIDENCE, { ...EVIDENCE[0], id: 'e2', check_key: 'speech_rate_in_band' }],
    })
    expect(gateStatus(chain)).toBe('authorized')
    expect(gateStatus(chain, NOW, afterEvidence)).toBe('stale')
  })

  it('a FLIPPED EVIDENCE RESULT invalidates the old grant', () => {
    const chain = [requested(), granted()]
    const afterFail = otherTarget({ evidence: [{ ...EVIDENCE[0], result: 'fail' }] })
    expect(gateStatus(chain, NOW, afterFail)).toBe('stale')
  })

  it('none of the stale variants can advance', () => {
    for (const status of ['stale', 'denied', 'expired', 'revoked', 'superseded',
      'conditions_unverified', 'malformed', 'waiting_for_authorization'] as const) {
      expect(canAdvanceThroughGate(status), status).toBe(false)
    }
  })
})

// ── Transition enforcement ───────────────────────────────────────────────────

interface FakeState { instances: any[]; defs: any[]; transitions: any[]; evidence: any[] }

function fakeDb(seed: FakeState) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = []
  function table(name: keyof FakeState) {
    let rows = [...seed[name]]
    const chain: Record<string, unknown> = {
      select: () => chain, order: () => chain, limit: () => chain,
      eq: (c: string, v: unknown) => { rows = rows.filter(r => r[c] === v); return chain },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } }),
      insert: () => chain,
      then: (res: (v: { data: unknown[]; error: null }) => unknown) => res({ data: rows, error: null }),
    }
    return chain
  }
  return {
    db: {
      from: (n: string) => table(n.replace('workflow_', '') as keyof FakeState),
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args })
        return { data: { id: 't', seq: 3, instance_id: args.p_instance_id, from_state: args.p_from_state,
          to_state: args.p_to_state, reason: args.p_reason, actor: args.p_actor,
          evidence_ref: null, authorization_id: args.p_authorization_id, occurred_at: 'now' }, error: null }
      },
    },
    rpcCalls,
  }
}

/** An instance sitting in a gated state with a legal history behind it. */
function gatedWorld(state = 'local_qa') {
  const order = ['planning', 'content_generation', 'visual_generation', 'pdf_build',
    'ebook_build', 'audio_generation', 'local_qa']
  const idx = order.indexOf(state)
  const transitions: any[] = [{
    id: 't0', seq: 1, instance_id: INSTANCE_ID, from_state: null, to_state: 'planning',
    reason: 'created', actor: 'system', evidence_ref: null, authorization_id: null, occurred_at: 'now',
  }]
  for (let i = 0; i < idx; i++) {
    transitions.push({
      id: `t${i + 1}`, seq: i + 2, instance_id: INSTANCE_ID, from_state: order[i], to_state: order[i + 1],
      reason: 'advance', actor: 'editor', evidence_ref: null, authorization_id: 'prior-auth', occurred_at: 'now',
    })
  }
  return {
    instances: [{ ...INSTANCE, current_state: state }],
    defs: [{ id: INSTANCE.def_id, def_key: INSTANCE.def_key, version: 1,
      def_hash: INSTANCE.def_hash, spec: SPEC, created_at: 'now' }],
    transitions,
    evidence: [],
  }
}

const ALLOW = async () => ({ valid: true, status: 'authorized', reason: 'effective' })

describe('transition enforcement', () => {
  it('blocks a gated advance with NO authorization, before any write', async () => {
    const { db, rpcCalls } = fakeDb(gatedWorld())
    await expect(appendTransition(db, {
      instanceId: INSTANCE_ID, to: 'approval_content', reason: 'go', actor: 'editor',
      verifyAuthorization: ALLOW,
    })).rejects.toThrow(/crosses a required human gate/)
    expect(rpcCalls).toEqual([])
  })

  it('permits a gated advance with a VALID authorization', async () => {
    const { db, rpcCalls } = fakeDb(gatedWorld())
    await appendTransition(db, {
      instanceId: INSTANCE_ID, to: 'approval_content', reason: 'approved', actor: 'editor',
      authorizationId: AUTH_ID, verifyAuthorization: ALLOW,
    })
    const call = rpcCalls.find(c => c.name === 'workflow_append_transition')!
    expect(call.args.p_authorization_id).toBe(AUTH_ID)
    expect(call.args.p_from_state).toBe('local_qa')
  })

  it.each([
    ['denied', 'denied'],
    ['expired', 'expired'],
    ['stale', 'version_mismatch'],
    ['revoked', 'revoked'],
    ['superseded', 'superseded'],
    ['conditions_unverified', 'conditions_unverified'],
    ['waiting_for_authorization', 'not_yet_decided'],
    ['malformed', 'malformed_chain'],
  ])('blocks a gated advance when the authorization is %s', async (status, reason) => {
    const { db, rpcCalls } = fakeDb(gatedWorld())
    await expect(appendTransition(db, {
      instanceId: INSTANCE_ID, to: 'approval_content', reason: 'go', actor: 'editor',
      authorizationId: AUTH_ID,
      verifyAuthorization: async () => ({ valid: false, status, reason }),
    })).rejects.toThrow(new RegExp(`is not valid for this gate \\(${status}: ${reason}\\)`))
    expect(rpcCalls).toEqual([])
  })

  it('FAILS CLOSED when the verifier throws', async () => {
    const { db, rpcCalls } = fakeDb(gatedWorld())
    await expect(appendTransition(db, {
      instanceId: INSTANCE_ID, to: 'approval_content', reason: 'go', actor: 'editor',
      authorizationId: AUTH_ID,
      verifyAuthorization: async () => { throw new Error('ledger unreachable') },
    })).rejects.toThrow(/could not be verified: ledger unreachable/)
    expect(rpcCalls).toEqual([])
  })

  it('does NOT require authorization for a backward/failure transition', async () => {
    const { db, rpcCalls } = fakeDb(gatedWorld())
    let verifierCalled = false
    await appendTransition(db, {
      instanceId: INSTANCE_ID, to: 'audio_generation', reason: 'QA failed', actor: 'editor',
      verifyAuthorization: async () => { verifierCalled = true; return { valid: true, status: 'x', reason: 'y' } },
    })
    expect(verifierCalled).toBe(false)
    expect(rpcCalls.find(c => c.name === 'workflow_append_transition')!.args.p_authorization_id).toBeNull()
  })

  it('does NOT require authorization on an ungated state', async () => {
    const { db, rpcCalls } = fakeDb(gatedWorld('pdf_build'))
    let verifierCalled = false
    await appendTransition(db, {
      instanceId: INSTANCE_ID, to: 'ebook_build', reason: 'built', actor: 'system',
      verifyAuthorization: async () => { verifierCalled = true; return { valid: true, status: 'x', reason: 'y' } },
    })
    expect(verifierCalled).toBe(false)
    expect(rpcCalls).toHaveLength(1)
  })

  it('rejects an illegal jump even WITH a valid authorization', async () => {
    const { db, rpcCalls } = fakeDb(gatedWorld())
    await expect(appendTransition(db, {
      instanceId: INSTANCE_ID, to: 'social', reason: 'skip', actor: 'editor',
      authorizationId: AUTH_ID, verifyAuthorization: ALLOW,
    })).rejects.toThrow(InvalidTransitionError)
    expect(rpcCalls).toEqual([])
  })
})

// ── Structural guarantees ────────────────────────────────────────────────────

const SRC = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('structural — authority cannot be forged from workflow code', () => {
  it('the workflow layer never names a principal', () => {
    // principalId is derived from the session by principal-write.ts. If workflow
    // code could pass one, a service role would become an authority.
    for (const f of ['../workflows/authorization.ts', '../workflows/gate.ts', '../workflows/store.ts']) {
      expect(SRC(f), f).not.toMatch(/principalId\s*:/)
    }
  })

  it('the workflow layer never writes authorization rows directly', () => {
    for (const f of ['../workflows/authorization.ts', '../workflows/store.ts']) {
      expect(SRC(f), f).not.toMatch(/from\(['"]atlas_authorizations['"]\)/)
    }
  })

  it('the workflow layer grants nothing — it only requests and reads', () => {
    const src = SRC('../workflows/authorization.ts')
    expect(src).toMatch(/requestAuthorization/)
    expect(src).not.toMatch(/\bgrantAuthorization\b/)
    expect(src).not.toMatch(/\bdenyAuthorization\b/)
    expect(src).not.toMatch(/\brevokeAuthorization\b/)
  })

  it('the gate request route derives the target and never accepts one', () => {
    const src = SRC('../../app/api/workflows/gate/route.ts')
    expect(src).toMatch(/instanceId/)
    expect(src).not.toMatch(/body\.(target|versionHash|actionKind|expiresAt)/)
  })

  it('the store exposes no way to skip the gate check', () => {
    const src = SRC('../workflows/store.ts')
    // An absent verifier means the DEFAULT verifier, never "skip".
    expect(src).toMatch(/input\.verifyAuthorization \?\? defaultVerifier/)
    expect(src).not.toMatch(/skipAuthorization|bypassGate|force\b/)
  })

  it('the existing approvals table is untouched by the workflow layer', () => {
    for (const f of ['../workflows/authorization.ts', '../workflows/store.ts',
      '../workflows/gate.ts', '../../app/api/workflows/gate/route.ts']) {
      expect(SRC(f), f).not.toMatch(/from\(['"]approvals['"]\)/)
    }
  })
})

// ── Mutation tests ───────────────────────────────────────────────────────────

describe('mutant — a gate check that accepts any non-empty authorization id', () => {
  it('disagrees with the real check on every invalid ledger verdict', () => {
    const mutantAccepts = (authorizationId: string | null) => !!authorizationId

    const cases: { chain: AuthorizationEvent[]; at?: string }[] = [
      { chain: [requested()] },                                            // undecided
      { chain: [requested(), ev({ type: 'denied' })] },                    // denied
      { chain: [requested(), granted()], at: '2026-10-01T00:00:00.000Z' }, // expired
      { chain: [requested({ target: { ...TARGET, versionHash: 'c'.repeat(64) } }),
                granted({ target: { ...TARGET, versionHash: 'c'.repeat(64) } })] }, // stale
    ]
    for (const { chain, at } of cases) {
      expect(mutantAccepts(AUTH_ID)).toBe(true)
      expect(canAdvanceThroughGate(gateStatus(chain, at ?? NOW))).toBe(false)
    }
  })

  it('agrees only on the one case that is genuinely authorized', () => {
    expect(canAdvanceThroughGate(gateStatus([requested(), granted()]))).toBe(true)
  })
})

describe('mutant — a gate check that ignores the target pin', () => {
  it('disagrees whenever the pin moved but the grant is otherwise live', () => {
    const chain = [requested(), granted()]
    const movedPin = computeWorkflowGateTarget({
      instance: INSTANCE, spec: SPEC, state: 'local_qa',
      evidence: [{ ...EVIDENCE[0], result: 'fail' }],
    })
    // Mutant: drop `target` from the query — the grant still looks effective.
    const mutant = isEffectiveNow(chain, { at: NOW, projectId: PROJECT, actionKind: WORKFLOW_GATE_ACTION_KIND })
    expect(mutant.effective).toBe(true)
    // Real check pins the target and refuses.
    expect(gateStatus(chain, NOW, movedPin)).toBe('stale')
  })
})
