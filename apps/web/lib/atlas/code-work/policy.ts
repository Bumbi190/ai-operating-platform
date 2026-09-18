/**
 * SDF-1A admission validation.
 *
 * TypeScript types are not a trust boundary, so this module validates unknown
 * input at runtime and rejects every field or identity that is not part of the
 * reviewed V1 contract. It is pure: no clocks, stores, Git, filesystem, model,
 * network or process access.
 */

import {
  codeWorkCommandRegistryHash,
  COMMAND_REGISTRY_VERSION,
  lookupCodeWorkCommand,
} from './command-registry'
import { lookupCodeWorkCapability } from './capability'
import { normalizePathSet } from './path-policy'
import {
  lookupTrustedRepository,
  sameRemoteIdentity,
} from './repository-registry'
import {
  CODE_WORK_ADMISSION_SCHEMA,
  CODE_WORK_ADMISSION_VERSION,
  CODE_WORK_AUTHORIZATION_ACTION_KIND,
  CODE_WORK_AUTHORIZATION_TARGET_TYPE,
  CODE_WORK_RECEIPT_CLASSES,
  CODE_WORK_STOP_CONDITIONS,
  CODE_WORK_WORKTREE_POLICY_ID,
  SDF1_LIMITS,
} from './types'
import type {
  CodeWorkAdmissionV1,
  CodeWorkPolicyViolation,
  CodeWorkValidation,
} from './types'
import { lookupCodeWorkWorker } from './worker-registry'

const SHA256 = /^[a-f0-9]{64}$/
const GIT_SHA = /^[a-f0-9]{40}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function violation(path: string, code: string, detail: string): CodeWorkPolicyViolation {
  return { path, code, detail }
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): CodeWorkPolicyViolation[] {
  const allowed = new Set(expected)
  return Object.keys(value)
    .filter(key => !allowed.has(key))
    .sort()
    .map(key => violation(`${path}.${key}`, 'unknown_field', 'field is not part of the V1 contract'))
}

function requireRecord(
  value: unknown,
  path: string,
  expected: readonly string[],
  violations: CodeWorkPolicyViolation[],
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    violations.push(violation(path, 'object_required', 'object is required'))
    return null
  }
  violations.push(...exactKeys(value, expected, path))
  return value
}

function requireText(value: unknown, path: string, violations: CodeWorkPolicyViolation[]): value is string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.includes('\0')) {
    violations.push(violation(path, 'text_required', 'non-empty exact text is required'))
    return false
  }
  return true
}

function requireHash(value: unknown, path: string, violations: CodeWorkPolicyViolation[]): value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    violations.push(violation(path, 'sha256_required', 'lowercase sha256 is required'))
    return false
  }
  return true
}

function requireBoundedPositiveInteger(
  value: unknown,
  maximum: number,
  path: string,
  violations: CodeWorkPolicyViolation[],
): value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    violations.push(violation(path, 'limit_out_of_bounds', `integer must be between 1 and ${maximum}`))
    return false
  }
  return true
}

function validateStringSet(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
  violations: CodeWorkPolicyViolation[],
): value is string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    violations.push(violation(path, 'string_array_required', 'string array is required'))
    return false
  }
  const unknown = value.filter(item => !allowed.includes(item)).sort()
  const missing = required.filter(item => !value.includes(item)).sort()
  if (unknown.length > 0) violations.push(violation(path, 'unknown_value', `unknown: ${unknown.join(',')}`))
  if (missing.length > 0) violations.push(violation(path, 'required_value_missing', `missing: ${missing.join(',')}`))
  return unknown.length === 0 && missing.length === 0
}

export function validateCodeWorkAdmission(input: unknown): CodeWorkValidation<CodeWorkAdmissionV1> {
  const violations: CodeWorkPolicyViolation[] = []
  const root = requireRecord(input, 'admission', [
    'schema', 'version', 'workId', 'projectId', 'governance', 'repository', 'worktree',
    'worker', 'files', 'commands', 'limits', 'isolation', 'evidence', 'stopConditions',
  ], violations)
  if (!root) return { ok: false, violations }

  if (root.schema !== CODE_WORK_ADMISSION_SCHEMA) {
    violations.push(violation('schema', 'unknown_schema', 'admission schema is not supported'))
  }
  if (root.version !== CODE_WORK_ADMISSION_VERSION) {
    violations.push(violation('version', 'unknown_version', 'admission version is not supported'))
  }
  requireText(root.workId, 'workId', violations)
  requireText(root.projectId, 'projectId', violations)

  const governance = requireRecord(root.governance, 'governance', [
    'mission', 'authorizationTarget', 'delegation', 'workPackage',
  ], violations)
  const mission = governance && requireRecord(governance.mission, 'governance.mission', [
    'id', 'version', 'hash',
  ], violations)
  if (mission) {
    requireText(mission.id, 'governance.mission.id', violations)
    if (!Number.isSafeInteger(mission.version) || (mission.version as number) < 1) {
      violations.push(violation('governance.mission.version', 'positive_integer_required', 'positive integer is required'))
    }
    requireHash(mission.hash, 'governance.mission.hash', violations)
  }
  const authorizationTarget = governance && requireRecord(
    governance.authorizationTarget,
    'governance.authorizationTarget',
    ['targetType', 'targetId', 'actionKind'],
    violations,
  )
  if (authorizationTarget) {
    if (authorizationTarget.targetType !== CODE_WORK_AUTHORIZATION_TARGET_TYPE) {
      violations.push(violation('governance.authorizationTarget.targetType', 'target_type_mismatch', 'wrong target type'))
    }
    if (authorizationTarget.targetId !== root.workId) {
      violations.push(violation('governance.authorizationTarget.targetId', 'work_id_mismatch', 'target must be this work item'))
    }
    if (authorizationTarget.actionKind !== CODE_WORK_AUTHORIZATION_ACTION_KIND) {
      violations.push(violation('governance.authorizationTarget.actionKind', 'action_mismatch', 'wrong authority action'))
    }
  }
  const delegation = governance && requireRecord(governance.delegation, 'governance.delegation', [
    'envelopeId', 'hash',
  ], violations)
  if (delegation) {
    requireText(delegation.envelopeId, 'governance.delegation.envelopeId', violations)
    requireHash(delegation.hash, 'governance.delegation.hash', violations)
  }
  const workPackage = governance && requireRecord(governance.workPackage, 'governance.workPackage', [
    'id', 'hash',
  ], violations)
  if (workPackage) {
    requireText(workPackage.id, 'governance.workPackage.id', violations)
    requireHash(workPackage.hash, 'governance.workPackage.hash', violations)
  }

  const repository = requireRecord(root.repository, 'repository', [
    'repositoryId', 'owner', 'name', 'expectedRemote', 'pinnedBaseSha', 'approvedRemote', 'approvedBaseRef',
  ], violations)
  if (repository) {
    const definition = lookupTrustedRepository(repository.repositoryId)
    if (!definition) {
      violations.push(violation('repository.repositoryId', 'repository_not_trusted', 'repository is not in the registry'))
    } else {
      if (repository.owner !== definition.owner || repository.name !== definition.name) {
        violations.push(violation('repository', 'repository_identity_mismatch', 'display identity differs from registry'))
      }
      if (repository.approvedRemote !== definition.approvedRemote) {
        violations.push(violation('repository.approvedRemote', 'remote_name_mismatch', 'remote is not approved'))
      }
      if (typeof repository.approvedBaseRef !== 'string'
        || !definition.approvedBaseRefs.includes(repository.approvedBaseRef)) {
        violations.push(violation('repository.approvedBaseRef', 'base_ref_not_approved', 'base ref is not approved'))
      }
    }
    if (typeof repository.pinnedBaseSha !== 'string' || !GIT_SHA.test(repository.pinnedBaseSha)) {
      violations.push(violation('repository.pinnedBaseSha', 'git_sha_required', 'lowercase full Git SHA is required'))
    }
    const remote = requireRecord(repository.expectedRemote, 'repository.expectedRemote', [
      'provider', 'host', 'owner', 'name',
    ], violations)
    if (remote && definition) {
      const typed = remote as unknown as CodeWorkAdmissionV1['repository']['expectedRemote']
      if (!sameRemoteIdentity(typed, definition.remoteIdentity)) {
        violations.push(violation('repository.expectedRemote', 'remote_identity_mismatch', 'remote identity differs from registry'))
      }
    }
  }

  const worktree = requireRecord(root.worktree, 'worktree', ['branchPrefix', 'policyId'], violations)
  if (worktree) {
    const definition = repository ? lookupTrustedRepository(repository.repositoryId) : null
    if (!definition || worktree.branchPrefix !== definition.approvedBranchPrefix) {
      violations.push(violation('worktree.branchPrefix', 'branch_prefix_not_approved', 'branch prefix differs from registry'))
    }
    if (worktree.policyId !== CODE_WORK_WORKTREE_POLICY_ID) {
      violations.push(violation('worktree.policyId', 'cleanup_policy_mismatch', 'automatic cleanup is not admitted'))
    }
  }

  const worker = requireRecord(root.worker, 'worker', [
    'capabilityId', 'capabilityVersion', 'adapterId', 'adapterVersion', 'provider', 'modelId', 'outputProtocol',
  ], violations)
  if (worker) {
    if (!lookupCodeWorkCapability(worker.capabilityId, worker.capabilityVersion)) {
      violations.push(violation('worker.capabilityId', 'capability_not_registered', 'unknown capability/version'))
    }
    if (!lookupCodeWorkWorker({
      adapterId: worker.adapterId,
      adapterVersion: worker.adapterVersion,
      provider: worker.provider,
      modelId: worker.modelId,
      outputProtocol: worker.outputProtocol,
    })) {
      violations.push(violation('worker', 'worker_not_registered', 'unknown worker identity/version/model/protocol'))
    }
  }

  const files = requireRecord(root.files, 'files', [
    'readScopes', 'writeScopes', 'deniedScopes', 'permissions',
  ], violations)
  if (files) {
    for (const key of ['readScopes', 'writeScopes', 'deniedScopes'] as const) {
      if (!Array.isArray(files[key]) || files[key].some(item => typeof item !== 'string')) {
        violations.push(violation(`files.${key}`, 'string_array_required', 'string array is required'))
      } else {
        const normalized = normalizePathSet(files[key], `files.${key}`)
        if (!normalized.ok) violations.push(...normalized.violations)
        if (key !== 'deniedScopes' && normalized.ok && normalized.value.length === 0) {
          violations.push(violation(`files.${key}`, 'nonempty_scope_required', 'explicit scope is required'))
        }
      }
    }
    const permissions = requireRecord(files.permissions, 'files.permissions', [
      'create', 'update', 'delete', 'rename',
    ], violations)
    if (permissions) {
      for (const key of ['create', 'update', 'delete', 'rename'] as const) {
        if (typeof permissions[key] !== 'boolean') {
          violations.push(violation(`files.permissions.${key}`, 'boolean_required', 'boolean is required'))
        }
      }
    }
  }

  const commands = requireRecord(root.commands, 'commands', [
    'approvedCommandIds', 'registryVersion', 'registryHash',
  ], violations)
  if (commands) {
    if (commands.registryVersion !== COMMAND_REGISTRY_VERSION) {
      violations.push(violation('commands.registryVersion', 'command_registry_version_mismatch', 'registry version is not current'))
    }
    if (commands.registryHash !== codeWorkCommandRegistryHash()) {
      violations.push(violation('commands.registryHash', 'command_registry_hash_mismatch', 'registry hash is not current'))
    }
    if (!Array.isArray(commands.approvedCommandIds)
      || commands.approvedCommandIds.length === 0
      || commands.approvedCommandIds.some(item => typeof item !== 'string')) {
      violations.push(violation('commands.approvedCommandIds', 'command_ids_required', 'non-empty command id array is required'))
    } else {
      for (const [index, id] of commands.approvedCommandIds.entries()) {
        if (!lookupCodeWorkCommand(id, 1)) {
          violations.push(violation(`commands.approvedCommandIds[${index}]`, 'command_not_registered', 'command id is not registered'))
        }
      }
    }
  }

  const limits = requireRecord(root.limits, 'limits', [
    'maxWorkerIterations', 'maxChangedFiles', 'maxDiffBytes', 'textFilesOnly',
    'maxTotalRuntimeSeconds', 'maxCommandRuntimeSeconds',
  ], violations)
  if (limits) {
    requireBoundedPositiveInteger(limits.maxWorkerIterations, SDF1_LIMITS.maxWorkerIterations, 'limits.maxWorkerIterations', violations)
    requireBoundedPositiveInteger(limits.maxChangedFiles, SDF1_LIMITS.maxChangedFiles, 'limits.maxChangedFiles', violations)
    requireBoundedPositiveInteger(limits.maxDiffBytes, SDF1_LIMITS.maxDiffBytes, 'limits.maxDiffBytes', violations)
    requireBoundedPositiveInteger(limits.maxTotalRuntimeSeconds, SDF1_LIMITS.maxTotalRuntimeSeconds, 'limits.maxTotalRuntimeSeconds', violations)
    requireBoundedPositiveInteger(limits.maxCommandRuntimeSeconds, SDF1_LIMITS.maxCommandRuntimeSeconds, 'limits.maxCommandRuntimeSeconds', violations)
    if (limits.textFilesOnly !== true) {
      violations.push(violation('limits.textFilesOnly', 'text_only_required', 'binary changes are never admitted'))
    }
    if (Number.isSafeInteger(limits.maxCommandRuntimeSeconds)
      && Number.isSafeInteger(limits.maxTotalRuntimeSeconds)
      && (limits.maxCommandRuntimeSeconds as number) > (limits.maxTotalRuntimeSeconds as number)) {
      violations.push(violation('limits.maxCommandRuntimeSeconds', 'command_exceeds_total_runtime', 'command limit exceeds total runtime'))
    }
  }

  const isolation = requireRecord(root.isolation, 'isolation', ['network', 'secrets'], violations)
  if (isolation) {
    if (isolation.network !== 'denied') {
      violations.push(violation('isolation.network', 'network_must_be_denied', 'execution network must be denied'))
    }
    if (isolation.secrets !== 'none') {
      violations.push(violation('isolation.secrets', 'secrets_must_be_none', 'execution receives no secrets'))
    }
  }

  const evidence = requireRecord(root.evidence, 'evidence', ['requiredReceiptClasses'], violations)
  if (evidence) {
    validateStringSet(
      evidence.requiredReceiptClasses,
      CODE_WORK_RECEIPT_CLASSES,
      CODE_WORK_RECEIPT_CLASSES,
      'evidence.requiredReceiptClasses',
      violations,
    )
  }
  validateStringSet(
    root.stopConditions,
    CODE_WORK_STOP_CONDITIONS,
    CODE_WORK_STOP_CONDITIONS,
    'stopConditions',
    violations,
  )

  if (violations.length > 0) return { ok: false, violations }
  return { ok: true, value: root as unknown as CodeWorkAdmissionV1 }
}
