/**
 * SDF-1C3A — the narrow infrastructure process runner. There is deliberately NO generic
 * "run this command" API:
 *
 *  - Only two tools exist (`git`, `docker`), each a `TrustedTool` resolved from a fixed absolute
 *    candidate list. A caller can never choose the executable.
 *  - A command is an `InfraCommand`, which can only be created by `brokerCommand()` and is
 *    validated at creation against a CLOSED subcommand allowlist (git: read-only inspection +
 *    `worktree add|list`; docker: info / image inspect / create / inspect / start / rm).
 *    fetch, pull, push, commit, merge, rebase, clone, checkout, exec, run, cp, pull, build and
 *    every mutation of a remote or of authority are unrepresentable.
 *  - `shell` is never enabled; `/bin/sh -c` never appears.
 *  - The child environment is built FROM SCRATCH here. The parent `process.env` is never read,
 *    so API keys, tokens, SSH agents, cloud, database, hosting, source-host and model-provider credentials
 *    cannot be inherited. Callers cannot supply environment variables.
 *  - Output is bounded before it is returned, and a timeout kills the child (TERM, then KILL).
 *  - Nothing here logs. Command lines are never written anywhere.
 */

import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GIT_HARDENING_PREFIX, matchGitOperation } from './git-grammar.js'
import { isTrustedTool, type ToolName, type TrustedTool } from './toolchain.js'

export const INFRA_DEFAULT_TIMEOUT_MS = 30_000
export const INFRA_MAX_TIMEOUT_MS = 120_000
export const INFRA_DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024
export const INFRA_MAX_OUTPUT_BYTES = 1024 * 1024
const KILL_GRACE_MS = 1_000

// ── Git: the closed vocabulary ────────────────────────────────────────────────────────────────

export { GIT_ALLOWED_CONFIG_OVERRIDES, GIT_HARDENING_PREFIX } from './git-grammar.js'

export const GIT_ALLOWED_SUBCOMMANDS: readonly string[] = Object.freeze([
  'rev-parse', 'cat-file', 'show-ref', 'config', 'worktree', 'status', 'symbolic-ref',
])

/** Named so the refusal is explicit and testable; anything not in the allowlist is refused anyway. */
export const GIT_FORBIDDEN_SUBCOMMANDS: readonly string[] = Object.freeze([
  'fetch', 'pull', 'push', 'commit', 'merge', 'rebase', 'clone', 'checkout', 'switch', 'reset', 'restore',
  'remote', 'submodule', 'gc', 'am', 'apply', 'cherry-pick', 'revert', 'tag', 'branch', 'stash', 'init',
  'update-ref', 'symbolic-ref-write', 'filter-branch', 'lfs', 'daemon', 'send-pack', 'fetch-pack',
])

// ── Docker: the closed vocabulary ─────────────────────────────────────────────────────────────

export const DOCKER_ALLOWED_SUBCOMMANDS: readonly string[] = Object.freeze(['info', 'image', 'create', 'inspect', 'start', 'rm'])
export const DOCKER_FORBIDDEN_SUBCOMMANDS: readonly string[] = Object.freeze([
  'run', 'exec', 'cp', 'pull', 'push', 'build', 'buildx', 'commit', 'login', 'save', 'load', 'import', 'export',
  'volume', 'network', 'plugin', 'context', 'swarm', 'service', 'stack', 'compose', 'attach', 'update', 'tag',
])
/** Tokens that may never appear anywhere in a docker argv, whatever built it. */
export const DOCKER_FORBIDDEN_TOKENS: readonly string[] = Object.freeze([
  '--privileged', '-v', '--volume', '--mount', '--device', '--cap-add', '--pid', '--userns', '--network=host',
  '--net=host', '--ipc=host', '--uts', '--volumes-from', '--env-file', '--group-add', '--sysctl', '--gpus',
  '--add-host', '-p', '--publish', '-P', '--publish-all', '--cgroup-parent', '--security-opt=seccomp=unconfined',
  '--security-opt=apparmor=unconfined',
])

const MAX_ARG_LENGTH = 4096
const MAX_ARGC = 96

export interface InfraCommand {
  readonly tool: ToolName
  readonly argv: readonly string[]
  /** Working directory the tool starts in (a broker-verified path), or null for the neutral home. */
  readonly cwd: string | null
  readonly timeoutMs: number
  readonly maxOutputBytes: number
}

const BROKER_COMMANDS = new WeakSet<object>()

export class InfraCommandRefused extends Error {
  constructor(readonly code: string) { super(`infrastructure command refused: ${code}`) }
}

function validateCommonArgv(argv: readonly string[]): void {
  if (!Array.isArray(argv) || argv.length === 0 || argv.length > MAX_ARGC) throw new InfraCommandRefused('argv_shape')
  for (const arg of argv) {
    if (typeof arg !== 'string' || arg.length > MAX_ARG_LENGTH || arg.includes('\0')) throw new InfraCommandRefused('argv_element')
  }
}

/**
 * A Git command is valid only as GIT_HARDENING_PREFIX + ONE exact canonical operation
 * (see git-grammar.ts). The named checks give precise refusal codes; `matchGitOperation` is the
 * gate: an allowed subcommand with any other arguments is still refused.
 */
function validateGitArgv(argv: readonly string[]): void {
  const prefixed = argv.length >= GIT_HARDENING_PREFIX.length && GIT_HARDENING_PREFIX.every((token, i) => argv[i] === token)
  if (!prefixed) throw new InfraCommandRefused('git_hardening_prefix_required')
  const rest = argv.slice(GIT_HARDENING_PREFIX.length)
  const subcommand = rest[0]
  if (typeof subcommand !== 'string') throw new InfraCommandRefused('git_operation_not_canonical')
  if (subcommand.startsWith('-')) throw new InfraCommandRefused('git_global_option_not_allowed')
  if (GIT_FORBIDDEN_SUBCOMMANDS.includes(subcommand)) throw new InfraCommandRefused('git_subcommand_forbidden')
  if (!GIT_ALLOWED_SUBCOMMANDS.includes(subcommand)) throw new InfraCommandRefused('git_subcommand_not_allowed')
  if (subcommand === 'worktree' && !['add', 'list'].includes(rest[1] ?? '')) throw new InfraCommandRefused('git_worktree_action_not_allowed')
  if (subcommand === 'config' && rest.join(' ') !== 'config --local --list -z') throw new InfraCommandRefused('git_config_mode_not_allowed')
  if (matchGitOperation(argv) === null) throw new InfraCommandRefused('git_operation_not_canonical')
}

/** Value rules for every flag `docker create` may carry. Anything else is refused. */
const DOCKER_CREATE_VALUE_FLAGS: Readonly<Record<string, RegExp>> = Object.freeze({
  '--name': /^omnira-sdf1c3-probe-[a-f0-9]{12}$/,
  '--network': /^none$/,
  '--cap-drop': /^ALL$/,
  '--security-opt': /^no-new-privileges$/,
  '--user': /^[1-9][0-9]{3,8}:[1-9][0-9]{3,8}$/,
  '--pids-limit': /^[1-9][0-9]{0,2}$/,
  '--memory': /^[1-9][0-9]{1,3}m$/,
  '--memory-swap': /^[1-9][0-9]{1,3}m$/,
  '--cpus': /^(?:0\.(?:[1-9][0-9]?|0[1-9])|1(?:\.[0-9]{1,2})?|2(?:\.0{1,2})?)$/,
  '--tmpfs': /^\/(?:tmp|run):rw,noexec,nosuid,nodev,size=[1-9][0-9]{0,2}m(?:,mode=[0-7]{4})?$/,
  '--workdir': /^\/(?:tmp|workspace)$/,
  '--env': /^(?:HOME=\/tmp|LANG=C\.UTF-8)$/,
  '--entrypoint': /^\/bin\/busybox$/,
  '--label': /^omnira\.sdf1c3\.probe=1$/,
  '--ipc': /^(?:private|none)$/,
  '--restart': /^no$/,
  '--stop-timeout': /^[1-9]$/,
  '--ulimit': /^nofile=[0-9]{1,4}:[0-9]{1,4}$/,
})
const DOCKER_CREATE_BOOLEAN_FLAGS: readonly string[] = Object.freeze(['--read-only', '--pull=never', '--no-healthcheck'])
const DOCKER_CREATE_REQUIRED: readonly string[] = Object.freeze([
  '--pull=never', '--network', '--cap-drop', '--security-opt', '--read-only', '--user', '--pids-limit', '--memory', '--cpus',
])
/** An image is accepted only as an immutable content digest — never a tag, never `latest`. */
export const IMMUTABLE_IMAGE_REFERENCE = /^docker\.io\/library\/[a-z0-9][a-z0-9._-]{0,63}@sha256:[a-f0-9]{64}$/

function validateDockerCreate(argv: readonly string[]): void {
  const seen = new Set<string>()
  let i = 1
  while (i < argv.length && argv[i].startsWith('-')) {
    const flag = argv[i]
    if (DOCKER_CREATE_BOOLEAN_FLAGS.includes(flag)) { seen.add(flag); i += 1; continue }
    const rule = Object.prototype.hasOwnProperty.call(DOCKER_CREATE_VALUE_FLAGS, flag) ? DOCKER_CREATE_VALUE_FLAGS[flag] : null
    if (!rule) throw new InfraCommandRefused('docker_create_flag_not_allowed')
    const value = argv[i + 1]
    if (typeof value !== 'string' || !rule.test(value)) throw new InfraCommandRefused('docker_create_value_not_allowed')
    seen.add(flag)
    i += 2
  }
  for (const required of DOCKER_CREATE_REQUIRED) if (!seen.has(required)) throw new InfraCommandRefused('docker_create_protection_missing')
  const image = argv[i]
  if (typeof image !== 'string' || !IMMUTABLE_IMAGE_REFERENCE.test(image)) throw new InfraCommandRefused('docker_image_not_immutable')
  // The only command this phase can ever create is the fixed identity probe: `busybox id`.
  const command = argv.slice(i + 1)
  if (command.length !== 1 || command[0] !== 'id') throw new InfraCommandRefused('docker_create_command_not_allowed')
}

function validateDockerArgv(argv: readonly string[]): void {
  const subcommand = argv[0]
  if (DOCKER_FORBIDDEN_SUBCOMMANDS.includes(subcommand)) throw new InfraCommandRefused('docker_subcommand_forbidden')
  if (!DOCKER_ALLOWED_SUBCOMMANDS.includes(subcommand)) throw new InfraCommandRefused('docker_subcommand_not_allowed')
  if (subcommand === 'image' && argv[1] !== 'inspect') throw new InfraCommandRefused('docker_image_action_not_allowed')
  for (const arg of argv) {
    if (DOCKER_FORBIDDEN_TOKENS.includes(arg) || /docker\.sock/.test(arg)) throw new InfraCommandRefused('docker_token_forbidden')
  }
  if (subcommand === 'create') validateDockerCreate(argv)
  if (subcommand === 'info' && argv.join(' ') !== 'info --format {{json .}}') throw new InfraCommandRefused('docker_info_shape')
  if (subcommand === 'inspect' && !(argv.length === 4 && /^[a-f0-9]{64}$/.test(argv[1]) && argv[2] === '--format' && argv[3] === '{{json .}}')) throw new InfraCommandRefused('docker_inspect_shape')
  if (subcommand === 'image' && !(argv.length === 5 && IMMUTABLE_IMAGE_REFERENCE.test(argv[2]) && argv[3] === '--format' && argv[4] === '{{json .}}')) throw new InfraCommandRefused('docker_image_inspect_shape')
  if (subcommand === 'start' && !(argv.length === 3 && argv[1] === '-a' && /^[a-f0-9]{64}$/.test(argv[2]))) throw new InfraCommandRefused('docker_start_shape')
  if (subcommand === 'rm' && !(argv.length === 3 && argv[1] === '-f' && (/^[a-f0-9]{64}$/.test(argv[2]) || /^omnira-sdf1c3-probe-[a-f0-9]{12}$/.test(argv[2])))) throw new InfraCommandRefused('docker_rm_shape')
}

/** The ONLY way to obtain an executable command. Validates, freezes and registers it. */
export function brokerCommand(input: { tool: ToolName; argv: readonly string[]; cwd?: string | null; timeoutMs?: number; maxOutputBytes?: number }): InfraCommand {
  if (input.tool !== 'git' && input.tool !== 'docker') throw new InfraCommandRefused('tool_not_allowed')
  validateCommonArgv(input.argv)
  if (input.tool === 'git') validateGitArgv(input.argv)
  else validateDockerArgv(input.argv)
  const timeoutMs = Math.min(Math.max(Math.trunc(input.timeoutMs ?? INFRA_DEFAULT_TIMEOUT_MS), 1), INFRA_MAX_TIMEOUT_MS)
  const maxOutputBytes = Math.min(Math.max(Math.trunc(input.maxOutputBytes ?? INFRA_DEFAULT_MAX_OUTPUT_BYTES), 1), INFRA_MAX_OUTPUT_BYTES)
  const cwd = input.cwd ?? null
  if (cwd !== null && (typeof cwd !== 'string' || !cwd.startsWith('/') || cwd.includes('\0'))) throw new InfraCommandRefused('cwd_not_absolute')
  const command: InfraCommand = Object.freeze({ tool: input.tool, argv: Object.freeze([...input.argv]), cwd, timeoutMs, maxOutputBytes })
  BROKER_COMMANDS.add(command)
  return command
}

export function isBrokerCommand(value: unknown): value is InfraCommand {
  return typeof value === 'object' && value !== null && BROKER_COMMANDS.has(value)
}

// ── Environment, built from scratch ───────────────────────────────────────────────────────────

/**
 * Creates the neutral HOME every child sees: an empty, private (0700) directory the broker owns.
 * It replaces the user's home, so user Git config, credential helpers, SSH config and Docker
 * client config are unreachable even if a tool went looking under HOME.
 */
export function createIsolatedHome(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'omnira-broker-infra-')))
}

export function disposeIsolatedHome(home: string): void {
  if (!/\/omnira-broker-infra-[A-Za-z0-9]+$/.test(home)) throw new Error('refusing to remove a directory the broker did not create')
  rmSync(home, { recursive: true, force: true })
}

export function buildGitEnv(home: string): Readonly<Record<string, string>> {
  return Object.freeze({
    PATH: '/usr/bin:/bin',
    HOME: home,
    XDG_CONFIG_HOME: `${home}/xdg`,
    LC_ALL: 'C',
    LANG: 'C',
    TZ: 'UTC',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '/usr/bin/false',
    SSH_ASKPASS: '/usr/bin/false',
    GIT_SSH_COMMAND: '/usr/bin/false',
    GIT_EDITOR: ':',
    GIT_PAGER: 'cat',
    GIT_NO_LAZY_FETCH: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_ALLOW_PROTOCOL: 'none',
  })
}

export function buildDockerEnv(home: string, socketPath: string): Readonly<Record<string, string>> {
  if ((!/^\/[A-Za-z0-9_./-]+\.sock$/.test(socketPath) && socketPath !== '/var/run/docker.sock') || socketPath.split('/').some(segment => segment === '..' || segment === '.') || socketPath.includes('//')) throw new Error('docker socket path shape')
  return Object.freeze({
    PATH: '/usr/bin:/bin',
    HOME: home,
    LC_ALL: 'C',
    TZ: 'UTC',
    // Broker-built, host-side unix socket only. The parent DOCKER_HOST/DOCKER_CONTEXT/DOCKER_CONFIG
    // are never read, so a remote TCP/SSH daemon or a caller-selected context is unreachable.
    DOCKER_HOST: `unix://${socketPath}`,
    DOCKER_CONFIG: `${home}/docker`,
  })
}

// ── Running ───────────────────────────────────────────────────────────────────────────────────

export interface InfraResult {
  readonly exitCode: number | null
  readonly signal: string | null
  readonly stdout: string
  readonly stderr: string
  readonly truncated: boolean
  readonly timedOut: boolean
}

export interface InfraRunnerConfig {
  isolatedHome: string
  git: TrustedTool | null
  docker: TrustedTool | null
  /** Absolute host-side unix socket the docker CLI is pointed at (broker-derived, never from input). */
  dockerSocketPath: string | null
  /** Test seam only; unreachable from production input. */
  spawnImpl?: typeof nodeSpawn
}

export interface InfraRunner {
  run(command: InfraCommand): Promise<InfraResult>
}

export function createInfraRunner(config: InfraRunnerConfig): InfraRunner {
  const spawnImpl = config.spawnImpl ?? nodeSpawn
  return {
    run(command: InfraCommand): Promise<InfraResult> {
      if (arguments.length !== 1) throw new InfraCommandRefused('run_takes_only_a_command')
      if (!isBrokerCommand(command)) throw new InfraCommandRefused('not_a_broker_command')
      const tool = command.tool === 'git' ? config.git : config.docker
      if (!tool || !isTrustedTool(tool) || tool.tool !== command.tool) throw new InfraCommandRefused('tool_unavailable')
      let env: Readonly<Record<string, string>>
      if (command.tool === 'git') env = buildGitEnv(config.isolatedHome)
      else {
        if (!config.dockerSocketPath) throw new InfraCommandRefused('docker_socket_unavailable')
        env = buildDockerEnv(config.isolatedHome, config.dockerSocketPath)
      }
      return new Promise<InfraResult>(resolve => {
        let child: ChildProcess
        try {
          child = spawnImpl(tool.path, [...command.argv], {
            shell: false, env: { ...env } as unknown as NodeJS.ProcessEnv, cwd: command.cwd ?? config.isolatedHome,
            stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: false,
          })
        } catch {
          resolve({ exitCode: null, signal: null, stdout: '', stderr: '', truncated: false, timedOut: false })
          return
        }
        const chunks = { out: [] as Buffer[], err: [] as Buffer[] }
        let outBytes = 0
        let errBytes = 0
        let truncated = false
        let timedOut = false
        let settled = false
        let timer: ReturnType<typeof setTimeout> | undefined
        let hardStop: ReturnType<typeof setTimeout> | undefined
        const finish = (exitCode: number | null, signal: string | null) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          clearTimeout(hardStop)
          resolve({
            exitCode, signal, truncated, timedOut,
            stdout: Buffer.concat(chunks.out).toString('utf8'),
            stderr: Buffer.concat(chunks.err).toString('utf8'),
          })
        }
        const take = (target: Buffer[], size: number, chunk: Buffer): number => {
          const room = command.maxOutputBytes - size
          if (room <= 0) { truncated = true; return size }
          if (chunk.length > room) { target.push(chunk.subarray(0, room)); truncated = true; return size + room }
          target.push(chunk)
          return size + chunk.length
        }
        child.stdout?.on('data', (chunk: Buffer) => { outBytes = take(chunks.out, outBytes, chunk) })
        child.stderr?.on('data', (chunk: Buffer) => { errBytes = take(chunks.err, errBytes, chunk) })
        child.on('error', () => finish(null, null))
        child.on('close', (code, signal) => finish(code, signal))
        timer = setTimeout(() => {
          timedOut = true
          try { child.kill('SIGTERM') } catch { /* already gone */ }
          hardStop = setTimeout(() => {
            try { child.kill('SIGKILL') } catch { /* already gone */ }
            setTimeout(() => finish(null, 'SIGKILL'), KILL_GRACE_MS)
          }, KILL_GRACE_MS)
        }, command.timeoutMs)
      })
    },
  }
}
