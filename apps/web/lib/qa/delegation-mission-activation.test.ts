/**
 * EI-S1.4C-R1 — Manager acceptance AS the Mission's availability proof.
 *
 * THE CHAIN, END TO END, WITH NOTHING FAKED IN THE MIDDLE. Unlike the main
 * delegation suite, this file does NOT mock `resolveMissionEvaluation`: the real
 * Mission write boundary, the real Mission derivation, the real delegation
 * boundary and the real attenuation core all run against in-memory stores. Only
 * the three genuine external seams are doubled — session, Authorization V1 and
 * the Decision Ledger — and the Authorization double is faithful, answering
 * `effective` only for the exact project, target, version hash and action it
 * was granted for.
 *
 * What it proves:
 *
 *     Approved Mission
 *       + accepted CURRENT Delegation Envelope
 *       + delegation-derived availability proof
 *       + a SEPARATE mission.activate Authorization V1 proof
 *       → activation may pass
 *
 * and, independently, that removing any one of those leaves the Mission
 * inactive — including the case that matters most: Manager acceptance alone
 * never appends a Mission `activated` act.
 *
 * No database, no network, no credentials, no execution.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/project-access', () => ({ resolveProjectAccess: vi.fn() }))
vi.mock('@/lib/atlas/authorization/principal-read', () => ({ isAuthorizationEffective: vi.fn() }))
vi.mock('@/lib/atlas/decision-ledger/principal-read', () => ({ resolveDecision: vi.fn() }))

import { resolveProjectAccess } from '@/lib/auth/project-access'
import { isAuthorizationEffective } from '@/lib/atlas/authorization/principal-read'
import { resolveDecision } from '@/lib/atlas/decision-ledger/principal-read'

import {
  activateMission,
  amendMission,
  approveMission,
  observeMissionDependency,
  openMission,
  prepareMissionAct,
} from '@/lib/atlas/mission/principal-write'
import type { MissionLedgerStore } from '@/lib/atlas/mission/store'
import type { MissionRecord } from '@/lib/atlas/mission/types'
import { MISSION_LIFECYCLE_ADVANCING } from '@/lib/atlas/mission/derive'
import { unprovenAvailability, type MissionCapabilityAvailability } from '@/lib/atlas/mission/capability'

import { decideDelegation, prepareDelegation, revokeDelegation } from '@/lib/atlas/delegation/principal-write'
import { availabilityFromAcceptedDelegation, envelopeCovers } from '@/lib/atlas/delegation/mission-availability'
import { registryAvailability } from '@/lib/atlas/delegation/availability'
import type { DelegationLedgerStore } from '@/lib/atlas/delegation/store'
import type { DelegationRecord } from '@/lib/atlas/delegation/types'

const PRINCIPAL_A = '11111111-1111-4111-8111-111111111111'
const PROJECT_P = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AUTH_APPROVE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const AUTH_ACTIVATE = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const AUTH_AMEND = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const T0 = '2026-08-20T08:00:00.000Z'
const T1 = '2026-08-20T09:00:00.000Z'
const T2 = '2026-08-20T10:00:00.000Z'
const T3 = '2026-08-20T11:00:00.000Z'
const DEADLINE = '2026-09-20T08:00:00.000Z'

/**
 * A brief whose capabilities are the interesting case: TWO tools, so a narrowed
 * envelope can cover one and not the other, and read-only data on registered
 * domains so the registry can genuinely prove the data half.
 */
const BRIEF = {
  title: 'Bounded trial',
  missionType: 'autonomy' as const,
  executiveOwner: 'project-executive:the-prompt',
  missionOwner: 'manager:the-prompt',
  objective: 'Make the short-news workflow safe enough for a bounded trial.',
  strategicContext: 'First autonomy proving ground.',
  expectedOutcome: 'A validated short-news path with approval retained.',
  deliverables: ['Validation report'],
  successCriteria: [{ criterion: 'Isolation validated', level: 'minimum' as const }],
  inScope: ['short-news workflow'],
  outOfScope: ['newsletter sending'],
  constraints: [{ kind: 'governance' as const, statement: 'Sending stays approval-gated.' }],
  budget: { currency: 'SEK', limitMinor: 500000 },
  authority: [{ action: 'prepare' }],
  authoritySource: { kind: 'founder_instruction' as const, reference: 'EI-S1.4C owner ruling' },
  allowedActions: [{ action: 'inspect_code' }, { action: 'run_tests' }],
  forbiddenActions: [{ action: 'publish' }],
  tools: [{ tool: 'repo_read', restriction: 'apps/web only' }, { tool: 'test_runner' }],
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

class MissionStore implements MissionLedgerStore {
  appended: MissionRecord[] = []
  constructor(private rows: MissionRecord[] = []) {}
  async append(r: MissionRecord) {
    if (MISSION_LIFECYCLE_ADVANCING.has(r.type)) {
      const clash = this.rows.some(x =>
        MISSION_LIFECYCLE_ADVANCING.has(x.type) && x.missionId === r.missionId
        && x.lifecycleGeneration === r.lifecycleGeneration)
      if (clash) throw new Error('duplicate key value violates unique constraint (23505)')
    }
    this.appended.push(r); this.rows.push(r); return r
  }
  async lineage(id: string) { return this.rows.filter(r => r.missionId === id) }
  async byProject(p: string) { return this.rows.filter(r => r.projectId === p) }
}

class DelegationStore implements DelegationLedgerStore {
  appended: DelegationRecord[] = []
  constructor(private rows: DelegationRecord[] = []) {}
  async append(r: DelegationRecord) { this.appended.push(r); this.rows.push(r); return r }
  async lineage(id: string) { return this.rows.filter(r => r.envelopeId === id) }
  async byProject(p: string) { return this.rows.filter(r => r.projectId === p) }
  async byMission(m: string) { return this.rows.filter(r => r.missionId === m) }
}

const projectMode = async () => 'active'

/**
 * A stand-in for a future real tool registry.
 *
 * Deliberately explicit rather than "everything is available": it proves the
 * two tools this brief declares and nothing else, and the data half still goes
 * through the shipped `registryAvailability`. A blanket true here would make
 * every coverage test below vacuous.
 */
const toolKey = (t: { tool: string; restriction?: string | null }) => `${t.tool} ${t.restriction ?? ''}`
// Derived from the brief rather than hand-written, so the key format can never
// drift from the one attenuation and coverage use.
const KNOWN_TOOLS = new Set(BRIEF.tools.map(toolKey))
const toolRegistrySource: MissionCapabilityAvailability = async query => {
  const data = await registryAvailability(query)
  const missing = query.tools.filter(t => !KNOWN_TOOLS.has(toolKey(t)))
  return {
    tools: missing.length === 0,
    data: data.data,
    unavailable: [...missing.map(t => t.tool), ...(data.unavailable ?? [])],
  }
}

interface Grant {
  id: string
  projectId: string
  target: { targetType: string; targetId: string; versionHash: string }
  actionKind: string
  principalId: string
}

function authorizationService(grants: Grant[]) {
  vi.mocked(isAuthorizationEffective).mockImplementation(async (id, query = {}) => {
    const grant = grants.find(g => g.id === id)
    if (!grant) return { effective: false, reason: 'not_yet_decided', state: null, status: 'not_permitted' } as never
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

async function grantFor(act: Parameters<typeof prepareMissionAct>[0], id: string): Promise<Grant> {
  const { binding, status, detail } = await prepareMissionAct(act)
  expect(`${status}${detail ? `:${detail}` : ''}`).toBe('ok')
  return {
    id, projectId: binding!.projectId, target: binding!.target,
    actionKind: binding!.actionKind, principalId: PRINCIPAL_A,
  }
}

/** An APPROVED mission with its hard dependency observed. Not yet active. */
async function approvedMission(
  availability: MissionCapabilityAvailability = unprovenAvailability,
  /**
   * §20.137 — when set, the mission is governed by a Decision Ledger entry
   * rather than a founder instruction, so `evaluateGoverningDecision` actually
   * runs. The default brief is founder-authorized, and a decision-invalidation
   * test against it would prove nothing.
   */
  governed = false,
) {
  const store = new MissionStore()
  authorizationService([])
  const brief = governed
    ? {
      ...BRIEF,
      authoritySource: { kind: 'decision_ledger' as const, reference: 'dec-1' },
      decisionRef: { decisionId: 'dec-1', decisionVersion: 1 },
    }
    : BRIEF
  const opened = await openMission({ projectId: PROJECT_P, ...brief, store, now: T0, projectMode, availability })
  expect(opened.status).toBe('ok')
  const missionId = opened.state!.missionId

  const approveGrant = await grantFor({ act: 'approve', missionId, store, now: T1, projectMode, availability }, AUTH_APPROVE)
  authorizationService([approveGrant])
  const approved = await approveMission({ missionId, authorizationId: AUTH_APPROVE, store, now: T1, projectMode, availability })
  expect(`${approved.status}${approved.detail ? `:${approved.detail}` : ''}`).toBe('ok')

  const observed = await observeMissionDependency({
    missionId, observation: { reference: 'isolation-primitives', satisfied: true, evidence: 'run-1' },
    store, now: T1, projectMode, availability,
  })
  expect(observed.status).toBe('ok')

  return { store, missionId, approveGrant }
}

/** Prepare + decide a delegation for a mission, returning the envelope id. */
async function acceptedDelegation(
  missionStore: MissionStore,
  missionId: string,
  delegationStore: DelegationStore,
  narrowing?: Parameters<typeof prepareDelegation>[0]['narrowing'],
) {
  const mission = { store: missionStore, projectMode, availability: toolRegistrySource }
  const prep = await prepareDelegation({ missionId, narrowing, store: delegationStore, now: T1, mission })
  expect(`${prep.status}${prep.detail ? `:${prep.detail}` : ''}`).toBe('ok')
  const envelopeId = prep.state!.envelopeId
  const decided = await decideDelegation({ envelopeId, store: delegationStore, now: T2, mission })
  return { envelopeId, decided }
}

/**
 * Try to activate, using whatever availability proof is supplied.
 *
 * The APPROVE grant stays in the authorization service alongside the activate
 * grant, deliberately. A delegation-derived proof re-reads the live Mission, and
 * a Mission whose approval authority stopped being effective is not
 * operationally authorized — so dropping the approve grant here would make every
 * activation fail for the wrong reason and hide what these tests are checking.
 */
async function tryActivate(
  store: MissionStore,
  missionId: string,
  availability: MissionCapabilityAvailability,
  standing: Grant[] = [],
  now = T3,
) {
  const grant = await grantFor({ act: 'activate', missionId, store, now, projectMode, availability }, AUTH_ACTIVATE)
  authorizationService([...standing, grant])
  return activateMission({ missionId, authorizationId: AUTH_ACTIVATE, store, now, projectMode, availability })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(resolveProjectAccess).mockResolvedValue({
    ok: true, userId: PRINCIPAL_A, allowedProjectIds: [PROJECT_P],
  } as never)
  vi.mocked(resolveDecision).mockResolvedValue({
    state: { decisionId: 'dec-1', projectId: PROJECT_P, status: 'active', version: 1 }, lineage: [], status: 'ok',
  } as never)
})

// ── The chain ──────────────────────────────────────────────────────────────

describe('Mission activation through an accepted Delegation', () => {
  it('ACTIVATES with an accepted current delegation plus a separate activate authorization', async () => {
    const { store, missionId, approveGrant } = await approvedMission()
    const delegations = new DelegationStore()
    const { envelopeId, decided } = await acceptedDelegation(store, missionId, delegations)
    expect(decided.state!.status).toBe('accepted')

    const proof = availabilityFromAcceptedDelegation(envelopeId, {
      store: delegations,
      mission: { store, projectMode, availability: toolRegistrySource },
      source: toolRegistrySource,
    })
    const activated = await tryActivate(store, missionId, proof, [approveGrant])
    expect(`${activated.status}${activated.detail ? `:${activated.detail}` : ''}`).toBe('ok')
    expect(activated.state!.status).toBe('active')
  })

  it('stays INACTIVE with no delegation at all', async () => {
    const { store, missionId, approveGrant } = await approvedMission()
    const activated = await tryActivate(store, missionId, unprovenAvailability, [approveGrant])
    expect(activated.status).toBe('activation_incomplete')
    expect(activated.missing).toContain('tool_availability')
    expect(activated.missing).toContain('data_availability')
    expect(store.appended.some(r => r.type === 'activated')).toBe(false)
  })

  it('stays INACTIVE once the accepted delegation is revoked', async () => {
    const { store, missionId, approveGrant } = await approvedMission()
    const delegations = new DelegationStore()
    const { envelopeId } = await acceptedDelegation(store, missionId, delegations)
    const mission = { store, projectMode, availability: toolRegistrySource }

    const revoked = await revokeDelegation({
      envelopeId, reason: 'executive_withdrew', store: delegations, now: T2, mission,
    })
    expect(revoked.state!.status).toBe('revoked')

    const proof = availabilityFromAcceptedDelegation(envelopeId, { store: delegations, mission, source: toolRegistrySource })
    const activated = await tryActivate(store, missionId, proof, [approveGrant])
    expect(activated.status).toBe('activation_incomplete')
    expect(store.appended.some(r => r.type === 'activated')).toBe(false)
  })

  it('stays INACTIVE once the mission is amended past the pinned version', async () => {
    const { store, missionId } = await approvedMission()
    const delegations = new DelegationStore()
    const { envelopeId } = await acceptedDelegation(store, missionId, delegations)
    const mission = { store, projectMode, availability: toolRegistrySource }

    // §20.126 — a material amendment creates version 2 and expires approval.
    const amendGrant = await grantFor({
      act: 'amend', missionId, objective: 'A materially different objective.',
      reason: 'scope change',
      store, now: T2, projectMode, availability: toolRegistrySource,
    }, AUTH_AMEND)
    authorizationService([amendGrant])
    const amended = await amendMission({
      missionId, authorizationId: AUTH_AMEND, objective: 'A materially different objective.',
      reason: 'scope change', store, now: T2, projectMode, availability: toolRegistrySource,
    })
    expect(`${amended.status}${amended.detail ? `:${amended.detail}` : ''}`).toBe('ok')
    expect(amended.state!.version).toBe(2)

    const proof = availabilityFromAcceptedDelegation(envelopeId, { store: delegations, mission, source: toolRegistrySource })
    // The v1 acceptance must not carry into v2.
    const answer = await proof({
      projectId: PROJECT_P, missionId, missionVersion: 2,
      tools: BRIEF.tools, dataScope: BRIEF.dataScope,
    })
    expect(answer.tools).toBe(false)
    expect(answer.data).toBe(false)
  })

  it('Manager acceptance alone appends ZERO mission records', async () => {
    const { store, missionId } = await approvedMission()
    const before = store.appended.length
    const delegations = new DelegationStore()
    await acceptedDelegation(store, missionId, delegations)
    // The delegation ledger got two rows; the mission ledger got none.
    expect(delegations.appended.length).toBe(2)
    expect(store.appended.length).toBe(before)
    expect(store.appended.some(r => r.type === 'activated')).toBe(false)
  })

  it('the activate authorization is SEPARATE — acceptance does not substitute for it', async () => {
    const { store, missionId, approveGrant } = await approvedMission()
    const delegations = new DelegationStore()
    const { envelopeId } = await acceptedDelegation(store, missionId, delegations)
    const proof = availabilityFromAcceptedDelegation(envelopeId, {
      store: delegations, mission: { store, projectMode, availability: toolRegistrySource }, source: toolRegistrySource,
    })
    // The Mission is approved and the delegation proof is perfectly good. The
    // ONLY thing withheld is the mission.activate grant.
    authorizationService([approveGrant])
    const activated = await activateMission({
      missionId, authorizationId: AUTH_ACTIVATE, store, now: T3, projectMode, availability: proof,
    })
    expect(activated.status).toBe('authority_not_effective')
    expect(store.appended.some(r => r.type === 'activated')).toBe(false)
  })
})

// ── Identity and coverage (gates C, D, E) ──────────────────────────────────

describe('accepted-delegation availability is Mission- and version-specific', () => {
  const query = (over: Partial<Parameters<MissionCapabilityAvailability>[0]> = {}) => ({
    projectId: PROJECT_P, missionId: 'unused', missionVersion: 1,
    tools: BRIEF.tools, dataScope: BRIEF.dataScope, ...over,
  })

  it('a proof for Mission A does not answer for Mission B in the same project', async () => {
    const a = await approvedMission()
    const delegations = new DelegationStore()
    const { envelopeId } = await acceptedDelegation(a.store, a.missionId, delegations)
    const proof = availabilityFromAcceptedDelegation(envelopeId, {
      store: delegations, mission: { store: a.store, projectMode, availability: toolRegistrySource }, source: toolRegistrySource,
    })

    const mine = await proof(query({ missionId: a.missionId }))
    const theirs = await proof(query({ missionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }))
    expect(mine.tools).toBe(true)
    expect(theirs.tools).toBe(false)
    expect(theirs.unavailable).toContain('mission_mismatch')
  })

  it('same project is not a substitute for same mission', async () => {
    const a = await approvedMission()
    const delegations = new DelegationStore()
    const { envelopeId } = await acceptedDelegation(a.store, a.missionId, delegations)
    const proof = availabilityFromAcceptedDelegation(envelopeId, {
      store: delegations, mission: { store: a.store, projectMode, availability: toolRegistrySource }, source: toolRegistrySource,
    })
    const answer = await proof(query({ missionId: 'other', projectId: PROJECT_P }))
    expect(answer.tools).toBe(false)
  })

  it('a version-1 acceptance does not answer for version 2', async () => {
    const a = await approvedMission()
    const delegations = new DelegationStore()
    const { envelopeId } = await acceptedDelegation(a.store, a.missionId, delegations)
    const proof = availabilityFromAcceptedDelegation(envelopeId, {
      store: delegations, mission: { store: a.store, projectMode, availability: toolRegistrySource }, source: toolRegistrySource,
    })
    const answer = await proof(query({ missionId: a.missionId, missionVersion: 2 }))
    expect(answer.tools).toBe(false)
    expect(answer.unavailable).toContain('mission_version_mismatch')
  })

  it('a foreign project is refused', async () => {
    const a = await approvedMission()
    const delegations = new DelegationStore()
    const { envelopeId } = await acceptedDelegation(a.store, a.missionId, delegations)
    const proof = availabilityFromAcceptedDelegation(envelopeId, {
      store: delegations, mission: { store: a.store, projectMode, availability: toolRegistrySource }, source: toolRegistrySource,
    })
    const answer = await proof(query({ missionId: a.missionId, projectId: 'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz' }))
    expect(answer.tools).toBe(false)
  })

  it('a REJECTED envelope proves nothing', async () => {
    const a = await approvedMission()
    const delegations = new DelegationStore()
    // Narrow to a tool the registry stand-in does not know, forcing a rejection.
    const mission = { store: a.store, projectMode, availability: toolRegistrySource }
    const prep = await prepareDelegation({ missionId: a.missionId, store: delegations, now: T1, mission })
    const envelopeId = prep.state!.envelopeId
    // Decide with a source that cannot prove the tools → typed rejection.
    const decided = await decideDelegation({
      envelopeId, store: delegations, now: T2,
      mission: { store: a.store, projectMode, availability: registryAvailability },
    })
    expect(decided.state!.status).toBe('rejected')

    const proof = availabilityFromAcceptedDelegation(envelopeId, { store: delegations, mission, source: toolRegistrySource })
    const answer = await proof(query({ missionId: a.missionId }))
    expect(answer.tools).toBe(false)
    expect(answer.unavailable).toContain('delegation_rejected')
  })

  it('a REVOKED envelope proves nothing', async () => {
    const a = await approvedMission()
    const delegations = new DelegationStore()
    const mission = { store: a.store, projectMode, availability: toolRegistrySource }
    const { envelopeId } = await acceptedDelegation(a.store, a.missionId, delegations)
    await revokeDelegation({ envelopeId, reason: 'executive_withdrew', store: delegations, now: T2, mission })
    const proof = availabilityFromAcceptedDelegation(envelopeId, { store: delegations, mission, source: toolRegistrySource })
    const answer = await proof(query({ missionId: a.missionId }))
    expect(answer.tools).toBe(false)
    expect(answer.unavailable).toContain('delegation_revoked')
  })

  it('an unknown envelope proves nothing', async () => {
    const a = await approvedMission()
    const proof = availabilityFromAcceptedDelegation('11111111-2222-4333-8444-555555555555', {
      store: new DelegationStore(),
      mission: { store: a.store, projectMode, availability: toolRegistrySource },
      source: toolRegistrySource,
    })
    const answer = await proof(query({ missionId: a.missionId }))
    expect(answer.tools).toBe(false)
    expect(answer.unavailable).toContain('delegation_unreadable')
  })
})

describe('coverage: a narrowed envelope proves only what it covers (§21.13)', () => {
  it('an envelope carrying one tool does not prove the mission other tool', async () => {
    const a = await approvedMission()
    const delegations = new DelegationStore()
    const { envelopeId, decided } = await acceptedDelegation(a.store, a.missionId, delegations, {
      tools: [{ tool: 'repo_read', restriction: 'apps/web only' }],
    })
    expect(decided.state!.status).toBe('accepted')

    const proof = availabilityFromAcceptedDelegation(envelopeId, {
      store: delegations, mission: { store: a.store, projectMode, availability: toolRegistrySource }, source: toolRegistrySource,
    })
    // The mission still requires BOTH tools.
    const answer = await proof({
      projectId: PROJECT_P, missionId: a.missionId, missionVersion: 1,
      tools: BRIEF.tools, dataScope: BRIEF.dataScope,
    })
    expect(answer.tools).toBe(false)
    expect(answer.unavailable).toContain('tool:test_runner')
  })

  it('and therefore leaves the mission INACTIVE', async () => {
    const a = await approvedMission()
    const delegations = new DelegationStore()
    const { envelopeId } = await acceptedDelegation(a.store, a.missionId, delegations, {
      tools: [{ tool: 'repo_read', restriction: 'apps/web only' }],
    })
    const proof = availabilityFromAcceptedDelegation(envelopeId, {
      store: delegations, mission: { store: a.store, projectMode, availability: toolRegistrySource }, source: toolRegistrySource,
    })
    const activated = await tryActivate(a.store, a.missionId, proof, [a.approveGrant])
    expect(activated.status).toBe('activation_incomplete')
    expect(activated.missing).toContain('tool_availability')
  })

  it('an envelope with narrowed data scope does not prove omitted mission data', () => {
    const envelope = {
      tools: [], dataScope: [{ resource: 'website_content', access: 'read' as const }],
    } as never
    const { covered, uncovered } = envelopeCovers(envelope, {
      tools: [],
      dataScope: [
        { resource: 'website_content', access: 'read' },
        { resource: 'leads', access: 'read' },
      ],
    })
    expect(covered).toBe(false)
    expect(uncovered).toContain('data:leads:read')
  })

  it('a read-only envelope does not cover a write requirement', () => {
    const envelope = { tools: [], dataScope: [{ resource: 'leads', access: 'read' as const }] } as never
    expect(envelopeCovers(envelope, { tools: [], dataScope: [{ resource: 'leads', access: 'write' }] }).covered).toBe(false)
  })

  it('a write envelope does cover a read requirement', () => {
    const envelope = { tools: [], dataScope: [{ resource: 'leads', access: 'write' as const }] } as never
    expect(envelopeCovers(envelope, { tools: [], dataScope: [{ resource: 'leads', access: 'read' }] }).covered).toBe(true)
  })

  it('a restricted tool does not cover the unrestricted requirement', () => {
    const envelope = { tools: [{ tool: 'publish', restriction: 'draft only' }], dataScope: [] } as never
    expect(envelopeCovers(envelope, { tools: [{ tool: 'publish' }], dataScope: [] }).covered).toBe(false)
  })

  it('the envelope is never widened to make a proof fit', async () => {
    const a = await approvedMission()
    const delegations = new DelegationStore()
    const { envelopeId } = await acceptedDelegation(a.store, a.missionId, delegations, {
      tools: [{ tool: 'repo_read', restriction: 'apps/web only' }],
    })
    const lineage = await delegations.lineage(envelopeId)
    expect(lineage[0].envelope!.tools).toEqual([{ tool: 'repo_read', restriction: 'apps/web only' }])
  })
})

describe('the underlying availability source still has to say yes', () => {
  it('an accepted envelope cannot conjure a tool the registry cannot prove', async () => {
    const a = await approvedMission()
    const delegations = new DelegationStore()
    const { envelopeId } = await acceptedDelegation(a.store, a.missionId, delegations)
    // Production default: no tool registry exists, so no tool is provable.
    const proof = availabilityFromAcceptedDelegation(envelopeId, {
      store: delegations,
      mission: { store: a.store, projectMode, availability: toolRegistrySource },
      source: registryAvailability,
    })
    const answer = await proof({
      projectId: PROJECT_P, missionId: a.missionId, missionVersion: 1,
      tools: BRIEF.tools, dataScope: BRIEF.dataScope,
    })
    expect(answer.tools).toBe(false)
  })

  it('a throwing source fails closed rather than propagating', async () => {
    const a = await approvedMission()
    const delegations = new DelegationStore()
    const { envelopeId } = await acceptedDelegation(a.store, a.missionId, delegations)
    const proof = availabilityFromAcceptedDelegation(envelopeId, {
      store: delegations,
      mission: { store: a.store, projectMode, availability: toolRegistrySource },
      source: async () => { throw new Error('registry down') },
    })
    const answer = await proof({
      projectId: PROJECT_P, missionId: a.missionId, missionVersion: 1,
      tools: BRIEF.tools, dataScope: BRIEF.dataScope,
    })
    expect(answer.tools).toBe(false)
    expect(answer.unavailable).toContain('availability_source_unreadable')
  })

  it('caches nothing — a revocation between two evaluations changes the answer', async () => {
    const a = await approvedMission()
    const delegations = new DelegationStore()
    const mission = { store: a.store, projectMode, availability: toolRegistrySource }
    const { envelopeId } = await acceptedDelegation(a.store, a.missionId, delegations)
    const proof = availabilityFromAcceptedDelegation(envelopeId, { store: delegations, mission, source: toolRegistrySource })
    const query = {
      projectId: PROJECT_P, missionId: a.missionId, missionVersion: 1,
      tools: BRIEF.tools, dataScope: BRIEF.dataScope,
    }
    expect((await proof(query)).tools).toBe(true)
    await revokeDelegation({ envelopeId, reason: 'executive_withdrew', store: delegations, now: T2, mission })
    expect((await proof(query)).tools).toBe(false)
  })
})

describe('live Mission invalidation collapses the proof (§21.14)', () => {
  const query = (missionId: string) => ({
    projectId: PROJECT_P, missionId, missionVersion: 1,
    tools: BRIEF.tools, dataScope: BRIEF.dataScope,
  })

  async function provenChain() {
    const { store, missionId, approveGrant } = await approvedMission()
    const delegations = new DelegationStore()
    const mission = { store, projectMode, availability: toolRegistrySource }
    const { envelopeId } = await acceptedDelegation(store, missionId, delegations)
    return { store, missionId, approveGrant, delegations, mission, envelopeId }
  }

  it('a revoked APPROVE authorization invalidates the proof', async () => {
    const c = await provenChain()
    const proof = availabilityFromAcceptedDelegation(c.envelopeId, {
      store: c.delegations, mission: c.mission, source: toolRegistrySource,
    })
    expect((await proof(query(c.missionId))).tools).toBe(true)
    // §27.207 — the grant behind the mission's approval stops being effective.
    authorizationService([])
    expect((await proof(query(c.missionId))).tools).toBe(false)
  })

  it('a governing Decision that stops governing invalidates the proof', async () => {
    const { store, missionId } = await approvedMission(unprovenAvailability, true)
    const delegations = new DelegationStore()
    const mission = { store, projectMode, availability: toolRegistrySource }
    const { envelopeId, decided } = await acceptedDelegation(store, missionId, delegations)
    expect(decided.state!.status).toBe('accepted')
    const c = { store, missionId, delegations, mission, envelopeId }
    const proof = availabilityFromAcceptedDelegation(c.envelopeId, {
      store: c.delegations, mission: c.mission, source: toolRegistrySource,
    })
    expect((await proof(query(c.missionId))).tools).toBe(true)
    // §20.137 — the decision the mission implements is reversed. Nothing in the
    // delegation ledger changed; the ground under it did.
    vi.mocked(resolveDecision).mockResolvedValue({
      state: { decisionId: 'dec-1', projectId: PROJECT_P, status: 'reversed', version: 1 },
      lineage: [], status: 'ok',
    } as never)
    const after = await proof(query(c.missionId))
    expect(after.tools).toBe(false)
    expect(after.data).toBe(false)
  })

  it('a non-operational project mode invalidates the proof', async () => {
    const { store, missionId } = await approvedMission()
    const delegations = new DelegationStore()
    const live = { store, projectMode, availability: toolRegistrySource }
    const { envelopeId } = await acceptedDelegation(store, missionId, delegations)

    const usable = availabilityFromAcceptedDelegation(envelopeId, {
      store: delegations, mission: live, source: toolRegistrySource,
    })
    expect((await usable(query(missionId))).tools).toBe(true)

    // §20.75 — the project moves to observer: collect and analyse, no execution.
    const observer = { store, projectMode: async () => 'observer', availability: toolRegistrySource }
    const blocked = availabilityFromAcceptedDelegation(envelopeId, {
      store: delegations, mission: observer, source: toolRegistrySource,
    })
    expect((await blocked(query(missionId))).tools).toBe(false)
  })

  it('an archived project invalidates the proof', async () => {
    const { store, missionId } = await approvedMission()
    const delegations = new DelegationStore()
    const { envelopeId } = await acceptedDelegation(store, missionId, delegations)
    const archived = { store, projectMode: async () => 'archived', availability: toolRegistrySource }
    const proof = availabilityFromAcceptedDelegation(envelopeId, {
      store: delegations, mission: archived, source: toolRegistrySource,
    })
    expect((await proof(query(missionId))).tools).toBe(false)
  })
})

describe('no execution regression', () => {
  it('the availability seam touches no runner, task or external surface', () => {
    const src = readFileSync(resolve(__dirname, '../atlas/delegation/mission-availability.ts'), 'utf8')
    expect(src).not.toMatch(/manager_tasks|planTasks|workflow-(runner|executor)|run-create/)
    expect(src).not.toMatch(/@anthropic-ai\/sdk|\bfetch\s*\(|lib\/publishing/)
  })

  it('activation through a delegation proof writes only mission acts to the mission ledger', async () => {
    const { store, missionId, approveGrant } = await approvedMission()
    const delegations = new DelegationStore()
    const { envelopeId } = await acceptedDelegation(store, missionId, delegations)
    const proof = availabilityFromAcceptedDelegation(envelopeId, {
      store: delegations, mission: { store, projectMode, availability: toolRegistrySource }, source: toolRegistrySource,
    })
    await tryActivate(store, missionId, proof, [approveGrant])
    expect(store.appended.every(r => typeof r.missionId === 'string')).toBe(true)
    expect(delegations.appended.every(r => r.actType.startsWith('delegation.'))).toBe(true)
  })
})
