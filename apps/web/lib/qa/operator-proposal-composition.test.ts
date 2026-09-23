/**
 * Phase 1B — real server-side proposal composition.
 *
 * Proves `proposeOperatorCodeWork` now composes the live WorkPackage boundary,
 * the Phase 1A translator and the existing `deriveCodeWorkProposal` /
 * control-plane store seam, in that order, with every authority-bearing
 * binding derived server-side. The store is a stub and the Work Package
 * resolver is injected, exactly as the SDF-1B2 suite does; no model, process,
 * filesystem, Git, network or database is touched and no work is executed.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { WorkPackage, WorkPackageEvaluation } from '@/lib/atlas/workpackage/types'
import { codeWorkAdmissionHash } from '@/lib/atlas/code-work/binding'
import { CODE_WORK_COMMANDS } from '@/lib/atlas/code-work/command-registry'
import {
  buildOperatorCodeWorkAdmission,
  buildOperatorCodeWorkBindings,
  operatorCodeWorkId,
  OPERATOR_PROPOSAL_MISSION_RISK_LEVEL,
  parseOperatorCodeWorkProposal,
} from '@/lib/atlas/code-work/control-plane/operator-admission'
import {
  proposeOperatorCodeWork,
  translationRejectionToOperatorStatus,
} from '@/lib/atlas/code-work/control-plane/operator-write'
import type { CodeWorkControlPlaneStore, ProposeInput } from '@/lib/atlas/code-work/control-plane/store'
import type { StoredCodeWorkRun } from '@/lib/atlas/code-work/control-plane/types'
import { codeWorkRepositoryResource } from '@/lib/atlas/code-work/control-plane/work-package'
import { translateWorkPackageToAdmission } from '@/lib/atlas/code-work/mission-translation/translate'
import { MISSION_RISK_LEVEL_POLICIES } from '@/lib/atlas/code-work/mission-translation/types'
import { validateCodeWorkAdmission } from '@/lib/atlas/code-work/policy'
import { OMNIRA_REPOSITORY_ID, OMNIRA_TRUSTED_REPOSITORY } from '@/lib/atlas/code-work/repository-registry'
import { CLAUDE_PATCH_V1 } from '@/lib/atlas/code-work/worker-registry'
import {
  CODE_WORK_AUTHORIZATION_ACTION_KIND,
  CODE_WORK_CAPABILITY_ID,
} from '@/lib/atlas/code-work/types'

const PROJECT = '20000000-0000-4000-8000-000000000001'
const FOREIGN = '20000000-0000-4000-8000-000000000099'
const USER = '10000000-0000-4000-8000-000000000001'
const PACKAGE = '60000000-0000-4000-8000-000000000001'
const MISSION = '40000000-0000-4000-8000-000000000001'
const ENVELOPE = '50000000-0000-4000-8000-000000000001'
const AUTH_UUID = '90000000-0000-4000-8000-000000000001'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const BASE = 'a2751fb3e65a138f460a2a4acf4149a5f1d501f1'
const ASSIGNED_AT = '2026-09-19T07:00:00Z'

const access = { ok: true as const, userId: USER, allowedProjectIds: [PROJECT] }

function workPackage(overrides: Partial<WorkPackage> = {}): WorkPackage {
  return {
    workPackageId: PACKAGE,
    envelopeId: ENVELOPE,
    delegationBoundHash: HASH_B,
    missionId: MISSION,
    missionVersion: 1,
    missionBoundHash: HASH_A,
    projectId: PROJECT,
    assignedRole: { roleId: '70000000-0000-4000-8000-000000000001', roleName: 'Developer' },
    taskObjective: 'Prepare a bounded operator-plane patch.',
    inputs: [], expectedOutput: [],
    authority: [{ action: CODE_WORK_AUTHORIZATION_ACTION_KIND }],
    allowedActions: [{ action: CODE_WORK_AUTHORIZATION_ACTION_KIND }],
    forbiddenActions: [], constraints: [],
    tools: [{ tool: CODE_WORK_CAPABILITY_ID }],
    dataScope: [
      { resource: codeWorkRepositoryResource(OMNIRA_REPOSITORY_ID, 'apps/web/lib'), access: 'read' },
      { resource: codeWorkRepositoryResource(OMNIRA_REPOSITORY_ID, 'apps/web/lib/atlas/code-work'), access: 'write' },
    ],
    budget: null, deadline: null, reporting: [], escalationTriggers: [], stopConditions: [],
    approvalGates: [], inScope: [], outOfScope: [], dependencies: [], fallback: null,
    packageVersion: 1, packageHash: HASH_A,
    ...overrides,
  }
}

function usable(pkg: WorkPackage = workPackage()): WorkPackageEvaluation {
  return {
    lifecycleState: 'assigned', effectiveState: 'assigned', usable: true,
    reason: 'usable', workPackage: pkg, assignedAt: ASSIGNED_AT,
  }
}

const rawProposal = {
  workPackageId: PACKAGE,
  pinnedBaseSha: BASE,
  readPaths: ['apps/web/lib'],
  writePaths: ['apps/web/lib/atlas/code-work/control-plane'],
  idempotencyKey: 'composition-proposal-1',
}

function storedRun(input: ProposeInput): StoredCodeWorkRun {
  return {
    workId: input.admission.workId, projectId: PROJECT, requestedBy: USER,
    proposalKeyHash: input.proposalKeyHash, proposalFingerprintHash: input.proposalFingerprintHash,
    admission: input.admission, admissionHash: input.admissionHash,
    authorizationId: input.authorizationId, authorizationExpiresAt: null,
    state: 'proposed', stateVersion: 0, authorizedAt: null,
    claimId: null, fence: 0, leaseUntil: null, cancelRequested: false,
    lastReceiptSequence: 1, receiptChainHead: HASH_A,
    terminalAt: null, terminalReasonCode: null,
    createdAt: '2026-09-19T08:00:00Z', updatedAt: '2026-09-19T08:00:00Z',
  }
}

function store(overrides: Partial<CodeWorkControlPlaneStore> = {}): CodeWorkControlPlaneStore {
  return {
    propose: vi.fn(), byProjectAndWorkId: vi.fn(), byProposalKeyHash: vi.fn(), byProjects: vi.fn(),
    receiptsByWorkId: vi.fn(), workPackageObjectives: vi.fn(), synchronizeAuthorization: vi.fn(),
    claim: vi.fn(), heartbeat: vi.fn(), appendEvidence: vi.fn(), transition: vi.fn(), cancel: vi.fn(),
    ...overrides,
  } as CodeWorkControlPlaneStore
}

/** A recording store whose propose() echoes the persisted input back as a run. */
function recordingStore() {
  const proposed: ProposeInput[] = []
  const controlStore = store({
    propose: vi.fn(async input => { proposed.push(input); return storedRun(input) }),
  })
  return { proposed, controlStore }
}

function propose(
  raw: unknown,
  evaluation: WorkPackageEvaluation | null,
  controlStore: CodeWorkControlPlaneStore,
  overrides: { status?: string; access?: unknown } = {},
) {
  return proposeOperatorCodeWork(raw, {
    access: async () => (overrides.access ?? access) as never,
    resolvePackage: async () => ({ status: overrides.status ?? 'ok', evaluation }),
    store: controlStore,
    uuid: () => AUTH_UUID,
  })
}

function neverExecuted(controlStore: CodeWorkControlPlaneStore) {
  expect(controlStore.claim).not.toHaveBeenCalled()
  expect(controlStore.heartbeat).not.toHaveBeenCalled()
  expect(controlStore.appendEvidence).not.toHaveBeenCalled()
  expect(controlStore.transition).not.toHaveBeenCalled()
}

describe('Phase 1B — real composition reaches a persisted, human-reviewable proposal', () => {
  it('composes usable evaluation -> bindings -> translation -> derivation -> store, and executes nothing', async () => {
    const { proposed, controlStore } = recordingStore()
    const result = await propose(rawProposal, usable(), controlStore)

    expect(result.status).toBe('ok')
    expect(controlStore.propose).toHaveBeenCalledTimes(1)
    expect(proposed).toHaveLength(1)
    const persisted = proposed[0]

    // Identity and governance survive composition byte-for-byte.
    expect(persisted.admission.projectId).toBe(PROJECT)
    expect(persisted.admission.governance).toMatchObject({
      mission: { id: MISSION, version: 1, hash: HASH_A },
      delegation: { envelopeId: ENVELOPE, hash: HASH_B },
      workPackage: { id: PACKAGE, hash: HASH_A },
      authorizationTarget: { targetId: persisted.admission.workId, actionKind: CODE_WORK_AUTHORIZATION_ACTION_KIND },
    })
    expect(persisted.admission.workId).toBe(operatorCodeWorkId(PROJECT, USER, rawProposal.idempotencyKey))
    expect(persisted.admissionHash).toBe(codeWorkAdmissionHash(persisted.admission))
    expect(persisted.requestedBy).toBe(USER)
    expect(persisted.authorizationId).toBe(AUTH_UUID)
    expect(validateCodeWorkAdmission(persisted.admission).ok).toBe(true)

    // It stops at a pending proposal: nothing claims, heartbeats, records
    // evidence for or transitions the run.
    neverExecuted(controlStore)
  })

  it('translator output is deep-equal to the retained legacy builder for the same input (parity)', () => {
    const proposal = { ...rawProposal }
    const pkg = workPackage()
    const translated = translateWorkPackageToAdmission(
      usable(pkg),
      OPERATOR_PROPOSAL_MISSION_RISK_LEVEL,
      buildOperatorCodeWorkBindings({ proposal, workPackage: pkg, requestedBy: USER }),
    )
    expect(translated.ok).toBe(true)
    if (!translated.ok) return
    const legacy = buildOperatorCodeWorkAdmission({ proposal, workPackage: pkg, requestedBy: USER })
    expect(translated.admission).toEqual(legacy)
    expect(codeWorkAdmissionHash(translated.admission)).toBe(codeWorkAdmissionHash(legacy))
  })

  it('is deterministic: the same request composes to the same admission hash twice', async () => {
    const first = recordingStore()
    const second = recordingStore()
    await propose(rawProposal, usable(), first.controlStore)
    await propose(rawProposal, usable(), second.controlStore)
    expect(first.proposed[0].admissionHash).toBe(second.proposed[0].admissionHash)
    expect(first.proposed[0].proposalFingerprintHash).toBe(second.proposed[0].proposalFingerprintHash)
  })

  it('keeps the ordering: authenticate, then resolve, then persist', async () => {
    const order: string[] = []
    const controlStore = store({
      propose: vi.fn(async input => { order.push('persist'); return storedRun(input) }),
    })
    await proposeOperatorCodeWork(rawProposal, {
      access: async () => { order.push('authenticate'); return access },
      resolvePackage: async () => { order.push('resolve'); return { status: 'ok', evaluation: usable() } },
      store: controlStore,
      uuid: () => AUTH_UUID,
    })
    expect(order).toEqual(['authenticate', 'resolve', 'persist'])
  })
})

describe('Phase 1B — bindings are server-derived, never client-supplied', () => {
  it('derives every authority-bearing field from the reviewed registries', () => {
    const bindings = buildOperatorCodeWorkBindings({
      proposal: rawProposal, workPackage: { projectId: PROJECT }, requestedBy: USER,
    })
    expect(bindings.workId).toBe(operatorCodeWorkId(PROJECT, USER, rawProposal.idempotencyKey))
    expect(bindings.repository).toEqual({
      repositoryId: OMNIRA_TRUSTED_REPOSITORY.repositoryId,
      owner: OMNIRA_TRUSTED_REPOSITORY.owner,
      name: OMNIRA_TRUSTED_REPOSITORY.name,
      expectedRemote: OMNIRA_TRUSTED_REPOSITORY.remoteIdentity,
      pinnedBaseSha: BASE,
      approvedRemote: OMNIRA_TRUSTED_REPOSITORY.approvedRemote,
      approvedBaseRef: OMNIRA_TRUSTED_REPOSITORY.approvedBaseRefs[0],
    })
    expect(bindings.worktree.branchPrefix).toBe(OMNIRA_TRUSTED_REPOSITORY.approvedBranchPrefix)
    expect(bindings.requiredCommandIds).toEqual(Object.keys(CODE_WORK_COMMANDS).sort())
    expect(bindings.files.deniedScopes).toEqual([])
    expect(bindings.files.permissions).toEqual({ create: true, update: true, delete: false, rename: false })
    // No worker hint: the translator resolves the one registered worker.
    expect(bindings.worker).toBeUndefined()
  })

  it('resolves the default worker from CLAUDE_PATCH_V1 in the persisted admission', async () => {
    const { proposed, controlStore } = recordingStore()
    await propose(rawProposal, usable(), controlStore)
    expect(proposed[0].admission.worker).toMatchObject({
      adapterId: CLAUDE_PATCH_V1.adapterId, provider: CLAUDE_PATCH_V1.provider, modelId: CLAUDE_PATCH_V1.modelId,
    })
  })

  it.each([
    'riskLevel', 'missionRiskLevel', 'workId', 'repository', 'repositoryId', 'branchPrefix', 'baseRef',
    'worker', 'workerHint', 'capability', 'commands', 'requiredCommandIds', 'requiredChecks',
    'files', 'deniedScopes', 'permissions', 'governance', 'evaluation', 'usable', 'bindings', 'admission',
  ])('rejects a client-supplied %s before anything is resolved or persisted', async field => {
    const controlStore = store()
    const resolvePackage = vi.fn()
    const result = await proposeOperatorCodeWork({ ...rawProposal, [field]: field === 'riskLevel' ? 0 : 'forged' }, {
      access: async () => access, resolvePackage, store: controlStore,
    })
    expect(result).toMatchObject({ status: 'invalid_request' })
    expect(result.detail).toContain('unknown_field')
    expect(resolvePackage).not.toHaveBeenCalled()
    expect(controlStore.propose).not.toHaveBeenCalled()
    expect(parseOperatorCodeWorkProposal({ ...rawProposal, [field]: 'forged' }, 'k').ok).toBe(false)
  })
})

describe('Phase 1B — Mission Risk Level is a provisional server constant, not a client choice', () => {
  it('is a defined level whose policy requires independent review and human approval', () => {
    expect(OPERATOR_PROPOSAL_MISSION_RISK_LEVEL).toBe(2)
    expect(MISSION_RISK_LEVEL_POLICIES[OPERATOR_PROPOSAL_MISSION_RISK_LEVEL]).toMatchObject({
      independentReviewRequired: true, humanApprovalRequired: true,
    })
    // Nothing that could enable auto-merge exists on any policy.
    for (const policy of Object.values(MISSION_RISK_LEVEL_POLICIES)) {
      expect(policy).not.toHaveProperty('mayAutoMerge')
    }
  })

  it('never reads a risk level from the request in the route or the write boundary', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/api/atlas/code-work/route.ts'), 'utf8')
    const write = readFileSync(resolve(process.cwd(), 'lib/atlas/code-work/control-plane/operator-write.ts'), 'utf8')
    expect(route).not.toMatch(/riskLevel/i)
    expect(write).not.toMatch(/(?:rawInput|parsed\.value|body)\.?riskLevel/)
    expect(write).toMatch(/OPERATOR_PROPOSAL_MISSION_RISK_LEVEL/)
  })
})

describe('Phase 1B — fail closed through the real composition, persisting nothing', () => {
  async function denied(
    raw: unknown, evaluation: WorkPackageEvaluation | null, overrides: { status?: string } = {},
  ) {
    const controlStore = store()
    const result = await propose(raw, evaluation, controlStore, overrides)
    expect(controlStore.propose).not.toHaveBeenCalled()
    neverExecuted(controlStore)
    return result
  }

  it('rejects an unusable Work Package', async () => {
    const invalidated: WorkPackageEvaluation = {
      lifecycleState: 'assigned', effectiveState: 'invalidated', usable: false,
      reason: 'delegation_unusable', workPackage: workPackage(), assignedAt: ASSIGNED_AT,
    }
    expect((await denied(rawProposal, invalidated)).status).toBe('not_permitted')
  })

  it('rejects a self-contradictory evaluation even when usable reads true', async () => {
    const contradictory: WorkPackageEvaluation = {
      lifecycleState: 'assigned', effectiveState: 'assigned', usable: true,
      reason: 'delegation_unusable', workPackage: workPackage(), assignedAt: ASSIGNED_AT,
    }
    expect((await denied(rawProposal, contradictory)).status).toBe('not_permitted')
  })

  it('rejects a resolver status other than ok, and reports an unavailable resolver honestly', async () => {
    expect((await denied(rawProposal, usable(), { status: 'not_permitted' })).status).toBe('not_permitted')
    expect((await denied(rawProposal, usable(), { status: 'malformed' })).status).toBe('not_permitted')
    expect((await denied(rawProposal, usable(), { status: 'unavailable' })).status).toBe('unavailable')
  })

  it('rejects a foreign / project-mismatched Work Package', async () => {
    const foreign = usable(workPackage({ projectId: FOREIGN }))
    expect((await denied(rawProposal, foreign)).status).toBe('not_permitted')
  })

  it.each([
    ['parent traversal', ['../secrets']],
    ['absolute path', ['/etc/passwd']],
    ['platform-denied path', ['apps/web/.env.production']],
    ['dot segment', ['apps/./web/lib']],
  ])('rejects an invalid requested write path (%s)', async (_label, writePaths) => {
    const result = await denied({ ...rawProposal, writePaths }, usable())
    expect(result.status).toBe('invalid_request')
  })

  it('rejects a scope wider than the live Work Package covered', async () => {
    const result = await denied({ ...rawProposal, writePaths: ['apps/web'] }, usable())
    expect(result.status).toBe('invalid_request')
    expect(result.detail).toContain('work_package_scope_exceeded')
  })

  it.each([
    ['short sha', 'a2751fb3'],
    ['uppercase sha', 'A2751FB3E65A138F460A2A4ACF4149A5F1D501F1'],
    ['branch name instead of a sha', 'main'],
  ])('rejects an untrusted base (%s)', async (_label, pinnedBaseSha) => {
    const result = await denied({ ...rawProposal, pinnedBaseSha }, usable())
    expect(result.status).toBe('invalid_request')
  })

  it('rejects a Work Package that never authorized the code-work action', async () => {
    const result = await denied(rawProposal, usable(workPackage({ authority: [], allowedActions: [] })))
    expect(result.status).toBe('invalid_request')
    expect(result.detail).toContain('code_action_not_authorized')
  })

  it('rejects a Work Package whose data scope never named the trusted repository', async () => {
    const result = await denied(rawProposal, usable(workPackage({ dataScope: [] })))
    expect(result.status).toBe('invalid_request')
    expect(result.detail).toContain('repository_not_covered')
  })
})

describe('Phase 1B — server-derived binding faults are translation rejections that map safely', () => {
  const bindingsFor = () => buildOperatorCodeWorkBindings({
    proposal: rawProposal, workPackage: { projectId: PROJECT }, requestedBy: USER,
  })
  const translate = (bindings: ReturnType<typeof bindingsFor>) => translateWorkPackageToAdmission(
    usable(), OPERATOR_PROPOSAL_MISSION_RISK_LEVEL, bindings,
  )

  it('propagates an unsupported command as an admission rejection mapped to invalid_request', () => {
    const result = translate({ ...bindingsFor(), requiredCommandIds: ['shell.anything'] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rejection.kind).toBe('admission_invalid')
    expect(translationRejectionToOperatorStatus(result.rejection)).toEqual({
      status: 'invalid_request', detail: expect.stringContaining('command_not_registered'),
    })
  })

  it('propagates an invalid worker as an admission rejection', () => {
    const result = translate({ ...bindingsFor(), worker: { modelId: 'not-a-registered-model' } })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(translationRejectionToOperatorStatus(result.rejection).detail).toContain('worker_not_registered')
  })

  it('propagates an untrusted repository as an admission rejection', () => {
    const base = bindingsFor()
    const result = translate({ ...base, repository: { ...base.repository, repositoryId: 'github.com/other/repo' } })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(translationRejectionToOperatorStatus(result.rejection).detail).toContain('repository_not_trusted')
  })

  it('maps usability rejections to not_permitted with no detail (no oracle)', () => {
    expect(translationRejectionToOperatorStatus({ kind: 'work_package_not_usable', reason: 'role_unavailable' }))
      .toEqual({ status: 'not_permitted' })
    expect(translationRejectionToOperatorStatus({ kind: 'work_package_evaluation_inconsistent' }))
      .toEqual({ status: 'not_permitted' })
  })

  it('maps faults no request can cause to integrity_violation, never to a client error', () => {
    expect(translationRejectionToOperatorStatus({ kind: 'work_id_not_persistable', workId: 'x' }))
      .toEqual({ status: 'integrity_violation', detail: 'work_id_not_persistable' })
    expect(translationRejectionToOperatorStatus({ kind: 'risk_policy_undefined', level: 9 }))
      .toEqual({ status: 'integrity_violation', detail: 'risk_policy_undefined' })
  })
})

describe('Phase 1B — structural: composition only, no execution', () => {
  const write = () => readFileSync(resolve(process.cwd(), 'lib/atlas/code-work/control-plane/operator-write.ts'), 'utf8')
  const admissionSource = () => readFileSync(resolve(process.cwd(), 'lib/atlas/code-work/control-plane/operator-admission.ts'), 'utf8')

  it('the production write path composes the translator and no longer builds an admission itself', () => {
    expect(write()).toMatch(/from '\.\.\/mission-translation\/translate'/)
    expect(write()).toMatch(/translateWorkPackageToAdmission\(/)
    expect(write()).toMatch(/deriveCodeWorkProposal\(/)
    expect(write()).not.toMatch(/buildOperatorCodeWorkAdmission/)
  })

  it('still resolves the live Work Package before translating, never a raw stored one', () => {
    const source = write()
    expect(source.indexOf('resolveWorkPackage')).toBeGreaterThan(-1)
    expect(source.indexOf('resolved.evaluation.usable')).toBeLessThan(source.indexOf('translateWorkPackageToAdmission('))
    expect(source).not.toMatch(/byPackageId|createWorkPackageStore/)
  })

  it('adds no dispatcher, model, process, filesystem, network or Git surface', () => {
    const source = write() + admissionSource()
    expect(source).not.toMatch(/from ['"](?:node:)?(?:child_process|fs|fs\/promises|worker_threads|net|http|https)['"]/)
    expect(source).not.toMatch(/from ['"]@anthropic-ai\/sdk['"]|from ['"]openai['"]|\bfetch\s*\(/)
    expect(source).not.toMatch(/\.claim\(|\.heartbeat\(|\.appendEvidence\(|\.transition\(/)
    expect(source).not.toMatch(/mayAutoMerge|autoMerge|auto-merge/i)
  })
})
