/**
 * SDF-1C3A — the fixed infrastructure health probe.
 *
 * Runs ONE fixed, source-defined command (`/bin/busybox id`) in a container built from the
 * immutable SandboxSpec, to prove the specification actually runs and that it runs as the
 * configured non-root user. It executes no repository content, no WorkPackage/model content, and
 * no CodeWork command; there is no caller-supplied command, argv, script or shell fragment.
 *
 * Sequence (the image is NEVER pulled; provisioning is an operator action outside any run):
 *   host proof → image present by digest → docker create → docker inspect the REAL container and
 *   verify every protection → only then docker start → check the fixed output → docker rm.
 * If inspection finds any missing protection the container is removed WITHOUT being started.
 *
 * Removing the probe container is not CodeWork workspace cleanup; it only ever removes the
 * container this function created (broker-generated name / returned id).
 */

import { randomBytes } from 'node:crypto'
import { classifyDockerInfo, dockerCommands, satisfiesProductionIsolation, type DockerHostProof } from './docker-host.js'
import type { InfraCommand, InfraRunner } from './process-runner.js'
import { buildProbeCreateCommand, newProbeName, SANDBOX_PROBE_IMAGE, SANDBOX_PROBE_IMAGE_DIGEST, SANDBOX_SPEC, verifyProbeContainerInspect, type InspectViolation } from './sandbox-spec.js'

export type SandboxProbeResult =
  | {
      status: 'ok'
      host: Extract<DockerHostProof, { ok: true }>
      image: typeof SANDBOX_PROBE_IMAGE
      probe: { uid: number; gid: number }
      inspected: readonly string[]
      containerRemoved: boolean
    }
  | { status: 'blocked_docker_unavailable' | 'blocked_daemon_unreachable' | 'blocked_not_linux_containers' | 'blocked_info_unparseable' }
  | { status: 'blocked_not_vm_backed'; host: Extract<DockerHostProof, { ok: true }> }
  | { status: 'blocked_image_not_provisioned' }
  | { status: 'create_failed' }
  | { status: 'failed_inspection'; violations: readonly InspectViolation[]; containerRemoved: boolean }
  | { status: 'probe_failed'; containerRemoved: boolean }

export interface SandboxProbeOptions {
  /** Production requires Docker Desktop's VM on macOS. CI (native Linux) must say so explicitly. */
  requireVmBacked: boolean
  hostPlatform?: NodeJS.Platform
  random?: (size: number) => Buffer
}

/** The complete list of protections the inspection proves — reported so evidence shows what was checked. */
export const INSPECTED_PROTECTIONS = Object.freeze([
  'network=none', 'rootfs=read-only', 'user=non-root numeric', 'cap-drop=ALL', 'no-new-privileges', 'not privileged',
  'pids-limit', 'memory limit', 'swap bounded', 'cpu limit', 'no bind mounts', 'no mounts', 'no docker socket',
  'tmpfs only /tmp noexec', 'env allowlist', 'no secret env', 'image=pinned digest', 'image id matches', 'no devices',
  'no host namespaces', 'no published ports', 'fixed entrypoint',
] as const)

const HEX64 = /^[a-f0-9]{64}$/

function json(stdout: string): unknown { try { return JSON.parse(stdout) } catch { return null } }

async function removeQuietly(runner: InfraRunner, target: string): Promise<boolean> {
  try { return (await runner.run(dockerCommands.remove(target))).exitCode === 0 } catch { return false }
}

export async function runSandboxHealthProbe(runner: InfraRunner, options: SandboxProbeOptions): Promise<SandboxProbeResult> {
  const hostPlatform = options.hostPlatform ?? process.platform
  let info: Awaited<ReturnType<InfraRunner['run']>>
  try { info = await runner.run(dockerCommands.info()) } catch { return { status: 'blocked_docker_unavailable' } }
  if (info.exitCode === null) return { status: 'blocked_daemon_unreachable' }
  if (info.exitCode !== 0) return { status: 'blocked_daemon_unreachable' }
  const host = classifyDockerInfo(json(info.stdout), hostPlatform)
  if (!host.ok) return { status: host.reason === 'not_linux_containers' ? 'blocked_not_linux_containers' : host.reason === 'info_unparseable' ? 'blocked_info_unparseable' : 'blocked_daemon_unreachable' }
  if (options.requireVmBacked && !satisfiesProductionIsolation(host)) return { status: 'blocked_not_vm_backed', host }

  // The pinned image must ALREADY be here, identified by digest. Never pull.
  const image = await runner.run(dockerCommands.imageInspect())
  if (image.exitCode !== 0) return { status: 'blocked_image_not_provisioned' }
  const imageInfo = json(image.stdout) as { Id?: unknown; RepoDigests?: unknown } | null
  const imageId = typeof imageInfo?.Id === 'string' ? imageInfo.Id : ''
  const digests = Array.isArray(imageInfo?.RepoDigests) ? imageInfo!.RepoDigests.map(String) : []
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId) || !digests.some(d => d.endsWith(`@${SANDBOX_PROBE_IMAGE_DIGEST}`))) return { status: 'blocked_image_not_provisioned' }

  const name = newProbeName(options.random ?? randomBytes)
  const created = await runner.run(buildProbeCreateCommand(name))
  const id = created.stdout.trim()
  if (created.exitCode !== 0 || !HEX64.test(id)) {
    await removeQuietly(runner, name)                       // only ever this broker-generated name
    return { status: 'create_failed' }
  }

  try {
    const inspected = await runner.run(dockerCommands.inspectContainer(id))
    const violations = inspected.exitCode === 0
      ? verifyProbeContainerInspect(json(inspected.stdout), { imageId, swapLimitSupported: host.swapLimitSupported })
      : (['not_an_object'] as InspectViolation[])
    if (violations.length > 0) return { status: 'failed_inspection', violations, containerRemoved: await removeQuietly(runner, id) }

    const started = await runner.run(dockerCommands.startAttached(id))
    const match = /^uid=(\d+) gid=(\d+)/.exec(started.stdout.trim())
    const ok = started.exitCode === 0 && !started.truncated && !started.timedOut && match !== null
      && Number(match[1]) === SANDBOX_SPEC.uid && Number(match[2]) === SANDBOX_SPEC.gid && SANDBOX_SPEC.probe.expectStdout.test(started.stdout.trim())
    const removed = await removeQuietly(runner, id)
    if (!ok) return { status: 'probe_failed', containerRemoved: removed }
    return { status: 'ok', host, image: SANDBOX_PROBE_IMAGE, probe: { uid: Number(match![1]), gid: Number(match![2]) }, inspected: INSPECTED_PROTECTIONS, containerRemoved: removed }
  } catch {
    await removeQuietly(runner, id)
    return { status: 'probe_failed', containerRemoved: false }
  }
}

export type { InfraCommand }
