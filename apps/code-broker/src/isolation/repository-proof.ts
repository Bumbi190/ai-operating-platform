/**
 * SDF-1C3A — proof of the trusted local checkout and of the pinned base, BEFORE any worktree is
 * created. Both return closed objects: no Git output, path, or secret ever leaves this module —
 * only closed refusal codes and hashes.
 */

import { lstatSync, realpathSync } from 'node:fs'
import { auditGitConfig } from './git-config-audit.js'
import { gitCommands } from './git-commands.js'
import type { InfraRunner } from './process-runner.js'
import type { LocalTrustedRepository } from './registry.js'
import { sha256Tagged } from './hash.js'

export type RepositoryRefusal =
  | 'root_missing' | 'root_is_symlink' | 'root_not_directory' | 'root_not_canonical'
  | 'git_unavailable' | 'not_a_git_repository' | 'not_main_checkout'
  | 'unsafe_git_config' | 'remote_missing' | 'remote_malformed' | 'remote_identity_mismatch'

export type RepositoryProof =
  | { ok: true; repositoryId: string; rootRealpath: string; rootHash: string; remoteIdentityHash: string; baseRef: string }
  | { ok: false; refusal: RepositoryRefusal }

export interface RepositoryFs {
  lstat(path: string): { isDirectory(): boolean; isSymbolicLink(): boolean }
  realpath(path: string): string
}
const realFs: RepositoryFs = { lstat: p => lstatSync(p), realpath: p => realpathSync(p) }

export async function proveRepository(repo: LocalTrustedRepository, runner: InfraRunner, fs: RepositoryFs = realFs): Promise<RepositoryProof> {
  const root = repo.approvedLocalRoot
  let st: ReturnType<RepositoryFs['lstat']>
  try { st = fs.lstat(root) } catch { return { ok: false, refusal: 'root_missing' } }
  if (st.isSymbolicLink()) return { ok: false, refusal: 'root_is_symlink' }
  if (!st.isDirectory()) return { ok: false, refusal: 'root_not_directory' }
  try { if (fs.realpath(root) !== root) return { ok: false, refusal: 'root_not_canonical' } } catch { return { ok: false, refusal: 'root_missing' } }

  const layout = await runner.run(gitCommands.layout(root))
  if (layout.exitCode === null) return { ok: false, refusal: 'git_unavailable' }
  if (layout.exitCode !== 0) return { ok: false, refusal: 'not_a_git_repository' }
  const [toplevel, gitDir, commonDir, inside] = layout.stdout.split('\n')
  if (inside !== 'true' || toplevel !== root) return { ok: false, refusal: 'not_a_git_repository' }
  // The MAIN checkout only: its git dir is <root>/.git (a real directory) and equals the common dir.
  let dotGit: ReturnType<RepositoryFs['lstat']>
  try { dotGit = fs.lstat(`${root}/.git`) } catch { return { ok: false, refusal: 'not_main_checkout' } }
  if (dotGit.isSymbolicLink() || !dotGit.isDirectory()) return { ok: false, refusal: 'not_main_checkout' }
  if (gitDir !== `${root}/.git` || (commonDir !== '.git' && commonDir !== gitDir)) return { ok: false, refusal: 'not_main_checkout' }

  const config = await runner.run(gitCommands.localConfig(root))
  if (config.exitCode !== 0 || config.truncated) return { ok: false, refusal: 'unsafe_git_config' }
  const audit = auditGitConfig(config.stdout, repo.approvedRemote, repo.remoteIdentity)
  if (!audit.ok) {
    if (audit.refusal === 'remote_missing' || audit.refusal === 'remote_malformed' || audit.refusal === 'remote_identity_mismatch') return { ok: false, refusal: audit.refusal }
    return { ok: false, refusal: 'unsafe_git_config' }
  }
  return {
    ok: true, repositoryId: repo.repositoryId, rootRealpath: root, baseRef: repo.approvedBaseRef,
    rootHash: sha256Tagged('repository-root', root),
    remoteIdentityHash: sha256Tagged('remote-identity', `${repo.remoteIdentity.provider}:${repo.remoteIdentity.host}/${repo.remoteIdentity.owner}/${repo.remoteIdentity.name}`),
  }
}

export type BaseRefusal = 'pin_malformed' | 'pin_commit_missing' | 'base_ref_missing' | 'stale_base' | 'git_unavailable'
export type BaseProof =
  | { ok: true; pinnedBaseSha: string; observedBaseSha: string }
  | { ok: false; refusal: BaseRefusal; observedBaseSha?: string }

const SHA1 = /^[a-f0-9]{40}$/

/**
 * Exact pin or stop. No fetch, no network, no silent newer or older base: the approved base ref,
 * as it exists locally right now, must equal the pinned SHA, and that SHA must be a commit object.
 */
export async function proveBase(repo: LocalTrustedRepository, root: string, pinnedBaseSha: unknown, runner: InfraRunner): Promise<BaseProof> {
  if (typeof pinnedBaseSha !== 'string' || !SHA1.test(pinnedBaseSha)) return { ok: false, refusal: 'pin_malformed' }
  const type = await runner.run(gitCommands.objectType(root, pinnedBaseSha))
  if (type.exitCode === null) return { ok: false, refusal: 'git_unavailable' }
  if (type.exitCode !== 0 || type.stdout.trim() !== 'commit') return { ok: false, refusal: 'pin_commit_missing' }
  const pinned = await runner.run(gitCommands.resolveCommit(root, pinnedBaseSha))
  if (pinned.exitCode !== 0 || pinned.stdout.trim() !== pinnedBaseSha) return { ok: false, refusal: 'pin_commit_missing' }

  const observed = await runner.run(gitCommands.resolveCommit(root, repo.approvedBaseRef))
  if (observed.exitCode === null) return { ok: false, refusal: 'git_unavailable' }
  const observedSha = observed.stdout.trim()
  if (observed.exitCode !== 0 || !SHA1.test(observedSha)) return { ok: false, refusal: 'base_ref_missing' }
  if (observedSha !== pinnedBaseSha) return { ok: false, refusal: 'stale_base', observedBaseSha: observedSha }
  return { ok: true, pinnedBaseSha, observedBaseSha: observedSha }
}
