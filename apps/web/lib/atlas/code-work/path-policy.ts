/**
 * SDF-1A lexical path policy only.
 *
 * This module cannot prove realpath containment or resist a filesystem symlink
 * race. SDF-1C must add lstat/open-no-follow/realpath enforcement before any
 * write. Treating a successful result here as filesystem safety is a bug.
 */

import type { CodeWorkPolicyViolation, CodeWorkValidation } from './types'

export const SDF1_PATH_ENFORCEMENT_LEVEL = 'lexical_only_not_symlink_safe' as const

export const SDF1_PLATFORM_DENIED_PATHS = [
  '.git',
  '.env*',
  '.ssh',
  '.aws',
  '.gnupg',
  'credentials',
  'secrets',
  '*.pem',
  '*.key',
] as const

const deny = (path: string, code: string, detail: string): CodeWorkValidation<string> => ({
  ok: false, violations: [{ path, code, detail }],
})

function platformDenied(path: string): string | null {
  const segments = path.split('/')
  for (const raw of segments) {
    const segment = raw.toLowerCase()
    if (segment === '.git') return '.git'
    if (segment.startsWith('.env')) return '.env*'
    if (['.ssh', '.aws', '.gnupg', 'credentials', 'secrets', 'secret'].includes(segment)) return segment
    if (segment === 'id_rsa' || segment === 'id_ed25519') return segment
    if (segment.endsWith('.pem') || segment.endsWith('.key')) return '*.' + segment.split('.').pop()
    if (/^service[-_]?account.*\.json$/.test(segment)) return 'service-account*.json'
  }
  return null
}

export function normalizeRepoRelativePath(input: unknown, field = 'path'): CodeWorkValidation<string> {
  if (typeof input !== 'string') return deny(field, 'path_not_string', 'path must be a string')
  if (input.includes('\0')) return deny(field, 'path_nul', 'NUL is forbidden')
  if (input.length === 0 || input.trim() !== input) {
    return deny(field, 'path_empty_or_ambiguous', 'empty or surrounding whitespace is forbidden')
  }
  if (input.includes('\\')) return deny(field, 'path_not_posix', 'backslashes are forbidden')
  if (input.startsWith('/') || input.startsWith('//') || /^[A-Za-z]:/.test(input)) {
    return deny(field, 'path_absolute', 'path must be repository-relative')
  }

  const normalized = input.normalize('NFC')
  const segments = normalized.split('/')
  if (segments.some(segment => segment === '' || segment === '.')) {
    return deny(field, 'path_ambiguous_segment', 'empty and dot segments are forbidden')
  }
  if (segments.includes('..')) return deny(field, 'path_traversal', 'parent traversal is forbidden')

  const forbidden = platformDenied(normalized)
  if (forbidden) return deny(field, 'path_platform_denied', `${forbidden} is denied by platform policy`)

  return { ok: true, value: normalized }
}

function scopeContains(scope: string, candidate: string): boolean {
  return candidate === scope || candidate.startsWith(`${scope}/`)
}

export function evaluateRepoPath(input: {
  path: unknown
  allowedScopes: readonly string[]
  deniedScopes: readonly string[]
  field?: string
}): CodeWorkValidation<string> {
  const field = input.field ?? 'path'
  const pathResult = normalizeRepoRelativePath(input.path, field)
  if (!pathResult.ok) return pathResult
  const candidate = pathResult.value

  const denied: string[] = []
  for (const scope of input.deniedScopes) {
    const result = normalizeRepoRelativePath(scope, `${field}.deniedScope`)
    if (!result.ok) return result
    denied.push(result.value)
  }
  if (denied.some(scope => scopeContains(scope, candidate))) {
    return deny(field, 'path_explicitly_denied', 'denied scope takes precedence over allowlist')
  }

  const allowed: string[] = []
  for (const scope of input.allowedScopes) {
    const result = normalizeRepoRelativePath(scope, `${field}.allowedScope`)
    if (!result.ok) return result
    allowed.push(result.value)
  }
  if (!allowed.some(scope => scopeContains(scope, candidate))) {
    return deny(field, 'path_not_allowed', 'path is outside the explicit allowlist')
  }
  return { ok: true, value: candidate }
}

export function normalizePathSet(paths: readonly string[], field: string): CodeWorkValidation<string[]> {
  const normalized: string[] = []
  const violations: CodeWorkPolicyViolation[] = []
  for (const [index, path] of paths.entries()) {
    const result = normalizeRepoRelativePath(path, `${field}[${index}]`)
    if (result.ok) normalized.push(result.value)
    else violations.push(...result.violations)
  }
  if (violations.length > 0) return { ok: false, violations }
  return { ok: true, value: [...new Set(normalized)].sort() }
}
