/**
 * SDF-1A append-only evidence vocabulary and deterministic receipt hashes.
 * Receipts describe future broker evidence; this module stores or emits none.
 */

import { canonicalTargetVersionHash } from '../authorization/build'
import { isCodeWorkState } from './lifecycle'
import { normalizeRepoRelativePath } from './path-policy'
import { CODE_WORK_RECEIPT_CLASSES } from './types'
import type {
  CodeWorkPolicyViolation,
  CodeWorkReceiptClass,
  CodeWorkValidation,
} from './types'

interface ReceiptBase {
  receiptClass: CodeWorkReceiptClass
}

export type CodeWorkReceiptEvidence =
  | (ReceiptBase & { receiptClass: 'repository_proof'; repositoryId: string; remoteIdentityHash: string; localRootHash: string; verified: boolean })
  | (ReceiptBase & { receiptClass: 'base_proof'; baseRef: string; pinnedBaseSha: string; observedRefSha: string; stale: boolean })
  | (ReceiptBase & { receiptClass: 'worktree_identity'; branchName: string; worktreePathHash: string; headSha: string })
  | (ReceiptBase & { receiptClass: 'authority_pins'; missionHash: string; admissionHash: string; delegationHash: string; workPackageHash: string })
  | (ReceiptBase & { receiptClass: 'worker_identity'; adapterId: string; adapterVersion: number; provider: string; modelId: string; outputProtocol: string })
  | (ReceiptBase & { receiptClass: 'patch_operation'; iteration: number; operationIndex: number; operation: 'create' | 'replace' | 'delete' | 'rename'; paths: string[]; contentHash: string | null })
  | (ReceiptBase & { receiptClass: 'file_scope'; iteration: number; changedPaths: string[]; deniedPaths: string[]; withinScope: boolean })
  | (ReceiptBase & { receiptClass: 'command'; iteration: number; commandId: string; registryHash: string; argvHash: string; exitCode: number | null; timedOut: boolean; stdoutHash: string; stderrHash: string; durationMs: number })
  | (ReceiptBase & { receiptClass: 'test_result'; commandId: string; outcome: 'passed' | 'failed' | 'skipped' })
  | (ReceiptBase & { receiptClass: 'policy_denial'; code: string; path: string | null })
  | (ReceiptBase & { receiptClass: 'cancellation_fencing'; cancelRequested: boolean; claimValid: boolean; outcome: 'continue' | 'cancelled' | 'fenced' })
  | (ReceiptBase & { receiptClass: 'final_git_status'; headSha: string; baseSha: string; stagedPaths: string[]; unstagedPaths: string[]; untrackedPaths: string[] })
  | (ReceiptBase & { receiptClass: 'final_diff'; diffHash: string; diffBytes: number; changedPaths: string[] })
  | (ReceiptBase & { receiptClass: 'terminal'; state: string; iterationCount: number })

export interface CodeWorkReceiptV1 {
  workId: string
  sequence: number
  observedAt: string
  evidence: CodeWorkReceiptEvidence
}

/** Human/AI commentary is deliberately outside the evidence hash. */
export interface AnnotatedCodeWorkReceiptV1 {
  receipt: CodeWorkReceiptV1
  annotation?: { author: 'human' | 'ai'; text: string }
}

const SHA256 = /^[a-f0-9]{64}$/
const GIT_SHA = /^[a-f0-9]{40}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function issue(path: string, code: string, detail: string): CodeWorkPolicyViolation {
  return { path, code, detail }
}

const EVIDENCE_KEYS: Record<CodeWorkReceiptClass, readonly string[]> = {
  repository_proof: ['receiptClass', 'repositoryId', 'remoteIdentityHash', 'localRootHash', 'verified'],
  base_proof: ['receiptClass', 'baseRef', 'pinnedBaseSha', 'observedRefSha', 'stale'],
  worktree_identity: ['receiptClass', 'branchName', 'worktreePathHash', 'headSha'],
  authority_pins: ['receiptClass', 'missionHash', 'admissionHash', 'delegationHash', 'workPackageHash'],
  worker_identity: ['receiptClass', 'adapterId', 'adapterVersion', 'provider', 'modelId', 'outputProtocol'],
  patch_operation: ['receiptClass', 'iteration', 'operationIndex', 'operation', 'paths', 'contentHash'],
  file_scope: ['receiptClass', 'iteration', 'changedPaths', 'deniedPaths', 'withinScope'],
  command: ['receiptClass', 'iteration', 'commandId', 'registryHash', 'argvHash', 'exitCode', 'timedOut', 'stdoutHash', 'stderrHash', 'durationMs'],
  test_result: ['receiptClass', 'commandId', 'outcome'],
  policy_denial: ['receiptClass', 'code', 'path'],
  cancellation_fencing: ['receiptClass', 'cancelRequested', 'claimValid', 'outcome'],
  final_git_status: ['receiptClass', 'headSha', 'baseSha', 'stagedPaths', 'unstagedPaths', 'untrackedPaths'],
  final_diff: ['receiptClass', 'diffHash', 'diffBytes', 'changedPaths'],
  terminal: ['receiptClass', 'state', 'iterationCount'],
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string): CodeWorkPolicyViolation[] {
  const expected = new Set(keys)
  return Object.keys(value).filter(key => !expected.has(key)).sort()
    .map(key => issue(`${path}.${key}`, 'unknown_field', 'field is not part of the receipt contract'))
}

function requireText(value: unknown, path: string, violations: CodeWorkPolicyViolation[]): value is string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.includes('\0')) {
    violations.push(issue(path, 'text_required', 'non-empty exact text is required'))
    return false
  }
  return true
}

function requireHash(value: unknown, path: string, violations: CodeWorkPolicyViolation[]): void {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    violations.push(issue(path, 'sha256_required', 'lowercase sha256 is required'))
  }
}

function requireGitSha(value: unknown, path: string, violations: CodeWorkPolicyViolation[]): void {
  if (typeof value !== 'string' || !GIT_SHA.test(value)) {
    violations.push(issue(path, 'git_sha_required', 'lowercase full Git SHA is required'))
  }
}

function requireInteger(value: unknown, path: string, violations: CodeWorkPolicyViolation[], minimum = 0): void {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    violations.push(issue(path, 'integer_required', `integer >= ${minimum} is required`))
  }
}

function requireBoolean(value: unknown, path: string, violations: CodeWorkPolicyViolation[]): void {
  if (typeof value !== 'boolean') violations.push(issue(path, 'boolean_required', 'boolean is required'))
}

function validatePaths(value: unknown, path: string, violations: CodeWorkPolicyViolation[]): void {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    violations.push(issue(path, 'path_array_required', 'path array is required'))
    return
  }
  for (const [index, item] of value.entries()) {
    const result = normalizeRepoRelativePath(item, `${path}[${index}]`)
    if (!result.ok) violations.push(...result.violations)
  }
}

export function validateCodeWorkReceipt(input: unknown): CodeWorkValidation<CodeWorkReceiptV1> {
  const violations: CodeWorkPolicyViolation[] = []
  if (!isRecord(input)) return { ok: false, violations: [issue('receipt', 'object_required', 'receipt must be an object')] }
  violations.push(...exactKeys(input, ['workId', 'sequence', 'observedAt', 'evidence'], 'receipt'))
  requireText(input.workId, 'receipt.workId', violations)
  requireInteger(input.sequence, 'receipt.sequence', violations, 1)
  if (typeof input.observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(input.observedAt)
    || Number.isNaN(Date.parse(input.observedAt))) {
    violations.push(issue('receipt.observedAt', 'iso_time_required', 'UTC ISO timestamp is required'))
  }
  if (!isRecord(input.evidence)) {
    violations.push(issue('receipt.evidence', 'object_required', 'evidence object is required'))
    return { ok: false, violations }
  }
  const evidence = input.evidence
  if (typeof evidence.receiptClass !== 'string'
    || !(CODE_WORK_RECEIPT_CLASSES as readonly string[]).includes(evidence.receiptClass)) {
    violations.push(issue('receipt.evidence.receiptClass', 'unknown_receipt_class', 'receipt class is not registered'))
    return { ok: false, violations }
  }
  const receiptClass = evidence.receiptClass as CodeWorkReceiptClass
  violations.push(...exactKeys(evidence, EVIDENCE_KEYS[receiptClass], 'receipt.evidence'))

  switch (receiptClass) {
    case 'repository_proof':
      requireText(evidence.repositoryId, 'receipt.evidence.repositoryId', violations)
      requireHash(evidence.remoteIdentityHash, 'receipt.evidence.remoteIdentityHash', violations)
      requireHash(evidence.localRootHash, 'receipt.evidence.localRootHash', violations)
      requireBoolean(evidence.verified, 'receipt.evidence.verified', violations)
      break
    case 'base_proof':
      requireText(evidence.baseRef, 'receipt.evidence.baseRef', violations)
      requireGitSha(evidence.pinnedBaseSha, 'receipt.evidence.pinnedBaseSha', violations)
      requireGitSha(evidence.observedRefSha, 'receipt.evidence.observedRefSha', violations)
      requireBoolean(evidence.stale, 'receipt.evidence.stale', violations)
      break
    case 'worktree_identity':
      requireText(evidence.branchName, 'receipt.evidence.branchName', violations)
      requireHash(evidence.worktreePathHash, 'receipt.evidence.worktreePathHash', violations)
      requireGitSha(evidence.headSha, 'receipt.evidence.headSha', violations)
      break
    case 'authority_pins':
      for (const key of ['missionHash', 'admissionHash', 'delegationHash', 'workPackageHash'] as const) {
        requireHash(evidence[key], `receipt.evidence.${key}`, violations)
      }
      break
    case 'worker_identity':
      for (const key of ['adapterId', 'provider', 'modelId', 'outputProtocol'] as const) {
        requireText(evidence[key], `receipt.evidence.${key}`, violations)
      }
      requireInteger(evidence.adapterVersion, 'receipt.evidence.adapterVersion', violations, 1)
      break
    case 'patch_operation':
      requireInteger(evidence.iteration, 'receipt.evidence.iteration', violations, 1)
      requireInteger(evidence.operationIndex, 'receipt.evidence.operationIndex', violations, 0)
      if (!['create', 'replace', 'delete', 'rename'].includes(String(evidence.operation))) {
        violations.push(issue('receipt.evidence.operation', 'unknown_operation', 'operation is not registered'))
      }
      validatePaths(evidence.paths, 'receipt.evidence.paths', violations)
      if (evidence.contentHash !== null) requireHash(evidence.contentHash, 'receipt.evidence.contentHash', violations)
      break
    case 'file_scope':
      requireInteger(evidence.iteration, 'receipt.evidence.iteration', violations, 1)
      validatePaths(evidence.changedPaths, 'receipt.evidence.changedPaths', violations)
      validatePaths(evidence.deniedPaths, 'receipt.evidence.deniedPaths', violations)
      requireBoolean(evidence.withinScope, 'receipt.evidence.withinScope', violations)
      break
    case 'command':
      requireInteger(evidence.iteration, 'receipt.evidence.iteration', violations, 1)
      requireText(evidence.commandId, 'receipt.evidence.commandId', violations)
      for (const key of ['registryHash', 'argvHash', 'stdoutHash', 'stderrHash'] as const) {
        requireHash(evidence[key], `receipt.evidence.${key}`, violations)
      }
      if (evidence.exitCode !== null) requireInteger(evidence.exitCode, 'receipt.evidence.exitCode', violations, 0)
      requireBoolean(evidence.timedOut, 'receipt.evidence.timedOut', violations)
      requireInteger(evidence.durationMs, 'receipt.evidence.durationMs', violations, 0)
      break
    case 'test_result':
      requireText(evidence.commandId, 'receipt.evidence.commandId', violations)
      if (!['passed', 'failed', 'skipped'].includes(String(evidence.outcome))) {
        violations.push(issue('receipt.evidence.outcome', 'unknown_outcome', 'test outcome is not registered'))
      }
      break
    case 'policy_denial':
      requireText(evidence.code, 'receipt.evidence.code', violations)
      if (evidence.path !== null) requireText(evidence.path, 'receipt.evidence.path', violations)
      break
    case 'cancellation_fencing':
      requireBoolean(evidence.cancelRequested, 'receipt.evidence.cancelRequested', violations)
      requireBoolean(evidence.claimValid, 'receipt.evidence.claimValid', violations)
      if (!['continue', 'cancelled', 'fenced'].includes(String(evidence.outcome))) {
        violations.push(issue('receipt.evidence.outcome', 'unknown_outcome', 'fencing outcome is not registered'))
      }
      break
    case 'final_git_status':
      requireGitSha(evidence.headSha, 'receipt.evidence.headSha', violations)
      requireGitSha(evidence.baseSha, 'receipt.evidence.baseSha', violations)
      validatePaths(evidence.stagedPaths, 'receipt.evidence.stagedPaths', violations)
      validatePaths(evidence.unstagedPaths, 'receipt.evidence.unstagedPaths', violations)
      validatePaths(evidence.untrackedPaths, 'receipt.evidence.untrackedPaths', violations)
      break
    case 'final_diff':
      requireHash(evidence.diffHash, 'receipt.evidence.diffHash', violations)
      requireInteger(evidence.diffBytes, 'receipt.evidence.diffBytes', violations, 0)
      validatePaths(evidence.changedPaths, 'receipt.evidence.changedPaths', violations)
      break
    case 'terminal':
      if (!isCodeWorkState(evidence.state) || ![
        'ready_for_human_review', 'tests_failed', 'scope_violation', 'stale_base',
        'worker_failed', 'cancelled', 'timeout', 'policy_denied',
      ].includes(evidence.state)) {
        violations.push(issue('receipt.evidence.state', 'terminal_state_required', 'registered terminal state is required'))
      }
      requireInteger(evidence.iterationCount, 'receipt.evidence.iterationCount', violations, 0)
      break
  }

  if (violations.length > 0) return { ok: false, violations }
  return { ok: true, value: input as unknown as CodeWorkReceiptV1 }
}

function sortedPaths(values: string[]): string[] {
  return [...new Set(values)].sort()
}

function receiptProjection(receipt: CodeWorkReceiptV1): CodeWorkReceiptV1 {
  const evidence = { ...receipt.evidence } as CodeWorkReceiptEvidence
  switch (evidence.receiptClass) {
    case 'patch_operation': evidence.paths = sortedPaths(evidence.paths); break
    case 'file_scope':
      evidence.changedPaths = sortedPaths(evidence.changedPaths)
      evidence.deniedPaths = sortedPaths(evidence.deniedPaths)
      break
    case 'final_git_status':
      evidence.stagedPaths = sortedPaths(evidence.stagedPaths)
      evidence.unstagedPaths = sortedPaths(evidence.unstagedPaths)
      evidence.untrackedPaths = sortedPaths(evidence.untrackedPaths)
      break
    case 'final_diff': evidence.changedPaths = sortedPaths(evidence.changedPaths); break
  }
  return { workId: receipt.workId, sequence: receipt.sequence, observedAt: receipt.observedAt, evidence }
}

export function codeWorkReceiptHash(receipt: CodeWorkReceiptV1): string {
  const validation = validateCodeWorkReceipt(receipt)
  if (!validation.ok) throw new Error(`invalid code-work receipt: ${validation.violations.map(item => item.code).join(',')}`)
  return canonicalTargetVersionHash(receiptProjection(receipt))
}

export function annotatedCodeWorkReceiptHash(input: AnnotatedCodeWorkReceiptV1): string {
  return codeWorkReceiptHash(input.receipt)
}
