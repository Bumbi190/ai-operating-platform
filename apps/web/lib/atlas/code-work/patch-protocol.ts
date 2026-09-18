/** SDF-1A structured file-operation protocol. Validation only; never applies files. */

import { evaluateRepoPath } from './path-policy'
import type { CodeWorkAdmissionV1, CodeWorkPolicyViolation, CodeWorkValidation } from './types'

export const STRUCTURED_PATCH_PROTOCOL = 'sdf1.structured_file_ops.v1' as const
export const STRUCTURED_PATCH_VERSION = 1 as const

export type StructuredFileOperation =
  | { op: 'create'; path: string; content: string }
  | { op: 'replace'; path: string; expected_sha256: string; content: string }
  | { op: 'delete'; path: string; expected_sha256: string }
  | { op: 'rename'; from: string; to: string; expected_sha256: string }

export interface StructuredPatchV1 {
  protocol: typeof STRUCTURED_PATCH_PROTOCOL
  version: typeof STRUCTURED_PATCH_VERSION
  operations: StructuredFileOperation[]
}

export interface ValidatedStructuredPatch {
  patch: StructuredPatchV1
  normalizedOperations: StructuredFileOperation[]
  touchedPaths: string[]
  contentBytes: number
}

const SHA256 = /^[a-f0-9]{64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): CodeWorkPolicyViolation[] {
  const set = new Set(allowed)
  return Object.keys(value).filter(key => !set.has(key)).map(key => ({
    path: `${path}.${key}`, code: 'unknown_field', detail: 'unknown fields are not part of the protocol',
  }))
}

function textContent(value: unknown, path: string): CodeWorkValidation<string> {
  if (typeof value !== 'string') {
    return { ok: false, violations: [{ path, code: 'content_not_text', detail: 'content must be a string' }] }
  }
  if (value.includes('\0')) {
    return { ok: false, violations: [{ path, code: 'binary_content_forbidden', detail: 'NUL-bearing content is not text' }] }
  }
  return { ok: true, value }
}

function expectedHash(value: unknown, path: string): CodeWorkValidation<string> {
  return typeof value === 'string' && SHA256.test(value)
    ? { ok: true, value }
    : { ok: false, violations: [{ path, code: 'expected_hash_required', detail: 'existing-file mutation needs sha256' }] }
}

export function validateStructuredPatch(
  input: unknown,
  admission: Pick<CodeWorkAdmissionV1, 'files' | 'limits'>,
): CodeWorkValidation<ValidatedStructuredPatch> {
  if (!isRecord(input)) {
    return { ok: false, violations: [{ path: 'patch', code: 'patch_object_required', detail: 'patch must be an object' }] }
  }
  const violations: CodeWorkPolicyViolation[] = [
    ...exactKeys(input, ['protocol', 'version', 'operations'], 'patch'),
  ]
  if (input.protocol !== STRUCTURED_PATCH_PROTOCOL || input.version !== STRUCTURED_PATCH_VERSION) {
    violations.push({ path: 'patch.version', code: 'unknown_patch_version', detail: 'unknown protocol/version' })
  }
  if (!Array.isArray(input.operations)) {
    violations.push({ path: 'patch.operations', code: 'operations_array_required', detail: 'operations must be an array' })
    return { ok: false, violations }
  }
  if (input.operations.length > admission.limits.maxChangedFiles) {
    violations.push({ path: 'patch.operations', code: 'operation_limit_exceeded', detail: 'operation count exceeds admission' })
  }

  const operations: StructuredFileOperation[] = []
  const touched: string[] = []
  let contentBytes = 0

  const writePath = (value: unknown, path: string) => evaluateRepoPath({
    path: value,
    allowedScopes: admission.files.writeScopes,
    deniedScopes: admission.files.deniedScopes,
    field: path,
  })

  for (const [index, raw] of input.operations.entries()) {
    const path = `patch.operations[${index}]`
    if (!isRecord(raw) || typeof raw.op !== 'string') {
      violations.push({ path, code: 'operation_invalid', detail: 'operation object and op are required' })
      continue
    }
    if (!['create', 'replace', 'delete', 'rename'].includes(raw.op)) {
      violations.push({ path: `${path}.op`, code: 'unknown_operation', detail: 'operation is not supported' })
      continue
    }

    if (raw.op === 'create' || raw.op === 'replace') {
      violations.push(...exactKeys(raw, raw.op === 'create'
        ? ['op', 'path', 'content']
        : ['op', 'path', 'expected_sha256', 'content'], path))
      if (!admission.files.permissions[raw.op === 'create' ? 'create' : 'update']) {
        violations.push({ path, code: 'operation_not_permitted', detail: `${raw.op} is not admitted` })
      }
      const target = writePath(raw.path, `${path}.path`)
      const content = textContent(raw.content, `${path}.content`)
      const hash = raw.op === 'replace' ? expectedHash(raw.expected_sha256, `${path}.expected_sha256`) : null
      if (!target.ok) violations.push(...target.violations)
      if (!content.ok) violations.push(...content.violations)
      if (hash && !hash.ok) violations.push(...hash.violations)
      if (target.ok && content.ok && (!hash || hash.ok)) {
        contentBytes += new TextEncoder().encode(content.value).byteLength
        touched.push(target.value)
        operations.push(raw.op === 'create'
          ? { op: 'create', path: target.value, content: content.value }
          : { op: 'replace', path: target.value, expected_sha256: hash!.value, content: content.value })
      }
      continue
    }

    if (raw.op === 'delete') {
      violations.push(...exactKeys(raw, ['op', 'path', 'expected_sha256'], path))
      if (!admission.files.permissions.delete) {
        violations.push({ path, code: 'operation_not_permitted', detail: 'delete is not admitted' })
      }
      const target = writePath(raw.path, `${path}.path`)
      const hash = expectedHash(raw.expected_sha256, `${path}.expected_sha256`)
      if (!target.ok) violations.push(...target.violations)
      if (!hash.ok) violations.push(...hash.violations)
      if (target.ok && hash.ok) {
        touched.push(target.value)
        operations.push({ op: 'delete', path: target.value, expected_sha256: hash.value })
      }
      continue
    }

    violations.push(...exactKeys(raw, ['op', 'from', 'to', 'expected_sha256'], path))
    if (!admission.files.permissions.rename) {
      violations.push({ path, code: 'operation_not_permitted', detail: 'rename is not admitted' })
    }
    const from = writePath(raw.from, `${path}.from`)
    const to = writePath(raw.to, `${path}.to`)
    const hash = expectedHash(raw.expected_sha256, `${path}.expected_sha256`)
    if (!from.ok) violations.push(...from.violations)
    if (!to.ok) violations.push(...to.violations)
    if (!hash.ok) violations.push(...hash.violations)
    if (from.ok && to.ok && hash.ok) {
      touched.push(from.value, to.value)
      operations.push({ op: 'rename', from: from.value, to: to.value, expected_sha256: hash.value })
    }
  }

  const duplicate = touched.find((value, index) => touched.indexOf(value) !== index)
  if (duplicate) {
    violations.push({
      path: 'patch.operations', code: 'conflicting_operations',
      detail: `path is touched more than once: ${duplicate}; rename chains/cycles are refused`,
    })
  }
  if (new Set(touched).size > admission.limits.maxChangedFiles) {
    violations.push({ path: 'patch.operations', code: 'changed_file_limit_exceeded', detail: 'unique paths exceed admission' })
  }
  if (contentBytes > admission.limits.maxDiffBytes) {
    violations.push({ path: 'patch.operations', code: 'diff_limit_exceeded', detail: 'text payload exceeds admission diff budget' })
  }
  if (violations.length > 0) return { ok: false, violations }

  const patch: StructuredPatchV1 = {
    protocol: STRUCTURED_PATCH_PROTOCOL,
    version: STRUCTURED_PATCH_VERSION,
    operations,
  }
  return {
    ok: true,
    value: { patch, normalizedOperations: operations, touchedPaths: [...new Set(touched)].sort(), contentBytes },
  }
}
