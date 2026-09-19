/**
 * SDF-1B2 operator proposal derivation.
 *
 * The browser supplies only human intent. Every authority-bearing field in the
 * admission is selected here from the live Work Package and the reviewed SDF
 * registries. This module is pure and creates no execution capability.
 */

import { createHash } from 'node:crypto'
import type { WorkPackage } from '@/lib/atlas/workpackage/types'
import { codeWorkCommandRegistryHash, CODE_WORK_COMMANDS, COMMAND_REGISTRY_VERSION } from '../command-registry'
import { OMNIRA_TRUSTED_REPOSITORY } from '../repository-registry'
import {
  CODE_WORK_ADMISSION_SCHEMA,
  CODE_WORK_ADMISSION_VERSION,
  CODE_WORK_AUTHORIZATION_ACTION_KIND,
  CODE_WORK_AUTHORIZATION_TARGET_TYPE,
  CODE_WORK_BASELINE_RECEIPT_CLASSES,
  CODE_WORK_CAPABILITY_ID,
  CODE_WORK_CAPABILITY_VERSION,
  CODE_WORK_OUTPUT_PROTOCOL,
  CODE_WORK_STOP_CONDITIONS,
  CODE_WORK_WORKER_ADAPTER_ID,
  CODE_WORK_WORKER_ADAPTER_VERSION,
  CODE_WORK_WORKTREE_POLICY_ID,
  SDF1_LIMITS,
  type CodeWorkAdmissionV1,
  type CodeWorkPolicyViolation,
  type CodeWorkValidation,
} from '../types'

const FULL_GIT_SHA = /^[a-f0-9]{40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_PATHS = 32
const MAX_IDEMPOTENCY_KEY = 200

export interface OperatorCodeWorkProposalInput {
  workPackageId: string
  pinnedBaseSha: string
  readPaths: string[]
  writePaths: string[]
  idempotencyKey: string
}

function violation(path: string, code: string, detail: string): CodeWorkPolicyViolation {
  return { path, code, detail }
}

/** Closed DTO reconstruction. Unknown fields never reach the contract layer. */
export function parseOperatorCodeWorkProposal(
  input: unknown,
  fallbackIdempotencyKey: string,
): CodeWorkValidation<OperatorCodeWorkProposalInput> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, violations: [violation('proposal', 'object_required', 'proposal object is required')] }
  }
  const raw = input as Record<string, unknown>
  const allowed = new Set(['workPackageId', 'pinnedBaseSha', 'readPaths', 'writePaths', 'idempotencyKey'])
  const violations = Object.keys(raw)
    .filter(key => !allowed.has(key))
    .sort()
    .map(key => violation(key, 'unknown_field', 'field is not accepted by the operator proposal boundary'))

  if (typeof raw.workPackageId !== 'string' || !UUID.test(raw.workPackageId)) {
    violations.push(violation('workPackageId', 'uuid_required', 'Work Package id must be a UUID'))
  }
  if (typeof raw.pinnedBaseSha !== 'string' || !FULL_GIT_SHA.test(raw.pinnedBaseSha)) {
    violations.push(violation('pinnedBaseSha', 'full_git_sha_required', 'a lowercase full Git SHA is required'))
  }

  const parsePaths = (value: unknown, field: 'readPaths' | 'writePaths'): string[] => {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PATHS
      || value.some(item => typeof item !== 'string')) {
      violations.push(violation(field, 'bounded_path_array_required', `between 1 and ${MAX_PATHS} paths are required`))
      return []
    }
    return value as string[]
  }
  const readPaths = parsePaths(raw.readPaths, 'readPaths')
  const writePaths = parsePaths(raw.writePaths, 'writePaths')

  const idempotencyKey = raw.idempotencyKey === undefined ? fallbackIdempotencyKey : raw.idempotencyKey
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0
    || idempotencyKey.length > MAX_IDEMPOTENCY_KEY || idempotencyKey.trim() !== idempotencyKey) {
    violations.push(violation('idempotencyKey', 'bounded_text_required', 'a bounded exact idempotency key is required'))
  }

  if (violations.length > 0) return { ok: false, violations }
  return {
    ok: true,
    value: {
      workPackageId: raw.workPackageId as string,
      pinnedBaseSha: raw.pinnedBaseSha as string,
      readPaths,
      writePaths,
      idempotencyKey: idempotencyKey as string,
    },
  }
}

/** Stable UUID-shaped identity makes a same-key retry derive the same admission. */
export function operatorCodeWorkId(projectId: string, requestedBy: string, idempotencyKey: string): string {
  const hex = createHash('sha256')
    .update(`atlas.code_work.operator.v1\0${projectId}\0${requestedBy}\0${idempotencyKey}`)
    .digest('hex')
    .slice(0, 32)
    .split('')
  hex[12] = '4'
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4]
  const value = hex.join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

export function buildOperatorCodeWorkAdmission(args: {
  proposal: OperatorCodeWorkProposalInput
  workPackage: WorkPackage
  requestedBy: string
}): CodeWorkAdmissionV1 {
  const { proposal, workPackage, requestedBy } = args
  const workId = operatorCodeWorkId(workPackage.projectId, requestedBy, proposal.idempotencyKey)
  const repository = OMNIRA_TRUSTED_REPOSITORY

  return {
    schema: CODE_WORK_ADMISSION_SCHEMA,
    version: CODE_WORK_ADMISSION_VERSION,
    workId,
    projectId: workPackage.projectId,
    governance: {
      mission: {
        id: workPackage.missionId,
        version: workPackage.missionVersion,
        hash: workPackage.missionBoundHash,
      },
      authorizationTarget: {
        targetType: CODE_WORK_AUTHORIZATION_TARGET_TYPE,
        targetId: workId,
        actionKind: CODE_WORK_AUTHORIZATION_ACTION_KIND,
      },
      delegation: {
        envelopeId: workPackage.envelopeId,
        hash: workPackage.delegationBoundHash,
      },
      workPackage: { id: workPackage.workPackageId, hash: workPackage.packageHash },
    },
    repository: {
      repositoryId: repository.repositoryId,
      owner: repository.owner,
      name: repository.name,
      expectedRemote: { ...repository.remoteIdentity },
      pinnedBaseSha: proposal.pinnedBaseSha,
      approvedRemote: repository.approvedRemote,
      approvedBaseRef: repository.approvedBaseRefs[0],
    },
    worktree: {
      branchPrefix: repository.approvedBranchPrefix,
      policyId: CODE_WORK_WORKTREE_POLICY_ID,
    },
    worker: {
      capabilityId: CODE_WORK_CAPABILITY_ID,
      capabilityVersion: CODE_WORK_CAPABILITY_VERSION,
      adapterId: CODE_WORK_WORKER_ADAPTER_ID,
      adapterVersion: CODE_WORK_WORKER_ADAPTER_VERSION,
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      outputProtocol: CODE_WORK_OUTPUT_PROTOCOL,
    },
    files: {
      readScopes: proposal.readPaths,
      writeScopes: proposal.writePaths,
      deniedScopes: [],
      permissions: { create: true, update: true, delete: false, rename: false },
    },
    commands: {
      approvedCommandIds: Object.keys(CODE_WORK_COMMANDS).sort(),
      registryVersion: COMMAND_REGISTRY_VERSION,
      registryHash: codeWorkCommandRegistryHash(),
    },
    limits: { ...SDF1_LIMITS },
    isolation: { network: 'denied', secrets: 'none' },
    evidence: { requiredReceiptClasses: [...CODE_WORK_BASELINE_RECEIPT_CLASSES] },
    stopConditions: [...CODE_WORK_STOP_CONDITIONS],
  }
}
