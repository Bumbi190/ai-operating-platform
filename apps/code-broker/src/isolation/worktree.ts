/**
 * SDF-1C3A — isolated host worktree preparation.
 *
 * Input is ONLY trusted structured values (workId, repositoryId, pinnedBaseSha). The caller never
 * chooses a branch name, a directory, a parent, a Git argument or an executable:
 *
 *   branch    = <approvedBranchPrefix><workId>          (sdf1/<uuid>)
 *   directory = <approvedWorktreeParent>/<workId>
 *
 * Sequence: input → registry → repository proof → pinned/stale base proof → identity/collision
 * checks → ONE bounded worktree-add from the verified pinned commit → re-verification.
 *
 * No fetch, no pull, no commit/merge/rebase/push, no remote mutation, no checkout of an arbitrary
 * ref, no network. The runner cannot emit those commands at all.
 *
 * RETENTION (`explicit_cleanup_only`): production code in this phase NEVER deletes a worktree,
 * including one that fails verification. A worktree that exists after the add is treated as a
 * retained workspace (it is created `--lock`ed so worktree pruning cannot reap it) and the
 * failure result says `workspaceRetained: true`. Proven-safe cleanup is a later, explicit action.
 * The only deletions in the test suite are of the synthetic fixture directories the tests made.
 */

import { lstatSync, realpathSync } from 'node:fs'
import { gitCommands } from './git-commands.js'
import { sha256Tagged } from './hash.js'
import type { InfraRunner } from './process-runner.js'
import { lookupLocalRepository, type LocalTrustedRepository } from './registry.js'
import { proveBase, proveRepository, type RepositoryFs } from './repository-proof.js'
import { verifyCanonicalDirectory } from './fs-containment.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export interface PrepareWorktreeInput { workId: string; repositoryId: string; pinnedBaseSha: string }

export type PrepareRefusalCode =
  | 'input_invalid' | 'repository_unknown'
  | 'root_missing' | 'root_is_symlink' | 'root_not_directory' | 'root_not_canonical' | 'git_unavailable'
  | 'not_a_git_repository' | 'not_main_checkout' | 'unsafe_git_config' | 'remote_missing' | 'remote_malformed'
  | 'remote_identity_mismatch' | 'pin_malformed' | 'pin_commit_missing' | 'base_ref_missing'
  | 'worktree_parent_invalid' | 'target_exists' | 'target_uncertain' | 'branch_exists' | 'branch_uncertain'
  | 'worktree_conflict' | 'worktree_list_unreadable'

export type PrepareFailureCode =
  | 'worktree_add_failed' | 'worktree_path_escaped' | 'head_mismatch' | 'branch_mismatch' | 'workspace_dirty'
  | 'repository_changed' | 'verification_unavailable'

export type PrepareResult =
  | {
      status: 'prepared'
      workId: string; repositoryId: string; pinnedBaseSha: string; observedBaseSha: string
      branchName: string; worktreePathHash: string; headSha: string; remoteIdentityHash: string
    }
  | { status: 'refused'; code: PrepareRefusalCode }
  | { status: 'stale_base'; code: 'stale_base'; pinnedBaseSha: string; observedBaseSha: string }
  | { status: 'failed'; code: PrepareFailureCode; workspaceRetained: boolean }

export interface WorktreeDeps {
  runner: InfraRunner
  /** Production: the closed registry. Tests inject a synthetic entry through the internal factory. */
  lookup?: (repositoryId: unknown) => LocalTrustedRepository | null
  fs?: RepositoryFs & { lstat(path: string): { isDirectory(): boolean; isSymbolicLink(): boolean } }
}

const exists = (path: string): 'yes' | 'no' | 'uncertain' => {
  try { lstatSync(path); return 'yes' } catch (error) { return (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? 'no' : 'uncertain' }
}

function validInput(input: unknown): input is PrepareWorktreeInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const keys = Object.keys(input as object).sort()
  if (keys.join(',') !== 'pinnedBaseSha,repositoryId,workId') return false
  const v = input as Record<string, unknown>
  return typeof v.workId === 'string' && UUID.test(v.workId) && typeof v.repositoryId === 'string' && typeof v.pinnedBaseSha === 'string'
}

export async function prepareIsolatedWorktree(input: unknown, deps: WorktreeDeps): Promise<PrepareResult> {
  if (!validInput(input)) return { status: 'refused', code: 'input_invalid' }
  const repo = (deps.lookup ?? lookupLocalRepository)(input.repositoryId)
  if (!repo) return { status: 'refused', code: 'repository_unknown' }
  const { runner } = deps

  const proof = await proveRepository(repo, runner, deps.fs)
  if (!proof.ok) return { status: 'refused', code: proof.refusal }
  const root = proof.rootRealpath

  const base = await proveBase(repo, root, input.pinnedBaseSha, runner)
  if (!base.ok) {
    if (base.refusal === 'stale_base') return { status: 'stale_base', code: 'stale_base', pinnedBaseSha: input.pinnedBaseSha, observedBaseSha: base.observedBaseSha ?? '' }
    return { status: 'refused', code: base.refusal }
  }

  // ── identity: derived ONLY from workId ─────────────────────────────────────────────────────
  const branchName = `${repo.approvedBranchPrefix}${input.workId}`
  if (!branchName.startsWith(repo.approvedBranchPrefix) || branchName.slice(repo.approvedBranchPrefix.length) !== input.workId) return { status: 'refused', code: 'input_invalid' }
  const parent = verifyCanonicalDirectory(repo.approvedWorktreeParent)
  if (!parent.ok) return { status: 'refused', code: 'worktree_parent_invalid' }
  const target = `${parent.value}/${input.workId}`

  const present = exists(target)                       // lstat: a dangling symlink counts as present
  if (present === 'yes') return { status: 'refused', code: 'target_exists' }
  if (present === 'uncertain') return { status: 'refused', code: 'target_uncertain' }

  const branchRef = `refs/heads/${branchName}`
  const branch = await runner.run(gitCommands.refExists(root, branchRef))
  if (branch.exitCode === 0) return { status: 'refused', code: 'branch_exists' }
  if (branch.exitCode !== 1) return { status: 'refused', code: 'branch_uncertain' }

  const list = await runner.run(gitCommands.worktreeList(root))
  if (list.exitCode !== 0 || list.truncated) return { status: 'refused', code: 'worktree_list_unreadable' }
  for (const entry of list.stdout.split('\0')) {
    if (entry === `worktree ${target}` || entry === `branch ${branchRef}`) return { status: 'refused', code: 'worktree_conflict' }
  }

  // ── the one mutation ───────────────────────────────────────────────────────────────────────
  const added = await runner.run(gitCommands.worktreeAdd(root, branchName, target, base.pinnedBaseSha))
  if (added.exitCode !== 0) return { status: 'failed', code: 'worktree_add_failed', workspaceRetained: exists(target) !== 'no' }

  // ── re-verification. Any failure leaves the workspace in place (explicit_cleanup_only). ─────
  const retained = (code: PrepareFailureCode): PrepareResult => ({ status: 'failed', code, workspaceRetained: true })
  const canonical = verifyCanonicalDirectory(target)
  if (!canonical.ok) return retained('worktree_path_escaped')
  let real: string
  try { real = realpathSync(target) } catch { return retained('verification_unavailable') }
  if (real !== target || !real.startsWith(`${parent.value}/`) || real.slice(parent.value.length + 1) !== input.workId) return retained('worktree_path_escaped')

  const head = await runner.run(gitCommands.head(target))
  if (head.exitCode === null) return retained('verification_unavailable')
  if (head.exitCode !== 0 || head.stdout.trim() !== base.pinnedBaseSha) return retained('head_mismatch')
  const symbolic = await runner.run(gitCommands.symbolicHead(target))
  if (symbolic.exitCode !== 0 || symbolic.stdout.trim() !== branchRef) return retained('branch_mismatch')
  const status = await runner.run(gitCommands.status(target))
  if (status.exitCode !== 0 || status.truncated) return retained('verification_unavailable')
  if (status.stdout !== '') return retained('workspace_dirty')
  const again = await proveRepository(repo, runner, deps.fs)
  if (!again.ok || again.remoteIdentityHash !== proof.remoteIdentityHash) return retained('repository_changed')

  return {
    status: 'prepared',
    workId: input.workId, repositoryId: repo.repositoryId,
    pinnedBaseSha: base.pinnedBaseSha, observedBaseSha: base.observedBaseSha,
    branchName, headSha: head.stdout.trim(),
    worktreePathHash: sha256Tagged('worktree-path', real),
    remoteIdentityHash: proof.remoteIdentityHash,
  }
}
