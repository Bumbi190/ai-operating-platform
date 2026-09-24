/**
 * SDF-1C3A — Docker host / VM proof.
 *
 * The production target is the Mac broker host running Docker Desktop: Linux containers inside a
 * macOS-virtualization VM. This module establishes that as a CLOSED proof and refuses to pretend:
 * a native-Linux daemon (CI) is reported honestly as `native_linux`, `vmBacked: false`, and can
 * never satisfy the production requirement.
 *
 * The daemon endpoint is BROKER-DERIVED, never accepted from anywhere else: the runner builds
 * DOCKER_HOST itself from a host-side unix socket path in a fixed per-platform list, so a remote
 * TCP/SSH daemon, a caller-selected context or an environment DOCKER_HOST cannot be reached. The
 * daemon stays HOST-side; its socket is never mounted into any container (SANDBOX_SPEC forbids it
 * and the inspection verifier fails on any `docker.sock` reference).
 */

import { lstatSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { brokerCommand, type InfraCommand } from './process-runner.js'
import { SANDBOX_PROBE_IMAGE } from './sandbox-spec.js'
import { sha256Tagged } from './hash.js'

export interface HostFsView { lstat(path: string): { isSocket(): boolean; uid: number } }

/** Fixed, host-side unix sockets per platform. Never read from the environment. */
export function dockerSocketCandidates(platform: NodeJS.Platform, home: string = homedir()): readonly string[] {
  if (platform === 'darwin') return [join(home, '.docker/run/docker.sock')]
  if (platform === 'linux') return ['/var/run/docker.sock']
  return []
}

export function resolveDockerSocket(platform: NodeJS.Platform = process.platform, fs: HostFsView = { lstat: p => lstatSync(p) }, uid: number | null = typeof process.getuid === 'function' ? process.getuid() : null, home: string = homedir()): string | null {
  for (const candidate of dockerSocketCandidates(platform, home)) {
    try {
      const st = fs.lstat(candidate)
      if (!st.isSocket()) continue
      if (platform === 'darwin' && uid !== null && st.uid !== uid) continue      // Docker Desktop's socket belongs to the logged-in user
      return candidate
    } catch { /* next */ }
  }
  return null
}

export type IsolationProvider = 'docker_desktop' | 'native_linux' | 'unknown'

export type DockerHostProof =
  | {
      ok: true
      provider: IsolationProvider
      osType: 'linux'
      vmBacked: boolean
      swapLimitSupported: boolean
      serverVersion: string
      hostPlatform: NodeJS.Platform
      /** Hash of the daemon's identity string so evidence can correlate without publishing it. */
      daemonIdentityHash: string
    }
  | { ok: false; reason: 'daemon_unreachable' | 'info_unparseable' | 'not_linux_containers' | 'docker_unavailable' }

export const dockerCommands = Object.freeze({
  info: (): InfraCommand => brokerCommand({ tool: 'docker', argv: ['info', '--format', '{{json .}}'], timeoutMs: 20_000 }),
  imageInspect: (): InfraCommand => brokerCommand({ tool: 'docker', argv: ['image', 'inspect', SANDBOX_PROBE_IMAGE, '--format', '{{json .}}'], timeoutMs: 20_000 }),
  inspectContainer: (id: string): InfraCommand => brokerCommand({ tool: 'docker', argv: ['inspect', id, '--format', '{{json .}}'], timeoutMs: 20_000 }),
  startAttached: (id: string): InfraCommand => brokerCommand({ tool: 'docker', argv: ['start', '-a', id], timeoutMs: 30_000, maxOutputBytes: 4096 }),
  remove: (idOrName: string): InfraCommand => brokerCommand({ tool: 'docker', argv: ['rm', '-f', idOrName], timeoutMs: 30_000 }),
})

const str = (value: unknown, max = 200): string => (typeof value === 'string' ? value.slice(0, max) : '')

/** Pure classification of `docker info`, so it is testable with synthetic daemons. */
export function classifyDockerInfo(info: unknown, hostPlatform: NodeJS.Platform): DockerHostProof {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return { ok: false, reason: 'info_unparseable' }
  const d = info as Record<string, unknown>
  if (d.OSType !== 'linux') return { ok: false, reason: 'not_linux_containers' }
  const operatingSystem = str(d.OperatingSystem)
  const name = str(d.Name)
  const kernel = str(d.KernelVersion)
  // Docker Desktop reports itself as the operating system and runs a linuxkit-based VM kernel.
  const desktop = operatingSystem === 'Docker Desktop' && name === 'docker-desktop' && /linuxkit/i.test(kernel)
  const provider: IsolationProvider = desktop ? 'docker_desktop' : (hostPlatform === 'linux' ? 'native_linux' : 'unknown')
  return {
    ok: true,
    provider,
    osType: 'linux',
    vmBacked: desktop && hostPlatform === 'darwin',
    swapLimitSupported: d.SwapLimit === true,
    serverVersion: str(d.ServerVersion, 40),
    hostPlatform,
    daemonIdentityHash: sha256Tagged('docker-daemon', `${operatingSystem}|${name}|${kernel}|${str(d.Architecture, 40)}`),
  }
}

/** The production requirement: macOS host + Docker Desktop (Linux containers) in its VM. */
export function satisfiesProductionIsolation(proof: DockerHostProof): boolean {
  return proof.ok && proof.provider === 'docker_desktop' && proof.vmBacked && proof.osType === 'linux' && proof.hostPlatform === 'darwin'
}
