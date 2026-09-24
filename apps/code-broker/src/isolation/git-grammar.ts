/**
 * SDF-1C3A — the EXACT Git command grammar. This is the single source of truth for what a Git
 * `InfraCommand` may be, and it is enforced at the lowest boundary (`brokerCommand` in
 * process-runner.ts), not merely by the builders in git-commands.ts.
 *
 * A Git command is valid only if its argv is
 *
 *     GIT_HARDENING_PREFIX  +  exactly ONE of the canonical operations below
 *
 * There is no "allowed subcommand + arbitrary trailing arguments": every operation is a finite,
 * fully specified argument list whose only variable parts are a validated 40-hex SHA, a validated
 * plain `refs/{remotes,heads}/…` name, and (for worktree add) a `sdf1/<uuid>` branch whose UUID
 * must also be the leaf of the absolute target path.
 *
 *   layout        rev-parse --show-toplevel --absolute-git-dir --git-common-dir --is-inside-work-tree
 *   localConfig   config --local --list -z
 *   objectType    cat-file -t <sha>
 *   resolveSha    rev-parse --verify --quiet <sha>^{commit}
 *   resolveRef    rev-parse --verify --quiet <refs/remotes|heads/…>^{commit}
 *   head          rev-parse --verify --quiet HEAD^{commit}
 *   refExists     show-ref --verify --quiet <refs/remotes|heads/…>
 *   worktreeList  worktree list --porcelain -z
 *   worktreeAdd   worktree add --quiet --lock --reason <fixed> -b sdf1/<uuid> <abs>/<uuid> <sha>
 *   symbolicHead  symbolic-ref --quiet HEAD                  (READ only; the mutating forms do not match)
 *   status        status --porcelain=v1 -z --untracked-files=all --ignore-submodules=none
 *
 * Nothing else can be a Git command: no fetch/pull/push/commit/merge/rebase/clone/checkout/switch/
 * reset/restore/remote/submodule/branch/tag/stash/update-ref, no `cat-file --filters|--textconv|
 * --batch*` (which can run configured drivers), no arbitrary `rev-parse`/`config` mode, no
 * symbolic-ref mutation, no worktree remove/prune/move/lock/repair, no cleanup, no network.
 */

/** Broker-owned execution-hardening overrides. The ONLY `-c` values a Git command may carry. */
export const GIT_ALLOWED_CONFIG_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  'core.hooksPath': '/dev/null',
  'core.fsmonitor': 'false',
  'credential.helper': '',
  'core.sshCommand': '/usr/bin/false',
  'core.askPass': '/usr/bin/false',
  'protocol.allow': 'never',
  'gc.auto': '0',
  'maintenance.auto': 'false',
  'core.untrackedCache': 'false',
  'advice.detachedHead': 'false',
  'submodule.recurse': 'false',
})

/** Exactly what every Git command must begin with, in this order, with no additions. */
export const GIT_HARDENING_PREFIX: readonly string[] = Object.freeze([
  '--no-pager', '--no-optional-locks',
  ...Object.entries(GIT_ALLOWED_CONFIG_OVERRIDES).flatMap(([key, value]) => ['-c', `${key}=${value}`]),
])

/** Fixed, broker-owned reason recorded on the retained (locked) worktree. */
export const WORKTREE_LOCK_REASON = 'omnira-sdf explicit-cleanup-only' as const

export const SHA1_HEX = /^[a-f0-9]{40}$/
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const BRANCH = new RegExp(`^sdf1/(${UUID})$`)
const REF = /^refs\/(?:remotes|heads)\/[A-Za-z0-9._\/-]{1,200}$/

/** A plain, absolute-safe ref name: no traversal, no empty/hidden segment, no `.lock`, no trailing slash. */
export function isPlainRef(value: unknown): value is string {
  return typeof value === 'string' && REF.test(value) && !value.includes('..') && !value.includes('//') && !value.includes('/.')
    && !value.endsWith('/') && !value.endsWith('.lock') && !value.endsWith('.')
}

export function isFullSha(value: unknown): value is string { return typeof value === 'string' && SHA1_HEX.test(value) }

/** `sdf1/<uuid>` → the UUID, else null. */
export function worktreeBranchUuid(branch: unknown): string | null {
  const match = typeof branch === 'string' ? BRANCH.exec(branch) : null
  return match ? match[1] : null
}

/** Absolute, canonical-looking path whose LEAF is the given UUID: no `.`/`..`/empty segment, no odd characters. */
export function isWorktreeTargetFor(target: unknown, uuid: string): boolean {
  if (typeof target !== 'string' || !target.startsWith('/') || target.length > 1024) return false
  const segments = target.slice(1).split('/')
  if (segments.length < 2) return false
  if (segments[segments.length - 1] !== uuid) return false
  return segments.every(segment => segment !== '' && segment !== '.' && segment !== '..' && /^[A-Za-z0-9_.@+-]+$/.test(segment))
}

export type GitOperation =
  | 'layout' | 'localConfig' | 'objectType' | 'resolveSha' | 'resolveRef' | 'head' | 'refExists'
  | 'worktreeList' | 'worktreeAdd' | 'symbolicHead' | 'status'

export const GIT_OPERATIONS: readonly GitOperation[] = Object.freeze([
  'layout', 'localConfig', 'objectType', 'resolveSha', 'resolveRef', 'head', 'refExists', 'worktreeList', 'worktreeAdd', 'symbolicHead', 'status',
])

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((token, i) => token === b[i])

const LAYOUT = Object.freeze(['rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-common-dir', '--is-inside-work-tree'])
const LOCAL_CONFIG = Object.freeze(['config', '--local', '--list', '-z'])
const WORKTREE_LIST = Object.freeze(['worktree', 'list', '--porcelain', '-z'])
const SYMBOLIC_HEAD = Object.freeze(['symbolic-ref', '--quiet', 'HEAD'])
const STATUS = Object.freeze(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none'])

/** The operation the FULL argv (prefix included) denotes, or null when it is anything else. */
export function matchGitOperation(argv: readonly string[]): GitOperation | null {
  if (argv.length <= GIT_HARDENING_PREFIX.length || !GIT_HARDENING_PREFIX.every((token, i) => argv[i] === token)) return null
  const rest = argv.slice(GIT_HARDENING_PREFIX.length)

  if (same(rest, LAYOUT)) return 'layout'
  if (same(rest, LOCAL_CONFIG)) return 'localConfig'
  if (same(rest, WORKTREE_LIST)) return 'worktreeList'
  if (same(rest, SYMBOLIC_HEAD)) return 'symbolicHead'
  if (same(rest, STATUS)) return 'status'

  if (rest.length === 3 && rest[0] === 'cat-file' && rest[1] === '-t' && isFullSha(rest[2])) return 'objectType'

  if (rest.length === 4 && rest[0] === 'rev-parse' && rest[1] === '--verify' && rest[2] === '--quiet') {
    const spec = rest[3]
    if (spec === 'HEAD^{commit}') return 'head'
    if (spec.endsWith('^{commit}')) {
      const name = spec.slice(0, -'^{commit}'.length)
      if (isFullSha(name)) return 'resolveSha'
      if (isPlainRef(name)) return 'resolveRef'
    }
    return null
  }

  if (rest.length === 4 && rest[0] === 'show-ref' && rest[1] === '--verify' && rest[2] === '--quiet' && isPlainRef(rest[3])) return 'refExists'

  if (rest.length === 10 && rest[0] === 'worktree' && rest[1] === 'add' && rest[2] === '--quiet' && rest[3] === '--lock'
      && rest[4] === '--reason' && rest[5] === WORKTREE_LOCK_REASON && rest[6] === '-b') {
    const uuid = worktreeBranchUuid(rest[7])
    if (uuid && isWorktreeTargetFor(rest[8], uuid) && isFullSha(rest[9])) return 'worktreeAdd'
  }
  return null
}
