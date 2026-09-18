import { describe, expect, it, vi } from 'vitest'
import { buildAuthorizationEvent } from '@/lib/atlas/authorization/build'
import type { WorkPackage } from '@/lib/atlas/workpackage/types'
import { codeWorkAdmissionHash } from '@/lib/atlas/code-work/binding'
import { codeWorkCommandRegistryHash, COMMAND_REGISTRY_VERSION } from '@/lib/atlas/code-work/command-registry'
import { effectiveCodeWorkAuthorization } from '@/lib/atlas/code-work/control-plane/authorization'
import { deriveCodeWorkProposal } from '@/lib/atlas/code-work/control-plane/derive-admission'
import { readCodeWorkRun } from '@/lib/atlas/code-work/control-plane/principal-read'
import type { CodeWorkControlPlaneStore } from '@/lib/atlas/code-work/control-plane/store'
import { codeWorkRepositoryResource, validateCodeWorkPackageAttenuation } from '@/lib/atlas/code-work/control-plane/work-package'
import { OMNIRA_REPOSITORY_ID } from '@/lib/atlas/code-work/repository-registry'
import { terminalEvidenceRequirements } from '@/lib/atlas/code-work/terminal-evidence'
import {
  CODE_WORK_ADMISSION_SCHEMA, CODE_WORK_ADMISSION_VERSION,
  CODE_WORK_AUTHORIZATION_ACTION_KIND, CODE_WORK_AUTHORIZATION_TARGET_TYPE,
  CODE_WORK_BASELINE_RECEIPT_CLASSES, CODE_WORK_CAPABILITY_ID,
  CODE_WORK_CAPABILITY_VERSION, CODE_WORK_OUTPUT_PROTOCOL,
  CODE_WORK_STOP_CONDITIONS, CODE_WORK_WORKER_ADAPTER_ID,
  CODE_WORK_WORKER_ADAPTER_VERSION, CODE_WORK_WORKTREE_POLICY_ID, SDF1_LIMITS,
} from '@/lib/atlas/code-work/types'
import type { CodeWorkAdmissionV1 } from '@/lib/atlas/code-work/types'

const access = vi.hoisted(() => ({
  value: { ok: true as const, userId: '10000000-0000-4000-8000-000000000001', allowedProjectIds: ['20000000-0000-4000-8000-000000000001'] },
}))
vi.mock('@/lib/auth/project-access', () => ({ resolveProjectAccess: vi.fn(async () => access.value) }))

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const PROJECT = '20000000-0000-4000-8000-000000000001'
const WORK = '30000000-0000-4000-8000-000000000001'
const MISSION = '40000000-0000-4000-8000-000000000001'
const ENVELOPE = '50000000-0000-4000-8000-000000000001'
const PACKAGE = '60000000-0000-4000-8000-000000000001'

function admission(overrides: Partial<CodeWorkAdmissionV1> = {}): CodeWorkAdmissionV1 {
  const base: CodeWorkAdmissionV1 = {
    schema: CODE_WORK_ADMISSION_SCHEMA, version: CODE_WORK_ADMISSION_VERSION,
    workId: WORK, projectId: PROJECT,
    governance: {
      mission: { id: MISSION, version: 1, hash: HASH_A },
      authorizationTarget: { targetType: CODE_WORK_AUTHORIZATION_TARGET_TYPE, targetId: WORK, actionKind: CODE_WORK_AUTHORIZATION_ACTION_KIND },
      delegation: { envelopeId: ENVELOPE, hash: HASH_B },
      workPackage: { id: PACKAGE, hash: HASH_A },
    },
    repository: {
      repositoryId: OMNIRA_REPOSITORY_ID, owner: 'Bumbi190', name: 'ai-operating-platform',
      expectedRemote: { provider: 'github', host: 'github.com', owner: 'bumbi190', name: 'ai-operating-platform' },
      pinnedBaseSha: 'a2751fb3e65a138f460a2a4acf4149a5f1d501f1',
      approvedRemote: 'origin', approvedBaseRef: 'refs/remotes/origin/main',
    },
    worktree: { branchPrefix: 'sdf1/', policyId: CODE_WORK_WORKTREE_POLICY_ID },
    worker: {
      capabilityId: CODE_WORK_CAPABILITY_ID, capabilityVersion: CODE_WORK_CAPABILITY_VERSION,
      adapterId: CODE_WORK_WORKER_ADAPTER_ID, adapterVersion: CODE_WORK_WORKER_ADAPTER_VERSION,
      provider: 'anthropic', modelId: 'claude-sonnet-4-6', outputProtocol: CODE_WORK_OUTPUT_PROTOCOL,
    },
    files: {
      readScopes: ['apps/web/lib'], writeScopes: ['apps/web/lib/atlas/code-work/control-plane'], deniedScopes: [],
      permissions: { create: true, update: true, delete: false, rename: false },
    },
    commands: {
      approvedCommandIds: ['sdf1.proof.fixture_test', 'sdf1.proof.typecheck'],
      registryVersion: COMMAND_REGISTRY_VERSION, registryHash: codeWorkCommandRegistryHash(),
    },
    limits: { ...SDF1_LIMITS }, isolation: { network: 'denied', secrets: 'none' },
    evidence: { requiredReceiptClasses: [...CODE_WORK_BASELINE_RECEIPT_CLASSES] },
    stopConditions: [...CODE_WORK_STOP_CONDITIONS],
  }
  return { ...base, ...overrides }
}

function workPackage(overrides: Partial<WorkPackage> = {}): WorkPackage {
  return {
    workPackageId: PACKAGE, envelopeId: ENVELOPE, delegationBoundHash: HASH_B,
    missionId: MISSION, missionVersion: 1, missionBoundHash: HASH_A, projectId: PROJECT,
    assignedRole: { roleId: '70000000-0000-4000-8000-000000000001', role: 'developer' } as never,
    taskObjective: 'Implement bounded control-plane state.', inputs: [], expectedOutput: [],
    authority: [{ action: CODE_WORK_AUTHORIZATION_ACTION_KIND }],
    allowedActions: [{ action: CODE_WORK_AUTHORIZATION_ACTION_KIND }], forbiddenActions: [],
    constraints: [], tools: [{ tool: CODE_WORK_CAPABILITY_ID }],
    dataScope: [
      { resource: codeWorkRepositoryResource(OMNIRA_REPOSITORY_ID, 'apps/web/lib'), access: 'read' },
      { resource: codeWorkRepositoryResource(OMNIRA_REPOSITORY_ID, 'apps/web/lib/atlas/code-work'), access: 'write' },
    ],
    budget: null, deadline: null, reporting: [], escalationTriggers: [], stopConditions: [],
    approvalGates: [], inScope: [], outOfScope: [], dependencies: [], fallback: null,
    packageVersion: 1, packageHash: HASH_A,
    ...overrides,
  } as WorkPackage
}

const violationCodes = (value: ReturnType<typeof validateCodeWorkPackageAttenuation>) =>
  value.ok ? [] : value.violations.map(item => item.code)

describe('SDF-1B1 Work Package attenuation', () => {
  it('accepts exact scope and strict subsets', () => {
    expect(validateCodeWorkPackageAttenuation(workPackage(), admission()).ok).toBe(true)
    const subset = admission({ files: { ...admission().files, readScopes: ['apps/web/lib/atlas/code-work'], writeScopes: ['apps/web/lib/atlas/code-work/control-plane/store.ts'] } })
    expect(validateCodeWorkPackageAttenuation(workPackage(), subset).ok).toBe(true)
  })

  it.each([
    ['overbroad path', () => workPackage(), () => admission({ files: { ...admission().files, writeScopes: ['apps/web'] } }), 'work_package_scope_exceeded'],
    ['wrong repo', () => workPackage({ dataScope: [{ resource: codeWorkRepositoryResource('github.com/other/repo', ''), access: 'write' }] }), admission, 'repository_not_covered'],
    ['missing action', () => workPackage({ authority: [], allowedActions: [] }), admission, 'code_action_not_authorized'],
    ['missing capability', () => workPackage({ tools: [] }), admission, 'code_capability_not_authorized'],
    ['denied resource', () => workPackage({ outOfScope: [codeWorkRepositoryResource(OMNIRA_REPOSITORY_ID, 'apps/web/lib/atlas/code-work/control-plane')] }), admission, 'work_package_resource_denied'],
    ['empty scope', workPackage, () => admission({ files: { ...admission().files, writeScopes: [] } }), 'empty_resource_scope'],
  ] as const)('fails closed for %s', (_label, pkg, value, expected) => {
    expect(violationCodes(validateCodeWorkPackageAttenuation(pkg(), value()))).toContain(expected)
  })
})

describe('SDF-1B1 proposal and Authorization binding', () => {
  it('derives canonical hashes and idempotent proposal identity on the server inputs', () => {
    const input = { admission: admission(), workPackage: workPackage(), requestedBy: access.value.userId, idempotencyKey: 'owner-item-1' }
    const first = deriveCodeWorkProposal(input)
    const retry = deriveCodeWorkProposal(input)
    expect(first.ok && retry.ok).toBe(true)
    if (!first.ok || !retry.ok) return
    expect(first.value).toEqual(retry.value)
    expect(first.value.admissionHash).toBe(codeWorkAdmissionHash(first.value.admission))
    const changed = deriveCodeWorkProposal({ ...input, idempotencyKey: 'owner-item-2' })
    expect(changed.ok && changed.value.proposalKeyHash).not.toBe(first.value.proposalKeyHash)
  })

  it('accepts only an exact, unconditional, live grant', () => {
    const value = admission()
    const hash = codeWorkAdmissionHash(value)
    const common = {
      authorizationId: '80000000-0000-4000-8000-000000000001', projectId: PROJECT,
      principalId: access.value.userId, authority: { actionKind: CODE_WORK_AUTHORIZATION_ACTION_KIND, description: 'bounded' },
      target: { targetType: CODE_WORK_AUTHORIZATION_TARGET_TYPE, targetId: WORK, versionHash: hash },
    }
    const requested = buildAuthorizationEvent({ ...common, type: 'requested', eventId: '90000000-0000-4000-8000-000000000001', occurredAt: '2026-09-18T08:00:00Z' })
    const granted = buildAuthorizationEvent({ ...common, type: 'granted', eventId: '90000000-0000-4000-8000-000000000002', occurredAt: '2026-09-18T08:01:00Z', expiresAt: '2026-09-18T09:00:00Z' })
    expect(effectiveCodeWorkAuthorization([requested, granted], value, '2026-09-18T08:02:00Z').effective).toBe(true)
    const conditional = buildAuthorizationEvent({ ...common, type: 'granted_with_conditions', eventId: '90000000-0000-4000-8000-000000000003', occurredAt: '2026-09-18T08:01:00Z', expiresAt: '2026-09-18T09:00:00Z', conditions: [{ conditionId: 'c', type: 'manual', value: 'review', description: 'not enforced' }] })
    expect(effectiveCodeWorkAuthorization([requested, conditional], value, '2026-09-18T08:02:00Z').effective).toBe(false)
    expect(effectiveCodeWorkAuthorization([requested, granted], value, '2026-09-18T10:00:00Z').effective).toBe(false)
    const wrong = structuredClone(granted); wrong.target.versionHash = HASH_B
    expect(effectiveCodeWorkAuthorization([requested, wrong], value, '2026-09-18T08:02:00Z').effective).toBe(false)
    const revoked = buildAuthorizationEvent({ ...common, type: 'revoked', eventId: '90000000-0000-4000-8000-000000000004', occurredAt: '2026-09-18T08:02:00Z', reason: 'owner revoked code-work authority' })
    expect(effectiveCodeWorkAuthorization([requested, granted, revoked], value, '2026-09-18T08:03:00Z').effective).toBe(false)
  })
})

describe('SDF-1B1 terminal evidence derivation and read isolation', () => {
  it('keeps successful evidence positive and outcome-specific', () => {
    const ready = terminalEvidenceRequirements('ready_for_human_review', admission())
    expect(ready.requiredReceiptClasses).toEqual(expect.arrayContaining(['repository_proof', 'final_diff', 'terminal']))
    expect(ready.requiredReceiptClasses).not.toContain('policy_denial')
    expect(terminalEvidenceRequirements('policy_denied', admission()).requiredReceiptClasses).toContain('policy_denial')
    expect(terminalEvidenceRequirements('cancelled', admission()).requiredReceiptClasses).toContain('cancellation_fencing')
  })

  it('proves project ownership before any privileged code-work read', async () => {
    const byProjectAndWorkId = vi.fn(async () => null)
    const store = { byProjectAndWorkId } as unknown as CodeWorkControlPlaneStore
    const foreign = await readCodeWorkRun('20000000-0000-4000-8000-000000000099', WORK, { store })
    expect(foreign.status).toBe('not_permitted')
    expect(byProjectAndWorkId).not.toHaveBeenCalled()
    const unknown = await readCodeWorkRun(PROJECT, WORK, { store })
    expect(unknown.status).toBe('not_permitted')
    expect(byProjectAndWorkId).toHaveBeenCalledWith(PROJECT, WORK)
  })
})
