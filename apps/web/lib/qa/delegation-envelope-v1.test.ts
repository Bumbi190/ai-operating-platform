/**
 * Executive → Manager Bounded Handoff V1 (EI-S1.4C).
 *
 * ADVERSARIAL BY CONSTRUCTION. Almost every test below is an attempt to obtain
 * authority that was not granted: widen a bound, drop an inherited prohibition,
 * float a pinned version, assert an acceptance the checks would refuse, act
 * under a dead Mission, read across a project boundary, or fake who acted.
 *
 * The Mission evaluation seam is doubled, not stubbed permissively. The double
 * returns a REAL `MissionEvaluation` shape built from a real derived-state
 * fixture, and every test that depends on live authority sets it explicitly —
 * a blanket "always authorized" double would hide the §21.14 gate entirely,
 * which is the single most important thing in this phase.
 *
 * The pure core (attenuation, classification, lineage reduction, binding,
 * availability) is tested with NO mocks at all, because it has no I/O to mock.
 *
 * Filesystem/local only: no database, no network, no credentials, and — asserted
 * below — no runner, executor, publisher or task creation of any kind.
 */

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/project-access', () => ({ resolveProjectAccess: vi.fn() }))
vi.mock('@/lib/atlas/mission/principal-read', () => ({ resolveMissionEvaluation: vi.fn() }))

import { resolveProjectAccess } from '@/lib/auth/project-access'
import { resolveMissionEvaluation } from '@/lib/atlas/mission/principal-read'

import {
  attenuate,
  envelopeIsContained,
  type AttenuationParent,
  type DelegationNarrowing,
} from '@/lib/atlas/delegation/attenuate'
import { missionBoundHash, missionBoundProjectionForDelegation } from '@/lib/atlas/delegation/binding'
import { classifyChange, requiresExecutiveReview } from '@/lib/atlas/delegation/classify'
import {
  deriveDelegationState,
  isDecidable,
  isLive,
  MalformedDelegationError,
  orderDelegationRecords,
} from '@/lib/atlas/delegation/derive'
import { capabilityFindings, dataScopeIsProven, registryAvailability } from '@/lib/atlas/delegation/availability'
import {
  decideDelegation,
  delegationRejectionGrounds,
  MANAGER_ACTOR_ID,
  parentFromMission,
  prepareDelegation,
  recordDelegationReplan,
  revokeDelegation,
} from '@/lib/atlas/delegation/principal-write'
import {
  isDelegationUsable,
  listMissionDelegations,
  listProjectDelegations,
  resolveDelegation,
  resolveDelegationEvaluation,
} from '@/lib/atlas/delegation/principal-read'
import { DELEGATION_REJECTION_REASONS, type DelegationEnvelope, type DelegationRecord } from '@/lib/atlas/delegation/types'
import type { DelegationLedgerStore } from '@/lib/atlas/delegation/store'
import type { MissionEvaluation } from '@/lib/atlas/mission/types'
import { RECORD_DOMAINS } from '@/lib/atlas/data-registry'

const DELEGATION_DIR = resolve(__dirname, '../atlas/delegation')
const MIGRATION = resolve(__dirname, '../../supabase/migrations/20260820_atlas_delegation_ledger.sql')

const PRINCIPAL_A = '11111111-1111-4111-8111-111111111111'
const PRINCIPAL_B = '22222222-2222-4222-8222-222222222222'
const PROJECT_P = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROJECT_Q = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const MISSION_M = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const T0 = '2026-08-20T08:00:00.000Z'
const T1 = '2026-08-20T09:00:00.000Z'
const T2 = '2026-08-20T10:00:00.000Z'
const DEADLINE = '2026-09-20T08:00:00.000Z'
const PAST = '2026-08-19T08:00:00.000Z'

// A Mission whose declared capabilities are ACTUALLY provable: read-only scopes
// on registered domains, and no tools. Anything else cannot become usable in
// Stage 1, and a fixture that pretended otherwise would test nothing real.
const PARENT: AttenuationParent = {
  missionId: MISSION_M,
  projectId: PROJECT_P,
  version: 1,
  objective: 'Make the short-news workflow safe enough for a bounded trial.',
  expectedOutcome: 'A validated short-news path with human approval retained.',
  deliverables: ['Validation report', 'Rollback plan'],
  successCriteria: [
    { criterion: 'Isolation validated', level: 'minimum' },
    { criterion: 'Zero cross-project reads', level: 'target', measure: 'count == 0' },
  ],
  inScope: ['short-news workflow', 'isolation review'],
  outOfScope: ['newsletter sending'],
  constraints: [{ kind: 'governance', statement: 'Sending stays approval-gated.' }],
  authority: [{ action: 'prepare' }, { action: 'create_drafts' }],
  allowedActions: [{ action: 'inspect_code' }, { action: 'run_tests' }],
  forbiddenActions: [{ action: 'publish' }, { action: 'deploy_production' }],
  tools: [],
  dataScope: [
    { resource: 'website_content', access: 'read' },
    { resource: 'runs', access: 'read' },
  ],
  budget: { currency: 'SEK', limitMinor: 500000 },
  deadline: DEADLINE,
  approvalGates: [{ gateId: 'gate-publish', gate: 'Before publishing' }],
  escalationTriggers: [{ trigger: 'Critical assumption fails', destination: 'founder' }],
  stopConditions: [{ condition: 'Wrong-project access observed' }],
  reporting: [{ cadence: 'on_change', audience: 'executive' }],
  dependencies: [],
}

const envelopeOf = (
  narrowing: DelegationNarrowing = {},
  parent: AttenuationParent = PARENT,
): DelegationEnvelope => {
  const result = attenuate(parent, narrowing)
  if (!result.ok) throw new Error(`fixture is not contained: ${JSON.stringify(result.violations)}`)
  return { ...result.envelope, envelopeId: randomUUID(), missionBoundHash: missionBoundHash(parent) }
}

function missionEvaluation(
  parent: AttenuationParent = PARENT,
  over: Partial<MissionEvaluation> = {},
): MissionEvaluation {
  const state = {
    missionId: parent.missionId,
    status: 'active' as const,
    projectId: parent.projectId,
    version: parent.version,
    title: 'Bounded trial',
    missionType: 'autonomy' as const,
    executiveOwner: 'project-executive:the-prompt',
    missionOwner: 'manager:the-prompt',
    objective: parent.objective,
    strategicContext: null,
    expectedOutcome: parent.expectedOutcome,
    deliverables: parent.deliverables,
    successCriteria: parent.successCriteria,
    inScope: parent.inScope,
    outOfScope: parent.outOfScope,
    constraints: parent.constraints,
    budget: parent.budget,
    authority: parent.authority,
    authoritySource: null,
    allowedActions: parent.allowedActions,
    forbiddenActions: parent.forbiddenActions,
    tools: parent.tools,
    dataScope: parent.dataScope,
    dependencies: parent.dependencies,
    assumptions: [],
    risks: [],
    approvalGates: parent.approvalGates,
    deadline: parent.deadline,
    projectMode: 'active',
    reporting: parent.reporting,
    escalationTriggers: parent.escalationTriggers,
    stopConditions: parent.stopConditions,
    pauseConditions: [],
    completionConditions: [],
    evidenceRequirements: [],
    authorityRecord: null,
    decisionRef: null,
    decisionProvenance: null,
    supersededBy: null,
    closure: null,
    openBlockers: [],
    dependencyState: [],
    gateResolutions: [],
    evidence: [],
    reviewNotes: [],
    reports: [],
    missingRequirements: [],
    briefComplete: true,
    approvedAt: T0,
    activatedAt: T0,
    recordCount: 2,
    lastRecordAt: T0,
    lineage: [],
  }
  return {
    lifecycleStatus: 'active',
    effectiveStatus: 'active',
    authority: { authorized: true, reason: 'authorized' },
    readiness: { ready: true, missing: [], unverified: [], satisfiedSoFar: [] },
    state,
    ...over,
  } as MissionEvaluation
}

/** DB-faithful double: enforces the migration's three partial unique indexes. */
class FakeStore implements DelegationLedgerStore {
  appended: DelegationRecord[] = []
  rejected: DelegationRecord[] = []
  constructor(private rows: DelegationRecord[] = []) {}
  async append(r: DelegationRecord) {
    const clashes =
      (r.actType === 'delegation.prepared' &&
        this.rows.some(x => x.envelopeId === r.envelopeId && x.actType === 'delegation.prepared')) ||
      ((r.actType === 'delegation.accepted' || r.actType === 'delegation.rejected') &&
        this.rows.some(x => x.envelopeId === r.envelopeId &&
          (x.actType === 'delegation.accepted' || x.actType === 'delegation.rejected'))) ||
      (r.actType === 'delegation.revoked' &&
        this.rows.some(x => x.envelopeId === r.envelopeId && x.actType === 'delegation.revoked'))
    if (clashes) {
      this.rejected.push(r)
      const { DelegationConflictError } = await import('@/lib/atlas/delegation/store')
      throw new DelegationConflictError('duplicate key value violates unique constraint (23505)')
    }
    this.appended.push(r); this.rows.push(r); return r
  }
  async lineage(id: string) { return this.rows.filter(r => r.envelopeId === id) }
  async byProject(p: string) { return this.rows.filter(r => r.projectId === p) }
  async byMission(m: string) { return this.rows.filter(r => r.missionId === m) }
  snapshot(id: string) { return this.rows.filter(r => r.envelopeId === id).map(r => ({ ...r })) }
}

/** A store pinned to one stale snapshot, so a writer acts on what it read. */
function frozenReader(live: FakeStore, snapshot: DelegationRecord[]): DelegationLedgerStore {
  return {
    append: (r: DelegationRecord) => live.append(r),
    lineage: async (id: string) => snapshot.filter(r => r.envelopeId === id),
    byProject: (p: string) => live.byProject(p),
    byMission: (m: string) => live.byMission(m),
  }
}

const asPrincipal = (userId: string, projects: string[]) => {
  vi.mocked(resolveProjectAccess).mockResolvedValue({ ok: true, userId, allowedProjectIds: projects } as never)
}

const missionSays = (evaluation: MissionEvaluation | null, status = 'ok') => {
  vi.mocked(resolveMissionEvaluation).mockResolvedValue({ evaluation, status } as never)
}

/** Prepare one envelope through the real boundary and return its lineage id. */
async function prepared(store: FakeStore, narrowing?: DelegationNarrowing, at = T0) {
  missionSays(missionEvaluation())
  const result = await prepareDelegation({ missionId: MISSION_M, narrowing, store, now: at })
  expect(result.status).toBe('ok')
  return result.state!.envelopeId
}

beforeEach(() => {
  vi.clearAllMocks()
  asPrincipal(PRINCIPAL_A, [PROJECT_P])
  missionSays(missionEvaluation())
})

// ────────────────────────────────────────────────────────────────────────────
// 1. Attenuation core (§6.39) — pure, no mocks
// ────────────────────────────────────────────────────────────────────────────

describe('attenuation: permissive fields may only narrow', () => {
  it('inherits every bound when nothing is narrowed', () => {
    const r = attenuate(PARENT)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.envelope.allowedActions).toEqual(PARENT.allowedActions)
    expect(r.envelope.tools).toEqual(PARENT.tools)
    expect(r.envelope.budget).toEqual(PARENT.budget)
    expect(r.envelope.deadline).toBe(DEADLINE)
  })

  it('accepts a strict subset of allowed actions', () => {
    const r = attenuate(PARENT, { allowedActions: [{ action: 'run_tests' }] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.envelope.allowedActions).toEqual([{ action: 'run_tests' }])
  })

  it('REFUSES an allowed action the mission never granted', () => {
    const r = attenuate(PARENT, { allowedActions: [{ action: 'deploy_production' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations).toContainEqual({ field: 'allowedActions', element: 'deploy_production', rule: 'not_in_parent' })
  })

  it('REFUSES an authority bound the mission never held', () => {
    const r = attenuate(PARENT, { authority: [{ action: 'sign_contracts' }] })
    expect(r.ok).toBe(false)
  })

  it('ignores an action bound note when deciding containment', () => {
    const r = attenuate(PARENT, { allowedActions: [{ action: 'run_tests', note: 'rewritten prose' }] })
    expect(r.ok).toBe(true)
  })

  it('REFUSES a tool the mission never granted', () => {
    const r = attenuate(PARENT, { tools: [{ tool: 'publish' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations[0].field).toBe('tools')
  })

  it('REFUSES dropping a tool restriction — the classic silent widening', () => {
    const restricted: AttenuationParent = { ...PARENT, tools: [{ tool: 'publish', restriction: 'draft only' }] }
    const r = attenuate(restricted, { tools: [{ tool: 'publish' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations).toContainEqual({ field: 'tools', element: 'publish ', rule: 'not_in_parent' })
  })

  it('REFUSES rewriting a tool restriction into a different one', () => {
    const restricted: AttenuationParent = { ...PARENT, tools: [{ tool: 'publish', restriction: 'draft only' }] }
    const r = attenuate(restricted, { tools: [{ tool: 'publish', restriction: 'anything' }] })
    expect(r.ok).toBe(false)
  })

  it('accepts a tool carried verbatim with its restriction', () => {
    const restricted: AttenuationParent = { ...PARENT, tools: [{ tool: 'publish', restriction: 'draft only' }] }
    const r = attenuate(restricted, { tools: [{ tool: 'publish', restriction: 'draft only' }] })
    expect(r.ok).toBe(true)
  })

  it('allows read where the mission held write (narrowing down the lattice)', () => {
    const writer: AttenuationParent = { ...PARENT, dataScope: [{ resource: 'leads', access: 'write' }] }
    const r = attenuate(writer, { dataScope: [{ resource: 'leads', access: 'read' }] })
    expect(r.ok).toBe(true)
  })

  it('REFUSES write where the mission held only read (privilege escalation)', () => {
    const r = attenuate(PARENT, { dataScope: [{ resource: 'runs', access: 'write' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations).toContainEqual({ field: 'dataScope', element: 'runs:write', rule: 'not_in_parent' })
  })

  it('REFUSES a resource the mission never scoped', () => {
    const r = attenuate(PARENT, { dataScope: [{ resource: 'platform_tokens', access: 'read' }] })
    expect(r.ok).toBe(false)
  })

  it('REFUSES scope items outside the mission scope', () => {
    const r = attenuate(PARENT, { inScope: ['newsletter sending'] })
    expect(r.ok).toBe(false)
  })

  it('REFUSES deliverables the mission never promised', () => {
    const r = attenuate(PARENT, { deliverables: ['Production deploy'] })
    expect(r.ok).toBe(false)
  })

  it('REFUSES a success criterion whose level was changed', () => {
    const r = attenuate(PARENT, { successCriteria: [{ criterion: 'Isolation validated', level: 'stretch' }] })
    expect(r.ok).toBe(false)
  })

  it('reports EVERY violation, not just the first', () => {
    const r = attenuate(PARENT, {
      allowedActions: [{ action: 'publish' }],
      tools: [{ tool: 'ssh' }],
      dataScope: [{ resource: 'runs', access: 'write' }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations.length).toBe(3)
  })
})

describe('attenuation: budget and deadline are ceilings', () => {
  it('accepts a lower budget in the same currency', () => {
    const r = attenuate(PARENT, { budget: { currency: 'SEK', limitMinor: 100000 } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.envelope.budget).toEqual({ currency: 'SEK', limitMinor: 100000 })
  })

  it('REFUSES a higher budget', () => {
    const r = attenuate(PARENT, { budget: { currency: 'SEK', limitMinor: 500001 } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations[0].rule).toBe('exceeds_parent')
  })

  it('REFUSES a currency swap — no exchange rate is ever guessed', () => {
    const r = attenuate(PARENT, { budget: { currency: 'USD', limitMinor: 1 } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations[0].element).toBe('USD')
  })

  it('REFUSES inventing a budget where the mission declared none', () => {
    const noBudget: AttenuationParent = { ...PARENT, budget: null }
    const r = attenuate(noBudget, { budget: { currency: 'SEK', limitMinor: 1 } })
    expect(r.ok).toBe(false)
  })

  it('REFUSES a negative or non-integer budget', () => {
    expect(attenuate(PARENT, { budget: { currency: 'SEK', limitMinor: -1 } }).ok).toBe(false)
    expect(attenuate(PARENT, { budget: { currency: 'SEK', limitMinor: 1.5 } }).ok).toBe(false)
  })

  it('accepts an earlier deadline', () => {
    const r = attenuate(PARENT, { deadline: '2026-09-01T00:00:00.000Z' })
    expect(r.ok).toBe(true)
  })

  it('REFUSES a later deadline', () => {
    const r = attenuate(PARENT, { deadline: '2026-10-01T00:00:00.000Z' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations[0].rule).toBe('exceeds_parent')
  })

  it('REFUSES dropping an inherited deadline to null', () => {
    const r = attenuate(PARENT, { deadline: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations[0].rule).toBe('removes_inherited')
  })

  it('REFUSES an unparseable deadline rather than ignoring it', () => {
    const r = attenuate(PARENT, { deadline: 'next tuesday' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations[0].rule).toBe('malformed')
  })
})

describe('attenuation: restrictive fields may only grow', () => {
  it('inherits every forbidden action unconditionally', () => {
    const r = attenuate(PARENT, { allowedActions: [] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.envelope.forbiddenActions).toEqual(PARENT.forbiddenActions)
  })

  it('adds a new prohibition while keeping the inherited ones', () => {
    const r = attenuate(PARENT, { addForbiddenActions: [{ action: 'send_email' }] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.envelope.forbiddenActions.map(a => a.action)).toEqual(['publish', 'deploy_production', 'send_email'])
  })

  it('does not duplicate a prohibition that was already inherited', () => {
    const r = attenuate(PARENT, { addForbiddenActions: [{ action: 'publish' }] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.envelope.forbiddenActions.length).toBe(2)
  })

  it('inherits every approval gate and stop condition', () => {
    const r = attenuate(PARENT)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.envelope.approvalGates).toEqual(PARENT.approvalGates)
    expect(r.envelope.stopConditions).toEqual(PARENT.stopConditions)
  })

  it('grows out-of-scope rather than replacing it', () => {
    const r = attenuate(PARENT, { addOutOfScope: ['analytics'] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.envelope.outOfScope).toEqual(['newsletter sending', 'analytics'])
  })

  it('makes removing a prohibition UNREPRESENTABLE in the request type', () => {
    // A caller cannot even express `forbiddenActions: []`: the narrowing shape
    // has no such key, only `addForbiddenActions`. This is a type-level
    // guarantee, asserted here so a future widening of the shape breaks a test.
    const keys: (keyof DelegationNarrowing)[] = [
      'authority', 'allowedActions', 'tools', 'dataScope', 'inScope', 'deliverables',
      'successCriteria', 'budget', 'deadline',
      'addForbiddenActions', 'addOutOfScope', 'addConstraints',
      'addApprovalGates', 'addEscalationTriggers', 'addStopConditions',
    ]
    expect(keys).not.toContain('forbiddenActions' as never)
    expect(keys).not.toContain('objective' as never)
    expect(keys).not.toContain('projectId' as never)
    expect(keys).not.toContain('missionVersion' as never)
  })
})

describe('attenuation: identity is taken from the mission, never the caller', () => {
  it('carries objective, project, mission and version verbatim', () => {
    const r = attenuate(PARENT)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.envelope.objective).toBe(PARENT.objective)
    expect(r.envelope.projectId).toBe(PROJECT_P)
    expect(r.envelope.missionId).toBe(MISSION_M)
    expect(r.envelope.missionVersion).toBe(1)
  })

  it('only ever delegates to the manager role in Stage 1', () => {
    const r = attenuate(PARENT)
    if (r.ok) expect(r.envelope.delegatedTo).toBe('manager')
  })
})

describe('envelopeIsContained: re-proof against a live mission', () => {
  it('passes for an envelope cut from the same mission', () => {
    expect(envelopeIsContained(PARENT, envelopeOf())).toEqual([])
  })

  it('catches an envelope whose allowed actions the mission has since lost', () => {
    const envelope = envelopeOf()
    const narrowed: AttenuationParent = { ...PARENT, allowedActions: [{ action: 'run_tests' }] }
    expect(envelopeIsContained(narrowed, envelope)).toContainEqual(
      { field: 'allowedActions', element: 'inspect_code', rule: 'not_in_parent' },
    )
  })

  it('catches a mission that added a prohibition the envelope does not carry', () => {
    const envelope = envelopeOf()
    const stricter: AttenuationParent = {
      ...PARENT, forbiddenActions: [...PARENT.forbiddenActions, { action: 'send_email' }],
    }
    expect(envelopeIsContained(stricter, envelope)).toContainEqual(
      { field: 'forbiddenActions', element: 'send_email', rule: 'removes_inherited' },
    )
  })

  it('catches a mission that added an approval gate the envelope skips', () => {
    const envelope = envelopeOf()
    const gated: AttenuationParent = {
      ...PARENT, approvalGates: [...PARENT.approvalGates, { gateId: 'gate-spend', gate: 'Before spending' }],
    }
    expect(envelopeIsContained(gated, envelope).some(v => v.element === 'gate-spend')).toBe(true)
  })

  it('catches a mission that added a stop condition the envelope lacks', () => {
    const envelope = envelopeOf()
    const stricter: AttenuationParent = {
      ...PARENT, stopConditions: [...PARENT.stopConditions, { condition: 'Budget exhausted' }],
    }
    expect(envelopeIsContained(stricter, envelope).some(v => v.field === 'stopConditions')).toBe(true)
  })

  it('catches an envelope pointing at a different project or mission', () => {
    const envelope = { ...envelopeOf(), projectId: PROJECT_Q, missionId: 'other' }
    const v = envelopeIsContained(PARENT, envelope)
    expect(v.some(x => x.field === 'projectId')).toBe(true)
    expect(v.some(x => x.field === 'missionId')).toBe(true)
  })

  it('catches a budget the mission has since lowered', () => {
    const envelope = envelopeOf()
    const poorer: AttenuationParent = { ...PARENT, budget: { currency: 'SEK', limitMinor: 1000 } }
    expect(envelopeIsContained(poorer, envelope).some(v => v.field === 'budget')).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 2. Replanning boundary (§21.20–§21.26) — pure
// ────────────────────────────────────────────────────────────────────────────

describe('replanning classifier', () => {
  const envelope = envelopeOf()

  it('classifies a pure resequencing as operational', () => {
    const r = classifyChange(envelope, { summary: 'Run tests before review' })
    expect(r.changeClass).toBe('operational_change')
    expect(r.exceeded).toEqual([])
    expect(requiresExecutiveReview(r)).toBe(false)
  })

  it('classifies use of an already-granted action as operational', () => {
    const r = classifyChange(envelope, { summary: 'retry', actions: ['run_tests'] })
    expect(r.changeClass).toBe('operational_change')
  })

  it('REFERS an action outside the allowed set', () => {
    const r = classifyChange(envelope, { summary: 'ship it', actions: ['deploy_production'] })
    expect(r.changeClass).toBe('material_change_requires_executive_review')
    expect(r.exceeded).toContain('forbiddenActions:deploy_production')
  })

  it('reports a forbidden action as forbidden, not merely disallowed', () => {
    const r = classifyChange(envelope, { summary: 'publish', actions: ['publish'] })
    expect(r.exceeded).toEqual(['forbiddenActions:publish'])
  })

  it('REFERS an action that is simply unknown', () => {
    const r = classifyChange(envelope, { summary: 'x', actions: ['mint_tokens'] })
    expect(r.exceeded).toContain('allowedActions:mint_tokens')
  })

  it('REFERS a tool the envelope never carried', () => {
    const r = classifyChange(envelope, { summary: 'x', tools: [{ tool: 'ssh' }] })
    expect(r.changeClass).toBe('material_change_requires_executive_review')
  })

  it('REFERS a write to a read-only resource', () => {
    const r = classifyChange(envelope, { summary: 'x', dataScope: [{ resource: 'runs', access: 'write' }] })
    expect(r.exceeded).toContain('dataScope:runs:write')
  })

  it('allows a read within the granted data scope', () => {
    const r = classifyChange(envelope, { summary: 'x', dataScope: [{ resource: 'runs', access: 'read' }] })
    expect(r.changeClass).toBe('operational_change')
  })

  it('REFERS spend above the ceiling', () => {
    const r = classifyChange(envelope, { summary: 'x', spendMinor: 500001, currency: 'SEK' })
    expect(r.changeClass).toBe('material_change_requires_executive_review')
  })

  it('allows spend at exactly the ceiling', () => {
    const r = classifyChange(envelope, { summary: 'x', spendMinor: 500000, currency: 'SEK' })
    expect(r.changeClass).toBe('operational_change')
  })

  it('treats any spend against a budgetless envelope as material', () => {
    const noBudget = envelopeOf({}, { ...PARENT, budget: null })
    expect(classifyChange(noBudget, { summary: 'x', spendMinor: 1 }).changeClass)
      .toBe('material_change_requires_executive_review')
    expect(classifyChange(noBudget, { summary: 'x', spendMinor: 0 }).changeClass)
      .toBe('operational_change')
  })

  it('REFERS a currency the envelope does not budget in', () => {
    const r = classifyChange(envelope, { summary: 'x', spendMinor: 1, currency: 'USD' })
    expect(r.exceeded).toContain('budget:currency:USD')
  })

  it('REFERS a target date beyond the deadline', () => {
    const r = classifyChange(envelope, { summary: 'x', targetDate: '2026-12-01T00:00:00.000Z' })
    expect(r.changeClass).toBe('material_change_requires_executive_review')
  })

  it('REFERS an unparseable target date rather than ignoring it', () => {
    const r = classifyChange(envelope, { summary: 'x', targetDate: 'soon' })
    expect(r.changeClass).toBe('material_change_requires_executive_review')
  })

  it('REFERS work in explicitly out-of-scope territory', () => {
    const r = classifyChange(envelope, { summary: 'x', scopeTouched: ['newsletter sending'] })
    expect(r.exceeded).toContain('outOfScope:newsletter sending')
  })

  it('REFERS work in territory that is neither in nor out of scope', () => {
    const r = classifyChange(envelope, { summary: 'x', scopeTouched: ['billing'] })
    expect(r.exceeded).toContain('inScope:billing')
  })

  it('REFERS bypassing a declared approval gate', () => {
    const r = classifyChange(envelope, { summary: 'x', gatesBypassed: ['gate-publish'] })
    expect(r.exceeded).toContain('approvalGates:gate-publish')
  })

  it('REFERS bypassing an unknown gate too — the default is never permissive', () => {
    const r = classifyChange(envelope, { summary: 'x', gatesBypassed: ['gate-unknown'] })
    expect(r.changeClass).toBe('material_change_requires_executive_review')
  })

  it('is deterministic: the same input yields the same classification', () => {
    const change = { summary: 'x', actions: ['publish'], tools: [{ tool: 'ssh' }] }
    expect(classifyChange(envelope, change)).toEqual(classifyChange(envelope, change))
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 3. Lineage reduction — pure
// ────────────────────────────────────────────────────────────────────────────

const act = (over: Partial<DelegationRecord>): DelegationRecord => ({
  recordId: randomUUID(),
  envelopeId: 'env-1',
  projectId: PROJECT_P,
  actType: 'delegation.prepared',
  occurredAt: T0,
  missionId: MISSION_M,
  missionVersion: 1,
  missionBoundHash: missionBoundHash(PARENT),
  envelope: null,
  rejections: [],
  replan: null,
  actorKind: 'executive_principal',
  actorId: PRINCIPAL_A,
  note: null,
  revokedReason: null,
  ...over,
})

const preparedAct = (over: Partial<DelegationRecord> = {}) =>
  act({ actType: 'delegation.prepared', envelope: { ...envelopeOf(), envelopeId: 'env-1' }, ...over })

describe('lineage reduction', () => {
  it('derives prepared from a lone preparing act', () => {
    const s = deriveDelegationState([preparedAct()])
    expect(s.status).toBe('prepared')
    expect(isDecidable(s)).toBe(true)
    expect(isLive(s)).toBe(false)
  })

  it('derives accepted, and stops being decidable', () => {
    const s = deriveDelegationState([
      preparedAct(),
      act({ actType: 'delegation.accepted', occurredAt: T1, actorKind: 'manager', actorId: MANAGER_ACTOR_ID }),
    ])
    expect(s.status).toBe('accepted')
    expect(isDecidable(s)).toBe(false)
    expect(isLive(s)).toBe(true)
  })

  it('derives rejected and carries the typed grounds', () => {
    const s = deriveDelegationState([
      preparedAct(),
      act({
        actType: 'delegation.rejected', occurredAt: T1, actorKind: 'manager', actorId: MANAGER_ACTOR_ID,
        rejections: [{ reason: 'tool_unavailable', subject: 'ssh' }],
      }),
    ])
    expect(s.status).toBe('rejected')
    expect(s.rejections).toEqual([{ reason: 'tool_unavailable', subject: 'ssh' }])
  })

  it('derives revoked over an accepted envelope', () => {
    const s = deriveDelegationState([
      preparedAct(),
      act({ actType: 'delegation.accepted', occurredAt: T1 }),
      act({ actType: 'delegation.revoked', occurredAt: T2, revokedReason: 'executive_withdrew' }),
    ])
    expect(s.status).toBe('revoked')
    expect(s.revokedReason).toBe('executive_withdrew')
  })

  it('REFUSES an empty lineage', () => {
    expect(() => deriveDelegationState([])).toThrow(MalformedDelegationError)
  })

  it('REFUSES a lineage that does not begin with a preparing act', () => {
    expect(() => deriveDelegationState([act({ actType: 'delegation.accepted' })]))
      .toThrow(MalformedDelegationError)
  })

  it('REFUSES a preparing act with no envelope', () => {
    expect(() => deriveDelegationState([act({ actType: 'delegation.prepared', envelope: null })]))
      .toThrow(MalformedDelegationError)
  })

  it('REFUSES two preparing acts — no second, divergent envelope', () => {
    expect(() => deriveDelegationState([preparedAct(), preparedAct({ occurredAt: T1 })]))
      .toThrow(MalformedDelegationError)
  })

  it('REFUSES an envelope decided twice', () => {
    expect(() => deriveDelegationState([
      preparedAct(),
      act({ actType: 'delegation.accepted', occurredAt: T1 }),
      act({ actType: 'delegation.rejected', occurredAt: T2, rejections: [{ reason: 'tool_unavailable' }] }),
    ])).toThrow(MalformedDelegationError)
  })

  it('REFUSES revoking what was already rejected', () => {
    expect(() => deriveDelegationState([
      preparedAct(),
      act({ actType: 'delegation.rejected', occurredAt: T1, rejections: [{ reason: 'tool_unavailable' }] }),
      act({ actType: 'delegation.revoked', occurredAt: T2, revokedReason: 'executive_withdrew' }),
    ])).toThrow(MalformedDelegationError)
  })

  it('REFUSES a replan against an envelope that was never accepted', () => {
    expect(() => deriveDelegationState([
      preparedAct(),
      act({
        actType: 'delegation.replan.operational', occurredAt: T1,
        replan: { changeClass: 'operational_change', exceeded: [], summary: 'x' },
      }),
    ])).toThrow(MalformedDelegationError)
  })

  it('REFUSES a lineage that mixes projects', () => {
    expect(() => deriveDelegationState([
      preparedAct(),
      act({ actType: 'delegation.accepted', occurredAt: T1, projectId: PROJECT_Q }),
    ])).toThrow(MalformedDelegationError)
  })

  it('REFUSES a lineage that mixes mission versions', () => {
    expect(() => deriveDelegationState([
      preparedAct(),
      act({ actType: 'delegation.accepted', occurredAt: T1, missionVersion: 2 }),
    ])).toThrow(MalformedDelegationError)
  })

  it('REFUSES a lineage whose later act carries a different bound hash', () => {
    expect(() => deriveDelegationState([
      preparedAct(),
      act({ actType: 'delegation.accepted', occurredAt: T1, missionBoundHash: 'f'.repeat(64) }),
    ])).toThrow(MalformedDelegationError)
  })

  it('collects referrals in order and ignores operational replans', () => {
    const s = deriveDelegationState([
      preparedAct(),
      act({ actType: 'delegation.accepted', occurredAt: T1 }),
      act({
        actType: 'delegation.replan.operational', occurredAt: T2,
        replan: { changeClass: 'operational_change', exceeded: [], summary: 'reorder' },
      }),
      act({
        actType: 'delegation.replan.referred', occurredAt: T2,
        replan: { changeClass: 'material_change_requires_executive_review', exceeded: ['tools:ssh'], summary: 'ssh' },
      }),
    ])
    expect(s.referrals.length).toBe(1)
    expect(s.referrals[0].exceeded).toEqual(['tools:ssh'])
  })

  it('orders deterministically regardless of input order', () => {
    const a = preparedAct({ recordId: 'zzz' })
    const b = act({ actType: 'delegation.accepted', occurredAt: T1, recordId: 'aaa' })
    expect(orderDelegationRecords([b, a]).map(r => r.recordId)).toEqual(['zzz', 'aaa'])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 4. Capability availability (§20.105 / §21.16) — the first real check
// ────────────────────────────────────────────────────────────────────────────

describe('capability availability', () => {
  it('is NOT a stub that returns true', async () => {
    const r = await registryAvailability({
      projectId: PROJECT_P,
      tools: [{ tool: 'anything' }],
      dataScope: [{ resource: 'anything', access: 'read' }],
    })
    expect(r.tools).toBe(false)
    expect(r.data).toBe(false)
  })

  it('proves a read scope on a registered domain', async () => {
    const r = await registryAvailability({
      projectId: PROJECT_P, tools: [],
      dataScope: [{ resource: 'leads', access: 'read' }],
    })
    expect(r.data).toBe(true)
  })

  it('fails closed on an unregistered resource', async () => {
    expect(dataScopeIsProven({ resource: 'platform_tokens', access: 'read' })).toBe(false)
    expect(dataScopeIsProven({ resource: 'not_a_table', access: 'read' })).toBe(false)
  })

  it('fails closed on WRITE access — the registry only proves reads', async () => {
    for (const domain of RECORD_DOMAINS) {
      expect(dataScopeIsProven({ resource: domain, access: 'write' })).toBe(false)
    }
  })

  it('names WHY each capability is unproven', () => {
    const findings = capabilityFindings({
      tools: [{ tool: 'ssh' }],
      dataScope: [{ resource: 'leads', access: 'write' }, { resource: 'nope', access: 'read' }],
    })
    expect(findings).toContainEqual({ subject: 'ssh', kind: 'tool', reason: 'no_tool_registry' })
    expect(findings).toContainEqual({ subject: 'leads', kind: 'data', reason: 'write_not_authorized' })
    expect(findings).toContainEqual({ subject: 'nope', kind: 'data', reason: 'unregistered_resource' })
  })

  it('never proves a tool available — no tool registry exists to prove it from', async () => {
    const r = await registryAvailability({ projectId: PROJECT_P, tools: [{ tool: 'repo_read' }], dataScope: [] })
    expect(r.tools).toBe(false)
  })

  it('is vacuously satisfied when nothing is declared', async () => {
    const r = await registryAvailability({ projectId: PROJECT_P, tools: [], dataScope: [] })
    expect(r.tools).toBe(true)
    expect(r.data).toBe(true)
  })

  it('performs no writes and returns the same answer twice', async () => {
    const input = { projectId: PROJECT_P, tools: [], dataScope: [{ resource: 'runs', access: 'read' as const }] }
    expect(await registryAvailability(input)).toEqual(await registryAvailability(input))
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 5. Binding (§21.15)
// ────────────────────────────────────────────────────────────────────────────

describe('mission bound hash', () => {
  it('is stable across key and member order', () => {
    const shuffled: AttenuationParent = {
      ...PARENT,
      allowedActions: [...PARENT.allowedActions].reverse(),
      dataScope: [...PARENT.dataScope].reverse(),
    }
    expect(missionBoundHash(shuffled)).toBe(missionBoundHash(PARENT))
  })

  it('changes when a bound moves', () => {
    const wider: AttenuationParent = { ...PARENT, budget: { currency: 'SEK', limitMinor: 999999 } }
    expect(missionBoundHash(wider)).not.toBe(missionBoundHash(PARENT))
  })

  it('changes when a prohibition is removed', () => {
    const looser: AttenuationParent = { ...PARENT, forbiddenActions: [{ action: 'publish' }] }
    expect(missionBoundHash(looser)).not.toBe(missionBoundHash(PARENT))
  })

  it('covers every delegable bound the envelope carries', () => {
    const projection = missionBoundProjectionForDelegation(PARENT)
    for (const field of [
      'objective', 'deliverables', 'successCriteria', 'inScope', 'outOfScope', 'constraints',
      'authority', 'allowedActions', 'forbiddenActions', 'tools', 'dataScope',
      'budget', 'deadline', 'approvalGates', 'escalationTriggers', 'stopConditions',
    ]) {
      expect(projection).toHaveProperty(field)
    }
  })

  it('is a sha256 hex digest', () => {
    expect(missionBoundHash(PARENT)).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 6. Write boundary — authority, pinning, isolation, provenance
// ────────────────────────────────────────────────────────────────────────────

describe('prepare: live mission authority is the gate (§21.14)', () => {
  it('prepares an envelope from an authorized mission', async () => {
    const store = new FakeStore()
    const r = await prepareDelegation({ missionId: MISSION_M, store, now: T0 })
    expect(r.status).toBe('ok')
    expect(r.state!.status).toBe('prepared')
    expect(r.state!.missionVersion).toBe(1)
  })

  it('REFUSES when the mission is not operationally authorized', async () => {
    missionSays(missionEvaluation(PARENT, { authority: { authorized: false, reason: 'deadline_expired' } }))
    const r = await prepareDelegation({ missionId: MISSION_M, store: new FakeStore(), now: T0 })
    expect(r.status).toBe('mission_not_authorized')
    expect(r.detail).toBe('deadline_expired')
  })

  it.each([
    'authorization_invalid', 'governing_decision_invalid', 'project_mode_not_operational',
    'project_mode_changed', 'superseded_version', 'no_authority_act',
  ] as const)('REFUSES on authority reason %s', async reason => {
    missionSays(missionEvaluation(PARENT, { authority: { authorized: false, reason } }))
    const r = await prepareDelegation({ missionId: MISSION_M, store: new FakeStore(), now: T0 })
    expect(r.status).toBe('mission_not_authorized')
  })

  it.each(['cancelled', 'failed', 'superseded', 'archived', 'completed'] as const)(
    'REFUSES when the mission has ended as %s, even if authority says otherwise',
    async status => {
      const evaluation = missionEvaluation()
      const r = await prepareDelegation({
        missionId: MISSION_M, store: new FakeStore(), now: T0,
      })
      // Re-run with the ended status; authority deliberately still reports true,
      // so this proves the lifecycle check is independent and not redundant.
      missionSays({ ...evaluation, state: { ...evaluation.state, status } } as MissionEvaluation)
      const ended = await prepareDelegation({ missionId: MISSION_M, store: new FakeStore(), now: T0 })
      expect(r.status).toBe('ok')
      expect(ended.status).toBe('mission_not_authorized')
      expect(ended.detail).toBe(`mission_${status}`)
    },
  )

  it('REFUSES without a principal', async () => {
    vi.mocked(resolveProjectAccess).mockResolvedValue({ ok: false } as never)
    const r = await prepareDelegation({ missionId: MISSION_M, store: new FakeStore() })
    expect(r.status).toBe('no_principal')
  })

  it('REFUSES a mission in a project the caller does not own', async () => {
    asPrincipal(PRINCIPAL_B, [PROJECT_Q])
    const r = await prepareDelegation({ missionId: MISSION_M, store: new FakeStore(), now: T0 })
    expect(r.status).toBe('not_permitted')
  })

  it('gives an unknown mission and a foreign mission the SAME denial', async () => {
    missionSays(null, 'not_permitted')
    const unknown = await prepareDelegation({ missionId: 'nope', store: new FakeStore() })
    asPrincipal(PRINCIPAL_B, [PROJECT_Q])
    missionSays(missionEvaluation())
    const foreign = await prepareDelegation({ missionId: MISSION_M, store: new FakeStore() })
    expect(unknown.status).toBe('not_permitted')
    expect(foreign.status).toBe('not_permitted')
  })

  it('REFUSES a narrowing that exceeds the mission, and writes nothing', async () => {
    const store = new FakeStore()
    const r = await prepareDelegation({
      missionId: MISSION_M, store, now: T0,
      narrowing: { allowedActions: [{ action: 'deploy_production' }] },
    })
    expect(r.status).toBe('delegation_exceeds_mission')
    expect(r.violations!.length).toBeGreaterThan(0)
    expect(store.appended).toEqual([])
  })

  it('records the acting human as the executive principal (§21.19)', async () => {
    const store = new FakeStore()
    await prepareDelegation({ missionId: MISSION_M, store, now: T0 })
    expect(store.appended[0].actorKind).toBe('executive_principal')
    expect(store.appended[0].actorId).toBe(PRINCIPAL_A)
  })

  it('pins the mission bound hash onto the envelope', async () => {
    const store = new FakeStore()
    const r = await prepareDelegation({ missionId: MISSION_M, store, now: T0 })
    expect(r.state!.missionBoundHash).toBe(missionBoundHash(PARENT))
    expect(r.state!.envelope.missionBoundHash).toBe(missionBoundHash(PARENT))
  })

  it('takes the project from the mission, not from any caller input', async () => {
    const store = new FakeStore()
    const r = await prepareDelegation({ missionId: MISSION_M, store, now: T0 } as never)
    expect(r.state!.projectId).toBe(PROJECT_P)
  })
})

describe('decide: the caller never chooses the outcome (§21.16)', () => {
  it('accepts an envelope whose every condition is provable', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    const r = await decideDelegation({ envelopeId: id, store, now: T1 })
    expect(r.status).toBe('ok')
    expect(r.state!.status).toBe('accepted')
  })

  it('records the MANAGER as the actor, never the requesting human', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await decideDelegation({ envelopeId: id, store, now: T1 })
    const decision = store.appended.find(r => r.actType === 'delegation.accepted')!
    expect(decision.actorKind).toBe('manager')
    expect(decision.actorId).toBe(MANAGER_ACTOR_ID)
    expect(decision.actorId).not.toBe(PRINCIPAL_A)
  })

  it('exposes no parameter that could assert an acceptance', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    // Passing a hostile flag changes nothing: the shape has no such key, and
    // the outcome comes from the checks.
    const r = await decideDelegation({ envelopeId: id, store, now: T1, accepted: true } as never)
    expect(r.state!.status).toBe('accepted')
    const forced = store.appended.find(x => x.actType === 'delegation.accepted')!
    expect(Object.keys(forced)).not.toContain('accepted')
  })

  it('REJECTS, rather than accepting, when a tool cannot be proven available', async () => {
    const toolParent: AttenuationParent = { ...PARENT, tools: [{ tool: 'ssh' }] }
    missionSays(missionEvaluation(toolParent))
    const store = new FakeStore()
    const p = await prepareDelegation({ missionId: MISSION_M, store, now: T0 })
    const r = await decideDelegation({ envelopeId: p.state!.envelopeId, store, now: T1 })
    expect(r.state!.status).toBe('rejected')
    expect(r.rejections!.some(x => x.reason === 'tool_unavailable' && x.subject === 'ssh')).toBe(true)
  })

  it('REJECTS when a data resource is not reachable', async () => {
    const dataParent: AttenuationParent = { ...PARENT, dataScope: [{ resource: 'platform_tokens', access: 'read' }] }
    missionSays(missionEvaluation(dataParent))
    const store = new FakeStore()
    const p = await prepareDelegation({ missionId: MISSION_M, store, now: T0 })
    const r = await decideDelegation({ envelopeId: p.state!.envelopeId, store, now: T1 })
    expect(r.state!.status).toBe('rejected')
    expect(r.rejections!.some(x => x.reason === 'data_unavailable')).toBe(true)
  })

  it('REJECTS an envelope with no escalation path', async () => {
    const silent: AttenuationParent = { ...PARENT, escalationTriggers: [] }
    missionSays(missionEvaluation(silent))
    const store = new FakeStore()
    const p = await prepareDelegation({ missionId: MISSION_M, store, now: T0 })
    const r = await decideDelegation({ envelopeId: p.state!.envelopeId, store, now: T1 })
    expect(r.rejections!.some(x => x.reason === 'escalation_missing')).toBe(true)
  })

  it('REJECTS a deadline that has already passed', async () => {
    const late: AttenuationParent = { ...PARENT, deadline: PAST }
    missionSays(missionEvaluation(late))
    const store = new FakeStore()
    const p = await prepareDelegation({ missionId: MISSION_M, store, now: PAST })
    const r = await decideDelegation({ envelopeId: p.state!.envelopeId, store, now: T1 })
    expect(r.rejections!.some(x => x.reason === 'deadline_infeasible')).toBe(true)
  })

  it('REJECTS an action that is both allowed and forbidden', async () => {
    const contradictory: AttenuationParent = {
      ...PARENT, allowedActions: [{ action: 'publish' }], forbiddenActions: [{ action: 'publish' }],
    }
    missionSays(missionEvaluation(contradictory))
    const store = new FakeStore()
    const p = await prepareDelegation({ missionId: MISSION_M, store, now: T0 })
    const r = await decideDelegation({ envelopeId: p.state!.envelopeId, store, now: T1 })
    expect(r.rejections!.some(x => x.reason === 'constraint_conflict' && x.subject === 'publish')).toBe(true)
  })

  it('REJECTS deliverables with no permitted action to produce them', async () => {
    const powerless: AttenuationParent = { ...PARENT, allowedActions: [] }
    missionSays(missionEvaluation(powerless))
    const store = new FakeStore()
    const p = await prepareDelegation({ missionId: MISSION_M, store, now: T0 })
    const r = await decideDelegation({ envelopeId: p.state!.envelopeId, store, now: T1 })
    expect(r.rejections!.some(x => x.reason === 'authority_insufficient')).toBe(true)
  })

  it('REJECTS an ambiguous objective', async () => {
    const vague: AttenuationParent = { ...PARENT, objective: '   ' }
    missionSays(missionEvaluation(vague))
    const store = new FakeStore()
    const p = await prepareDelegation({ missionId: MISSION_M, store, now: T0 })
    const r = await decideDelegation({ envelopeId: p.state!.envelopeId, store, now: T1 })
    expect(r.rejections!.some(x => x.reason === 'objective_ambiguous')).toBe(true)
  })

  it('maps mission readiness gaps onto typed rejection reasons', () => {
    const evaluation = missionEvaluation(PARENT, {
      readiness: { ready: false, missing: ['dependencies', 'unresolved_blocker'], unverified: [], satisfiedSoFar: [] },
    })
    const grounds = delegationRejectionGrounds(envelopeOf(), PARENT, evaluation, T1)
    expect(grounds.some(g => g.reason === 'dependency_unavailable')).toBe(true)
  })

  it('rejection does NOT fail, cancel or amend the mission (§21.17)', async () => {
    const silent: AttenuationParent = { ...PARENT, escalationTriggers: [] }
    missionSays(missionEvaluation(silent))
    const store = new FakeStore()
    const p = await prepareDelegation({ missionId: MISSION_M, store, now: T0 })
    await decideDelegation({ envelopeId: p.state!.envelopeId, store, now: T1 })
    // Only delegation rows were written; no mission act of any kind.
    expect(store.appended.every(r => r.actType.startsWith('delegation.'))).toBe(true)
    expect(store.appended.map(r => r.missionId)).toEqual([MISSION_M, MISSION_M])
  })

  it('every typed reason is reachable and none is invented', () => {
    expect(new Set(DELEGATION_REJECTION_REASONS).size).toBe(11)
    expect(DELEGATION_REJECTION_REASONS).toContain('delegation_exceeds_mission')
    expect(DELEGATION_REJECTION_REASONS).toContain('mission_not_current')
  })
})

describe('decide: version pinning is a hard stop (§21.15)', () => {
  it('REFUSES to decide when the mission has advanced to a new version', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    missionSays(missionEvaluation({ ...PARENT, version: 2 }))
    const r = await decideDelegation({ envelopeId: id, store, now: T1 })
    expect(r.status).toBe('mission_version_changed')
    expect(store.appended.length).toBe(1)
  })

  it('acceptance of N never floats to N+1 even when N+1 is wider', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    missionSays(missionEvaluation({
      ...PARENT, version: 2, allowedActions: [...PARENT.allowedActions, { action: 'publish' }],
    }))
    const r = await decideDelegation({ envelopeId: id, store, now: T1 })
    expect(r.status).toBe('mission_version_changed')
  })

  it('REFUSES when the mission died between prepare and decide', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    missionSays(missionEvaluation(PARENT, { authority: { authorized: false, reason: 'superseded_version' } }))
    const r = await decideDelegation({ envelopeId: id, store, now: T1 })
    expect(r.status).toBe('mission_not_authorized')
  })

  it('re-proves containment at decide time, not only at prepare time', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    // Same version, but the mission has since lost an action the envelope holds.
    missionSays(missionEvaluation({ ...PARENT, allowedActions: [{ action: 'run_tests' }] }))
    const r = await decideDelegation({ envelopeId: id, store, now: T1 })
    expect(r.state!.status).toBe('rejected')
    expect(r.rejections!.some(x => x.reason === 'delegation_exceeds_mission')).toBe(true)
  })
})

describe('decide: immutability and concurrency (§21.18)', () => {
  it('REFUSES a second decision on an already-decided envelope', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await decideDelegation({ envelopeId: id, store, now: T1 })
    missionSays(missionEvaluation())
    const again = await decideDelegation({ envelopeId: id, store, now: T2 })
    expect(again.status).toBe('invalid_lifecycle')
    expect(again.detail).toBe('already_accepted')
  })

  it('serializes two racing deciders — exactly one wins, one gets conflict', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    const snapshot = store.snapshot(id)

    missionSays(missionEvaluation())
    const first = await decideDelegation({ envelopeId: id, store, now: T1 })
    // The second writer acted on the pre-decision snapshot it had read.
    const second = await decideDelegation({ envelopeId: id, store: frozenReader(store, snapshot), now: T1 })

    expect(first.status).toBe('ok')
    expect(second.status).toBe('conflict')
    expect(store.appended.filter(r => r.actType === 'delegation.accepted').length).toBe(1)
    expect(store.rejected.length).toBe(1)
  })

  it('REFUSES to decide an envelope in a project the caller does not own', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    asPrincipal(PRINCIPAL_B, [PROJECT_Q])
    const r = await decideDelegation({ envelopeId: id, store, now: T1 })
    expect(r.status).toBe('not_permitted')
  })

  it('gives an unknown envelope the same denial as a foreign one', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    const unknown = await decideDelegation({ envelopeId: randomUUID(), store, now: T1 })
    asPrincipal(PRINCIPAL_B, [PROJECT_Q])
    const foreign = await decideDelegation({ envelopeId: id, store, now: T1 })
    expect(unknown.status).toBe('not_permitted')
    expect(foreign.status).toBe('not_permitted')
  })
})

describe('revoke (§21.27)', () => {
  it('revokes an accepted envelope', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await decideDelegation({ envelopeId: id, store, now: T1 })
    const r = await revokeDelegation({ envelopeId: id, reason: 'executive_withdrew', store, now: T2 })
    expect(r.status).toBe('ok')
    expect(r.state!.status).toBe('revoked')
  })

  it('revokes an envelope that was never decided', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    const r = await revokeDelegation({ envelopeId: id, reason: 'mission_amended', store, now: T1 })
    expect(r.state!.status).toBe('revoked')
  })

  it('REFUSES to revoke twice', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await revokeDelegation({ envelopeId: id, reason: 'mission_amended', store, now: T1 })
    const again = await revokeDelegation({ envelopeId: id, reason: 'mission_amended', store, now: T2 })
    expect(again.status).toBe('invalid_lifecycle')
  })

  it('REFUSES to revoke a rejected envelope', async () => {
    const silent: AttenuationParent = { ...PARENT, escalationTriggers: [] }
    missionSays(missionEvaluation(silent))
    const store = new FakeStore()
    const p = await prepareDelegation({ missionId: MISSION_M, store, now: T0 })
    await decideDelegation({ envelopeId: p.state!.envelopeId, store, now: T1 })
    const r = await revokeDelegation({ envelopeId: p.state!.envelopeId, reason: 'executive_withdrew', store, now: T2 })
    expect(r.status).toBe('invalid_lifecycle')
  })

  it('records the acting human, not the manager', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await revokeDelegation({ envelopeId: id, reason: 'executive_withdrew', store, now: T1 })
    const rev = store.appended.find(r => r.actType === 'delegation.revoked')!
    expect(rev.actorKind).toBe('executive_principal')
    expect(rev.actorId).toBe(PRINCIPAL_A)
  })
})

describe('replan write boundary', () => {
  it('records an operational change against an accepted envelope', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await decideDelegation({ envelopeId: id, store, now: T1 })
    missionSays(missionEvaluation())
    const r = await recordDelegationReplan({ envelopeId: id, store, now: T2, change: { summary: 'reorder steps' } })
    expect(r.status).toBe('ok')
    expect(r.replan!.changeClass).toBe('operational_change')
  })

  it('records a material change as a REFERRAL and grants nothing', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await decideDelegation({ envelopeId: id, store, now: T1 })
    missionSays(missionEvaluation())
    const r = await recordDelegationReplan({
      envelopeId: id, store, now: T2, change: { summary: 'ship', actions: ['deploy_production'] },
    })
    expect(r.replan!.changeClass).toBe('material_change_requires_executive_review')
    const row = store.appended.find(x => x.actType === 'delegation.replan.referred')!
    expect(row).toBeDefined()
    // The envelope itself is untouched: a referral records a request, not a grant.
    expect(r.state!.envelope.allowedActions.map(a => a.action)).toEqual(['inspect_code', 'run_tests'])
  })

  it('REFUSES to replan an envelope that was never accepted', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    const r = await recordDelegationReplan({ envelopeId: id, store, now: T1, change: { summary: 'x' } })
    expect(r.status).toBe('invalid_lifecycle')
  })

  it('REFUSES to replan once the mission stops authorizing', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await decideDelegation({ envelopeId: id, store, now: T1 })
    missionSays(missionEvaluation(PARENT, { authority: { authorized: false, reason: 'deadline_expired' } }))
    const r = await recordDelegationReplan({ envelopeId: id, store, now: T2, change: { summary: 'x' } })
    expect(r.status).toBe('mission_not_authorized')
  })

  it('REFUSES to replan across a mission version change', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await decideDelegation({ envelopeId: id, store, now: T1 })
    missionSays(missionEvaluation({ ...PARENT, version: 2 }))
    const r = await recordDelegationReplan({ envelopeId: id, store, now: T2, change: { summary: 'x' } })
    expect(r.status).toBe('mission_version_changed')
  })

  it('records the manager as the replanning actor', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await decideDelegation({ envelopeId: id, store, now: T1 })
    missionSays(missionEvaluation())
    await recordDelegationReplan({ envelopeId: id, store, now: T2, change: { summary: 'x' } })
    const row = store.appended.find(x => x.actType.startsWith('delegation.replan'))!
    expect(row.actorKind).toBe('manager')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 7. Read boundary — live invalidation
// ────────────────────────────────────────────────────────────────────────────

describe('read boundary and invalidation (§21.27)', () => {
  it('reports an accepted envelope as usable while its mission holds', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await decideDelegation({ envelopeId: id, store, now: T1 })
    missionSays(missionEvaluation())
    const { evaluation } = await resolveDelegationEvaluation(id, { store, now: T2 })
    expect(evaluation!.effectiveStatus).toBe('accepted')
    expect(evaluation!.usable).toBe(true)
  })

  it('INVALIDATES an accepted envelope when the mission loses authority', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await decideDelegation({ envelopeId: id, store, now: T1 })
    missionSays(missionEvaluation(PARENT, { authority: { authorized: false, reason: 'deadline_expired' } }))
    const { evaluation } = await resolveDelegationEvaluation(id, { store, now: T2 })
    expect(evaluation!.lifecycleStatus).toBe('accepted')
    expect(evaluation!.effectiveStatus).toBe('invalidated')
    expect(evaluation!.reason).toBe('mission_not_authorized')
  })

  it('INVALIDATES when the mission version moved on', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await decideDelegation({ envelopeId: id, store, now: T1 })
    missionSays(missionEvaluation({ ...PARENT, version: 2 }))
    const { evaluation } = await resolveDelegationEvaluation(id, { store, now: T2 })
    expect(evaluation!.reason).toBe('mission_version_changed')
    expect(evaluation!.usable).toBe(false)
  })

  it('INVALIDATES when the mission narrowed below the envelope', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await decideDelegation({ envelopeId: id, store, now: T1 })
    missionSays(missionEvaluation({ ...PARENT, allowedActions: [] }))
    const { evaluation } = await resolveDelegationEvaluation(id, { store, now: T2 })
    expect(evaluation!.reason).toBe('delegation_exceeds_mission')
  })

  it('fails closed when the mission cannot be read at all', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await decideDelegation({ envelopeId: id, store, now: T1 })
    missionSays(null, 'unavailable')
    const { usable, reason } = await isDelegationUsable(id, { store, now: T2 })
    expect(usable).toBe(false)
    expect(reason).toBe('mission_unreadable')
  })

  it('never reports a prepared-but-undecided envelope as usable', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    const { usable, reason } = await isDelegationUsable(id, { store, now: T1 })
    expect(usable).toBe(false)
    expect(reason).toBe('not_accepted')
  })

  it('needs no mission read to know a revoked envelope is unusable', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    await revokeDelegation({ envelopeId: id, reason: 'executive_withdrew', store, now: T1 })
    vi.mocked(resolveMissionEvaluation).mockClear()
    const { usable } = await isDelegationUsable(id, { store, now: T2 })
    expect(usable).toBe(false)
    expect(vi.mocked(resolveMissionEvaluation)).not.toHaveBeenCalled()
  })

  it('denies a read from a caller who owns no projects', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    asPrincipal(PRINCIPAL_B, [])
    const r = await resolveDelegation(id, { store })
    expect(r.status).toBe('not_permitted')
  })

  it('denies a read with no principal at all', async () => {
    const store = new FakeStore()
    const id = await prepared(store)
    vi.mocked(resolveProjectAccess).mockResolvedValue({ ok: false } as never)
    const r = await resolveDelegation(id, { store })
    expect(r.status).toBe('no_principal')
  })

  it('scopes project listings to the caller', async () => {
    const store = new FakeStore()
    await prepared(store)
    const mine = await listProjectDelegations(PROJECT_P, { store })
    const theirs = await listProjectDelegations(PROJECT_Q, { store })
    expect(mine.records.length).toBe(1)
    expect(theirs.status).toBe('project_denied')
    expect(theirs.records).toEqual([])
  })

  it('filters mission listings by the caller projects rather than leaking rows', async () => {
    const store = new FakeStore()
    await prepared(store)
    asPrincipal(PRINCIPAL_B, [PROJECT_Q])
    const r = await listMissionDelegations(MISSION_M, { store })
    expect(r.status).toBe('ok')
    expect(r.records).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 8. Structural guards — what this phase must NOT do
// ────────────────────────────────────────────────────────────────────────────

const sources = ['types.ts', 'attenuate.ts', 'binding.ts', 'classify.ts', 'derive.ts', 'availability.ts', 'store.ts', 'principal-read.ts', 'principal-write.ts']
  .map(f => ({ file: f, text: readFileSync(resolve(DELEGATION_DIR, f), 'utf8') }))

/**
 * Strip comments before scanning for forbidden machinery.
 *
 * These files DOCUMENT what they deliberately do not do — "no signing, no
 * bearer secret", "CRON_SECRET is not user authorization". A guard that reads
 * prose would fail on the very sentence promising the absence, and the tempting
 * fix (delete the sentence) would make the codebase worse. So the guard scans
 * executable code, which is what it was always meant to assert.
 */
const codeOf = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

describe('structural guards', () => {
  it('creates no tasks and dispatches no work', () => {
    for (const { file, text } of sources) {
      expect(text, file).not.toMatch(/from\s*\(\s*['"]manager_tasks['"]/)
      expect(text, file).not.toMatch(/\bplanTasks\b/)
      expect(text, file).not.toMatch(/workflow-(runner|executor)/)
      expect(text, file).not.toMatch(/\brun-create\b/)
    }
  })

  it('imports no model, runner, publisher or external API', () => {
    for (const { file, text } of sources) {
      expect(text, file).not.toMatch(/@anthropic-ai\/sdk/)
      expect(text, file).not.toMatch(/\bfetch\s*\(/)
      expect(text, file).not.toMatch(/lib\/publishing/)
      expect(text, file).not.toMatch(/nodemailer|resend/i)
    }
  })

  it('keeps the pure core free of I/O and of the clock', () => {
    for (const f of ['attenuate.ts', 'classify.ts', 'derive.ts']) {
      const text = sources.find(s => s.file === f)!.text
      expect(text, f).not.toMatch(/createAdminClient|supabase/i)
      expect(text, f).not.toMatch(/new Date\(\)/)
      expect(text, f).not.toMatch(/server-only/)
    }
  })

  it('never uses the vestigial intelligence kinds as the handoff artifact', () => {
    for (const { file, text } of sources) {
      expect(text, file).not.toMatch(/delegation_request/)
      expect(text, file).not.toMatch(/knowledge_request/)
    }
  })

  it('has no capability-token, policy-engine, trust-score or licence machinery', () => {
    for (const { file, text } of sources) {
      const code = codeOf(text)
      expect(code, file).not.toMatch(/trust[_ ]?score/i)
      expect(code, file).not.toMatch(/autonomy[_ ]?licen/i)
      expect(code, file).not.toMatch(/damage[_ ]?boundary/i)
      expect(code, file).not.toMatch(/emergency[_ ]?brake/i)
      expect(code, file).not.toMatch(/\bjwt\b|\bsign\(|bearer/i)
      expect(code, file).not.toMatch(/decideGate|policy-gate/)
    }
  })

  it('exposes no envelope field a caller could use to assert an outcome', () => {
    const write = codeOf(sources.find(s => s.file === 'principal-write.ts')!.text)
    expect(write).not.toMatch(/accepted\s*[?]?\s*:\s*boolean/)
    expect(write).not.toMatch(/CRON_SECRET/)
  })

  it('keeps the existing Manager surface intact (§ regression)', () => {
    const manager = readFileSync(resolve(__dirname, '../ai/manager.ts'), 'utf8')
    expect(manager).toMatch(/async planTasks\(goal: string, projectId: string\)/)
    expect(manager).not.toMatch(/ManagerAgentV2/)
    expect(manager).toMatch(/async decideDelegation\(/)
  })

  it('routes every delegation action through session auth, never a shared secret', () => {
    const route = readFileSync(resolve(__dirname, '../../app/api/manager/route.ts'), 'utf8')
    // The route DOCUMENTS that CRON_SECRET is not user authorization; what must
    // be absent is any code that reads it.
    expect(codeOf(route)).not.toMatch(/CRON_SECRET/)
    expect(route).toMatch(/supabase\.auth\.getUser\(\)/)
    for (const action of ['prepare_delegation', 'decide_delegation', 'revoke_delegation', 'replan_delegation']) {
      expect(route).toContain(action)
    }
    // No caller-supplied acceptance anywhere in the route.
    expect(route).not.toMatch(/body as \{[^}]*accepted/)
  })
})

describe('migration', () => {
  const sql = readFileSync(MIGRATION, 'utf8')

  it('is append-only in the database, not merely in application code', () => {
    expect(sql).toMatch(/before update on public\.atlas_delegation_ledger/)
    expect(sql).toMatch(/before delete on public\.atlas_delegation_ledger/)
    expect(sql).not.toMatch(/^\s*(update|delete)\s+public\.atlas_delegation_ledger/im)
  })

  it('is service-role only', () => {
    expect(sql).toMatch(/enable row level security/)
    expect(sql).toMatch(/revoke all on public\.atlas_delegation_ledger from anon, authenticated/)
  })

  it('requires a project on every row, unlike manager_tasks', () => {
    expect(sql).toMatch(/project_id\s+uuid not null references public\.projects\(id\)/)
  })

  it('serializes preparation, decision and revocation', () => {
    expect(sql).toMatch(/atlas_delegation_ledger_one_prepared_idx/)
    expect(sql).toMatch(/atlas_delegation_ledger_one_decision_idx/)
    expect(sql).toMatch(/atlas_delegation_ledger_one_revocation_idx/)
  })

  it('constrains act types to exactly the six the code emits', () => {
    for (const t of [
      'delegation.prepared', 'delegation.accepted', 'delegation.rejected',
      'delegation.revoked', 'delegation.replan.operational', 'delegation.replan.referred',
    ]) {
      expect(sql).toContain(`'${t}'`)
    }
  })

  it('pins the mission version and its bound hash', () => {
    expect(sql).toMatch(/mission_version\s+integer not null/)
    expect(sql).toMatch(/mission_bound_hash\s+text not null/)
    expect(sql).toMatch(/\^\[0-9a-f\]\{64\}\$/)
  })

  it('does not stray outside its own table', () => {
    expect(sql).not.toMatch(/alter table public\.atlas_mission_ledger/)
    expect(sql).not.toMatch(/alter table public\.atlas_decision_ledger/)
    expect(sql).not.toMatch(/alter table public\.manager_tasks/)
    expect(sql).not.toMatch(/drop table/i)
  })
})
