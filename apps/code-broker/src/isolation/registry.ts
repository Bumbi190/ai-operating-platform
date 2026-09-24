/**
 * SDF-1C3A — the local broker's own CLOSED map from repositoryId to trusted local repository
 * configuration. It deliberately does not import apps/web (the broker is a separate trust domain
 * and package); a parity test in apps/web/lib/qa pins every value here to the canonical web
 * registry so drift fails CI.
 *
 * Nothing that can be influenced from outside supplies a filesystem root: not the broker HTTP
 * responses, not CLI arguments, not WorkPackage prose, not the environment, not model output.
 * There is exactly one repository, and no generic arbitrary-repository support.
 */

export const LOCAL_REPOSITORY_REGISTRY_VERSION = 'sdf1.repositories.v1' as const
export const OMNIRA_REPOSITORY_ID = 'github.com/bumbi190/ai-operating-platform' as const

export interface NormalizedRemoteIdentity {
  provider: 'github'
  host: 'github.com'
  owner: string
  name: string
}

export interface LocalTrustedRepository {
  readonly repositoryId: string
  readonly remoteIdentity: Readonly<NormalizedRemoteIdentity>
  /** Canonical (no symlink in any ancestor) absolute path of the MAIN checkout. */
  readonly approvedLocalRoot: string
  /** Canonical absolute directory that must already exist; worktrees are created directly inside it. */
  readonly approvedWorktreeParent: string
  readonly approvedBranchPrefix: string
  readonly approvedRemote: string
  /** The single ref the pinned base must equal. */
  readonly approvedBaseRef: string
}

export const OMNIRA_LOCAL_REPOSITORY: LocalTrustedRepository = Object.freeze({
  repositoryId: OMNIRA_REPOSITORY_ID,
  remoteIdentity: Object.freeze({ provider: 'github', host: 'github.com', owner: 'bumbi190', name: 'ai-operating-platform' } as const),
  approvedLocalRoot: '/Users/andrehultgren/Projects/Omnira/Code/ai-operating-platform',
  approvedWorktreeParent: '/Users/andrehultgren/Projects/Omnira/.worktrees/sdf1',
  approvedBranchPrefix: 'sdf1/',
  approvedRemote: 'origin',
  approvedBaseRef: 'refs/remotes/origin/main',
})

const REPOSITORIES: Readonly<Record<string, LocalTrustedRepository>> = Object.freeze({
  [OMNIRA_REPOSITORY_ID]: OMNIRA_LOCAL_REPOSITORY,
})

export function lookupLocalRepository(id: unknown): LocalTrustedRepository | null {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(REPOSITORIES, id) ? REPOSITORIES[id] : null
}
