/**
 * Nova source-inspection pilot. This is NOT the SDF-1 code-execution repository
 * registry. This separate read-only registry never grants file writes, builds,
 * a shell, the browser, or permissions to another project's source.
 *
 * GitHub immutable REST repo / owner IDs independently observed on 2026-10-28.
 */
export const NOVA_SOURCE_POLICY_VERSION = 'nova.source.read.v1' as const

export interface SourceRepository {
  projectSlug: 'handlarborsen'
  repositoryId: number
  ownerId: number
  owner: 'Bumbi190'
  name: 'handlarborsen'
  branch: 'main'
}

const HANDBORSEN: SourceRepository = Object.freeze({
  projectSlug: 'handlarborsen',
  repositoryId: 1374257653,
  ownerId: 158544361,
  owner: 'Bumbi190',
  name: 'handlarborsen',
  branch: 'main',
})

/** Only the independently verified Handlarbörsen mapping is admitted in v1. */
export function sourceRepositoryForProject(projectSlug: unknown): SourceRepository | null {
  return projectSlug === 'handlarborsen' ? HANDBORSEN : null
}

export const SOURCE_MAX_BYTES = 32_768
export const SOURCE_MAX_LINES = 240
export const SOURCE_GIT_SHA = /^[a-f0-9]{40}$/

export type SourceRequest =
  | { action: 'status'; projectSlug: 'handlarborsen' }
  | { action: 'read_file'; projectSlug: 'handlarborsen'; path: string }

const ALLOWED_ROOTS = new Set(['app', 'src', 'lib', 'components', 'docs', 'tests', 'test', 'e2e', 'pages'])
const ALLOWED_EXTENSIONS = /\.(?:ts|tsx|js|jsx|mjs|cjs|css|scss|md|mdx|json|yaml|yml|html)$/i
const DENIED_SEGMENT = /^(?:\.|__)?(?:env|secrets?|private|credentials?|keys?|tokens?|certs?|node_modules|vendor|dist|build|\.git|\.next)(?:[._-]|$)/i

/** A filename is never a URL. No traversal, dotfiles, encodings or globs. */
export function safeSourcePath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 3 || value.length > 180 || value !== value.trim()) return null
  if (!/^[A-Za-z0-9_.\/-]+$/.test(value) || value.includes('//')) return null
  const segments = value.split('/')
  if (segments.some(s => !s || s.startsWith('.') || s === '..' || DENIED_SEGMENT.test(s))) return null
  if (segments.length > 12) return null
  if (segments.length === 1) {
    return ['README.md', 'package.json'].includes(value) ? value : null
  }
  if (!ALLOWED_ROOTS.has(segments[0])) return null
  if (!ALLOWED_EXTENSIONS.test(value)) return null
  if (/(?:package-lock|pnpm-lock|yarn\.lock|bun\.lockb?)$/i.test(value)) return null
  return value
}

export function parseSourceRequest(value: unknown): SourceRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const x = value as Record<string, unknown>
  if (!sourceRepositoryForProject(x.projectSlug)) return null
  const keys = Object.keys(x).sort()
  if (x.action === 'status' && JSON.stringify(keys) === JSON.stringify(['action', 'projectSlug'])) {
    return { action: 'status', projectSlug: 'handlarborsen' }
  }
  if (x.action === 'read_file' && JSON.stringify(keys) === JSON.stringify(['action', 'path', 'projectSlug'])) {
    const path = safeSourcePath(x.path)
    return path ? { action: 'read_file', projectSlug: 'handlarborsen', path } : null
  }
  return null
}

/** Conservative whole-file fail-closed secret detector, not a proof of absence. */
export function isSafeInspectableText(text: string): boolean {
  if (typeof text !== 'string' || !text || new TextEncoder().encode(text).length > SOURCE_MAX_BYTES) return false
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return false
  // This is a conservative release gate, not a complete DLP system. Treat
  // sensitive assignments as unsafe EVEN without quotes or with short values:
  // secrets can be URLs, YAML/JSON properties and camelCase variables too.
  const highRisk = [
    /-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH PRIVATE KEY)-----/i,
    /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{25,}\b/,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\b(?:[A-Za-z0-9_$]+[_-])?(?:api[_-]?key|access[_-]?token|auth[_-]?token|service[_-]?role[_-]?key|secret[_-]?key|client[_-]?secret|private[_-]?key|password|passwd|db[_-]?password|database[_-]?url|database[_-]?dsn|connection[_-]?string|smtp[_-]?pass(?:word)?|webhook[_-]?secret)\b["']?\s*[:=]\s*\S/i,
    /\b(?:[A-Za-z_$][A-Za-z0-9_$]*)?(?:apiKey|accessToken|authToken|githubToken|serviceRoleKey|clientSecret|secretKey|privateKey|password|databaseUrl|connectionString)\s*[:=]\s*\S/i,
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s/"'<>@]*:[^\s/"'<>@]*@/i,
    /\b(?:Authorization|Proxy-Authorization)["']?\s*[:=]\s*["']?(?:Bearer|Basic)\s+[A-Za-z0-9+\/._~-]{10,}/i,
    /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    /\b(?:xox[baprs]-|glpat-|sk_live_|rk_live_|whsec_)[A-Za-z0-9_-]{12,}\b/i,
  ]
  return !highRisk.some(pattern => pattern.test(text))
}

export function selectedSourceLines(text: string): { line: number; text: string }[] {
  return text.split(/\r?\n/).slice(0, SOURCE_MAX_LINES).map((line, index) => ({ line: index + 1, text: line }))
}

export function immutableSourceUrl(repo: SourceRepository, sha: string, path: string, lastLine: number): string {
  if (!SOURCE_GIT_SHA.test(sha) || !safeSourcePath(path)) throw new Error('untrusted_source_receipt')
  return 'https://github.com/' + repo.owner + '/' + repo.name + '/blob/' + sha + '/' +
    path.split('/').map(encodeURIComponent).join('/') + '#L1-L' + Math.min(lastLine, SOURCE_MAX_LINES)
}
