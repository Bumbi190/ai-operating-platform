/**
 * Decision Ledger V1 — authority binding, lifecycle and append safety
 * (EI-S1.3B-R1 and EI-S1.3B-R2).
 *
 * The Authorization V1 double here is FAITHFUL: it answers `effective` only when
 * the queried project, target (including version hash) and action match what the
 * authorization was actually granted for, exactly as the real seam does. That is
 * what makes the binding attacks observable — a blanket "always effective" mock
 * would hide every one of them.
 *
 * Grants are obtained the way a real caller obtains them: `prepareDecisionAct`
 * returns the binding for the exact act about to be requested, and the grant is
 * issued against that. Presenting the act with different terms afterwards is
 * then a genuine attack, not a fixture mismatch.
 *
 * Filesystem/local only: no database, no network, no credentials.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
  deferDecision,
  observeOutcome,
  prepareDecisionAct,
  recordDecisionReview,
  rejectDecision,
  reverseDecision,
  supersedeDecision,
} from '@/lib/atlas/decision-ledger/principal-write'
import { isDecisionGoverning } from '@/lib/atlas/decision-ledger/principal-read'
import {
  AUTHORITY_UNBOUND_FIELDS,
  authorityBoundProjection,
  DECISION_ACTION,
} from '@/lib/atlas/decision-ledger/binding'
import type { DecisionRecord, DecisionRecordType } from '@/lib/atlas/decision-ledger/types'
import type { DecisionLedgerStore } from '@/lib/atlas/decision-ledger/store'

const DL_DIR = resolve(__dirname, '../atlas/decision-ledger')

const PRINCIPAL_A = '11111111-1111-4111-8111-111111111111'
const PRINCIPAL_B = '22222222-2222-4222-8222-222222222222'
const PROJECT_P = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROJECT_Q = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const AUTH_UNRELATED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const AUTH_CORRECT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const AUTH_SECOND = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

const T0 = '2026-08-19T08:00:00.000Z'
const T1 = '2026-08-19T09:00:00.000Z'
const T2 = '2026-08-19T10:00:00.000Z'
const T3 = '2026-08-19T11:00:00.000Z'
const T4 = '2026-08-19T12:00:00.000Z'
const FAR_FUTURE = '2027-01-01T00:00:00.000Z'
const EXPIRES = '2026-09-19T08:00:00.000Z'
const AFTER_EXPIRY = '2026-09-20T08:00:00.000Z'

const REVIEW = { trigger: 'time_based' as const, description: 'Review in 30 days.', dueAt: '2026-09-10T08:00:00.000Z' }
const OTHER_REVIEW = { trigger: 'time_based' as const, description: 'Never review it.', dueAt: '2099-01-01T00:00:00.000Z' }
const EVIDENCE = [{ kind: 'report', ref: 'r-1', label: 'Report', observedAt: T0, scope: 'p' }]
const MEASURED = { status: 'successful' as const, summary: 'It worked.', observedAt: T2, evidence: EVIDENCE }

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
    baseRecordCount: 0,
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

/**
 * Issue a grant for exactly the act described — the real flow: the human is
 * shown the prospective act, and authorizes that.
 */
async function grantFor(
  act: Parameters<typeof prepareDecisionAct>[0],
  overrides: Partial<Grant> = {},
): Promise<Grant> {
  const { binding, status, detail } = await prepareDecisionAct(act)
  expect(`${status}${detail ? `:${detail}` : ''}`).toBe('ok')
  return {
    id: AUTH_CORRECT,
    projectId: binding!.projectId,
    target: binding!.target,
    actionKind: binding!.actionKind,
    principalId: PRINCIPAL_A,
    ...overrides,
  }
}

/** The standard approval terms used throughout. */
const APPROVAL = { rationale: 'Subscriber trust.', review: REVIEW, effectiveAt: T1 }

/** A decision approved at T1 and effective from T1 — genuinely active at T2. */
async function activeDecision(): Promise<FakeStore> {
  authAs(PRINCIPAL_A, [PROJECT_P])
  const store = new FakeStore([proposed()])
  const grant = await grantFor({ act: 'approve', decisionId: 'dec-A', ...APPROVAL, store, now: T1 })
  authorizationService([grant])
  const approved = await approveDecision({
    decisionId: 'dec-A', authorizationId: AUTH_CORRECT, ...APPROVAL, store, now: T1,
  })
  expect(approved.status).toBe('ok')
  return store
}

beforeEach(() => { mockAccess.mockReset(); mockAuth.mockReset() })

// ── R1: the unrelated-authorization attack stays fixed ────────────────────────

describe('An unrelated authorization cannot approve a decision (R1)', () => {
  it('refuses a legitimate same-project grant issued for a different object', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([unrelatedGrant()])
    const store = new FakeStore([proposed()])
    const result = await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_UNRELATED, ...APPROVAL, store, now: T1,
    })
    expect(result.status).toBe('authority_not_effective')
    expect(store.appended).toHaveLength(0)
  })

  it('exposes no caller-controlled target or action on any authority act', () => {
    const source = readFileSync(resolve(DL_DIR, 'principal-write.ts'), 'utf8')
    const blocks = source.match(/export interface \w+Args[\s\S]*?\n}/g) ?? []
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) {
      expect(block).not.toMatch(/authorizationTarget|authorizationActionKind|actionKind|versionHash|target\s*:/)
      expect(block).not.toMatch(/principalId/)
    }
  })
})

// ── 1–4. Approval binds the prospective act ──────────────────────────────────

describe('An approval grant binds the exact approved act (§11.41)', () => {
  async function grantForStandardApproval(store: FakeStore) {
    authAs(PRINCIPAL_A, [PROJECT_P])
    return grantFor({ act: 'approve', decisionId: 'dec-A', ...APPROVAL, store, now: T1 })
  }

  it('accepts the exact approved candidate that was authorized', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const store = new FakeStore([proposed()])
    authorizationService([await grantForStandardApproval(store)])
    const result = await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT, ...APPROVAL, store, now: T1,
    })
    expect(result.status).toBe('ok')
    expect(result.state?.status).toBe('active')
  })

  it('refuses an altered effective date', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const store = new FakeStore([proposed()])
    authorizationService([await grantForStandardApproval(store)])
    const result = await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT,
      rationale: APPROVAL.rationale, review: REVIEW, effectiveAt: T3, store, now: T1,
    })
    expect(result.status).toBe('authority_not_effective')
    expect(store.appended).toHaveLength(0)
  })

  it('refuses an altered expiry', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const store = new FakeStore([proposed()])
    authorizationService([await grantForStandardApproval(store)])
    const result = await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT, ...APPROVAL,
      expiresAt: '2099-01-01T00:00:00.000Z', store, now: T1,
    })
    expect(result.status).toBe('authority_not_effective')
    expect(store.appended).toHaveLength(0)
  })

  it('refuses altered review terms', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const store = new FakeStore([proposed()])
    authorizationService([await grantForStandardApproval(store)])
    const result = await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT,
      rationale: APPROVAL.rationale, review: OTHER_REVIEW, effectiveAt: T1, store, now: T1,
    })
    expect(result.status).toBe('authority_not_effective')
    expect(store.appended).toHaveLength(0)
  })

  it('refuses an altered rationale — §11.26 is the institutional reason', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const store = new FakeStore([proposed()])
    authorizationService([await grantForStandardApproval(store)])
    const result = await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT,
      rationale: 'A different reason entirely.', review: REVIEW, effectiveAt: T1, store, now: T1,
    })
    expect(result.status).toBe('authority_not_effective')
  })
})

// ── 5–7. Amendment binds prospective N+1 ─────────────────────────────────────

describe('An amendment grant binds the prospective version N+1 (§11.62)', () => {
  const AMENDMENT = {
    reason: 'Widen scope after review.',
    statement: 'A materially wider commitment.',
    rationale: 'Evidence improved.',
    review: REVIEW,
    effectiveAt: T2,
  }

  it('creates version N+1 under a grant issued for that exact content', async () => {
    const store = await activeDecision()
    authorizationService([await grantFor(
      { act: 'amend', decisionId: 'dec-A', ...AMENDMENT, store, now: T2 },
      { id: AUTH_SECOND },
    )])
    const result = await amendDecision({
      decisionId: 'dec-A', authorizationId: AUTH_SECOND, ...AMENDMENT, store, now: T2,
    })
    expect(result.status).toBe('ok')
    expect(result.state?.version).toBe(2)
    expect(result.state?.statement).toBe(AMENDMENT.statement)
    expect(result.state?.lineage.map(l => l.version)).toContain(1)
  })

  it('refuses an amendment carrying only the original approval authority', async () => {
    const store = await activeDecision()
    const result = await amendDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT, ...AMENDMENT, store, now: T2,
    })
    expect(result.status).toBe('authority_not_effective')
    expect(store.appended.some(r => r.type === 'amended')).toBe(false)
  })

  it('a grant for amendment X cannot append amendment Y', async () => {
    const store = await activeDecision()
    authorizationService([await grantFor(
      { act: 'amend', decisionId: 'dec-A', ...AMENDMENT, store, now: T2 },
      { id: AUTH_SECOND },
    )])
    // Same act, same decision, same version — a materially different commitment.
    const result = await amendDecision({
      decisionId: 'dec-A', authorizationId: AUTH_SECOND, ...AMENDMENT,
      statement: 'An entirely different and much wider commitment.',
      materiality: ['money', 'risk'], store, now: T2,
    })
    expect(result.status).toBe('authority_not_effective')
    expect(store.appended.some(r => r.type === 'amended')).toBe(false)
  })

  it('a grant for amendment X cannot append X with a different expiry', async () => {
    const store = await activeDecision()
    authorizationService([await grantFor(
      { act: 'amend', decisionId: 'dec-A', ...AMENDMENT, store, now: T2 },
      { id: AUTH_SECOND },
    )])
    const result = await amendDecision({
      decisionId: 'dec-A', authorizationId: AUTH_SECOND, ...AMENDMENT,
      expiresAt: '2099-01-01T00:00:00.000Z', store, now: T2,
    })
    expect(result.status).toBe('authority_not_effective')
  })
})

// ── 7. The bound projection covers every material field ──────────────────────

describe('The authority binding covers every canonically material field', () => {
  const base = () => record('approved', {
    occurredAt: T1, rationale: 'r', review: REVIEW, effectiveAt: T1,
    authority: {
      basis: 'founder_owner', authorizationId: AUTH_CORRECT, principalId: PRINCIPAL_A,
      actionKind: DECISION_ACTION.approve, boundVersionHash: 'a'.repeat(64), authorityActAt: T1,
    },
  })

  it('enumerates every DecisionRecord field as bound or explicitly unbound', () => {
    const candidate = base()
    const bound = new Set(Object.keys(authorityBoundProjection(candidate)))
    const unbound = new Set<string>(AUTHORITY_UNBOUND_FIELDS)
    const unclassified = Object.keys(candidate).filter(field => !bound.has(field) && !unbound.has(field))
    // A field added to DecisionRecord must be ruled on, not silently omitted.
    expect(unclassified).toEqual([])
  })

  it.each([
    ['title', 'A different title'],
    ['statement', 'A different commitment'],
    ['recommendation', 'A different recommendation'],
    ['rationale', 'A different reason'],
    ['expectedImpact', 'A different expectation'],
    ['effectiveAt', T3],
    ['expiresAt', FAR_FUTURE],
    ['confidence', 'low'],
    ['supersededBy', 'other-decision'],
    ['reason', 'A different reason for the act'],
    ['version', 7],
  ])('changing %s changes the binding', (field, value) => {
    const original = JSON.stringify(authorityBoundProjection(base()))
    const altered = JSON.stringify(authorityBoundProjection({ ...base(), [field]: value } as never))
    expect(altered).not.toBe(original)
  })

  it.each([
    ['materiality', ['money']],
    ['review', OTHER_REVIEW],
    ['reversalConditions', ['A new reversal condition']],
    ['evidence', EVIDENCE],
    ['alternatives', [{ option: 'Do nothing', reasonRejected: 'Too slow' }]],
    ['snapshot', { capturedAt: T0, summary: 'What was known then.' }],
  ])('changing %s changes the binding', (field, value) => {
    const original = JSON.stringify(authorityBoundProjection(base()))
    const altered = JSON.stringify(authorityBoundProjection({ ...base(), [field]: value } as never))
    expect(altered).not.toBe(original)
  })

  it('ignores identity, clock, principal, proof and concurrency position', () => {
    const original = JSON.stringify(authorityBoundProjection(base()))
    const noise = {
      ...base(),
      recordId: 'a-completely-different-row-id',
      occurredAt: T4,
      principalId: PRINCIPAL_B,
      authority: null,
      baseRecordCount: 99,
    }
    expect(JSON.stringify(authorityBoundProjection(noise as never))).toBe(original)
  })

  it('binds a distinct action for each of the six authority acts', () => {
    expect(new Set(Object.values(DECISION_ACTION)).size).toBe(6)
  })
})

// ── 8–12. Preflight: nothing invalid is ever appended ────────────────────────

describe('No record is appended until the prospective lineage validates', () => {
  it('refuses to reject an active decision and appends nothing', async () => {
    const store = await activeDecision()
    const before = store.appended.length
    const result = await rejectDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT, reason: 'Changed my mind.', store, now: T2,
    })
    expect(result.status).toBe('invalid_lifecycle')
    expect(store.appended).toHaveLength(before)
    expect(store.appended.some(r => r.type === 'rejected')).toBe(false)
  })

  it('refuses to reverse a proposal and appends nothing', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([])
    const store = new FakeStore([proposed()])
    const result = await reverseDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT, reason: 'Undo it.', store, now: T2,
    })
    expect(result.status).toBe('invalid_lifecycle')
    expect(store.appended).toHaveLength(0)
  })

  it('refuses a second close on an already reversed decision', async () => {
    const store = await activeDecision()
    authorizationService([await grantFor(
      { act: 'reverse', decisionId: 'dec-A', reason: 'Policy violation.', store, now: T2 },
      { id: AUTH_SECOND },
    )])
    expect((await reverseDecision({
      decisionId: 'dec-A', authorizationId: AUTH_SECOND, reason: 'Policy violation.', store, now: T2,
    })).status).toBe('ok')

    const before = store.appended.length
    const result = await supersedeDecision({
      decisionId: 'dec-A', supersededBy: newDecisionId(),
      authorizationId: AUTH_SECOND, store, now: T3,
    })
    expect(result.status).not.toBe('ok')
    expect(store.appended).toHaveLength(before)
  })

  it('refuses to amend a reversed decision (§11.60 history is not amended)', async () => {
    const store = await activeDecision()
    authorizationService([await grantFor(
      { act: 'reverse', decisionId: 'dec-A', reason: 'Policy violation.', store, now: T2 },
      { id: AUTH_SECOND },
    )])
    await reverseDecision({
      decisionId: 'dec-A', authorizationId: AUTH_SECOND, reason: 'Policy violation.', store, now: T2,
    })
    const before = store.appended.length
    const result = await amendDecision({
      decisionId: 'dec-A', authorizationId: AUTH_SECOND, reason: 'Revive it quietly.',
      statement: 'The reversed commitment, restated.', rationale: 'r', review: REVIEW,
      effectiveAt: T3, store, now: T3,
    })
    expect(result.status).toBe('invalid_lifecycle')
    expect(store.appended).toHaveLength(before)
  })

  it('refuses to defer an already settled decision', async () => {
    const store = await activeDecision()
    const before = store.appended.length
    const result = await deferDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT, reason: 'Wait for data.', store, now: T2,
    })
    expect(result.status).toBe('invalid_lifecycle')
    expect(store.appended).toHaveLength(before)
  })

  it('validates the candidate through the pure core before the store is touched', () => {
    const write = readFileSync(resolve(DL_DIR, 'principal-write.ts'), 'utf8')
    const commit = write.slice(write.indexOf('async function commitAct('))
    const body = commit.slice(0, commit.indexOf('\nfunction ') > -1 ? commit.indexOf('\nfunction ') : undefined)
    expect(body.indexOf('deriveDecisionState(')).toBeLessThan(body.indexOf('store.append('))
    // And there is exactly one place that appends at all.
    expect(write.match(/store\.append\(/g) ?? []).toHaveLength(1)
  })
})

// ── 13. Reject and defer authority ───────────────────────────────────────────

describe('Rejection and deferral are authority acts (§11.53, §11.39)', () => {
  it('refuses a rejection with no authorization', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([])
    const store = new FakeStore([proposed()])
    const result = await rejectDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT, reason: 'Too risky.', store, now: T1,
    })
    expect(result.status).toBe('authority_not_effective')
    expect(store.appended).toHaveLength(0)
  })

  it('rejects under a decision.reject grant bound to the recorded reason', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const store = new FakeStore([proposed()])
    authorizationService([await grantFor(
      { act: 'reject', decisionId: 'dec-A', reason: 'Too risky.', store, now: T1 },
    )])
    expect((await rejectDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT, reason: 'Too risky.', store, now: T1,
    })).status).toBe('ok')

    // The same grant cannot record a different reason.
    const other = new FakeStore([proposed()])
    const result = await rejectDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT, reason: 'A different official reason.', store: other, now: T1,
    })
    expect(result.status).toBe('authority_not_effective')
  })

  it('refuses a deferral with only a reject grant', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const store = new FakeStore([proposed()])
    authorizationService([await grantFor(
      { act: 'reject', decisionId: 'dec-A', reason: 'Wait.', store, now: T1 },
    )])
    const result = await deferDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT, reason: 'Wait.', store, now: T1,
    })
    expect(result.status).toBe('authority_not_effective')
  })

  it('defers under its own grant, and the decision may still be approved later', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const store = new FakeStore([proposed()])
    authorizationService([await grantFor(
      { act: 'defer', decisionId: 'dec-A', reason: 'Awaiting churn data.', store, now: T1 },
    )])
    const deferred = await deferDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT, reason: 'Awaiting churn data.', store, now: T1,
    })
    expect(deferred.status).toBe('ok')
    expect(deferred.state?.status).toBe('deferred')

    // §11.54 — a deferred decision must not disappear; it can be taken up again.
    authorizationService([await grantFor(
      { act: 'approve', decisionId: 'dec-A', ...APPROVAL, effectiveAt: T2, store, now: T2 },
      { id: AUTH_SECOND },
    )])
    const approved = await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_SECOND, ...APPROVAL, effectiveAt: T2, store, now: T2,
    })
    expect(approved.status).toBe('ok')
  })
})

// ── 14–20. Supersession ──────────────────────────────────────────────────────

describe('Supersession successor integrity (§11.56)', () => {
  /** Build a successor decision in `project`, at the given lifecycle status. */
  async function successor(store: FakeStore, status: 'proposed' | 'approved' | 'rejected', project = PROJECT_P) {
    const id = newDecisionId()
    await store.append(record('proposed', {
      decisionId: id, projectId: project, occurredAt: T0, recordId: `o-${id}`, baseRecordCount: 0,
    }))
    if (status === 'approved') {
      await store.append(record('approved', {
        decisionId: id, projectId: project, occurredAt: T1, recordId: `a-${id}`, baseRecordCount: 1,
        rationale: 'r', review: REVIEW, effectiveAt: T1,
        authority: {
          basis: 'founder_owner', authorizationId: AUTH_CORRECT, principalId: PRINCIPAL_A,
          actionKind: DECISION_ACTION.approve, boundVersionHash: 'a'.repeat(64), authorityActAt: T1,
        },
      }))
    }
    if (status === 'rejected') {
      await store.append(record('rejected', {
        decisionId: id, projectId: project, occurredAt: T1, recordId: `x-${id}`,
        baseRecordCount: 1, reason: 'No.',
      }))
    }
    return id
  }

  async function supersedeWith(store: FakeStore, successorId: string, now = T3) {
    authorizationService([await grantFor(
      { act: 'supersede', decisionId: 'dec-A', supersededBy: successorId, store, now },
      { id: AUTH_SECOND },
    )])
    return supersedeDecision({
      decisionId: 'dec-A', supersededBy: successorId, authorizationId: AUTH_SECOND, store, now,
    })
  }

  it('accepts an approved successor in the same project', async () => {
    const store = await activeDecision()
    authAs(PRINCIPAL_A, [PROJECT_P, PROJECT_Q])
    const id = await successor(store, 'approved')
    const result = await supersedeWith(store, id)
    expect(result.status).toBe('ok')
    expect(result.state?.supersededBy).toBe(id)
  })

  it('refuses a mere proposal as successor — a proposal is not a decision', async () => {
    const store = await activeDecision()
    authAs(PRINCIPAL_A, [PROJECT_P, PROJECT_Q])
    const result = await supersedeWith(store, await successor(store, 'proposed'))
    expect(result.status).toBe('invalid_successor')
    expect(store.appended.some(r => r.type === 'superseded')).toBe(false)
  })

  it('refuses a rejected successor', async () => {
    const store = await activeDecision()
    authAs(PRINCIPAL_A, [PROJECT_P, PROJECT_Q])
    const result = await supersedeWith(store, await successor(store, 'rejected'))
    expect(result.status).toBe('invalid_successor')
  })

  it('refuses a nonexistent successor', async () => {
    const store = await activeDecision()
    const result = await supersedeWith(store, newDecisionId())
    expect(result.status).toBe('invalid_successor')
  })

  it('refuses a cross-project successor, identically to an unknown one', async () => {
    const store = await activeDecision()
    authAs(PRINCIPAL_A, [PROJECT_P, PROJECT_Q])
    const foreign = await supersedeWith(store, await successor(store, 'approved', PROJECT_Q))
    const unknown = await supersedeWith(store, newDecisionId())
    expect(foreign.status).toBe('invalid_successor')
    expect(foreign.detail).toBe(unknown.detail)
  })

  it('refuses superseding a decision by itself', async () => {
    const store = await activeDecision()
    const result = await supersedeWith(store, 'dec-A')
    expect(result.status).toBe('invalid_successor')
  })

  it('binds the grant to the exact successor — swapping it invalidates the grant', async () => {
    const store = await activeDecision()
    authAs(PRINCIPAL_A, [PROJECT_P, PROJECT_Q])
    const b = await successor(store, 'approved')
    const c = await successor(store, 'approved')
    // The human authorized "superseded by B".
    authorizationService([await grantFor(
      { act: 'supersede', decisionId: 'dec-A', supersededBy: b, store, now: T3 },
      { id: AUTH_SECOND },
    )])
    const swapped = await supersedeDecision({
      decisionId: 'dec-A', supersededBy: c, authorizationId: AUTH_SECOND, store, now: T3,
    })
    expect(swapped.status).toBe('authority_not_effective')
    expect(store.appended.some(r => r.type === 'superseded')).toBe(false)

    const asAuthorized = await supersedeDecision({
      decisionId: 'dec-A', supersededBy: b, authorizationId: AUTH_SECOND, store, now: T3,
    })
    expect(asAuthorized.status).toBe('ok')
  })
})

describe('Supersession cycle detection', () => {
  /** Chain `from` → `to` as an already-superseded, approved decision. */
  async function chain(store: FakeStore, from: string, to: string) {
    await store.append(record('proposed', { decisionId: from, occurredAt: T0, recordId: `o-${from}`, baseRecordCount: 0 }))
    await store.append(record('approved', {
      decisionId: from, occurredAt: T1, recordId: `a-${from}`, baseRecordCount: 1,
      rationale: 'r', review: REVIEW, effectiveAt: T1,
      authority: {
        basis: 'founder_owner', authorizationId: AUTH_CORRECT, principalId: PRINCIPAL_A,
        actionKind: DECISION_ACTION.approve, boundVersionHash: 'a'.repeat(64), authorityActAt: T1,
      },
    }))
    await store.append(record('superseded', {
      decisionId: from, occurredAt: T2, recordId: `s-${from}`, baseRecordCount: 2,
      supersededBy: to, reason: 'Replaced.',
    }))
  }

  async function attempt(store: FakeStore, successorId: string) {
    authorizationService([await grantFor(
      { act: 'supersede', decisionId: 'dec-A', supersededBy: successorId, store, now: T3 },
      { id: AUTH_SECOND },
    )])
    return supersedeDecision({
      decisionId: 'dec-A', supersededBy: successorId, authorizationId: AUTH_SECOND, store, now: T3,
    })
  }

  it('refuses a two-node cycle: A → B where B → A', async () => {
    const store = await activeDecision()
    const b = newDecisionId()
    await chain(store, b, 'dec-A')
    const result = await attempt(store, b)
    expect(result.status).toBe('invalid_successor')
    expect(result.detail).toBe('cycle')
  })

  it('refuses a three-node cycle: A → B → C → A', async () => {
    const store = await activeDecision()
    const b = newDecisionId(); const c = newDecisionId()
    await chain(store, b, c)
    await chain(store, c, 'dec-A')
    const result = await attempt(store, b)
    expect(result.status).toBe('invalid_successor')
    expect(result.detail).toBe('cycle')
  })

  it('walks a longer acyclic chain without reporting a false cycle', async () => {
    const store = await activeDecision()
    const b = newDecisionId(); const c = newDecisionId(); const d = newDecisionId()
    await chain(store, b, c)
    await chain(store, c, d)
    const result = await attempt(store, b)
    // The walk terminates cleanly; B is then refused on its own lifecycle, not
    // on a phantom cycle or a length bound.
    expect(result.detail).toBe('successor_not_a_decision')
  })

  it('accepts an approved successor that ends the chain', async () => {
    const store = await activeDecision()
    const b = newDecisionId()
    await store.append(record('proposed', { decisionId: b, occurredAt: T0, recordId: `o-${b}`, baseRecordCount: 0 }))
    await store.append(record('approved', {
      decisionId: b, occurredAt: T1, recordId: `a-${b}`, baseRecordCount: 1,
      rationale: 'r', review: REVIEW, effectiveAt: T1,
      authority: {
        basis: 'founder_owner', authorizationId: AUTH_CORRECT, principalId: PRINCIPAL_A,
        actionKind: DECISION_ACTION.approve, boundVersionHash: 'a'.repeat(64), authorityActAt: T1,
      },
    }))
    expect((await attempt(store, b)).status).toBe('ok')
  })
})

// ── 21–23. Outcome and completion lifecycle ──────────────────────────────────

describe('Outcome and completion require a decision that took effect', () => {
  /** Approved at T1 but not effective until the far future. */
  async function futureEffective(): Promise<FakeStore> {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const store = new FakeStore([proposed()])
    const terms = { rationale: 'r', review: REVIEW, effectiveAt: FAR_FUTURE }
    authorizationService([await grantFor({ act: 'approve', decisionId: 'dec-A', ...terms, store, now: T1 })])
    expect((await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT, ...terms, store, now: T1,
    })).status).toBe('ok')
    return store
  }

  it('refuses an outcome on a future-effective approved decision', async () => {
    const store = await futureEffective()
    const before = store.appended.length
    const result = await observeOutcome({ decisionId: 'dec-A', outcome: MEASURED, store, now: T2 })
    // §11.51 — `approved` with a future effective date executed nothing.
    expect(result.status).toBe('invalid_lifecycle')
    expect(store.appended).toHaveLength(before)
  })

  it('refuses completion of a future-effective approved decision', async () => {
    const store = await futureEffective()
    const result = await completeDecision({ decisionId: 'dec-A', reason: 'Done.', store, now: T2 })
    expect(result.status).toBe('invalid_lifecycle')
    expect(store.appended.some(r => r.type === 'completed')).toBe(false)
  })

  it('refuses an outcome on a decision reversed before it ever took effect', async () => {
    const store = await futureEffective()
    authorizationService([await grantFor(
      { act: 'reverse', decisionId: 'dec-A', reason: 'Reconsidered before it started.', store, now: T2 },
      { id: AUTH_SECOND },
    )])
    expect((await reverseDecision({
      decisionId: 'dec-A', authorizationId: AUTH_SECOND,
      reason: 'Reconsidered before it started.', store, now: T2,
    })).status).toBe('ok')

    // `reversed` IS an outcome-eligible status, so only the effective-date test
    // can catch this one.
    const before = store.appended.length
    const result = await observeOutcome({ decisionId: 'dec-A', outcome: MEASURED, store, now: T3 })
    expect(result.status).toBe('invalid_lifecycle')
    expect(result.detail).toBe('never_effective')
    expect(store.appended).toHaveLength(before)
  })

  it('refuses an outcome on a decision that was never approved', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([])
    const store = new FakeStore([proposed()])
    const result = await observeOutcome({ decisionId: 'dec-A', outcome: MEASURED, store, now: T2 })
    expect(result.status).toBe('invalid_lifecycle')
    expect(store.appended).toHaveLength(0)
  })

  it('records an outcome on an active decision', async () => {
    const store = await activeDecision()
    const result = await observeOutcome({ decisionId: 'dec-A', outcome: MEASURED, store, now: T2 })
    expect(result.status).toBe('ok')
    expect(result.state?.outcome?.status).toBe('successful')
  })

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

  it('refuses completion without a review — §11.58 requires execution AND review', async () => {
    const store = await activeDecision()
    await observeOutcome({ decisionId: 'dec-A', outcome: MEASURED, store, now: T2 })
    const result = await completeDecision({ decisionId: 'dec-A', reason: 'Done.', store, now: T3 })
    expect(result.status).toBe('review_required')
    expect(store.appended.some(r => r.type === 'completed')).toBe(false)
  })

  it('completes once execution was measured and a review is recorded', async () => {
    const store = await activeDecision()
    await observeOutcome({ decisionId: 'dec-A', outcome: MEASURED, store, now: T2 })
    await recordDecisionReview({
      decisionId: 'dec-A', reviewNote: 'The evidence threshold was right.', store, now: T3,
    })
    const result = await completeDecision({ decisionId: 'dec-A', reason: 'Migration finished.', store, now: T4 })
    expect(result.status).toBe('ok')
    expect(result.state?.status).toBe('completed')
  })
})

// ── 24. Concurrency ──────────────────────────────────────────────────────────

describe('Concurrent incompatible transitions', () => {
  it('stamps every act with the lineage position it was derived from', async () => {
    const store = await activeDecision()
    const approved = store.appended.find(r => r.type === 'approved')!
    // One prior record (the proposal) existed when the approval was derived.
    expect(approved.baseRecordCount).toBe(1)
    await observeOutcome({ decisionId: 'dec-A', outcome: MEASURED, store, now: T2 })
    expect(store.appended.find(r => r.type === 'outcome_observed')!.baseRecordCount).toBe(2)
  })

  it('gives two acts derived from the same lineage the same serialization key', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const store = new FakeStore([proposed()])
    authorizationService([await grantFor({ act: 'approve', decisionId: 'dec-A', ...APPROVAL, store, now: T1 })])
    await approveDecision({ decisionId: 'dec-A', authorizationId: AUTH_CORRECT, ...APPROVAL, store, now: T1 })

    // A deferral computed from the same one-record lineage the approval saw.
    const rival = new FakeStore([proposed()])
    authorizationService([await grantFor(
      { act: 'defer', decisionId: 'dec-A', reason: 'Awaiting data.', store: rival, now: T1 },
      { id: AUTH_SECOND },
    )])
    await deferDecision({
      decisionId: 'dec-A', authorizationId: AUTH_SECOND, reason: 'Awaiting data.', store: rival, now: T1,
    })
    // Same (decision_id, base_record_count) — the unique index rejects the loser.
    expect(rival.appended[0].baseRecordCount).toBe(store.appended[0].baseRecordCount)
    expect(rival.appended[0].decisionId).toBe(store.appended[0].decisionId)
  })

  it('surfaces a unique violation as `conflict` without a partial write', async () => {
    const store = await activeDecision()
    const rejecting = {
      ...store,
      appended: [] as DecisionRecord[],
      lineage: (id: string) => store.lineage(id),
      byProject: (p: string) => store.byProject(p),
      append: async () => { throw new Error('duplicate key value violates unique constraint (23505)') },
    } as unknown as DecisionLedgerStore
    const result = await observeOutcome({ decisionId: 'dec-A', outcome: MEASURED, store: rejecting, now: T2 })
    expect(result.status).toBe('conflict')
  })

  it('serializes every lifecycle family in one index, annotations excluded', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/20260819_atlas_decision_ledger.sql'), 'utf8')
    const index = sql.slice(sql.indexOf('atlas_decision_ledger_one_advance_idx'))
      .slice(0, sql.slice(sql.indexOf('atlas_decision_ledger_one_advance_idx')).indexOf(';'))
    expect(index).toContain('(decision_id, base_record_count)')
    for (const type of ['drafted', 'proposed', 'approved', 'rejected', 'deferred',
      'amended', 'superseded', 'reversed', 'completed']) {
      expect(index).toContain(`'${type}'`)
    }
    expect(index).not.toContain("'outcome_observed'")
    expect(index).not.toContain("'reviewed'")
  })
})

// ── 25. No execution, and the boundary stays honest ──────────────────────────

describe('The ledger records commitments and executes nothing', () => {
  it('imports no tool, runner or dispatcher in any module', () => {
    for (const file of ['types.ts', 'derive.ts', 'build.ts', 'binding.ts', 'store.ts',
      'principal-write.ts', 'principal-read.ts']) {
      const source = readFileSync(resolve(DL_DIR, file), 'utf8')
      expect(source).not.toMatch(/atlasActions|executeWorkflow|publishArticle|runSteps|sendEmail|brevo/)
    }
  })

  it('keeps the binding derivation free of I/O and clock reads', () => {
    const binding = readFileSync(resolve(DL_DIR, 'binding.ts'), 'utf8')
    expect(binding).not.toMatch(/createAdminClient|supabase|fetch\(|node:fs|new Date\(|Date\.now/)
  })

  it('records no authority act without provenance sufficient to audit it', async () => {
    const store = await activeDecision()
    const approval = store.appended.find(r => r.type === 'approved')!
    expect(approval.authority).toMatchObject({
      basis: 'founder_owner',
      authorizationId: AUTH_CORRECT,
      principalId: PRINCIPAL_A,
      actionKind: DECISION_ACTION.approve,
      authorityActAt: T1,
    })
    expect(approval.authority?.boundVersionHash).toMatch(/^[a-f0-9]{64}$/)
    expect(approval.review?.description).toBe(REVIEW.description)
  })

  it('never appends the provisional authority placeholder', async () => {
    const store = await activeDecision()
    for (const appended of store.appended) {
      expect(appended.authority?.authorizationId).not.toBe('pending')
      expect(appended.authority?.boundVersionHash).not.toBe('pending')
    }
  })

  it('refuses when the authorization principal is not the acting caller', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const store = new FakeStore([proposed()])
    authorizationService([await grantFor(
      { act: 'approve', decisionId: 'dec-A', ...APPROVAL, store, now: T1 },
      { principalId: PRINCIPAL_B },
    )])
    const result = await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT, ...APPROVAL, store, now: T1,
    })
    expect(result.status).toBe('authority_principal_mismatch')
    expect(store.appended).toHaveLength(0)
  })
})

// ── Approval-time authority (R1, retained) ───────────────────────────────────

describe('Approval is a historical act, not a continuing lease', () => {
  it('keeps the decision governing after the authorization later expires', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const store = new FakeStore([proposed()])
    authorizationService([await grantFor(
      { act: 'approve', decisionId: 'dec-A', ...APPROVAL, store, now: T1 },
      { expiresAt: T2 },
    )])
    expect((await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_CORRECT, ...APPROVAL, store, now: T1,
    })).status).toBe('ok')

    const governing = await isDecisionGoverning('dec-A', { store, now: T3 })
    expect(governing.governing).toBe(true)
    expect(governing.reason).toBe('active')
  })

  it('still stops governing on the decision’s OWN expiry (§11.45)', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const store = new FakeStore([proposed()])
    const terms = { ...APPROVAL, expiresAt: EXPIRES }
    authorizationService([await grantFor({ act: 'approve', decisionId: 'dec-A', ...terms, store, now: T1 })])
    await approveDecision({ decisionId: 'dec-A', authorizationId: AUTH_CORRECT, ...terms, store, now: T1 })

    expect((await isDecisionGoverning('dec-A', { store, now: T2 })).governing).toBe(true)
    const later = await isDecisionGoverning('dec-A', { store, now: AFTER_EXPIRY })
    expect(later.governing).toBe(false)
    expect(later.reason).toBe('expired')
  })

  it('takes no security parameters on the governing read', () => {
    const source = readFileSync(resolve(DL_DIR, 'principal-read.ts'), 'utf8')
    const signature = source.slice(source.indexOf('export async function isDecisionGoverning'))
    expect(signature.slice(0, 400)).not.toMatch(/target\?|actionKind\?/)
  })
})
