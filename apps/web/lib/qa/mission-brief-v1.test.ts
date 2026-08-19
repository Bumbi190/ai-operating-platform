/**
 * Executive Mission Brief V1 — domain, authority and persistence (EI-S1.4B).
 *
 * The Authorization V1 double here is FAITHFUL: it answers `effective` only when
 * the queried project, target (including version hash) and action match what the
 * authorization was actually granted for, exactly as the real seam does. A
 * blanket "always effective" mock would hide every binding attack below.
 *
 * Grants are obtained the way a real caller obtains them: `prepareMissionAct`
 * returns the binding for the exact act about to be requested, and the grant is
 * issued against that. Presenting the act with different terms afterwards is a
 * genuine attack, not a fixture mismatch.
 *
 * Filesystem/local only: no database, no network, no credentials, and — asserted
 * below — no Manager, workflow, runner or tool dispatch of any kind.
 */

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/project-access', () => ({ resolveProjectAccess: vi.fn() }))
vi.mock('@/lib/atlas/authorization/principal-read', () => ({ isAuthorizationEffective: vi.fn() }))
vi.mock('@/lib/atlas/decision-ledger/principal-read', () => ({ resolveDecision: vi.fn() }))

import { resolveProjectAccess } from '@/lib/auth/project-access'
import { isAuthorizationEffective } from '@/lib/atlas/authorization/principal-read'
import { resolveDecision } from '@/lib/atlas/decision-ledger/principal-read'
import { buildMissionRecord, newMissionId, MISSION_TYPES } from '@/lib/atlas/mission/build'
import {
  deriveMissionState,
  MISSION_AUTHORITY_ACTS,
  MISSION_LIFECYCLE_ADVANCING,
  missionLifecycleGenerationOf,
  missionReadiness,
  orderMissionRecords,
} from '@/lib/atlas/mission/derive'
import {
  bindingForMissionCandidate,
  MISSION_ACTION,
  MISSION_UNBOUND_FIELDS,
  missionBoundProjection,
} from '@/lib/atlas/mission/binding'
import {
  activateMission,
  amendMission,
  approveMission,
  archiveMission,
  cancelMission,
  clearMissionBlocker,
  closeMission,
  failMission,
  openMission,
  pauseMission,
  prepareMissionAct,
  proposeMission,
  raiseMissionBlocker,
  recordMissionEvidence,
  reportMissionProgress,
  resumeMission,
  observeMissionDependency,
  resolveMissionGate,
  reviewMission,
  supersedeMission,
} from '@/lib/atlas/mission/principal-write'
import {
  isMissionOperationallyAuthorized,
  listMissionsAwaitingApproval,
  listProjectMissions,
  resolveMission,
  resolveMissionEvaluation,
  resolveMissionReadiness,
} from '@/lib/atlas/mission/principal-read'
import type { MissionActType, MissionRecord, MissionStatus } from '@/lib/atlas/mission/types'
import type { MissionLedgerStore } from '@/lib/atlas/mission/store'

const MISSION_DIR = resolve(__dirname, '../atlas/mission')
const MIGRATION = resolve(__dirname, '../../supabase/migrations/20260819_atlas_mission_ledger.sql')

const PRINCIPAL_A = '11111111-1111-4111-8111-111111111111'
const PRINCIPAL_B = '22222222-2222-4222-8222-222222222222'
const PROJECT_P = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROJECT_Q = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AUTH_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const AUTH_B = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const AUTH_UNRELATED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const T0 = '2026-08-19T08:00:00.000Z'
const T1 = '2026-08-19T09:00:00.000Z'
const T2 = '2026-08-19T10:00:00.000Z'
const T3 = '2026-08-19T11:00:00.000Z'
const T4 = '2026-08-19T12:00:00.000Z'
const DEADLINE = '2026-09-19T08:00:00.000Z'
const PAST_DEADLINE = '2026-08-19T07:00:00.000Z'

/** A brief that satisfies every §20.172 completeness requirement. */
const COMPLETE_BRIEF = {
  title: 'Prepare The Prompt for a bounded L4 publishing trial',
  missionType: 'autonomy' as const,
  executiveOwner: 'project-executive:the-prompt',
  missionOwner: 'manager:the-prompt',
  objective: 'Make the short-news workflow safe enough for a 14-day bounded publishing trial.',
  strategicContext: 'The Prompt is the first autonomy proving ground.',
  expectedOutcome: 'A validated short-news path with human approval retained on send.',
  deliverables: ['Validation report', 'Rollback plan'],
  successCriteria: [
    { criterion: 'Isolation validated across active workflows', level: 'minimum' as const },
    { criterion: 'Zero cross-project reads observed', level: 'target' as const, measure: 'count == 0' },
  ],
  inScope: ['short-news workflow'],
  outOfScope: ['newsletter sending'],
  constraints: [{ kind: 'governance' as const, statement: 'Sending stays approval-gated.' }],
  budget: { currency: 'SEK', limitMinor: 500000 },
  authority: [{ action: 'prepare' }, { action: 'create_drafts' }],
  authoritySource: { kind: 'founder_instruction' as const, reference: 'EI-S1.4B owner ruling' },
  allowedActions: [{ action: 'inspect_code' }, { action: 'run_tests' }],
  forbiddenActions: [{ action: 'publish' }, { action: 'deploy_production' }],
  tools: [{ tool: 'repo_read', restriction: 'apps/web only' }],
  dataScope: [{ resource: 'website_content', access: 'read' as const }],
  dependencies: [{ kind: 'capability' as const, reference: 'isolation-primitives', hardness: 'hard' as const }],
  assumptions: [{ assumption: 'Evidence remains current', critical: true }],
  risks: [{ risk: 'Unintended publish', severity: 'high' as const, control: 'Approval gate on send' }],
  approvalGates: [{ gateId: 'gate-publish', gate: 'Before publishing' }],
  deadline: DEADLINE,
  reporting: [{ cadence: 'on_change' as const, audience: 'executive' as const }],
  escalationTriggers: [{ trigger: 'Critical assumption fails', destination: 'founder' as const }],
  stopConditions: [{ condition: 'Wrong-project access observed' }],
  pauseConditions: [{ condition: 'Founder review pending' }],
  completionConditions: ['Validation report accepted'],
  evidenceRequirements: [{ requirement: 'Isolation test output', kind: 'test_output' as const }],
}

const EVIDENCE = {
  kind: 'test_output' as const,
  reference: 'run-42',
  label: 'Isolation suite',
  observedAt: T2,
  scope: PROJECT_P,
}

const CLOSURE = {
  outcomeType: 'workflow_validated' as const,
  outcomeSummary: 'Short-news path validated with approval retained.',
  criteriaMet: ['Isolation validated across active workflows'],
  limitations: ['Newsletter path untested'],
}

class FakeStore implements MissionLedgerStore {
  appended: MissionRecord[] = []
  rejected: MissionRecord[] = []
  constructor(private rows: MissionRecord[] = []) {}
  async append(r: MissionRecord) {
    // DB-faithful: enforce the migration's partial unique index.
    if (MISSION_LIFECYCLE_ADVANCING.has(r.type)) {
      const clash = this.rows.some(x =>
        MISSION_LIFECYCLE_ADVANCING.has(x.type)
        && x.missionId === r.missionId
        && x.lifecycleGeneration === r.lifecycleGeneration)
      if (clash) {
        this.rejected.push(r)
        throw new Error('duplicate key value violates unique constraint (23505)')
      }
    }
    this.appended.push(r); this.rows.push(r); return r
  }
  async lineage(id: string) { return this.rows.filter(r => r.missionId === id) }
  async byProject(p: string) { return this.rows.filter(r => r.projectId === p) }
  snapshot(id: string) { return this.rows.filter(r => r.missionId === id).map(r => ({ ...r })) }
}

/** A store pinned to one stale snapshot, so a writer acts on what it read. */
function frozenReader(live: FakeStore, snapshot: MissionRecord[]): MissionLedgerStore {
  return {
    append: (r: MissionRecord) => live.append(r),
    lineage: async (id: string) => snapshot.filter(r => r.missionId === id),
    byProject: (p: string) => live.byProject(p),
  }
}

/** §20.75 — injected project-mode reader, so tests never touch a database. */
let currentProjectMode = 'active'
const projectMode = async () => currentProjectMode

const mockAccess = vi.mocked(resolveProjectAccess)
const mockAuth = vi.mocked(isAuthorizationEffective)
const mockDecision = vi.mocked(resolveDecision)

const authAs = (userId: string, allowed: string[]) =>
  mockAccess.mockResolvedValue({ ok: true, userId, allowedProjectIds: allowed })

interface Grant {
  id: string
  projectId: string
  target: { targetType: string; targetId: string; versionHash: string }
  actionKind: string
  principalId: string
  expiresAt?: string
  revoked?: boolean
  conditionsUnverified?: boolean
}

function authorizationService(grants: Grant[]) {
  mockAuth.mockImplementation(async (id, query = {}, args = {}) => {
    const grant = grants.find(g => g.id === id)
    if (!grant) return { effective: false, reason: 'not_yet_decided', state: null, status: 'not_permitted' } as never
    const at = (args as { now?: string }).now ?? T1
    if (grant.revoked) return { effective: false, reason: 'revoked', state: null, status: 'ok' } as never
    if (grant.conditionsUnverified) return { effective: false, reason: 'conditions_unverified', state: null, status: 'ok' } as never
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
      state: { principalId: grant.principalId, projectId: grant.projectId },
    } as never
  })
}

const activeDecision = (projectId = PROJECT_P, status = 'active') =>
  mockDecision.mockResolvedValue({
    state: { decisionId: 'dec-1', projectId, status, version: 1 },
    lineage: [], status: 'ok',
  } as never)

/** Issue a grant for exactly the act described — the real flow. */
async function grantFor(
  act: Parameters<typeof prepareMissionAct>[0],
  id: string,
  overrides: Partial<Grant> = {},
): Promise<Grant> {
  const { binding, status, detail } = await prepareMissionAct(act)
  expect(`${status}${detail ? `:${detail}` : ''}`).toBe('ok')
  return {
    id,
    projectId: binding!.projectId,
    target: binding!.target,
    actionKind: binding!.actionKind,
    principalId: PRINCIPAL_A,
    ...overrides,
  }
}

/** Open + propose a complete mission. Grants nothing. */
async function proposedMission(store = new FakeStore()): Promise<{ store: FakeStore; missionId: string }> {
  authAs(PRINCIPAL_A, [PROJECT_P])
  authorizationService([])
  const opened = await openMission({ projectId: PROJECT_P, ...COMPLETE_BRIEF, store, now: T0, projectMode })
  expect(opened.status).toBe('ok')
  return { store, missionId: opened.state!.missionId }
}

/** §20.101 — observe the declared hard dependency as satisfied. */
async function satisfyDependency(store: FakeStore, missionId: string, now = T1) {
  const r = await observeMissionDependency({
    missionId, observation: { reference: 'isolation-primitives', satisfied: true, evidence: 'run-1' },
    store, now, projectMode,
  })
  expect(r.status).toBe('ok')
}

/** A mission approved at T1 under exact authority. */
async function approvedMission(): Promise<{ store: FakeStore; missionId: string; grant: Grant }> {
  const { store, missionId } = await proposedMission()
  const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A)
  authorizationService([grant])
  const approved = await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })
  expect(`${approved.status}${approved.detail ? `:${approved.detail}` : ''}`).toBe('ok')
  return { store, missionId, grant }
}

/** An activated mission. */
async function activatedMission(): Promise<{ store: FakeStore; missionId: string; grants: Grant[] }> {
  const { store, missionId, grant } = await approvedMission()
  await satisfyDependency(store, missionId, T1)
  const activateGrant = await grantFor({ act: 'activate', missionId, store, now: T2, projectMode }, AUTH_B)
  authorizationService([grant, activateGrant])
  const activated = await activateMission({ missionId, authorizationId: AUTH_B, store, now: T2, projectMode })
  expect(`${activated.status}${activated.detail ? `:${activated.detail}` : ''}`).toBe('ok')
  return { store, missionId, grants: [grant, activateGrant] }
}

beforeEach(() => {
  mockAccess.mockReset(); mockAuth.mockReset(); mockDecision.mockReset()
  currentProjectMode = 'active'
})

// ── 1–3. Vocabulary ───────────────────────────────────────────────────────────

describe('Canonical vocabulary (§20.11, §20.98)', () => {
  it('implements exactly the twelve canonical mission types', () => {
    expect([...MISSION_TYPES].sort()).toEqual([
      'autonomy', 'build', 'governance', 'growth', 'investigation', 'learning',
      'operational', 'recovery', 'risk_reduction', 'stabilization', 'strategic', 'validation',
    ])
    expect(MISSION_TYPES).toHaveLength(12)
  })

  it('accepts every canonical mission type and refuses a thirteenth', async () => {
    for (const missionType of MISSION_TYPES) {
      const record = buildMissionRecord({
        type: 'drafted', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
        occurredAt: T0, version: 1, lifecycleGeneration: 0,
        ...COMPLETE_BRIEF, missionType,
      })
      expect(record.missionType).toBe(missionType)
    }
    expect(() => buildMissionRecord({
      type: 'drafted', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 0,
      ...COMPLETE_BRIEF, missionType: 'general' as never,
    })).toThrow(/mission-type-canonical/)
  })

  it('supports all sixteen §20.98 statuses in the public type', () => {
    const source = readFileSync(resolve(MISSION_DIR, 'types.ts'), 'utf8')
    const block = source.slice(source.indexOf('export type MissionStatus'))
      .slice(0, source.slice(source.indexOf('export type MissionStatus')).indexOf('\n\n'))
    const declared = [...block.matchAll(/'(\w+)'/g)].map(m => m[1])
    expect(declared.sort()).toEqual([
      'active', 'approved', 'archived', 'at_risk', 'awaiting_approval', 'awaiting_review',
      'blocked', 'cancelled', 'completed', 'draft', 'failed', 'partially_completed',
      'paused', 'proposed', 'ready', 'superseded',
    ])
    expect(declared).toHaveLength(16)
  })

  it('keeps derived statuses out of the persisted act vocabulary', () => {
    const acts = new Set<string>(MISSION_LIFECYCLE_ADVANCING as ReadonlySet<string>)
    // §20.98's four predicates must have no act that could assert them.
    for (const derived of ['awaiting_approval', 'ready', 'at_risk', 'awaiting_review'] as MissionStatus[]) {
      expect(acts.has(derived)).toBe(false)
    }
    // And the migration has no mutable status column at all.
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).not.toMatch(/^\s*status\s+text/m)
  })

  it('has no mission type that grants capability', () => {
    // A type change alone must not alter the authority envelope.
    const base = buildMissionRecord({
      type: 'drafted', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 0, ...COMPLETE_BRIEF, missionType: 'learning',
    })
    const autonomy = { ...base, missionType: 'autonomy' as const }
    expect(autonomy.allowedActions).toEqual(base.allowedActions)
    expect(autonomy.authority).toEqual(base.authority)
  })
})

// ── 4–7. Opening grants nothing ───────────────────────────────────────────────

describe('Opening a mission grants nothing (§20.99)', () => {
  it('creates a draft that is not approved, not active and not authorized', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([])
    const store = new FakeStore()
    const opened = await openMission({ projectId: PROJECT_P, ...COMPLETE_BRIEF, asDraft: true, store, now: T0, projectMode })
    expect(opened.status).toBe('ok')
    expect(opened.state?.status).toBe('draft')
    expect(opened.state?.approvedAt).toBeNull()
    expect(opened.state?.activatedAt).toBeNull()
    expect(opened.state?.authorityRecord).toBeNull()

    const authority = await isMissionOperationallyAuthorized(opened.state!.missionId, { store, now: T1, projectMode })
    expect(authority.authorized).toBe(false)
    expect(authority.reason).toBe('no_authority_act')
  })

  it('creates a proposal and derives awaiting_approval once the brief is complete', async () => {
    const { store, missionId } = await proposedMission()
    const read = await resolveMission(missionId, { store, now: T1, projectMode })
    // §20.172 — a complete brief is one a human can act on.
    expect(read.state?.status).toBe('awaiting_approval')
    expect(read.state?.briefComplete).toBe(true)
    expect(read.state?.missingRequirements).toEqual([])
  })

  it('keeps an incomplete proposal at `proposed`, naming what is missing (§20.172)', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([])
    const store = new FakeStore()
    const { missionOwner, successCriteria, approvalGates, deadline, stopConditions, ...thin } = COMPLETE_BRIEF
    const opened = await openMission({ projectId: PROJECT_P, ...thin, store, now: T0, projectMode })
    expect(opened.state?.status).toBe('proposed')
    expect(opened.state?.missingRequirements.sort()).toEqual(
      ['approval_gate', 'deadline', 'owner', 'stop_condition', 'success_criteria'])
  })

  it('refuses to approve an incomplete brief without appending anything', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([])
    const store = new FakeStore()
    const { deadline, ...thin } = COMPLETE_BRIEF
    const opened = await openMission({ projectId: PROJECT_P, ...thin, store, now: T0, projectMode })
    const before = store.appended.length
    const result = await approveMission({ missionId: opened.state!.missionId, authorizationId: AUTH_A, store, now: T1, projectMode })
    expect(result.status).toBe('activation_incomplete')
    expect(result.missing).toContain('deadline')
    expect(store.appended).toHaveLength(before)
  })
})

// ── 8–15. Prospective authority binding ───────────────────────────────────────

describe('Authority binds the exact prospective mission act (§20.126)', () => {
  it('produces a deterministic, order-independent material hash', async () => {
    const a = buildMissionRecord({
      type: 'approved', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 1, ...COMPLETE_BRIEF,
      authorityRecord: { authorizationId: 'x', principalId: PRINCIPAL_A, actionKind: 'mission.approve', boundVersionHash: 'h', authorityActAt: T0 },
    })
    const reordered = buildMissionRecord({
      type: 'approved', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 1, ...COMPLETE_BRIEF,
      inScope: [...COMPLETE_BRIEF.inScope].reverse(),
      forbiddenActions: [...COMPLETE_BRIEF.forbiddenActions].reverse(),
      authorityRecord: { authorizationId: 'x', principalId: PRINCIPAL_A, actionKind: 'mission.approve', boundVersionHash: 'h', authorityActAt: T0 },
    })
    expect(bindingForMissionCandidate(a, 'approve').target.versionHash)
      .toBe(bindingForMissionCandidate(reordered, 'approve').target.versionHash)
    expect(bindingForMissionCandidate(a, 'approve').target.versionHash).toMatch(/^[a-f0-9]{64}$/)
    expect(bindingForMissionCandidate(a, 'approve').target.targetType).toBe('mission')
  })

  it('classifies every MissionRecord field as bound or explicitly unbound', () => {
    const candidate = buildMissionRecord({
      type: 'approved', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 1, ...COMPLETE_BRIEF,
      authorityRecord: { authorizationId: 'x', principalId: PRINCIPAL_A, actionKind: 'mission.approve', boundVersionHash: 'h', authorityActAt: T0 },
    })
    const bound = new Set(Object.keys(missionBoundProjection(candidate)))
    const unbound = new Set<string>(MISSION_UNBOUND_FIELDS)
    const unclassified = Object.keys(candidate).filter(f => !bound.has(f) && !unbound.has(f))
    // A material field added without a ruling fails here.
    expect(unclassified).toEqual([])
  })

  it.each([
    ['objective', 'A materially different objective'],
    ['projectId', PROJECT_Q],
    ['deadline', '2099-01-01T00:00:00.000Z'],
    ['version', 9],
    ['title', 'Another title'],
    ['missionOwner', 'someone-else'],
    ['executiveOwner', 'another-executive'],
    ['expectedOutcome', 'Something else entirely'],
    ['strategicContext', 'A different justification'],
    ['reason', 'A different stated reason'],
    ['supersededBy', 'other-mission'],
  ])('changing %s changes the binding', (field, value) => {
    const base = buildMissionRecord({
      type: 'approved', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 1, ...COMPLETE_BRIEF,
      authorityRecord: { authorizationId: 'x', principalId: PRINCIPAL_A, actionKind: 'mission.approve', boundVersionHash: 'h', authorityActAt: T0 },
    })
    const original = JSON.stringify(missionBoundProjection(base))
    expect(JSON.stringify(missionBoundProjection({ ...base, [field]: value } as never))).not.toBe(original)
  })

  it.each([
    ['successCriteria', [{ criterion: 'Anything', level: 'minimum' }]],
    ['inScope', ['everything']],
    ['outOfScope', []],
    ['budget', { currency: 'SEK', limitMinor: 99999999 }],
    ['authority', [{ action: 'publish' }]],
    ['allowedActions', [{ action: 'deploy_production' }]],
    ['forbiddenActions', []],
    ['tools', [{ tool: 'repo_write' }]],
    ['dataScope', [{ resource: 'everything', access: 'write' }]],
    ['approvalGates', []],
    ['risks', [{ risk: 'None', severity: 'low' }]],
    ['stopConditions', []],
    ['escalationTriggers', []],
    ['constraints', []],
    ['dependencies', []],
    ['assumptions', []],
    ['evidenceRequirements', []],
    ['completionConditions', []],
    ['deliverables', []],
    ['reporting', []],
    ['pauseConditions', []],
    ['missionType', 'build'],
    ['authoritySource', { kind: 'project_policy', reference: 'other' }],
  ])('changing %s changes the binding', (field, value) => {
    const base = buildMissionRecord({
      type: 'approved', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 1, ...COMPLETE_BRIEF,
      authorityRecord: { authorizationId: 'x', principalId: PRINCIPAL_A, actionKind: 'mission.approve', boundVersionHash: 'h', authorityActAt: T0 },
    })
    const original = JSON.stringify(missionBoundProjection(base))
    expect(JSON.stringify(missionBoundProjection({ ...base, [field]: value } as never))).not.toBe(original)
  })

  it('ignores identity, clock, principal, proof and concurrency position', () => {
    const base = buildMissionRecord({
      type: 'approved', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 1, ...COMPLETE_BRIEF,
      authorityRecord: { authorizationId: 'x', principalId: PRINCIPAL_A, actionKind: 'mission.approve', boundVersionHash: 'h', authorityActAt: T0 },
    })
    const original = JSON.stringify(missionBoundProjection(base))
    const noise = {
      ...base, recordId: randomUUID(), occurredAt: T4, principalId: PRINCIPAL_B,
      authorityRecord: null, lifecycleGeneration: 99,
      report: { summary: 'x', atRisk: true }, blocker: { blockerId: 'b', reason: 'r' },
      clearsBlockerId: 'b', evidence: EVIDENCE, reviewNote: 'note',
    }
    expect(JSON.stringify(missionBoundProjection(noise as never))).toBe(original)
  })

  it('binds a distinct action for each of the five authority acts', () => {
    expect(new Set(Object.values(MISSION_ACTION)).size).toBe(5)
    expect([...MISSION_AUTHORITY_ACTS].sort()).toEqual(
      ['activated', 'amended', 'approved', 'cancelled', 'superseded'])
  })

  it('exposes no caller-controlled target, version or action on any authority act', () => {
    const source = readFileSync(resolve(MISSION_DIR, 'principal-write.ts'), 'utf8')
    for (const name of ['ApproveMissionArgs', 'ActivateMissionArgs', 'AmendMissionArgs', 'CancelMissionArgs', 'SupersedeMissionArgs']) {
      const block = source.match(new RegExp(`export interface ${name}[\\s\\S]*?\\n}`))
      expect(block).toBeTruthy()
      expect(block![0]).not.toMatch(/authorizationTarget|actionKind|versionHash|principalId|target\s*:/)
    }
  })
})

// ── 16–22. Authorization must match exactly ───────────────────────────────────

describe('Only an exact, current authorization approves a mission', () => {
  it('accepts the exact approved candidate that was authorized', async () => {
    const { store, missionId } = await approvedMission()
    const read = await resolveMission(missionId, { store, now: T2, projectMode })
    expect(read.state?.status).toBe('approved')
    expect(read.state?.approvedAt).toBe(T1)
    expect(read.state?.authorityRecord?.actionKind).toBe(MISSION_ACTION.approve)
    expect(read.state?.authorityRecord?.principalId).toBe(PRINCIPAL_A)
  })

  it('refuses an unrelated same-project grant', async () => {
    const { store, missionId } = await proposedMission()
    authorizationService([{
      id: AUTH_UNRELATED, projectId: PROJECT_P,
      target: { targetType: 'article', targetId: 'unrelated-42', versionHash: 'f'.repeat(64) },
      actionKind: 'publish_article', principalId: PRINCIPAL_A,
    }])
    const before = store.appended.length
    const result = await approveMission({ missionId, authorizationId: AUTH_UNRELATED, store, now: T1, projectMode })
    expect(result.status).toBe('authority_not_effective')
    expect(store.appended).toHaveLength(before)
  })

  it('refuses a wrong-project authorization', async () => {
    const { store, missionId } = await proposedMission()
    const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A, { projectId: PROJECT_Q })
    authorizationService([grant])
    const result = await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })
    expect(result.status).toBe('authority_not_effective')
    expect(result.detail).toContain('project_mismatch')
  })

  it('refuses a wrong-mission/version authorization', async () => {
    const { store, missionId } = await proposedMission()
    const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A, {
      target: { targetType: 'mission', targetId: newMissionId(), versionHash: 'a'.repeat(64) },
    })
    authorizationService([grant])
    const result = await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })
    expect(result.status).toBe('authority_not_effective')
    expect(result.detail).toContain('version_mismatch')
  })

  it('refuses a wrong-action authorization', async () => {
    const { store, missionId } = await proposedMission()
    // A grant to ACTIVATE cannot APPROVE.
    const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A,
      { actionKind: MISSION_ACTION.activate })
    authorizationService([grant])
    const result = await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })
    expect(result.status).toBe('authority_not_effective')
    expect(result.detail).toContain('action_mismatch')
  })

  it('refuses when the authorization principal is not the acting caller (§20.55)', async () => {
    const { store, missionId } = await proposedMission()
    const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A, { principalId: PRINCIPAL_B })
    authorizationService([grant])
    const before = store.appended.length
    const result = await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })
    expect(result.status).toBe('authority_principal_mismatch')
    expect(store.appended).toHaveLength(before)
  })

  it('refuses a conditional-unverified authorization', async () => {
    const { store, missionId } = await proposedMission()
    const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A, { conditionsUnverified: true })
    authorizationService([grant])
    const result = await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })
    expect(result.status).toBe('authority_not_effective')
    expect(result.detail).toContain('conditions_unverified')
  })
})

// ── 23–26. Continuing operational authority ───────────────────────────────────

describe('Mission authority is an operational gate, not a historical fact (§20.75)', () => {
  it('reports authorized while the grant is effective', async () => {
    const { store, missionId } = await approvedMission()
    const authority = await isMissionOperationallyAuthorized(missionId, { store, now: T2, projectMode })
    expect(authority.authorized).toBe(true)
    expect(authority.reason).toBe('authorized')
  })

  it('stops authorizing once the grant expires — unlike a Decision Ledger approval', async () => {
    const { store, missionId } = await proposedMission()
    const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A, { expiresAt: T2 })
    authorizationService([grant])
    expect((await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })).status).toBe('ok')

    const authority = await isMissionOperationallyAuthorized(missionId, { store, now: T3, projectMode })
    expect(authority.authorized).toBe(false)
    expect(authority.reason).toBe('authorization_invalid')
    expect(authority.detail).toContain('expired')

    // History is untouched: the approval act stands (§20.128).
    const read = await resolveMission(missionId, { store, now: T3, projectMode })
    expect(read.state?.approvedAt).toBe(T1)
    expect(read.state?.authorityRecord?.authorizationId).toBe(AUTH_A)
  })

  it('stops authorizing once the grant is revoked', async () => {
    const { store, missionId, grant } = await approvedMission()
    authorizationService([{ ...grant, revoked: true }])
    const authority = await isMissionOperationallyAuthorized(missionId, { store, now: T2, projectMode })
    expect(authority.authorized).toBe(false)
    expect(authority.reason).toBe('authorization_invalid')
  })

  it('blocks a NEW activation once authority is no longer valid', async () => {
    const { store, missionId, grant } = await approvedMission()
    await satisfyDependency(store, missionId, T1)
    const activateGrant = await grantFor({ act: 'activate', missionId, store, now: T2, projectMode }, AUTH_B)
    // Both grants revoked before the activation attempt.
    authorizationService([{ ...grant, revoked: true }, { ...activateGrant, revoked: true }])
    const before = store.appended.length
    const result = await activateMission({ missionId, authorizationId: AUTH_B, store, now: T2, projectMode })
    // EI-S1.4B-R1: the CURRENT authority is proven before the irreversible
    // append, so this now denies at the operational gate rather than at the
    // new grant — and either way appends nothing.
    expect(result.status).toBe('authority_not_current')
    expect(store.appended).toHaveLength(before)
  })

  it('makes an active mission non-ready when its authority later fails', async () => {
    const { store, missionId, grants } = await activatedMission()
    authorizationService(grants.map(g => ({ ...g, revoked: true })))
    const readiness = await resolveMissionReadiness(missionId, { store, now: T3, projectMode })
    expect(readiness.authority?.authorized).toBe(false)
    expect(readiness.readiness?.ready).toBe(false)
    expect(readiness.readiness?.missing).toContain('current_authorization')
    // The historical `activated` act is still there.
    expect(readiness.state?.activatedAt).toBe(T2)
  })
})

// ── 27–31. Versioning ─────────────────────────────────────────────────────────

describe('Material amendment creates version N+1 and expires prior approval (§20.126, §20.75)', () => {
  const AMENDMENT = { reason: 'Widen the trial after review.', objective: 'A materially wider commitment.' }

  it('creates N+1 under fresh exact authority and keeps N auditable', async () => {
    const { store, missionId } = await approvedMission()
    const amendGrant = await grantFor({ act: 'amend', missionId, ...AMENDMENT, store, now: T2, projectMode }, AUTH_B)
    authorizationService([amendGrant])
    const result = await amendMission({ missionId, authorizationId: AUTH_B, ...AMENDMENT, store, now: T2, projectMode })
    expect(`${result.status}${result.detail ? `:${result.detail}` : ''}`).toBe('ok')
    expect(result.state?.version).toBe(2)
    expect(result.state?.objective).toBe(AMENDMENT.objective)
    // §20.128 — version 1 remains in the immutable lineage.
    expect(result.state?.lineage.map(l => l.version)).toContain(1)
    expect(store.appended.filter(r => r.type === 'approved')).toHaveLength(1)
  })

  it('returns the mission to `proposed` — the prior approval expired (§20.75)', async () => {
    const { store, missionId } = await approvedMission()
    const amendGrant = await grantFor({ act: 'amend', missionId, ...AMENDMENT, store, now: T2, projectMode }, AUTH_B)
    authorizationService([amendGrant])
    await amendMission({ missionId, authorizationId: AUTH_B, ...AMENDMENT, store, now: T2, projectMode })

    const read = await resolveMission(missionId, { store, now: T2, projectMode })
    // Complete brief → awaiting_approval, not approved and not active.
    expect(read.state?.status).toBe('awaiting_approval')
    expect(read.state?.approvedAt).toBeNull()
    expect(read.state?.activatedAt).toBeNull()
    expect(read.state?.authorityRecord).toBeNull()

    const authority = await isMissionOperationallyAuthorized(missionId, { store, now: T2, projectMode })
    expect(authority.authorized).toBe(false)
    expect(authority.reason).toBe('no_authority_act')
  })

  it('refuses an amendment carrying only the approval authority', async () => {
    const { store, missionId } = await approvedMission()
    const before = store.appended.length
    const result = await amendMission({ missionId, authorizationId: AUTH_A, ...AMENDMENT, store, now: T2, projectMode })
    expect(result.status).toBe('authority_not_effective')
    expect(store.appended).toHaveLength(before)
  })

  it('a grant for amendment X cannot append amendment Y', async () => {
    const { store, missionId } = await approvedMission()
    const amendGrant = await grantFor({ act: 'amend', missionId, ...AMENDMENT, store, now: T2, projectMode }, AUTH_B)
    authorizationService([amendGrant])
    const result = await amendMission({
      missionId, authorizationId: AUTH_B, reason: AMENDMENT.reason,
      objective: 'An entirely different and much wider commitment.',
      budget: { currency: 'SEK', limitMinor: 99999999 },
      store, now: T2, projectMode,
    })
    expect(result.status).toBe('authority_not_effective')
    expect(store.appended.some(r => r.type === 'amended')).toBe(false)
  })

  it('cannot change the mission project on amendment', async () => {
    const { store, missionId } = await approvedMission()
    // `projectId` is not an amendment argument at all — the type forbids it,
    // and the lineage invariant refuses a foreign-scope record outright.
    const source = readFileSync(resolve(MISSION_DIR, 'principal-write.ts'), 'utf8')
    const block = source.match(/export interface AmendMissionArgs[\s\S]*?\n}/)![0]
    expect(block).not.toMatch(/projectId/)

    const lineage = await store.lineage(missionId)
    const foreign = { ...lineage[0], recordId: randomUUID(), projectId: PROJECT_Q, occurredAt: T3 }
    expect(() => deriveMissionState([...lineage, foreign], { at: T3 })).toThrow(/project-scope-stable/)
  })
})

// ── 32–36. Activation and readiness ───────────────────────────────────────────

describe('Approved, Ready and Active are distinct (§20.100, §20.101, §20.102)', () => {
  it('an approved mission with an unmet hard dependency is approved but not ready', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([])
    const store = new FakeStore()
    const brief = {
      ...COMPLETE_BRIEF,
      dependencies: [{ kind: 'capability' as const, reference: 'not-yet', hardness: 'hard' as const, satisfied: false }],
    }
    const opened = await openMission({ projectId: PROJECT_P, ...brief, store, now: T0, projectMode })
    const missionId = opened.state!.missionId
    const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A)
    authorizationService([grant])
    expect((await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })).status).toBe('ok')

    const readiness = await resolveMissionReadiness(missionId, { store, now: T1, projectMode })
    expect(readiness.state?.status).toBe('approved')
    expect(readiness.readiness?.ready).toBe(false)
    expect(readiness.readiness?.missing).toContain('dependencies')
  })

  it('derives ready only when every canonical requirement is satisfied', async () => {
    const { store, missionId } = await approvedMission()
    // §20.101 "Available dependencies" — unobserved means unsatisfied.
    const beforeObservation = await resolveMissionReadiness(missionId, { store, now: T1, projectMode })
    expect(beforeObservation.readiness?.ready).toBe(false)
    expect(beforeObservation.readiness?.missing).toContain('dependencies')

    await satisfyDependency(store, missionId, T1)
    const readiness = await resolveMissionReadiness(missionId, { store, now: T1, projectMode })
    expect(readiness.readiness?.ready).toBe(true)
    expect(readiness.readiness?.missing).toEqual([])
    // §20.101 "Required tools" is NOT claimed as verified.
    expect(readiness.readiness?.unverified).toContain('tool_availability')
  })

  it('refuses activation with missing requirements and appends nothing (§20.106)', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([])
    const store = new FakeStore()
    const brief = {
      ...COMPLETE_BRIEF,
      dependencies: [{ kind: 'capability' as const, reference: 'not-yet', hardness: 'hard' as const, satisfied: false }],
    }
    const opened = await openMission({ projectId: PROJECT_P, ...brief, store, now: T0, projectMode })
    const missionId = opened.state!.missionId
    const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A)
    authorizationService([grant])
    await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })

    const before = store.appended.length
    const result = await activateMission({ missionId, authorizationId: AUTH_B, store, now: T2, projectMode })
    expect(result.status).toBe('activation_incomplete')
    expect(result.missing).toContain('dependencies')
    // §20.106 — "The mission remains inactive… No external execution begins."
    expect(store.appended).toHaveLength(before)
    expect(store.appended.some(r => r.type === 'activated')).toBe(false)
  })

  it('cannot activate a mission that was never approved', async () => {
    const { store, missionId } = await proposedMission()
    authorizationService([])
    const result = await activateMission({ missionId, authorizationId: AUTH_B, store, now: T2, projectMode })
    expect(result.status).not.toBe('ok')
    expect(store.appended.some(r => r.type === 'activated')).toBe(false)
  })

  it('activates a ready mission under its own fresh authority', async () => {
    const { store, missionId } = await activatedMission()
    const read = await resolveMission(missionId, { store, now: T2, projectMode })
    expect(read.state?.status).toBe('active')
    expect(read.state?.activatedAt).toBe(T2)
    expect(read.state?.authorityRecord?.actionKind).toBe(MISSION_ACTION.activate)
  })
})

// ── 37–41. Lifecycle integrity ────────────────────────────────────────────────

describe('No invalid transition ever reaches the store', () => {
  it.each([
    ['approve a draft that was never proposed', async (store: FakeStore, id: string) =>
      approveMission({ missionId: id, authorizationId: AUTH_A, store, now: T1, projectMode })],
    ['resume a mission that is not paused', async (store: FakeStore, id: string) =>
      resumeMission({ missionId: id, store, now: T2, projectMode })],
    ['archive a mission that is not closed', async (store: FakeStore, id: string) =>
      archiveMission({ missionId: id, store, now: T2, projectMode })],
  ])('refuses to %s, appending zero records', async (_label, act) => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([])
    const store = new FakeStore()
    const opened = await openMission({ projectId: PROJECT_P, ...COMPLETE_BRIEF, asDraft: true, store, now: T0, projectMode })
    const before = store.appended.length
    const result = await act(store, opened.state!.missionId)
    expect(result.status).not.toBe('ok')
    expect(store.appended).toHaveLength(before)
  })

  it('refuses to close an active mission that has not met its own contract', async () => {
    const { store, missionId } = await activatedMission()
    const before = store.appended.length
    const result = await closeMission({ missionId, closure: CLOSURE, store, now: T3, projectMode })
    expect(result.status).toBe('completion_incomplete')
    // Missing declared evidence and the §20.195 completion review.
    expect(result.detail).toContain('evidence:test_output')
    expect(result.detail).toContain('completion_review')
    expect(store.appended).toHaveLength(before)
  })

  it('offers no update or delete path, and enforces it in the DB', () => {
    const store = readFileSync(resolve(MISSION_DIR, 'store.ts'), 'utf8')
    expect(store).not.toMatch(/\.update\(|\.delete\(|\.upsert\(/)
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain('before update on public.atlas_mission_ledger')
    expect(sql).toContain('before delete on public.atlas_mission_ledger')
    expect(sql).toContain('atlas_mission_ledger_reject_mutation')
  })

  it('validates the candidate through the pure core before the store is touched', () => {
    const write = readFileSync(resolve(MISSION_DIR, 'principal-write.ts'), 'utf8')
    const commit = write.slice(write.indexOf('async function commitAct('))
    expect(commit.indexOf('deriveMissionState(')).toBeLessThan(commit.indexOf('store.append('))
    // Exactly one place appends at all.
    expect(write.match(/store\.append\(/g) ?? []).toHaveLength(1)
  })

  it('reports a post-write unfoldable lineage as corruption, not availability', () => {
    const write = readFileSync(resolve(MISSION_DIR, 'principal-write.ts'), 'utf8')
    const readback = write.slice(write.indexOf('// Readback is VERIFICATION'))
    expect(readback).toContain("DENY('integrity_violation'")
    expect(readback).toContain("DENY('unavailable')")
    expect(readback).toContain('LEDGER INTEGRITY VIOLATION')
  })
})

// ── 42–47. Completion, failure, cancellation, supersession ────────────────────

describe('Completion is judged, never assumed (§20.92, §20.93, §20.225)', () => {
  async function readyToClose() {
    const { store, missionId } = await activatedMission()
    await recordMissionEvidence({ missionId, evidence: EVIDENCE, store, now: T3, projectMode })
    await reviewMission({ missionId, reviewNote: 'Objective achieved; criteria met; evidence sufficient.', store, now: T3, projectMode })
    // §20.92 — "Approvals are resolved." The declared gate must actually have
    // been resolved, not merely declared.
    await resolveMissionGate({
      missionId, resolution: { gateId: 'gate-publish', outcome: 'approve', evidence: 'founder sign-off' },
      store, now: T3, projectMode,
    })
    return { store, missionId }
  }

  it('completes once evidence, minimum criteria and a review all exist', async () => {
    const { store, missionId } = await readyToClose()
    const result = await closeMission({ missionId, closure: CLOSURE, store, now: T4, projectMode })
    expect(`${result.status}${result.detail ? `:${result.detail}` : ''}`).toBe('ok')
    expect(result.state?.status).toBe('completed')
    expect(result.state?.closure?.outcomeType).toBe('workflow_validated')
  })

  it('refuses completion when a minimum success criterion is not met', async () => {
    const { store, missionId } = await readyToClose()
    const result = await closeMission({
      missionId, closure: { ...CLOSURE, criteriaMet: [] }, store, now: T4,
    })
    expect(result.status).toBe('completion_incomplete')
    expect(result.detail).toContain('success_criteria:Isolation validated across active workflows')
  })

  it('distinguishes partial completion from completion (§20.94)', async () => {
    const { store, missionId } = await readyToClose()
    const result = await closeMission({ missionId, closure: CLOSURE, partial: true, store, now: T4, projectMode })
    expect(result.status).toBe('ok')
    expect(result.state?.status).toBe('partially_completed')
  })

  it('distinguishes failure, which needs no completion evidence (§20.95)', async () => {
    const { store, missionId } = await activatedMission()
    const result = await failMission({ missionId, reason: 'Critical assumption failed.', store, now: T3, projectMode })
    expect(result.status).toBe('ok')
    expect(result.state?.status).toBe('failed')
  })

  it('distinguishes cancellation, which is an authority act (§20.96)', async () => {
    const { store, missionId } = await approvedMission()
    const noGrant = await cancelMission({ missionId, authorizationId: AUTH_A, reason: 'Priority changed.', store, now: T2, projectMode })
    expect(noGrant.status).toBe('authority_not_effective')

    const grant = await grantFor({ act: 'cancel', missionId, reason: 'Priority changed.', store, now: T2, projectMode }, AUTH_B)
    authorizationService([grant])
    const result = await cancelMission({ missionId, authorizationId: AUTH_B, reason: 'Priority changed.', store, now: T2, projectMode })
    expect(result.status).toBe('ok')
    expect(result.state?.status).toBe('cancelled')
  })

  it('supersedes with a real successor and preserves history (§20.97)', async () => {
    const { store, missionId } = await approvedMission()
    // §20.97 — "replaced by a NEWER MISSION". A ghost id is not one.
    const successorOpen = await openMission({ projectId: PROJECT_P, ...COMPLETE_BRIEF, store, now: T1, projectMode })
    const successor = successorOpen.state!.missionId

    const grant = await grantFor({ act: 'supersede', missionId, supersededBy: successor, store, now: T2, projectMode }, AUTH_B)
    authorizationService([grant])
    const result = await supersedeMission({ missionId, supersededBy: successor, authorizationId: AUTH_B, store, now: T2, projectMode })
    expect(result.status).toBe('ok')
    expect(result.state?.status).toBe('superseded')
    expect(result.state?.supersededBy).toBe(successor)
    expect(result.state?.lineage.map(l => l.type)).toEqual(['proposed', 'approved', 'superseded'])
  })

  it('writes nothing to the Decision Ledger, Memory or any calibration surface', () => {
    for (const file of ['types.ts', 'derive.ts', 'build.ts', 'binding.ts', 'store.ts', 'principal-write.ts']) {
      const source = readFileSync(resolve(MISSION_DIR, file), 'utf8')
      expect(source).not.toMatch(/decision-ledger\/principal-write|observeOutcome|recordDecisionReview|memory-store|feedback-store|atlas_intelligence/)
    }
    // The shared authority seam may READ a decision; nothing may write one.
    const seam = readFileSync(resolve(MISSION_DIR, 'operational-authority.ts'), 'utf8')
    expect(seam).toContain('resolveDecision')
    for (const file of ['operational-authority.ts', 'principal-read.ts']) {
      expect(readFileSync(resolve(MISSION_DIR, file), 'utf8')).not.toMatch(/decision-ledger\/principal-write/)
    }
  })
})

// ── 48–52. Decision Ledger seam ───────────────────────────────────────────────

describe('Decision Ledger linkage is optional and validated (§20.137)', () => {
  const withDecision = {
    ...COMPLETE_BRIEF,
    authoritySource: { kind: 'decision_ledger' as const, reference: 'dec-1 v1' },
    decisionRef: { decisionId: 'dec-1', decisionVersion: 1, projectId: PROJECT_P, observedStatus: 'active', observedAt: T0 },
  }

  it('allows a mission with no decision link when a decision is not the source', async () => {
    const { store, missionId } = await approvedMission()
    const read = await resolveMission(missionId, { store, now: T2, projectMode })
    expect(read.state?.authoritySource?.kind).toBe('founder_instruction')
    expect(read.state?.decisionRef).toBeNull()
    // No decision was consulted at all.
    const authority = await isMissionOperationallyAuthorized(missionId, { store, now: T2, projectMode })
    expect(authority.authorized).toBe(true)
    expect(mockDecision).not.toHaveBeenCalled()
  })

  it('requires the reference when a decision IS the authority source', () => {
    expect(() => buildMissionRecord({
      type: 'proposed', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 0,
      ...COMPLETE_BRIEF, authoritySource: { kind: 'decision_ledger', reference: 'dec-1' },
    })).toThrow(/decision-authority-requires-reference/)
  })

  it('refuses a fabricated decision link when the source is something else', () => {
    expect(() => buildMissionRecord({
      type: 'proposed', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 0,
      ...COMPLETE_BRIEF,
      decisionRef: { decisionId: 'dec-1', decisionVersion: 1, projectId: PROJECT_P, observedStatus: 'active', observedAt: T0 },
    })).toThrow(/decision-reference-requires-decision-authority/)
  })

  it('refuses a foreign-project decision (§6.117)', () => {
    expect(() => buildMissionRecord({
      type: 'proposed', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 0, ...COMPLETE_BRIEF,
      authoritySource: { kind: 'decision_ledger', reference: 'dec-1' },
      decisionRef: { decisionId: 'dec-1', decisionVersion: 1, projectId: PROJECT_Q, observedStatus: 'active', observedAt: T0 },
    })).toThrow(/decision-reference-same-project/)
  })

  it.each([['expired'], ['reversed'], ['superseded']])(
    'blocks operational authority when the governing decision is %s', async (status) => {
      authAs(PRINCIPAL_A, [PROJECT_P])
      authorizationService([])
      activeDecision(PROJECT_P, 'active')
      const store = new FakeStore()
      const opened = await openMission({ projectId: PROJECT_P, ...withDecision, store, now: T0, projectMode })
      const missionId = opened.state!.missionId
      const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A)
      authorizationService([grant])
      expect((await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })).status).toBe('ok')

      // The decision later stops governing. Nothing mutates the ledger.
      activeDecision(PROJECT_P, status)
      const authority = await isMissionOperationallyAuthorized(missionId, { store, now: T2, projectMode })
      expect(authority.authorized).toBe(false)
      expect(authority.reason).toBe('governing_decision_invalid')
      expect(authority.detail).toBe(status)
    })
})

// ── 53–57. Isolation ──────────────────────────────────────────────────────────

describe('Project isolation (§6.117, §20.27)', () => {
  it('refuses to create a mission in a project the principal does not own', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([])
    const store = new FakeStore()
    const result = await openMission({ projectId: PROJECT_Q, ...COMPLETE_BRIEF, store, now: T0, projectMode })
    expect(result.status).toBe('project_denied')
    expect(store.appended).toHaveLength(0)
  })

  it('refuses to read a foreign-project mission', async () => {
    const { store, missionId } = await approvedMission()
    authAs(PRINCIPAL_B, [PROJECT_Q])
    const read = await resolveMission(missionId, { store, now: T2, projectMode })
    expect(read.status).toBe('not_permitted')
    expect(read.state).toBeNull()
  })

  it('refuses to write to a foreign-project mission', async () => {
    const { store, missionId } = await approvedMission()
    authAs(PRINCIPAL_B, [PROJECT_Q])
    authorizationService([])
    const before = store.appended.length
    const result = await pauseMission({ missionId, reason: 'x', store, now: T2, projectMode })
    expect(result.status).toBe('not_permitted')
    expect(store.appended).toHaveLength(before)
  })

  it('makes unknown and foreign indistinguishable — no existence oracle', async () => {
    const { store, missionId } = await approvedMission()
    authAs(PRINCIPAL_B, [PROJECT_Q])
    const foreign = await resolveMission(missionId, { store, now: T2, projectMode })
    const unknown = await resolveMission(newMissionId(), { store, now: T2, projectMode })
    expect(foreign.status).toBe(unknown.status)
    expect(foreign.state).toEqual(unknown.state)
  })

  it('returns nothing for an empty allow-list', async () => {
    const { store } = await approvedMission()
    authAs(PRINCIPAL_A, [])
    expect((await listProjectMissions(PROJECT_P, { store })).status).toBe('project_denied')
    expect((await listMissionsAwaitingApproval(PROJECT_P, { store })).missions).toEqual([])
  })

  it('never persists a mission without a project (§20.244)', () => {
    expect(() => buildMissionRecord({
      type: 'drafted', missionId: 'm-1', projectId: '', principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 0, ...COMPLETE_BRIEF,
    })).toThrow(/project-scope-required/)
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain('project_id          uuid not null references public.projects(id) on delete restrict')
  })

  it('authenticates before it reads the privileged store', () => {
    for (const file of ['principal-write.ts', 'principal-read.ts']) {
      const source = readFileSync(resolve(MISSION_DIR, file), 'utf8')
      expect(source).toContain("import 'server-only'")
      expect(source).toContain('assertProjectAllowed')
      expect(source).not.toMatch(/process\.env\.CRON_SECRET/)
    }
    const write = readFileSync(resolve(MISSION_DIR, 'principal-write.ts'), 'utf8')
    const gate = write.slice(write.indexOf('async function openFor('))
    expect(gate.indexOf('await authenticate()')).toBeLessThan(gate.indexOf('openLineage('))
  })
})

// ── 58–62. Concurrency and ordering ───────────────────────────────────────────

describe('Lifecycle concurrency and deterministic ordering', () => {
  it('counts lifecycle acts, not rows, and excludes annotations', async () => {
    const { store, missionId } = await activatedMission()
    const before = missionLifecycleGenerationOf(await store.lineage(missionId))
    await reportMissionProgress({ missionId, report: { summary: 'Going well', atRisk: false }, store, now: T3, projectMode })
    await recordMissionEvidence({ missionId, evidence: EVIDENCE, store, now: T3, projectMode })
    await reviewMission({ missionId, reviewNote: 'Looks right', store, now: T3, projectMode })
    expect(missionLifecycleGenerationOf(await store.lineage(missionId))).toBe(before)
    for (const type of ['progress_reported', 'evidence_recorded', 'reviewed'] as MissionActType[]) {
      expect(MISSION_LIFECYCLE_ADVANCING.has(type)).toBe(false)
    }
  })

  it('refuses the losing writer when an annotation interleaves two lifecycle acts', async () => {
    const { store, missionId, grants } = await activatedMission()
    const stale = store.snapshot(missionId)
    const aView = frozenReader(store, stale)

    // Writer A prepares a pause from the state it read.
    // A reviewer annotates in between — under a row-count token this would hand
    // the two writers different keys.
    await reportMissionProgress({ missionId, report: { summary: 'Note', atRisk: false }, store, now: T3, projectMode })
    // proposed, approved, dependency_observed, activated, progress_reported
    expect((await store.lineage(missionId))).toHaveLength(5)

    // Writer B pauses first, from the live lineage.
    authorizationService(grants)
    expect((await pauseMission({ missionId, reason: 'Founder review pending.', store, now: T3, projectMode })).status).toBe('ok')

    // Writer A now commits against its stale snapshot — and loses.
    const result = await failMission({ missionId, reason: 'Assumption failed.', store: aView, now: T3, projectMode })
    expect(result.status).toBe('conflict')
    const closes = (await store.lineage(missionId)).filter(r => r.type === 'failed' || r.type === 'paused')
    expect(closes.map(r => r.type)).toEqual(['paused'])
  })

  it('lets two annotations coexist at the same generation', async () => {
    const { store, missionId } = await activatedMission()
    expect((await reportMissionProgress({ missionId, report: { summary: 'one', atRisk: false }, store, now: T3, projectMode })).status).toBe('ok')
    expect((await reportMissionProgress({ missionId, report: { summary: 'two', atRisk: false }, store, now: T3, projectMode })).status).toBe('ok')
    expect(store.rejected).toHaveLength(0)
  })

  it('orders same-millisecond lifecycle acts by generation, not random uuid', () => {
    const base = {
      missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A, ...COMPLETE_BRIEF,
    }
    for (let trial = 0; trial < 100; trial += 1) {
      const drafted = buildMissionRecord({ ...base, type: 'drafted', occurredAt: T1, version: 1, lifecycleGeneration: 0, recordId: randomUUID() })
      const proposal = buildMissionRecord({ ...base, type: 'proposed', occurredAt: T1, version: 1, lifecycleGeneration: 1, recordId: randomUUID() })
      expect(orderMissionRecords([proposal, drafted])[0].type).toBe('drafted')
      expect(deriveMissionState([proposal, drafted], { at: T2 }).status).toBe('awaiting_approval')
    }
  })

  it('keys the serialization index on the lifecycle generation, matching the pure core', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain('(mission_id, lifecycle_generation)')
    expect(sql).toContain('(mission_id, occurred_at, lifecycle_generation, record_id)')
    const from = sql.indexOf('atlas_mission_ledger_one_advance_idx')
    const index = sql.slice(from, from + sql.slice(from).indexOf(';'))
    const listed = [...index.matchAll(/'(\w+)'/g)].map(m => m[1]).sort()
    expect(listed).toEqual([...MISSION_LIFECYCLE_ADVANCING].sort())
    for (const annotation of ['progress_reported', 'blocker_raised', 'blocker_cleared', 'evidence_recorded', 'reviewed']) {
      expect(index).not.toContain(`'${annotation}'`)
    }
  })
})

// ── 63–67. Blockers, at-risk, review; and the no-execution boundary ───────────

describe('Derived predicates and the no-execution boundary', () => {
  it('derives blocked from an explicit unresolved blocker (§20.103, §20.87)', async () => {
    const { store, missionId } = await activatedMission()
    await raiseMissionBlocker({ missionId, blocker: { blockerId: 'b-1', reason: 'Provider unstable' }, store, now: T3, projectMode })
    expect((await resolveMission(missionId, { store, now: T3, projectMode })).state?.status).toBe('blocked')

    await clearMissionBlocker({ missionId, blockerId: 'b-1', store, now: T4, projectMode })
    expect((await resolveMission(missionId, { store, now: T4, projectMode })).state?.status).toBe('active')
  })

  it('derives at_risk once the deadline has passed (§20.104)', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([])
    const store = new FakeStore()
    const opened = await openMission({ projectId: PROJECT_P, ...COMPLETE_BRIEF, deadline: PAST_DEADLINE, store, now: T0, projectMode })
    const missionId = opened.state!.missionId
    const approveGrant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A)
    authorizationService([approveGrant])
    await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })
    await satisfyDependency(store, missionId, T1)
    const activateGrant = await grantFor({ act: 'activate', missionId, store, now: T2, projectMode }, AUTH_B)
    authorizationService([approveGrant, activateGrant])
    // §20.75 — the deadline is already past, so activation is refused outright.
    const blocked = await activateMission({ missionId, authorizationId: AUTH_B, store, now: T2, projectMode })
    expect(blocked.status).toBe('activation_incomplete')
    expect(blocked.missing).toContain('deadline_expired')
  })

  it('derives awaiting_review once evidence is in and no review exists (§20.195)', async () => {
    const { store, missionId } = await activatedMission()
    await recordMissionEvidence({ missionId, evidence: EVIDENCE, store, now: T3, projectMode })
    expect((await resolveMission(missionId, { store, now: T3, projectMode })).state?.status).toBe('awaiting_review')
    await reviewMission({ missionId, reviewNote: 'Reviewed.', store, now: T3, projectMode })
    expect((await resolveMission(missionId, { store, now: T3, projectMode })).state?.status).toBe('active')
  })

  it('pauses and resumes without a NEW authority act, but with valid authority (§20.132, §20.133)', async () => {
    const { store, missionId, grants } = await activatedMission()
    authorizationService(grants)
    expect((await pauseMission({ missionId, reason: 'Founder review pending.', store, now: T3, projectMode })).state?.status).toBe('paused')
    // §20.133 — no new grant is minted; the existing authority must still hold.
    expect((await resumeMission({ missionId, store, now: T4, projectMode })).state?.status).toBe('active')
  })

  it('imports no tool, runner, Manager, workflow or dispatcher anywhere', () => {
    for (const file of ['types.ts', 'derive.ts', 'build.ts', 'binding.ts', 'store.ts', 'principal-write.ts', 'principal-read.ts']) {
      const source = readFileSync(resolve(MISSION_DIR, file), 'utf8')
      expect(source).not.toMatch(
        /ai\/manager|planTasks|manager_tasks|workflow-executor|executeRunSteps|lib\/ai\/runner|runStep|publishArticle|sendEmail|brevo|stripe|atlasActions/)
    }
  })

  it('keeps the pure core free of I/O and clock reads', () => {
    for (const file of ['derive.ts', 'binding.ts']) {
      const source = readFileSync(resolve(MISSION_DIR, file), 'utf8')
      expect(source).not.toMatch(/createAdminClient|supabase|fetch\(|node:fs|new Date\(|Date\.now/)
    }
  })

  it('treats budget as a boundary, never a spending capability (§20.52)', async () => {
    const { store, missionId } = await approvedMission()
    const read = await resolveMission(missionId, { store, now: T2, projectMode })
    expect(read.state?.budget).toEqual({ currency: 'SEK', limitMinor: 500000 })
    // Nothing anywhere in the module can move money.
    for (const file of ['principal-write.ts', 'principal-read.ts', 'store.ts']) {
      const source = readFileSync(resolve(MISSION_DIR, file), 'utf8')
      expect(source).not.toMatch(/charge|invoice|payment|checkout|purchase|billing/i)
    }
  })

  it('treats allowedActions and tools as declarative upper bounds only', async () => {
    const { store, missionId } = await approvedMission()
    const read = await resolveMission(missionId, { store, now: T2, projectMode })
    expect(read.state?.allowedActions.map(a => a.action)).toEqual(['inspect_code', 'run_tests'])
    expect(read.state?.forbiddenActions.map(a => a.action)).toEqual(['publish', 'deploy_production'])
    // §20.57 — an action cannot be both allowed and forbidden.
    expect(() => buildMissionRecord({
      type: 'drafted', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 0, ...COMPLETE_BRIEF,
      allowedActions: [{ action: 'publish' }],
    })).toThrow(/action-not-both-allowed-and-forbidden/)
  })

  it('enables RLS with no policies and no direct anon/authenticated grant', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain('alter table public.atlas_mission_ledger enable row level security')
    expect(sql).toContain('revoke all on public.atlas_mission_ledger from anon, authenticated')
    expect(sql).not.toMatch(/create policy/i)
    expect(sql).not.toMatch(/insert into/i)
  })
})

// ── EI-S1.4B-R1 regressions ───────────────────────────────────────────────────
// Every block below reproduces a defect that shipped in fca07cb and now fails
// closed. Each was confirmed against that head before the fix was written.

describe('R1 — resume must prove current authority in the WRITE boundary (§20.133)', () => {
  async function pausedMission() {
    const { store, missionId, grants } = await activatedMission()
    authorizationService(grants)
    expect((await pauseMission({ missionId, reason: 'Founder review pending.', store, now: T3, projectMode })).state?.status).toBe('paused')
    return { store, missionId, grants }
  }

  it('refuses to resume when the authorization was revoked, appending nothing', async () => {
    const { store, missionId, grants } = await pausedMission()
    authorizationService(grants.map(g => ({ ...g, revoked: true })))
    const before = store.appended.length
    const result = await resumeMission({ missionId, store, now: T4, projectMode })
    expect(result.status).toBe('authority_not_current')
    expect(store.appended).toHaveLength(before)
    expect(store.appended.some(r => r.type === 'resumed')).toBe(false)
  })

  it('refuses to resume when the authorization expired', async () => {
    const { store, missionId, grants } = await pausedMission()
    authorizationService(grants.map(g => ({ ...g, expiresAt: T3 })))
    const result = await resumeMission({ missionId, store, now: T4, projectMode })
    expect(result.status).toBe('authority_not_current')
    expect(result.detail).toContain('expired')
  })

  it('refuses to resume when the governing decision no longer stands', async () => {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([])
    mockDecision.mockResolvedValue({ state: { decisionId: 'dec-1', projectId: PROJECT_P, status: 'active', version: 1 }, lineage: [], status: 'ok' } as never)
    const store = new FakeStore()
    const brief = {
      ...COMPLETE_BRIEF,
      authoritySource: { kind: 'decision_ledger' as const, reference: 'dec-1 v1' },
      decisionRef: { decisionId: 'dec-1', decisionVersion: 1, projectId: PROJECT_P, observedStatus: 'active', observedAt: T0 },
    }
    const opened = await openMission({ projectId: PROJECT_P, ...brief, store, now: T0, projectMode })
    const missionId = opened.state!.missionId
    const approveGrant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A)
    authorizationService([approveGrant])
    await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })
    await satisfyDependency(store, missionId, T1)
    const activateGrant = await grantFor({ act: 'activate', missionId, store, now: T2, projectMode }, AUTH_B)
    authorizationService([approveGrant, activateGrant])
    await activateMission({ missionId, authorizationId: AUTH_B, store, now: T2, projectMode })
    await pauseMission({ missionId, reason: 'Waiting.', store, now: T3, projectMode })

    mockDecision.mockResolvedValue({ state: { decisionId: 'dec-1', projectId: PROJECT_P, status: 'reversed', version: 1 }, lineage: [], status: 'ok' } as never)
    const before = store.appended.length
    const result = await resumeMission({ missionId, store, now: T4, projectMode })
    expect(result.status).toBe('governing_decision_invalid')
    expect(store.appended).toHaveLength(before)
  })

  it('resumes when current authority is still valid', async () => {
    const { store, missionId, grants } = await pausedMission()
    authorizationService(grants)
    const result = await resumeMission({ missionId, store, now: T4, projectMode })
    expect(result.status).toBe('ok')
    expect(result.state?.status).toBe('active')
  })
})

describe('R1 — a passed deadline expires approval (§20.75)', () => {
  const AT_DEADLINE = DEADLINE
  const AFTER_DEADLINE = '2026-09-19T08:00:00.001Z'
  const BEFORE_DEADLINE = '2026-09-19T07:59:59.999Z'

  it.each([
    ['before the deadline', BEFORE_DEADLINE, false],
    ['exactly at the deadline', AT_DEADLINE, false],
    ['after the deadline', AFTER_DEADLINE, true],
  ])('is expired %s = %s', async (_label, at, expired) => {
    const { store, missionId } = await approvedMission()
    await satisfyDependency(store, missionId, T1)
    const authority = await isMissionOperationallyAuthorized(missionId, { store, now: at, projectMode })
    expect(authority.authorized).toBe(!expired)
    if (expired) expect(authority.reason).toBe('deadline_expired')
  })

  it('prevents readiness once the deadline has passed', async () => {
    const { store, missionId } = await approvedMission()
    await satisfyDependency(store, missionId, T1)
    const readiness = await resolveMissionReadiness(missionId, { store, now: AFTER_DEADLINE, projectMode })
    expect(readiness.readiness?.ready).toBe(false)
    expect(readiness.readiness?.missing).toContain('deadline_expired')
  })

  it('prevents activation once the deadline has passed, appending nothing', async () => {
    const { store, missionId, grant } = await approvedMission()
    await satisfyDependency(store, missionId, T1)
    const activateGrant = await grantFor({ act: 'activate', missionId, store, now: T2, projectMode }, AUTH_B)
    authorizationService([grant, activateGrant])
    const before = store.appended.length
    const result = await activateMission({ missionId, authorizationId: AUTH_B, store, now: AFTER_DEADLINE, projectMode })
    expect(result.status).toBe('activation_incomplete')
    expect(result.missing).toContain('deadline_expired')
    expect(store.appended).toHaveLength(before)
  })

  it('prevents resume once the deadline has passed', async () => {
    const { store, missionId, grants } = await activatedMission()
    authorizationService(grants)
    await pauseMission({ missionId, reason: 'Waiting.', store, now: T3, projectMode })
    const result = await resumeMission({ missionId, store, now: AFTER_DEADLINE, projectMode })
    expect(result.status).toBe('activation_incomplete')
    expect(result.missing).toContain('deadline_expired')
  })

  it('prevents approval of a mission whose deadline already passed', async () => {
    const { store, missionId } = await proposedMission()
    const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A)
    authorizationService([grant])
    const before = store.appended.length
    const result = await approveMission({ missionId, authorizationId: AUTH_A, store, now: AFTER_DEADLINE, projectMode })
    expect(result.status).toBe('deadline_expired')
    expect(store.appended).toHaveLength(before)
  })
})

describe('R1 — project mode change expires approval (§20.75)', () => {
  it('snapshots the mode on the authority act', async () => {
    const { store, missionId } = await approvedMission()
    expect(store.appended.find(r => r.type === 'approved')!.projectMode).toBe('active')
  })

  it('stops authorizing once the project mode changes', async () => {
    const { store, missionId } = await approvedMission()
    await satisfyDependency(store, missionId, T1)
    expect((await isMissionOperationallyAuthorized(missionId, { store, now: T2, projectMode })).authorized).toBe(true)

    currentProjectMode = 'observer'
    const authority = await isMissionOperationallyAuthorized(missionId, { store, now: T2, projectMode })
    expect(authority.authorized).toBe(false)
    expect(authority.reason).toBe('project_mode_changed')
    expect(authority.detail).toBe('active->observer')
  })

  it('blocks activation after a project-mode change, appending nothing', async () => {
    const { store, missionId, grant } = await approvedMission()
    await satisfyDependency(store, missionId, T1)
    const activateGrant = await grantFor({ act: 'activate', missionId, store, now: T2, projectMode }, AUTH_B)
    authorizationService([grant, activateGrant])
    currentProjectMode = 'hibernate'
    const before = store.appended.length
    const result = await activateMission({ missionId, authorizationId: AUTH_B, store, now: T2, projectMode })
    expect(result.status).toBe('project_mode_changed')
    expect(store.appended).toHaveLength(before)
  })

  it('fails closed when the project mode cannot be read', async () => {
    const { store, missionId } = await approvedMission()
    await satisfyDependency(store, missionId, T1)
    const unreadable = async () => { throw new Error('db down') }
    const authority = await isMissionOperationallyAuthorized(missionId, { store, now: T2, projectMode: unreadable })
    expect(authority.authorized).toBe(false)
    expect(authority.reason).toBe('project_mode_changed')
    expect(authority.detail).toBe('unreadable')
  })

  it('does not bind the mode into the authorization hash', () => {
    const base = buildMissionRecord({
      type: 'approved', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 1, ...COMPLETE_BRIEF, projectMode: 'active',
      authorityRecord: { authorizationId: 'x', principalId: PRINCIPAL_A, actionKind: 'mission.approve', boundVersionHash: 'h', authorityActAt: T0 },
    })
    expect(JSON.stringify(missionBoundProjection({ ...base, projectMode: 'observer' })))
      .toBe(JSON.stringify(missionBoundProjection(base)))
  })
})

describe('R1 — governing Decision is proven exactly, and before any append (§20.137)', () => {
  const withDecision = (version = 1) => ({
    ...COMPLETE_BRIEF,
    authoritySource: { kind: 'decision_ledger' as const, reference: `dec-1 v${version}` },
    decisionRef: { decisionId: 'dec-1', decisionVersion: version, projectId: PROJECT_P, observedStatus: 'active', observedAt: T0 },
  })

  async function missionOnDecision(version = 1) {
    authAs(PRINCIPAL_A, [PROJECT_P])
    authorizationService([])
    mockDecision.mockResolvedValue({ state: { decisionId: 'dec-1', projectId: PROJECT_P, status: 'active', version }, lineage: [], status: 'ok' } as never)
    const store = new FakeStore()
    const opened = await openMission({ projectId: PROJECT_P, ...withDecision(version), store, now: T0, projectMode })
    return { store, missionId: opened.state!.missionId }
  }

  it('refuses when the current decision version drifted from the pinned one', async () => {
    const { store, missionId } = await missionOnDecision(1)
    const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A)
    authorizationService([grant])
    await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })

    // §11.62 — a material amendment makes N+1 a different commitment.
    mockDecision.mockResolvedValue({ state: { decisionId: 'dec-1', projectId: PROJECT_P, status: 'active', version: 2 }, lineage: [], status: 'ok' } as never)
    const authority = await isMissionOperationallyAuthorized(missionId, { store, now: T2, projectMode })
    expect(authority.authorized).toBe(false)
    expect(authority.reason).toBe('governing_decision_invalid')
    expect(authority.detail).toBe('version_drift:1->2')
  })

  it('refuses to APPROVE against a nonexistent decision, appending nothing', async () => {
    const { store, missionId } = await missionOnDecision(1)
    mockDecision.mockResolvedValue({ state: null, lineage: [], status: 'not_permitted' } as never)
    const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A)
    authorizationService([grant])
    const before = store.appended.length
    const result = await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })
    expect(result.status).toBe('governing_decision_invalid')
    expect(result.detail).toBe('unknown_or_foreign')
    expect(store.appended).toHaveLength(before)
    expect(store.appended.some(r => r.type === 'approved')).toBe(false)
  })

  it('ignores a forged same-project decisionRef and uses the decision’s own scope', async () => {
    const { store, missionId } = await missionOnDecision(1)
    // The reference CLAIMS project P; the decision itself belongs to Q.
    mockDecision.mockResolvedValue({ state: { decisionId: 'dec-1', projectId: PROJECT_Q, status: 'active', version: 1 }, lineage: [], status: 'ok' } as never)
    const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A)
    authorizationService([grant])
    const result = await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })
    expect(result.status).toBe('governing_decision_invalid')
    // Foreign and unknown deny identically — no cross-project oracle.
    expect(result.detail).toBe('unknown_or_foreign')
    expect(store.appended.some(r => r.type === 'approved')).toBe(false)
  })

  it.each([['rejected'], ['deferred'], ['expired'], ['reversed'], ['superseded']])(
    'refuses to approve against a %s decision before any append', async (status) => {
      const { store, missionId } = await missionOnDecision(1)
      mockDecision.mockResolvedValue({ state: { decisionId: 'dec-1', projectId: PROJECT_P, status, version: 1 }, lineage: [], status: 'ok' } as never)
      const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A)
      authorizationService([grant])
      const before = store.appended.length
      const result = await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })
      expect(result.status).toBe('governing_decision_invalid')
      expect(result.detail).toBe(status)
      expect(store.appended).toHaveLength(before)
    })

  it('refuses to ACTIVATE once the decision stops governing, appending nothing', async () => {
    const { store, missionId } = await missionOnDecision(1)
    const grant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode }, AUTH_A)
    authorizationService([grant])
    await approveMission({ missionId, authorizationId: AUTH_A, store, now: T1, projectMode })
    await satisfyDependency(store, missionId, T1)
    const activateGrant = await grantFor({ act: 'activate', missionId, store, now: T2, projectMode }, AUTH_B)
    authorizationService([grant, activateGrant])

    mockDecision.mockResolvedValue({ state: { decisionId: 'dec-1', projectId: PROJECT_P, status: 'expired', version: 1 }, lineage: [], status: 'ok' } as never)
    const before = store.appended.length
    const result = await activateMission({ missionId, authorizationId: AUTH_B, store, now: T2, projectMode })
    expect(result.status).toBe('governing_decision_invalid')
    expect(store.appended).toHaveLength(before)
    expect(store.appended.some(r => r.type === 'activated')).toBe(false)
  })
})

describe('R1 — approval gates must be resolved, not merely declared (§20.73, §20.92)', () => {
  it('is an append-only annotation that consumes no lifecycle generation', async () => {
    const { store, missionId } = await activatedMission()
    const before = missionLifecycleGenerationOf(await store.lineage(missionId))
    const result = await resolveMissionGate({
      missionId, resolution: { gateId: 'gate-publish', outcome: 'approve' }, store, now: T3, projectMode,
    })
    expect(result.status).toBe('ok')
    expect(missionLifecycleGenerationOf(await store.lineage(missionId))).toBe(before)
    expect(MISSION_LIFECYCLE_ADVANCING.has('gate_resolved' as MissionActType)).toBe(false)
    // Append-only: the store offers no update or delete path at all.
    expect(readFileSync(resolve(MISSION_DIR, 'store.ts'), 'utf8')).not.toMatch(/\.update\(|\.delete\(/)
  })

  it('refuses a resolution naming a gate the mission never declared', async () => {
    const { store, missionId } = await activatedMission()
    const result = await resolveMissionGate({
      missionId, resolution: { gateId: 'no-such-gate', outcome: 'approve' }, store, now: T3, projectMode,
    })
    expect(result.status).toBe('invalid_lifecycle')
    expect(result.detail).toContain('gate-resolution-declared')
  })

  it('refuses completion while a declared gate is unresolved (§20.92)', async () => {
    const { store, missionId } = await activatedMission()
    await recordMissionEvidence({ missionId, evidence: EVIDENCE, store, now: T3, projectMode })
    await reviewMission({ missionId, reviewNote: 'Reviewed.', store, now: T3, projectMode })
    const before = store.appended.length
    const result = await closeMission({ missionId, closure: CLOSURE, store, now: T4, projectMode })
    expect(result.status).toBe('completion_incomplete')
    expect(result.detail).toContain('gate_unresolved:gate-publish')
    expect(store.appended).toHaveLength(before)
  })

  it('blocks a mission whose gate was rejected, and refuses completion', async () => {
    const { store, missionId } = await activatedMission()
    await resolveMissionGate({
      missionId, resolution: { gateId: 'gate-publish', outcome: 'reject', note: 'Not safe yet.' },
      store, now: T3, projectMode,
    })
    // §20.73 — a blocking outcome stops the mission (§20.103).
    expect((await resolveMission(missionId, { store, now: T3, projectMode })).state?.status).toBe('blocked')

    await recordMissionEvidence({ missionId, evidence: EVIDENCE, store, now: T3, projectMode })
    await reviewMission({ missionId, reviewNote: 'Reviewed.', store, now: T3, projectMode })
    const result = await closeMission({ missionId, closure: CLOSURE, store, now: T4, projectMode })
    expect(result.status).toBe('completion_incomplete')
    expect(result.detail).toContain('gate_blocked:gate-publish')
  })

  it('permits completion once the gate is resolved as approved', async () => {
    const { store, missionId } = await activatedMission()
    await recordMissionEvidence({ missionId, evidence: EVIDENCE, store, now: T3, projectMode })
    await reviewMission({ missionId, reviewNote: 'Reviewed.', store, now: T3, projectMode })
    await resolveMissionGate({
      missionId, resolution: { gateId: 'gate-publish', outcome: 'approve' }, store, now: T3, projectMode,
    })
    const result = await closeMission({ missionId, closure: CLOSURE, store, now: T4, projectMode })
    expect(result.status).toBe('ok')
    expect(result.state?.status).toBe('completed')
  })
})

describe('R1 — dependency definition vs observation (§20.101)', () => {
  it('does not require a material amendment to record false→true', async () => {
    const { store, missionId } = await approvedMission()
    const versionBefore = (await resolveMission(missionId, { store, now: T1, projectMode })).state!.version
    const result = await observeMissionDependency({
      missionId, observation: { reference: 'isolation-primitives', satisfied: true, evidence: 'run-1' },
      store, now: T1, projectMode,
    })
    expect(result.status).toBe('ok')
    // Same version, same approval, no fresh authority demanded.
    expect(result.state?.version).toBe(versionBefore)
    expect(result.state?.approvedAt).toBe(T1)
    expect(store.appended.some(r => r.type === 'amended')).toBe(false)
    expect(result.state?.dependencyState.find(d => d.reference === 'isolation-primitives')?.satisfied).toBe(true)
  })

  it('leaves the authorization-bound hash untouched', () => {
    const base = buildMissionRecord({
      type: 'approved', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 1, ...COMPLETE_BRIEF,
      authorityRecord: { authorizationId: 'x', principalId: PRINCIPAL_A, actionKind: 'mission.approve', boundVersionHash: 'h', authorityActAt: T0 },
    })
    const withObservation = {
      ...base,
      dependencyObservation: { reference: 'isolation-primitives', satisfied: true },
    }
    expect(JSON.stringify(missionBoundProjection(withObservation as never)))
      .toBe(JSON.stringify(missionBoundProjection(base)))
  })

  it('DOES require a material amendment to change the dependency itself', () => {
    const base = buildMissionRecord({
      type: 'approved', missionId: 'm-1', projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T0, version: 1, lifecycleGeneration: 1, ...COMPLETE_BRIEF,
      authorityRecord: { authorizationId: 'x', principalId: PRINCIPAL_A, actionKind: 'mission.approve', boundVersionHash: 'h', authorityActAt: T0 },
    })
    const replaced = {
      ...base,
      dependencies: [{ kind: 'capability' as const, reference: 'something-else', hardness: 'hard' as const }],
    }
    expect(JSON.stringify(missionBoundProjection(replaced)))
      .not.toBe(JSON.stringify(missionBoundProjection(base)))
  })

  it('consumes no lifecycle generation and refuses an undeclared reference', async () => {
    const { store, missionId } = await activatedMission()
    const before = missionLifecycleGenerationOf(await store.lineage(missionId))
    await observeMissionDependency({
      missionId, observation: { reference: 'isolation-primitives', satisfied: false }, store, now: T3, projectMode,
    })
    expect(missionLifecycleGenerationOf(await store.lineage(missionId))).toBe(before)
    expect(MISSION_LIFECYCLE_ADVANCING.has('dependency_observed' as MissionActType)).toBe(false)

    const bogus = await observeMissionDependency({
      missionId, observation: { reference: 'never-declared', satisfied: true }, store, now: T3, projectMode,
    })
    expect(bogus.status).toBe('invalid_lifecycle')
    expect(bogus.detail).toContain('dependency-observation-declared')
  })
})

describe('R1 — supersession successor integrity (§20.97)', () => {
  async function successorIn(store: FakeStore, project: string, close?: 'cancel' | 'draft') {
    const opened = await openMission({
      projectId: project, ...COMPLETE_BRIEF, asDraft: close === 'draft', store, now: T1, projectMode,
    })
    return opened.state!.missionId
  }

  async function attempt(store: FakeStore, missionId: string, successor: string, now = T2) {
    const grant = await grantFor({ act: 'supersede', missionId, supersededBy: successor, store, now, projectMode }, AUTH_B)
    authorizationService([grant])
    return supersedeMission({ missionId, supersededBy: successor, authorizationId: AUTH_B, store, now, projectMode })
  }

  it('refuses a nonexistent successor', async () => {
    const { store, missionId } = await approvedMission()
    const result = await attempt(store, missionId, newMissionId())
    expect(result.status).toBe('invalid_successor')
    expect(store.appended.some(r => r.type === 'superseded')).toBe(false)
  })

  it('refuses a foreign-project successor, identically to an unknown one', async () => {
    const { store, missionId } = await approvedMission()
    authAs(PRINCIPAL_A, [PROJECT_P, PROJECT_Q])
    const foreign = await attempt(store, missionId, await successorIn(store, PROJECT_Q))
    const unknown = await attempt(store, missionId, newMissionId())
    expect(foreign.status).toBe('invalid_successor')
    expect(foreign.detail).toBe(unknown.detail)
  })

  it('refuses a draft successor — a draft grants nothing (§20.99)', async () => {
    const { store, missionId } = await approvedMission()
    const result = await attempt(store, missionId, await successorIn(store, PROJECT_P, 'draft'))
    expect(result.status).toBe('invalid_successor')
  })

  it('refuses a cancelled successor', async () => {
    const { store, missionId } = await approvedMission()
    const successor = await successorIn(store, PROJECT_P)
    const cancelGrant = await grantFor({ act: 'cancel', missionId: successor, reason: 'Dropped.', store, now: T1, projectMode }, AUTH_A)
    authorizationService([cancelGrant])
    await cancelMission({ missionId: successor, authorizationId: AUTH_A, reason: 'Dropped.', store, now: T1, projectMode })
    const result = await attempt(store, missionId, successor)
    expect(result.status).toBe('invalid_successor')
  })

  it('refuses superseding a mission by itself', async () => {
    const { store, missionId } = await approvedMission()
    const result = await attempt(store, missionId, missionId)
    expect(result.status).toBe('invalid_successor')
    expect(result.detail).toBe('self')
  })

  it('refuses a two-node cycle: A → B where B → A', async () => {
    const { store, missionId } = await approvedMission()
    const b = await successorIn(store, PROJECT_P)
    // B is already superseded by A.
    await store.append(buildMissionRecord({
      type: 'superseded', missionId: b, projectId: PROJECT_P, principalId: PRINCIPAL_A,
      occurredAt: T1, version: 1, lifecycleGeneration: 1, ...COMPLETE_BRIEF,
      supersededBy: missionId, reason: 'Replaced.',
      authorityRecord: { authorizationId: AUTH_A, principalId: PRINCIPAL_A, actionKind: 'mission.supersede', boundVersionHash: 'h', authorityActAt: T1 },
    }))
    const result = await attempt(store, missionId, b, T3)
    expect(result.status).toBe('invalid_successor')
    expect(result.detail).toBe('cycle')
  })

  it('refuses a three-node cycle: A → B → C → A', async () => {
    const { store, missionId } = await approvedMission()
    const b = await successorIn(store, PROJECT_P)
    const c = await successorIn(store, PROJECT_P)
    for (const [from, to] of [[b, c], [c, missionId]] as const) {
      await store.append(buildMissionRecord({
        type: 'superseded', missionId: from, projectId: PROJECT_P, principalId: PRINCIPAL_A,
        occurredAt: T1, version: 1, lifecycleGeneration: 1, ...COMPLETE_BRIEF,
        supersededBy: to, reason: 'Replaced.',
        authorityRecord: { authorizationId: AUTH_A, principalId: PRINCIPAL_A, actionKind: 'mission.supersede', boundVersionHash: 'h', authorityActAt: T1 },
      }))
    }
    const result = await attempt(store, missionId, b, T3)
    expect(result.status).toBe('invalid_successor')
    expect(result.detail).toBe('cycle')
  })

  it('accepts a real, acyclic, same-project successor', async () => {
    const { store, missionId } = await approvedMission()
    const successor = await successorIn(store, PROJECT_P)
    const result = await attempt(store, missionId, successor)
    expect(result.status).toBe('ok')
    expect(result.state?.supersededBy).toBe(successor)
  })
})

describe('R1 — one unambiguous public evaluation surface', () => {
  it('never reports active and unauthorized without saying blocked', async () => {
    const { store, missionId, grants } = await activatedMission()
    authorizationService(grants.map(g => ({ ...g, revoked: true })))
    const { evaluation } = await resolveMissionEvaluation(missionId, { store, now: T3, projectMode })
    // The immutable record still says the mission was activated…
    expect(evaluation?.lifecycleStatus).toBe('active')
    // …but the status a human is shown is unambiguous.
    expect(evaluation?.effectiveStatus).toBe('blocked')
    expect(evaluation?.authority.authorized).toBe(false)
    expect(evaluation?.readiness.ready).toBe(false)
  })

  it('surfaces `ready` — a status no persisted act can produce', async () => {
    const { store, missionId } = await approvedMission()
    await satisfyDependency(store, missionId, T1)
    const { evaluation } = await resolveMissionEvaluation(missionId, { store, now: T1, projectMode })
    expect(evaluation?.lifecycleStatus).toBe('approved')
    expect(evaluation?.effectiveStatus).toBe('ready')
    expect(evaluation?.readiness.ready).toBe(true)
    expect(MISSION_LIFECYCLE_ADVANCING.has('ready' as MissionActType)).toBe(false)
  })

  it('is honest about what Stage 1 does not verify', async () => {
    const { store, missionId } = await approvedMission()
    await satisfyDependency(store, missionId, T1)
    const { evaluation } = await resolveMissionEvaluation(missionId, { store, now: T1, projectMode })
    // §20.101 asks for available tools; Stage 1 can only prove they are declared.
    expect(evaluation?.readiness.unverified).toEqual(['tool_availability', 'data_availability'])
  })

  it('agrees with the focused accessors', async () => {
    const { store, missionId } = await approvedMission()
    await satisfyDependency(store, missionId, T1)
    const { evaluation } = await resolveMissionEvaluation(missionId, { store, now: T1, projectMode })
    const readiness = await resolveMissionReadiness(missionId, { store, now: T1, projectMode })
    const authority = await isMissionOperationallyAuthorized(missionId, { store, now: T1, projectMode })
    expect(readiness.readiness).toEqual(evaluation?.readiness)
    expect(authority.authorized).toBe(evaluation?.authority.authorized)
  })
})
