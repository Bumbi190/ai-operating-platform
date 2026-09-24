/**
 * SDF-1C3A — the immutable SandboxSpec, and the verifier that checks the REAL container Docker
 * created against it.
 *
 * The spec is owned by broker code and has no caller-controlled field. It expresses the
 * canonical isolation requirements (capability.ts: vmBackedLinux, executionNetwork=denied,
 * executionSecrets=none, worktreeRetention=explicit_cleanup_only) as concrete Docker settings:
 *
 *   network none · all capabilities dropped · no-new-privileges · read-only root filesystem ·
 *   non-root numeric user · PID/memory/CPU/swap/file limits · fixed workdir · tmpfs with size
 *   bounds and noexec · environment allowlist (HOME, LANG only — nothing inherited) · NO host
 *   bind mounts of any kind · the Docker socket NEVER mounted · no secrets · --pull=never ·
 *   an immutable image DIGEST.
 *
 * The future workspace mount is a Docker NAMED VOLUME (never a host bind mount). Phase 1C3A puts
 * no repository content in any container, so the probe has no mounts at all.
 */

import { randomBytes } from 'node:crypto'
import { brokerCommand, IMMUTABLE_IMAGE_REFERENCE, type InfraCommand } from './process-runner.js'

/**
 * The infrastructure health-probe image: the official Alpine multi-arch image INDEX, pinned by
 * content digest (index of linux/amd64 + linux/arm64 etc., created 2026-09-17). Runtime never
 * pulls: provisioning is an explicit operator/setup action outside any CodeWork run:
 *
 *   docker pull docker.io/library/alpine@sha256:294b683c…c77e6
 */
export const SANDBOX_PROBE_IMAGE_DIGEST = 'sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6' as const
export const SANDBOX_PROBE_IMAGE = `docker.io/library/alpine@${SANDBOX_PROBE_IMAGE_DIGEST}` as const

export const SANDBOX_SPEC_VERSION = 'sdf1.sandbox.v1' as const

export const SANDBOX_SPEC = Object.freeze({
  version: SANDBOX_SPEC_VERSION,
  image: SANDBOX_PROBE_IMAGE,
  pullPolicy: 'never' as const,
  network: 'none' as const,
  capDrop: Object.freeze(['ALL'] as const),
  noNewPrivileges: true as const,
  readOnlyRootfs: true as const,
  privileged: false as const,
  user: '10001:10001',
  uid: 10001,
  gid: 10001,
  pidsLimit: 64,
  memory: '128m',
  memoryBytes: 128 * 1024 * 1024,
  memorySwap: '128m',
  cpus: '0.5',
  nanoCpus: 500_000_000,
  nofile: 256,
  workdir: '/tmp',
  tmpfs: Object.freeze({ '/tmp': 'rw,noexec,nosuid,nodev,size=16m,mode=1777' }) as Readonly<Record<string, string>>,
  env: Object.freeze({ HOME: '/tmp', LANG: 'C.UTF-8' }) as Readonly<Record<string, string>>,
  hostBindMounts: Object.freeze([]) as readonly never[],
  namedVolumes: Object.freeze([]) as readonly never[],
  dockerSocketMounted: false as const,
  secrets: 'none' as const,
  workspaceMountPolicy: 'named_volume_only' as const,
  /** Fixed infrastructure probe. No caller can supply a command, argv, script or shell fragment. */
  probe: Object.freeze({ entrypoint: '/bin/busybox', argv: Object.freeze(['id'] as const), expectStdout: /^uid=10001 gid=10001\b/ }),
})

export const PROBE_NAME_PATTERN = /^omnira-sdf1c3-probe-[a-f0-9]{12}$/

export function newProbeName(random: (size: number) => Buffer = randomBytes): string {
  return `omnira-sdf1c3-probe-${random(6).toString('hex')}`
}

/** Builds the ONLY `docker create` this phase can emit. */
export function buildProbeCreateCommand(name: string): InfraCommand {
  if (!PROBE_NAME_PATTERN.test(name)) throw new Error('probe container name must be broker-generated')
  if (!IMMUTABLE_IMAGE_REFERENCE.test(SANDBOX_SPEC.image)) throw new Error('sandbox image must be an immutable digest')
  const s = SANDBOX_SPEC
  return brokerCommand({
    tool: 'docker',
    argv: [
      'create',
      '--name', name,
      '--pull=never',
      '--network', s.network,
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--read-only',
      '--user', s.user,
      '--pids-limit', String(s.pidsLimit),
      '--memory', s.memory,
      '--memory-swap', s.memorySwap,
      '--cpus', s.cpus,
      '--ulimit', `nofile=${s.nofile}:${s.nofile}`,
      '--tmpfs', `/tmp:${s.tmpfs['/tmp']}`,
      '--workdir', s.workdir,
      '--env', `HOME=${s.env.HOME}`,
      '--env', `LANG=${s.env.LANG}`,
      '--ipc', 'private',
      '--restart', 'no',
      '--stop-timeout', '2',
      '--no-healthcheck',
      '--label', 'omnira.sdf1c3.probe=1',
      '--entrypoint', s.probe.entrypoint,
      s.image,
      ...s.probe.argv,
    ],
    timeoutMs: 30_000,
  })
}

// ── Verification of the container Docker ACTUALLY created ─────────────────────────────────────

export type InspectViolation =
  | 'not_an_object' | 'network_not_none' | 'rootfs_writable' | 'user_not_expected_non_root' | 'cap_drop_not_all' | 'cap_add_present'
  | 'privileged' | 'no_new_privileges_missing' | 'unconfined_security_profile' | 'pids_limit_missing_or_wrong' | 'memory_limit_missing_or_wrong'
  | 'swap_not_bounded' | 'cpu_limit_missing_or_wrong' | 'host_bind_mount_present' | 'mount_present' | 'docker_socket_referenced'
  | 'unexpected_tmpfs' | 'tmpfs_not_noexec' | 'env_not_allowlisted' | 'secret_like_env' | 'image_reference_mismatch' | 'image_id_mismatch'
  | 'devices_present' | 'host_namespace_shared' | 'ports_published' | 'not_probe_labelled' | 'workdir_mismatch' | 'entrypoint_or_cmd_mismatch'

const ENV_ALLOWED_KEYS = new Set(['HOME', 'LANG', 'PATH'])
const SECRET_LIKE = /(?:token|secret|password|passwd|api[_-]?key|credential|private[_-]?key|auth|session|bearer|cookie)/i

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {})
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

export interface InspectExpectations {
  /** `Id` from `docker image inspect` of the pinned reference — the container must run exactly that image. */
  imageId: string
  /** Whether the daemon supports swap accounting (`SwapLimit` in `docker info`). */
  swapLimitSupported: boolean
}

/** Returns every violated protection (empty = the container carries all of them). */
export function verifyProbeContainerInspect(inspect: unknown, expected: InspectExpectations): InspectViolation[] {
  const root = asRecord(inspect)
  if (Object.keys(root).length === 0) return ['not_an_object']
  const host = asRecord(root.HostConfig)
  const config = asRecord(root.Config)
  const violations = new Set<InspectViolation>()
  const s = SANDBOX_SPEC

  if (host.NetworkMode !== 'none') violations.add('network_not_none')
  if (host.ReadonlyRootfs !== true) violations.add('rootfs_writable')
  if (config.User !== s.user) violations.add('user_not_expected_non_root')
  if (!(asArray(host.CapDrop).length === 1 && asArray(host.CapDrop)[0] === 'ALL')) violations.add('cap_drop_not_all')
  if (asArray(host.CapAdd).length > 0) violations.add('cap_add_present')
  if (host.Privileged === true) violations.add('privileged')
  const securityOpt = asArray(host.SecurityOpt).map(String)
  if (!securityOpt.some(opt => opt === 'no-new-privileges' || opt === 'no-new-privileges:true' || opt === 'no-new-privileges=true')) violations.add('no_new_privileges_missing')
  if (securityOpt.some(opt => /unconfined/i.test(opt))) violations.add('unconfined_security_profile')
  if (host.PidsLimit !== s.pidsLimit) violations.add('pids_limit_missing_or_wrong')
  if (host.Memory !== s.memoryBytes) violations.add('memory_limit_missing_or_wrong')
  const swap = host.MemorySwap
  if (expected.swapLimitSupported ? swap !== s.memoryBytes : !(typeof swap === 'number')) violations.add('swap_not_bounded')
  if (host.NanoCpus !== s.nanoCpus) violations.add('cpu_limit_missing_or_wrong')

  if (asArray(host.Binds).length > 0) violations.add('host_bind_mount_present')
  const mounts = asArray(root.Mounts)
  if (mounts.length > 0) violations.add(mounts.some(m => asRecord(m).Type === 'bind') ? 'host_bind_mount_present' : 'mount_present')
  if (asArray(host.Mounts).length > 0) violations.add('mount_present')
  if (/docker\.sock/.test(JSON.stringify(root))) violations.add('docker_socket_referenced')

  const tmpfs = asRecord(host.Tmpfs)
  const tmpfsKeys = Object.keys(tmpfs)
  if (tmpfsKeys.length !== 1 || tmpfsKeys[0] !== '/tmp') violations.add('unexpected_tmpfs')
  else if (!/\bnoexec\b/.test(String(tmpfs['/tmp'])) || !/\bnosuid\b/.test(String(tmpfs['/tmp'])) || !/\bnodev\b/.test(String(tmpfs['/tmp']))) violations.add('tmpfs_not_noexec')

  for (const entry of asArray(config.Env).map(String)) {
    const key = entry.split('=')[0]
    if (!ENV_ALLOWED_KEYS.has(key)) violations.add('env_not_allowlisted')
    if (SECRET_LIKE.test(key)) violations.add('secret_like_env')
  }
  if (config.Image !== s.image) violations.add('image_reference_mismatch')
  if (typeof root.Image !== 'string' || root.Image !== expected.imageId) violations.add('image_id_mismatch')
  if (asArray(host.Devices).length > 0 || asArray(host.DeviceRequests).length > 0) violations.add('devices_present')
  if (host.PidMode || host.UsernsMode || host.UTSMode || host.CgroupnsMode === 'host' || (typeof host.IpcMode === 'string' && !['private', 'none', ''].includes(host.IpcMode))) violations.add('host_namespace_shared')
  if (Object.keys(asRecord(host.PortBindings)).length > 0 || Object.keys(asRecord(config.ExposedPorts)).length > 0) violations.add('ports_published')
  if (asRecord(config.Labels)['omnira.sdf1c3.probe'] !== '1') violations.add('not_probe_labelled')
  if (config.WorkingDir !== s.workdir) violations.add('workdir_mismatch')
  if (JSON.stringify(asArray(config.Entrypoint)) !== JSON.stringify([s.probe.entrypoint]) || JSON.stringify(asArray(config.Cmd)) !== JSON.stringify([...s.probe.argv])) violations.add('entrypoint_or_cmd_mismatch')
  return [...violations]
}
