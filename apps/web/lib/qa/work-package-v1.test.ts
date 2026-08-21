/**
 * Manager → Workforce Bounded Work Package V1 (EI-S1.4D).
 *
 * ADVERSARIAL BY CONSTRUCTION. Almost every test is an attempt to obtain
 * authority the chain never granted: widen a bound, drop a prohibition, assign
 * to a role that does not exist or belongs to another project, keep using a
 * package whose Delegation was revoked, or make assignment mean execution.
 *
 * The Delegation evaluation seam is doubled, not stubbed permissively: it
 * returns a real `DelegationEvaluation` and every test that depends on the
 * authority chain sets it explicitly. A blanket "always usable" double would
 * hide the §21.14 gate, which is the most important thing at this hop.
 *
 * The role registry is injected rather than mocked globally, so the tests
 * exercise the real `evaluateRoleFitness` logic against controlled rows.
 *
 * Filesystem/local only: no database, no network, no credentials, and — asserted
 * below — no runner, executor, publisher, task dispatch or model of any kind.
 */

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/project-access', () => ({ resolveProjectAccess: vi.fn() }))
vi.mock('@/lib/atlas/delegation/principal-read', () => ({ resolveDelegationEvaluation: vi.fn() }))

import { resolveProjectAccess } from '@/lib/auth/project-access'
import { resolveDelegationEvaluation } from '@/lib/atlas/delegation/principal-read'

import { attenuate } from '@/lib/atlas/delegation/attenuate'
import { missionBoundHash } from '@/lib/atlas/delegation/binding'
import type { AttenuationParent } from '@/lib/atlas/delegation/attenuate'
import type { DelegationEnvelope } from '@/lib/atlas/delegation/types'

import {
  attenuateWorkPackage,
  workPackageIsContained,
  WORK_PACKAGE_FIELD_CLASS,
  type WorkPackageRequest,
} from '@/lib/atlas/workpackage/attenuate'
import { delegationBoundHash, workPackageHash } from '@/lib/atlas/workpackage/binding'
import { evaluateRoleEligibility, type WorkforceRole } from '@/lib/atlas/workpackage/roles'
import { validateStoredWorkPackage, WORK_PACKAGE_SOURCE } from '@/lib/atlas/workpackage/validate'
import { validateWorkPackageTerms, WORK_PACKAGE_V1_VERSION } from '@/lib/atlas/workpackage/attenuate'
import { assertAssignedContractCoherent, isCompleteCanonicalRow } from '@/lib/atlas/workpackage/store'
import { assignWorkPackage, prepareWorkPackage } from '@/lib/atlas/workpackage/principal-write'
import { isWorkPackageUsable, resolveWorkPackage, listProjectWorkPackages } from '@/lib/atlas/workpackage/principal-read'
import type { StoredWorkPackage, StoredWorkPackageColumns, WorkPackageStore } from '@/lib/atlas/workpackage/store'
import { WORK_PACKAGE_REJECTION_REASONS, type WorkPackage } from '@/lib/atlas/workpackage/types'

const WP_DIR = resolve(__dirname, '../atlas/workpackage')
const MIGRATION = resolve(__dirname, '../../supabase/migrations/20260820_manager_tasks_work_packages.sql')

const PRINCIPAL_A = '11111111-1111-4111-8111-111111111111'
const PROJECT_P = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROJECT_Q = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const MISSION_M = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ENVELOPE_E = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const ROLE_R = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const ROLE_FOREIGN = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

const T0 = '2026-08-20T08:00:00.000Z'
const T1 = '2026-08-20T09:00:00.000Z'
const DEADLINE = '2026-09-20T08:00:00.000Z'

/**
 * A Delegation whose capabilities are actually provable in Stage 1: read-only
 * scopes on REGISTERED domains, and no tools — because no tool registry exists,
 * so a declared tool can never be proven and would make every fixture vacuous.
 */
const MISSION_PARENT: AttenuationParent = {
  missionId: MISSION_M, projectId: PROJECT_P, version: 1,
  objective: 'Make the short-news workflow safe enough for a bounded trial.',
  expectedOutcome: 'A validated short-news path.',
  deliverables: ['Validation report'],
  successCriteria: [{ criterion: 'Isolation validated', level: 'minimum' }],
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

function envelopeOf(parent: AttenuationParent = MISSION_PARENT): DelegationEnvelope {
  const r = attenuate(parent)
  if (!r.ok) throw new Error(`fixture: ${JSON.stringify(r.violations)}`)
  return { ...r.envelope, envelopeId: ENVELOPE_E, missionBoundHash: missionBoundHash(parent) }
}

const ROLE: WorkforceRole = {
  roleId: ROLE_R, roleName: 'short-news-specialist', projectId: PROJECT_P,
  declaredSkills: ['writing'],
}

const baseRequest = (over: Partial<WorkPackageRequest> = {}): WorkPackageRequest => ({
  taskObjective: 'Validate isolation across the short-news workflow.',
  role: { roleId: ROLE_R, roleName: 'short-news-specialist' },
  inputs: [
    { inputId: 'in-1', description: 'Current workflow definition', origin: 'delegation' },
    { inputId: 'in-2', description: 'Recent runs', origin: 'data_scope', resource: 'runs' },
  ],
  expectedOutput: [
    { outputId: 'out-1', description: 'Isolation validation notes', verification: 'test output attached' },
  ],
  ...over,
})

function delegationEvaluation(
  envelope: DelegationEnvelope = envelopeOf(),
  over: Record<string, unknown> = {},
) {
  return {
    lifecycleStatus: 'accepted',
    effectiveStatus: 'accepted',
    usable: true,
    reason: 'usable',
    missionAuthority: 'authorized',
    state: {
      envelopeId: envelope.envelopeId,
      projectId: envelope.projectId,
      status: 'accepted',
      envelope,
      missionId: envelope.missionId,
      missionVersion: envelope.missionVersion,
      missionBoundHash: envelope.missionBoundHash,
      preparedAt: T0,
      decidedAt: T1,
      rejections: [],
      revokedReason: null,
      referrals: [],
    },
    ...over,
  }
}

/** DB-faithful to the migration: one canonical package per id; contract immutable. */
class FakeStore implements WorkPackageStore {
  assigned: StoredWorkPackage[] = []
  constructor(private rows: StoredWorkPackage[] = []) {}
  async assign(input: { workPackage: WorkPackage; title: string; description: string | null; at: string }) {
    if (this.rows.some(r => r.workPackage.workPackageId === input.workPackage.workPackageId)) {
      const { WorkPackageConflictError } = await import('@/lib/atlas/workpackage/store')
      throw new WorkPackageConflictError('duplicate key (23505)')
    }
    const stored: StoredWorkPackage = {
      taskId: randomUUID(), workPackage: input.workPackage, assignedAt: input.at, legacyStatus: 'pending',
      columns: columnsOf(input.workPackage),
    }
    this.assigned.push(stored); this.rows.push(stored); return stored
  }
  async byPackageId(id: string) { return this.rows.find(r => r.workPackage.workPackageId === id) ?? null }
  async byEnvelope(e: string) { return this.rows.filter(r => r.workPackage.envelopeId === e) }
  async byProject(p: string) { return this.rows.filter(r => r.workPackage.projectId === p) }
}

/** The relational half a coherent row would carry, derived from the JSON. */
const columnsOf = (p: WorkPackage): StoredWorkPackageColumns => ({
  workPackageId: p.workPackageId,
  projectId: p.projectId,
  workPackageHash: p.packageHash,
  delegationEnvelopeId: p.envelopeId,
  delegationBoundHash: p.delegationBoundHash,
  missionId: p.missionId,
  missionVersion: p.missionVersion,
  missionBoundHash: p.missionBoundHash,
  workforceRoleId: p.assignedRole.roleId,
  source: 'work_package',
  sourceKey: p.workPackageId,
})

const roleReader = (roles: WorkforceRole[]) => async (id: string) => roles.find(r => r.roleId === id) ?? null

const asPrincipal = (userId: string, projects: string[]) =>
  vi.mocked(resolveProjectAccess).mockResolvedValue({ ok: true, userId, allowedProjectIds: projects } as never)

const delegationSays = (evaluation: unknown, status = 'ok') =>
  vi.mocked(resolveDelegationEvaluation).mockResolvedValue({ evaluation, status } as never)

beforeEach(() => {
  vi.clearAllMocks()
  asPrincipal(PRINCIPAL_A, [PROJECT_P])
  delegationSays(delegationEvaluation())
})

// ────────────────────────────────────────────────────────────────────────────
// 1. Attenuation core — pure, no mocks
// ────────────────────────────────────────────────────────────────────────────

describe('attenuation: WorkPackage ⊆ Delegation (§6.39)', () => {
  const parent = envelopeOf()
  const hash = delegationBoundHash(parent)
  const attenuateReq = (over: Partial<WorkPackageRequest> = {}) =>
    attenuateWorkPackage(parent, baseRequest(over), hash)

  it('inherits every bound when nothing is narrowed', () => {
    const r = attenuateReq()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.package.allowedActions).toEqual(parent.allowedActions)
    expect(r.package.forbiddenActions).toEqual(parent.forbiddenActions)
    expect(r.package.budget).toEqual(parent.budget)
    expect(r.package.deadline).toBe(DEADLINE)
  })

  it('accepts a narrower package', () => {
    const r = attenuateReq({
      allowedActions: [{ action: 'run_tests' }],
      dataScope: [{ resource: 'runs', access: 'read' }],
      budget: { currency: 'SEK', limitMinor: 1000 },
      deadline: '2026-09-01T00:00:00.000Z',
      inScope: ['short-news workflow'],
    })
    expect(r.ok).toBe(true)
  })

  it('accepts equal bounds', () => {
    const r = attenuateReq({
      allowedActions: parent.allowedActions,
      dataScope: parent.dataScope,
      budget: parent.budget,
      deadline: parent.deadline,
    })
    expect(r.ok).toBe(true)
  })

  it('REFUSES adding an action the Delegation lacks', () => {
    const r = attenuateReq({ allowedActions: [{ action: 'deploy_production' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations.some(v => v.field === 'allowedActions')).toBe(true)
  })

  it('REFUSES adding an authority bound the Delegation lacks', () => {
    expect(attenuateReq({ authority: [{ action: 'sign_contracts' }] }).ok).toBe(false)
  })

  it('REFUSES adding a tool outside the Delegation', () => {
    expect(attenuateReq({ tools: [{ tool: 'ssh' }] }).ok).toBe(false)
  })

  it('REFUSES dropping a tool restriction', () => {
    const restricted = envelopeOf({ ...MISSION_PARENT, tools: [{ tool: 'publish', restriction: 'draft only' }] })
    const r = attenuateWorkPackage(restricted, baseRequest({ tools: [{ tool: 'publish' }] }),
      delegationBoundHash(restricted))
    expect(r.ok).toBe(false)
  })

  it('REFUSES widening data access from read to write', () => {
    const r = attenuateReq({ dataScope: [{ resource: 'runs', access: 'write' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations.some(v => v.element === 'runs:write')).toBe(true)
  })

  it('REFUSES a resource the Delegation never scoped', () => {
    expect(attenuateReq({ dataScope: [{ resource: 'platform_tokens', access: 'read' }] }).ok).toBe(false)
  })

  it('REFUSES increasing the budget', () => {
    const r = attenuateReq({ budget: { currency: 'SEK', limitMinor: 500001 } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations[0].rule).toBe('exceeds_parent')
  })

  it('REFUSES a currency swap', () => {
    expect(attenuateReq({ budget: { currency: 'USD', limitMinor: 1 } }).ok).toBe(false)
  })

  it('REFUSES extending the deadline', () => {
    const r = attenuateReq({ deadline: '2026-12-01T00:00:00.000Z' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations[0].rule).toBe('exceeds_parent')
  })

  it('REFUSES dropping an inherited deadline', () => {
    const r = attenuateReq({ deadline: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations[0].rule).toBe('removes_inherited')
  })

  it('keeps every inherited prohibition, and removing one is UNREPRESENTABLE', () => {
    const r = attenuateReq({ addForbiddenActions: [{ action: 'send_email' }] })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.package.forbiddenActions.map(a => a.action))
        .toEqual(['publish', 'deploy_production', 'send_email'])
    }
    // The request type has no `forbiddenActions` key at all — only `add…`.
    const keys: (keyof WorkPackageRequest)[] = [
      'taskObjective', 'role', 'inputs', 'expectedOutput',
      'authority', 'allowedActions', 'tools', 'dataScope', 'inScope', 'budget', 'deadline',
      'addForbiddenActions', 'addConstraints', 'addEscalationTriggers',
      'addStopConditions', 'addApprovalGates', 'addOutOfScope', 'addReporting',
      'dependencies', 'fallback',
    ]
    expect(keys).not.toContain('forbiddenActions' as never)
    expect(keys).not.toContain('projectId' as never)
    expect(keys).not.toContain('missionId' as never)
    expect(keys).not.toContain('envelopeId' as never)
  })

  it('inherits constraints, gates, stop conditions and escalation', () => {
    const r = attenuateReq()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.package.constraints).toEqual(parent.constraints)
    expect(r.package.approvalGates).toEqual(parent.approvalGates)
    expect(r.package.stopConditions).toEqual(parent.stopConditions)
    expect(r.package.escalationTriggers).toEqual(parent.escalationTriggers)
  })

  it('takes project, mission and delegation identity from the parent only', () => {
    const r = attenuateReq()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.package.projectId).toBe(PROJECT_P)
    expect(r.package.missionId).toBe(MISSION_M)
    expect(r.package.envelopeId).toBe(ENVELOPE_E)
    expect(r.package.missionVersion).toBe(1)
  })

  it('reports EVERY violation, not just the first', () => {
    const r = attenuateReq({
      allowedActions: [{ action: 'publish' }],
      tools: [{ tool: 'ssh' }],
      budget: { currency: 'SEK', limitMinor: 999999 },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations.length).toBeGreaterThanOrEqual(3)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 2. Decomposition (§21.28)
// ────────────────────────────────────────────────────────────────────────────

describe('decomposition is bounded, not free (§21.28)', () => {
  const parent = envelopeOf()
  const hash = delegationBoundHash(parent)
  const req = (over: Partial<WorkPackageRequest> = {}) =>
    attenuateWorkPackage(parent, baseRequest(over), hash)

  it('allows a task objective that differs from the Delegation objective', () => {
    const r = req({ taskObjective: 'Only re-run the isolation suite and record results.' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.package.taskObjective).not.toBe(parent.objective)
  })

  it('REFUSES an empty objective', () => {
    expect(req({ taskObjective: '   ' }).ok).toBe(false)
  })

  it('REFUSES a package with no declared output — nothing verifiable', () => {
    expect(req({ expectedOutput: [] }).ok).toBe(false)
  })

  it('REFUSES work in explicitly out-of-scope territory', () => {
    const r = req({ inScope: ['newsletter sending'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations.some(v => v.field === 'inScope')).toBe(true)
  })

  it('REFUSES scope the Delegation never held', () => {
    expect(req({ inScope: ['billing migration'] }).ok).toBe(false)
  })

  it('REFUSES an item the parent lists as BOTH in and out of scope', () => {
    // The out-of-scope guard is redundant with subset-containment for ordinary
    // parents, and load-bearing only for a self-contradictory one. An exclusion
    // must win over an inclusion naming the same thing, so a Manager cannot
    // pick the reading that suits it.
    const contradictory = envelopeOf({
      ...MISSION_PARENT,
      inScope: [...MISSION_PARENT.inScope, 'newsletter sending'],
    })
    const r = attenuateWorkPackage(
      contradictory,
      baseRequest({ inScope: ['newsletter sending'] }),
      delegationBoundHash(contradictory),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations.some(v => v.field === 'inScope')).toBe(true)
  })

  it('REFUSES a data_scope input naming a resource the package cannot read', () => {
    const r = req({
      dataScope: [{ resource: 'runs', access: 'read' }],
      inputs: [{ inputId: 'in-1', description: 'Site copy', origin: 'data_scope', resource: 'website_content' }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations.some(v => v.field === 'inputs')).toBe(true)
  })

  it('REFUSES a dependency requiring an input the package does not declare', () => {
    const r = req({
      dependencies: [{
        requiredInputs: ['in-missing'], expectedOutputs: [], owner: 'role-x',
        blockingState: 'missing upstream artifact',
      }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violations.some(v => v.field === 'dependencies')).toBe(true)
  })

  it('records dependencies as contract data with no scheduling', () => {
    const r = req({
      dependencies: [{
        predecessorPackageId: null, requiredInputs: ['in-1'], expectedOutputs: ['out-1'],
        owner: 'role-x', blockingState: 'upstream not delivered', fallback: 'escalate to Manager',
      }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.package.dependencies[0].blockingState).toBe('upstream not delivered')
  })

  it('the task objective carries no authority of its own', () => {
    // Objective prose asks for something the bounds forbid; the bounds win.
    const r = req({ taskObjective: 'Publish the short-news digest to production immediately.' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.package.allowedActions.map(a => a.action)).not.toContain('publish')
    expect(r.package.forbiddenActions.map(a => a.action)).toContain('publish')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 3. Field classification guard
// ────────────────────────────────────────────────────────────────────────────

describe('Work Package field-classification guard', () => {
  const parent = envelopeOf()
  const built = attenuateWorkPackage(parent, baseRequest(), delegationBoundHash(parent))

  it('classifies EVERY WorkPackage field, with none unruled', () => {
    expect(built.ok).toBe(true)
    if (!built.ok) return
    const pkg: WorkPackage = { ...built.package, workPackageId: 'x', packageHash: 'y' }
    expect(Object.keys(WORK_PACKAGE_FIELD_CLASS).sort()).toEqual(Object.keys(pkg).sort())
  })

  it('assigns each field exactly one of the six classes', () => {
    const allowed = ['pin', 'assigned', 'decomposed', 'narrowable', 'restrictive', 'derived']
    for (const [field, cls] of Object.entries(WORK_PACKAGE_FIELD_CLASS)) {
      expect(allowed, field).toContain(cls)
    }
  })

  it('every restrictive field is actually re-proved as a superset', () => {
    if (!built.ok) return
    const restrictive = Object.entries(WORK_PACKAGE_FIELD_CLASS)
      .filter(([, c]) => c === 'restrictive').map(([f]) => f)
    expect(restrictive.sort()).toEqual([
      'approvalGates', 'constraints', 'escalationTriggers',
      'forbiddenActions', 'outOfScope', 'reporting', 'stopConditions',
    ])
    for (const field of restrictive) {
      const emptied = { ...built.package, workPackageId: 'x', packageHash: 'y', [field]: [] } as never
      expect(
        workPackageIsContained(parent, emptied).some(v => v.field === field && v.rule === 'removes_inherited'),
        field,
      ).toBe(true)
    }
  })

  it('every pin field is re-proved against the parent', () => {
    if (!built.ok) return
    const base: WorkPackage = { ...built.package, workPackageId: 'x', packageHash: 'y' }
    expect(workPackageIsContained(parent, { ...base, projectId: PROJECT_Q }).some(v => v.field === 'projectId')).toBe(true)
    expect(workPackageIsContained(parent, { ...base, missionId: 'other' }).some(v => v.field === 'missionId')).toBe(true)
    expect(workPackageIsContained(parent, { ...base, envelopeId: 'other' }).some(v => v.field === 'envelopeId')).toBe(true)
    expect(workPackageIsContained(parent, { ...base, missionVersion: 9 }).some(v => v.field === 'missionVersion')).toBe(true)
    expect(workPackageIsContained(parent, { ...base, missionBoundHash: 'a'.repeat(64) })
      .some(v => v.field === 'missionBoundHash')).toBe(true)
  })

  it('a correctly attenuated package re-proves clean', () => {
    if (!built.ok) return
    expect(workPackageIsContained(parent, { ...built.package, workPackageId: 'x', packageHash: 'y' })).toEqual([])
  })

  it('every typed rejection reason is declared once', () => {
    expect(new Set(WORK_PACKAGE_REJECTION_REASONS).size).toBe(WORK_PACKAGE_REJECTION_REASONS.length)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 4. Pins and hashes
// ────────────────────────────────────────────────────────────────────────────

describe('parent pin (§21.14/§21.15)', () => {
  it('the delegation bound hash is stable across member order', () => {
    const a = envelopeOf()
    const b: DelegationEnvelope = {
      ...a,
      allowedActions: [...a.allowedActions].reverse(),
      dataScope: [...a.dataScope].reverse(),
    }
    expect(delegationBoundHash(b)).toBe(delegationBoundHash(a))
  })

  it('changes when a delegable bound moves', () => {
    const a = envelopeOf()
    const wider: DelegationEnvelope = { ...a, budget: { currency: 'SEK', limitMinor: 999999 } }
    expect(delegationBoundHash(wider)).not.toBe(delegationBoundHash(a))
  })

  it('does NOT change when only prose moves', () => {
    const a = envelopeOf()
    const reworded: DelegationEnvelope = { ...a, objective: 'Completely different wording.' }
    expect(delegationBoundHash(reworded)).toBe(delegationBoundHash(a))
  })

  it('the package hash covers the assigned role', () => {
    const parent = envelopeOf()
    const built = attenuateWorkPackage(parent, baseRequest(), delegationBoundHash(parent))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    const base = { ...built.package, workPackageId: 'wp-1' }
    const reassigned = { ...base, assignedRole: { roleId: ROLE_FOREIGN, roleName: 'other' } }
    expect(workPackageHash(reassigned)).not.toBe(workPackageHash(base))
  })

  it('both hashes are sha256 hex', () => {
    const parent = envelopeOf()
    expect(delegationBoundHash(parent)).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 5. Role registry and fitness (§21.34/§21.35)
// ────────────────────────────────────────────────────────────────────────────

describe('workforce role fitness', () => {
  const fit = (over: Parameters<typeof evaluateRoleEligibility>[0]) => evaluateRoleEligibility(over)

  it('accepts a real role in the right project with provable data', () => {
    const r = fit({
      role: ROLE, projectId: PROJECT_P, tools: [],
      dataScope: [{ resource: 'runs', access: 'read' }], provenTools: new Set(),
    })
    expect(r.eligible).toBe(true)
  })

  it('REFUSES an unknown role', () => {
    const r = fit({ role: null, projectId: PROJECT_P, tools: [], dataScope: [], provenTools: new Set() })
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('role_not_found')
  })

  it('REFUSES a role from another project (§21.158)', () => {
    const r = fit({
      role: { ...ROLE, projectId: PROJECT_Q }, projectId: PROJECT_P,
      tools: [], dataScope: [], provenTools: new Set(),
    })
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('role_project_mismatch')
  })

  it('REFUSES unprovable data access', () => {
    const r = fit({
      role: ROLE, projectId: PROJECT_P, tools: [],
      dataScope: [{ resource: 'platform_tokens', access: 'read' }], provenTools: new Set(),
    })
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('data_domain_unsanctioned')
  })

  it('REFUSES write access — the registry proves reads only', () => {
    const r = fit({
      role: ROLE, projectId: PROJECT_P, tools: [],
      dataScope: [{ resource: 'runs', access: 'write' }], provenTools: new Set(),
    })
    expect(r.eligible).toBe(false)
  })

  it('REFUSES a tool the parent Delegation never proved', () => {
    const r = fit({
      role: ROLE, projectId: PROJECT_P, tools: [{ tool: 'ssh' }],
      dataScope: [], provenTools: new Set(),
    })
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('tool_unproven_at_parent')
  })

  it('accepts a tool the parent Delegation already proved', () => {
    const r = fit({
      role: ROLE, projectId: PROJECT_P, tools: [{ tool: 'repo_read', restriction: 'apps/web only' }],
      dataScope: [], provenTools: new Set(['repo_read apps/web only']),
    })
    expect(r.eligible).toBe(true)
  })

  it('never infers capability from declared skills', () => {
    const src = readFileSync(resolve(WP_DIR, 'roles.ts'), 'utf8')
    // `declaredSkills` is carried for reporting and must never gate fitness.
    const fitnessFn = src.slice(src.indexOf('export function evaluateRoleEligibility'))
    expect(fitnessFn).not.toMatch(/declaredSkills/)
  })

  it('implements no Trust Score, Autonomy Licence or Damage Boundary', () => {
    const src = readFileSync(resolve(WP_DIR, 'roles.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    expect(src).not.toMatch(/trust[_ ]?score/i)
    expect(src).not.toMatch(/autonomy[_ ]?licen/i)
    expect(src).not.toMatch(/damage[_ ]?boundary/i)
    expect(src).not.toMatch(/performance[_ ]?intelligence/i)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 6. Write boundary — parent authority, isolation, assignment
// ────────────────────────────────────────────────────────────────────────────

const writeArgs = (store: FakeStore, over: Record<string, unknown> = {}) => ({
  envelopeId: ENVELOPE_E,
  request: baseRequest(),
  store,
  now: T1,
  roleReader: roleReader([ROLE]),
  ...over,
})

describe('the parent Delegation is the authority (§21.14)', () => {
  it('creates a package from an accepted usable Delegation', async () => {
    const store = new FakeStore()
    const r = await assignWorkPackage(writeArgs(store))
    expect(`${r.status}${r.detail ? `:${r.detail}` : ''}`).toBe('ok')
    expect(store.assigned.length).toBe(1)
  })

  it.each([
    ['rejected', { lifecycleStatus: 'rejected', usable: false, reason: 'rejected' }],
    ['revoked', { lifecycleStatus: 'revoked', usable: false, reason: 'revoked' }],
    ['invalidated', { effectiveStatus: 'invalidated', usable: false, reason: 'mission_not_authorized' }],
    ['mission ended', { effectiveStatus: 'invalidated', usable: false, reason: 'mission_ended' }],
    ['mission version stale', { effectiveStatus: 'invalidated', usable: false, reason: 'mission_version_changed' }],
    ['bound hash stale', { effectiveStatus: 'invalidated', usable: false, reason: 'mission_bound_hash_changed' }],
    ['no longer contained', { effectiveStatus: 'invalidated', usable: false, reason: 'delegation_exceeds_mission' }],
  ] as const)('REFUSES to create a package when the Delegation is %s', async (_name, over) => {
    delegationSays(delegationEvaluation(envelopeOf(), over as Record<string, unknown>))
    const store = new FakeStore()
    const r = await assignWorkPackage(writeArgs(store))
    expect(r.status).toBe('delegation_not_usable')
    expect(store.assigned).toEqual([])
  })

  it('REFUSES a Delegation whose lifecycle is not accepted, even if it claims usable', async () => {
    // Defensive by design: the EI-S1.4C boundary only reports `usable` for an
    // accepted envelope, so this pairing cannot arise today. It is asserted
    // anyway, because this hop must not inherit that guarantee as an
    // assumption from a module it does not control.
    delegationSays(delegationEvaluation(envelopeOf(), {
      lifecycleStatus: 'rejected', usable: true, reason: 'usable',
    }))
    const store = new FakeStore()
    const r = await assignWorkPackage(writeArgs(store))
    expect(r.status).toBe('delegation_not_usable')
    expect(r.detail).toBe('delegation_rejected')
    expect(store.assigned).toEqual([])
  })

  it('REFUSES without a principal', async () => {
    vi.mocked(resolveProjectAccess).mockResolvedValue({ ok: false } as never)
    const r = await assignWorkPackage(writeArgs(new FakeStore()))
    expect(r.status).toBe('no_principal')
  })

  it('REFUSES a Delegation in a project the caller does not own', async () => {
    asPrincipal(PRINCIPAL_A, [PROJECT_Q])
    const r = await assignWorkPackage(writeArgs(new FakeStore()))
    expect(r.status).toBe('not_permitted')
  })

  it('gives an unknown envelope the same denial as a foreign one', async () => {
    delegationSays(null, 'not_permitted')
    const unknown = await assignWorkPackage(writeArgs(new FakeStore()))
    delegationSays(delegationEvaluation())
    asPrincipal(PRINCIPAL_A, [PROJECT_Q])
    const foreign = await assignWorkPackage(writeArgs(new FakeStore()))
    expect(unknown.status).toBe('not_permitted')
    expect(foreign.status).toBe('not_permitted')
  })

  it('takes the project from the chain, and a caller cannot supply one', async () => {
    const store = new FakeStore()
    const r = await assignWorkPackage(writeArgs(store, { projectId: PROJECT_Q } as never))
    expect(r.workPackage!.projectId).toBe(PROJECT_P)
  })

  it('a canonical package can never carry a null project', async () => {
    const store = new FakeStore()
    await assignWorkPackage(writeArgs(store))
    expect(store.assigned[0].workPackage.projectId).toBe(PROJECT_P)
    expect(store.assigned[0].workPackage.projectId).toBeTruthy()
  })

  it('REFUSES a package that exceeds the Delegation, and writes nothing', async () => {
    const store = new FakeStore()
    const r = await assignWorkPackage(writeArgs(store, {
      request: baseRequest({ allowedActions: [{ action: 'deploy_production' }] }),
    }))
    expect(r.status).toBe('exceeds_delegation')
    expect(r.violations!.length).toBeGreaterThan(0)
    expect(store.assigned).toEqual([])
  })

  it('REFUSES an unknown role and writes nothing', async () => {
    const store = new FakeStore()
    const r = await assignWorkPackage(writeArgs(store, { roleReader: roleReader([]) }))
    expect(r.status).toBe('role_not_eligible')
    expect(r.rejections![0].reason).toBe('role_not_found')
    expect(store.assigned).toEqual([])
  })

  it('REFUSES a role from another project', async () => {
    const store = new FakeStore()
    const r = await assignWorkPackage(writeArgs(store, {
      roleReader: roleReader([{ ...ROLE, projectId: PROJECT_Q }]),
    }))
    expect(r.status).toBe('role_not_eligible')
    expect(r.rejections![0].reason).toBe('role_project_mismatch')
  })

  it('REFUSES a cross-project dependency predecessor (§21.158)', async () => {
    const foreignPkg = { ...(await (async () => {
      const parent = envelopeOf()
      const b = attenuateWorkPackage(parent, baseRequest(), delegationBoundHash(parent))
      if (!b.ok) throw new Error('fixture')
      return { ...b.package, workPackageId: 'pred-1', packageHash: 'h', projectId: PROJECT_Q }
    })()) } as WorkPackage
    const store = new FakeStore([{
      taskId: 't', workPackage: foreignPkg, assignedAt: T0, legacyStatus: 'pending',
      columns: columnsOf(foreignPkg),
    }])
    const r = await assignWorkPackage(writeArgs(store, {
      request: baseRequest({
        dependencies: [{
          predecessorPackageId: 'pred-1', requiredInputs: ['in-1'], expectedOutputs: [],
          owner: 'role-x', blockingState: 'upstream pending',
        }],
      }),
    }))
    expect(r.status).toBe('invalid_request')
    expect(r.rejections![0].reason).toBe('dependency_project_mismatch')
  })

  it('prepare validates without persisting anything', async () => {
    const store = new FakeStore()
    const r = await prepareWorkPackage(writeArgs(store))
    expect(r.status).toBe('ok')
    expect(r.workPackage).not.toBeNull()
    expect(store.assigned).toEqual([])
    expect(r.taskId).toBeUndefined()
  })

  it('assignment creates exactly ONE canonical row', async () => {
    const store = new FakeStore()
    await assignWorkPackage(writeArgs(store))
    expect(store.assigned.length).toBe(1)
    expect(store.assigned[0].workPackage.packageHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 7. Effective state and live invalidation (§21.42)
// ────────────────────────────────────────────────────────────────────────────

describe('assigned, and what unmakes it', () => {
  const assign = async () => {
    const store = new FakeStore()
    const r = await assignWorkPackage(writeArgs(store))
    expect(r.status).toBe('ok')
    return { store, id: r.workPackage!.workPackageId }
  }

  it('an assigned package reads back as assigned and usable', async () => {
    const { store, id } = await assign()
    const { evaluation } = await resolveWorkPackage(id, { store, roleReader: roleReader([ROLE]) })
    expect(evaluation!.lifecycleState).toBe('assigned')
    expect(evaluation!.effectiveState).toBe('assigned')
    expect(evaluation!.usable).toBe(true)
  })

  it('assigned does NOT imply executing — no execution state exists at all', async () => {
    const { store, id } = await assign()
    const { evaluation } = await resolveWorkPackage(id, { store, roleReader: roleReader([ROLE]) })
    const states = [evaluation!.lifecycleState, evaluation!.effectiveState]
    for (const forbidden of ['executing', 'waiting', 'blocked', 'escalated', 'paused', 'completed', 'failed', 'quarantined']) {
      expect(states).not.toContain(forbidden)
    }
    // The legacy shell status is untouched and is NOT canonical state.
    expect(store.assigned[0].legacyStatus).toBe('pending')
  })

  it('a revoked parent Delegation makes it unusable, history intact', async () => {
    const { store, id } = await assign()
    delegationSays(delegationEvaluation(envelopeOf(), {
      lifecycleStatus: 'revoked', usable: false, reason: 'revoked',
    }))
    const { evaluation } = await resolveWorkPackage(id, { store, roleReader: roleReader([ROLE]) })
    expect(evaluation!.lifecycleState).toBe('assigned')
    expect(evaluation!.effectiveState).toBe('invalidated')
    expect(evaluation!.reason).toBe('delegation_unusable')
    expect(evaluation!.assignedAt).toBe(T1)
  })

  it('a terminal Mission behind the Delegation makes it unusable', async () => {
    const { store, id } = await assign()
    delegationSays(delegationEvaluation(envelopeOf(), {
      effectiveStatus: 'invalidated', usable: false, reason: 'mission_ended',
    }))
    const { usable, reason } = await isWorkPackageUsable(id, { store, roleReader: roleReader([ROLE]) })
    expect(usable).toBe(false)
    expect(reason).toBe('delegation_unusable')
  })

  it('a drifted Delegation pin makes it unusable', async () => {
    const { store, id } = await assign()
    // Same envelope id, but a delegable bound moved → hash differs.
    const moved = { ...envelopeOf(), budget: { currency: 'SEK', limitMinor: 1 } }
    delegationSays(delegationEvaluation(moved))
    const { evaluation } = await resolveWorkPackage(id, { store, roleReader: roleReader([ROLE]) })
    expect(evaluation!.reason).toBe('delegation_pin_changed')
    expect(evaluation!.usable).toBe(false)
  })

  it('a moved Mission pin makes it unusable', async () => {
    const { store, id } = await assign()
    const stored = store.assigned[0].workPackage
    // Force the stored package to disagree with a still-consistent envelope,
    // keeping the relational half in step so the R1 coherence seam is not what
    // catches it — the mission-pin check must be.
    ;(stored as { missionVersion: number }).missionVersion = 99
    store.assigned[0].columns = { ...columnsOf(stored), workPackageHash: stored.packageHash }
    store.assigned[0].workPackage.packageHash = workPackageHash(
      (({ packageHash: _h, ...t }) => t)(stored) as never)
    store.assigned[0].columns.workPackageHash = store.assigned[0].workPackage.packageHash
    delegationSays(delegationEvaluation())
    const { evaluation } = await resolveWorkPackage(id, { store, roleReader: roleReader([ROLE]) })
    // The pin is checked BEFORE containment, so the reported reason names the
    // drift rather than its downstream symptom. Containment would also catch
    // this, which is exactly why the precedence is pinned here.
    expect(evaluation!.reason).toBe('mission_pin_changed')
    expect(evaluation!.usable).toBe(false)
  })

  it('a stored package that exceeds its Delegation is refused at read time', async () => {
    const { store, id } = await assign()
    const stored = store.assigned[0].workPackage
    ;(stored as { allowedActions: { action: string }[] }).allowedActions = [{ action: 'deploy_production' }]
    // Re-seal the contract so containment, not coherence, is what refuses it.
    store.assigned[0].workPackage.packageHash = workPackageHash(
      (({ packageHash: _h, ...t }) => t)(stored) as never)
    store.assigned[0].columns = columnsOf(store.assigned[0].workPackage)
    delegationSays(delegationEvaluation())
    const { evaluation } = await resolveWorkPackage(id, { store, roleReader: roleReader([ROLE]) })
    expect(evaluation!.reason).toBe('exceeds_delegation')
  })

  it('a role that no longer resolves makes it unusable', async () => {
    const { store, id } = await assign()
    delegationSays(delegationEvaluation())
    const { evaluation } = await resolveWorkPackage(id, { store, roleReader: roleReader([]) })
    expect(evaluation!.reason).toBe('role_unavailable')
  })

  it('an unreadable Delegation fails closed', async () => {
    const { store, id } = await assign()
    delegationSays(null, 'unavailable')
    const { usable, reason } = await isWorkPackageUsable(id, { store, roleReader: roleReader([ROLE]) })
    expect(usable).toBe(false)
    expect(reason).toBe('delegation_unreadable')
  })

  it('an unknown and a foreign package deny identically', async () => {
    const { store, id } = await assign()
    const unknown = await resolveWorkPackage(randomUUID(), { store })
    asPrincipal(PRINCIPAL_A, [PROJECT_Q])
    const foreign = await resolveWorkPackage(id, { store })
    expect(unknown.status).toBe('not_permitted')
    expect(foreign.status).toBe('not_permitted')
  })

  it('project listings are scoped to the caller', async () => {
    const { store } = await assign()
    const mine = await listProjectWorkPackages(PROJECT_P, { store })
    const theirs = await listProjectWorkPackages(PROJECT_Q, { store })
    expect(mine.packages.length).toBe(1)
    expect(theirs.status).toBe('project_denied')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 8. Structural guards — what EI-S1.4D must NOT do
// ────────────────────────────────────────────────────────────────────────────

const sources = ['types.ts', 'attenuate.ts', 'binding.ts', 'roles.ts', 'store.ts', 'principal-read.ts', 'principal-write.ts']
  .map(f => ({ file: f, text: readFileSync(resolve(WP_DIR, f), 'utf8') }))

/** Strip comments: the files DOCUMENT what they deliberately do not do. */
const codeOf = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

describe('no execution (§21.42)', () => {
  it('imports no runner, executor, dispatcher or publisher', () => {
    for (const { file, text } of sources) {
      const code = codeOf(text)
      expect(code, file).not.toMatch(/executeRunSteps|runStep\b/)
      expect(code, file).not.toMatch(/workflow-(runner|executor)/)
      expect(code, file).not.toMatch(/\brun-create\b/)
      expect(code, file).not.toMatch(/lib\/publishing/)
      expect(code, file).not.toMatch(/nodemailer|resend/i)
    }
  })

  it('calls no model and no external API', () => {
    for (const { file, text } of sources) {
      const code = codeOf(text)
      expect(code, file).not.toMatch(/@anthropic-ai\/sdk/)
      expect(code, file).not.toMatch(/\bfetch\s*\(/)
    }
  })

  it('never calls planTasks', () => {
    for (const { file, text } of sources) {
      expect(codeOf(text), file).not.toMatch(/\bplanTasks\b/)
    }
  })

  it('creates no run and starts nothing', () => {
    for (const { file, text } of sources) {
      const code = codeOf(text)
      expect(code, file).not.toMatch(/from\(['"]runs['"]\)/)
      expect(code, file).not.toMatch(/from\(['"]workflows['"]\)/)
    }
  })

  it('builds no Workforce → Agent object (§21.10 stays future)', () => {
    for (const { file, text } of sources) {
      const code = codeOf(text)
      expect(code, file).not.toMatch(/agentDelegation|AgentDelegation|agent_delegation/)
    }
    // The only `agents` contact is READING the role registry.
    const roles = codeOf(sources.find(s => s.file === 'roles.ts')!.text)
    expect(roles).toMatch(/from\('agents'\)/)
    expect(roles).toMatch(/\.select\(/)
    expect(roles).not.toMatch(/\.insert\(|\.update\(|\.delete\(/)
  })

  it('writes to no Authorization, Decision or Mission ledger', () => {
    for (const { file, text } of sources) {
      const code = codeOf(text)
      expect(code, file).not.toMatch(/atlas_authorizations/)
      expect(code, file).not.toMatch(/atlas_decision_ledger/)
      expect(code, file).not.toMatch(/atlas_mission_ledger/)
      expect(code, file).not.toMatch(/atlas_delegation_ledger/)
    }
  })

  it('the only table it writes is manager_tasks, and only by insert', () => {
    const store = codeOf(sources.find(s => s.file === 'store.ts')!.text)
    expect(store).toMatch(/from\('manager_tasks'\)/)
    expect(store).toMatch(/\.insert\(/)
    expect(store).not.toMatch(/\.update\(|\.delete\(|\.upsert\(/)
  })

  it('moves no status', () => {
    const store = codeOf(sources.find(s => s.file === 'store.ts')!.text)
    // It reads status for reporting but never sets one.
    expect(store).not.toMatch(/status:\s*['"]/)
  })

  it('has no scheduler for dependencies', () => {
    for (const { file, text } of sources) {
      const code = codeOf(text)
      expect(code, file).not.toMatch(/setTimeout|setInterval|cron/i)
    }
  })
})

describe('existing Manager surface is untouched', () => {
  const manager = readFileSync(resolve(__dirname, '../ai/manager.ts'), 'utf8')

  it('keeps planTasks and every legacy method', () => {
    expect(manager).toMatch(/async planTasks\(goal: string, projectId: string\)/)
    expect(manager).toMatch(/async getActiveTasks\(/)
    expect(manager).toMatch(/async updateTask\(/)
    expect(manager).toMatch(/async retryFailedRun\(/)
  })

  it('adds the canonical path to the SAME agent, with no V2', () => {
    expect(manager).not.toMatch(/ManagerAgentV2|WorkforceManagerV2/)
    expect(manager).toMatch(/async assignWorkPackage\(/)
    expect(manager).toMatch(/async prepareWorkPackage\(/)
    expect(manager).toMatch(/async readWorkPackage\(/)
  })

  it('the canonical path never routes through planTasks', () => {
    const canonical = manager.slice(manager.indexOf('async prepareWorkPackage'))
    expect(canonical).not.toMatch(/planTasks/)
  })

  it('the route accepts no caller-asserted authority', () => {
    const route = codeOf(readFileSync(resolve(__dirname, '../../app/api/manager/route.ts'), 'utf8'))
    expect(route).not.toMatch(/CRON_SECRET/)
    expect(route).toMatch(/supabase\.auth\.getUser\(\)/)
    for (const action of ['prepare_work_package', 'assign_work_package', 'read_work_package']) {
      expect(route).toContain(action)
    }
    // No caller-supplied project or assignment flag on the work-package actions.
    const wpBlock = route.slice(route.indexOf("case 'prepare_work_package'"), route.indexOf("case 'read_work_package'"))
    expect(wpBlock).not.toMatch(/project_id/)
    expect(wpBlock).not.toMatch(/assigned|authority:/)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 9. EI-S1.4D-R1 — persistence integrity and legacy isolation
// ────────────────────────────────────────────────────────────────────────────

describe('R1 — canonical packages are isolated from legacy task semantics', () => {
  const manager = readFileSync(resolve(__dirname, '../ai/manager.ts'), 'utf8')

  it('exports ONE discriminator, written once so no consumer gets it wrong', () => {
    expect(manager).toMatch(/export const LEGACY_TASK_FILTER = 'source\.is\.null,source\.neq\.work_package'/)
  })

  it('the NULL branch is present — legacy rows predate the source column', () => {
    // `source <> 'work_package'` alone is NULL, not true, for a legacy row, so
    // omitting the null branch would silently hide the entire existing task list.
    expect(manager).toMatch(/source\.is\.null/)
  })

  it('buildContext excludes canonical Work Packages', () => {
    const ctx = manager.slice(manager.indexOf("from('manager_tasks')"))
    const query = ctx.slice(0, 700)
    expect(query).toMatch(/\.in\('status', \['pending', 'in_progress'\]\)/)
    expect(query).toMatch(/LEGACY_TASK_FILTER/)
  })

  it('getActiveTasks excludes canonical Work Packages', () => {
    const fn = manager.slice(manager.indexOf('async getActiveTasks'))
    expect(fn.slice(0, 700)).toMatch(/LEGACY_TASK_FILTER/)
  })

  it('every legacy active-task query carries the filter', () => {
    // Both places that select pending/in_progress must be covered; a third
    // appearing later without the filter fails here.
    const active = [...manager.matchAll(/\.in\('status', \['pending', 'in_progress'\]\)/g)]
    expect(active.length).toBe(2)
    for (const m of active) {
      const window = manager.slice(m.index!, m.index! + 700)
      expect(window).toMatch(/LEGACY_TASK_FILTER/)
    }
  })

  it('the store still marks canonical rows with the discriminator', () => {
    const store = sources.find(s => s.file === 'store.ts')!.text
    expect(store).toMatch(/source: 'work_package'/)
  })
})

describe('R1 — the persisted contract must be internally coherent', () => {
  const parent = envelopeOf()
  const built = attenuateWorkPackage(parent, baseRequest(), delegationBoundHash(parent))
  const coherent = (): WorkPackage => {
    if (!built.ok) throw new Error('fixture')
    const withId = { ...built.package, workPackageId: 'wp-1' }
    return { ...withId, packageHash: workPackageHash(withId) }
  }
  /** Re-seal a tampered contract so its own hash is valid again. */
  const reseal = (p: WorkPackage): WorkPackage => {
    const { packageHash: _h, ...terms } = p
    return { ...p, packageHash: workPackageHash(terms as never) }
  }
  const row = (p: WorkPackage, cols: Partial<StoredWorkPackageColumns> = {}): StoredWorkPackage => ({
    taskId: 'task-1', workPackage: p, assignedAt: T1, legacyStatus: 'pending',
    columns: { ...columnsOf(p), ...cols },
  })
  const read = (stored: StoredWorkPackage) =>
    resolveWorkPackage('wp-1', { store: new FakeStore([stored]), roleReader: roleReader([ROLE]) })

  it('a well-formed persisted package remains usable', async () => {
    const { evaluation, status } = await read(row(coherent()))
    expect(status).toBe('ok')
    expect(evaluation!.usable).toBe(true)
  })

  it.each([
    ['work package id', { workPackageId: 'other-id' }],
    ['project', { projectId: PROJECT_Q }],
    ['delegation envelope', { delegationEnvelopeId: 'other-envelope' }],
    ['delegation pin', { delegationBoundHash: 'a'.repeat(64) }],
    ['mission id', { missionId: 'other-mission' }],
    ['mission version', { missionVersion: 9 }],
    ['mission pin', { missionBoundHash: 'b'.repeat(64) }],
    ['assigned role', { workforceRoleId: ROLE_FOREIGN }],
    ['package hash', { workPackageHash: 'c'.repeat(64) }],
  ] as const)('REFUSES a row whose relational %s disagrees with the JSON', async (_name, cols) => {
    const stored = row(coherent(), cols as never)
    // The relational project is what decides access, so a project mismatch is
    // refused as not-permitted; every other mismatch is a malformed own row.
    const { evaluation, status } = await read(stored)
    expect(evaluation).toBeNull()
    expect(['malformed', 'not_permitted']).toContain(status)
  })

  it('REFUSES a row whose JSON claims a project its column does not', async () => {
    // The dangerous direction: the row physically belongs to the caller's
    // project, so scope lets it through — and only coherence can catch that its
    // payload claims somewhere else. A foreign RELATIONAL project is refused
    // earlier as not-permitted, so this is the case the fault code exists for.
    const p = { ...coherent(), projectId: PROJECT_Q }
    const { evaluation, status } = await read({
      taskId: 't', workPackage: p, assignedAt: T1, legacyStatus: 'pending',
      columns: { ...columnsOf(p), projectId: PROJECT_P, workPackageHash: p.packageHash },
    })
    expect(status).toBe('malformed')
    expect(evaluation).toBeNull()
    expect(validateStoredWorkPackage({
      taskId: 't', workPackage: p, assignedAt: T1, legacyStatus: 'pending',
      columns: { ...columnsOf(p), projectId: PROJECT_P },
    }).faults).toContain('project_mismatch')
  })

  it('rejects an incomplete canonical row before it becomes an object', () => {
    const complete = {
      work_package: {}, work_package_id: 'wp-1', work_package_hash: 'h',
      delegation_envelope_id: 'e', delegation_bound_hash: 'd',
      mission_id: 'm', mission_version: 1, mission_bound_hash: 'mb',
      workforce_role_id: 'r',
    }
    expect(isCompleteCanonicalRow(complete)).toBe(true)
    // Every pin is load-bearing: dropping any one makes the row unparseable
    // rather than a package with a missing field.
    for (const key of Object.keys(complete)) {
      const missing = { ...complete, [key]: key === 'mission_version' ? null : null }
      expect(isCompleteCanonicalRow(missing as never), key).toBe(false)
    }
  })

  it('a relational project mismatch never leaks the row', async () => {
    const { status } = await read(row(coherent(), { projectId: PROJECT_Q }))
    // Scope comes from the COLUMN, so this row is simply not the caller's.
    expect(status).toBe('not_permitted')
  })

  it('a malformed own-project row is reported as malformed, never usable', async () => {
    const { evaluation, status } = await read(row(coherent(), { missionVersion: 9 }))
    expect(status).toBe('malformed')
    expect(evaluation).toBeNull()
  })
})

describe('R1 — the package self-hash is verified, not merely stored', () => {
  const parent = envelopeOf()
  const built = attenuateWorkPackage(parent, baseRequest(), delegationBoundHash(parent))
  const coherent = (): WorkPackage => {
    if (!built.ok) throw new Error('fixture')
    const withId = { ...built.package, workPackageId: 'wp-1' }
    return { ...withId, packageHash: workPackageHash(withId) }
  }
  /** Tamper with a decomposition field WITHOUT recomputing the hash. */
  const tamper = (over: Partial<WorkPackage>): StoredWorkPackage => {
    const p = { ...coherent(), ...over }
    return {
      taskId: 'task-1', workPackage: p, assignedAt: T1, legacyStatus: 'pending',
      // Columns kept in step with the stale hash, so ONLY the recompute catches it.
      columns: { ...columnsOf(p), workPackageHash: p.packageHash },
    }
  }
  const read = (stored: StoredWorkPackage) =>
    resolveWorkPackage('wp-1', { store: new FakeStore([stored]), roleReader: roleReader([ROLE]) })

  it.each([
    ['taskObjective', { taskObjective: 'Something nobody agreed to.' }],
    ['inputs', { inputs: [{ inputId: 'in-9', description: 'rewritten', origin: 'delegation' as const }] }],
    ['expectedOutput', { expectedOutput: [{ outputId: 'out-9', description: 'a different deliverable' }] }],
    ['dependencies', { dependencies: [{ requiredInputs: [], expectedOutputs: [], owner: 'x', blockingState: 'y' }] }],
    ['fallback', { fallback: 'invented fallback' }],
    ['assigned role name', { assignedRole: { roleId: ROLE_R, roleName: 'someone else' } }],
  ] as const)('REFUSES a stale hash after %s was changed', async (_name, over) => {
    // Every case stays fully contained by the parent Delegation, so containment
    // cannot be what refuses it — only the recomputed hash can.
    const { evaluation, status } = await read(tamper(over as never))
    expect(status).toBe('malformed')
    expect(evaluation).toBeNull()
  })

  it('re-sealing the contract after an in-bounds edit makes it usable again', async () => {
    // Proves the guard checks COHERENCE, not immutability-by-accident: a
    // properly re-hashed contract is readable. (The database still forbids the
    // UPDATE; this is about what the read path considers well-formed.)
    const p = { ...coherent(), taskObjective: 'A narrower slice of the same work.' }
    const { packageHash: _h, ...terms } = p
    const resealed = { ...p, packageHash: workPackageHash(terms as never) }
    const { evaluation } = await read({
      taskId: 't', workPackage: resealed, assignedAt: T1, legacyStatus: 'pending',
      columns: columnsOf(resealed),
    })
    expect(evaluation!.usable).toBe(true)
  })

  it('the validation seam reports every fault at once', () => {
    const p = { ...coherent(), taskObjective: 'changed' }
    const v = validateStoredWorkPackage({
      taskId: 't', workPackage: p, assignedAt: T1, legacyStatus: 'pending',
      columns: { ...columnsOf(p), missionVersion: 9, workforceRoleId: ROLE_FOREIGN },
    })
    expect(v.coherent).toBe(false)
    expect(v.faults).toContain('mission_version_mismatch')
    expect(v.faults).toContain('role_mismatch')
    expect(v.faults).toContain('hash_recompute_mismatch')
  })

  it('a canonical package with a null relational project is incoherent', () => {
    const p = coherent()
    const v = validateStoredWorkPackage({
      taskId: 't', workPackage: p, assignedAt: T1, legacyStatus: 'pending',
      columns: { ...columnsOf(p), projectId: null },
    })
    expect(v.coherent).toBe(false)
    expect(v.faults).toContain('project_missing')
  })

  it('listings drop incoherent rows rather than surfacing them', async () => {
    const p = { ...coherent(), taskObjective: 'tampered' }
    const store = new FakeStore([{
      taskId: 't', workPackage: p, assignedAt: T1, legacyStatus: 'pending',
      columns: { ...columnsOf(p), workPackageHash: p.packageHash },
    }])
    const { packages } = await listProjectWorkPackages(PROJECT_P, { store })
    expect(packages).toEqual([])
  })
})

describe('R1 — role eligibility claims only what the sources prove', () => {
  it('reports verified and unverified dimensions separately', () => {
    const r = evaluateRoleEligibility({
      role: ROLE, projectId: PROJECT_P, tools: [],
      dataScope: [{ resource: 'runs', access: 'read' }], provenTools: new Set(),
    })
    expect(r.eligible).toBe(true)
    expect(r.verified).toEqual(['identity', 'project', 'platform_data_domain'])
    // Role-specific dimensions have NO source in this repository and are never
    // silently counted as passing.
    expect(r.unverified).toContain('role_specific_capability')
    expect(r.unverified).toContain('role_specific_data_permission')
    expect(r.unverified).toContain('capacity')
  })

  it('never claims a role-specific permission it cannot prove', () => {
    const r = evaluateRoleEligibility({
      role: ROLE, projectId: PROJECT_P,
      tools: [{ tool: 'repo_read', restriction: 'apps/web only' }],
      dataScope: [], provenTools: new Set(['repo_read apps/web only']),
    })
    expect(r.eligible).toBe(true)
    // The tool was proven AT THE PARENT, which is a different fact.
    expect(r.verified).toContain('parent_tool_availability')
    expect(r.verified).not.toContain('role_specific_tool_permission')
    expect(r.unverified).toContain('role_specific_tool_permission')
  })

  it('a refusal reports the same honest unverified picture', () => {
    const r = evaluateRoleEligibility({
      role: null, projectId: PROJECT_P, tools: [], dataScope: [], provenTools: new Set(),
    })
    expect(r.eligible).toBe(false)
    expect(r.verified).toEqual([])
    expect(r.unverified).toContain('role_specific_capability')
  })

  it('the type no longer offers a bare "fit" claim', () => {
    const src = sources.find(s => s.file === 'roles.ts')!.text
    expect(src).not.toMatch(/\bfit:\s*boolean/)
    expect(src).toMatch(/eligible:\s*boolean/)
  })
})

describe('R1 — assignment re-checks the parent immediately before INSERT', () => {
  it('refuses when the Delegation changes between prepare and write', async () => {
    const store = new FakeStore()
    let call = 0
    vi.mocked(resolveDelegationEvaluation).mockImplementation(async () => {
      call += 1
      // First resolve (prepare) sees the real envelope; the re-check sees one
      // whose bounds have moved, so the pin no longer matches.
      const env = call <= 1
        ? envelopeOf()
        : { ...envelopeOf(), budget: { currency: 'SEK', limitMinor: 1 } }
      return { evaluation: delegationEvaluation(env), status: 'ok' } as never
    })
    const r = await assignWorkPackage(writeArgs(store))
    expect(r.status).toBe('delegation_not_usable')
    expect(r.detail).toBe('delegation_changed_during_assignment')
    expect(store.assigned).toEqual([])
  })

  it('refuses when the Delegation is revoked between prepare and write', async () => {
    const store = new FakeStore()
    let call = 0
    vi.mocked(resolveDelegationEvaluation).mockImplementation(async () => {
      call += 1
      const over = call <= 1 ? {} : { lifecycleStatus: 'revoked', usable: false, reason: 'revoked' }
      return { evaluation: delegationEvaluation(envelopeOf(), over), status: 'ok' } as never
    })
    const r = await assignWorkPackage(writeArgs(store))
    expect(r.status).toBe('delegation_not_usable')
    expect(store.assigned).toEqual([])
  })

  it('resolves the parent more than once for one assignment', async () => {
    const store = new FakeStore()
    vi.mocked(resolveDelegationEvaluation).mockClear()
    await assignWorkPackage(writeArgs(store))
    expect(vi.mocked(resolveDelegationEvaluation).mock.calls.length).toBeGreaterThan(1)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 10. EI-S1.4D-R2 — audit boundary, discriminator and stored-term validity
// ────────────────────────────────────────────────────────────────────────────

describe('R2 — stored terms must still be VALID, not merely coherent', () => {
  const parent = envelopeOf()
  const coherent = (): WorkPackage => {
    const b = attenuateWorkPackage(parent, baseRequest(), delegationBoundHash(parent))
    if (!b.ok) throw new Error('fixture')
    const withId = { ...b.package, workPackageId: 'wp-1' }
    return { ...withId, packageHash: workPackageHash(withId) }
  }
  /** Tamper then RE-SEAL, so coherence passes and only validity can refuse. */
  const resealed = (over: Partial<WorkPackage>): StoredWorkPackage => {
    const p = { ...coherent(), ...over }
    const { packageHash: _h, ...terms } = p
    const sealed = { ...p, packageHash: workPackageHash(terms as never) }
    return {
      taskId: 't', workPackage: sealed, assignedAt: T1, legacyStatus: 'pending',
      columns: columnsOf(sealed),
    }
  }
  const read = (stored: StoredWorkPackage) =>
    resolveWorkPackage('wp-1', { store: new FakeStore([stored]), roleReader: roleReader([ROLE]) })

  it.each([
    ['an empty task objective', { taskObjective: '' }],
    ['no expected output', { expectedOutput: [] }],
    ['a dependency requiring an undeclared input', {
      dependencies: [{ requiredInputs: ['in-missing'], expectedOutputs: [], owner: 'x', blockingState: 'y' }],
    }],
    ['a packageVersion other than 1', { packageVersion: 7 }],
    ['a data_scope input naming an unreadable resource', {
      inputs: [{ inputId: 'in-1', description: 'x', origin: 'data_scope' as const, resource: 'platform_tokens' }],
    }],
    ['an item both in and out of scope', { inScope: ['newsletter sending'] }],
  ] as const)('REFUSES %s even when re-hashed and contained', async (_name, over) => {
    const { evaluation } = await read(resealed(over as never))
    expect(evaluation!.usable).toBe(false)
    expect(evaluation!.reason).toBe('exceeds_delegation')
  })

  it('a valid self-hashed package remains usable', async () => {
    const { evaluation } = await read(resealed({}))
    expect(evaluation!.usable).toBe(true)
  })

  it('CREATION and READ enforce the same parent-independent rules', () => {
    // The alignment guard. Each malformed term is run through BOTH ends; a rule
    // enforced at only one end fails here, so the two cannot silently drift.
    const cases: Partial<WorkPackageRequest>[] = [
      { taskObjective: '' },
      { expectedOutput: [] },
      { dependencies: [{ requiredInputs: ['in-missing'], expectedOutputs: [], owner: 'x', blockingState: 'y' }] },
      { inputs: [{ inputId: 'in-1', description: 'x', origin: 'data_scope', resource: 'platform_tokens' }] },
      { inScope: ['newsletter sending'] },
    ]
    for (const over of cases) {
      const created = attenuateWorkPackage(parent, baseRequest(over), delegationBoundHash(parent))
      expect(created.ok, JSON.stringify(over)).toBe(false)

      const stored = { ...coherent(), ...(over as Partial<WorkPackage>) }
      expect(workPackageIsContained(parent, stored).length, JSON.stringify(over)).toBeGreaterThan(0)
    }
  })

  it('the shared seam is the one place those rules live', () => {
    const terms = validateWorkPackageTerms({
      taskObjective: '', inputs: [], expectedOutput: [], dataScope: [],
      dependencies: [], inScope: [], outOfScope: [], packageVersion: 2,
    })
    expect(terms.map(v => v.field).sort()).toEqual(['expectedOutput', 'packageVersion', 'taskObjective'])
    expect(WORK_PACKAGE_V1_VERSION).toBe(1)
  })

  it('the version rule is skipped at creation and applied on read', () => {
    // At creation the version is assigned by construction, so validating it
    // there would test the constructor, not the input.
    expect(validateWorkPackageTerms({
      taskObjective: 'x', inputs: [], expectedOutput: [{ outputId: 'o', description: 'd' }],
      dataScope: [], dependencies: [], inScope: [], outOfScope: [],
    })).toEqual([])
  })
})

describe('R2 — dependency predecessors are validated before they are trusted', () => {
  const predecessorOf = (over: Partial<WorkPackage>, cols: Record<string, unknown> = {}) => {
    const parent = envelopeOf()
    const b = attenuateWorkPackage(parent, baseRequest(), delegationBoundHash(parent))
    if (!b.ok) throw new Error('fixture')
    const withId = { ...b.package, workPackageId: 'pred-1', ...over }
    const p = { ...withId, packageHash: workPackageHash(withId) }
    return {
      taskId: 'pred', workPackage: p, assignedAt: T0, legacyStatus: 'pending',
      columns: { ...columnsOf(p), ...cols },
    } as StoredWorkPackage
  }
  const withDependency = (store: FakeStore) => assignWorkPackage(writeArgs(store, {
    request: baseRequest({
      dependencies: [{
        predecessorPackageId: 'pred-1', requiredInputs: ['in-1'], expectedOutputs: [],
        owner: 'x', blockingState: 'upstream pending',
      }],
    }),
  }))

  it('accepts a coherent same-project predecessor', async () => {
    const store = new FakeStore([predecessorOf({})])
    const r = await withDependency(store)
    expect(r.status).toBe('ok')
  })

  it('REFUSES a predecessor whose JSON claims this project while its column does not', async () => {
    // The dangerous case: a row physically in another project, claiming ours in
    // its payload. Trusting the payload would carry a dependency across the
    // §21.158 isolation boundary.
    const store = new FakeStore([predecessorOf({}, { projectId: PROJECT_Q })])
    const r = await withDependency(store)
    expect(r.status).toBe('invalid_request')
    expect(r.rejections![0].reason).toBe('dependency_project_mismatch')
  })

  it('REFUSES an incoherent predecessor outright', async () => {
    const store = new FakeStore([predecessorOf({}, { missionVersion: 99 })])
    const r = await withDependency(store)
    expect(r.status).toBe('invalid_request')
  })

  it('REFUSES an unknown predecessor', async () => {
    const r = await withDependency(new FakeStore())
    expect(r.status).toBe('invalid_request')
  })

  it('uses the relational project, not the JSON payload', () => {
    const write = sources.find(s => s.file === 'principal-write.ts')!.text
    expect(write).toMatch(/validateStoredWorkPackage\(predecessor\)/)
    expect(write).toMatch(/predecessor\.columns\.projectId/)
    expect(write).not.toMatch(/predecessor\.workPackage\.projectId/)
  })
})

describe('R2 — one assignment act, one authenticated principal (§21.19)', () => {
  it('resolves the acting identity exactly once', async () => {
    const store = new FakeStore()
    vi.mocked(resolveProjectAccess).mockClear()
    const r = await assignWorkPackage(writeArgs(store))
    expect(r.status).toBe('ok')
    expect(vi.mocked(resolveProjectAccess).mock.calls.length).toBe(1)
  })

  it('a changing identity cannot split one assignment act', async () => {
    const store = new FakeStore()
    const OTHER = '99999999-9999-4999-8999-999999999999'
    vi.mocked(resolveProjectAccess)
      .mockResolvedValueOnce({ ok: true, userId: PRINCIPAL_A, allowedProjectIds: [PROJECT_P] } as never)
      // Any later resolve would hand the act to a principal with no access.
      .mockResolvedValue({ ok: true, userId: OTHER, allowedProjectIds: [] } as never)
    const r = await assignWorkPackage(writeArgs(store))
    expect(r.status).toBe('ok')
    expect(store.assigned.length).toBe(1)
  })

  it('prepare remains a normally authenticated public boundary on its own', async () => {
    vi.mocked(resolveProjectAccess).mockResolvedValue({ ok: false } as never)
    const r = await prepareWorkPackage(writeArgs(new FakeStore()))
    expect(r.status).toBe('no_principal')
  })

  it('still re-checks the parent immediately before INSERT', async () => {
    const store = new FakeStore()
    vi.mocked(resolveDelegationEvaluation).mockClear()
    await assignWorkPackage(writeArgs(store))
    expect(vi.mocked(resolveDelegationEvaluation).mock.calls.length).toBeGreaterThan(1)
  })
})

describe('R3 — the persistence discriminator is re-proved at read', () => {
  const parent = envelopeOf()
  const coherent = (): WorkPackage => {
    const b = attenuateWorkPackage(parent, baseRequest(), delegationBoundHash(parent))
    if (!b.ok) throw new Error('fixture')
    const withId = { ...b.package, workPackageId: 'wp-1' }
    return { ...withId, packageHash: workPackageHash(withId) }
  }
  const row = (cols: Partial<StoredWorkPackageColumns> = {}): StoredWorkPackage => {
    const p = coherent()
    return {
      taskId: 't', workPackage: p, assignedAt: T1, legacyStatus: 'pending',
      columns: { ...columnsOf(p), ...cols },
    }
  }
  const read = (stored: StoredWorkPackage) =>
    resolveWorkPackage('wp-1', { store: new FakeStore([stored]), roleReader: roleReader([ROLE]) })

  it('carries source and sourceKey through the persisted shape', () => {
    const store = sources.find(s => s.file === 'store.ts')!.text
    expect(store).toMatch(/source: string \| null/)
    expect(store).toMatch(/sourceKey: string \| null/)
    // And actually selects them, or they would always read back null.
    expect(store).toMatch(/'workforce_role_id', 'assigned_at', 'source', 'source_key',/)
    expect(store).toMatch(/source: row\.source/)
    expect(store).toMatch(/sourceKey: row\.source_key/)
  })

  it('keeps them OUT of the Chapter 21 contract', () => {
    // Persistence identity, not authority terms.
    const types = readFileSync(resolve(WP_DIR, 'types.ts'), 'utf8')
    const iface = types.slice(types.indexOf('export interface WorkPackage {'), types.indexOf('export type WorkPackageState'))
    expect(iface).not.toMatch(/\bsource\b/)
    expect(iface).not.toMatch(/sourceKey/)
  })

  it.each([
    ['a NULL source', { source: null }],
    ['a dream source', { source: 'dream' }],
    ['a mismatched source key', { sourceKey: 'someone-elses-id' }],
    ['a NULL source key', { sourceKey: null }],
  ] as const)('REFUSES an otherwise-coherent row with %s', async (_name, cols) => {
    const { evaluation, status } = await read(row(cols as never))
    expect(status).toBe('malformed')
    expect(evaluation).toBeNull()
  })

  it('names the specific fault', () => {
    const p = coherent()
    const v = validateStoredWorkPackage({
      taskId: 't', workPackage: p, assignedAt: T1, legacyStatus: 'pending',
      columns: { ...columnsOf(p), source: null, sourceKey: 'wrong' },
    })
    expect(v.coherent).toBe(false)
    expect(v.faults).toContain('source_mismatch')
    expect(v.faults).toContain('source_key_mismatch')
  })

  it('accepts the correct discriminator', async () => {
    const { evaluation } = await read(row())
    expect(evaluation!.usable).toBe(true)
    expect(WORK_PACKAGE_SOURCE).toBe('work_package')
  })

  it('a foreign malformed row stays existence-oracle safe', async () => {
    // Malformed AND in another project: the scope check comes first, so it is
    // indistinguishable from a row that does not exist.
    const stored = row({ projectId: PROJECT_Q, source: null })
    const { evaluation, status } = await resolveWorkPackage('wp-1', {
      store: new FakeStore([stored]), roleReader: roleReader([ROLE]),
    })
    expect(status).toBe('not_permitted')
    expect(evaluation).toBeNull()
  })

  it('listings drop rows with a broken discriminator', async () => {
    const store = new FakeStore([row({ source: 'dream' })])
    const { packages } = await listProjectWorkPackages(PROJECT_P, { store })
    expect(packages).toEqual([])
  })

  it('the writer, the legacy filter and the re-proof share one value', () => {
    const store = sources.find(s => s.file === 'store.ts')!.text
    const manager = readFileSync(resolve(__dirname, '../ai/manager.ts'), 'utf8')
    expect(store).toMatch(/source: 'work_package'/)
    expect(store).toMatch(/source_key: p\.workPackageId/)
    expect(manager).toMatch(/source\.neq\.work_package/)
    expect(WORK_PACKAGE_SOURCE).toBe('work_package')
  })

  it('assignment re-proves the contract the database returned', () => {
    const store = sources.find(s => s.file === 'store.ts')!.text
    const assign = store.slice(store.indexOf('async assign('), store.indexOf('async byPackageId'))
    expect(assign).toMatch(/assertAssignedContractCoherent\(stored\)/)
  })

  it.each([
    ['a NULL source', { source: null }],
    ['a mismatched source key', { sourceKey: 'wrong' }],
    ['a drifted mission pin', { missionVersion: 9 }],
  ] as const)('the return-path guard THROWS on %s', (_name, cols) => {
    // Exercised directly: a source-text assertion cannot tell whether the guard
    // still runs, and the fake store has its own `assign`.
    expect(() => assertAssignedContractCoherent(row(cols as never)))
      .toThrow(/incoherent contract/)
  })

  it('the return-path guard passes a coherent contract', () => {
    expect(() => assertAssignedContractCoherent(row())).not.toThrow()
  })

  it('a real assignment produces a coherent, discriminated contract', async () => {
    const store = new FakeStore()
    const r = await assignWorkPackage(writeArgs(store))
    expect(r.status).toBe('ok')
    const stored = store.assigned[0]
    expect(stored.columns.source).toBe('work_package')
    expect(stored.columns.sourceKey).toBe(stored.workPackage.workPackageId)
    expect(validateStoredWorkPackage(stored).coherent).toBe(true)
  })
})

describe('migration', () => {
  const sql = readFileSync(MIGRATION, 'utf8')

  it('is additive only — no destructive statement anywhere', () => {
    expect(sql).not.toMatch(/\bdrop table\b/i)
    expect(sql).not.toMatch(/\bdelete from\b/i)
    expect(sql).not.toMatch(/\btruncate\b/i)
    expect(sql).not.toMatch(/\bupdate public\.manager_tasks\b/i)
    expect(sql).not.toMatch(/\binsert into\b/i)
    expect(sql).not.toMatch(/drop column/i)
  })

  it('never makes the legacy project column globally NOT NULL', () => {
    expect(sql).not.toMatch(/alter column project_id set not null/i)
    // Instead the requirement is conditional on a canonical package existing.
    expect(sql).toMatch(/work_package_id is null or project_id is not null/)
  })

  it('adds every canonical column as nullable, so legacy rows are unaffected', () => {
    for (const col of [
      'work_package_id', 'work_package', 'work_package_hash',
      'delegation_envelope_id', 'delegation_bound_hash',
      'mission_id', 'mission_version', 'mission_bound_hash',
      'workforce_role_id', 'assigned_at',
    ]) {
      expect(sql, col).toMatch(new RegExp(`add column if not exists ${col}\\b`))
    }
    expect(sql).not.toMatch(/add column if not exists \w+ +\w+ +not null/i)
  })

  it('requires a complete contract or none at all', () => {
    expect(sql).toMatch(/manager_tasks_work_package_shape_check/)
  })

  it('binds the role to the sanctioned registry with ON DELETE RESTRICT', () => {
    expect(sql).toMatch(/foreign key \(workforce_role_id\) references public\.agents\(id\) on delete restrict/)
  })

  it('makes the authority contract immutable without freezing the table', () => {
    expect(sql).toMatch(/create trigger manager_tasks_work_package_immutable/)
    expect(sql).toMatch(/before update on public\.manager_tasks/)
    // Legacy operational columns must NOT appear in the frozen list. Sliced
    // from the CANONICAL branch, which begins after the legacy-attachment guard.
    const canonicalBranch = sql.slice(sql.indexOf('-- From here the row carries a contract'))
    const guard = canonicalBranch.slice(0, canonicalBranch.indexOf('raise exception'))
    for (const legacy of ['status', 'result', 'run_id', 'workflow_id', 'priority', 'title', 'description']) {
      expect(guard, legacy).not.toMatch(new RegExp(`new\\.${legacy}\\b`))
    }
    // And the authority columns must.
    for (const owned of ['work_package', 'work_package_hash', 'mission_id', 'workforce_role_id', 'project_id']) {
      expect(guard, owned).toMatch(new RegExp(`new\\.${owned}\\b`))
    }
  })

  it('lets a legacy row pass ONLY while it stays legacy (R1)', () => {
    const legacyBranch = sql.slice(sql.indexOf('if old.work_package_id is null'),
      sql.indexOf('-- From here the row carries a contract'))
    // An ordinary legacy update still returns.
    expect(legacyBranch).toMatch(/return new;/)
    // But attaching ANY canonical field raises instead.
    expect(legacyBranch).toMatch(/raise exception/)
    for (const col of [
      'work_package_id', 'work_package', 'work_package_hash',
      'delegation_envelope_id', 'delegation_bound_hash',
      'mission_id', 'mission_version', 'mission_bound_hash',
      'workforce_role_id', 'assigned_at',
    ]) {
      expect(legacyBranch, col).toMatch(new RegExp(`new\\.${col}\\b`))
    }
  })

  it('states both structural shapes — legacy all-null OR canonical complete', () => {
    const shape = sql.slice(sql.indexOf('manager_tasks_work_package_shape_check'))
    const check = shape.slice(0, shape.indexOf('end if;'))
    // The legacy branch must require every canonical column to be NULL.
    for (const col of ['work_package', 'work_package_hash', 'mission_id', 'workforce_role_id', 'assigned_at']) {
      expect(check, col).toMatch(new RegExp(`${col}\\s+is null`))
    }
    expect(check).toMatch(/work_package_id\s+is not null/)
  })

  it('one canonical package per id, via a PARTIAL unique index', () => {
    expect(sql).toMatch(/create unique index if not exists manager_tasks_work_package_id_idx[\s\S]{0,120}where work_package_id is not null/)
  })

  it('requires the canonical discriminator on canonical rows (R2)', () => {
    expect(sql).toMatch(/manager_tasks_work_package_source_check/)
    expect(sql).toMatch(/source = 'work_package' and source_key = work_package_id::text/)
  })

  it('forbids a legacy row from CLAIMING to be a work package (R2/R3)', () => {
    const check = sql.slice(sql.lastIndexOf('manager_tasks_work_package_source_check'))
    // NULL-safe form: `IS DISTINCT FROM` never returns NULL, so the legacy
    // branch cannot be satisfied by absence.
    expect(check.slice(0, 700)).toMatch(/else source is distinct from 'work_package'/)
  })

  it('the canonical branch cannot be satisfied by NULL (R3)', () => {
    // THE FINDING. A PostgreSQL CHECK rejects only FALSE — NULL satisfies it —
    // so `source = 'work_package' and source_key = …` passed for a canonical row
    // with a NULL source, because the comparison evaluated to NULL. `IS TRUE`
    // collapses that to false. A regex alone cannot prove runtime SQL
    // semantics, which is why the truth table was run against real PostgreSQL;
    // this test exists to stop the protection being removed.
    const check = sql.slice(sql.lastIndexOf('manager_tasks_work_package_source_check'))
    const body = check.slice(0, 700)
    expect(body).toMatch(/\(source = 'work_package' and source_key = work_package_id::text\) is true/)
    // The bare, NULL-permitting form must not reappear.
    expect(body).not.toMatch(/then source = 'work_package' and source_key = work_package_id::text\s*$/m)
  })

  it('neither CHECK branch can return NULL (R3)', () => {
    const check = sql.slice(sql.lastIndexOf('manager_tasks_work_package_source_check'))
    const body = check.slice(0, 700)
    expect(body).toMatch(/is true/)                    // canonical branch
    expect(body).toMatch(/is distinct from/)           // legacy branch
  })

  it('does not globally constrain legacy source_key (R3)', () => {
    // A legacy row may keep any source_key, including NULL. Only the canonical
    // branch ties it to the package id.
    const check = sql.slice(sql.lastIndexOf('manager_tasks_work_package_source_check'))
    expect(check.slice(0, 700)).not.toMatch(/else[\s\S]{0,120}source_key/)
  })

  it('leaves other legacy source values alone (R2)', () => {
    // Nothing constrains legacy `source` to an enum; NULL, 'dream' and any
    // other existing value stay exactly as valid as before.
    expect(sql).not.toMatch(/source in \(/)
    expect(sql).not.toMatch(/source = 'dream'/)
  })

  it('freezes the discriminator once a contract exists (R2)', () => {
    const canonicalBranch = sql.slice(sql.indexOf('-- From here the row carries a contract'))
    const guard = canonicalBranch.slice(0, canonicalBranch.indexOf('raise exception'))
    expect(guard).toMatch(/new\.source\b/)
    expect(guard).toMatch(/new\.source_key\b/)
  })

  it('does NOT freeze source for legacy rows (R2)', () => {
    // The legacy branch guards only against ATTACHING a contract; ordinary
    // legacy `source` edits keep working.
    const legacyBranch = sql.slice(sql.indexOf('if old.work_package_id is null'),
      sql.indexOf('-- From here the row carries a contract'))
    expect(legacyBranch).not.toMatch(/new\.source\b/)
  })

  it('protects canonical assignment history from DELETE (R2)', () => {
    expect(sql).toMatch(/create or replace function public\.manager_tasks_reject_work_package_delete/)
    expect(sql).toMatch(/create trigger manager_tasks_work_package_no_delete/)
    expect(sql).toMatch(/before delete on public\.manager_tasks/)
  })

  it('leaves legacy DELETE semantics untouched, cascade included (R2)', () => {
    const fn = sql.slice(sql.indexOf('manager_tasks_reject_work_package_delete'))
    const body = fn.slice(0, fn.indexOf('$$;'))
    expect(body).toMatch(/if old\.work_package_id is null then\s+return old;/)
    // And the table is NOT made append-only.
    expect(sql).not.toMatch(/for each row execute function public\.manager_tasks_reject_work_package_delete\(\);[\s\S]*append-only/i)
  })

  it('blocks the project cascade rather than rewriting the FK (R2)', () => {
    // A BEFORE DELETE trigger on the child fires for cascaded deletes too, so
    // the existing ON DELETE CASCADE foreign key is left alone.
    expect(sql).not.toMatch(/alter table public\.manager_tasks[\s\S]{0,200}drop constraint manager_tasks_project_id_fkey/)
    expect(sql).toMatch(/cascade/i)
  })

  it('creates no queue, cron or dispatch machinery', () => {
    // The header DOCUMENTS that it creates no queue and no cron, so the guard
    // reads executable SQL rather than the sentence promising the absence.
    const ddl = sql.replace(/^\s*--.*$/gm, ' ')
    expect(ddl).not.toMatch(/pg_cron|pg_net|\bhttp\b|queue/i)
    expect(ddl).not.toMatch(/create trigger[\s\S]{0,80}after (insert|update)/i)
  })
})
