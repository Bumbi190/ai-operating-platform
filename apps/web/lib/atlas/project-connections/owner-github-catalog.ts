/**
 * Stages 0–1: data-driven owner GitHub repository scope and a READ-ONLY
 * query adapter that receives its DB client from an authenticated future caller.
 * No instantiated DB connection, network, secret, paid model, Git write,
 * Prime Agent or SDF Code Broker dependency.
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

// A module-private WeakSet rejects arbitrary object clones and prevents a
// caller from copying a readable Symbol marker to forge a different repo.
// This is defense in depth, not session/DB/provider authentication.
const VERIFIED_SCOPES = new WeakSet<object>()
function internallyResolvedScope(value: OwnerGithubReadScope): boolean {
  return !!value && typeof value === 'object' && VERIFIED_SCOPES.has(value)
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
  const candidate = Object.freeze({ ...scope, access: 'read' as const })
  VERIFIED_SCOPES.add(candidate)
  return { ok: true, scope: candidate }
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


export const OWNER_GITHUB_BINDINGS_TABLE = 'atlas_owner_github_bindings' as const

/** Avoid silently truncating an ownership/connection inventory. */
const MAX_OWNER_PROJECTS = 200
const FETCH_LIMIT = MAX_OWNER_PROJECTS + 1
type Failure = { ok: false; code: 'not_available' }
const DENIED: Failure = Object.freeze({ ok: false, code: 'not_available' })

export interface ReadOnlyQuery {
  select(columns: string): ReadOnlyQuery
  eq(column: string, value: string): ReadOnlyQuery
  in(column: string, values: string[]): ReadOnlyQuery
  limit(count: number): Promise<{ data: unknown; error: unknown }>
}
export interface OwnerRepositoryReadDb {
  from(table: string): ReadOnlyQuery
}
export interface StoredScopeLookup {
  db: OwnerRepositoryReadDb
  /** Must come from an independently verified operator session. */
  authenticatedOwnerUserId: string
  /** Immutable project UUID, never a slug, path or model-selected URL. */
  requestedProjectId: string
}

interface ProjectIdentity { id: string; slug: string }
function projectIdentities(input: unknown, owner: string): ProjectIdentity[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length >= FETCH_LIMIT) return null
  const byId = new Map<string,string>()
  for (const row of input) {
    if (!row || typeof row !== 'object') return null
    const r = row as Record<string, unknown>
    if (typeof r.id !== 'string' || !UUID.test(r.id) ||
      r.owner_id !== owner ||
      typeof r.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.slug))
      return null
    const id = r.id.toLowerCase()
    if (byId.has(id)) return null
    byId.set(id,r.slug)
  }
  return [...byId].map(([id,slug])=>({id,slug}))
}

function verifiedBindingRow(input: unknown, owner: string, projectSlugs: Map<string,string>):
  OwnerGithubBinding | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const r = input as Record<string, unknown>
  const projectId = typeof r.project_id === 'string' ? r.project_id.toLowerCase() : ''
  // Database timestamps must be explicit UTC/offset ISO instants, not permissive
  // locale/date-only strings whose meaning can vary between runtimes.
  const approvedAt = typeof r.approved_at === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(r.approved_at)
    ? Date.parse(r.approved_at) : NaN
  // Revocation must be checked even when an inconsistent privileged query
  // returns an 'approved' row. A previous review receipt cannot revive it.
  if (r.revoked_at !== null) return null
  // The catalogue is untrusted unless an owner-approved row has an explicit
  // reviewer and a valid approval time. Live provider identity is rechecked
  // independently at the transport boundary on EVERY actual inspection.
  if (!UUID.test(projectId) || !projectSlugs.has(projectId) ||
    r.owner_user_id !== owner || r.approved_by !== owner ||
    r.state !== 'approved' ||
    !Number.isFinite(approvedAt) || approvedAt > Date.now() ||
    typeof r.project_slug !== 'string' || r.project_slug !== projectSlugs.get(projectId))
    return null
  const candidate = {
    projectId, ownerUserId: owner, projectSlug: r.project_slug,
    installationId: r.installation_id, repositoryId: r.repository_id,
    repositoryOwnerId: r.repository_owner_id,
    repositoryOwner: r.repository_owner, repositoryName: r.repository_name,
    defaultBranch: r.default_branch, state: r.state,
  }
  // The pure policy validates all other types/identities, once and again.
  return candidate as OwnerGithubBinding
}

/**
 * Read-only, fail-closed lookup that proves:
 *   1. the verified user owns the requested Omnira project,
 *   2. all returned registered rows are owned and correctly mapped,
 *   3. the one-project scope passes the independent pure policy.
 *
 * No insert/upsert/update/delete, provider call, secret, model or SQL execute.
 * The repository table is deliberately ABSENT from production during Stage 1.
 */
export async function loadStoredOwnerGithubReadScope(input: StoredScopeLookup): Promise<ScopeDecision> {
  if (!input || !input.db || typeof input.db.from !== 'function' ||
    typeof input.authenticatedOwnerUserId !== 'string' ||
    typeof input.requestedProjectId !== 'string' ||
    !UUID.test(input.authenticatedOwnerUserId) || !UUID.test(input.requestedProjectId))
    return DENIED
  const owner = input.authenticatedOwnerUserId.toLowerCase()
  const targetId = input.requestedProjectId.toLowerCase()
  try {
    const owned = await input.db.from('projects')
      .select('id,slug,owner_id').eq('owner_id', owner).limit(FETCH_LIMIT)
    if (owned.error) return DENIED
    const projects = projectIdentities(owned.data,owner)
    if (!projects) return DENIED
    const slugs = new Map(projects.map(p=>[p.id,p.slug]))
    if (!slugs.has(targetId)) return DENIED // No binding read for a foreign project.
    const ids = projects.map(p=>p.id)
    const result = await input.db.from(OWNER_GITHUB_BINDINGS_TABLE)
      .select('project_id,owner_user_id,project_slug,installation_id,repository_id,repository_owner_id,repository_owner,repository_name,default_branch,state,approved_by,approved_at,revoked_at')
      .eq('owner_user_id',owner).eq('state','approved')
      .in('project_id',ids).limit(FETCH_LIMIT)
    if (result.error || !Array.isArray(result.data) || result.data.length >= FETCH_LIMIT)
      return DENIED
    const bindings: OwnerGithubBinding[] = []
    for (const raw of result.data) {
      const row = verifiedBindingRow(raw,owner,slugs)
      if (!row) return DENIED
      bindings.push(row)
    }
    return resolveOwnerGithubReadScope({
      authenticatedOwnerUserId:owner,requestedProjectId:targetId,
      ownedProjectIds:ids,candidateBindings:bindings,
    })
  } catch {
    return DENIED
  }
}
