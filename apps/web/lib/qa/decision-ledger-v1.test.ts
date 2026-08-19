/**
 * Chapter 11 Decision Ledger V1 — EI-S1.3B.
 *
 * Filesystem/local only: no database, no network, no credentials. The write and
 * read boundaries run against injected fakes with `resolveProjectAccess` and the
 * Authorization V1 seam mocked; properties provable only at the source level are
 * asserted by reading the modules.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/project-access', () => ({ resolveProjectAccess: vi.fn() }))
vi.mock('@/lib/atlas/authorization/principal-read', () => ({ isAuthorizationEffective: vi.fn() }))

import { resolveProjectAccess } from '@/lib/auth/project-access'
import { isAuthorizationEffective } from '@/lib/atlas/authorization/principal-read'
import { buildDecisionRecord, newDecisionId, MATERIALITY_DOMAINS } from '@/lib/atlas/decision-ledger/build'
import {
  deriveDecisionState,
  isDecisionGoverning as isGoverningPure,
  isLedgerMaterial,
  orderDecisionRecords,
  requiresHumanAuthorization,
} from '@/lib/atlas/decision-ledger/derive'
import {
  approveDecision,
  completeDecision,
  deferDecision,
  observeOutcome,
  proposeDecision,
  recordDecisionReview,
  rejectDecision,
  reverseDecision,
  supersedeDecision,
} from '@/lib/atlas/decision-ledger/principal-write'
import {
  isDecisionGoverning,
  listProjectDecisions,
  listUnresolvedDecisions,
  resolveDecision,
} from '@/lib/atlas/decision-ledger/principal-read'
import { MalformedDecisionLineageError } from '@/lib/atlas/decision-ledger/types'
import type { DecisionRecord, DecisionRecordType } from '@/lib/atlas/decision-ledger/types'
import type { DecisionLedgerStore } from '@/lib/atlas/decision-ledger/store'

const REPO_ROOT = resolve(__dirname, '../../../..')
const DL_DIR = 'apps/web/lib/atlas/decision-ledger'

const PRINCIPAL_A = '11111111-1111-4111-8111-111111111111'
const PROJECT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROJECT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AUTH_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const VERSION_HASH = 'a'.repeat(64)
const TARGET = { targetType: 'policy', targetId: 'newsletter-autonomy', versionHash: VERSION_HASH }

const T0 = '2026-08-20T08:00:00.000Z'
const T1 = '2026-08-20T09:00:00.000Z'
const T2 = '2026-08-20T10:00:00.000Z'
const EFFECTIVE = '2026-08-20T09:30:00.000Z'
const FUTURE_EFFECTIVE = '2026-08-25T09:00:00.000Z'
const EXPIRES = '2026-09-20T08:00:00.000Z'
const AFTER_EXPIRY = '2026-09-21T08:00:00.000Z'

const REVIEW = { trigger: 'time_based' as const, description: 'Review after 30 drafts.', dueAt: '2026-09-10T08:00:00.000Z' }
const EVIDENCE = [{ kind: 'performance_report', ref: 'perf-1', label: 'Newsletter performance', observedAt: T0, scope: 'the-prompt' }]

let seq = 0
function record(type: DecisionRecordType, overrides: Record<string, unknown> = {}): DecisionRecord {
  return buildDecisionRecord({
    type,
    decisionId: 'dec-1',
    projectId: PROJECT_A,
    principalId: PRINCIPAL_A,
    occurredAt: T0,
    recordId: `r${++seq}`,
    version: 1,
    baseRecordCount: 0,
    title: 'Newsletter sending stays approval-gated',
    statement: 'The Prompt newsletter workflow may prepare drafts autonomously, but sending requires explicit human approval.',
    materiality: ['autonomy', 'customers'],
    ...overrides,
  } as never)
}

const proposed = (o: Record<string, unknown> = {}) => record('proposed', { occurredAt: T0, ...o })
const approved = (o: Record<string, unknown> = {}) => record('approved', {
  occurredAt: T1,
  rationale: 'Subscriber trust and limited production evidence.',
  review: REVIEW,
  effectiveAt: EFFECTIVE,
  baseRecordCount: 1,
  authority: {
    basis: 'founder_owner', authorizationId: AUTH_ID, principalId: PRINCIPAL_A,
    actionKind: 'decision.approve', boundVersionHash: 'a'.repeat(64), authorityActAt: T1,
  },
  ...o,
})

// ── Store double ──────────────────────────────────────────────────────────────

class FakeStore implements DecisionLedgerStore {
  reads: string[] = []
  appended: DecisionRecord[] = []
  constructor(private rows: DecisionRecord[] = []) {}
  async append(r: DecisionRecord) { this.appended.push(r); this.rows.push(r); return r }
  async lineage(decisionId: string) {
    this.reads.push(`lineage:${decisionId}`)
    return this.rows.filter(r => r.decisionId === decisionId)
  }
  async byProject(projectId: string) {
    this.reads.push(`byProject:${projectId}`)
    return this.rows.filter(r => r.projectId === projectId)
  }
}

const mockAccess = vi.mocked(resolveProjectAccess)
const mockAuth = vi.mocked(isAuthorizationEffective)

const unauthenticated = () => mockAccess.mockResolvedValue({ ok: false, response: { status: 401 } as never })
const authAs = (userId: string, allowed: string[]) => mockAccess.mockResolvedValue({ ok: true, userId, allowedProjectIds: allowed })
const authorityEffective = (principalId = PRINCIPAL_A) =>
  mockAuth.mockResolvedValue({ effective: true, reason: 'effective', state: { principalId } as never, status: 'ok' })
const authorityDenied = (reason: string) => mockAuth.mockResolvedValue({ effective: false, reason: reason as never, state: null, status: 'ok' })

beforeEach(() => { mockAccess.mockReset(); mockAuth.mockReset() })

// ── 1–5. Canonical separation ─────────────────────────────────────────────────

describe('Decision Ledger V1 — canonical separation', () => {
  it('creates a valid proposal that governs nothing', () => {
    const state = deriveDecisionState([proposed()], { at: T1 })
    expect(state.status).toBe('proposed')
    expect(isGoverningPure([proposed()], { at: T1 }).governing).toBe(false)
    expect(isGoverningPure([proposed()], { at: T1 }).reason).toBe('proposed')
  })

  it('keeps recommendation separate from the decision (§11.24/§11.25)', () => {
    const state = deriveDecisionState([
      proposed({ recommendation: 'Approve a 14-day L4 autonomy trial.' }),
      approved({ statement: 'Autonomy remains L2 until 30 successful runs.' }),
    ], { at: T2 })
    expect(state.recommendation).toBe('Approve a 14-day L4 autonomy trial.')
    expect(state.statement).toBe('Autonomy remains L2 until 30 successful runs.')
    expect(state.recommendation).not.toBe(state.statement)
  })

  it('requires authority to approve — a decision is not self-authorizing (§11.39)', () => {
    expect(() => record('approved', {
      occurredAt: T1, rationale: 'x', review: REVIEW, effectiveAt: EFFECTIVE, authority: null,
    })).toThrow(/approval-requires-authority/)
  })

  it('never executes anything', () => {
    for (const file of ['types.ts', 'derive.ts', 'build.ts', 'store.ts', 'principal-write.ts', 'principal-read.ts']) {
      const source = readFileSync(resolve(REPO_ROOT, `${DL_DIR}/${file}`), 'utf8')
      expect(source).not.toMatch(/atlasActions|executeWorkflow|publishArticle|runSteps|sendEmail|brevo/)
    }
  })

  it('keeps the pure core free of all I/O and clock reads', () => {
    const derive = readFileSync(resolve(REPO_ROOT, `${DL_DIR}/derive.ts`), 'utf8')
    expect(derive).not.toMatch(/createAdminClient|supabase|fetch\(|node:fs|new Date\(|Date\.now/)
    expect(derive).toContain('options: { at: string }')
  })
})

// ── 6–15. Authority binding ───────────────────────────────────────────────────

describe('Decision Ledger V1 — authority is resolved live, never copied', () => {
  const approveArgs = (store: FakeStore) => ({
    decisionId: 'dec-1', authorizationId: AUTH_ID,
    rationale: 'Subscriber trust.', review: REVIEW, effectiveAt: EFFECTIVE,
    store, now: T1,
  })

  it('approves when the authorization proof is effective', async () => {
    authAs(PRINCIPAL_A, [PROJECT_A]); authorityEffective()
    const store = new FakeStore([proposed()])
    const result = await approveDecision({ ...approveArgs(store), effectiveAt: T1 })
    expect(result.status).toBe('ok')
    // Effective immediately at T1, so it is already governing (§11.43/§11.52).
    expect(result.state?.status).toBe('active')
    expect(result.state?.authority?.authorizationId).toBe(AUTH_ID)
  })

  it.each([
    ['expired', 'expired'],
    ['revoked', 'revoked'],
    ['superseded', 'superseded'],
    ['conditions unverified', 'conditions_unverified'],
    ['version mismatch', 'version_mismatch'],
    ['action mismatch', 'action_mismatch'],
    ['project mismatch', 'project_mismatch'],
    ['not yet decided', 'not_yet_decided'],
  ])('refuses approval when the authorization is %s', async (_label, reason) => {
    authAs(PRINCIPAL_A, [PROJECT_A]); authorityDenied(reason)
    const store = new FakeStore([proposed()])
    const result = await approveDecision(approveArgs(store))
    expect(result.status).toBe('authority_not_effective')
    expect(result.detail).toContain(reason)
    expect(store.appended).toHaveLength(0)
  })

  it('scopes the authorization check to the decision’s own project and identity', async () => {
    authAs(PRINCIPAL_A, [PROJECT_A]); authorityEffective()
    const store = new FakeStore([proposed()])
    await approveDecision(approveArgs(store))
    // EI-S1.3B-R1: the target is DERIVED from the decision, so `TARGET` — a
    // grant naming an unrelated policy object — can no longer reach this call.
    expect(mockAuth).toHaveBeenCalledWith(
      AUTH_ID,
      expect.objectContaining({
        projectId: PROJECT_A,
        target: expect.objectContaining({ targetType: 'decision', targetId: 'dec-1' }),
        actionKind: 'decision.approve',
      }),
      expect.anything(),
    )
    expect(mockAuth).not.toHaveBeenCalledWith(AUTH_ID, expect.objectContaining({ target: TARGET }), expect.anything())
  })

  it('stores an authorization reference, never an authorized boolean', () => {
    const source = readFileSync(resolve(REPO_ROOT, `${DL_DIR}/types.ts`), 'utf8')
    expect(source).toContain('authorizationId')
    expect(source).not.toMatch(/authorized\s*:\s*boolean/)
    const write = readFileSync(resolve(REPO_ROOT, `${DL_DIR}/principal-write.ts`), 'utf8')
    expect(write).toContain('isAuthorizationEffective(')
  })

  it('keeps a decision governing after its authorization is later revoked (§11.180)', async () => {
    // EI-S1.3B-R1 corrects the earlier continuing-lease reading. §11.180 has an
    // active decision explain itself as "approved under this authority … and
    // remains active until this review condition" — the approval was a moment.
    // A later revocation is a §11.47 trigger to review, not a retroactive
    // unmaking of a commitment the institution already made.
    authAs(PRINCIPAL_A, [PROJECT_A]); authorityDenied('revoked')
    const store = new FakeStore([proposed(), approved()])
    const result = await isDecisionGoverning('dec-1', { store, now: T2 })
    expect(result.governing).toBe(true)
    expect(result.reason).toBe('active')
    // And the governing read never consults live authorization state at all.
    expect(mockAuth).not.toHaveBeenCalled()
  })
})

// ── 16–20. Isolation and no existence oracle ──────────────────────────────────

describe('Decision Ledger V1 — isolation and no existence oracle', () => {
  const foreign = () => new FakeStore([proposed({ projectId: PROJECT_B, decisionId: 'dec-b' })])

  it('denies an unauthenticated caller without any privileged read', async () => {
    unauthenticated()
    const s1 = foreign(); const s2 = foreign()
    const unknown = await resolveDecision('nope', { store: s1, now: T1 })
    const existing = await resolveDecision('dec-b', { store: s2, now: T1 })
    expect(unknown.status).toBe(existing.status)
    expect(unknown.status).toBe('no_principal')
    expect(s1.reads).toEqual([]); expect(s2.reads).toEqual([])
  })

  it('returns the same denial for unknown and foreign-project decisions', async () => {
    authAs(PRINCIPAL_A, [PROJECT_A])
    const unknown = await resolveDecision('nope', { store: foreign(), now: T1 })
    const other = await resolveDecision('dec-b', { store: foreign(), now: T1 })
    expect(unknown.status).toBe(other.status)
    expect(unknown.status).toBe('not_permitted')
    expect(other.lineage).toEqual([])
  })

  it('denies writing into a foreign project', async () => {
    authAs(PRINCIPAL_A, [PROJECT_A])
    const store = new FakeStore()
    const result = await proposeDecision({
      projectId: PROJECT_B, title: 't', statement: 's', materiality: ['risk'], store, now: T0,
    })
    expect(result.status).toBe('project_denied')
    expect(store.appended).toHaveLength(0)
  })

  it('denies acting on a foreign-project decision without writing', async () => {
    authAs(PRINCIPAL_A, [PROJECT_A]); authorityEffective()
    const store = foreign()
    const result = await rejectDecision({ decisionId: 'dec-b', authorizationId: AUTH_ID, reason: 'no', store, now: T1 })
    expect(result.status).toBe('not_permitted')
    expect(store.appended).toHaveLength(0)
  })

  it('an empty allow-list denies everything', async () => {
    authAs(PRINCIPAL_A, [])
    const store = new FakeStore([proposed()])
    expect((await resolveDecision('dec-1', { store, now: T1 })).status).toBe('not_permitted')
    expect((await listProjectDecisions(PROJECT_A, { store })).status).toBe('project_denied')
  })

  it('pins project scope across the lineage', () => {
    expect(() => deriveDecisionState([proposed(), approved({ projectId: PROJECT_B })], { at: T2 }))
      .toThrow(/project-scope-stable/)
  })
})

// ── 21–24. Immutability and historical truth ──────────────────────────────────

describe('Decision Ledger V1 — historical truth is immutable', () => {
  it('preserves evidence and rationale as they stood at decision time', () => {
    const state = deriveDecisionState([
      proposed({ evidence: EVIDENCE, snapshot: { capturedAt: T0, measurements: [{ label: 'opens', value: '42%' }], dataFreshness: '1h', knownGaps: ['no churn data'] } }),
      approved({ evidence: EVIDENCE }),
    ], { at: T2 })
    expect(state.evidence).toEqual(EVIDENCE)
    expect(state.snapshot?.knownGaps).toEqual(['no churn data'])
    expect(state.rationale).toBe('Subscriber trust and limited production evidence.')
  })

  it('keeps the original record auditable after supersession', () => {
    const successor = newDecisionId()
    const lineage = [proposed(), approved(), record('superseded', { occurredAt: T2, supersededBy: successor, reason: 'Replaced.' })]
    const state = deriveDecisionState(lineage, { at: T2 })
    expect(state.status).toBe('superseded')
    expect(state.supersededBy).toBe(successor)
    // The approval remains in the lineage — supersession appends, never rewrites.
    expect(state.lineage.map(l => l.type)).toEqual(['proposed', 'approved', 'superseded'])
    expect(state.recordCount).toBe(3)
  })

  it('creates a new version on amendment and keeps identity stable (§11.59)', () => {
    const state = deriveDecisionState([
      proposed(), approved(),
      record('amended', { occurredAt: T2, version: 2, reason: 'Scope clarified.', statement: 'Amended statement.' }),
    ], { at: T2 })
    expect(state.decisionId).toBe('dec-1')
    expect(state.version).toBe(2)
    expect(state.statement).toBe('Amended statement.')
    expect(() => deriveDecisionState(
      [proposed(), approved(), record('amended', { occurredAt: T2, version: 1, reason: 'x' })], { at: T2 }))
      .toThrow(/amendment-increments-version/)
    // §11.62/§11.60 — there must be a live decision to amend.
    expect(() => deriveDecisionState(
      [proposed(), record('amended', { occurredAt: T1, version: 2, reason: 'x' })], { at: T2 }))
      .toThrow(/amendment-requires-live-decision/)
    expect(() => record('amended', { occurredAt: T1, version: 2 })).toThrow(/amended-requires-reason/)
  })

  it('offers no update or delete path in the store, and enforces it in the DB', () => {
    const store = readFileSync(resolve(REPO_ROOT, `${DL_DIR}/store.ts`), 'utf8')
    expect(store).toContain('append(')
    expect(store).not.toMatch(/\.update\(|\.delete\(|\.upsert\(/)
    const migration = readFileSync(resolve(REPO_ROOT, 'apps/web/supabase/migrations/20260819_atlas_decision_ledger.sql'), 'utf8')
    expect(migration).toContain('before update on public.atlas_decision_ledger')
    expect(migration).toContain('before delete on public.atlas_decision_ledger')
    expect(migration).toContain('enable row level security')
    expect(migration).toContain('revoke all on public.atlas_decision_ledger from anon, authenticated')
    // EI-S1.3B-R2 replaced four narrower transition indexes with one
    // optimistic-concurrency invariant covering every lifecycle family.
    expect(migration).toContain('atlas_decision_ledger_one_advance_idx')
    expect(migration).toContain('(decision_id, base_record_count)')
    expect(migration).not.toMatch(/^\s*status\s+text/m)
  })
})

// ── 25–28. Outcome model ──────────────────────────────────────────────────────

describe('Decision Ledger V1 — outcome never rewrites expectation', () => {
  const outcomeRecord = (status: string, evidence = EVIDENCE) => record('outcome_observed', {
    occurredAt: T2,
    outcome: { status, summary: 'Observed.', observedAt: T2, evidence },
  })

  it('keeps expected impact distinct from observed outcome (§11.98)', () => {
    const state = deriveDecisionState([
      proposed({ expectedImpact: 'Reduce founder approval burden.' }),
      approved({ expectedImpact: 'Reduce founder approval burden.' }),
      outcomeRecord('mixed'),
    ], { at: T2 })
    expect(state.expectedImpact).toBe('Reduce founder approval burden.')
    expect(state.outcome?.status).toBe('mixed')
    expect(state.outcome?.summary).not.toBe(state.expectedImpact)
  })

  it('represents UNKNOWN explicitly and never infers success from silence (§11.100)', () => {
    const state = deriveDecisionState([proposed(), approved(), outcomeRecord('not_yet_measurable', [])], { at: T2 })
    expect(state.outcome?.status).toBe('not_yet_measurable')
    // A decision with no outcome record has no outcome — not a successful one.
    const noOutcome = deriveDecisionState([proposed(), approved()], { at: T2 })
    expect(noOutcome.outcome).toBeNull()
  })

  it('requires evidence for any asserted outcome (§11.97)', () => {
    expect(() => outcomeRecord('successful', [])).toThrow(/outcome-requires-evidence/)
    expect(() => outcomeRecord('harmful', [])).toThrow(/outcome-requires-evidence/)
    // The explicit UNKNOWN asserts nothing, so it needs no evidence.
    expect(() => outcomeRecord('not_yet_measurable', [])).not.toThrow()
  })

  it('cannot link an outcome across projects — scope comes from the lineage', async () => {
    authAs(PRINCIPAL_A, [PROJECT_A])
    const store = new FakeStore([proposed({ projectId: PROJECT_B, decisionId: 'dec-b' })])
    const result = await observeOutcome({
      decisionId: 'dec-b',
      outcome: { status: 'successful', summary: 's', observedAt: T2, evidence: EVIDENCE },
      store, now: T2,
    })
    expect(result.status).toBe('not_permitted')
    expect(store.appended).toHaveLength(0)
  })

  it('does not overwrite the decision when an outcome lands (§11.96)', () => {
    const state = deriveDecisionState([proposed(), approved(), outcomeRecord('unsuccessful')], { at: T2 })
    expect(state.status).toBe('active')
    expect(state.statement).toContain('requires explicit human approval')
    expect(state.rationale).toBe('Subscriber trust and limited production evidence.')
  })
})

// ── 29–30. Review and lifecycle ───────────────────────────────────────────────

describe('Decision Ledger V1 — lifecycle and review', () => {
  it('derives active only once the effective date arrives (§11.43)', () => {
    const future = [proposed(), approved({ effectiveAt: FUTURE_EFFECTIVE })]
    expect(deriveDecisionState(future, { at: T2 }).status).toBe('approved')
    expect(isGoverningPure(future, { at: T2 }).reason).toBe('not_yet_effective')
    expect(deriveDecisionState(future, { at: '2026-08-26T00:00:00.000Z' }).status).toBe('active')
  })

  it('expires from time alone, with no expiry record and no job (§11.55)', () => {
    const lineage = [proposed(), approved({ expiresAt: EXPIRES })]
    expect(lineage.some(r => r.type === ('expired' as never))).toBe(false)
    expect(deriveDecisionState(lineage, { at: T2 }).status).toBe('active')
    expect(deriveDecisionState(lineage, { at: AFTER_EXPIRY }).status).toBe('expired')
    expect(isGoverningPure(lineage, { at: AFTER_EXPIRY }).reason).toBe('expired')
  })

  it('requires a review condition on approval (§11.46)', () => {
    expect(() => record('approved', {
      occurredAt: T1, rationale: 'x', effectiveAt: EFFECTIVE,
      authority: {
        basis: 'founder_owner', authorizationId: AUTH_ID, principalId: PRINCIPAL_A,
        actionKind: 'decision.approve', boundVersionHash: 'a'.repeat(64), authorityActAt: T1,
      },
    })).toThrow(/approval-requires-review-condition/)
  })

  it('accumulates review notes without rewriting reasoning (§11.102)', () => {
    const state = deriveDecisionState([
      proposed(), approved(),
      record('reviewed', { occurredAt: T2, reviewNote: 'Evidence threshold was too low.' }),
      record('reviewed', { occurredAt: '2026-08-20T11:00:00.000Z', reviewNote: 'Risk control worked.' }),
    ], { at: T2 })
    expect(state.reviewNotes).toEqual(['Evidence threshold was too low.', 'Risk control worked.'])
    expect(state.rationale).toBe('Subscriber trust and limited production evidence.')
  })

  it('preserves rejection and deferral with their reasons (§11.53/§11.54)', () => {
    const rejected = deriveDecisionState([proposed(), record('rejected', { occurredAt: T1, reason: 'Too early.' })], { at: T2 })
    expect(rejected.status).toBe('rejected')
    expect(isGoverningPure([proposed(), record('rejected', { occurredAt: T1, reason: 'Too early.' })], { at: T2 }).governing).toBe(false)
    expect(() => record('rejected', { occurredAt: T1 })).toThrow(/rejected-requires-reason/)
    expect(() => record('deferred', { occurredAt: T1 })).toThrow(/deferred-requires-reason/)
  })

  it('distinguishes reversal from expiration (§11.57)', () => {
    const reversed = deriveDecisionState([proposed(), approved(), record('reversed', { occurredAt: T2, reason: 'Policy violation.' })], { at: T2 })
    expect(reversed.status).toBe('reversed')
    expect(() => record('reversed', { occurredAt: T2 })).toThrow(/reversed-requires-reason/)
  })

  it('reads deterministically and surfaces unresolved decisions', async () => {
    authAs(PRINCIPAL_A, [PROJECT_A])
    const store = new FakeStore([
      proposed(),
      proposed({ decisionId: 'dec-2', recordId: 'r-d2', occurredAt: T1 }),
    ])
    const listed = await listProjectDecisions(PROJECT_A, { store, now: T2 })
    expect(listed.status).toBe('ok')
    expect(listed.decisions.map(d => d.decisionId)).toEqual(['dec-2', 'dec-1'])

    const unresolved = await listUnresolvedDecisions(PROJECT_A, { store, now: T2 })
    expect(unresolved.decisions).toHaveLength(2)
  })
})

// ── 31–32. Malformed lineages, retries and races ──────────────────────────────

describe('Decision Ledger V1 — malformed lineages and concurrency', () => {
  it('rejects impossible histories', () => {
    expect(() => deriveDecisionState([], { at: T1 })).toThrow(/lineage-non-empty/)
    expect(() => deriveDecisionState([approved()], { at: T1 })).toThrow(/lineage-starts-with-draft-or-proposal/)
    expect(() => deriveDecisionState([proposed(), record('superseded', { occurredAt: T1, supersededBy: 'x' })], { at: T2 }))
      .toThrow(/close-requires-approved-decision/)
    expect(() => deriveDecisionState([proposed(), approved(), record('rejected', { occurredAt: T2, reason: 'x' })], { at: T2 }))
      .toThrow(/settle-requires-open-decision/)
    expect(() => deriveDecisionState([proposed(), approved({ decisionId: 'other' })], { at: T2 }))
      .toThrow(/single-decision-lineage/)
  })

  it('collapses a byte-identical retry and rejects a reused record id', () => {
    const a = approved()
    expect(deriveDecisionState([proposed(), a, { ...a }], { at: T2 }).recordCount).toBe(2)
    expect(() => orderDecisionRecords([proposed(), a, { ...a, reason: 'tampered' }]))
      .toThrow(MalformedDecisionLineageError)
  })

  it('orders deterministically regardless of input order', () => {
    const lineage = [approved(), proposed()]
    expect(orderDecisionRecords(lineage).map(r => r.type)).toEqual(['proposed', 'approved'])
    expect(orderDecisionRecords([...lineage].reverse()).map(r => r.recordId))
      .toEqual(orderDecisionRecords(lineage).map(r => r.recordId))
  })

  it('surfaces a losing concurrent transition as conflict, not corruption', async () => {
    authAs(PRINCIPAL_A, [PROJECT_A])
    authorityEffective()
    const store = new FakeStore([proposed()])
    store.append = async () => { throw new Error('duplicate key value violates unique constraint (23505)') }
    const result = await rejectDecision({ decisionId: 'dec-1', authorizationId: AUTH_ID, reason: 'no', store, now: T1 })
    expect(result.status).toBe('conflict')
  })

  it('is retry-SAFE but NOT idempotent when opening a decision', async () => {
    authAs(PRINCIPAL_A, [PROJECT_A])
    const store = new FakeStore()
    const args = { projectId: PROJECT_A, title: 't', statement: 's', materiality: ['risk' as const], store, now: T0 }
    const first = await proposeDecision(args)
    const second = await proposeDecision(args)
    expect(first.state?.decisionId).not.toBe(second.state?.decisionId)
    expect(store.appended).toHaveLength(2)
    // Neither is decided or authorized — a duplicate proposal commits nothing.
    expect(first.state?.status).toBe('proposed')
    expect(second.state?.status).toBe('proposed')
  })
})

// ── 33–38. Materiality, separation, boundaries ────────────────────────────────

describe('Decision Ledger V1 — materiality and system separation', () => {
  it('rejects a decision that declares no materiality (§11.18)', async () => {
    authAs(PRINCIPAL_A, [PROJECT_A])
    const store = new FakeStore()
    const result = await proposeDecision({ projectId: PROJECT_A, title: 't', statement: 's', materiality: [], store, now: T0 })
    expect(result.status).toBe('not_ledger_material')
    expect(store.appended).toHaveLength(0)
    expect(isLedgerMaterial({ materiality: [] })).toBe(false)
  })

  it('accepts only canonical §11.19 domains', () => {
    expect(MATERIALITY_DOMAINS).toHaveLength(12)
    expect(() => record('proposed', { materiality: ['vibes'] })).toThrow(/materiality-domain-canonical/)
    expect(() => record('proposed', { materiality: ['risk', 'risk'] })).toThrow(/materiality-domain-unique/)
  })

  it('never lets a decision self-classify past human authority (§11.19)', () => {
    // Everything admissible to the ledger is material by construction, so
    // authorization is always required; there is no non-material escape hatch.
    for (const domain of MATERIALITY_DOMAINS) {
      expect(requiresHumanAuthorization({ materiality: [domain] })).toBe(true)
    }
    expect(requiresHumanAuthorization({ materiality: [] })).toBe(true)
  })

  it('stays separate from Memory/D1 and Architecture Knowledge', () => {
    for (const file of ['types.ts', 'derive.ts', 'build.ts', 'store.ts', 'principal-write.ts', 'principal-read.ts']) {
      const source = readFileSync(resolve(REPO_ROOT, `${DL_DIR}/${file}`), 'utf8')
      expect(source).not.toMatch(/recallMemories|atlas_recall|selectActiveDecisions|architecture-knowledge|BESLUT/)
      expect(source).not.toMatch(/from '@\/lib\/atlas\/memory/)
    }
  })

  it('stays separate from the §8.4 calibration ledger and EI reasoning artifacts', () => {
    for (const file of ['types.ts', 'derive.ts', 'principal-write.ts']) {
      const source = readFileSync(resolve(REPO_ROOT, `${DL_DIR}/${file}`), 'utf8')
      expect(source).not.toMatch(/IntelligenceObject|ExecutiveBriefBody|atlas_intelligence|disposition/)
    }
  })

  it('leaves the Executive Brief untouched', () => {
    const producer = readFileSync(resolve(REPO_ROOT, 'apps/web/lib/atlas/intelligence/producers/executive-brief-producer.ts'), 'utf8')
    const orchestrator = readFileSync(resolve(REPO_ROOT, 'apps/web/lib/atlas/intelligence/producers/executive-brief-orchestrator.ts'), 'utf8')
    for (const source of [producer, orchestrator]) {
      expect(source).not.toMatch(/decision-ledger|DecisionRecord|resolveDecision/)
    }
  })

  it('keeps both boundaries server-only and authenticated before any read', () => {
    for (const file of ['principal-write.ts', 'principal-read.ts']) {
      const source = readFileSync(resolve(REPO_ROOT, `${DL_DIR}/${file}`), 'utf8')
      expect(source).toContain("import 'server-only'")
      expect(source).toContain('assertProjectAllowed')
      expect(source).not.toMatch(/process\.env\.CRON_SECRET/)
    }
    const write = readFileSync(resolve(REPO_ROOT, `${DL_DIR}/principal-write.ts`), 'utf8')
    // The shared gate authenticates before it reads.
    const gate = write.slice(write.indexOf('async function openFor('))
    expect(gate.indexOf('await authenticate()')).toBeGreaterThan(-1)
    expect(gate.indexOf('await authenticate()')).toBeLessThan(gate.indexOf('openLineage('))
    // And no act touches the store before passing through it.
    for (const entry of [
      'export async function proposeDecision(',
      'export async function approveDecision(',
      'export async function amendDecision(',
      'export async function reverseDecision(',
      'export async function supersedeDecision(',
      'export async function completeDecision(',
      'export async function observeOutcome(',
      'export async function rejectDecision(',
      'export async function deferDecision(',
      'export async function recordDecisionReview(',
    ]) {
      const from = write.indexOf(entry)
      expect(from).toBeGreaterThan(-1)
      const rest = write.slice(from + entry.length)
      const next = rest.search(/\n(export )?(async )?function /)
      const body = rest.slice(0, next > -1 ? next : undefined)
      const gated = Math.max(body.indexOf('await authenticate()'), body.indexOf('await openFor('))
      const read = body.indexOf('store.lineage(')
      expect(gated).toBeGreaterThan(-1)
      if (read > -1) expect(gated).toBeLessThan(read)
    }
    // The principal is never a caller parameter.
    const exportedArgs = write.match(/export interface \w+Args[\s\S]*?\n}/g) ?? []
    expect(exportedArgs.length).toBeGreaterThan(0)
    for (const block of exportedArgs) expect(block).not.toMatch(/principalId/)
  })

  it('completes a decision with a finite outcome (§11.58)', async () => {
    authAs(PRINCIPAL_A, [PROJECT_A])
    const store = new FakeStore([proposed(), approved()])
    await observeOutcome({
      decisionId: 'dec-1',
      outcome: { status: 'successful', summary: 'Migration finished.', observedAt: T2, evidence: EVIDENCE },
      store, now: T2,
    })
    await recordDecisionReview({ decisionId: 'dec-1', reviewNote: 'The controls worked.', store, now: T2 })
    const result = await completeDecision({ decisionId: 'dec-1', reason: 'Migration finished.', store, now: T2 })
    expect(result.status).toBe('ok')
    expect(result.state?.status).toBe('completed')
  })

  it('supersedes and defers through the write boundary', async () => {
    authAs(PRINCIPAL_A, [PROJECT_A])
    authorityEffective()
    const successorId = newDecisionId()
    const superseding = new FakeStore([
      proposed(), approved(),
      record('proposed', { decisionId: successorId, occurredAt: T0, recordId: 'succ-1' }),
      // §11.56 — a successor must itself be a decision, not a proposal.
      record('approved', {
        decisionId: successorId, occurredAt: T1, recordId: 'succ-2', baseRecordCount: 1,
        rationale: 'r', review: REVIEW, effectiveAt: T1,
        authority: {
          basis: 'founder_owner', authorizationId: AUTH_ID, principalId: PRINCIPAL_A,
          actionKind: 'decision.approve', boundVersionHash: 'a'.repeat(64), authorityActAt: T1,
        },
      }),
    ])
    const s = await supersedeDecision({
      decisionId: 'dec-1', supersededBy: successorId, authorizationId: AUTH_ID, store: superseding, now: T2,
    })
    expect(s.state?.status).toBe('superseded')

    const deferring = new FakeStore([proposed()])
    const d = await deferDecision({
      decisionId: 'dec-1', authorizationId: AUTH_ID, reason: 'Awaiting churn data.', store: deferring, now: T1,
    })
    expect(d.state?.status).toBe('deferred')
  })

  it('reverses an approved decision through the write boundary', async () => {
    authAs(PRINCIPAL_A, [PROJECT_A]); authorityEffective()
    const store = new FakeStore([proposed(), approved()])
    const result = await reverseDecision({
      decisionId: 'dec-1', authorizationId: AUTH_ID, reason: 'Serious policy violation.', store, now: T2,
    })
    expect(result.state?.status).toBe('reversed')
  })

  it('records a review note through the write boundary', async () => {
    authAs(PRINCIPAL_A, [PROJECT_A])
    const store = new FakeStore([proposed(), approved()])
    const result = await recordDecisionReview({ decisionId: 'dec-1', reviewNote: 'Trial scope was too broad.', store, now: T2 })
    expect(result.state?.reviewNotes).toContain('Trial scope was too broad.')
  })
})
