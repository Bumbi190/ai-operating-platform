/**
 * Stage 0: data-driven owner GitHub repository scope. No DB, network, secret,
 * paid model, Git write, Prime Agent or SDF Code Broker dependency.
 *
 * This is a pure policy candidate, NOT an authorization endpoint: the caller
 * must independently authenticate the operator, derive ownedProjectIds via
 * the existing project-isolation/RLS boundary, load owner-approved bindings
 * from trusted storage and authenticate GitHub App-JWT provider receipts.
 */
export const OWNER_REPOSITORY_CATALOG_VERSION = 'atlas.owner-repositories.v0' as const

export interface OwnerGithubBinding {
  projectId: string
  ownerUserId: string
  projectSlug: string
  installationId: number
  repositoryId: number
  repositoryOwnerId: number
  repositoryOwner: string
  repositoryName: string
  defaultBranch: string
  state: 'approved'
}

export interface OwnerGithubReadScope {
  readonly projectId: string
  readonly ownerUserId: string
  readonly projectSlug: string
  readonly installationId: number
  readonly repositoryId: number
  readonly repositoryOwnerId: number
  readonly repositoryOwner: string
  readonly repositoryName: string
  readonly defaultBranch: string
  readonly access: 'read'
}

export interface ReadScopeRequest {
  authenticatedOwnerUserId: string
  ownedProjectIds: readonly string[]
  requestedProjectId: string
  candidateBindings: readonly unknown[]
}

export type ScopeDecision =
  | { ok: false; code: 'not_available' }
  | { ok: true; scope: OwnerGithubReadScope }

// A local, non-serializable marker stops accidental direct use of a caller-
// constructed scope. This is NOT cryptographic authority; server-side owner
// authentication, database project ownership and GitHub API evidence remain required.
const VERIFIED_SCOPE_MARKER = Symbol('atlas-owner-github-read-candidate')
function internallyResolvedScope(value: OwnerGithubReadScope): boolean {
  return !!value && Object.getOwnPropertyDescriptor(value, VERIFIED_SCOPE_MARKER)?.value === true
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const GITHUB_NAME = /^[a-z0-9](?:[a-z0-9_.-]{0,98}[a-z0-9])?$/i
const PROJECT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const positiveId = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0

function branchOk(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 120 && value.length > 0
    && /^[a-z0-9_./-]+$/i.test(value)
    && !value.startsWith('.') && !value.startsWith('/') && !value.endsWith('/')
    && !value.includes('..') && !value.includes('//') && !value.includes('@{')
}

export function parseOwnerGithubBinding(value: unknown): OwnerGithubBinding | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const x = value as Record<string, unknown>
  if (x.state !== 'approved' ||
    typeof x.projectId !== 'string' || !UUID.test(x.projectId) ||
    typeof x.ownerUserId !== 'string' || !UUID.test(x.ownerUserId) ||
    typeof x.projectSlug !== 'string' || !PROJECT_SLUG.test(x.projectSlug) ||
    typeof x.repositoryOwner !== 'string' || !GITHUB_NAME.test(x.repositoryOwner) ||
    typeof x.repositoryName !== 'string' || !GITHUB_NAME.test(x.repositoryName) ||
    !positiveId(x.installationId) || !positiveId(x.repositoryId) ||
    !positiveId(x.repositoryOwnerId) || !branchOk(x.defaultBranch)) return null
  return Object.freeze({
    projectId: x.projectId.toLowerCase(), ownerUserId: x.ownerUserId.toLowerCase(),
    projectSlug: x.projectSlug, repositoryId: x.repositoryId,
    installationId: x.installationId, repositoryOwnerId: x.repositoryOwnerId,
    repositoryOwner: x.repositoryOwner, repositoryName: x.repositoryName,
    defaultBranch: x.defaultBranch, state: 'approved' as const,
  })
}

/**
 * Scoped lookups never fall back to a project slug, a user-supplied repo URL,
 * an account-wide token, or a default repo. Ambiguous mappings fail closed.
 * Provider receipt verification STILL happens at the actual transport.
 */
export function resolveOwnerGithubReadScope(input: ReadScopeRequest): ScopeDecision {
  if (!input || typeof input.authenticatedOwnerUserId !== 'string' ||
    !UUID.test(input.authenticatedOwnerUserId) ||
    typeof input.requestedProjectId !== 'string' || !UUID.test(input.requestedProjectId) ||
    !Array.isArray(input.ownedProjectIds) || !Array.isArray(input.candidateBindings))
    return { ok: false, code: 'not_available' }
  const owner = input.authenticatedOwnerUserId.toLowerCase()
  const project = input.requestedProjectId.toLowerCase()
  if (!input.ownedProjectIds.some(id => typeof id === 'string' && id.toLowerCase() === project))
    return { ok: false, code: 'not_available' }

  const scoped: OwnerGithubBinding[] = []
  for (const raw of input.candidateBindings) {
    // Never inspect or report another owner's bindings. Invalid owned rows
    // cannot silently disappear and leave an ambiguous source admission.
    if (!raw || typeof raw !== 'object' ||
      (raw as Record<string, unknown>).ownerUserId !== input.authenticatedOwnerUserId)
      continue
    const binding = parseOwnerGithubBinding(raw)
    if (!binding) return { ok: false, code: 'not_available' }
    scoped.push(binding)
  }
  const target = scoped.filter(b => b.projectId === project)
  if (target.length !== 1) return { ok: false, code: 'not_available' }
  // A repository shared between projects needs a separately verified
  // monorepo/path-scoping design, not implicit cross-project access.
  if (scoped.some(b => b.projectId !== project && b.repositoryId === target[0].repositoryId))
    return { ok: false, code: 'not_available' }
  const { state: _state, ...scope } = target[0]
  const candidate = Object.defineProperty(
    { ...scope, access: 'read' as const }, VERIFIED_SCOPE_MARKER,
    { value: true, enumerable: false, writable: false },
  )
  return { ok: true, scope: Object.freeze(candidate) }
}

export interface ExpectedGithubInstallation {
  appId: number
  installationId: number
  ownerId: number
  ownerLogin: string
}

/** Verify the parent installation with an authenticated App JWT (external). */
export function trustedReadOnlyInstallation(
  value: unknown, expected: ExpectedGithubInstallation,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    !positiveId(expected?.appId) || !positiveId(expected?.installationId) ||
    !positiveId(expected?.ownerId) || !GITHUB_NAME.test(expected?.ownerLogin ?? '')) return false
  const x = value as Record<string, any>
  const permissions = x.permissions
  return x.id === expected.installationId && x.app_id === expected.appId
    && x.account?.type === 'User' && x.account?.id === expected.ownerId
    && String(x.account?.login || '').toLowerCase() === expected.ownerLogin.toLowerCase()
    && x.target_id === expected.ownerId && x.target_type === 'User'
    && ['all', 'selected'].includes(x.repository_selection)
    && x.suspended_at === null && Array.isArray(x.events) && x.events.length === 0
    && !!permissions && typeof permissions === 'object' && !Array.isArray(permissions)
    && Object.keys(permissions).length === 2
    && permissions.contents === 'read' && permissions.metadata === 'read'
}

/** ALWAYS mint one repository at a time, even if the parent installation is all. */
export function singleRepositoryReadGrant(scope: OwnerGithubReadScope) {
  if (!scope || !internallyResolvedScope(scope) || scope.access !== 'read' ||
    !positiveId(scope.repositoryId)) return null
  return Object.freeze({
    repository_ids: Object.freeze([scope.repositoryId]),
    permissions: Object.freeze({ contents: 'read' as const }),
  })
}

/** Independently verify the live repository API identity against stored IDs. */
export function matchesGithubRepository(value: unknown, scope: OwnerGithubReadScope): boolean {
  if (!value || typeof value !== 'object' || !scope || !internallyResolvedScope(scope)) return false
  const x = value as Record<string, any>
  return x.id === scope.repositoryId && x.owner?.id === scope.repositoryOwnerId
    && typeof x.full_name === 'string' &&
    x.full_name.toLowerCase() === (scope.repositoryOwner + '/' + scope.repositoryName).toLowerCase()
    && x.default_branch === scope.defaultBranch
}

/** Never accept a broad installation token, write scopes or extra repos. */
export function validatesSingleRepositoryTokenReceipt(
  value: unknown, scope: OwnerGithubReadScope, now = Date.now(),
): boolean {
  if (!value || typeof value !== 'object' || !scope ||
    !internallyResolvedScope(scope) || !Number.isFinite(now)) return false
  const x = value as Record<string, any>
  const p = x.permissions
  const expiry = typeof x.expires_at === 'string' ? Date.parse(x.expires_at) : NaN
  return x.repository_selection === 'selected' &&
    Array.isArray(x.repositories) && x.repositories.length === 1 &&
    x.repositories[0]?.id === scope.repositoryId &&
    !!p && typeof p === 'object' && !Array.isArray(p) &&
    p.contents === 'read' &&
    Object.keys(p).every(k => (k === 'contents' || k === 'metadata') && p[k] === 'read') &&
    typeof x.token === 'string' && x.token.length > 0 &&
    Number.isFinite(expiry) && expiry >= now + 5 * 60_000 && expiry <= now + 65 * 60_000
}
