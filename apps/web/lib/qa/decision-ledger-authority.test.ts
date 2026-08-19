/**
 * Decision Ledger V1 — authority binding and lifecycle integrity (EI-S1.3B-R1).
 *
 * The Authorization V1 double here is FAITHFUL: it answers `effective` only when
 * the queried project, target (including version hash) and action match what the
 * authorization was actually granted for — exactly as the real seam does. That
 * is what makes the binding attack observable: a blanket "always effective" mock
 * would have hidden it.
 *
 * Filesystem/local only: no database, no network, no credentials.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/project-access', () => ({ resolveProjectAccess: vi.fn() }))
vi.mock('@/lib/atlas/authorization/principal-read', () => ({ isAuthorizationEffective: vi.fn() }))

import { resolveProjectAccess } from '@/lib/auth/project-access'
import { isAuthorizationEffective } from '@/lib/atlas/authorization/principal-read'
import { buildDecisionRecord, newDecisionId } from '@/lib/atlas/decision-ledger/build'
import {
  amendDecision,
  approveDecision,
  completeDecision,
  observeOutcome,
  reverseDecision,
  supersedeDecision,
} from '@/lib/atlas/decision-ledger/principal-write'
import { isDecisionGoverning } from '@/lib/atlas/decision-ledger/principal-read'
import {
  DECISION_ACTION,
  decisionAuthorizationBinding,
  materialDecisionVersionHash,
} from '@/lib/atlas/decision-ledger/binding'
import type { DecisionRecord, DecisionRecordType } from '@/lib/atlas/decision-ledger/types'
import type { DecisionLedgerStore } from '@/lib/atlas/decision-ledger/store'

const PRINCIPAL_A = '11111111-1111-4111-8111-111111111111'
const PRINCIPAL_B = '22222222-2222-4222-8222-222222222222'
const PROJECT_P = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROJECT_Q = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const AUTH_UNRELATED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const AUTH_CORRECT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const T0 = '2026-08-19T08:00:00.000Z'
const T1 = '2026-08-19T09:00:00.000Z'
const T2 = '2026-08-19T10:00:00.000Z'
const T3 = '2026-08-19T11:00:00.000Z'
const EXPIRES = '2026-09-19T08:00:00.000Z'
const AFTER_EXPIRY = '2026-09-20T08:00:00.000Z'

const REVIEW = { trigger: 'time_based' as const, description: 'Review in 30 days.', dueAt: '2026-09-10T08:00:00.000Z' }
const EVIDENCE = [{ kind: 'report', ref: 'r-1', label: 'Report', observedAt: T0, scope: 'p' }]

let seq = 0
function record(type: DecisionRecordType, overrides: Record<string, unknown> = {}): DecisionRecord {
  return buildDecisionRecord({
    type,
    decisionId: 'dec-A',
    projectId: PROJECT_P,
    principalId: PRINCIPAL_A,
    occurredAt: T0,
    recordId: `r${++seq}`,
    version: 1,
    title: 'Grant L4 publishing autonomy',
    statement: 'The Prompt may publish short news autonomously for a 14-day trial.',
    materiality: ['autonomy'],
    ...overrides,
  } as never)
}

const proposed = (o: Record<string, unknown> = {}) => record('proposed', { occurredAt: T0, ...o })

class FakeStore implements DecisionLedgerStore {
  appended: DecisionRecord[] = []
  constructor(private rows: DecisionRecord[] = []) {}
  async append(r: DecisionRecord) { this.appended.push(r); this.rows.push(r); return r }
  async lineage(id: string) { return this.rows.filter(r => r.decisionId === id) }
  async byProject(p: string) { return this.rows.filter(r => r.projectId === p) }
}

const mockAccess = vi.mocked(resolveProjectAccess)
const mockAuth = vi.mocked(isAuthorizationEffective)

const authAs = (userId: string, allowed: string[]) =>
  mockAccess.mockResolvedValue({ ok: true, userId, allowedProjectIds: allowed })

/**
 * Grants held by the "authorization service". The double answers `effective`
 * only on an exact project + target + action match, like the real seam.
 */
interface Grant {
  id: string
  projectId: string
  target: { targetType: string; targetId: string; versionHash: string }
  actionKind: string
  principalId: string
  expiresAt?: string
}

function authorizationService(grants: Grant[]) {
  mockAuth.mockImplementation(async (id, query = {}, args = {}) => {
    const grant = grants.find(g => g.id === id)
    if (!grant) return { effective: false, reason: 'not_yet_decided', state: null, status: 'not_permitted' } as never
    const at = (args as { now?: string }).now ?? T1
    if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.parse(at)) {
      return { effective: false, reason: 'expired', state: null, status: 'ok' } as never
    }
    const q = query as { projectId?: string; target?: Grant['target']; actionKind?: string }
    if (q.projectId !== undefined && q.projectId !== grant.projectId) {
      return { effective: false, reason: 'project_mismatch', state: null, status: 'ok' } as never
    }
    if (q.target && (
      q.target.targetType !== grant.target.targetType ||
      q.target.targetId !== grant.target.targetId ||
      q.target.versionHash !== grant.target.versionHash
    )) {
      return { effective: false, reason: 'version_mismatch', state: null, status: 'ok' } as never
    }
    if (q.actionKind !== undefined && q.actionKind !== grant.actionKind) {
      return { effective: false, reason: 'action_mismatch', state: null, status: 'ok' } as never
    }
    return {
      effective: true, reason: 'effective', status: 'ok',
      state: { principalId: grant.principalId, projectId: grant.projectId, authorityBasis: 'founder_owner' },
    } as never
  })
}

/** A grant that legitimately exists in project P but for something else entirely. */
const unrelatedGrant = (): Grant => ({
  id: AUTH_UNRELATED,
  projectId: PROJECT_P,
  target: { targetType: 'article', targetId: 'unrelated-article-42', versionHash: 'f'.repeat(64) },
  actionKind: 'publish_article',
  principalId: PRINCIPAL_A,
})

/** The grant that actually corresponds to approving decision dec-A at version 1. */
function correctGrant(lineage: DecisionRecord[], overrides: Partial<Grant> = {}): Grant {
  const binding = decisionAuthorizationBinding(lineage)
  return {
    id: AUTH_CORRECT,
    projectId: PROJECT_P,
    target: binding.target,
    actionKind: DECISION_ACTION.approve,
    principalId: PRINCIPAL_A,
    ...overrides,
  }
}

beforeEach(() => { mockAccess.mockReset(); mockAuth.mockReset(); })

// ── Finding 1 ─────────────────────────────────────────────────────────────────

describe('Finding 1 — authorization binding is not caller-controlled', () => {
  it('refuses to approve a decision with an unrelated same-project authorization', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([unrelatedGrant()])
    const store = new FakeStore([proposed()])

    // The attack: present a legitimate authorization granted for a completely
    // different object. Under the pre-R1 signature the caller also supplied the
    // target/action, so this matched and the decision was approved.
    const result = await approveDecision({
      decisionId: 'dec-A',
      authorizationId: AUTH_UNRELATED,
      rationale: 'Trial approved.',
      review: REVIEW,
      effectiveAt: T1,
      store, now: T1,
    } as never)

    expect(result.status).toBe('authority_not_effective')
    expect(store.appended).toHaveLength(0)
  })

  it('accepts only an authorization bound to this exact decision and action', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const lineage = [proposed()]
    authorizationService([correctGrant(lineage)])
    const store = new FakeStore(lineage)

    const result = await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT,
      rationale: 'Trial approved.', review: REVIEW, effectiveAt: T1, store, now: T1,
    })
    expect(result.status).toBe('ok')
    expect(result.state?.status).toBe('active')
  })

  it('exposes no caller-controlled target or action on any authority act', () => {
    // The security-sensitive binding must not be an argument at all.
    const args = ['ApproveDecisionArgs', 'ReverseDecisionArgs', 'AmendDecisionArgs', 'SupersedeDecisionArgs']
    const source = require('node:fs').readFileSync(
      require('node:path').resolve(__dirname, '../atlas/decision-ledger/principal-write.ts'), 'utf8',
    ) as string
    for (const name of args) {
      const block = source.match(new RegExp(`export interface ${name}[\\s\\S]*?\\n}`))
      if (!block) continue
      expect(block[0]).not.toMatch(/authorizationTarget|authorizationActionKind|actionKind|target\s*:/)
    }
  })
})

// ── Deterministic binding ─────────────────────────────────────────────────────

describe('Deterministic decision authorization binding', () => {
  it('derives target from the decision identity and material version', () => {
    const binding = decisionAuthorizationBinding([proposed()])
    expect(binding.target.targetType).toBe('decision')
    expect(binding.target.targetId).toBe('dec-A')
    expect(binding.target.versionHash).toMatch(/^[a-f0-9]{64}$/)
    expect(binding.actionKind).toBe(DECISION_ACTION.approve)
    expect(binding.projectId).toBe(PROJECT_P)
  })

  it('is stable and order-independent for identical material content', () => {
    const a = materialDecisionVersionHash({
      decisionId: 'd', projectId: 'p', version: 1, title: 't', statement: 's',
      materiality: ['risk', 'money'], effectiveAt: null, expiresAt: null,
      review: null, reversalConditions: [],
    })
    const b = materialDecisionVersionHash({
      statement: 's', title: 't', version: 1, projectId: 'p', decisionId: 'd',
      reversalConditions: [], review: null, expiresAt: null, effectiveAt: null,
      materiality: ['risk', 'money'],
    } as never)
    expect(a).toBe(b)
  })

  it('changes when material decision content changes', () => {
    const base = decisionAuthorizationBinding([proposed()])
    const retitled = decisionAuthorizationBinding([proposed({ statement: 'A materially different commitment.' })])
    const rescoped = decisionAuthorizationBinding([proposed({ materiality: ['money'] })])
    expect(retitled.target.versionHash).not.toBe(base.target.versionHash)
    expect(rescoped.target.versionHash).not.toBe(base.target.versionHash)
  })

  it('gives version N and N+1 different bindings', () => {
    const v1 = [proposed()]
    const v2 = [...v1, record('amended', { occurredAt: T1, version: 2, reason: 'Scope widened.', statement: 'Wider commitment.' })]
    expect(decisionAuthorizationBinding(v2).target.versionHash)
      .not.toBe(decisionAuthorizationBinding(v1).target.versionHash)
  })

  it('binds a different action for each authority act', () => {
    const lineage = [proposed()]
    const approve = decisionAuthorizationBinding(lineage, 'approve')
    const reverse = decisionAuthorizationBinding(lineage, 'reverse')
    const amend = decisionAuthorizationBinding(lineage, 'amend')
    const supersede = decisionAuthorizationBinding(lineage, 'supersede')
    const actions = [approve, reverse, amend, supersede].map(b => b.actionKind)
    expect(new Set(actions).size).toBe(4)
  })
})

// ── Approval-time vs continuing authority ─────────────────────────────────────

describe('Approval is a historical act, not a continuing lease', () => {
  async function approveThenExpire() {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const lineage = [proposed()]
    authorizationService([correctGrant(lineage, { expiresAt: T2 })])
    const store = new FakeStore(lineage)
    const approved = await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT,
      rationale: 'Trial approved.', review: REVIEW, effectiveAt: T1, store, now: T1,
    })
    expect(approved.status).toBe('ok')
    return store
  }

  it('approves while the authorization is effective', async () => {
    const store = await approveThenExpire()
    expect(store.appended.some(r => r.type === 'approved')).toBe(true)
  })

  it('keeps the decision governing after the authorization later expires', async () => {
    const store = await approveThenExpire()
    // The authorization expired at T2; the decision has no expiry of its own.
    const governing = await isDecisionGoverning('dec-A', { store, now: T3 })
    expect(governing.governing).toBe(true)
    expect(governing.reason).toBe('active')
  })

  it('preserves the approval act and its authorization reference immutably', async () => {
    const store = await approveThenExpire()
    const approval = store.appended.find(r => r.type === 'approved')!
    expect(approval.authority?.authorizationId).toBe(AUTH_CORRECT)
    expect(approval.authority?.approvedAt).toBe(T1)
    expect(approval.authority?.principalId).toBe(PRINCIPAL_A)
  })

  it('still stops governing on the decision’s OWN expiry (§11.45)', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const lineage = [proposed()]
    authorizationService([correctGrant(lineage)])
    const store = new FakeStore(lineage)
    await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT,
      rationale: 'Trial.', review: REVIEW, effectiveAt: T1, expiresAt: EXPIRES, store, now: T1,
    })
    expect((await isDecisionGoverning('dec-A', { store, now: T2 })).governing).toBe(true)
    const later = await isDecisionGoverning('dec-A', { store, now: AFTER_EXPIRY })
    expect(later.governing).toBe(false)
    expect(later.reason).toBe('expired')
  })
})

// ── Governing read cannot be weakened ─────────────────────────────────────────

describe('Governing read takes no security parameters', () => {
  it('accepts no caller-supplied target or action', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const lineage = [proposed()]
    authorizationService([correctGrant(lineage)])
    const store = new FakeStore(lineage)
    await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT,
      rationale: 'r', review: REVIEW, effectiveAt: T1, store, now: T1,
    })
    // A default query must be the complete evaluation — nothing to omit.
    const governing = await isDecisionGoverning('dec-A', { store, now: T2 })
    expect(governing.governing).toBe(true)

    const read = require('node:fs').readFileSync(
      require('node:path').resolve(__dirname, '../atlas/decision-ledger/principal-read.ts'), 'utf8',
    ) as string
    const signature = read.slice(read.indexOf('export async function isDecisionGoverning'))
    expect(signature.slice(0, 400)).not.toMatch(/target\?|actionKind\?/)
  })
})

// ── Reversal, supersession, amendment, completion ─────────────────────────────

describe('Reversal requires fresh authority (§11.57)', () => {
  async function activeDecision() {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const lineage = [proposed()]
    authorizationService([correctGrant(lineage)])
    const store = new FakeStore(lineage)
    await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT,
      rationale: 'r', review: REVIEW, effectiveAt: T1, store, now: T1,
    })
    return store
  }

  it('refuses reversal without a reversal-bound authorization', async () => {
    const store = await activeDecision()
    // Only the approve grant exists — it must not authorize a reversal.
    const result = await reverseDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT, reason: 'Policy violation.', store, now: T2,
    })
    expect(result.status).toBe('authority_not_effective')
  })

  it('reverses with a fresh reversal authorization and preserves both authorities', async () => {
    const store = await activeDecision()
    const lineage = await store.lineage('dec-A')
    const reversalBinding = decisionAuthorizationBinding(lineage, 'reverse')
    authorizationService([{
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', projectId: PROJECT_P,
      target: reversalBinding.target, actionKind: reversalBinding.actionKind, principalId: PRINCIPAL_A,
    }])
    const result = await reverseDecision({
      decisionId: 'dec-A', authorizationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      reason: 'Serious policy violation.', store, now: T2,
    })
    expect(result.status).toBe('ok')
    expect(result.state?.status).toBe('reversed')

    // Both authority acts survive, distinctly.
    const approval = store.appended.find(r => r.type === 'approved')!
    const reversal = store.appended.find(r => r.type === 'reversed')!
    expect(approval.authority?.authorizationId).toBe(AUTH_CORRECT)
    expect(reversal.authority?.authorizationId).toBe('ffffffff-ffff-4fff-8fff-ffffffffffff')
    expect(reversal.authority?.authorizationId).not.toBe(approval.authority?.authorizationId)
  })
})

describe('Supersession integrity (§11.56)', () => {
  async function activeWithSuccessor(successorProject = PROJECT_P) {
    authAs(PRINCIPAL_A, [PROJECT_P, PROJECT_Q])
    const lineage = [proposed()]
    authorizationService([correctGrant(lineage)])
    const store = new FakeStore(lineage)
    await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT,
      rationale: 'r', review: REVIEW, effectiveAt: T1, store, now: T1,
    })
    const successorId = newDecisionId()
    await store.append(record('proposed', {
      decisionId: successorId, projectId: successorProject, occurredAt: T2, recordId: 'succ-1',
    }))
    return { store, successorId }
  }

  async function supersedeWithAuthority(store: FakeStore, successorId: string, now = T3) {
    const lineage = await store.lineage('dec-A')
    const binding = decisionAuthorizationBinding(lineage, 'supersede')
    authorizationService([{
      id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', projectId: PROJECT_P,
      target: binding.target, actionKind: binding.actionKind, principalId: PRINCIPAL_A,
    }])
    return supersedeDecision({
      decisionId: 'dec-A', supersededBy: successorId,
      authorizationId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', store, now,
    })
  }

  it('rejects a nonexistent successor', async () => {
    const { store } = await activeWithSuccessor()
    const result = await supersedeWithAuthority(store, newDecisionId())
    expect(result.status).toBe('invalid_successor')
    expect(store.appended.some(r => r.type === 'superseded')).toBe(false)
  })

  it('rejects a cross-project successor', async () => {
    const { store, successorId } = await activeWithSuccessor(PROJECT_Q)
    const result = await supersedeWithAuthority(store, successorId)
    expect(result.status).toBe('invalid_successor')
  })

  it('rejects superseding a decision by itself', async () => {
    const { store } = await activeWithSuccessor()
    const result = await supersedeWithAuthority(store, 'dec-A')
    expect(result.status).toBe('invalid_successor')
  })

  it('requires fresh supersession authority', async () => {
    const { store, successorId } = await activeWithSuccessor()
    const result = await supersedeDecision({
      decisionId: 'dec-A', supersededBy: successorId, authorizationId: AUTH_CORRECT, store, now: T3,
    })
    expect(result.status).toBe('authority_not_effective')
  })

  it('supersedes with a valid successor and fresh authority', async () => {
    const { store, successorId } = await activeWithSuccessor()
    const result = await supersedeWithAuthority(store, successorId)
    expect(result.status).toBe('ok')
    expect(result.state?.status).toBe('superseded')
    expect(result.state?.supersededBy).toBe(successorId)
  })
})

describe('Material amendment requires fresh authority (§11.59–§11.62)', () => {
  async function activeDecision() {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const lineage = [proposed()]
    authorizationService([correctGrant(lineage)])
    const store = new FakeStore(lineage)
    await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT,
      rationale: 'r', review: REVIEW, effectiveAt: T1, store, now: T1,
    })
    return store
  }

  it('refuses an amendment carrying only the original approval authority', async () => {
    const store = await activeDecision()
    const result = await amendDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT,
      reason: 'Widen scope.', statement: 'A materially wider commitment.',
      rationale: 'r', review: REVIEW, effectiveAt: T2, store, now: T2,
    })
    expect(result.status).toBe('authority_not_effective')
    expect(store.appended.some(r => r.type === 'amended')).toBe(false)
  })

  it('creates version N+1 under fresh authority and keeps version N auditable', async () => {
    const store = await activeDecision()
    const lineage = await store.lineage('dec-A')
    const amendBinding = decisionAuthorizationBinding(lineage, 'amend')
    authorizationService([{
      id: 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', projectId: PROJECT_P,
      target: amendBinding.target, actionKind: amendBinding.actionKind, principalId: PRINCIPAL_A,
    }])
    const result = await amendDecision({
      decisionId: 'dec-A', authorizationId: 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb',
      reason: 'Widen scope after review.', statement: 'A materially wider commitment.',
      rationale: 'Evidence improved.', review: REVIEW, effectiveAt: T2, store, now: T2,
    })
    expect(result.status).toBe('ok')
    expect(result.state?.version).toBe(2)
    expect(result.state?.statement).toBe('A materially wider commitment.')
    // Version 1 remains in the immutable lineage.
    expect(result.state?.lineage.map(l => l.version)).toContain(1)
    expect(store.appended.filter(r => r.type === 'approved')).toHaveLength(1)
  })
})

describe('Completion requires observed outcome (§11.58)', () => {
  async function activeDecision() {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const lineage = [proposed()]
    authorizationService([correctGrant(lineage)])
    const store = new FakeStore(lineage)
    await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT,
      rationale: 'r', review: REVIEW, effectiveAt: T1, store, now: T1,
    })
    return store
  }

  it('refuses completion with no observed outcome', async () => {
    const store = await activeDecision()
    const result = await completeDecision({ decisionId: 'dec-A', reason: 'Done.', store, now: T2 })
    expect(result.status).toBe('outcome_required')
    expect(store.appended.some(r => r.type === 'completed')).toBe(false)
  })

  it('refuses completion when the only outcome is the explicit UNKNOWN', async () => {
    const store = await activeDecision()
    await observeOutcome({
      decisionId: 'dec-A',
      outcome: { status: 'not_yet_measurable', summary: 'Too early.', observedAt: T2, evidence: [] },
      store, now: T2,
    })
    const result = await completeDecision({ decisionId: 'dec-A', reason: 'Done.', store, now: T3 })
    expect(result.status).toBe('outcome_required')
  })

  it('completes once a measured outcome exists', async () => {
    const store = await activeDecision()
    await observeOutcome({
      decisionId: 'dec-A',
      outcome: { status: 'successful', summary: 'Migration finished.', observedAt: T2, evidence: EVIDENCE },
      store, now: T2,
    })
    const result = await completeDecision({ decisionId: 'dec-A', reason: 'Done.', store, now: T3 })
    expect(result.status).toBe('ok')
    expect(result.state?.status).toBe('completed')
  })
})

// ── Outcome lifecycle eligibility ─────────────────────────────────────────────

describe('Outcome lifecycle eligibility', () => {
  it('refuses an outcome on a decision that never became effective', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([])
    const store = new FakeStore([proposed()])
    const result = await observeOutcome({
      decisionId: 'dec-A',
      outcome: { status: 'successful', summary: 'x', observedAt: T2, evidence: EVIDENCE },
      store, now: T2,
    })
    expect(result.status).toBe('invalid_lifecycle')
    expect(store.appended).toHaveLength(0)
  })

  it('refuses an outcome on a rejected decision', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([])
    const store = new FakeStore([proposed(), record('rejected', { occurredAt: T1, reason: 'No.' })])
    const result = await observeOutcome({
      decisionId: 'dec-A',
      outcome: { status: 'unsuccessful', summary: 'x', observedAt: T2, evidence: EVIDENCE },
      store, now: T2,
    })
    expect(result.status).toBe('invalid_lifecycle')
  })
})

// ── Authority principal provenance ────────────────────────────────────────────

describe('Authority principal provenance', () => {
  it('refuses when the authorization principal is not the acting caller', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const lineage = [proposed()]
    // The authorization was granted by a DIFFERENT human.
    authorizationService([correctGrant(lineage, { principalId: PRINCIPAL_B })])
    const store = new FakeStore(lineage)
    const result = await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT,
      rationale: 'r', review: REVIEW, effectiveAt: T1, store, now: T1,
    })
    expect(result.status).toBe('authority_principal_mismatch')
    expect(store.appended).toHaveLength(0)
  })

  it('records the authorization’s own principal as the decision authority', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const lineage = [proposed()]
    authorizationService([correctGrant(lineage)])
    const store = new FakeStore(lineage)
    await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT,
      rationale: 'r', review: REVIEW, effectiveAt: T1, store, now: T1,
    })
    const approval = store.appended.find(r => r.type === 'approved')!
    expect(approval.authority?.principalId).toBe(PRINCIPAL_A)
    expect(approval.principalId).toBe(PRINCIPAL_A)
  })
})
