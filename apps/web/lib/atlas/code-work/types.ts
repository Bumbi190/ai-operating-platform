/**
 * SDF-1A — canonical, execution-free contracts for bounded code work.
 *
 * These types carry authority bounds; they do not create a run, touch Git,
 * write a file, call a model or grant a worker permission. Runtime input must
 * pass the pure validators in this directory before it is hash-bound.
 */

export const CODE_WORK_ADMISSION_SCHEMA = 'atlas.code_work_admission' as const
export const CODE_WORK_ADMISSION_VERSION = 1 as const

export const CODE_WORK_AUTHORIZATION_TARGET_TYPE = 'atlas.code_work_admission' as const
export const CODE_WORK_AUTHORIZATION_ACTION_KIND = 'code.worktree.prepare_and_patch' as const

export const CODE_WORK_CAPABILITY_ID = 'code.worktree.patch.v1' as const
export const CODE_WORK_CAPABILITY_VERSION = 1 as const
export const CODE_WORK_WORKER_ADAPTER_ID = 'claude_patch_v1' as const
export const CODE_WORK_WORKER_ADAPTER_VERSION = 1 as const
export const CODE_WORK_OUTPUT_PROTOCOL = 'sdf1.structured_file_ops.v1' as const

export const CODE_WORK_WORKTREE_POLICY_ID = 'sdf1.retain_until_explicit_cleanup.v1' as const

export const SDF1_LIMITS = {
  maxWorkerIterations: 2,
  maxChangedFiles: 8,
  maxDiffBytes: 131_072,
  textFilesOnly: true,
  maxTotalRuntimeSeconds: 1_200,
  maxCommandRuntimeSeconds: 300,
} as const

export const CODE_WORK_RECEIPT_CLASSES = [
  'repository_proof',
  'base_proof',
  'worktree_identity',
  'authority_pins',
  'worker_identity',
  'patch_operation',
  'file_scope',
  'command',
  'test_result',
  'policy_denial',
  'cancellation_fencing',
  'final_git_status',
  'final_diff',
  'terminal',
] as const

export type CodeWorkReceiptClass = (typeof CODE_WORK_RECEIPT_CLASSES)[number]

/**
 * Evidence every terminal outcome must carry, irrespective of why it ended.
 *
 * SDF-1B1 deliberately separates this baseline from outcome-specific evidence:
 * a denied proposal must not invent a worktree receipt, and a successful patch
 * must not invent a policy denial. The terminal profile adds those requirements.
 */
export const CODE_WORK_BASELINE_RECEIPT_CLASSES = [
  'authority_pins',
] as const satisfies readonly CodeWorkReceiptClass[]

export const CODE_WORK_STOP_CONDITIONS = [
  'authority_drift',
  'stale_base',
  'cancellation',
  'scope_violation',
  'policy_denial',
] as const

export type CodeWorkStopCondition = (typeof CODE_WORK_STOP_CONDITIONS)[number]

export interface CodeWorkGovernancePins {
  mission: { id: string; version: number; hash: string }
  authorizationTarget: {
    targetType: typeof CODE_WORK_AUTHORIZATION_TARGET_TYPE
    targetId: string
    actionKind: typeof CODE_WORK_AUTHORIZATION_ACTION_KIND
  }
  delegation: { envelopeId: string; hash: string }
  workPackage: { id: string; hash: string }
}

export interface NormalizedRemoteIdentity {
  provider: 'github'
  host: 'github.com'
  /** GitHub repository identity is case-insensitive; these are lowercase. */
  owner: string
  name: string
}

export interface CodeWorkRepositoryBinding {
  repositoryId: string
  owner: string
  name: string
  expectedRemote: NormalizedRemoteIdentity
  pinnedBaseSha: string
  approvedRemote: string
  approvedBaseRef: string
}

export interface CodeWorkFilePolicy {
  readScopes: string[]
  writeScopes: string[]
  deniedScopes: string[]
  permissions: {
    create: boolean
    update: boolean
    delete: boolean
    rename: boolean
  }
}

export interface CodeWorkAdmissionV1 {
  schema: typeof CODE_WORK_ADMISSION_SCHEMA
  version: typeof CODE_WORK_ADMISSION_VERSION
  workId: string
  projectId: string

  governance: CodeWorkGovernancePins

  repository: CodeWorkRepositoryBinding
  worktree: {
    branchPrefix: string
    policyId: typeof CODE_WORK_WORKTREE_POLICY_ID
  }

  worker: {
    capabilityId: typeof CODE_WORK_CAPABILITY_ID
    capabilityVersion: typeof CODE_WORK_CAPABILITY_VERSION
    adapterId: typeof CODE_WORK_WORKER_ADAPTER_ID
    adapterVersion: typeof CODE_WORK_WORKER_ADAPTER_VERSION
    provider: 'anthropic'
    modelId: 'claude-sonnet-4-6'
    outputProtocol: typeof CODE_WORK_OUTPUT_PROTOCOL
  }

  files: CodeWorkFilePolicy
  commands: {
    approvedCommandIds: string[]
    registryVersion: string
    registryHash: string
  }

  limits: {
    maxWorkerIterations: number
    maxChangedFiles: number
    maxDiffBytes: number
    textFilesOnly: true
    maxTotalRuntimeSeconds: number
    maxCommandRuntimeSeconds: number
  }

  isolation: {
    network: 'denied'
    secrets: 'none'
  }

  evidence: { requiredReceiptClasses: CodeWorkReceiptClass[] }
  stopConditions: CodeWorkStopCondition[]
}

export interface CodeWorkPolicyViolation {
  path: string
  code: string
  detail: string
}

export type CodeWorkValidation<T> =
  | { ok: true; value: T }
  | { ok: false; violations: CodeWorkPolicyViolation[] }

export class CodeWorkContractError extends Error {
  constructor(public readonly violations: CodeWorkPolicyViolation[]) {
    super(`code work contract rejected: ${violations.map(v => `${v.path}:${v.code}`).join(', ')}`)
    this.name = 'CodeWorkContractError'
  }
}
