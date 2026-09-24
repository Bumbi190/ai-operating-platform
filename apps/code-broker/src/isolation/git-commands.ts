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

import { brokerCommand, GIT_ALLOWED_CONFIG_OVERRIDES, type InfraCommand } from './process-runner.js'

const SHA1 = /^[a-f0-9]{40}$/
const REF = /^refs\/(?:remotes|heads)\/[A-Za-z0-9._\/-]{1,200}$/
const BRANCH = /^sdf1\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const HARDENING: readonly string[] = Object.freeze([
  '--no-pager', '--no-optional-locks',
  ...Object.entries(GIT_ALLOWED_CONFIG_OVERRIDES).flatMap(([key, value]) => ['-c', `${key}=${value}`]),
])

function git(cwd: string, args: readonly string[], timeoutMs?: number): InfraCommand {
  return brokerCommand({ tool: 'git', argv: [...HARDENING, ...args], cwd, timeoutMs })
}

const requireSha = (sha: string) => { if (!SHA1.test(sha)) throw new Error('git command needs a lowercase 40-hex SHA'); return sha }
const requireRef = (ref: string) => { if (!REF.test(ref) || ref.includes('..') || ref.endsWith('/') || ref.endsWith('.lock')) throw new Error('git command needs a plain refs/… name'); return ref }

export const gitCommands = Object.freeze({
  /** Toplevel, git dir and common dir of the checkout at `root`. */
  layout: (root: string) => git(root, ['rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-common-dir', '--is-inside-work-tree']),
  /** The repository-local config only (no include following, no global/system files). */
  localConfig: (root: string) => git(root, ['config', '--local', '--list', '-z']),
  /** Object type of a full SHA. Never fetches (GIT_NO_LAZY_FETCH). */
  objectType: (root: string, sha: string) => git(root, ['cat-file', '-t', requireSha(sha)]),
  /** Resolves a full SHA, or a plain ref, to the COMMIT it names. */
  resolveCommit: (root: string, revision: string) => {
    const spec = SHA1.test(revision) ? revision : requireRef(revision)
    return git(root, ['rev-parse', '--verify', '--quiet', `${spec}^{commit}`])
  },
  refExists: (root: string, ref: string) => git(root, ['show-ref', '--verify', '--quiet', requireRef(ref)]),
  worktreeList: (root: string) => git(root, ['worktree', 'list', '--porcelain', '-z']),
  /**
   * THE mutation: create one isolated worktree, on one new branch, from one verified commit.
   * `--lock` marks it retained (explicit-cleanup-only): worktree pruning cannot reap it.
   */
  worktreeAdd: (root: string, branch: string, target: string, sha: string) => {
    if (!BRANCH.test(branch)) throw new Error('worktree branch must be sdf1/<uuid>')
    if (!target.startsWith('/') || target.includes('\0') || target.startsWith('-')) throw new Error('worktree target must be an absolute path')
    return git(root, ['worktree', 'add', '--quiet', '--lock', '--reason', 'omnira-sdf explicit-cleanup-only', '-b', branch, target, requireSha(sha)], 60_000)
  },
  head: (worktree: string) => git(worktree, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']),
  symbolicHead: (worktree: string) => git(worktree, ['symbolic-ref', '--quiet', 'HEAD']),
  status: (worktree: string) => git(worktree, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none']),
})
