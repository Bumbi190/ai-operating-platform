/**
 * SDF-1C3A — trusted repository, isolated worktree and VM-sandbox SUBSTRATE (local broker only).
 *
 * No model, no patch, no CodeWork command, no repository content in any container, no server
 * route, no migration. Everything here uses SYNTHETIC temporary Git repositories; the real Omnira
 * checkout is never mutated. The only deletions are of the fixture directories these tests made.
 *
 * Real-Docker proofs live in sdf1c3-isolation-integration.test.ts.
 */
import { EventEmitter } from 'node:events'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OMNIRA_TRUSTED_REPOSITORY, normalizeGitHubRemote as webNormalizeRemote } from '@/lib/atlas/code-work/repository-registry'
import { SDF1_PATH_ENFORCEMENT_LEVEL, normalizeRepoRelativePath as webNormalizePath } from '@/lib/atlas/code-work/path-policy'
import { CODE_WORK_CAPABILITY } from '@/lib/atlas/code-work/capability'
import { OMNIRA_LOCAL_REPOSITORY, lookupLocalRepository, type LocalTrustedRepository } from '../../../code-broker/src/isolation/registry'
import { normalizeGitHubRemote } from '../../../code-broker/src/isolation/remote-identity'
import { TRUSTED_TOOL_CANDIDATES, explainToolCandidates, isTrustedTool, resolveTrustedTool } from '../../../code-broker/src/isolation/toolchain'
import {
  DOCKER_FORBIDDEN_SUBCOMMANDS, GIT_ALLOWED_CONFIG_OVERRIDES, GIT_FORBIDDEN_SUBCOMMANDS, GIT_HARDENING_PREFIX, InfraCommandRefused, brokerCommand,
  buildDockerEnv, buildGitEnv, createInfraRunner, createIsolatedHome, disposeIsolatedHome, isBrokerCommand,
} from '../../../code-broker/src/isolation/process-runner'
import { gitCommands } from '../../../code-broker/src/isolation/git-commands'
import { GIT_OPERATIONS, isPlainRef, isWorktreeTargetFor, matchGitOperation, worktreeBranchUuid } from '../../../code-broker/src/isolation/git-grammar'
import { auditGitConfig, parseGitConfigZ } from '../../../code-broker/src/isolation/git-config-audit'
import * as containment from '../../../code-broker/src/isolation/fs-containment'
import {
  FILESYSTEM_RESIDUAL_RISK, FILESYSTEM_WRITES_ENABLED, normalizeRelativePath, openForReadNoFollow, verifyCanonicalDirectory, verifyCreatePath, verifyExistingPath,
} from '../../../code-broker/src/isolation/fs-containment'
import { classifyDockerInfo, dockerCommands, dockerSocketCandidates, resolveDockerSocket, satisfiesProductionIsolation } from '../../../code-broker/src/isolation/docker-host'
import {
  SANDBOX_PROBE_IMAGE, SANDBOX_PROBE_IMAGE_DIGEST, SANDBOX_SPEC, buildProbeCreateCommand, newProbeName, verifyProbeContainerInspect,
} from '../../../code-broker/src/isolation/sandbox-spec'
import { runSandboxHealthProbe } from '../../../code-broker/src/isolation/sandbox-probe'
import { createIsolationSubstrateForTests } from '../../../code-broker/src/isolation/substrate'
import type { InfraCommand, InfraResult, InfraRunner } from '../../../code-broker/src/isolation/process-runner'

const ROOT = resolve(__dirname, '../../../..')
/** Source with comments removed, so scans judge CODE, not the prose that explains what the code forbids. */
const code = (path: string) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(line => line.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n')
/** A properly hardened Git argv: the mandatory prefix + one operation's arguments. */
const hg = (...rest: string[]) => [...GIT_HARDENING_PREFIX, ...rest]
const HEAD_ARGV = hg('rev-parse', '--verify', '--quiet', 'HEAD^{commit}')
const LETTERED = 'abcdef00-0000-4000-8000-00000000000a'      // has hex letters, so upper-casing really changes it
const ISO = resolve(ROOT, 'apps/code-broker/src/isolation')
const WORK = '50000000-0000-4000-8000-000000000001'
const WORK_2 = '50000000-0000-4000-8000-000000000002'
const REPO_ID = OMNIRA_LOCAL_REPOSITORY.repositoryId
const GOOD_REMOTE = 'https://github.com/Bumbi190/ai-operating-platform.git'

// ── synthetic repositories ────────────────────────────────────────────────────────────────────
const cleanups: Array<() => void> = []
afterEach(() => { while (cleanups.length) cleanups.pop()!() })

const gitEnv = { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', HOME: '/nonexistent' }
const g = (cwd: string, ...args: string[]) => execFileSync('/usr/bin/git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, env: gitEnv as unknown as NodeJS.ProcessEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

interface Fixture { base: string; root: string; parent: string; sha1: string; sha2: string; repo: LocalTrustedRepository }
function makeFixture(over: Partial<LocalTrustedRepository> = {}): Fixture {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'sdf1c3-fx-')))
  cleanups.push(() => rmSync(base, { recursive: true, force: true }))       // fixture-only cleanup
  const root = join(base, 'repo')
  const parent = join(base, 'worktrees')
  mkdirSync(root); mkdirSync(parent)
  g(root, 'init', '-q', '-b', 'main')
  writeFileSync(join(root, 'a.txt'), 'one\n')
  g(root, 'add', 'a.txt'); g(root, 'commit', '-q', '-m', 'one')
  const sha1 = g(root, 'rev-parse', 'HEAD')
  writeFileSync(join(root, 'b.txt'), 'two\n')
  g(root, 'add', 'b.txt'); g(root, 'commit', '-q', '-m', 'two')
  const sha2 = g(root, 'rev-parse', 'HEAD')
  g(root, 'remote', 'add', 'origin', GOOD_REMOTE)
  g(root, 'update-ref', 'refs/remotes/origin/main', sha2)
  const repo: LocalTrustedRepository = { ...OMNIRA_LOCAL_REPOSITORY, approvedLocalRoot: root, approvedWorktreeParent: parent, ...over }
  return { base, root, parent, sha1, sha2, repo }
}
function substrate(fx: Fixture) {
  const s = createIsolationSubstrateForTests({ repositories: { [REPO_ID]: fx.repo }, docker: null, dockerSocketPath: null })
  cleanups.push(() => s.dispose())
  return s
}
const input = (fx: Fixture, over: Record<string, unknown> = {}) => ({ workId: WORK, repositoryId: REPO_ID, pinnedBaseSha: fx.sha2, ...over })

// ── fake spawn (no real process) ──────────────────────────────────────────────────────────────
interface SpawnCall { file: string; args: string[]; options: Record<string, any> }
function fakeSpawn(script: (child: any, call: SpawnCall) => void) {
  const calls: SpawnCall[] = []
  const impl = ((file: string, args: string[], options: Record<string, any>) => {
    const call = { file, args, options }
    calls.push(call)
    const child: any = new EventEmitter()
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
    child.kill = vi.fn()
    queueMicrotask(() => script(child, call))
    return child
  }) as unknown as typeof import('node:child_process').spawn
  return { impl, calls }
}
const fakeGit = { tool: 'git' as const, path: '/usr/bin/git' }
/** Ancestor view for POSITIVE toolchain cases: temp dirs live under a world-writable /tmp on Linux (correctly refused by the real check), so fixtures pin ancestors as ordinary directories. The negative ancestor case uses the real filesystem. */
const ordinaryAncestors = { lstat: () => ({ isDirectory: () => true, mode: 0o040755 }) } as const
function forge<T extends object>(value: T): T { return { ...value } }

describe('SDF-1C3A registry, parity and canonical requirements', () => {
  it('mirrors the canonical web registry value for value (drift fails CI)', () => {
    const web = OMNIRA_TRUSTED_REPOSITORY
    expect(OMNIRA_LOCAL_REPOSITORY.repositoryId).toBe(web.repositoryId)
    expect(OMNIRA_LOCAL_REPOSITORY.remoteIdentity).toEqual(web.remoteIdentity)
    expect(OMNIRA_LOCAL_REPOSITORY.approvedLocalRoot).toBe(web.approvedLocalRoot)
    expect(OMNIRA_LOCAL_REPOSITORY.approvedWorktreeParent).toBe(web.approvedWorktreeParent)
    expect(OMNIRA_LOCAL_REPOSITORY.approvedBranchPrefix).toBe(web.approvedBranchPrefix)
    expect(OMNIRA_LOCAL_REPOSITORY.approvedRemote).toBe(web.approvedRemote)
    expect([OMNIRA_LOCAL_REPOSITORY.approvedBaseRef]).toEqual([...web.approvedBaseRefs])
    expect(web.cleanupPolicy).toBe('explicit_action_only')
    expect(Object.isFrozen(OMNIRA_LOCAL_REPOSITORY)).toBe(true)
  })

  it('is closed: exactly one repository, no arbitrary or inherited lookups', () => {
    expect(lookupLocalRepository(REPO_ID)).toBe(OMNIRA_LOCAL_REPOSITORY)
    for (const id of ['github.com/other/repo', '', 'constructor', '__proto__', 'toString', 5, null, undefined, { repositoryId: REPO_ID }, ['x']]) expect(lookupLocalRepository(id)).toBeNull()
  })

  it('normalizes remotes exactly like the canonical web implementation over a hostile corpus', () => {
    const corpus = [
      GOOD_REMOTE, 'https://github.com/bumbi190/ai-operating-platform', 'git@github.com:Bumbi190/ai-operating-platform.git', 'ssh://git@github.com/Bumbi190/ai-operating-platform.git',
      'https://user:pw@github.com/a/b.git', 'https://github.com:8443/a/b.git', 'http://github.com/a/b.git', 'https://evil.example/a/b.git', 'https://github.com/a/b/c.git',
      'https://github.com/a/b.git?x=1', 'https://github.com/a/b.git#f', ' https://github.com/a/b.git', 'https://github.com/a/b.git\0', '', 'git@github.com:a/b/c', 'git@evil.com:a/b.git',
      'file:///tmp/repo', '/tmp/repo', 'https://github.com/a b/c.git', 'https://github.com/../etc.git', 'ssh://root@github.com/a/b.git', 5, null,
    ]
    for (const remote of corpus) expect(normalizeGitHubRemote(remote), String(remote)).toEqual(webNormalizeRemote(remote))
  })

  it('keeps the canonical isolation requirements the spec must satisfy', () => {
    expect(CODE_WORK_CAPABILITY.isolationRequirements).toMatchObject({ vmBackedLinux: true, executionNetwork: 'denied', executionSecrets: 'none', worktreeRetention: 'explicit_cleanup_only' })
    expect(CODE_WORK_CAPABILITY.allowedOperationFamilies).toEqual(expect.arrayContaining(['repository.inspect_readonly', 'worktree.prepare_isolated']))
    for (const forbidden of ['git.commit', 'git.push', 'pull_request.mutate', 'git.merge', 'deployment.execute', 'shell.arbitrary', 'network.arbitrary', 'credential.access', 'authority.mutate', 'policy.mutate', 'repository.multi_mutate']) {
      expect(CODE_WORK_CAPABILITY.forbiddenOperationFamilies).toContain(forbidden)
    }
    expect(SANDBOX_SPEC.network).toBe('none')                       // executionNetwork: denied
    expect(SANDBOX_SPEC.secrets).toBe('none')                       // executionSecrets: none
    expect(Object.keys(SANDBOX_SPEC.env).sort()).toEqual(['HOME', 'LANG'])
  })

  it('does not claim the web path policy is symlink-safe (it stays lexical-only)', () => {
    expect(SDF1_PATH_ENFORCEMENT_LEVEL).toBe('lexical_only_not_symlink_safe')
    expect(FILESYSTEM_WRITES_ENABLED).toBe(false)
    expect(FILESYSTEM_RESIDUAL_RISK).toMatch(/ancestor_directory_swap/)
  })
})

describe('SDF-1C3A trusted toolchain: git and docker are never chosen by a caller', () => {
  it('resolves only from fixed absolute candidates and issues an unforgeable-by-shape tool', () => {
    for (const list of Object.values(TRUSTED_TOOL_CANDIDATES)) for (const path of list) expect(path.startsWith('/')).toBe(true)
    const git = resolveTrustedTool('git')
    expect(git && isTrustedTool(git)).toBe(true)
    expect(git!.path.startsWith('/')).toBe(true)
    expect(isTrustedTool({ tool: 'git', path: git!.path })).toBe(false)     // same shape, not issued
    expect(Object.isFrozen(git)).toBe(true)
  })

  it('refuses relative, missing, non-regular, non-executable, group/other-writable, foreign-owned and unsafe-ancestor candidates', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'sdf1c3-tool-')))
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    const make = (name: string, mode: number) => { const p = join(dir, name); writeFileSync(p, '#!/bin/sh\n'); chmodSync(p, mode); return p }
    const good = make('good', 0o755)
    chmodSync(dir, 0o755)
    const cases: Record<string, [string, string]> = {
      relative: ['git', 'not_absolute'], missing: [join(dir, 'nope'), 'missing'], directory: [dir, 'not_regular_file'],
      noexec: [make('noexec', 0o644), 'not_executable'], groupw: [make('groupw', 0o775), 'group_or_other_writable'], otherw: [make('otherw', 0o757), 'group_or_other_writable'],
    }
    for (const [label, [path, reason]] of Object.entries(cases)) expect(explainToolCandidates('git', { candidates: { git: [path] } })[0].reason, label).toBe(reason)
    expect(explainToolCandidates('git', { candidates: { git: [good] }, ...ordinaryAncestors })[0].reason).toBeNull()
    expect(explainToolCandidates('git', { candidates: { git: [good] }, uid: (process.getuid?.() ?? 0) + 4242, ...ordinaryAncestors })[0].reason).toBe('untrusted_owner' satisfies string)
    const open = join(dir, 'open'); mkdirSync(open); chmodSync(open, 0o777)
    const inside = join(open, 'tool'); writeFileSync(inside, '#!/bin/sh\n'); chmodSync(inside, 0o755)
    expect(explainToolCandidates('git', { candidates: { git: [inside] } })[0].reason).toBe('other_writable_ancestor')
    expect(resolveTrustedTool('git', { candidates: { git: [cases.relative[0], cases.missing[0], cases.groupw[0]] } })).toBeNull()
    chmodSync(open, 0o755)
  })

  it('follows a symlink to its real target and judges the target (a link cannot launder trust)', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'sdf1c3-tool-')))
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    const real = join(dir, 'real'); writeFileSync(real, '#!/bin/sh\n'); chmodSync(real, 0o775)
    const link = join(dir, 'link'); symlinkSync(real, link)
    expect(resolveTrustedTool('git', { candidates: { git: [link] }, ...ordinaryAncestors })).toBeNull()
    chmodSync(real, 0o755)
    expect(resolveTrustedTool('git', { candidates: { git: [link] }, ...ordinaryAncestors })?.path).toBe(real)
  })

  it('the runner refuses a tool object that did not come from the resolver', async () => {
    const { impl, calls } = fakeSpawn(child => child.emit('close', 0, null))
    const home = createIsolatedHome(); cleanups.push(() => disposeIsolatedHome(home))
    const runner = createInfraRunner({ isolatedHome: home, git: forge(fakeGit) as never, docker: null, dockerSocketPath: null, spawnImpl: impl })
    expect(() => runner.run(gitCommands.head('/tmp'))).toThrow(/tool_unavailable/)
    expect(calls).toHaveLength(0)
  })
})

describe('SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment', () => {
  const home = createIsolatedHome()
  const trusted = resolveTrustedTool('git')!
  afterEach(() => { vi.unstubAllEnvs() })

  it('the closed git vocabulary refuses every forbidden subcommand and everything not allowlisted', () => {
    for (const sub of GIT_FORBIDDEN_SUBCOMMANDS) expect(() => brokerCommand({ tool: 'git', argv: hg(sub, 'x') }), sub).toThrow(InfraCommandRefused)
    for (const sub of ['fetch', 'pull', 'push', 'commit', 'merge', 'rebase', 'clone', 'checkout', 'remote', 'reset', 'submodule']) {
      expect(() => brokerCommand({ tool: 'git', argv: hg(sub) })).toThrow(/git_subcommand_forbidden/)
    }
    for (const sub of ['log', 'diff', 'grep', 'blame', 'archive', 'bundle', 'hash-object', 'ls-tree', 'unknown']) expect(() => brokerCommand({ tool: 'git', argv: hg(sub) }), sub).toThrow(/git_subcommand_not_allowed/)
    expect(() => brokerCommand({ tool: 'git', argv: hg('worktree', 'remove', '--force', '/x') })).toThrow(/worktree_action_not_allowed/)
    expect(() => brokerCommand({ tool: 'git', argv: hg('worktree', 'prune') })).toThrow(/worktree_action_not_allowed/)
    expect(() => brokerCommand({ tool: 'git', argv: hg('config', '--global', '--list') })).toThrow(/git_config_mode_not_allowed/)
    expect(() => brokerCommand({ tool: 'git', argv: hg('config', 'core.hooksPath', '/tmp/x') })).toThrow(/git_config_mode_not_allowed/)
    expect(() => brokerCommand({ tool: 'git', argv: hg('rev-parse', 'HEAD') })).toThrow(/git_operation_not_canonical/)     // allowed subcommand, non-canonical arguments
    for (const sub of GIT_FORBIDDEN_SUBCOMMANDS) expect(() => brokerCommand({ tool: 'git', argv: [sub] }), `bare ${sub}`).toThrow(/git_hardening_prefix_required/)
  })

  it('rejects unlisted global options, unlisted -c overrides and injected option-like arguments', () => {
    expect(() => brokerCommand({ tool: 'git', argv: ['--git-dir=/etc', 'rev-parse'] })).toThrow(/git_hardening_prefix_required/)
    expect(() => brokerCommand({ tool: 'git', argv: [...GIT_HARDENING_PREFIX, '--git-dir=/etc', 'rev-parse'] })).toThrow(/git_global_option_not_allowed/)
    expect(() => brokerCommand({ tool: 'git', argv: [...GIT_HARDENING_PREFIX, '--exec-path=/tmp', 'rev-parse'] })).toThrow(InfraCommandRefused)
    expect(() => brokerCommand({ tool: 'git', argv: [...GIT_HARDENING_PREFIX, '-c', 'core.hooksPath=/tmp/evil', 'rev-parse', 'HEAD'] })).toThrow(/git_global_option_not_allowed/)
    expect(() => brokerCommand({ tool: 'git', argv: ['-c', 'core.hooksPath=/tmp/evil', 'rev-parse', 'HEAD'] })).toThrow(/git_hardening_prefix_required/)
    expect(() => brokerCommand({ tool: 'git', argv: hg('rev-parse', '--git-dir=/etc') })).toThrow(/git_operation_not_canonical/)
    expect(() => brokerCommand({ tool: 'git', argv: hg('rev-parse', '--work-tree=/') })).toThrow(/git_operation_not_canonical/)
    expect(() => brokerCommand({ tool: 'git', argv: [] })).toThrow(/argv_shape/)
    expect(() => brokerCommand({ tool: 'git', argv: hg('rev-parse', 'a\0b') })).toThrow(/argv_element/)
    expect(() => brokerCommand({ tool: 'git', argv: hg('rev-parse', 'x'.repeat(5000)) })).toThrow(/argv_element/)
    expect(() => brokerCommand({ tool: 'sh' as never, argv: ['-c', 'id'] })).toThrow(/tool_not_allowed/)
    expect(() => brokerCommand({ tool: 'bash' as never, argv: ['-c', 'id'] })).toThrow(/tool_not_allowed/)
    expect(() => brokerCommand({ tool: 'git', argv: HEAD_ARGV, cwd: 'relative/dir' })).toThrow(/cwd_not_absolute/)
  })

  it('caller-supplied git values cannot inject argv through the closed builders', () => {
    const root = '/tmp/x'
    for (const bad of ['--upload-pack=evil', '-c', 'HEAD', 'a'.repeat(39), 'A'.repeat(40), `${'a'.repeat(40)} `, `${'a'.repeat(40)}\n`, `${'a'.repeat(39)}g`, '-'.repeat(40)]) {
      expect(() => gitCommands.objectType(root, bad), bad).toThrow()
      expect(() => gitCommands.resolveCommit(root, bad), bad).toThrow()
      expect(() => gitCommands.worktreeAdd(root, `sdf1/${WORK}`, `/tmp/wt/${WORK}`, bad), bad).toThrow()
    }
    for (const bad of ['main', 'refs/../x', 'refs/heads/', 'refs/heads/x.lock', '-refs/heads/x', 'refs/tags/v1', 'refs/remotes/origin/main --exec']) expect(() => gitCommands.refExists(root, bad), bad).toThrow()
    for (const branch of ['main', 'sdf1/not-a-uuid', 'sdf1/../x', `sdf2/${WORK}`, `sdf1/${WORK}/x`, '-b', `sdf1/${LETTERED.toUpperCase()}`]) expect(() => gitCommands.worktreeAdd(root, branch, `/tmp/wt/${WORK}`, 'a'.repeat(40)), branch).toThrow()
    for (const target of ['relative', '-x', '/tmp/a\0b', '/tmp/wt', `/tmp/wt/${WORK_2}`, `/tmp/../wt/${WORK}`]) expect(() => gitCommands.worktreeAdd(root, `sdf1/${WORK}`, target, 'a'.repeat(40)), target).toThrow()
  })

  it('every emitted git command carries the execution-hardening overrides and no forbidden verb', () => {
    const all: InfraCommand[] = [
      gitCommands.layout('/r'), gitCommands.localConfig('/r'), gitCommands.objectType('/r', 'a'.repeat(40)), gitCommands.resolveCommit('/r', 'a'.repeat(40)),
      gitCommands.resolveCommit('/r', 'refs/remotes/origin/main'), gitCommands.refExists('/r', 'refs/heads/x'), gitCommands.worktreeList('/r'),
      gitCommands.worktreeAdd('/r', `sdf1/${WORK}`, `/w/${WORK}`, 'a'.repeat(40)), gitCommands.head('/w'), gitCommands.symbolicHead('/w'), gitCommands.status('/w'),
    ]
    for (const command of all) {
      expect(isBrokerCommand(command)).toBe(true)
      for (const [key, value] of Object.entries(GIT_ALLOWED_CONFIG_OVERRIDES)) expect(command.argv).toContain(`${key}=${value}`)
      expect(command.argv.slice(0, 2)).toEqual(['--no-pager', '--no-optional-locks'])
      expect(command.argv.some(arg => GIT_FORBIDDEN_SUBCOMMANDS.includes(arg))).toBe(false)
      expect(command.tool).toBe('git')
    }
    expect(GIT_ALLOWED_CONFIG_OVERRIDES['core.hooksPath']).toBe('/dev/null')
    const add = gitCommands.worktreeAdd('/r', `sdf1/${WORK}`, `/w/${WORK}`, 'a'.repeat(40)).argv
    expect(add.slice(add.indexOf('worktree'))).toEqual(['worktree', 'add', '--quiet', '--lock', '--reason', 'omnira-sdf explicit-cleanup-only', '-b', `sdf1/${WORK}`, `/w/${WORK}`, 'a'.repeat(40)])
  })

  it('only a broker-made command can run, and run() takes nothing but the command (no env, args or executable)', async () => {
    const { impl, calls } = fakeSpawn(child => child.emit('close', 0, null))
    const runner = createInfraRunner({ isolatedHome: home, git: trusted, docker: null, dockerSocketPath: null, spawnImpl: impl })
    expect(() => runner.run({ tool: 'git', argv: ['rev-parse', 'HEAD'], cwd: '/tmp', timeoutMs: 1, maxOutputBytes: 1 } as never)).toThrow(/not_a_broker_command/)
    expect(() => (runner.run as (...a: unknown[]) => unknown)(gitCommands.head('/tmp'), { env: { GIT_SSH_COMMAND: 'x' } })).toThrow(/run_takes_only_a_command/)
    expect(() => (runner.run as (...a: unknown[]) => unknown)(gitCommands.head('/tmp'), '/bin/sh')).toThrow(/run_takes_only_a_command/)
    expect(calls).toHaveLength(0)
    await runner.run(gitCommands.head('/tmp'))
    expect(calls).toHaveLength(1)
  })

  it('never enables a shell and runs exactly the trusted executable with direct argv', async () => {
    const { impl, calls } = fakeSpawn(child => child.emit('close', 0, null))
    const runner = createInfraRunner({ isolatedHome: home, git: trusted, docker: null, dockerSocketPath: null, spawnImpl: impl })
    await runner.run(gitCommands.resolveCommit('/tmp', 'a'.repeat(40)))
    const [call] = calls
    expect(call.options.shell).toBe(false)
    expect(call.file).toBe(trusted.path)
    expect(call.args).toContain('rev-parse')
    expect(call.options.stdio).toEqual(['ignore', 'pipe', 'pipe'])
    expect(call.options.detached).toBe(false)
    expect(call.file).not.toMatch(/\/(?:ba|z|da|k)?sh$/)
    const source = code(join(ISO, 'process-runner.ts'))
    expect(source).not.toMatch(/shell:\s*true|\/bin\/(?:ba|z|da)?sh\b.*-c|\bexec\(|execSync|execFileSync|spawnSync/)
  })

  it('does not inherit the parent environment: secrets in process.env never reach a child', async () => {
    const secrets: Record<string, string> = {
      ANTHROPIC_API_KEY: 'sk-ant-secret', OPENAI_API_KEY: 'sk-secret', SUPABASE_SERVICE_ROLE_KEY: 'srv-secret', VERCEL_TOKEN: 'v-secret',
      GITHUB_TOKEN: 'ghp_secret', GH_TOKEN: 'gh-secret', AWS_SECRET_ACCESS_KEY: 'aws-secret', AWS_ACCESS_KEY_ID: 'aws-id', SSH_AUTH_SOCK: '/tmp/agent.sock',
      GIT_ASKPASS: '/tmp/evil-askpass', GIT_SSH_COMMAND: 'evil', GIT_CONFIG_GLOBAL: '/tmp/evil-gitconfig', GIT_DIR: '/etc', GIT_WORK_TREE: '/', DOCKER_HOST: 'tcp://evil.example:2375',
      DOCKER_CONTEXT: 'evil', DOCKER_CONFIG: '/tmp/evil-docker', HOME: '/Users/someone', PATH: '/tmp/evil-bin:/usr/bin', LD_PRELOAD: '/tmp/evil.so', DYLD_INSERT_LIBRARIES: '/tmp/evil.dylib',
      NODE_OPTIONS: '--require /tmp/evil.js', GIT_EXEC_PATH: '/tmp/evil-exec', GIT_TRACE: '/tmp/trace', GIT_EXTERNAL_DIFF: '/tmp/evil-diff',
    }
    for (const [key, value] of Object.entries(secrets)) vi.stubEnv(key, value)
    const { impl, calls } = fakeSpawn(child => child.emit('close', 0, null))
    const sock = '/Users/x/.docker/run/docker.sock'
    const runner = createInfraRunner({ isolatedHome: home, git: trusted, docker: { tool: 'docker', path: '/x' } as never, dockerSocketPath: sock, spawnImpl: impl })
    await runner.run(gitCommands.head('/tmp'))
    const env = calls[0].options.env as Record<string, string>
    expect(Object.keys(env).sort()).toEqual(Object.keys(buildGitEnv(home)).sort())
    for (const [key, value] of Object.entries(secrets)) {
      if (key in env) expect(env[key], key).not.toBe(value)
      expect(Object.values(env)).not.toContain(value)
    }
    expect(env.PATH).toBe('/usr/bin:/bin')
    expect(env.HOME).toBe(home)
    expect(env.GIT_TERMINAL_PROMPT).toBe('0')
    expect(env.GIT_CONFIG_GLOBAL).toBe('/dev/null')
    expect(env.GIT_CONFIG_SYSTEM).toBe('/dev/null')
    expect(env.GIT_CONFIG_NOSYSTEM).toBe('1')
    expect(env.GIT_ASKPASS).toBe('/usr/bin/false')
    expect(env.GIT_SSH_COMMAND).toBe('/usr/bin/false')
    expect(env.GIT_NO_LAZY_FETCH).toBe('1')
    expect(env.GIT_ALLOW_PROTOCOL).toBe('none')
    expect(env).not.toHaveProperty('GIT_DIR')
    expect(env).not.toHaveProperty('SSH_AUTH_SOCK')
    expect(env).not.toHaveProperty('GIT_EXEC_PATH')
    expect(env).not.toHaveProperty('LD_PRELOAD')
    expect(env).not.toHaveProperty('NODE_OPTIONS')
    expect(calls[0].options.cwd).toBe('/tmp')

    const docker = buildDockerEnv(home, sock)
    expect(docker.DOCKER_HOST).toBe(`unix://${sock}`)                 // broker-built, host-side socket
    expect(Object.values(docker)).not.toContain('tcp://evil.example:2375')
    expect(docker).not.toHaveProperty('DOCKER_CONTEXT')
    expect(docker.DOCKER_CONFIG).toBe(`${home}/docker`)
    for (const bad of ['tcp://evil:2375', '/tmp/x.sock;rm', 'relative.sock', '/tmp/../x.sock', 'ssh://root@x']) expect(() => buildDockerEnv(home, bad), bad).toThrow()
  })

  it('has no way to read the parent environment at all', () => {
    for (const file of readdirSync(ISO)) {
      const source = code(join(ISO, file))
      expect(source, file).not.toMatch(/process\.env|import\.meta\.env|\benv:\s*process/)
    }
  })

  it('bounds stdout/stderr before returning', async () => {
    const big = Buffer.alloc(2000, 0x61)
    const { impl } = fakeSpawn(child => { child.stdout.emit('data', big); child.stdout.emit('data', big); child.stderr.emit('data', big); child.emit('close', 0, null) })
    const runner = createInfraRunner({ isolatedHome: home, git: trusted, docker: null, dockerSocketPath: null, spawnImpl: impl })
    const result = await runner.run(brokerCommand({ tool: 'git', argv: HEAD_ARGV, cwd: '/tmp', maxOutputBytes: 1000 }))
    expect(result.stdout.length).toBe(1000)
    expect(result.stderr.length).toBe(1000)
    expect(result.truncated).toBe(true)
    const capped = brokerCommand({ tool: 'git', argv: HEAD_ARGV, maxOutputBytes: 10 ** 9 })
    expect(capped.maxOutputBytes).toBeLessThanOrEqual(1024 * 1024)
  })

  it('a timeout kills the child (TERM, then KILL) and reports timedOut', async () => {
    vi.useFakeTimers()
    try {
      const { impl } = fakeSpawn(() => undefined)                // never exits by itself
      let killed: any
      const wrapped = ((...args: Parameters<typeof impl>) => { killed = (impl as any)(...args); return killed }) as typeof impl
      const runner = createInfraRunner({ isolatedHome: home, git: trusted, docker: null, dockerSocketPath: null, spawnImpl: wrapped })
      const pending = runner.run(brokerCommand({ tool: 'git', argv: HEAD_ARGV, cwd: '/tmp', timeoutMs: 500 }))
      await vi.advanceTimersByTimeAsync(499)
      expect(killed.kill).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(2)
      expect(killed.kill).toHaveBeenCalledWith('SIGTERM')
      await vi.advanceTimersByTimeAsync(1_100)
      expect(killed.kill).toHaveBeenCalledWith('SIGKILL')
      await vi.advanceTimersByTimeAsync(1_100)
      const result = await pending
      expect(result.timedOut).toBe(true)
      expect(result.exitCode).toBeNull()
    } finally { vi.useRealTimers() }
    expect(brokerCommand({ tool: 'git', argv: HEAD_ARGV, timeoutMs: 10 ** 9 }).timeoutMs).toBeLessThanOrEqual(120_000)
  })

  it('logs nothing and never puts a command line or secret in a result or thrown message', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(name => vi.spyOn(console, name).mockImplementation(() => undefined))
    const secret = 'ghp_TOPSECRETTOKEN'
    vi.stubEnv('GITHUB_TOKEN', secret)
    const { impl } = fakeSpawn(child => child.emit('close', 1, null))
    const runner = createInfraRunner({ isolatedHome: home, git: trusted, docker: null, dockerSocketPath: null, spawnImpl: impl })
    const result = await runner.run(gitCommands.head('/tmp'))
    let thrown = ''
    try { brokerCommand({ tool: 'git', argv: hg('fetch', secret) }) } catch (error) { thrown = String(error) }
    expect(JSON.stringify(result) + thrown).not.toContain(secret)
    for (const spy of spies) { expect(spy).not.toHaveBeenCalled(); spy.mockRestore() }
    for (const file of readdirSync(ISO)) expect(code(join(ISO, file)), file).not.toMatch(/\bconsole\.|\blogger\b/)
  })

  it('a planted user gitconfig, hooks, filters and credential helper are unreachable (real git)', async () => {
    const fx = makeFixture()
    const marker = join(fx.base, 'MARKER')
    const fakeHome = join(fx.base, 'home'); mkdirSync(fakeHome)
    const evilHooks = join(fx.base, 'evil-hooks'); mkdirSync(evilHooks)
    for (const hook of ['post-checkout', 'pre-commit', 'reference-transaction']) { writeFileSync(join(evilHooks, hook), `#!/bin/sh\necho ${hook} >> "${marker}"\n`); chmodSync(join(evilHooks, hook), 0o755) }
    writeFileSync(join(fakeHome, '.gitconfig'), `[core]\n  hooksPath = ${evilHooks}\n  fsmonitor = ${join(evilHooks, 'post-checkout')}\n[credential]\n  helper = !echo cred >> "${marker}"\n[filter "evil"]\n  smudge = sh -c 'echo smudge >> "${marker}"; cat'\n  clean = cat\n`)
    vi.stubEnv('HOME', fakeHome); vi.stubEnv('XDG_CONFIG_HOME', join(fakeHome, 'xdg')); vi.stubEnv('GIT_CONFIG_GLOBAL', join(fakeHome, '.gitconfig'))
    writeFileSync(join(fx.root, '.gitattributes'), '*.txt filter=evil\n'); g(fx.root, 'add', '.gitattributes'); g(fx.root, 'commit', '-q', '-m', 'attrs')
    g(fx.root, 'update-ref', 'refs/remotes/origin/main', g(fx.root, 'rev-parse', 'HEAD'))
    const hooksDir = join(fx.root, '.git', 'hooks'); writeFileSync(join(hooksDir, 'post-checkout'), `#!/bin/sh\necho repo-hook >> "${marker}"\n`); chmodSync(join(hooksDir, 'post-checkout'), 0o755)
    const s = substrate(fx)
    const result = await s.prepareWorktree(input(fx, { pinnedBaseSha: g(fx.root, 'rev-parse', 'HEAD') }))
    expect(result.status).toBe('prepared')
    expect(existsSync(marker)).toBe(false)                         // no hook, filter, fsmonitor or credential helper ever ran
    expect(existsSync(join(fx.parent, WORK, 'a.txt'))).toBe(true)
  })
})

describe('SDF-1C3A low-level Git command grammar: the issuer boundary ITSELF fails closed (not only the builders)', () => {
  // The canonical hardening prefix, derived from the broker-owned override table (independent of the builders).
  const PREFIX = ['--no-pager', '--no-optional-locks', ...Object.entries(GIT_ALLOWED_CONFIG_OVERRIDES).flatMap(([key, value]) => ['-c', `${key}=${value}`])]
  const SHA = 'a'.repeat(40)
  const BRANCH = `sdf1/${WORK}`
  const TARGET = `/tmp/worktrees/${WORK}`
  const REASON = 'omnira-sdf explicit-cleanup-only'
  const hardened = (...rest: string[]) => [...PREFIX, ...rest]
  const accepts = (argv: string[]) => { try { brokerCommand({ tool: 'git', argv }); return true } catch (error) { if (error instanceof InfraCommandRefused) return false; throw error } }

  /** The EXACT operations Phase 1C3A needs — and the only ones that may become a Git InfraCommand. */
  const CANONICAL: Record<string, string[]> = {
    layout: hardened('rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-common-dir', '--is-inside-work-tree'),
    localConfig: hardened('config', '--local', '--list', '-z'),
    objectType: hardened('cat-file', '-t', SHA),
    resolveSha: hardened('rev-parse', '--verify', '--quiet', `${SHA}^{commit}`),
    resolveRef: hardened('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main^{commit}'),
    refExistsRemote: hardened('show-ref', '--verify', '--quiet', 'refs/remotes/origin/main'),
    refExistsHeads: hardened('show-ref', '--verify', '--quiet', `refs/heads/${BRANCH}`),
    worktreeList: hardened('worktree', 'list', '--porcelain', '-z'),
    worktreeAdd: hardened('worktree', 'add', '--quiet', '--lock', '--reason', REASON, '-b', BRANCH, TARGET, SHA),
    head: hardened('rev-parse', '--verify', '--quiet', 'HEAD^{commit}'),
    symbolicHead: hardened('symbolic-ref', '--quiet', 'HEAD'),
    status: hardened('status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none'),
  }

  it('accepts each exact canonical operation (sanity: the grammar is not vacuous)', () => {
    for (const [name, argv] of Object.entries(CANONICAL)) expect(accepts(argv), name).toBe(true)
  })

  it('every production gitCommands builder emits exactly a canonical shape', () => {
    const made = [
      gitCommands.layout('/r'), gitCommands.localConfig('/r'), gitCommands.objectType('/r', SHA), gitCommands.resolveCommit('/r', SHA), gitCommands.resolveCommit('/r', 'refs/remotes/origin/main'),
      gitCommands.refExists('/r', 'refs/remotes/origin/main'), gitCommands.worktreeList('/r'), gitCommands.worktreeAdd('/r', BRANCH, TARGET, SHA), gitCommands.head('/w'), gitCommands.symbolicHead('/w'), gitCommands.status('/w'),
    ].map(command => JSON.stringify(command.argv))
    const canonical = new Set(Object.values(CANONICAL).map(argv => JSON.stringify(argv)))
    for (const argv of made) expect(canonical.has(argv), argv).toBe(true)
  })

  it('refuses EVERY canonical operation issued without the complete hardening prefix', () => {
    for (const [name, argv] of Object.entries(CANONICAL)) {
      const bare = argv.slice(PREFIX.length)
      expect(accepts(bare), `${name}: no prefix at all`).toBe(false)
      expect(accepts(['--no-pager', '--no-optional-locks', ...bare]), `${name}: flags only`).toBe(false)
    }
  })

  it('refuses a prefix with ANY protection removed, altered, duplicated, reordered or supplemented', () => {
    const op = ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']
    // drop each element of the prefix (a flag or a whole `-c key=value` pair)
    for (let i = 0; i < PREFIX.length; i += 1) {
      const dropped = PREFIX[i] === '-c' ? [...PREFIX.slice(0, i), ...PREFIX.slice(i + 2)] : [...PREFIX.slice(0, i), ...PREFIX.slice(i + 1)]
      if (PREFIX[i - 1] === '-c') continue                                                    // the value slot was handled with its `-c`
      expect(accepts([...dropped, ...op]), `dropped @${i} ${PREFIX[i]} ${PREFIX[i + 1] ?? ''}`).toBe(false)
    }
    for (const [key, value] of Object.entries(GIT_ALLOWED_CONFIG_OVERRIDES)) {
      const altered = PREFIX.map(token => (token === `${key}=${value}` ? `${key}=tampered` : token))
      expect(accepts([...altered, ...op]), `altered ${key}`).toBe(false)
      expect(accepts([...PREFIX, '-c', `${key}=${value}`, ...op]), `duplicate ${key}`).toBe(false)
    }
    expect(accepts([...PREFIX, '-c', 'core.hooksPath=/tmp/evil', ...op]), 'caller-added -c').toBe(false)
    expect(accepts([...PREFIX, '-c', 'alias.x=!id', ...op]), 'caller-added alias').toBe(false)
    expect(accepts([...PREFIX, '--no-pager', ...op]), 'duplicate flag').toBe(false)
    expect(accepts([...PREFIX, '--git-dir=/etc', ...op]), 'caller global option').toBe(false)
    expect(accepts([...PREFIX, '-C', '/etc', ...op]), 'caller -C').toBe(false)
    expect(accepts([PREFIX[1], PREFIX[0], ...PREFIX.slice(2), ...op]), 'reordered flags').toBe(false)
    expect(accepts([...PREFIX.slice(0, 2), ...PREFIX.slice(4, 6), ...PREFIX.slice(2, 4), ...PREFIX.slice(6), ...op]), 'reordered -c pairs').toBe(false)
    expect(accepts([...PREFIX]), 'prefix with no operation').toBe(false)
    expect(accepts([]), 'empty').toBe(false)
  })

  it('symbolic-ref can only READ HEAD: every mutating or alternate form is refused', () => {
    for (const rest of [
      ['symbolic-ref', 'HEAD', 'refs/heads/evil'], ['symbolic-ref', '--quiet', 'HEAD', 'refs/heads/evil'], ['symbolic-ref', 'HEAD', 'refs/heads/main'], ['symbolic-ref', '-d', 'HEAD'], ['symbolic-ref', '--delete', 'HEAD'],
      ['symbolic-ref', '--quiet', '-d', 'HEAD'], ['symbolic-ref', '-m', 'reason', 'HEAD', 'refs/heads/evil'], ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'], ['symbolic-ref', '--short', 'HEAD'],
      ['symbolic-ref', '--recurse', 'HEAD'], ['symbolic-ref', '--no-recurse', 'HEAD'], ['symbolic-ref', 'HEAD'], ['symbolic-ref', '--quiet', 'refs/heads/main'], ['symbolic-ref', '--quiet', 'HEAD', '--'], ['symbolic-ref'],
    ]) {
      expect(accepts(hardened(...rest)), `hardened ${rest.join(' ')}`).toBe(false)
      expect(accepts(rest), `bare ${rest.join(' ')}`).toBe(false)
    }
  })

  it('worktree add has ONE grammar: fixed flags, fixed reason, a sdf1/<uuid> branch, a target tied to that uuid, a full lowercase SHA', () => {
    const add = (over: Partial<Record<'reason' | 'branch' | 'target' | 'sha', string>> = {}) =>
      hardened('worktree', 'add', '--quiet', '--lock', '--reason', over.reason ?? REASON, '-b', over.branch ?? BRANCH, over.target ?? TARGET, over.sha ?? SHA)
    expect(accepts(add())).toBe(true)
    const bad: Record<string, string[]> = {
      'arbitrary branch': add({ branch: 'arbitrary' }), 'main as branch': add({ branch: 'main' }), 'branch outside prefix': add({ branch: `sdf2/${WORK}` }), 'non-uuid branch': add({ branch: 'sdf1/not-a-uuid' }),
      'branch traversal': add({ branch: 'sdf1/../x' }), 'uppercase uuid branch': add({ branch: `sdf1/${LETTERED.toUpperCase()}`, target: `/tmp/worktrees/${LETTERED.toUpperCase()}` }),
      'branch/target uuid mismatch': add({ target: `/tmp/worktrees/${WORK_2}` }), 'target without uuid leaf': add({ target: '/tmp/worktrees/other' }), 'relative target': add({ target: `worktrees/${WORK}` }),
      'target with traversal': add({ target: `/tmp/../etc/${WORK}` }), 'target dot segment': add({ target: `/tmp/./x/${WORK}` }), 'option-like target': add({ target: '-f' }), 'target with double slash': add({ target: `/tmp//x/${WORK}` }),
      'target with newline': add({ target: `/tmp/x\n/${WORK}` }), 'target with space': add({ target: `/tmp/a b/${WORK}` }), 'target with shell metachar': add({ target: `/tmp/$(id)/${WORK}` }), 'target trailing slash': add({ target: `${TARGET}/` }),
      'ref instead of sha (HEAD)': add({ sha: 'HEAD' }), 'branch name as start point': add({ sha: 'main' }), 'abbreviated sha': add({ sha: SHA.slice(0, 7) }), 'uppercase sha': add({ sha: SHA.toUpperCase() }), '41-char sha': add({ sha: `${SHA}a` }),
      'sha with revision suffix': add({ sha: `${SHA}~1` }), 'sha^{commit}': add({ sha: `${SHA}^{commit}` }), 'different reason': add({ reason: 'anything else' }), 'empty reason': add({ reason: '' }),
      'detach': hardened('worktree', 'add', '--quiet', '--lock', '--reason', REASON, '--detach', BRANCH, TARGET, SHA), 'force': hardened('worktree', 'add', '--force', '--quiet', '--lock', '--reason', REASON, '-b', BRANCH, TARGET, SHA),
      'capital -B (reset branch)': hardened('worktree', 'add', '--quiet', '--lock', '--reason', REASON, '-B', BRANCH, TARGET, SHA), 'no-checkout': hardened('worktree', 'add', '--no-checkout', '--quiet', '--lock', '--reason', REASON, '-b', BRANCH, TARGET, SHA),
      'orphan': hardened('worktree', 'add', '--orphan', '-b', BRANCH, TARGET), 'no lock': hardened('worktree', 'add', '--quiet', '-b', BRANCH, TARGET, SHA), 'no quiet': hardened('worktree', 'add', '--lock', '--reason', REASON, '-b', BRANCH, TARGET, SHA),
      'no branch flag': hardened('worktree', 'add', '--quiet', '--lock', '--reason', REASON, BRANCH, TARGET, SHA), 'no start point': hardened('worktree', 'add', '--quiet', '--lock', '--reason', REASON, '-b', BRANCH, TARGET),
      'existing ref checkout': hardened('worktree', 'add', TARGET, 'main'), 'bare path only': hardened('worktree', 'add', TARGET), 'reordered flags': hardened('worktree', 'add', '--lock', '--quiet', '--reason', REASON, '-b', BRANCH, TARGET, SHA),
      'reordered tail': hardened('worktree', 'add', '--quiet', '--lock', '--reason', REASON, '-b', BRANCH, SHA, TARGET), 'extra trailing arg': [...add(), '--'], 'extra pathspec': [...add(), 'a.txt'], 'second target': [...add(), '/tmp/other'],
      'worktree remove': hardened('worktree', 'remove', '--force', TARGET), 'worktree prune': hardened('worktree', 'prune'), 'worktree move': hardened('worktree', 'move', TARGET, '/tmp/x'), 'worktree lock': hardened('worktree', 'lock', TARGET),
      'worktree unlock': hardened('worktree', 'unlock', TARGET), 'worktree repair': hardened('worktree', 'repair'), 'worktree alone': hardened('worktree'),
    }
    for (const [name, argv] of Object.entries(bad)) expect(accepts(argv), name).toBe(false)
  })

  it('cat-file has ONE mode (-t <sha>): no --filters/--textconv/batch/content modes, no refs, no paths', () => {
    for (const rest of [
      ['cat-file', '-p', SHA], ['cat-file', '-s', SHA], ['cat-file', '-e', SHA], ['cat-file', 'commit', SHA], ['cat-file', 'blob', `${SHA}:a.txt`], ['cat-file', '--filters', 'HEAD:a.txt'], ['cat-file', '--filters', `${SHA}:a.txt`],
      ['cat-file', '--textconv', `${SHA}:a.txt`], ['cat-file', '--batch'], ['cat-file', '--batch-check'], ['cat-file', '--batch-command'], ['cat-file', '--batch-all-objects'], ['cat-file', '--allow-unknown-type', '-t', SHA],
      ['cat-file', '--follow-symlinks', '-t', SHA], ['cat-file', '--buffer', '-t', SHA], ['cat-file', '-t'], ['cat-file', '-t', 'HEAD'], ['cat-file', '-t', 'main'], ['cat-file', '-t', `${SHA}:a.txt`], ['cat-file', '-t', SHA.toUpperCase()],
      ['cat-file', '-t', SHA.slice(0, 39)], ['cat-file', '-t', `${SHA}a`], ['cat-file', '-t', SHA, SHA], ['cat-file', '-t', SHA, '--'], ['cat-file', '-t', '--', SHA], ['cat-file', '--mailmap', '-t', SHA], ['cat-file'],
    ]) expect(accepts(hardened(...rest)), rest.join(' ')).toBe(false)
  })

  it('rev-parse has exactly THREE shapes: layout, commit resolution (sha/ref), and HEAD commit', () => {
    for (const rest of [
      ['rev-parse', 'HEAD'], ['rev-parse', '--verify', 'HEAD'], ['rev-parse', '--verify', '--quiet', 'HEAD'], ['rev-parse', '--quiet', '--verify', 'HEAD^{commit}'], ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}'],
      ['rev-parse', '--verify', '--quiet', `${SHA}^{tree}`], ['rev-parse', '--verify', '--quiet', `${SHA}^{blob}`], ['rev-parse', '--verify', '--quiet', `${SHA}~1^{commit}`], ['rev-parse', '--verify', '--quiet', 'refs/tags/v1^{commit}'],
      ['rev-parse', '--verify', '--quiet', 'refs/heads/../x^{commit}'], ['rev-parse', '--verify', '--quiet', 'main^{commit}'], ['rev-parse', '--verify', '--quiet', `${SHA.toUpperCase()}^{commit}`], ['rev-parse', '--verify', '--quiet', `${SHA.slice(0, 39)}^{commit}`],
      ['rev-parse', '--verify', '--quiet', `HEAD:a.txt^{commit}`], ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}', '--'], ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}', 'HEAD^{commit}'], ['rev-parse', '--git-path', 'hooks/post-checkout'],
      ['rev-parse', '--resolve-git-dir', '/etc'], ['rev-parse', '--show-cdup'], ['rev-parse', '--show-prefix'], ['rev-parse', '--abbrev-ref', 'HEAD'], ['rev-parse', '--git-dir'], ['rev-parse', '--show-toplevel'],
      ['rev-parse', '--show-superproject-working-tree'], ['rev-parse', '--parseopt'], ['rev-parse', '--sq-quote', 'x'], ['rev-parse', '--path-format=absolute', '--git-dir'], ['rev-parse', '--local-env-vars'], ['rev-parse', '--is-bare-repository'],
      ['rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-common-dir'], ['rev-parse', '--absolute-git-dir', '--show-toplevel', '--git-common-dir', '--is-inside-work-tree'],
      ['rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-common-dir', '--is-inside-work-tree', '--git-dir'], ['rev-parse'],
    ]) expect(accepts(hardened(...rest)), rest.join(' ')).toBe(false)
  })

  it('status has ONE argument list: no other flag, format, ignore mode, branch info or pathspec', () => {
    for (const rest of [
      ['status'], ['status', '--porcelain=v1', '-z'], ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'], ['status', '--porcelain=v1', '-z', '--untracked-files=no', '--ignore-submodules=none'],
      ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all'], ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none', '--ignored'],
      ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none', '--branch'], ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none', '--', '/etc'],
      ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none', 'a.txt'], ['status', '--ignored', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none'],
      ['status', '-z', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'], ['status', '--porcelain=v1', '-z', '--ignore-submodules=none', '--untracked-files=all'], ['status', '-s'], ['status', '--short'], ['status', '--long'],
      ['status', '--renames'], ['status', '--find-renames=1'], ['status', '--column'], ['status', '--no-optional-locks'], ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none', '--ahead-behind'],
    ]) expect(accepts(hardened(...rest)), rest.join(' ')).toBe(false)
  })

  it('show-ref and worktree list and config each have ONE argument list', () => {
    for (const rest of [
      ['show-ref'], ['show-ref', '--head'], ['show-ref', '--tags'], ['show-ref', '--heads'], ['show-ref', '--hash', 'refs/heads/main'], ['show-ref', '--dereference'], ['show-ref', '--verify', 'refs/heads/main'], ['show-ref', '--quiet', '--verify', 'refs/heads/main'],
      ['show-ref', '--verify', '--quiet', 'refs/tags/v1'], ['show-ref', '--verify', '--quiet', 'HEAD'], ['show-ref', '--verify', '--quiet', 'refs/heads/../x'], ['show-ref', '--verify', '--quiet', 'refs/heads/x.lock'], ['show-ref', '--verify', '--quiet', 'refs/heads/x/'],
      ['show-ref', '--verify', '--quiet', 'refs/heads/main', 'refs/heads/other'], ['show-ref', '--verify', '--quiet', '-d', 'refs/heads/main'], ['show-ref', '--exists', 'refs/heads/main'],
      ['worktree', 'list'], ['worktree', 'list', '--porcelain'], ['worktree', 'list', '-z'], ['worktree', 'list', '-v'], ['worktree', 'list', '--verbose'], ['worktree', 'list', '--porcelain', '-z', '-v'], ['worktree', 'list', '-z', '--porcelain'],
      ['worktree', 'list', '--porcelain', '-z', '/tmp'], ['config', '--local', '--list'], ['config', '--local', '--list', '-z', '--show-origin'], ['config', '--local', '--list', '-z', '--show-scope'], ['config', '--global', '--list', '-z'],
      ['config', '--system', '--list', '-z'], ['config', '--list', '-z'], ['config', '--local', '-l', '-z'], ['config', '--local', '--get', 'remote.origin.url'], ['config', '--local', 'core.hooksPath', '/tmp/evil'], ['config', '--local', '--unset', 'x'],
      ['config', '--file', '/etc/gitconfig', '--list', '-z'], ['config', '--local', '--list', '-z', '--includes'], ['config', '--worktree', '--list', '-z'], ['config', '-e'], ['config', '--edit'], ['config', '--local', '--list', '-z', '--type=path'],
    ]) expect(accepts(hardened(...rest)), rest.join(' ')).toBe(false)
  })

  it('the named forbidden and unlisted subcommands stay refused even when properly hardened', () => {
    for (const sub of [...GIT_FORBIDDEN_SUBCOMMANDS, 'log', 'diff', 'grep', 'blame', 'archive', 'bundle', 'hash-object', 'ls-tree', 'ls-files', 'for-each-ref', 'update-index', 'read-tree', 'write-tree', 'commit-tree', 'mktag', 'unpack-objects']) {
      expect(accepts(hardened(sub)), sub).toBe(false)
      expect(accepts(hardened(sub, SHA)), `${sub} <sha>`).toBe(false)
    }
  })

  it('the grammar is a FINITE closed set: eleven operations, each canonical argv maps to its own operation and nothing else matches', () => {
    expect([...GIT_OPERATIONS].sort()).toEqual(['head', 'layout', 'localConfig', 'objectType', 'refExists', 'resolveRef', 'resolveSha', 'status', 'symbolicHead', 'worktreeAdd', 'worktreeList'])
    const expected: Record<string, string> = {
      layout: 'layout', localConfig: 'localConfig', objectType: 'objectType', resolveSha: 'resolveSha', resolveRef: 'resolveRef', refExistsRemote: 'refExists', refExistsHeads: 'refExists',
      worktreeList: 'worktreeList', worktreeAdd: 'worktreeAdd', head: 'head', symbolicHead: 'symbolicHead', status: 'status',
    }
    for (const [name, argv] of Object.entries(CANONICAL)) expect(matchGitOperation(argv), name).toBe(expected[name])
    expect(new Set(Object.values(expected))).toEqual(new Set(GIT_OPERATIONS))
    expect(matchGitOperation(['rev-parse', 'HEAD'])).toBeNull()
    expect(matchGitOperation([])).toBeNull()
  })

  it('the grammar validators are strict about refs, branches and targets', () => {
    for (const ref of ['refs/remotes/origin/main', 'refs/heads/sdf1/x', 'refs/heads/feat/a-b_c.d']) expect(isPlainRef(ref), ref).toBe(true)
    for (const ref of ['main', 'HEAD', 'refs/tags/v1', 'refs/heads/', 'refs/heads/a..b', 'refs/heads/a//b', 'refs/heads/.hidden', 'refs/heads/x.lock', 'refs/heads/x/', 'refs/heads/x.', 'refs/heads/a b', 'refs/heads/a\nb', '--upload-pack=x', '', 5, null]) expect(isPlainRef(ref), String(ref)).toBe(false)
    expect(worktreeBranchUuid(BRANCH)).toBe(WORK)
    for (const branch of ['sdf1/', 'sdf1/x', `sdf1/${WORK}/x`, `sdf1/${LETTERED.toUpperCase()}`, `sdf2/${WORK}`, `x/sdf1/${WORK}`, WORK, 5, null]) expect(worktreeBranchUuid(branch), String(branch)).toBeNull()
    expect(isWorktreeTargetFor(`/Users/u/Projects/Omnira/.worktrees/sdf1/${WORK}`, WORK)).toBe(true)        // a leading-dot directory is fine; `.`/`..` segments are not
    expect(isWorktreeTargetFor(`/private/var/folders/t7/x_y-z/T/sdf1c3-fx-Ab1/worktrees/${WORK}`, WORK)).toBe(true)
    for (const target of [`/${WORK}`, WORK, `/a/${WORK_2}`, `/a/../${WORK}`, `/a/./${WORK}`, `/a//${WORK}`, `/a/${WORK}/`, `/a b/${WORK}`, `/a/\n/${WORK}`, `/a/$(id)/${WORK}`, `/a/${WORK}/b`, `/${'x/'.repeat(600)}${WORK}`, 5, null]) {
      expect(isWorktreeTargetFor(target, WORK), String(target)).toBe(false)
    }
  })

  it('the refusal is decided by the low-level boundary alone, not by which module called it', () => {
    // brokerCommand is what a "future internal caller that bypasses gitCommands.ts" would call.
    expect(() => brokerCommand({ tool: 'git', argv: ['symbolic-ref', 'HEAD', 'refs/heads/something'] })).toThrow(InfraCommandRefused)
    expect(() => brokerCommand({ tool: 'git', argv: hardened('symbolic-ref', 'HEAD', 'refs/heads/something') })).toThrow(InfraCommandRefused)
    expect(() => brokerCommand({ tool: 'git', argv: ['rev-parse', 'HEAD'], cwd: '/tmp' })).toThrow(InfraCommandRefused)
    expect(() => brokerCommand({ tool: 'git', argv: ['worktree', 'add', '--detach', '/tmp/x', 'HEAD'] })).toThrow(InfraCommandRefused)
    expect(isBrokerCommand({ tool: 'git', argv: CANONICAL.head, cwd: null, timeoutMs: 1, maxOutputBytes: 1 })).toBe(false)
  })
})

describe('SDF-1C3A Git configuration audit (refuse configuration that can make Git launch programs)', () => {
  const clean = `user.name\nfixture\0remote.origin.url\n${GOOD_REMOTE}\0remote.origin.fetch\n+refs/heads/*:refs/remotes/origin/*\0core.repositoryformatversion\n0\0`
  const audit = (extra: string) => auditGitConfig(clean + extra, 'origin', OMNIRA_LOCAL_REPOSITORY.remoteIdentity)
  const entry = (key: string, value: string) => `${key}\n${value}\0`

  it('accepts a clean config and reports the audited remotes', () => {
    const result = audit('')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.remotes).toEqual([{ name: 'origin', urls: [GOOD_REMOTE], pushUrls: [] }])
    expect(auditGitConfig(`remote.origin.url\ngit@github.com:Bumbi190/ai-operating-platform.git\0remote.origin.pushurl\nssh://git@github.com/bumbi190/ai-operating-platform\0`, 'origin', OMNIRA_LOCAL_REPOSITORY.remoteIdentity).ok).toBe(true)
  })

  it.each([
    ['filter smudge', entry('filter.lfs.smudge', 'git-lfs smudge -- %f'), 'filter_driver'],
    ['filter clean', entry('filter.x.clean', 'cat'), 'filter_driver'],
    ['filter process', entry('filter.lfs.process', 'git-lfs filter-process'), 'filter_driver'],
    ['fsmonitor program', entry('core.fsmonitor', '/tmp/hook'), 'fsmonitor'],
    ['fsmonitor true', entry('core.fsmonitor', 'true'), 'fsmonitor'],
    ['hooksPath', entry('core.hooksPath', '/tmp/hooks'), 'hooks_path'],
    ['hooksPath /dev/null still refused', entry('core.hooksPath', '/dev/null'), 'hooks_path'],
    ['credential helper', entry('credential.helper', 'osxkeychain'), 'credential_helper'],
    ['url credential helper', entry('credential.https://github.com.helper', '!gh auth git-credential'), 'credential_helper'],
    ['sshCommand', entry('core.sshCommand', 'ssh -i /k'), 'ssh_or_askpass'],
    ['askPass', entry('core.askPass', '/tmp/p'), 'ssh_or_askpass'],
    ['gitProxy', entry('core.gitProxy', 'x'), 'ssh_or_askpass'],
    ['pager', entry('core.pager', 'less'), 'pager_editor'],
    ['editor', entry('core.editor', 'vim'), 'pager_editor'],
    ['include', entry('include.path', '/tmp/other'), 'include'],
    ['includeIf', entry('includeif.gitdir:/x/.path', '/tmp/other'), 'include'],
    ['diff command', entry('diff.x.command', '/tmp/d'), 'external_driver'],
    ['diff textconv', entry('diff.x.textconv', 'strings'), 'external_driver'],
    ['merge driver', entry('merge.x.driver', '/tmp/m %A'), 'external_driver'],
    ['mergetool cmd', entry('mergetool.x.cmd', 'sh'), 'external_driver'],
    ['shell alias', entry('alias.st', '!sh -c id'), 'shell_alias'],
    ['worktreeConfig', entry('extensions.worktreeConfig', 'true'), 'worktree_config'],
    ['core.worktree', entry('core.worktree', '/elsewhere'), 'alternate_worktree'],
    ['core.bare', entry('core.bare', 'true'), 'alternate_worktree'],
  ])('refuses %s', (_label, extra, refusal) => {
    expect(audit(extra as string)).toEqual({ ok: false, refusal })
  })

  it('tolerates benign values that are explicit no-ops, and refuses malformed input', () => {
    expect(audit(entry('filter.x.smudge', '')).ok).toBe(true)
    expect(audit(entry('core.fsmonitor', 'false')).ok).toBe(true)
    expect(audit(entry('credential.helper', '')).ok).toBe(true)
    expect(audit(entry('alias.co', 'checkout')).ok).toBe(true)
    expect(parseGitConfigZ('bad key!\nvalue\0')).toBeNull()
    expect(auditGitConfig('bad key!\nv\0', 'origin', OMNIRA_LOCAL_REPOSITORY.remoteIdentity)).toEqual({ ok: false, refusal: 'config_unparseable' })
  })

  it('accepts only ONE repository identity across every remote, fetch and push', () => {
    const id = OMNIRA_LOCAL_REPOSITORY.remoteIdentity
    expect(auditGitConfig('user.name\nx\0', 'origin', id)).toEqual({ ok: false, refusal: 'remote_missing' })
    expect(auditGitConfig(entry('remote.upstream.url', GOOD_REMOTE), 'origin', id)).toEqual({ ok: false, refusal: 'remote_missing' })
    expect(auditGitConfig(entry('remote.origin.url', 'https://github.com/someone/else.git'), 'origin', id)).toEqual({ ok: false, refusal: 'remote_identity_mismatch' })
    expect(auditGitConfig(entry('remote.origin.url', 'https://gitlab.com/Bumbi190/ai-operating-platform.git'), 'origin', id)).toEqual({ ok: false, refusal: 'remote_malformed' })
    expect(auditGitConfig(entry('remote.origin.url', GOOD_REMOTE) + entry('remote.origin.pushurl', 'https://github.com/someone/else.git'), 'origin', id)).toEqual({ ok: false, refusal: 'remote_identity_mismatch' })
    expect(auditGitConfig(entry('remote.origin.url', GOOD_REMOTE) + entry('remote.fork.url', 'https://github.com/someone/else.git'), 'origin', id)).toEqual({ ok: false, refusal: 'remote_identity_mismatch' })
    expect(auditGitConfig(entry('remote.origin.url', 'file:///tmp/evil'), 'origin', id)).toEqual({ ok: false, refusal: 'remote_malformed' })
    expect(auditGitConfig(entry('remote.origin.url', 'https://github.com/Bumbi190/ai-operating-platform.git.evil'), 'origin', id).ok).toBe(false)
  })
})

describe('SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories)', () => {
  it('prepares a worktree at exactly the pinned commit with a closed, path-free result', async () => {
    const fx = makeFixture()
    const result = await substrate(fx).prepareWorktree(input(fx))
    expect(result.status).toBe('prepared')
    if (result.status !== 'prepared') return
    expect(Object.keys(result).sort()).toEqual(['branchName', 'headSha', 'observedBaseSha', 'pinnedBaseSha', 'remoteIdentityHash', 'repositoryId', 'status', 'workId', 'worktreePathHash'])
    expect(result.branchName).toBe(`sdf1/${WORK}`)
    expect(result.headSha).toBe(fx.sha2)
    expect(result.observedBaseSha).toBe(fx.sha2)
    expect(result.pinnedBaseSha).toBe(fx.sha2)
    expect(result.worktreePathHash).toMatch(/^[a-f0-9]{64}$/)
    expect(result.remoteIdentityHash).toMatch(/^[a-f0-9]{64}$/)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(fx.base)                      // no absolute local path leaves the broker internals
    expect(serialized).not.toContain(tmpdir())
    const target = join(fx.parent, WORK)
    expect(realpathSync(target)).toBe(target)
    expect(g(target, 'rev-parse', 'HEAD')).toBe(fx.sha2)
    expect(g(target, 'symbolic-ref', 'HEAD')).toBe(`refs/heads/sdf1/${WORK}`)
    expect(g(target, 'status', '--porcelain')).toBe('')
    expect(readFileSync(join(target, 'b.txt'), 'utf8')).toBe('two\n')
    expect(g(fx.root, 'rev-parse', 'refs/remotes/origin/main')).toBe(fx.sha2)
    expect(g(fx.root, 'worktree', 'list', '--porcelain')).toContain('locked')   // retained: prune cannot reap it
  })

  it('is deterministic: same work → same branch, directory and hashes', async () => {
    const a = makeFixture(); const b = makeFixture()
    const [ra, rb] = [await substrate(a).prepareWorktree(input(a)), await substrate(b).prepareWorktree(input(b))]
    expect(ra.status === 'prepared' && rb.status === 'prepared').toBe(true)
    if (ra.status === 'prepared' && rb.status === 'prepared') {
      expect(ra.branchName).toBe(rb.branchName)
      expect(ra.remoteIdentityHash).toBe(rb.remoteIdentityHash)
      expect(ra.worktreePathHash).not.toBe(rb.worktreePathHash)          // different roots hash differently
    }
    const other = await substrate(a).prepareWorktree(input(a, { workId: WORK_2 }))
    expect(other.status === 'prepared' && other.branchName === `sdf1/${WORK_2}`).toBe(true)
    expect(existsSync(join(a.parent, WORK_2))).toBe(true)
  })

  it('accepts only trusted structured input; the caller cannot choose branch, directory, parent or arguments', async () => {
    const fx = makeFixture(); const s = substrate(fx)
    const bad: unknown[] = [
      null, 'x', [], {}, { ...input(fx), branch: 'main' }, { ...input(fx), path: '/tmp/x' }, { ...input(fx), worktreeParent: '/' }, { ...input(fx), root: '/' }, { ...input(fx), args: ['--x'] }, { ...input(fx), executable: '/bin/sh' },
      input(fx, { workId: 'not-a-uuid' }), input(fx, { workId: '../../etc' }), input(fx, { workId: `${WORK}/../x` }), input(fx, { workId: LETTERED.toUpperCase() }), input(fx, { workId: `${WORK}\n` }),
      input(fx, { workId: 5 }), input(fx, { repositoryId: 5 }), input(fx, { pinnedBaseSha: 5 }), { workId: WORK, repositoryId: REPO_ID },
    ]
    for (const value of bad) expect(await s.prepareWorktree(value), JSON.stringify(value)).toEqual({ status: 'refused', code: 'input_invalid' })
    expect(await s.prepareWorktree(input(fx, { repositoryId: 'github.com/other/repo' }))).toEqual({ status: 'refused', code: 'repository_unknown' })
    expect(readdirSync(fx.parent)).toEqual([])
  })

  it.each([
    ['uppercase', (fx: Fixture) => fx.sha2.toUpperCase()], ['39 chars', (fx: Fixture) => fx.sha2.slice(0, 39)], ['41 chars', (fx: Fixture) => `${fx.sha2}a`],
    ['abbreviated', (fx: Fixture) => fx.sha2.slice(0, 7)], ['a ref name', () => 'main'], ['non-hex', (fx: Fixture) => `${fx.sha2.slice(0, 39)}g`], ['option-like', () => '--upload-pack=x'], ['empty', () => ''],
  ])('requires a full lowercase SHA pin (%s)', async (_label, pin) => {
    const fx = makeFixture()
    expect(await substrate(fx).prepareWorktree(input(fx, { pinnedBaseSha: (pin as (f: Fixture) => string)(fx) }))).toEqual({ status: 'refused', code: 'pin_malformed' })
    expect(readdirSync(fx.parent)).toEqual([])
  })

  it('refuses a pin that is not a commit object present locally (missing, blob, tree, annotated tag) and never fetches', async () => {
    const fx = makeFixture()
    const s = substrate(fx)
    const blob = g(fx.root, 'rev-parse', `${fx.sha2}:a.txt`)
    const tree = g(fx.root, 'rev-parse', `${fx.sha2}^{tree}`)
    g(fx.root, 'tag', '-a', 'v1', '-m', 'tag', fx.sha2)
    const tag = g(fx.root, 'rev-parse', 'v1')
    for (const pin of ['0'.repeat(40), 'f'.repeat(40), blob, tree, tag]) {
      expect(await s.prepareWorktree(input(fx, { pinnedBaseSha: pin })), pin).toEqual({ status: 'refused', code: 'pin_commit_missing' })
    }
    expect(readdirSync(fx.parent)).toEqual([])
  })

  it('returns STALE_BASE, exactly and without fetching, when the approved base ref moved', async () => {
    const fx = makeFixture()
    const before = g(fx.root, 'for-each-ref')
    const s = substrate(fx)
    expect(await s.prepareWorktree(input(fx, { pinnedBaseSha: fx.sha1 }))).toEqual({ status: 'stale_base', code: 'stale_base', pinnedBaseSha: fx.sha1, observedBaseSha: fx.sha2 })
    g(fx.root, 'update-ref', 'refs/remotes/origin/main', fx.sha1)                     // base regressed to an OLDER commit
    expect(await s.prepareWorktree(input(fx, { pinnedBaseSha: fx.sha2 }))).toEqual({ status: 'stale_base', code: 'stale_base', pinnedBaseSha: fx.sha2, observedBaseSha: fx.sha1 })
    g(fx.root, 'update-ref', '-d', 'refs/remotes/origin/main')
    expect(await s.prepareWorktree(input(fx))).toEqual({ status: 'refused', code: 'base_ref_missing' })
    expect(readdirSync(fx.parent)).toEqual([])
    expect(before).toContain(fx.sha2)
    expect(existsSync(join(fx.root, '.git', 'FETCH_HEAD'))).toBe(false)                // nothing was ever fetched
  })

  it('needs no network at all (an unreachable origin cannot matter)', async () => {
    const fx = makeFixture()
    const s = substrate(fx)
    expect((await s.prepareWorktree(input(fx))).status).toBe('prepared')
    const source = ['worktree.ts', 'repository-proof.ts', 'git-commands.ts'].map(f => code(join(ISO, f))).join('\n')
    expect(source).not.toMatch(/['"](?:fetch|pull|push|merge|rebase|clone|checkout|remote|reset|cherry-pick|am|apply)['"]/)
  })

  it.each([
    ['wrong remote', GOOD_REMOTE.replace('Bumbi190', 'someone'), 'remote_identity_mismatch'],
    ['wrong host', 'https://gitlab.com/Bumbi190/ai-operating-platform.git', 'remote_malformed'],
    ['file remote', 'file:///tmp/other.git', 'remote_malformed'],
    ['plain path remote', '/tmp/other.git', 'remote_malformed'],
    ['credentials in URL', 'https://user:pw@github.com/Bumbi190/ai-operating-platform.git', 'remote_malformed'],
    ['sub-path', 'https://github.com/Bumbi190/ai-operating-platform/extra.git', 'remote_malformed'],
  ])('refuses %s', async (_label, url, code) => {
    const fx = makeFixture()
    g(fx.root, 'remote', 'set-url', 'origin', url as string)
    expect(await substrate(fx).prepareWorktree(input(fx))).toEqual({ status: 'refused', code })
    expect(readdirSync(fx.parent)).toEqual([])
  })

  it('accepts SCP, ssh and case-different forms of the SAME identity, and refuses a second identity or a missing remote', async () => {
    for (const url of ['git@github.com:Bumbi190/ai-operating-platform.git', 'ssh://git@github.com/bumbi190/ai-operating-platform', 'https://github.com/BUMBI190/AI-OPERATING-PLATFORM']) {
      const fx = makeFixture(); g(fx.root, 'remote', 'set-url', 'origin', url)
      expect((await substrate(fx).prepareWorktree(input(fx))).status, url).toBe('prepared')
    }
    const second = makeFixture(); g(second.root, 'remote', 'add', 'fork', 'https://github.com/someone/else.git')
    expect(await substrate(second).prepareWorktree(input(second))).toEqual({ status: 'refused', code: 'remote_identity_mismatch' })
    const none = makeFixture(); g(none.root, 'remote', 'remove', 'origin')
    expect(await substrate(none).prepareWorktree(input(none))).toEqual({ status: 'refused', code: 'remote_missing' })
  })

  it.each([
    ['filter driver', ['config', 'filter.evil.smudge', 'cat'], 'unsafe_git_config'],
    ['fsmonitor', ['config', 'core.fsmonitor', '/tmp/hook'], 'unsafe_git_config'],
    ['hooksPath', ['config', 'core.hooksPath', '/tmp/hooks'], 'unsafe_git_config'],
    ['credential helper', ['config', 'credential.helper', 'store'], 'unsafe_git_config'],
    ['include', ['config', 'include.path', '/tmp/other'], 'unsafe_git_config'],
    ['ssh command', ['config', 'core.sshCommand', 'ssh -i x'], 'unsafe_git_config'],
    ['shell alias', ['config', 'alias.x', '!id'], 'unsafe_git_config'],
  ])('refuses a repository whose own config launches programs (%s) before creating anything', async (_label, args, code) => {
    const fx = makeFixture()
    g(fx.root, ...(args as string[]))
    expect(await substrate(fx).prepareWorktree(input(fx))).toEqual({ status: 'refused', code })
    expect(readdirSync(fx.parent)).toEqual([])
  })

  it('refuses a missing, symlinked, non-directory, non-canonical or non-repository root, and a linked worktree used as root', async () => {
    const missing = makeFixture({ approvedLocalRoot: '/nonexistent/sdf1c3-root' })
    expect(await substrate(missing).prepareWorktree(input(missing))).toEqual({ status: 'refused', code: 'root_missing' })

    const linked = makeFixture()
    symlinkSync(linked.root, join(linked.base, 'root-link'))
    const viaLink = { ...linked, repo: { ...linked.repo, approvedLocalRoot: join(linked.base, 'root-link') } }
    expect(await substrate(viaLink).prepareWorktree(input(viaLink))).toEqual({ status: 'refused', code: 'root_is_symlink' })

    const file = makeFixture(); writeFileSync(join(file.base, 'afile'), 'x')
    const asFile = { ...file, repo: { ...file.repo, approvedLocalRoot: join(file.base, 'afile') } }
    expect(await substrate(asFile).prepareWorktree(input(asFile))).toEqual({ status: 'refused', code: 'root_not_directory' })

    const viaAncestor = makeFixture()
    symlinkSync(viaAncestor.base, join(tmpdir(), `sdf1c3-anc-${process.pid}`)); cleanups.push(() => rmSync(join(tmpdir(), `sdf1c3-anc-${process.pid}`), { force: true }))
    const ancestor = { ...viaAncestor, repo: { ...viaAncestor.repo, approvedLocalRoot: join(tmpdir(), `sdf1c3-anc-${process.pid}`, 'repo') } }
    expect(await substrate(ancestor).prepareWorktree(input(ancestor))).toEqual({ status: 'refused', code: 'root_not_canonical' })

    const empty = makeFixture(); const bare = join(empty.base, 'not-a-repo'); mkdirSync(bare)
    const notRepo = { ...empty, repo: { ...empty.repo, approvedLocalRoot: bare } }
    expect(await substrate(notRepo).prepareWorktree(input(notRepo))).toEqual({ status: 'refused', code: 'not_a_git_repository' })

    const main = makeFixture(); g(main.root, 'worktree', 'add', '-q', '-b', 'other', join(main.base, 'linked'))
    const asRoot = { ...main, repo: { ...main.repo, approvedLocalRoot: join(main.base, 'linked') } }
    expect(await substrate(asRoot).prepareWorktree(input(asRoot))).toEqual({ status: 'refused', code: 'not_main_checkout' })
  })

  it('refuses a missing, symlinked or non-canonical worktree parent and never creates it', async () => {
    const fx = makeFixture({ approvedWorktreeParent: '/nonexistent/sdf1c3-parent' })
    expect(await substrate(fx).prepareWorktree(input(fx))).toEqual({ status: 'refused', code: 'worktree_parent_invalid' })
    expect(existsSync('/nonexistent')).toBe(false)

    const a = makeFixture(); const elsewhere = join(a.base, 'elsewhere'); mkdirSync(elsewhere); symlinkSync(elsewhere, join(a.base, 'parent-link'))
    const viaLink = { ...a, repo: { ...a.repo, approvedWorktreeParent: join(a.base, 'parent-link') } }
    expect(await substrate(viaLink).prepareWorktree(input(viaLink))).toEqual({ status: 'refused', code: 'worktree_parent_invalid' })
    expect(readdirSync(elsewhere)).toEqual([])                                       // nothing escaped through the link

    const b = makeFixture(); const real = join(b.base, 'real-parent'); mkdirSync(real); symlinkSync(real, join(b.base, 'link-dir'))
    const nested = { ...b, repo: { ...b.repo, approvedWorktreeParent: join(b.base, 'link-dir', '.') } }
    expect(await substrate(nested).prepareWorktree(input(nested))).toEqual({ status: 'refused', code: 'worktree_parent_invalid' })
    const file = makeFixture(); writeFileSync(join(file.base, 'pfile'), 'x')
    const asFile = { ...file, repo: { ...file.repo, approvedWorktreeParent: join(file.base, 'pfile') } }
    expect(await substrate(asFile).prepareWorktree(input(asFile))).toEqual({ status: 'refused', code: 'worktree_parent_invalid' })
  })

  it('refuses every collision without touching the existing state (path, dangling link, file, branch, worktree)', async () => {
    const fx = makeFixture(); const s = substrate(fx)
    mkdirSync(join(fx.parent, WORK)); writeFileSync(join(fx.parent, WORK, 'keep.txt'), 'mine')
    expect(await s.prepareWorktree(input(fx))).toEqual({ status: 'refused', code: 'target_exists' })
    expect(readFileSync(join(fx.parent, WORK, 'keep.txt'), 'utf8')).toBe('mine')

    const dangling = makeFixture(); symlinkSync('/nonexistent/x', join(dangling.parent, WORK))
    expect(await substrate(dangling).prepareWorktree(input(dangling))).toEqual({ status: 'refused', code: 'target_exists' })
    expect(lstatSync(join(dangling.parent, WORK)).isSymbolicLink()).toBe(true)

    const asFile = makeFixture(); writeFileSync(join(asFile.parent, WORK), 'x')
    expect(await substrate(asFile).prepareWorktree(input(asFile))).toEqual({ status: 'refused', code: 'target_exists' })

    const branch = makeFixture(); g(branch.root, 'branch', `sdf1/${WORK}`, branch.sha1)
    expect(await substrate(branch).prepareWorktree(input(branch))).toEqual({ status: 'refused', code: 'branch_exists' })
    expect(g(branch.root, 'rev-parse', `refs/heads/sdf1/${WORK}`)).toBe(branch.sha1)  // untouched
    expect(readdirSync(branch.parent)).toEqual([])

    const twice = makeFixture(); const t = substrate(twice)
    expect((await t.prepareWorktree(input(twice))).status).toBe('prepared')
    expect(await t.prepareWorktree(input(twice))).toEqual({ status: 'refused', code: 'target_exists' })   // a second attempt never reuses the directory
  })

  it('a worktree elsewhere already holding the branch or the path is a conflict', async () => {
    const fx = makeFixture()
    g(fx.root, 'worktree', 'add', '-q', '-b', `sdf1/${WORK}`, join(fx.base, 'squatter'), fx.sha1)
    expect(await substrate(fx).prepareWorktree(input(fx))).toEqual({ status: 'refused', code: 'branch_exists' })
  })

  it('does not follow a symlink planted in the future target path', async () => {
    const fx = makeFixture(); const outside = join(fx.base, 'outside'); mkdirSync(outside)
    symlinkSync(outside, join(fx.parent, WORK))
    expect(await substrate(fx).prepareWorktree(input(fx))).toEqual({ status: 'refused', code: 'target_exists' })
    expect(readdirSync(outside)).toEqual([])
  })

  it('verifies after creation and, on any failed check, keeps the workspace (explicit_cleanup_only) and says so', async () => {
    const fx = makeFixture()
    const real = createIsolationSubstrateForTests({ repositories: { [REPO_ID]: fx.repo }, docker: null, dockerSocketPath: null })
    cleanups.push(() => real.dispose())
    const wrap = (mutate: (command: InfraCommand, result: InfraResult) => InfraResult): InfraRunner => ({ run: async command => mutate(command, await real.runner.run(command)) })
    const { prepareIsolatedWorktree } = await import('../../../code-broker/src/isolation/worktree')
    const lookup = (id: unknown) => (id === REPO_ID ? fx.repo : null)
    const dirty = await prepareIsolatedWorktree(input(fx), { runner: wrap((c, r) => (c.argv.includes('status') ? { ...r, stdout: ' M a.txt\0' } : r)), lookup })
    expect(dirty).toEqual({ status: 'failed', code: 'workspace_dirty', workspaceRetained: true })
    expect(existsSync(join(fx.parent, WORK, '.git'))).toBe(true)                    // NOT deleted

    const fx2 = makeFixture()
    const real2 = createIsolationSubstrateForTests({ repositories: { [REPO_ID]: fx2.repo }, docker: null, dockerSocketPath: null })
    cleanups.push(() => real2.dispose())
    const head = await prepareIsolatedWorktree(input(fx2), { runner: { run: async c => { const r = await real2.runner.run(c); return c.argv.includes('HEAD^{commit}') && c.cwd?.startsWith(fx2.parent) ? { ...r, stdout: `${fx2.sha1}\n` } : r } }, lookup: id => (id === REPO_ID ? fx2.repo : null) })
    expect(head).toEqual({ status: 'failed', code: 'head_mismatch', workspaceRetained: true })
    expect(existsSync(join(fx2.parent, WORK))).toBe(true)

    const fx3 = makeFixture()
    const real3 = createIsolationSubstrateForTests({ repositories: { [REPO_ID]: fx3.repo }, docker: null, dockerSocketPath: null })
    cleanups.push(() => real3.dispose())
    const branch = await prepareIsolatedWorktree(input(fx3), { runner: { run: async c => { const r = await real3.runner.run(c); return c.argv.includes('symbolic-ref') ? { ...r, stdout: 'refs/heads/main\n' } : r } }, lookup: id => (id === REPO_ID ? fx3.repo : null) })
    expect(branch).toEqual({ status: 'failed', code: 'branch_mismatch', workspaceRetained: true })

    const fx4 = makeFixture()
    const real4 = createIsolationSubstrateForTests({ repositories: { [REPO_ID]: fx4.repo }, docker: null, dockerSocketPath: null })
    cleanups.push(() => real4.dispose())
    const failing = await prepareIsolatedWorktree(input(fx4), { runner: { run: async c => (c.argv.includes('add') && c.argv.includes('worktree') ? { exitCode: 128, signal: null, stdout: '', stderr: 'boom', truncated: false, timedOut: false } : real4.runner.run(c)) }, lookup: id => (id === REPO_ID ? fx4.repo : null) })
    expect(failing).toEqual({ status: 'failed', code: 'worktree_add_failed', workspaceRetained: false })
  })

  it('production code never deletes a worktree, prunes, removes or fetches (retention is explicit-cleanup-only)', () => {
    for (const file of readdirSync(ISO)) {
      const source = code(join(ISO, file))
      if (file === 'process-runner.ts') { expect(source).toMatch(/rmSync\(home/); continue }      // only the broker's own isolated HOME
      expect(source, file).not.toMatch(/\brmSync\b|\brmdirSync\b|\bunlinkSync\b|\brenameSync\b|\bwriteFileSync\b|\bmkdirSync\b|\bcopyFileSync\b|['"]prune['"]|worktree remove|['"]remove['"]/)
    }
    expect(Object.keys(containment).filter(name => name !== 'FILESYSTEM_WRITES_ENABLED' && /write|unlink|remove|delete|mkdir|rename|copy|create(?!Path)/i.test(name))).toEqual([])
  })
})

describe('SDF-1C3A real-filesystem containment primitives', () => {
  function tree() {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'sdf1c3-fs-')))
    cleanups.push(() => rmSync(base, { recursive: true, force: true }))
    const root = join(base, 'root'); const outside = join(base, 'outside')
    mkdirSync(join(root, 'src', 'deep'), { recursive: true }); mkdirSync(outside)
    writeFileSync(join(root, 'src', 'a.ts'), 'a'); writeFileSync(join(outside, 'secret.txt'), 'top secret')
    symlinkSync(outside, join(root, 'src', 'escape-dir')); symlinkSync(join(outside, 'secret.txt'), join(root, 'src', 'escape-file.ts'))
    symlinkSync('a.ts', join(root, 'src', 'inner-link.ts')); symlinkSync('/nonexistent/target', join(root, 'src', 'dangling'))
    linkSync(join(outside, 'secret.txt'), join(root, 'src', 'hardlink.txt'))
    return { base, root, outside }
  }
  const refusal = (r: { ok: boolean; refusal?: string }) => (r.ok ? 'ok' : r.refusal)

  it('verifies canonical roots only', () => {
    const { root, base } = tree()
    expect(verifyCanonicalDirectory(root).ok).toBe(true)
    symlinkSync(root, join(base, 'rootlink'))
    for (const bad of [join(base, 'rootlink'), `${root}/`, 'relative', '', join(base, 'missing'), join(root, 'src', 'a.ts')]) expect(verifyCanonicalDirectory(bad).ok, bad).toBe(false)
    expect(verifyCanonicalDirectory(`${root}/../root`).ok).toBe(false)
    expect(verifyCanonicalDirectory(`${root}\0`).ok).toBe(false)
  })

  it('reads existing files only when no segment is a symlink and the realpath is the lexical path', () => {
    const { root } = tree()
    expect(verifyExistingPath(root, 'src/a.ts').ok).toBe(true)
    expect(verifyExistingPath(root, 'src').ok).toBe(true)
    expect(refusal(verifyExistingPath(root, 'src/escape-dir/secret.txt'))).toBe('symlink_in_path')   // ancestor symlink out of root
    expect(refusal(verifyExistingPath(root, 'src/escape-file.ts'))).toBe('symlink_in_path')            // final symlink out of root
    expect(refusal(verifyExistingPath(root, 'src/inner-link.ts'))).toBe('symlink_in_path')             // even an in-root link is not trusted
    expect(refusal(verifyExistingPath(root, 'src/dangling'))).toBe('symlink_in_path')
    expect(refusal(verifyExistingPath(root, 'src/missing.ts'))).toBe('target_missing')
    expect(refusal(verifyExistingPath(root, 'src/a.ts/child'))).toBe('not_a_directory_component')
    expect(refusal(verifyExistingPath(root, 'nope/deeper/x'))).toBe('target_missing')
  })

  it('a write-intent check additionally refuses hardlinks and non-regular files', () => {
    const { root } = tree()
    expect(verifyExistingPath(root, 'src/a.ts', 'write_check').ok).toBe(true)
    expect(refusal(verifyExistingPath(root, 'src/hardlink.txt', 'write_check'))).toBe('hardlinked_file')
    expect(refusal(verifyExistingPath(root, 'src/deep', 'write_check'))).toBe('not_regular_file')
  })

  it('verifies a prospective create against its deepest existing ancestor', () => {
    const { root } = tree()
    const ok = verifyCreatePath(root, 'src/deep/new.ts')
    expect(ok.ok).toBe(true)
    if (ok.ok) { expect(ok.value.parent).toBe(join(root, 'src', 'deep')); expect(ok.value.absolute).toBe(join(root, 'src', 'deep', 'new.ts')) }
    expect(refusal(verifyCreatePath(root, 'src/a.ts'))).toBe('target_exists')
    expect(refusal(verifyCreatePath(root, 'src/dangling'))).toBe('symlink_in_path')                  // a dangling link occupies the name
    expect(refusal(verifyCreatePath(root, 'src/escape-dir/new.txt'))).toBe('symlink_in_path')        // create THROUGH a link out of root
    expect(refusal(verifyCreatePath(root, 'src/escape-file.ts/x'))).toBe('symlink_in_path')
    expect(refusal(verifyCreatePath(root, 'missing/dir/new.ts'))).toBe('parent_missing')
    expect(refusal(verifyCreatePath(root, 'src/a.ts/child'))).toBe('not_a_directory_component')
    expect(existsSync(join(root, 'src', 'deep', 'new.ts'))).toBe(false)                              // verification creates nothing
  })

  it.each([
    ['NUL', 'src/a\0.ts', 'path_nul_or_control'], ['newline', 'src/a\n.ts', 'path_nul_or_control'], ['tab', 'src/\ta', 'path_nul_or_control'], ['DEL', 'src/a\u007f', 'path_nul_or_control'],
    ['parent traversal', '../outside/secret.txt', 'path_traversal'], ['embedded traversal', 'src/../../outside', 'path_traversal'], ['absolute', '/etc/passwd', 'path_absolute'], ['double slash', 'src//a.ts', 'path_dot_segment'],
    ['dot segment', 'src/./a.ts', 'path_dot_segment'], ['trailing slash', 'src/', 'path_dot_segment'], ['backslash', 'src\\a.ts', 'path_not_posix'], ['windows drive', 'C:/x', 'path_absolute'],
    ['empty', '', 'path_empty_or_ambiguous'], ['surrounding space', ' src/a.ts', 'path_empty_or_ambiguous'], ['non-NFC (NFD é)', 'src/cafe\u0301.ts', 'path_not_nfc'],
    ['.git', '.git/config', 'path_platform_denied'], ['nested .git', 'src/.git/hooks/pre-commit', 'path_platform_denied'], ['.GIT case', 'src/.GIT/config', 'path_platform_denied'], ['.env', '.env', 'path_platform_denied'],
    ['.env.local', 'app/.env.local', 'path_platform_denied'], ['.ENV.production', '.ENV.production', 'path_platform_denied'], ['.ssh', '.ssh/id_rsa', 'path_platform_denied'], ['.aws', '.aws/credentials', 'path_platform_denied'],
    ['secrets dir', 'config/secrets/app.json', 'path_platform_denied'], ['pem', 'certs/server.pem', 'path_platform_denied'], ['key', 'certs/server.KEY', 'path_platform_denied'], ['service account', 'sa/service-account-prod.json', 'path_platform_denied'],
    ['not a string', 5 as never, 'path_not_string'],
  ])('refuses %s', (_label, path, expected) => {
    const { root } = tree()
    expect(refusal(verifyExistingPath(root, path))).toBe(expected)
    expect(refusal(verifyCreatePath(root, path))).toBe(expected)
  })

  it('accepts ordinary NFC unicode names', () => {
    const { root } = tree()
    expect(normalizeRelativePath('src/caf\u00e9.ts')).toEqual({ ok: true, value: 'src/caf\u00e9.ts' })
    expect(verifyCreatePath(root, 'src/caf\u00e9.ts').ok).toBe(true)
  })

  it('is at least as strict as the SDF-1A web policy on the same corpus (never accepts what web refuses)', () => {
    const corpus = ['a', 'a/b', 'a//b', './a', 'a/.', 'a/..', '../a', '/a', '\\a', 'a\\b', ' a', 'a ', 'a\0', '', '.git', 'a/.git/x', '.env', '.ENV', 'a/.env.local', '.ssh/x', 'id_rsa', 'x.pem', 'x.key', 'service-account.json',
      'src/ok.ts', 'C:/x', 'a/b/../c', 'caf\u00e9', 'cafe\u0301', 'secrets/x', 'credentials', 'Credentials/x', 5, null, {}]
    for (const path of corpus) {
      const mine = normalizeRelativePath(path); const web = webNormalizePath(path)
      if (mine.ok) { expect(web.ok, JSON.stringify(path)).toBe(true); if (web.ok) expect(mine.value).toBe(web.value) }
    }
  })

  it('opens for reading with O_NOFOLLOW and refuses a final component that became a symlink', () => {
    const { root, outside } = tree()
    const opened = openForReadNoFollow(root, 'src/a.ts')
    expect(opened.ok).toBe(true)
    if (opened.ok) { expect(statSync(join(root, 'src/a.ts')).isFile()).toBe(true); require('node:fs').closeSync(opened.value.fd) }
    expect(refusal(openForReadNoFollow(root, 'src/escape-file.ts'))).toBe('symlink_in_path')
    expect(refusal(openForReadNoFollow(root, 'src/deep'))).not.toBe('ok')
    writeFileSync(join(root, 'swap.txt'), 'x')
    expect(openForReadNoFollow(root, 'swap.txt').ok).toBe(true)
    rmSync(join(root, 'swap.txt')); symlinkSync(join(outside, 'secret.txt'), join(root, 'swap.txt'))
    expect(refusal(openForReadNoFollow(root, 'swap.txt'))).toBe('symlink_in_path')
  })

  it('exposes no write API and says plainly that it is not a complete write-safe primitive', () => {
    expect(FILESYSTEM_WRITES_ENABLED).toBe(false)
    expect(Object.keys(containment).sort()).toEqual([
      'FILESYSTEM_RESIDUAL_RISK', 'FILESYSTEM_WRITES_ENABLED', 'PLATFORM_DENIED_SEGMENTS', 'normalizeRelativePath', 'openForReadNoFollow', 'verifyCanonicalDirectory', 'verifyCreatePath', 'verifyExistingPath',
    ])
    const source = readFileSync(join(ISO, 'fs-containment.ts'), 'utf8')
    expect(source).not.toMatch(/O_WRONLY|O_RDWR|O_CREAT|writeFile|appendFile|createWriteStream|mkdir|rmSync|unlinkSync|renameSync|symlinkSync|linkSync|copyFile|truncate/)
  })
})

describe('SDF-1C3A SandboxSpec and Docker command construction', () => {
  it('pins an immutable image digest and forbids every floating reference', () => {
    expect(SANDBOX_PROBE_IMAGE).toBe(`docker.io/library/alpine@${SANDBOX_PROBE_IMAGE_DIGEST}`)
    expect(SANDBOX_PROBE_IMAGE_DIGEST).toMatch(/^sha256:[a-f0-9]{64}$/)
    const create = (image: string) => {
      const argv = [...buildProbeCreateCommand(newProbeName()).argv]
      argv[argv.indexOf(SANDBOX_PROBE_IMAGE)] = image
      return () => brokerCommand({ tool: 'docker', argv })
    }
    for (const floating of ['alpine', 'alpine:latest', 'alpine:3.22', 'docker.io/library/alpine:latest', 'node:22', 'docker.io/library/node:22', 'ghcr.io/x/y@sha256:' + 'a'.repeat(64),
      'docker.io/library/alpine@sha256:' + 'a'.repeat(63), 'docker.io/library/alpine@sha256:' + 'A'.repeat(64), 'docker.io/library/alpine@md5:' + 'a'.repeat(32), 'evil.example/alpine@sha256:' + 'a'.repeat(64), '--privileged']) {
      expect(create(floating), floating).toThrow(InfraCommandRefused)
    }
    expect(create('docker.io/library/alpine@sha256:' + 'a'.repeat(64))).not.toThrow()      // shape-valid digests pass; the BUILDER pins the exact one
    expect(SANDBOX_SPEC.image).toBe(SANDBOX_PROBE_IMAGE)
  })

  it('the create command carries every required protection and no mount, socket, secret or host access', () => {
    const argv = [...buildProbeCreateCommand('omnira-sdf1c3-probe-0123456789ab').argv]
    const at = (flag: string) => argv[argv.indexOf(flag) + 1]
    expect(argv[0]).toBe('create')
    expect(argv).toContain('--pull=never')
    expect(at('--network')).toBe('none')
    expect(at('--cap-drop')).toBe('ALL')
    expect(at('--security-opt')).toBe('no-new-privileges')
    expect(argv).toContain('--read-only')
    expect(at('--user')).toBe('10001:10001')
    expect(at('--pids-limit')).toBe('64')
    expect(at('--memory')).toBe('128m')
    expect(at('--memory-swap')).toBe('128m')
    expect(at('--cpus')).toBe('0.5')
    expect(at('--workdir')).toBe('/tmp')
    expect(at('--tmpfs')).toMatch(/^\/tmp:rw,noexec,nosuid,nodev,size=16m/)
    expect(argv.filter(a => a === '--env')).toHaveLength(2)
    expect(argv.join(' ')).not.toMatch(/docker\.sock|\/var\/run|--privileged|--volume|--mount|--device|--cap-add|--pid\b|--net(?:work)?[= ]host|--env-file|--publish|-p |-v |--add-host|--userns|--ipc[= ]host|--gpus|seccomp=unconfined|apparmor=unconfined|--pull[= ](?:always|missing)/)
    expect(argv.slice(argv.indexOf(SANDBOX_PROBE_IMAGE))).toEqual([SANDBOX_PROBE_IMAGE, 'id'])
    expect(argv.every(arg => !/^(?:-v|--volume|--mount)/.test(arg))).toBe(true)
    expect(SANDBOX_SPEC).toMatchObject({ hostBindMounts: [], namedVolumes: [], dockerSocketMounted: false, privileged: false, readOnlyRootfs: true, noNewPrivileges: true, pullPolicy: 'never', workspaceMountPolicy: 'named_volume_only' })
  })

  it('accepts no caller-controlled flag, value, command, image, name or docker verb', () => {
    const good = [...buildProbeCreateCommand(newProbeName()).argv]
    const mutate = (fn: (argv: string[]) => string[]) => () => brokerCommand({ tool: 'docker', argv: fn([...good]) })
    const swap = (flag: string, value: string) => (argv: string[]) => { argv[argv.indexOf(flag) + 1] = value; return argv }
    const drop = (flag: string, hasValue = true) => (argv: string[]) => { const i = argv.indexOf(flag); argv.splice(i, hasValue ? 2 : 1); return argv }
    const cases: Record<string, (argv: string[]) => string[]> = {
      'network host': swap('--network', 'host'), 'network bridge': swap('--network', 'bridge'), 'cap-drop none': swap('--cap-drop', 'NET_RAW'), 'security-opt unconfined': swap('--security-opt', 'seccomp=unconfined'),
      'root user': swap('--user', '0:0'), 'named root': swap('--user', 'root'), 'uid 0 gid 1': swap('--user', '0:1'), 'small uid': swap('--user', '1:1'), 'pids unlimited': swap('--pids-limit', '-1'), 'pids zero': swap('--pids-limit', '0'),
      'huge pids': swap('--pids-limit', '99999'), 'memory unlimited': swap('--memory', '0'), 'memory gigantic': swap('--memory', '99999m'), 'cpus 0 (unlimited)': swap('--cpus', '0'), 'cpus 64': swap('--cpus', '64'),
      'tmpfs exec': swap('--tmpfs', '/tmp:rw,exec,size=16m'), 'tmpfs elsewhere': swap('--tmpfs', '/etc:rw,noexec,nosuid,nodev,size=16m'), 'workdir root': swap('--workdir', '/'), 'workdir host-ish': swap('--workdir', '/host'),
      'secret env': (argv: string[]) => [...argv.slice(0, 1), '--env', 'ANTHROPIC_API_KEY=sk', ...argv.slice(1)], 'env passthrough': (argv: string[]) => [...argv.slice(0, 1), '--env', 'HOME', ...argv.slice(1)],
      'entrypoint elsewhere': swap('--entrypoint', '/tmp/evil'), 'entrypoint sh': swap('--entrypoint', '/bin/sh'), 'other name': swap('--name', 'evil'), 'label spoof': swap('--label', 'x=y'),
      'ipc host': swap('--ipc', 'host'), 'restart always': swap('--restart', 'always'),
      'privileged': (argv: string[]) => [...argv.slice(0, 1), '--privileged', ...argv.slice(1)], 'bind mount -v': (argv: string[]) => [...argv.slice(0, 1), '-v', '/:/host', ...argv.slice(1)],
      'volume': (argv: string[]) => [...argv.slice(0, 1), '--volume', 'x:/y', ...argv.slice(1)], 'mount bind': (argv: string[]) => [...argv.slice(0, 1), '--mount', 'type=bind,src=/,dst=/h', ...argv.slice(1)],
      'docker socket': (argv: string[]) => [...argv.slice(0, 1), '--mount', 'type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock', ...argv.slice(1)],
      'device': (argv: string[]) => [...argv.slice(0, 1), '--device', '/dev/kvm', ...argv.slice(1)], 'cap-add': (argv: string[]) => [...argv.slice(0, 1), '--cap-add', 'SYS_ADMIN', ...argv.slice(1)],
      'pid host': (argv: string[]) => [...argv.slice(0, 1), '--pid', 'host', ...argv.slice(1)], 'publish port': (argv: string[]) => [...argv.slice(0, 1), '-p', '80:80', ...argv.slice(1)],
      'pull always': (argv: string[]) => argv.map(a => (a === '--pull=never' ? '--pull=always' : a)), 'unknown flag': (argv: string[]) => [...argv.slice(0, 1), '--dns', '8.8.8.8', ...argv.slice(1)],
      'extra command': (argv: string[]) => [...argv, 'sh', '-c', 'id'], 'shell metachar command': (argv: string[]) => [...argv.slice(0, -1), 'id;rm'], 'long command': (argv: string[]) => [...argv, 'a', 'b', 'c', 'd', 'e'],
      'no network protection': drop('--network'), 'no cap-drop': drop('--cap-drop'), 'no security-opt': drop('--security-opt'), 'no read-only': drop('--read-only', false), 'no user': drop('--user'), 'no pids': drop('--pids-limit'),
      'no memory': drop('--memory'), 'no cpus': drop('--cpus'), 'no pull policy': drop('--pull=never', false),
    }
    for (const [name, fn] of Object.entries(cases)) expect(mutate(fn), name).toThrow(InfraCommandRefused)
  })

  it('refuses every docker verb outside the closed set and every malformed target', () => {
    for (const sub of DOCKER_FORBIDDEN_SUBCOMMANDS) expect(() => brokerCommand({ tool: 'docker', argv: [sub, 'x'] }), sub).toThrow(/docker_subcommand_forbidden/)
    for (const sub of ['run', 'exec', 'cp', 'pull', 'build', 'commit', 'push', 'login', 'volume', 'network', 'save', 'load']) expect(() => brokerCommand({ tool: 'docker', argv: [sub] })).toThrow(/docker_subcommand_forbidden/)
    expect(() => brokerCommand({ tool: 'docker', argv: ['ps'] })).toThrow(/docker_subcommand_not_allowed/)
    expect(() => brokerCommand({ tool: 'docker', argv: ['image', 'pull', 'alpine'] })).toThrow(/docker_image_action_not_allowed/)
    expect(() => brokerCommand({ tool: 'docker', argv: ['image', 'inspect', 'alpine:latest', '--format', '{{json .}}'] })).toThrow(/docker_image_inspect_shape/)
    expect(() => brokerCommand({ tool: 'docker', argv: ['info'] })).toThrow(/docker_info_shape/)
    expect(() => brokerCommand({ tool: 'docker', argv: ['inspect', 'abc', '--format', '{{json .}}'] })).toThrow(/docker_inspect_shape/)
    expect(() => brokerCommand({ tool: 'docker', argv: ['start', 'abc'] })).toThrow(/docker_start_shape/)
    expect(() => brokerCommand({ tool: 'docker', argv: ['rm', '-f', 'someone-elses-container'] })).toThrow(/docker_rm_shape/)
    expect(() => brokerCommand({ tool: 'docker', argv: ['rm', '-f', 'a'.repeat(64), 'b'.repeat(64)] })).toThrow(/docker_rm_shape/)
    expect(() => brokerCommand({ tool: 'docker', argv: ['info', '--format', '{{json .}}', '-H', 'tcp://evil:2375'] })).toThrow(InfraCommandRefused)
    expect(() => brokerCommand({ tool: 'docker', argv: ['inspect', 'a'.repeat(64), '--format', '{{json .}}', '/var/run/docker.sock'] })).toThrow(InfraCommandRefused)
    expect(() => dockerCommands.inspectContainer('../../etc')).toThrow()
    expect(() => dockerCommands.remove('x; rm -rf /')).toThrow()
    expect(() => buildProbeCreateCommand('evil-name')).toThrow(/broker-generated/)
    expect(newProbeName(() => Buffer.from('0123456789ab', 'hex'))).toBe('omnira-sdf1c3-probe-0123456789ab')
    const builder = readFileSync(join(ISO, 'sandbox-spec.ts'), 'utf8').match(/export function buildProbeCreateCommand[\s\S]*?\n}\n/)![0]
    expect(builder).toMatch(/function buildProbeCreateCommand\(name: string\)/)          // the ONLY parameter is the generated name
  })

  it('there is no way to smuggle a shell, host bind, docker socket or arbitrary argument anywhere in the isolation sources', () => {
    for (const file of readdirSync(ISO)) {
      const source = code(join(ISO, file))
      expect(source, file).not.toMatch(/shell:\s*true|['"`]\/bin\/(?:ba|z|da|k|c|tc)?sh['"`]|\bsh\s+-c\b|\bbash\s+-c\b|\bzsh\s+-c\b/)
      if (file !== 'process-runner.ts') expect(source, file).not.toMatch(/type=bind|['"]-v['"]\s*,|['"]--volume['"]\s*,|['"]--mount['"]\s*,/)     // process-runner.ts only NAMES them, in its refusal list
    }
    const spec = code(join(ISO, 'sandbox-spec.ts'))
    expect(spec).not.toMatch(/['"]--privileged['"]|['"]--cap-add['"]|['"]--device['"]|['"]--pid['"]|['"]-p['"]|['"]--publish['"]/)
    expect(spec).not.toMatch(/docker\.sock/)                                   // the spec never even names the socket
  })
})

describe('SDF-1C3A container inspection verifier fails when any protection disappears', () => {
  // Modelled on a real `docker inspect` of the created (unstarted) probe container.
  const IMAGE_ID = 'sha256:33bee74c45f307e3268adc2010c0f55c48e7a6041e12cd12432bb1a46e498e43'
  const base = () => ({
    Image: IMAGE_ID, Mounts: [],
    HostConfig: {
      NetworkMode: 'none', ReadonlyRootfs: true, CapDrop: ['ALL'], CapAdd: null, SecurityOpt: ['no-new-privileges'], PidsLimit: 64, Memory: 134217728, MemorySwap: 134217728, NanoCpus: 500000000,
      Binds: null, Tmpfs: { '/tmp': 'rw,noexec,nosuid,nodev,size=16m,mode=1777' }, IpcMode: 'private', PidMode: '', UsernsMode: '', UTSMode: '', CgroupnsMode: 'private', Privileged: false,
      Devices: [], DeviceRequests: null, PortBindings: {}, Mounts: null,
    },
    Config: {
      User: '10001:10001', Image: SANDBOX_PROBE_IMAGE, Env: ['HOME=/tmp', 'LANG=C.UTF-8', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'], Entrypoint: ['/bin/busybox'], Cmd: ['id'],
      Labels: { 'omnira.sdf1c3.probe': '1' }, WorkingDir: '/tmp', ExposedPorts: null,
    },
  })
  const expected = { imageId: IMAGE_ID, swapLimitSupported: true }

  it('passes the genuine shape', () => {
    expect(verifyProbeContainerInspect(base(), expected)).toEqual([])
    expect(verifyProbeContainerInspect(base(), { ...expected, swapLimitSupported: false })).toEqual([])
  })

  it.each([
    ['network bridge', (d: any) => { d.HostConfig.NetworkMode = 'bridge' }, 'network_not_none'],
    ['network host', (d: any) => { d.HostConfig.NetworkMode = 'host' }, 'network_not_none'],
    ['writable rootfs', (d: any) => { d.HostConfig.ReadonlyRootfs = false }, 'rootfs_writable'],
    ['root user', (d: any) => { d.Config.User = '0:0' }, 'user_not_expected_non_root'],
    ['empty user (image default root)', (d: any) => { d.Config.User = '' }, 'user_not_expected_non_root'],
    ['cap-drop missing', (d: any) => { d.HostConfig.CapDrop = null }, 'cap_drop_not_all'],
    ['cap-drop partial', (d: any) => { d.HostConfig.CapDrop = ['NET_RAW'] }, 'cap_drop_not_all'],
    ['cap-add', (d: any) => { d.HostConfig.CapAdd = ['SYS_ADMIN'] }, 'cap_add_present'],
    ['privileged', (d: any) => { d.HostConfig.Privileged = true }, 'privileged'],
    ['no-new-privileges missing', (d: any) => { d.HostConfig.SecurityOpt = null }, 'no_new_privileges_missing'],
    ['seccomp unconfined', (d: any) => { d.HostConfig.SecurityOpt = ['no-new-privileges', 'seccomp=unconfined'] }, 'unconfined_security_profile'],
    ['apparmor unconfined', (d: any) => { d.HostConfig.SecurityOpt = ['no-new-privileges', 'apparmor=unconfined'] }, 'unconfined_security_profile'],
    ['pids limit missing', (d: any) => { d.HostConfig.PidsLimit = null }, 'pids_limit_missing_or_wrong'],
    ['pids limit unlimited', (d: any) => { d.HostConfig.PidsLimit = -1 }, 'pids_limit_missing_or_wrong'],
    ['memory limit missing', (d: any) => { d.HostConfig.Memory = 0 }, 'memory_limit_missing_or_wrong'],
    ['swap unbounded', (d: any) => { d.HostConfig.MemorySwap = -1 }, 'swap_not_bounded'],
    ['cpu limit missing', (d: any) => { d.HostConfig.NanoCpus = 0 }, 'cpu_limit_missing_or_wrong'],
    ['host bind (Binds)', (d: any) => { d.HostConfig.Binds = ['/:/host'] }, 'host_bind_mount_present'],
    ['host bind (Mounts)', (d: any) => { d.Mounts = [{ Type: 'bind', Source: '/Users/x/repo', Destination: '/work' }] }, 'host_bind_mount_present'],
    ['named volume mount (not allowed in this phase)', (d: any) => { d.Mounts = [{ Type: 'volume', Name: 'ws', Destination: '/workspace' }] }, 'mount_present'],
    ['docker socket', (d: any) => { d.Mounts = [{ Type: 'bind', Source: '/var/run/docker.sock', Destination: '/var/run/docker.sock' }] }, 'docker_socket_referenced'],
    ['docker socket via Binds', (d: any) => { d.HostConfig.Binds = ['/var/run/docker.sock:/var/run/docker.sock'] }, 'docker_socket_referenced'],
    ['extra tmpfs', (d: any) => { d.HostConfig.Tmpfs['/var/tmp'] = 'rw' }, 'unexpected_tmpfs'],
    ['tmpfs executable', (d: any) => { d.HostConfig.Tmpfs['/tmp'] = 'rw,exec,size=16m' }, 'tmpfs_not_noexec'],
    ['no tmpfs', (d: any) => { d.HostConfig.Tmpfs = null }, 'unexpected_tmpfs'],
    ['env leak', (d: any) => { d.Config.Env.push('AWS_ACCESS_KEY_ID=AKIA') }, 'env_not_allowlisted'],
    ['secret-like env', (d: any) => { d.Config.Env.push('API_TOKEN=x') }, 'secret_like_env'],
    ['other image reference', (d: any) => { d.Config.Image = 'alpine:latest' }, 'image_reference_mismatch'],
    ['other image id', (d: any) => { d.Image = 'sha256:' + 'b'.repeat(64) }, 'image_id_mismatch'],
    ['device', (d: any) => { d.HostConfig.Devices = [{ PathOnHost: '/dev/kvm' }] }, 'devices_present'],
    ['host pid', (d: any) => { d.HostConfig.PidMode = 'host' }, 'host_namespace_shared'],
    ['host ipc', (d: any) => { d.HostConfig.IpcMode = 'host' }, 'host_namespace_shared'],
    ['host userns', (d: any) => { d.HostConfig.UsernsMode = 'host' }, 'host_namespace_shared'],
    ['host uts', (d: any) => { d.HostConfig.UTSMode = 'host' }, 'host_namespace_shared'],
    ['published port', (d: any) => { d.HostConfig.PortBindings = { '80/tcp': [{ HostPort: '80' }] } }, 'ports_published'],
    ['unlabelled', (d: any) => { d.Config.Labels = {} }, 'not_probe_labelled'],
    ['workdir', (d: any) => { d.Config.WorkingDir = '/' }, 'workdir_mismatch'],
    ['different entrypoint', (d: any) => { d.Config.Entrypoint = ['/bin/sh'] }, 'entrypoint_or_cmd_mismatch'],
    ['different command', (d: any) => { d.Config.Cmd = ['sh', '-c', 'id'] }, 'entrypoint_or_cmd_mismatch'],
  ])('flags: %s', (_label, mutate, violation) => {
    const doc = base(); (mutate as (d: unknown) => void)(doc)
    expect(verifyProbeContainerInspect(doc, expected)).toContain(violation as string)
  })

  it('treats a non-object, an empty object and garbage as violations, never as a pass', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}]) expect(verifyProbeContainerInspect(bad, expected), JSON.stringify(bad)).not.toEqual([])
    expect(verifyProbeContainerInspect({ HostConfig: {}, Config: {} }, expected).length).toBeGreaterThan(10)
  })
})

describe('SDF-1C3A Docker host proof (VM-backed Docker Desktop required for production)', () => {
  const desktop = { OSType: 'linux', OperatingSystem: 'Docker Desktop', Name: 'docker-desktop', KernelVersion: '6.12.76-linuxkit', Architecture: 'aarch64', ServerVersion: '29.6.2', SwapLimit: true }
  const ubuntu = { OSType: 'linux', OperatingSystem: 'Ubuntu 24.04.1 LTS', Name: 'runner', KernelVersion: '6.8.0-1017-azure', Architecture: 'x86_64', ServerVersion: '27.0.1', SwapLimit: false }

  it('recognises Docker Desktop on macOS as VM-backed Linux and nothing else as production-grade', () => {
    const mac = classifyDockerInfo(desktop, 'darwin')
    expect(mac).toMatchObject({ ok: true, provider: 'docker_desktop', osType: 'linux', vmBacked: true, swapLimitSupported: true })
    expect(satisfiesProductionIsolation(mac)).toBe(true)
    const ci = classifyDockerInfo(ubuntu, 'linux')
    expect(ci).toMatchObject({ ok: true, provider: 'native_linux', vmBacked: false })
    expect(satisfiesProductionIsolation(ci)).toBe(false)
    expect(satisfiesProductionIsolation(classifyDockerInfo(desktop, 'linux'))).toBe(false)              // Desktop-shaped info on a non-mac host is not the production target
    expect(satisfiesProductionIsolation(classifyDockerInfo({ ...desktop, OperatingSystem: 'Colima', Name: 'colima' }, 'darwin'))).toBe(false)
    expect(satisfiesProductionIsolation(classifyDockerInfo({ ...desktop, KernelVersion: '6.8.0-generic' }, 'darwin'))).toBe(false)
    expect(satisfiesProductionIsolation(classifyDockerInfo({ ...desktop, OperatingSystem: 'Docker Desktop', Name: 'evil' }, 'darwin'))).toBe(false)
    expect(classifyDockerInfo({ ...desktop, OSType: 'windows' }, 'win32')).toEqual({ ok: false, reason: 'not_linux_containers' })
    for (const junk of [null, undefined, 5, 'x', [], {}]) expect(classifyDockerInfo(junk, 'darwin').ok, JSON.stringify(junk)).toBe(false)
    expect(satisfiesProductionIsolation({ ok: false, reason: 'daemon_unreachable' })).toBe(false)
    expect(JSON.stringify(mac)).not.toContain('docker-desktop')                                          // identity is hashed, not published
  })

  it('derives the daemon socket only from a fixed host-side list (no DOCKER_HOST, no remote, no other socket)', () => {
    expect(dockerSocketCandidates('darwin', '/Users/u')).toEqual(['/Users/u/.docker/run/docker.sock'])
    expect(dockerSocketCandidates('linux')).toEqual(['/var/run/docker.sock'])
    expect(dockerSocketCandidates('win32')).toEqual([])
    vi.stubEnv('DOCKER_HOST', 'tcp://evil.example:2375')
    const sock = { isSocket: () => true, uid: 501 }
    expect(resolveDockerSocket('darwin', { lstat: () => sock }, 501, '/Users/u')).toBe('/Users/u/.docker/run/docker.sock')
    expect(resolveDockerSocket('darwin', { lstat: () => sock }, 502, '/Users/u')).toBeNull()             // not owned by the logged-in user
    expect(resolveDockerSocket('darwin', { lstat: () => ({ isSocket: () => false, uid: 501 }) }, 501, '/Users/u')).toBeNull()
    expect(resolveDockerSocket('darwin', { lstat: () => { throw new Error('ENOENT') } }, 501, '/Users/u')).toBeNull()
    expect(resolveDockerSocket('win32', { lstat: () => sock }, 501)).toBeNull()
    vi.unstubAllEnvs()
    expect(code(join(ISO, 'docker-host.ts'))).not.toMatch(/DOCKER_HOST|DOCKER_CONTEXT|process\.env/)
  })
})

describe('SDF-1C3A health-probe orchestration (fake Docker; the real daemon is exercised in the integration suite)', () => {
  const IMAGE_ID = 'sha256:33bee74c45f307e3268adc2010c0f55c48e7a6041e12cd12432bb1a46e498e43'
  const desktop = { OSType: 'linux', OperatingSystem: 'Docker Desktop', Name: 'docker-desktop', KernelVersion: '6.12.76-linuxkit', Architecture: 'aarch64', ServerVersion: '29.6.2', SwapLimit: true }
  const ubuntu = { OSType: 'linux', OperatingSystem: 'Ubuntu', Name: 'runner', KernelVersion: '6.8.0-azure', Architecture: 'x86_64', ServerVersion: '27', SwapLimit: false }
  const CID = 'c'.repeat(64)
  const goodInspect = () => ({
    Image: IMAGE_ID, Mounts: [],
    HostConfig: { NetworkMode: 'none', ReadonlyRootfs: true, CapDrop: ['ALL'], CapAdd: null, SecurityOpt: ['no-new-privileges'], PidsLimit: 64, Memory: 134217728, MemorySwap: 134217728, NanoCpus: 500000000, Binds: null, Tmpfs: { '/tmp': 'rw,noexec,nosuid,nodev,size=16m,mode=1777' }, IpcMode: 'private', PidMode: '', UsernsMode: '', UTSMode: '', CgroupnsMode: 'private', Privileged: false, Devices: [], DeviceRequests: null, PortBindings: {}, Mounts: null },
    Config: { User: '10001:10001', Image: SANDBOX_PROBE_IMAGE, Env: ['HOME=/tmp', 'LANG=C.UTF-8', 'PATH=/bin'], Entrypoint: ['/bin/busybox'], Cmd: ['id'], Labels: { 'omnira.sdf1c3.probe': '1' }, WorkingDir: '/tmp', ExposedPorts: null },
  })
  const ok = (stdout: string, over: Partial<InfraResult> = {}): InfraResult => ({ exitCode: 0, signal: null, stdout, stderr: '', truncated: false, timedOut: false, ...over })

  function fakeDocker(opts: { info?: unknown; imageOk?: boolean; inspect?: unknown; probeOut?: string; createFails?: boolean }) {
    const log: string[] = []
    const runner: InfraRunner = {
      run: async command => {
        const [verb, second] = command.argv
        log.push(verb === 'image' ? 'image-inspect' : verb)
        if (verb === 'info') return ok(JSON.stringify(opts.info ?? desktop))
        if (verb === 'image') return opts.imageOk === false ? ok('', { exitCode: 1 }) : ok(JSON.stringify({ Id: IMAGE_ID, RepoDigests: [`alpine@${SANDBOX_PROBE_IMAGE_DIGEST}`] }))
        if (verb === 'create') { void second; return opts.createFails ? ok('', { exitCode: 125 }) : ok(`${CID}\n`) }
        if (verb === 'inspect') return ok(JSON.stringify(opts.inspect ?? goodInspect()))
        if (verb === 'start') return ok(opts.probeOut ?? 'uid=10001 gid=10001\n')
        if (verb === 'rm') return ok(`${command.argv[2]}\n`)
        throw new Error(`unexpected docker verb ${verb}`)
      },
    }
    return { runner, log }
  }

  it('runs the full sequence — never pulls — and removes only the container it made', async () => {
    const { runner, log } = fakeDocker({})
    const result = await runSandboxHealthProbe(runner, { requireVmBacked: true, hostPlatform: 'darwin' })
    expect(result).toMatchObject({ status: 'ok', probe: { uid: 10001, gid: 10001 }, containerRemoved: true, image: SANDBOX_PROBE_IMAGE })
    expect(log).toEqual(['info', 'image-inspect', 'create', 'inspect', 'start', 'rm'])
    expect(log).not.toContain('pull')
    if (result.status === 'ok') expect(result.inspected).toContain('network=none')
  })

  it('blocks — honestly — when the daemon is not the VM-backed production target', async () => {
    const { runner, log } = fakeDocker({ info: ubuntu })
    const blocked = await runSandboxHealthProbe(runner, { requireVmBacked: true, hostPlatform: 'linux' })
    expect(blocked.status).toBe('blocked_not_vm_backed')
    expect(log).toEqual(['info'])                                                     // nothing was created
    const ci = await runSandboxHealthProbe(fakeDocker({ info: ubuntu }).runner, { requireVmBacked: false, hostPlatform: 'linux' })
    expect(ci.status).toBe('ok')
    if (ci.status === 'ok') expect(ci.host).toMatchObject({ provider: 'native_linux', vmBacked: false })   // reported as what it is
    expect((await runSandboxHealthProbe(fakeDocker({ info: { ...desktop, OSType: 'windows' } }).runner, { requireVmBacked: false, hostPlatform: 'win32' })).status).toBe('blocked_not_linux_containers')
    expect((await runSandboxHealthProbe(fakeDocker({ info: 'not json' as never }).runner, { requireVmBacked: false })).status).toBe('blocked_info_unparseable')
  })

  it('never pulls an image: a missing pinned image blocks with the provisioning hint and creates nothing', async () => {
    const { runner, log } = fakeDocker({ imageOk: false })
    expect((await runSandboxHealthProbe(runner, { requireVmBacked: false, hostPlatform: 'darwin' })).status).toBe('blocked_image_not_provisioned')
    expect(log).toEqual(['info', 'image-inspect'])
    const wrongDigest: InfraRunner = { run: async c => (c.argv[0] === 'image' ? ok(JSON.stringify({ Id: IMAGE_ID, RepoDigests: ['alpine@sha256:' + 'a'.repeat(64)] })) : fakeDocker({}).runner.run(c)) }
    expect((await runSandboxHealthProbe(wrongDigest, { requireVmBacked: false, hostPlatform: 'darwin' })).status).toBe('blocked_image_not_provisioned')
  })

  it('removes the container WITHOUT starting it when inspection finds a missing protection', async () => {
    const weak = goodInspect(); weak.HostConfig.NetworkMode = 'bridge'; weak.HostConfig.ReadonlyRootfs = false
    const { runner, log } = fakeDocker({ inspect: weak })
    const result = await runSandboxHealthProbe(runner, { requireVmBacked: false, hostPlatform: 'darwin' })
    expect(result).toMatchObject({ status: 'failed_inspection', containerRemoved: true })
    if (result.status === 'failed_inspection') expect(result.violations).toEqual(expect.arrayContaining(['network_not_none', 'rootfs_writable']))
    expect(log).toEqual(['info', 'image-inspect', 'create', 'inspect', 'rm'])         // no 'start'
  })

  it('fails the probe on unexpected output, an unexpected user, or a failed create', async () => {
    expect((await runSandboxHealthProbe(fakeDocker({ probeOut: 'uid=0 gid=0(root)\n' }).runner, { requireVmBacked: false, hostPlatform: 'darwin' })).status).toBe('probe_failed')
    expect((await runSandboxHealthProbe(fakeDocker({ probeOut: 'hello\n' }).runner, { requireVmBacked: false, hostPlatform: 'darwin' })).status).toBe('probe_failed')
    const { runner, log } = fakeDocker({ createFails: true })
    expect((await runSandboxHealthProbe(runner, { requireVmBacked: false, hostPlatform: 'darwin' })).status).toBe('create_failed')
    expect(log).toEqual(['info', 'image-inspect', 'create', 'rm'])                     // cleanup by broker-generated name only
  })
})

describe('SDF-1C3A boundary: no production caller, no route, no CLI command, no migration, no execution', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? (name === 'node_modules' || name === '.next' ? [] : walk(path)) : /\.(?:ts|tsx|mjs)$/.test(name) ? [path] : []
  })

  it('nothing outside the isolation directory (and tests) imports the substrate', () => {
    const importers = [...walk(resolve(ROOT, 'apps/code-broker/src')), ...walk(resolve(ROOT, 'apps/web/app')), ...walk(resolve(ROOT, 'apps/web/lib/atlas')), ...walk(resolve(ROOT, 'apps/web/components'))]
      .filter(file => !file.includes('/code-broker/src/isolation/'))
      .filter(file => /isolation\/(?:substrate|worktree|sandbox|docker-host|process-runner|git-commands|repository-proof|fs-containment|toolchain)/.test(readFileSync(file, 'utf8')))
    expect(importers).toEqual([])
  })

  it('keeps the CLI at generate | enroll | diagnostic and adds no operational command', () => {
    const cli = readFileSync(resolve(ROOT, 'apps/code-broker/src/cli.ts'), 'utf8')
    expect(cli).toContain("throw new Error('usage: generate | enroll | diagnostic')")
    expect(cli).not.toMatch(/isolation|worktree|sandbox|docker|prepare|claim|heartbeat|discover|run\b|execute/i)
  })

  it('adds no broker route, and the route set is exactly the 1C2 control channel', () => {
    const api = resolve(ROOT, 'apps/web/app/api/atlas/code-work/broker')
    expect(walk(api).map(file => file.slice(api.length + 1)).sort()).toEqual(['claim/recover/route.ts', 'claim/route.ts', 'discover/route.ts', 'enroll/route.ts', 'heartbeat/route.ts', 'identity/route.ts'])
    for (const name of ['context', 'evidence', 'transition', 'execute', 'command', 'patch', 'prepare', 'worktree', 'sandbox']) expect(existsSync(join(api, name)), name).toBe(false)
  })

  it('adds no migration: the canonical set still ends at the 1C2 migration', () => {
    const migrations = readdirSync(resolve(ROOT, 'apps/web/supabase/migrations')).filter(name => name.endsWith('.sql')).sort()
    expect(migrations.length).toBe(100)
    expect(migrations[migrations.length - 1]).toBe('20260924140000_sdf1c2_broker_control_channel.sql')
  })

  it('contains no model/provider, HTTP, database, credential or repository-content code', () => {
    for (const file of readdirSync(ISO)) {
      const source = code(join(ISO, file))
      expect(source, file).not.toMatch(/@anthropic|from ['"]openai['"]|\banthropic\b|claude-|supabase|service[_-]?role|createAdminClient|\bfetch\(|node:https?|node:net|node:tls|XMLHttpRequest|WebSocket/i)
      expect(source, file).not.toMatch(/docker cp|docker exec|docker run\b|\btar\b.*-[cx]|type=bind/)
      expect(source, file).not.toMatch(/readFileSync\([^)]*(?:worktree|workspace)/)
    }
  })

  it('only the approved isolation modules can ISSUE an InfraCommand: brokerCommand is not reachable from any other production module', () => {
    const production = [...walk(resolve(ROOT, 'apps/code-broker/src')), ...walk(resolve(ROOT, 'apps/web/app')), ...walk(resolve(ROOT, 'apps/web/lib')), ...walk(resolve(ROOT, 'apps/web/components')), ...walk(resolve(ROOT, 'apps/web/scripts'))]
      .filter(file => !file.includes('/lib/qa/') && !/\.test\.tsx?$/.test(file))
    const users = production.filter(file => /\bbrokerCommand\b/.test(code(file))).map(file => file.slice(ROOT.length + 1)).sort()
    expect(users).toEqual([
      'apps/code-broker/src/isolation/docker-host.ts', 'apps/code-broker/src/isolation/git-commands.ts', 'apps/code-broker/src/isolation/process-runner.ts', 'apps/code-broker/src/isolation/sandbox-spec.ts',
    ])
    // …and nothing outside the isolation directory imports the runner module at all (protocol, CLI, HTTP, routes, model, WorkPackage code).
    const importers = production.filter(file => !file.includes('/code-broker/src/isolation/') && /process-runner|git-grammar|git-commands|sandbox-spec|docker-host/.test(code(file)))
    expect(importers.map(file => file.slice(ROOT.length + 1))).toEqual([])
    // Git commands can only be made through the grammar: the runner takes its rules from git-grammar and has no second Git validator.
    const runner = code(join(ISO, 'process-runner.ts'))
    expect(runner).toMatch(/matchGitOperation\(argv\)/)
    expect(runner).toMatch(/git_hardening_prefix_required/)
    expect(code(join(ISO, 'git-grammar.ts'))).not.toMatch(/from ['"]\.\/process-runner/)
    expect(code(join(ISO, 'git-commands.ts'))).not.toMatch(/GIT_ALLOWED_CONFIG_OVERRIDES\)\.flatMap/)   // the prefix has ONE definition (git-grammar), not a second copy in the builders
  })

  it('confines child_process to the single runner module', () => {
    for (const file of readdirSync(ISO)) {
      const uses = /child_process/.test(readFileSync(join(ISO, file), 'utf8'))
      expect(uses, file).toBe(file === 'process-runner.ts')
    }
  })

  it('imports nothing from apps/web (the broker stays a separate trust domain)', () => {
    for (const file of readdirSync(ISO)) expect(readFileSync(join(ISO, file), 'utf8'), file).not.toMatch(/from ['"](?:@\/|\.\.\/\.\.\/\.\.\/web|.*apps\/web)/)
  })

  it('lists every workflow file so the suite cannot silently disappear from CI', () => {
    const workflow = readFileSync(resolve(ROOT, '.github/workflows/sdf1c-trusted-broker-boundary.yml'), 'utf8')
    for (const file of ['sdf1c3-isolation-substrate.test.ts', 'sdf1c3-isolation-integration.test.ts']) {
      expect(workflow).toContain(`lib/qa/${file}`)
      expect(workflow).toMatch(new RegExp(`\\['${file.replace(/\./g, '\\.')}', \\d+\\]`))
    }
    expect(workflow).toContain(`docker pull ${SANDBOX_PROBE_IMAGE}`)
    expect(workflow).not.toMatch(/docker (?:run|exec)\b/)
  })
})
