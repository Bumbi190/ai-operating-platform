/**
 * Decision Ledger V1 — lifecycle concurrency and canonical ordering
 * (EI-S1.3B-R3).
 *
 * The store double here is DB-FAITHFUL: it enforces the migration's partial
 * unique index exactly as Postgres would, rejecting a colliding lifecycle act
 * with a 23505 error. That is what makes the interleaving race observable — a
 * store that simply accepts every append would show nothing.
 *
 * The race it exists to catch: two writers read the same lifecycle state, an
 * unrelated review note lands between their reads, and both closing acts pass
 * the index because the token counted ROWS rather than lifecycle acts. The
 * decision ends with two closes and a lineage the pure core refuses to read —
 * permanently, on an append-only table.
 *
 * Filesystem/local only: no database, no network, no credentials.
 */

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/project-access', () => ({ resolveProjectAccess: vi.fn() }))
vi.mock('@/lib/atlas/authorization/principal-read', () => ({ isAuthorizationEffective: vi.fn() }))

import { resolveProjectAccess } from '@/lib/auth/project-access'
import { isAuthorizationEffective } from '@/lib/atlas/authorization/principal-read'
import { buildDecisionRecord, newDecisionId } from '@/lib/atlas/decision-ledger/build'
import {
  deriveDecisionState,
  LIFECYCLE_ADVANCING,
  lifecycleGenerationOf,
  orderDecisionRecords,
} from '@/lib/atlas/decision-ledger/derive'
import {
  amendDecision,
  approveDecision,
  deferDecision,
  observeOutcome,
  prepareDecisionAct,
  recordDecisionReview,
  reverseDecision,
  supersedeDecision,
} from '@/lib/atlas/decision-ledger/principal-write'
import { DECISION_ACTION } from '@/lib/atlas/decision-ledger/binding'
import type { DecisionRecord, DecisionRecordType } from '@/lib/atlas/decision-ledger/types'
import type { DecisionLedgerStore } from '@/lib/atlas/decision-ledger/store'

const MIGRATION = resolve(__dirname, '../../supabase/migrations/20260819_atlas_decision_ledger.sql')
const DERIVE = resolve(__dirname, '../atlas/decision-ledger/derive.ts')
const WRITE = resolve(__dirname, '../atlas/decision-ledger/principal-write.ts')

const PRINCIPAL_A = '11111111-1111-4111-8111-111111111111'
const PROJECT_P = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AUTH_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const AUTH_B = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

const T0 = '2026-08-19T08:00:00.000Z'
const T1 = '2026-08-19T09:00:00.000Z'
const T2 = '2026-08-19T10:00:00.000Z'
const T3 = '2026-08-19T11:00:00.000Z'

const REVIEW = { trigger: 'time_based' as const, description: 'Review in 30 days.', dueAt: '2026-09-10T08:00:00.000Z' }
const EVIDENCE = [{ kind: 'report', ref: 'r-1', label: 'Report', observedAt: T0, scope: 'p' }]
const MEASURED = { status: 'successful' as const, summary: 'It worked.', observedAt: T2, evidence: EVIDENCE }
const APPROVAL = { rationale: 'Subscriber trust.', review: REVIEW, effectiveAt: T1 }

function record(type: DecisionRecordType, overrides: Record<string, unknown> = {}): DecisionRecord {
  return buildDecisionRecord({
    type,
    decisionId: 'dec-A',
    projectId: PROJECT_P,
    principalId: PRINCIPAL_A,
    occurredAt: T0,
    recordId: randomUUID(),
    version: 1,
    lifecycleGeneration: 0,
    title: 'Grant L4 publishing autonomy',
    statement: 'The Prompt may publish short news autonomously for a 14-day trial.',
    materiality: ['autonomy'],
    ...overrides,
  } as never)
}

const AUTHORITY = {
  basis: 'founder_owner' as const, authorizationId: AUTH_A, principalId: PRINCIPAL_A,
  actionKind: DECISION_ACTION.approve, boundVersionHash: 'a'.repeat(64), authorityActAt: T1,
}

/**
 * Enforces `unique (decision_id, lifecycle_generation) where record_type in
 * (LIFECYCLE_ADVANCING)` — the migration's invariant, in memory.
 */
class DbFaithfulStore implements DecisionLedgerStore {
  appended: DecisionRecord[] = []
  rejected: DecisionRecord[] = []
  constructor(private rows: DecisionRecord[] = []) {}

  async append(candidate: DecisionRecord) {
    if (LIFECYCLE_ADVANCING.has(candidate.type)) {
      const clash = this.rows.some(row =>
        LIFECYCLE_ADVANCING.has(row.type)
        && row.decisionId === candidate.decisionId
        && row.lifecycleGeneration === candidate.lifecycleGeneration)
      if (clash) {
        this.rejected.push(candidate)
        throw new Error('duplicate key value violates unique constraint (23505)')
      }
    }
    this.appended.push(candidate)
    this.rows.push(candidate)
    return candidate
  }
  async lineage(id: string) { return this.rows.filter(r => r.decisionId === id) }
  async byProject(p: string) { return this.rows.filter(r => r.projectId === p) }
  /** A snapshot a writer read earlier, frozen against later appends. */
  snapshot(id: string) { return this.rows.filter(r => r.decisionId === id).map(r => ({ ...r })) }
}

/** A store pinned to one stale snapshot, so a writer acts on what it read. */
function frozenReader(live: DbFaithfulStore, snapshot: DecisionRecord[]): DecisionLedgerStore {
  return {
    append: (r: DecisionRecord) => live.append(r),
    lineage: async (id: string) => snapshot.filter(r => r.decisionId === id),
    byProject: (p: string) => live.byProject(p),
  }
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
}

function authorizationService(grants: Grant[]) {
  mockAuth.mockImplementation(async (id, query = {}) => {
    const grant = grants.find(g => g.id === id)
    if (!grant) return { effective: false, reason: 'not_yet_decided', state: null, status: 'not_permitted' } as never
    const q = query as { projectId?: string; target?: Grant['target']; actionKind?: string }
    if (q.projectId !== grant.projectId) {
      return { effective: false, reason: 'project_mismatch', state: null, status: 'ok' } as never
    }
    if (q.target && (q.target.targetId !== grant.target.targetId
      || q.target.versionHash !== grant.target.versionHash)) {
      return { effective: false, reason: 'version_mismatch', state: null, status: 'ok' } as never
    }
    if (q.actionKind !== grant.actionKind) {
      return { effective: false, reason: 'action_mismatch', state: null, status: 'ok' } as never
    }
    return {
      effective: true, reason: 'effective', status: 'ok',
      state: { principalId: grant.principalId, projectId: grant.projectId },
    } as never
  })
}

async function grantFor(act: Parameters<typeof prepareDecisionAct>[0], id: string): Promise<Grant> {
  const { binding, status, detail } = await prepareDecisionAct(act)
  expect(`${status}${detail ? `:${detail}` : ''}`).toBe('ok')
  return {
    id,
    projectId: binding!.projectId,
    target: binding!.target,
    actionKind: binding!.actionKind,
    principalId: PRINCIPAL_A,
  }
}

/** proposal (gen 0) + approval (gen 1), genuinely active at T2. */
async function activeDecision(): Promise<DbFaithfulStore> {
  authAs(PRINCIPAL_A, [PROJECT_P])
  const store = new DbFaithfulStore([record('proposed', { occurredAt: T0, lifecycleGeneration: 0 })])
  authorizationService([await grantFor({ act: 'approve', decisionId: 'dec-A', ...APPROVAL, store, now: T1 }, AUTH_A)])
  expect((await approveDecision({
    decisionId: 'dec-A', authorizationId: AUTH_A, ...APPROVAL, store, now: T1,
  })).status).toBe('ok')
  return store
}

beforeEach(() => { mockAccess.mockReset(); mockAuth.mockReset() })

// ── 1–4. The annotation-interleaving race ────────────────────────────────────

describe('An annotation between two reads cannot let both writers through', () => {
  /** Append an approved successor decision straight to the store. */
  async function appendSuccessor(store: DbFaithfulStore, id: string) {
    await store.append(record('proposed', { decisionId: id, occurredAt: T0, lifecycleGeneration: 0 }))
    await store.append(record('approved', {
      decisionId: id, occurredAt: T1, lifecycleGeneration: 1,
      rationale: 'r', review: REVIEW, effectiveAt: T1, authority: AUTHORITY,
    }))
  }

  it('refuses the losing writer when a review interleaves a reverse and a supersede', async () => {
    const live = await activeDecision()
    const successorId = newDecisionId()
    await appendSuccessor(live, successorId)

    // Writer A reads the lifecycle state and prepares a reversal.
    const aView = frozenReader(live, live.snapshot('dec-A'))
    const aGrant = await grantFor(
      { act: 'reverse', decisionId: 'dec-A', reason: 'Policy violation.', store: aView, now: T3 }, AUTH_A)

    // A reviewer annotates in between. Under the old row-count token this is
    // exactly what handed the two writers different serialization keys.
    await recordDecisionReview({
      decisionId: 'dec-A', reviewNote: 'A lesson from the trial.', store: live, now: T2,
    })
    expect(await live.lineage('dec-A')).toHaveLength(3)

    // Writer B reads the longer lineage and commits first.
    const bGrant = await grantFor(
      { act: 'supersede', decisionId: 'dec-A', supersededBy: successorId, store: live, now: T3 }, AUTH_B)
    authorizationService([aGrant, bGrant])
    expect((await supersedeDecision({
      decisionId: 'dec-A', supersededBy: successorId, authorizationId: AUTH_B, store: live, now: T3,
    })).status).toBe('ok')

    // Writer A commits against the state it read — and loses.
    authorizationService([aGrant, bGrant])
    const result = await reverseDecision({
      decisionId: 'dec-A', authorizationId: AUTH_A, reason: 'Policy violation.', store: aView, now: T3,
    })
    expect(result.status).toBe('conflict')

    // Exactly one closing act survived, and the lineage still reads.
    const lineage = await live.lineage('dec-A')
    const closes = lineage.filter(r =>
      r.type === 'reversed' || r.type === 'superseded' || r.type === 'completed')
    expect(closes.map(r => r.type)).toEqual(['superseded'])
    expect(deriveDecisionState(lineage, { at: T3 }).status).toBe('superseded')
  })

  it('refuses the losing writer when an outcome interleaves an amend and a reverse', async () => {
    const live = await activeDecision()
    const stale = live.snapshot('dec-A')
    const aView = frozenReader(live, stale)

    const AMEND = {
      reason: 'Widen scope.', statement: 'A materially wider commitment.',
      rationale: 'Evidence improved.', review: REVIEW, effectiveAt: T2,
    }
    const aGrant = await grantFor({ act: 'amend', decisionId: 'dec-A', ...AMEND, store: aView, now: T3 }, AUTH_A)

    // Two annotations land between the reads.
    await observeOutcome({ decisionId: 'dec-A', outcome: MEASURED, store: live, now: T2 })
    await recordDecisionReview({ decisionId: 'dec-A', reviewNote: 'Noted.', store: live, now: T2 })
    expect(await live.lineage('dec-A')).toHaveLength(4)

    const bGrant = await grantFor(
      { act: 'reverse', decisionId: 'dec-A', reason: 'Policy violation.', store: live, now: T3 }, AUTH_B)
    authorizationService([aGrant, bGrant])
    expect((await reverseDecision({
      decisionId: 'dec-A', authorizationId: AUTH_B, reason: 'Policy violation.', store: live, now: T3,
    })).status).toBe('ok')

    authorizationService([aGrant, bGrant])
    const result = await amendDecision({
      decisionId: 'dec-A', authorizationId: AUTH_A, ...AMEND, store: aView, now: T3,
    })
    expect(result.status).toBe('conflict')
    expect((await live.lineage('dec-A')).some(r => r.type === 'amended')).toBe(false)
  })

  it('gives two writers the same generation however many annotations intervene', async () => {
    const live = await activeDecision()
    const before = lifecycleGenerationOf(await live.lineage('dec-A'))

    for (const note of ['one', 'two', 'three']) {
      await recordDecisionReview({ decisionId: 'dec-A', reviewNote: note, store: live, now: T2 })
    }
    await observeOutcome({ decisionId: 'dec-A', outcome: MEASURED, store: live, now: T2 })

    const after = lifecycleGenerationOf(await live.lineage('dec-A'))
    expect(after).toBe(before)
    expect((await live.lineage('dec-A')).length).toBe(6)
  })

  it('refuses an approve and a defer prepared from the same lifecycle state', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const live = new DbFaithfulStore([record('proposed', { occurredAt: T0, lifecycleGeneration: 0 })])
    const stale = live.snapshot('dec-A')
    const aView = frozenReader(live, stale)

    const deferGrant = await grantFor(
      { act: 'defer', decisionId: 'dec-A', reason: 'Awaiting churn data.', store: aView, now: T1 }, AUTH_A)
    const approveGrant = await grantFor(
      { act: 'approve', decisionId: 'dec-A', ...APPROVAL, store: live, now: T1 }, AUTH_B)

    authorizationService([deferGrant, approveGrant])
    expect((await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_B, ...APPROVAL, store: live, now: T1,
    })).status).toBe('ok')

    authorizationService([deferGrant, approveGrant])
    const result = await deferDecision({
      decisionId: 'dec-A', authorizationId: AUTH_A, reason: 'Awaiting churn data.', store: aView, now: T1,
    })
    expect(result.status).toBe('conflict')
    expect((await live.lineage('dec-A')).some(r => r.type === 'deferred')).toBe(false)
  })
})

// ── 5–10. Generation semantics ───────────────────────────────────────────────

describe('Lifecycle generation counts lifecycle acts only', () => {
  it('excludes annotations from the advancing set, in one shared definition', () => {
    expect([...LIFECYCLE_ADVANCING].sort()).toEqual([
      'amended', 'approved', 'completed', 'deferred', 'drafted',
      'proposed', 'rejected', 'reversed', 'superseded',
    ])
    expect(LIFECYCLE_ADVANCING.has('outcome_observed' as DecisionRecordType)).toBe(false)
    expect(LIFECYCLE_ADVANCING.has('reviewed' as DecisionRecordType)).toBe(false)
  })

  it('stamps an opening act with generation 0 and an approval with 1', async () => {
    const store = await activeDecision()
    expect(store.appended.find(r => r.type === 'approved')!.lifecycleGeneration).toBe(1)
  })

  it('gives a draft → proposal sequence generations 0 and 1', async () => {
    const rows = [record('drafted', { occurredAt: T0, lifecycleGeneration: 0 })]
    expect(lifecycleGenerationOf(rows)).toBe(1)
    rows.push(record('proposed', { occurredAt: T1, lifecycleGeneration: 1 }))
    expect(lifecycleGenerationOf(rows)).toBe(2)
    expect(deriveDecisionState(rows, { at: T2 }).status).toBe('proposed')
  })

  it('stamps annotations with the generation they observed, without consuming it', async () => {
    const store = await activeDecision()
    await recordDecisionReview({ decisionId: 'dec-A', reviewNote: 'A lesson.', store, now: T2 })
    await observeOutcome({ decisionId: 'dec-A', outcome: MEASURED, store, now: T2 })
    for (const type of ['reviewed', 'outcome_observed'] as const) {
      expect(store.appended.find(r => r.type === type)!.lifecycleGeneration).toBe(2)
    }
    expect(lifecycleGenerationOf(await store.lineage('dec-A'))).toBe(2)
  })

  it('lets two reviews and an outcome coexist at the same generation', async () => {
    const store = await activeDecision()
    for (const note of ['first lesson', 'second lesson']) {
      expect((await recordDecisionReview({
        decisionId: 'dec-A', reviewNote: note, store, now: T2,
      })).status).toBe('ok')
    }
    expect((await observeOutcome({
      decisionId: 'dec-A', outcome: MEASURED, store, now: T2,
    })).status).toBe('ok')
    expect(store.rejected).toHaveLength(0)

    // Two notes stamped in the same millisecond at the same generation are
    // genuinely concurrent — no true order exists between them. What must hold
    // is that EVERY reader derives the same one.
    const lineage = await store.lineage('dec-A')
    const once = deriveDecisionState(lineage, { at: T3 })
    const again = deriveDecisionState([...lineage].reverse(), { at: T3 })
    expect(once.reviewNotes).toEqual(again.reviewNotes)
    expect([...once.reviewNotes].sort()).toEqual(['first lesson', 'second lesson'])
    expect(once.outcome?.status).toBe('successful')
  })

  it('accumulates annotations in time order when their timestamps differ', async () => {
    const store = await activeDecision()
    await recordDecisionReview({ decisionId: 'dec-A', reviewNote: 'first lesson', store, now: T2 })
    await recordDecisionReview({ decisionId: 'dec-A', reviewNote: 'second lesson', store, now: T3 })
    const state = deriveDecisionState(await store.lineage('dec-A'), { at: T3 })
    expect(state.reviewNotes).toEqual(['first lesson', 'second lesson'])
  })

  it('advances the generation after each legitimate lifecycle act', async () => {
    const store = await activeDecision()
    await recordDecisionReview({ decisionId: 'dec-A', reviewNote: 'Noted.', store, now: T2 })
    authorizationService([await grantFor(
      { act: 'reverse', decisionId: 'dec-A', reason: 'Policy violation.', store, now: T2 }, AUTH_B)])
    expect((await reverseDecision({
      decisionId: 'dec-A', authorizationId: AUTH_B, reason: 'Policy violation.', store, now: T2,
    })).status).toBe('ok')
    expect(store.appended.find(r => r.type === 'reversed')!.lifecycleGeneration).toBe(2)
    expect(lifecycleGenerationOf(await store.lineage('dec-A'))).toBe(3)
  })
})

// ── 11. The migration and the code agree ─────────────────────────────────────

describe('The serialization index matches the pure core', () => {
  it('keys on the lifecycle generation, not on a row count', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain('(decision_id, lifecycle_generation)')
    expect(sql).not.toMatch(/base_record_count/)
    expect(sql).toContain('lifecycle_generation integer not null')
  })

  it('lists exactly the LIFECYCLE_ADVANCING types', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    const from = sql.indexOf('atlas_decision_ledger_one_advance_idx')
    const index = sql.slice(from, from + sql.slice(from).indexOf(';'))
    const listed = [...index.matchAll(/'(\w+)'/g)].map(m => m[1]).sort()
    expect(listed).toEqual([...LIFECYCLE_ADVANCING].sort())
  })

  it('orders the lineage index by generation before the random record id', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain('(decision_id, occurred_at, lifecycle_generation, record_id)')
  })
})

// ── 12–14. Equal-timestamp ordering ──────────────────────────────────────────

describe('Acts stamped in the same millisecond fold in the right order', () => {
  const TRIALS = 100

  it('orders a same-millisecond draft → proposal correctly every time', () => {
    for (let trial = 0; trial < TRIALS; trial += 1) {
      const drafted = record('drafted', { occurredAt: T1, lifecycleGeneration: 0 })
      const proposal = record('proposed', { occurredAt: T1, lifecycleGeneration: 1 })
      expect(orderDecisionRecords([proposal, drafted])[0].type).toBe('drafted')
      expect(deriveDecisionState([proposal, drafted], { at: T2 }).status).toBe('proposed')
    }
  })

  it('orders a same-millisecond proposal → approval correctly every time', () => {
    for (let trial = 0; trial < TRIALS; trial += 1) {
      const proposal = record('proposed', { occurredAt: T1, lifecycleGeneration: 0 })
      const approval = record('approved', {
        occurredAt: T1, lifecycleGeneration: 1, rationale: 'r',
        review: REVIEW, effectiveAt: T1, authority: AUTHORITY,
      })
      expect(deriveDecisionState([approval, proposal], { at: T2 }).status).toBe('active')
    }
  })

  it('orders a same-millisecond approval → close correctly every time', () => {
    for (let trial = 0; trial < TRIALS; trial += 1) {
      const proposal = record('proposed', { occurredAt: T0, lifecycleGeneration: 0 })
      const approval = record('approved', {
        occurredAt: T1, lifecycleGeneration: 1, rationale: 'r',
        review: REVIEW, effectiveAt: T1, authority: AUTHORITY,
      })
      const reversal = record('reversed', {
        occurredAt: T1, lifecycleGeneration: 2, reason: 'Policy violation.',
        rationale: 'r', review: REVIEW, effectiveAt: T1, authority: AUTHORITY,
      })
      expect(deriveDecisionState([reversal, approval, proposal], { at: T2 }).status).toBe('reversed')
    }
  })

  it('sorts an annotation before the act that leaves its generation', () => {
    const proposal = record('proposed', { occurredAt: T0, lifecycleGeneration: 0 })
    const approval = record('approved', {
      occurredAt: T1, lifecycleGeneration: 1, rationale: 'r',
      review: REVIEW, effectiveAt: T1, authority: AUTHORITY,
    })
    // Recorded while the decision was still a proposal, same millisecond.
    const note = record('reviewed', { occurredAt: T1, lifecycleGeneration: 1, reviewNote: 'Before approval.' })
    for (let trial = 0; trial < TRIALS; trial += 1) {
      const ordered = orderDecisionRecords([approval, note, proposal])
      expect(ordered.map(r => r.type)).toEqual(['proposed', 'reviewed', 'approved'])
    }
  })
})

// ── 15–17. No regressions ────────────────────────────────────────────────────

describe('R1 and R2 guarantees survive', () => {
  it('still binds authority to the prospective act', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    const store = new DbFaithfulStore([record('proposed', { occurredAt: T0, lifecycleGeneration: 0 })])
    authorizationService([await grantFor({ act: 'approve', decisionId: 'dec-A', ...APPROVAL, store, now: T1 }, AUTH_A)])
    const altered = await approveDecision({
      decisionId: 'dec-A', authorizationId: AUTH_A, ...APPROVAL,
      expiresAt: '2099-01-01T00:00:00.000Z', store, now: T1,
    })
    expect(altered.status).toBe('authority_not_effective')
    expect(store.appended).toHaveLength(0)
  })

  it('still validates before it appends, and appends in one place', () => {
    const write = readFileSync(WRITE, 'utf8')
    const commit = write.slice(write.indexOf('async function commitAct('))
    expect(commit.indexOf('deriveDecisionState(')).toBeLessThan(commit.indexOf('store.append('))
    expect(write.match(/store\.append\(/g) ?? []).toHaveLength(1)
  })

  it('reports a post-append malformed lineage as corruption, not availability', () => {
    const write = readFileSync(WRITE, 'utf8')
    const readback = write.slice(write.indexOf('// Readback is VERIFICATION'))
    expect(readback).toContain("DENY('integrity_violation'")
    // The lineage read failing is still a plain availability problem.
    expect(readback).toContain("DENY('unavailable')")
    expect(readback).toContain('LEDGER INTEGRITY VIOLATION')
  })

  it('keeps the generation out of the authority binding', () => {
    const binding = readFileSync(resolve(__dirname, '../atlas/decision-ledger/binding.ts'), 'utf8')
    expect(binding).toMatch(/AUTHORITY_UNBOUND_FIELDS[\s\S]{0,200}lifecycleGeneration/)
  })

  it('executes nothing and reads no clock in the pure core', () => {
    const derive = readFileSync(DERIVE, 'utf8')
    expect(derive).not.toMatch(/createAdminClient|supabase|fetch\(|node:fs|new Date\(|Date\.now/)
    expect(derive).not.toMatch(/atlasActions|executeWorkflow|publishArticle|runSteps|sendEmail|brevo/)
  })
})
