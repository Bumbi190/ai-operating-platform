/**
 * SDF-1A trusted repository identity, without Git or filesystem access.
 *
 * The Omnira entry is based on the read-only remote observation made before
 * this tranche. SDF-1C must prove the same identity again; this declaration is
 * policy, not proof that a future machine still has the same checkout.
 */

import type { NormalizedRemoteIdentity } from './types'

export const REPOSITORY_REGISTRY_VERSION = 'sdf1.repositories.v1' as const
export const OMNIRA_REPOSITORY_ID = 'github.com/bumbi190/ai-operating-platform' as const

export interface TrustedRepositoryDefinition {
  repositoryId: string
  owner: string
  name: string
  remoteIdentity: NormalizedRemoteIdentity
  approvedLocalRoot: string
  approvedWorktreeParent: string
  approvedBranchPrefix: string
  approvedRemote: string
  approvedBaseRefs: readonly string[]
  cleanupPolicy: 'explicit_action_only'
}

export const OMNIRA_TRUSTED_REPOSITORY: TrustedRepositoryDefinition = Object.freeze({
  repositoryId: OMNIRA_REPOSITORY_ID,
  owner: 'Bumbi190',
  name: 'ai-operating-platform',
  remoteIdentity: Object.freeze({
    provider: 'github', host: 'github.com', owner: 'bumbi190', name: 'ai-operating-platform',
  }),
  approvedLocalRoot: '/Users/andrehultgren/Projects/Omnira/Code/ai-operating-platform',
  approvedWorktreeParent: '/Users/andrehultgren/Projects/Omnira/.worktrees/sdf1',
  approvedBranchPrefix: 'sdf1/',
  approvedRemote: 'origin',
  approvedBaseRefs: Object.freeze(['refs/remotes/origin/main']),
  cleanupPolicy: 'explicit_action_only',
})

const REPOSITORIES = Object.freeze({ [OMNIRA_REPOSITORY_ID]: OMNIRA_TRUSTED_REPOSITORY })

export function lookupTrustedRepository(id: unknown): TrustedRepositoryDefinition | null {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(REPOSITORIES, id)
    ? REPOSITORIES[id as keyof typeof REPOSITORIES]
    : null
}

/** Normalize HTTPS, SCP-like SSH and ssh:// GitHub remotes to one identity. */
export function normalizeGitHubRemote(input: unknown): NormalizedRemoteIdentity | null {
  if (typeof input !== 'string' || input.trim() !== input || input.length === 0 || input.includes('\0')) {
    return null
  }

  let owner: string
  let name: string

  const scp = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(input)
  if (scp) {
    owner = scp[1]
    name = scp[2]
  } else {
    let url: URL
    try { url = new URL(input) } catch { return null }
    if (!['https:', 'ssh:'].includes(url.protocol)) return null
    if (url.hostname.toLowerCase() !== 'github.com') return null
    if (url.username && url.username !== 'git') return null
    if (url.password || url.search || url.hash || url.port) return null
    const segments = url.pathname.replace(/^\//, '').split('/')
    if (segments.length !== 2 || !segments[0] || !segments[1]) return null
    owner = segments[0]
    name = segments[1].replace(/\.git$/i, '')
  }

  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) return null
  return { provider: 'github', host: 'github.com', owner: owner.toLowerCase(), name: name.toLowerCase() }
}

export function sameRemoteIdentity(a: NormalizedRemoteIdentity, b: NormalizedRemoteIdentity): boolean {
  return a.provider === b.provider && a.host === b.host && a.owner === b.owner && a.name === b.name
}
