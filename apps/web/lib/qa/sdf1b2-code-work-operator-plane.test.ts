import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildAuthorizationEvent } from '@/lib/atlas/authorization/build'
import type { AuthorizationEventStore } from '@/lib/atlas/authorization/store'
import type { WorkPackage } from '@/lib/atlas/workpackage/types'
import { codeWorkAdmissionHash } from '@/lib/atlas/code-work/binding'
import {
  buildOperatorCodeWorkAdmission,
  operatorCodeWorkId,
  parseOperatorCodeWorkProposal,
} from '@/lib/atlas/code-work/control-plane/operator-admission'
import { readOperatorCodeWorkDetail, toSafeCodeWorkReceipt } from '@/lib/atlas/code-work/control-plane/operator-read'
import {
  decideOperatorCodeWork,
  proposeOperatorCodeWork,
} from '@/lib/atlas/code-work/control-plane/operator-write'
import type { CodeWorkControlPlaneStore, ProposeInput } from '@/lib/atlas/code-work/control-plane/store'
import type { StoredCodeWorkRun } from '@/lib/atlas/code-work/control-plane/types'
import { codeWorkRepositoryResource } from '@/lib/atlas/code-work/control-plane/work-package'
import { OMNIRA_REPOSITORY_ID } from '@/lib/atlas/code-work/repository-registry'
import {
  CODE_WORK_AUTHORIZATION_ACTION_KIND,
  CODE_WORK_AUTHORIZATION_TARGET_TYPE,
  CODE_WORK_CAPABILITY_ID,
} from '@/lib/atlas/code-work/types'
import { describe, expect, it, vi } from 'vitest'

const PROJECT = '20000000-0000-4000-8000-000000000001'
const FOREIGN = '20000000-0000-4000-8000-000000000099'
const USER = '10000000-0000-4000-8000-000000000001'
const PACKAGE = '60000000-0000-4000-8000-000000000001'
const MISSION = '40000000-0000-4000-8000-000000000001'
const ENVELOPE = '50000000-0000-4000-8000-000000000001'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const BASE = 'a2751fb3e65a138f460a2a4acf4149a5f1d501f1'

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

const rawProposal = {
  workPackageId: PACKAGE,
  pinnedBaseSha: BASE,
  readPaths: ['apps/web/lib'],
  writePaths: ['apps/web/lib/atlas/code-work/control-plane'],
  idempotencyKey: 'owner-proposal-1',
}

function admission() {
  return buildOperatorCodeWorkAdmission({ proposal: rawProposal, workPackage: workPackage(), requestedBy: USER })
}

function run(overrides: Partial<StoredCodeWorkRun> = {}): StoredCodeWorkRun {
  const value = admission()
  return {
    workId: value.workId, projectId: PROJECT, requestedBy: USER,
    proposalKeyHash: HASH_A, proposalFingerprintHash: HASH_B,
    admission: value, admissionHash: codeWorkAdmissionHash(value),
    authorizationId: '80000000-0000-4000-8000-000000000001', authorizationExpiresAt: null,
    state: 'proposed', stateVersion: 0, authorizedAt: null,
    claimId: null, fence: 0, leaseUntil: null, cancelRequested: false,
    lastReceiptSequence: 3, receiptChainHead: HASH_A,
    terminalAt: null, terminalReasonCode: null,
    createdAt: '2026-09-19T08:00:00Z', updatedAt: '2026-09-19T08:00:00Z',
    ...overrides,
  }
}

function pendingAuthorization(value = run()) {
  return buildAuthorizationEvent({
    type: 'requested',
    authorizationId: value.authorizationId,
    eventId: '90000000-0000-4000-8000-000000000001',
    occurredAt: '2026-09-19T08:00:00Z',
    projectId: value.projectId,
    principalId: USER,
    target: {
      targetType: CODE_WORK_AUTHORIZATION_TARGET_TYPE,
      targetId: value.workId,
      versionHash: value.admissionHash,
    },
    authority: { actionKind: CODE_WORK_AUTHORIZATION_ACTION_KIND, description: 'Prepare one bounded isolated patch.' },
  })
}

function store(overrides: Partial<CodeWorkControlPlaneStore> = {}): CodeWorkControlPlaneStore {
  return {
    propose: vi.fn(), byProjectAndWorkId: vi.fn(), byProposalKeyHash: vi.fn(), byProjects: vi.fn(),
    receiptsByWorkId: vi.fn(), workPackageObjectives: vi.fn(), synchronizeAuthorization: vi.fn(),
    claim: vi.fn(), heartbeat: vi.fn(), appendEvidence: vi.fn(), transition: vi.fn(), cancel: vi.fn(),
    ...overrides,
  } as CodeWorkControlPlaneStore
}

describe('SDF-1B2 operator proposal contract', () => {
  it('accepts only minimal human input and rejects authority-bearing fields', () => {
    expect(parseOperatorCodeWorkProposal(rawProposal, 'fallback').ok).toBe(true)
    for (const field of ['projectId', 'missionId', 'targetType', 'actionKind', 'worker', 'commands', 'limits', 'admission']) {
      const result = parseOperatorCodeWorkProposal({ ...rawProposal, [field]: 'forged' }, 'fallback')
      expect(result.ok, field).toBe(false)
      if (!result.ok) expect(result.violations.map(item => item.code)).toContain('unknown_field')
    }
  })

  it('derives the complete admission from the package and static registries', () => {
    const value = admission()
    expect(value.projectId).toBe(PROJECT)
    expect(value.governance).toMatchObject({
      mission: { id: MISSION, hash: HASH_A },
      delegation: { envelopeId: ENVELOPE, hash: HASH_B },
      workPackage: { id: PACKAGE, hash: HASH_A },
      authorizationTarget: { targetId: value.workId, actionKind: CODE_WORK_AUTHORIZATION_ACTION_KIND },
    })
    expect(value.repository).toMatchObject({ repositoryId: OMNIRA_REPOSITORY_ID, pinnedBaseSha: BASE })
    expect(value.worker).toMatchObject({ adapterId: 'claude_patch_v1', provider: 'anthropic', modelId: 'claude-sonnet-4-6' })
    expect(value.commands.approvedCommandIds).toEqual(['sdf1.proof.fixture_test', 'sdf1.proof.typecheck'])
    expect(value.isolation).toEqual({ network: 'denied', secrets: 'none' })
  })

  it('uses a deterministic work identity for same-key retries', () => {
    expect(operatorCodeWorkId(PROJECT, USER, 'key')).toBe(operatorCodeWorkId(PROJECT, USER, 'key'))
    expect(operatorCodeWorkId(PROJECT, USER, 'key')).not.toBe(operatorCodeWorkId(PROJECT, USER, 'other'))
  })

  it('authenticates before resolving a Work Package or touching the store', async () => {
    const resolvePackage = vi.fn()
    const controlStore = store()
    const result = await proposeOperatorCodeWork(rawProposal, {
      access: async () => ({ ok: false, response: {} as never }), resolvePackage, store: controlStore,
    })
    expect(result.status).toBe('no_principal')
    expect(resolvePackage).not.toHaveBeenCalled()
    expect(controlStore.propose).not.toHaveBeenCalled()
  })

  it.each([
    ['unknown', { status: 'not_permitted', evaluation: null }],
    ['unusable', { status: 'ok', evaluation: { lifecycleState: 'assigned', effectiveState: 'invalidated', usable: false, reason: 'delegation_unusable', workPackage: workPackage(), assignedAt: '2026-09-19T07:00:00Z' } }],
  ])('creates no row for an %s Work Package', async (_label, resolution) => {
    const controlStore = store()
    const result = await proposeOperatorCodeWork(rawProposal, {
      access: async () => access,
      resolvePackage: async () => resolution as never,
      store: controlStore,
    })
    expect(result.status).toBe('not_permitted')
    expect(controlStore.propose).not.toHaveBeenCalled()
  })

  it('rejects an overbroad requested path before persistence', async () => {
    const controlStore = store()
    const result = await proposeOperatorCodeWork({ ...rawProposal, writePaths: ['apps/web'] }, {
      access: async () => access,
      resolvePackage: async () => ({ status: 'ok', evaluation: { lifecycleState: 'assigned', effectiveState: 'assigned', usable: true, reason: 'usable', workPackage: workPackage(), assignedAt: '2026-09-19T07:00:00Z' } }),
      store: controlStore,
    })
    expect(result).toMatchObject({ status: 'invalid_request' })
    expect(controlStore.propose).not.toHaveBeenCalled()
  })

  it('persists an exact server-derived proposal and returns the race winner idempotently', async () => {
    const proposed: ProposeInput[] = []
    const winner = run()
    const controlStore = store({
      propose: vi.fn(async input => { proposed.push(input); throw new Error('duplicate key 23505') }),
      byProposalKeyHash: vi.fn(async () => ({ ...winner, proposalFingerprintHash: proposed[0].proposalFingerprintHash })),
    })
    const result = await proposeOperatorCodeWork(rawProposal, {
      access: async () => access,
      resolvePackage: async () => ({ status: 'ok', evaluation: { lifecycleState: 'assigned', effectiveState: 'assigned', usable: true, reason: 'usable', workPackage: workPackage(), assignedAt: '2026-09-19T07:00:00Z' } }),
      store: controlStore,
      uuid: () => '90000000-0000-4000-8000-000000000001',
    })
    expect(result.status).toBe('idempotent')
    expect(proposed[0].admission.projectId).toBe(PROJECT)
    expect(proposed[0].admissionHash).toBe(codeWorkAdmissionHash(proposed[0].admission))
  })

  it('returns conflict when a same-key race has a different fingerprint', async () => {
    const controlStore = store({
      propose: vi.fn(async () => { throw new Error('duplicate key 23505') }),
      byProposalKeyHash: vi.fn(async () => run({ proposalFingerprintHash: 'f'.repeat(64) })),
    })
    const result = await proposeOperatorCodeWork(rawProposal, {
      access: async () => access,
      resolvePackage: async () => ({ status: 'ok', evaluation: { lifecycleState: 'assigned', effectiveState: 'assigned', usable: true, reason: 'usable', workPackage: workPackage(), assignedAt: '2026-09-19T07:00:00Z' } }),
      store: controlStore,
      uuid: () => '90000000-0000-4000-8000-000000000001',
    })
    expect(result.status).toBe('conflict')
  })

  it('recognizes an existing RPC result as an idempotent retry without another authorization chain', async () => {
    const existing = run()
    const controlStore = store({ propose: vi.fn(async () => existing) })
    const result = await proposeOperatorCodeWork(rawProposal, {
      access: async () => access,
      resolvePackage: async () => ({ status: 'ok', evaluation: { lifecycleState: 'assigned', effectiveState: 'assigned', usable: true, reason: 'usable', workPackage: workPackage(), assignedAt: '2026-09-19T07:00:00Z' } }),
      store: controlStore,
      uuid: () => '90000000-0000-4000-8000-000000000001',
    })
    expect(result).toMatchObject({ status: 'idempotent', run: { authorizationId: existing.authorizationId } })
    expect(controlStore.propose).toHaveBeenCalledTimes(1)
  })
})

describe('SDF-1B2 exact operator decisions', () => {
  it('does not read a foreign project control row', async () => {
    const controlStore = store({ byProjectAndWorkId: vi.fn(async () => run()) })
    const result = await decideOperatorCodeWork(FOREIGN, run().workId, { action: 'cancel' }, {
      access: async () => access, store: controlStore,
    })
    expect(result.status).toBe('not_permitted')
    expect(controlStore.byProjectAndWorkId).not.toHaveBeenCalled()
  })

  it('grants only the exact pending binding, then synchronizes B1 lifecycle', async () => {
    const proposed = run()
    const authorized = run({ state: 'authorized', authorizedAt: '2026-09-19T08:01:00Z' })
    const controlStore = store({
      byProjectAndWorkId: vi.fn(async () => proposed),
      synchronizeAuthorization: vi.fn(async () => authorized),
    })
    const authorizationStore = { history: vi.fn(async () => [pendingAuthorization(proposed)]) } as unknown as AuthorizationEventStore
    const grant = vi.fn(async () => ({ status: 'ok' as const, state: null }))
    const result = await decideOperatorCodeWork(PROJECT, proposed.workId, {
      action: 'grant', expiresAt: '2026-09-19T12:00:00Z',
    }, { access: async () => access, store: controlStore, authorizationStore, grant })
    expect(result).toMatchObject({ status: 'ok', run: { state: 'authorized' } })
    expect(grant).toHaveBeenCalledWith(expect.objectContaining({
      authorizationId: proposed.authorizationId,
      expiresAt: '2026-09-19T12:00:00Z',
      store: authorizationStore,
    }))
    expect(controlStore.synchronizeAuthorization).toHaveBeenCalledWith(proposed.workId)
  })

  it('fails closed on an authorization/admission binding mismatch', async () => {
    const proposed = run()
    const wrong = pendingAuthorization(proposed)
    wrong.target.versionHash = 'f'.repeat(64)
    const controlStore = store({ byProjectAndWorkId: vi.fn(async () => proposed) })
    const authorizationStore = { history: vi.fn(async () => [wrong]) } as unknown as AuthorizationEventStore
    const grant = vi.fn()
    const result = await decideOperatorCodeWork(PROJECT, proposed.workId, {
      action: 'grant', expiresAt: '2026-09-19T12:00:00Z',
    }, { access: async () => access, store: controlStore, authorizationStore, grant })
    expect(result.status).toBe('integrity_violation')
    expect(grant).not.toHaveBeenCalled()
  })

  it('denies through Authorization V1 and lets B1 produce the terminal state', async () => {
    const proposed = run()
    const denied = run({ state: 'policy_denied', terminalAt: '2026-09-19T08:01:00Z', terminalReasonCode: 'authorization_denied' })
    const controlStore = store({
      byProjectAndWorkId: vi.fn(async () => proposed),
      synchronizeAuthorization: vi.fn(async () => denied),
    })
    const authorizationStore = { history: vi.fn(async () => [pendingAuthorization(proposed)]) } as unknown as AuthorizationEventStore
    const deny = vi.fn(async () => ({ status: 'ok' as const, state: null }))
    const result = await decideOperatorCodeWork(PROJECT, proposed.workId, { action: 'deny' }, {
      access: async () => access, store: controlStore, authorizationStore, deny,
    })
    expect(result).toMatchObject({ status: 'ok', run: { state: 'policy_denied' } })
  })

  it('never treats a conditional grant as effective and synchronizes the fail-closed state', async () => {
    const proposed = run()
    const requested = pendingAuthorization(proposed)
    const conditional = buildAuthorizationEvent({
      type: 'granted_with_conditions', authorizationId: proposed.authorizationId,
      eventId: '90000000-0000-4000-8000-000000000002', occurredAt: '2026-09-19T08:01:00Z',
      projectId: PROJECT, principalId: USER, target: requested.target, authority: requested.authority,
      expiresAt: '2099-09-19T12:00:00Z',
      conditions: [{ conditionId: 'manual', type: 'manual', value: 'review', description: 'not enforced' }],
    })
    const refused = run({ state: 'policy_denied', terminalAt: '2026-09-19T08:02:00Z' })
    const controlStore = store({
      byProjectAndWorkId: vi.fn(async () => proposed),
      synchronizeAuthorization: vi.fn(async () => refused),
    })
    const authorizationStore = { history: vi.fn(async () => [requested, conditional]) } as unknown as AuthorizationEventStore
    const grant = vi.fn()
    const result = await decideOperatorCodeWork(PROJECT, proposed.workId, {
      action: 'grant', expiresAt: '2099-09-19T12:00:00Z',
    }, { access: async () => access, store: controlStore, authorizationStore, grant })
    expect(result).toMatchObject({ status: 'conflict', run: { state: 'policy_denied' } })
    expect(grant).not.toHaveBeenCalled()
  })

  it('does not reinterpret an existing grant with a different expiry as an idempotent retry', async () => {
    const proposed = run()
    const requested = pendingAuthorization(proposed)
    const granted = buildAuthorizationEvent({
      type: 'granted', authorizationId: proposed.authorizationId,
      eventId: '90000000-0000-4000-8000-000000000003', occurredAt: '2026-09-19T08:01:00Z',
      projectId: PROJECT, principalId: USER, target: requested.target, authority: requested.authority,
      expiresAt: '2099-09-19T12:00:00Z',
    })
    const controlStore = store({ byProjectAndWorkId: vi.fn(async () => proposed) })
    const authorizationStore = { history: vi.fn(async () => [requested, granted]) } as unknown as AuthorizationEventStore
    const result = await decideOperatorCodeWork(PROJECT, proposed.workId, {
      action: 'grant', expiresAt: '2099-09-19T13:00:00Z',
    }, { access: async () => access, store: controlStore, authorizationStore })
    expect(result.status).toBe('conflict')
    expect(controlStore.synchronizeAuthorization).not.toHaveBeenCalled()
  })

  it('retries an identical existing grant without appending a second authority act', async () => {
    const proposed = run()
    const requested = pendingAuthorization(proposed)
    const expiresAt = '2099-09-19T12:00:00Z'
    const granted = buildAuthorizationEvent({
      type: 'granted', authorizationId: proposed.authorizationId,
      eventId: '90000000-0000-4000-8000-000000000004', occurredAt: '2026-09-19T08:01:00Z',
      projectId: PROJECT, principalId: USER, target: requested.target, authority: requested.authority, expiresAt,
    })
    const authorized = run({ state: 'authorized', authorizationExpiresAt: expiresAt })
    const controlStore = store({
      byProjectAndWorkId: vi.fn(async () => proposed), synchronizeAuthorization: vi.fn(async () => authorized),
    })
    const authorizationStore = { history: vi.fn(async () => [requested, granted]) } as unknown as AuthorizationEventStore
    const grant = vi.fn()
    const result = await decideOperatorCodeWork(PROJECT, proposed.workId, { action: 'grant', expiresAt }, {
      access: async () => access, store: controlStore, authorizationStore, grant,
    })
    expect(result).toMatchObject({ status: 'idempotent', run: { state: 'authorized' } })
    expect(grant).not.toHaveBeenCalled()
  })

  it('reconciles a revoked chain fail-closed without appending another grant', async () => {
    const proposed = run()
    const requested = pendingAuthorization(proposed)
    const granted = buildAuthorizationEvent({
      type: 'granted', authorizationId: proposed.authorizationId,
      eventId: '90000000-0000-4000-8000-000000000005', occurredAt: '2026-09-19T08:01:00Z',
      projectId: PROJECT, principalId: USER, target: requested.target, authority: requested.authority,
      expiresAt: '2099-09-19T12:00:00Z',
    })
    const revoked = buildAuthorizationEvent({
      type: 'revoked', authorizationId: proposed.authorizationId,
      eventId: '90000000-0000-4000-8000-000000000006', occurredAt: '2026-09-19T08:02:00Z',
      projectId: PROJECT, principalId: USER, target: requested.target, authority: requested.authority,
      reason: 'owner revoked',
    })
    const refused = run({ state: 'policy_denied', terminalAt: '2026-09-19T08:03:00Z' })
    const controlStore = store({
      byProjectAndWorkId: vi.fn(async () => proposed), synchronizeAuthorization: vi.fn(async () => refused),
    })
    const authorizationStore = { history: vi.fn(async () => [requested, granted, revoked]) } as unknown as AuthorizationEventStore
    const grant = vi.fn()
    const result = await decideOperatorCodeWork(PROJECT, proposed.workId, {
      action: 'grant', expiresAt: '2099-09-19T12:00:00Z',
    }, { access: async () => access, store: controlStore, authorizationStore, grant })
    expect(result).toMatchObject({ status: 'conflict', run: { state: 'policy_denied' } })
    expect(grant).not.toHaveBeenCalled()
  })

  it('retries an existing denial idempotently and does not append a duplicate denial', async () => {
    const proposed = run()
    const requested = pendingAuthorization(proposed)
    const deniedEvent = buildAuthorizationEvent({
      type: 'denied', authorizationId: proposed.authorizationId,
      eventId: '90000000-0000-4000-8000-000000000007', occurredAt: '2026-09-19T08:01:00Z',
      projectId: PROJECT, principalId: USER, target: requested.target, authority: requested.authority,
      reason: 'owner denied',
    })
    const deniedRun = run({ state: 'policy_denied', terminalAt: '2026-09-19T08:02:00Z' })
    const controlStore = store({
      byProjectAndWorkId: vi.fn(async () => proposed), synchronizeAuthorization: vi.fn(async () => deniedRun),
    })
    const authorizationStore = { history: vi.fn(async () => [requested, deniedEvent]) } as unknown as AuthorizationEventStore
    const deny = vi.fn()
    const result = await decideOperatorCodeWork(PROJECT, proposed.workId, { action: 'deny' }, {
      access: async () => access, store: controlStore, authorizationStore, deny,
    })
    expect(result).toMatchObject({ status: 'idempotent', run: { state: 'policy_denied' } })
    expect(deny).not.toHaveBeenCalled()
  })

  it('cancels only through the B1 cancellation primitive and is idempotent after cancellation', async () => {
    const proposed = run()
    const cancelled = run({ state: 'cancelled', cancelRequested: true, terminalAt: '2026-09-19T08:02:00Z' })
    const controlStore = store({
      byProjectAndWorkId: vi.fn(async () => proposed),
      cancel: vi.fn(async () => cancelled),
    })
    const first = await decideOperatorCodeWork(PROJECT, proposed.workId, { action: 'cancel' }, { access: async () => access, store: controlStore })
    expect(first).toMatchObject({ status: 'ok', run: { state: 'cancelled' } })
    expect(controlStore.cancel).toHaveBeenCalledWith(proposed.workId, PROJECT, USER, 'operator_cancelled')

    const retryStore = store({ byProjectAndWorkId: vi.fn(async () => cancelled), cancel: vi.fn(async () => cancelled) })
    const retry = await decideOperatorCodeWork(PROJECT, proposed.workId, { action: 'cancel' }, { access: async () => access, store: retryStore })
    expect(retry.status).toBe('idempotent')
  })

  it('does not rewrite another terminal outcome as cancellation', async () => {
    const terminal = run({ state: 'ready_for_human_review', terminalAt: '2026-09-19T08:02:00Z' })
    const controlStore = store({ byProjectAndWorkId: vi.fn(async () => terminal), cancel: vi.fn() })
    const result = await decideOperatorCodeWork(PROJECT, terminal.workId, { action: 'cancel' }, {
      access: async () => access, store: controlStore,
    })
    expect(result.status).toBe('ineligible')
    expect(controlStore.cancel).not.toHaveBeenCalled()
  })
})

describe('SDF-1B2 read isolation and no-execution boundary', () => {
  it('proves project ownership before control-plane detail reads', async () => {
    const controlStore = store({ byProjectAndWorkId: vi.fn(async () => run()) })
    const result = await readOperatorCodeWorkDetail({ id: FOREIGN, name: 'Foreign', slug: 'foreign', color: '#000' }, run().workId, {
      access: async () => access, store: controlStore,
    })
    expect(result.status).toBe('not_permitted')
    expect(controlStore.byProjectAndWorkId).not.toHaveBeenCalled()
  })

  it('keeps migration 80 byte-identical', () => {
    const bytes = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260918095827_sdf1b1_code_work_control_plane.sql'))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('54484f5af5d7addbb36729353ecc9f0213c9ec52d5b67bd4f5d015d29d60caa5')
  })

  it('uses a closed receipt payload projection and never leaks unknown secret-like fields', () => {
    const safe = toSafeCodeWorkReceipt({
      receiptId: '91000000-0000-4000-8000-000000000001', workId: run().workId,
      admissionHash: run().admissionHash, sequence: 1,
      eventType: 'authorization_requested', receiptClass: 'control',
      payload: { authorizationId: run().authorizationId, targetVersionHash: run().admissionHash, brokerToken: 'secret', serviceRole: 'secret' },
      payloadHash: HASH_A, previousReceiptHash: null, receiptHash: HASH_B,
      producerType: 'control_plane', producerId: 'authorization',
      observedAt: '2026-09-19T08:00:00Z', recordedAt: '2026-09-19T08:00:00Z',
    })
    expect(safe.payload).toEqual({ authorizationId: run().authorizationId, targetVersionHash: run().admissionHash })
    expect(JSON.stringify(safe)).not.toContain('secret')
  })

  it('adds no execution adapter, process, filesystem, Git or provider invocation', () => {
    const files = [
      'lib/atlas/code-work/control-plane/operator-admission.ts',
      'lib/atlas/code-work/control-plane/operator-authorization.ts',
      'lib/atlas/code-work/control-plane/operator-write.ts',
      'lib/atlas/code-work/control-plane/operator-read.ts',
      'app/api/atlas/code-work/route.ts',
      'app/api/atlas/code-work/[workId]/route.ts',
    ]
    const source = files.map(file => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n')
    expect(source).not.toMatch(/from ['"](?:node:)?(?:child_process|fs|fs\/promises|worker_threads)['"]/)
    expect(source).not.toMatch(/from ['"]@anthropic-ai\/sdk['"]|from ['"]openai['"]/)
    expect(source).not.toMatch(/\.claim\(|\.heartbeat\(|\.appendEvidence\(|\.transition\(/)
    expect(source).not.toMatch(/git\s+(?:commit|push|merge)|gh\s+pr|vercel\s+deploy/)
  })

  it('keeps routes purpose-specific and rejects a generic PATCH surface', () => {
    const proposal = readFileSync(resolve(process.cwd(), 'app/api/atlas/code-work/route.ts'), 'utf8')
    const decision = readFileSync(resolve(process.cwd(), 'app/api/atlas/code-work/[workId]/route.ts'), 'utf8')
    expect(proposal).toMatch(/proposeOperatorCodeWork\(body\)/)
    expect(proposal).not.toMatch(/body\.projectId|body\.admission|body\.worker|body\.commands/)
    expect(decision).toMatch(/new Set\(\['grant', 'deny', 'cancel'\]\)/)
    expect(decision).toMatch(/Date\.parse\(body\.expiresAt\) <= Date\.now\(\)/)
    expect(decision).not.toMatch(/export async function PATCH/)
  })
})
