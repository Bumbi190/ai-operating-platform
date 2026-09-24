/**
 * SDF-1C3A — the closed set of Git commands the broker can emit. Every argv is produced here from
 * broker-owned constants plus validated scalar inputs (a 40-hex SHA, a UUID-derived branch name,
 * an already-verified absolute path). Nothing arbitrary can be smuggled in: the runner validates
 * again at creation, and fetch/pull/push/commit/merge/rebase/clone/checkout/remote are refused by
 * the runner's allowlist so they cannot be emitted even by mistake.
 *
 * Every command carries the same execution-hardening overrides, which neutralize the Git features
 * that can launch a program on their own: hooks (post-checkout runs during `worktree add`),
 * fsmonitor, credential helpers, ssh/askpass, protocols (no network of any kind) and gc.
 */

import { GIT_HARDENING_PREFIX, WORKTREE_LOCK_REASON, isFullSha, isPlainRef, isWorktreeTargetFor, worktreeBranchUuid } from './git-grammar.js'
import { brokerCommand, type InfraCommand } from './process-runner.js'

function git(cwd: string, args: readonly string[], timeoutMs?: number): InfraCommand {
  return brokerCommand({ tool: 'git', argv: [...GIT_HARDENING_PREFIX, ...args], cwd, timeoutMs })
}

const requireSha = (sha: string) => { if (!isFullSha(sha)) throw new Error('git command needs a lowercase 40-hex SHA'); return sha }
const requireRef = (ref: string) => { if (!isPlainRef(ref)) throw new Error('git command needs a plain refs/… name'); return ref }

export const gitCommands = Object.freeze({
  /** Toplevel, git dir and common dir of the checkout at `root`. */
  layout: (root: string) => git(root, ['rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-common-dir', '--is-inside-work-tree']),
  /** The repository-local config only (no include following, no global/system files). */
  localConfig: (root: string) => git(root, ['config', '--local', '--list', '-z']),
  /** Object type of a full SHA. Never fetches (GIT_NO_LAZY_FETCH). */
  objectType: (root: string, sha: string) => git(root, ['cat-file', '-t', requireSha(sha)]),
  /** Resolves a full SHA, or a plain ref, to the COMMIT it names. */
  resolveCommit: (root: string, revision: string) => {
    const spec = isFullSha(revision) ? revision : requireRef(revision)
    return git(root, ['rev-parse', '--verify', '--quiet', `${spec}^{commit}`])
  },
  refExists: (root: string, ref: string) => git(root, ['show-ref', '--verify', '--quiet', requireRef(ref)]),
  worktreeList: (root: string) => git(root, ['worktree', 'list', '--porcelain', '-z']),
  /**
   * THE mutation: create one isolated worktree, on one new branch, from one verified commit.
   * `--lock` marks it retained (explicit-cleanup-only): worktree pruning cannot reap it.
   */
  worktreeAdd: (root: string, branch: string, target: string, sha: string) => {
    const uuid = worktreeBranchUuid(branch)
    if (!uuid) throw new Error('worktree branch must be sdf1/<uuid>')
    if (!isWorktreeTargetFor(target, uuid)) throw new Error('worktree target must be an absolute path ending in the same uuid')
    return git(root, ['worktree', 'add', '--quiet', '--lock', '--reason', WORKTREE_LOCK_REASON, '-b', branch, target, requireSha(sha)], 60_000)
  },
  head: (worktree: string) => git(worktree, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']),
  symbolicHead: (worktree: string) => git(worktree, ['symbolic-ref', '--quiet', 'HEAD']),
  status: (worktree: string) => git(worktree, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none']),
})
