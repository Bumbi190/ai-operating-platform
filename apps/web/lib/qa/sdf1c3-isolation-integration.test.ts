/**
 * SDF-1C3A — REAL Docker proofs for the sandbox substrate (no fakes).
 *
 * What runs here: the fixed infrastructure health probe (`busybox id`) in a container built from
 * the immutable SandboxSpec, and independent inspection of the containers Docker actually created.
 * No repository content, WorkPackage/model content or CodeWork command ever enters a container.
 *
 * CI (native Linux Docker) proves the specification runs and that every protection is present on
 * the real container. It CANNOT prove macOS VM-backing and this file never pretends it can: the
 * proof reports `native_linux, vmBacked: false` honestly. The VM-backed property is proved by the
 * explicit local Mac live-proof step:
 *
 *   SDF1C3_EXPECT_VM_BACKED=1 SDF1C3_LIVE_MAC_PROOF=1 vitest run lib/qa/sdf1c3-isolation-integration.test.ts
 *
 * The pinned image is provisioned OUTSIDE any run (CI: an explicit `docker pull` step; Mac: setup).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OMNIRA_LOCAL_REPOSITORY } from '../../../code-broker/src/isolation/registry'
import { classifyDockerInfo, dockerCommands, resolveDockerSocket, satisfiesProductionIsolation } from '../../../code-broker/src/isolation/docker-host'
import { createInfraRunner, createIsolatedHome, disposeIsolatedHome, type InfraRunner } from '../../../code-broker/src/isolation/process-runner'
import { runSandboxHealthProbe } from '../../../code-broker/src/isolation/sandbox-probe'
import { SANDBOX_PROBE_IMAGE, SANDBOX_PROBE_IMAGE_DIGEST, SANDBOX_SPEC, buildProbeCreateCommand, newProbeName, verifyProbeContainerInspect } from '../../../code-broker/src/isolation/sandbox-spec'
import { createIsolationSubstrateForTests } from '../../../code-broker/src/isolation/substrate'
import { resolveTrustedTool } from '../../../code-broker/src/isolation/toolchain'

const docker = resolveTrustedTool('docker')
const socket = resolveDockerSocket()
const AVAILABLE = docker !== null && socket !== null
const REQUIRED = process.env.CI === 'true' || process.env.SDF1C3_DOCKER_REQUIRED === '1'
if (!AVAILABLE && !REQUIRED) console.warn('[sdf1c3-integration] SKIPPED — no Docker daemon reachable through the trusted toolchain')
const d = AVAILABLE || REQUIRED ? describe : describe.skip
const EXPECT_VM = process.env.SDF1C3_EXPECT_VM_BACKED === '1'
const LIVE = process.env.SDF1C3_LIVE_MAC_PROOF === '1'

/** Test-side docker (NOT the broker runner): used only to look at and clean up what the broker made. */
const dockerEnv = { PATH: '/usr/bin:/bin', HOME: process.env.HOME ?? '/', ...(process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {}) }
const rawDocker = (args: string[]) => execFileSync(docker!.path, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...dockerEnv, DOCKER_HOST: `unix://${socket}` } as unknown as NodeJS.ProcessEnv, timeout: 60_000 })
const probeContainers = () => rawDocker(['ps', '-a', '-q', '--filter', 'label=omnira.sdf1c3.probe=1']).trim()

let home = ''
let runner: InfraRunner
const made: string[] = []

beforeAll(() => {
  if (!AVAILABLE) return
  home = createIsolatedHome()
  runner = createInfraRunner({ isolatedHome: home, git: resolveTrustedTool('git'), docker, dockerSocketPath: socket })
})
afterAll(() => {
  for (const id of made) { try { rawDocker(['rm', '-f', id]) } catch { /* already gone */ } }
  if (home) disposeIsolatedHome(home)
})

d('SDF-1C3A real Docker: host proof, pinned image, fixed probe and inspection of the real container', () => {
  it('proves the daemon reachable through the broker-derived socket and reports its isolation provider honestly', async () => {
    const info = await runner.run(dockerCommands.info())
    expect(info.exitCode).toBe(0)
    const proof = classifyDockerInfo(JSON.parse(info.stdout), process.platform)
    expect(proof.ok).toBe(true)
    if (!proof.ok) return
    expect(proof.osType).toBe('linux')
    expect(proof.hostPlatform).toBe(process.platform)
    const desktopOnMac = process.platform === 'darwin' && proof.provider === 'docker_desktop'
    expect(proof.vmBacked).toBe(desktopOnMac)                                // never claims more than it saw
    expect(satisfiesProductionIsolation(proof)).toBe(desktopOnMac)
    if (process.platform === 'linux') expect(proof.provider === 'native_linux' || proof.provider === 'docker_desktop').toBe(true)
    if (EXPECT_VM) {
      expect(process.platform).toBe('darwin')
      expect(proof).toMatchObject({ provider: 'docker_desktop', osType: 'linux', vmBacked: true })
    }
    expect(JSON.stringify(proof)).not.toMatch(/tcp:|ssh:|unix:/)              // the proof carries no endpoint
  })

  it('the pinned image is present BY DIGEST (provisioned outside the run) and the broker never pulls', async () => {
    const image = await runner.run(dockerCommands.imageInspect())
    expect(image.exitCode, `pinned image missing — provision it explicitly: docker pull ${SANDBOX_PROBE_IMAGE}`).toBe(0)
    const parsed = JSON.parse(image.stdout) as { Id: string; RepoDigests: string[]; Os: string }
    expect(parsed.Os).toBe('linux')
    expect(parsed.RepoDigests.some(digest => digest.endsWith(`@${SANDBOX_PROBE_IMAGE_DIGEST}`))).toBe(true)
    expect(parsed.Id).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('--pull=never is real: a reference that is not present locally fails to create instead of being pulled', () => {
    const absent = `docker.io/library/alpine@sha256:${'0'.repeat(64)}`
    expect(() => rawDocker(['create', '--pull=never', '--name', `omnira-sdf1c3-test-absent-${process.pid}`, absent, 'id'])).toThrow()
    expect(rawDocker(['ps', '-a', '-q', '--filter', `name=omnira-sdf1c3-test-absent-${process.pid}`]).trim()).toBe('')
  })

  it('runs the fixed health probe as non-root, inspects the real container, and removes it', async () => {
    const before = probeContainers()
    const result = await runSandboxHealthProbe(runner, { requireVmBacked: EXPECT_VM })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.probe).toEqual({ uid: 10001, gid: 10001 })
    expect(result.image).toBe(SANDBOX_PROBE_IMAGE)
    expect(result.containerRemoved).toBe(true)
    expect(result.inspected).toEqual(expect.arrayContaining(['network=none', 'rootfs=read-only', 'cap-drop=ALL', 'no-new-privileges', 'no bind mounts', 'no docker socket', 'image=pinned digest']))
    expect(result.host.vmBacked).toBe(process.platform === 'darwin' && result.host.provider === 'docker_desktop')
    expect(probeContainers()).toBe(before)                                     // nothing left behind
  })

  it('inspects the ACTUAL created container: every protection is present, independent of the command builder', async () => {
    const image = JSON.parse((await runner.run(dockerCommands.imageInspect())).stdout) as { Id: string }
    const info = JSON.parse((await runner.run(dockerCommands.info())).stdout) as { SwapLimit?: boolean }
    const created = await runner.run(buildProbeCreateCommand(newProbeName()))
    const id = created.stdout.trim()
    made.push(id)
    expect(created.exitCode).toBe(0)
    expect(id).toMatch(/^[a-f0-9]{64}$/)
    const inspect = JSON.parse((await runner.run(dockerCommands.inspectContainer(id))).stdout)

    expect(verifyProbeContainerInspect(inspect, { imageId: image.Id, swapLimitSupported: info.SwapLimit === true })).toEqual([])
    // …and the same facts read straight off Docker's own report, not through the verifier:
    const host = inspect.HostConfig; const config = inspect.Config
    expect(host.NetworkMode).toBe('none')
    expect(host.ReadonlyRootfs).toBe(true)
    expect(config.User).toBe('10001:10001')
    expect(host.CapDrop).toEqual(['ALL'])
    expect(host.CapAdd ?? []).toEqual([])
    expect(host.SecurityOpt).toEqual(expect.arrayContaining([expect.stringMatching(/^no-new-privileges/)]))
    expect(host.Privileged).toBe(false)
    expect(host.PidsLimit).toBe(SANDBOX_SPEC.pidsLimit)
    expect(host.Memory).toBe(SANDBOX_SPEC.memoryBytes)
    expect(host.NanoCpus).toBe(SANDBOX_SPEC.nanoCpus)
    expect(host.Binds ?? []).toEqual([])
    expect(inspect.Mounts).toEqual([])
    expect(Object.keys(host.Tmpfs)).toEqual(['/tmp'])
    expect(host.Tmpfs['/tmp']).toMatch(/noexec/)
    expect(JSON.stringify(inspect)).not.toMatch(/docker\.sock/)
    expect(config.Image).toBe(SANDBOX_PROBE_IMAGE)                             // the pinned digest reference, never a tag
    expect(inspect.Image).toBe(image.Id)                                       // and the image that actually backs it
    expect((config.Env as string[]).map(entry => entry.split('=')[0]).sort()).toEqual(['HOME', 'LANG', 'PATH'])
    expect(host.Devices ?? []).toEqual([])
    expect(host.PortBindings ?? {}).toEqual({})
    expect(config.Entrypoint).toEqual(['/bin/busybox'])
    expect(config.Cmd).toEqual(['id'])
    rawDocker(['rm', '-f', id])
    made.splice(made.indexOf(id), 1)
  })

  it('the verifier really detects a weak container: a plain default container fails many checks', async () => {
    const image = JSON.parse((await runner.run(dockerCommands.imageInspect())).stdout) as { Id: string }
    const name = `omnira-sdf1c3-test-weak-${process.pid}`
    // Built by the TEST (never by the broker): defaults everywhere — bridge network, writable rootfs, root, no limits.
    const id = rawDocker(['create', '--pull=never', '--name', name, SANDBOX_PROBE_IMAGE, 'id']).trim()
    made.push(id)
    const inspect = JSON.parse(rawDocker(['inspect', id, '--format', '{{json .}}']))
    const violations = verifyProbeContainerInspect(inspect, { imageId: image.Id, swapLimitSupported: true })
    expect(violations).toEqual(expect.arrayContaining([
      'network_not_none', 'rootfs_writable', 'user_not_expected_non_root', 'cap_drop_not_all', 'no_new_privileges_missing', 'pids_limit_missing_or_wrong',
      'memory_limit_missing_or_wrong', 'cpu_limit_missing_or_wrong', 'unexpected_tmpfs', 'not_probe_labelled', 'workdir_mismatch', 'entrypoint_or_cmd_mismatch',
    ]))
    rawDocker(['rm', '-f', id])
    made.splice(made.indexOf(id), 1)
  })

  it('a bind mount or the Docker socket on a REAL container is caught (independent of the builder)', async () => {
    const image = JSON.parse((await runner.run(dockerCommands.imageInspect())).stdout) as { Id: string }
    const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'sdf1c3-bind-')))
    try {
      const id = rawDocker(['create', '--pull=never', '--name', `omnira-sdf1c3-test-bind-${process.pid}`, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '10001:10001',
        '--mount', `type=bind,src=${scratch},dst=/host`, SANDBOX_PROBE_IMAGE, 'id']).trim()
      made.push(id)
      const inspect = JSON.parse(rawDocker(['inspect', id, '--format', '{{json .}}']))
      expect(verifyProbeContainerInspect(inspect, { imageId: image.Id, swapLimitSupported: true })).toContain('host_bind_mount_present')
      rawDocker(['rm', '-f', id]); made.splice(made.indexOf(id), 1)
    } finally { rmSync(scratch, { recursive: true, force: true }) }
  })

  it('an environment DOCKER_HOST cannot redirect the broker: it is always the host-side unix socket', async () => {
    const original = process.env.DOCKER_HOST
    process.env.DOCKER_HOST = 'tcp://127.0.0.1:1'                                 // a dead remote; must be ignored entirely
    try {
      const ok = await runner.run(dockerCommands.info())
      expect(ok.exitCode).toBe(0)
    } finally { if (original === undefined) delete process.env.DOCKER_HOST; else process.env.DOCKER_HOST = original }
  })
})

describe('SDF-1C3A real Git: the preparation substrate against a synthetic repository, with the real toolchain', () => {
  it('prepares an isolated worktree at the pinned commit and stays inside the approved parent', async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'sdf1c3-live-')))
    try {
      const root = join(base, 'repo'); const parent = join(base, 'worktrees'); mkdirSync(root); mkdirSync(parent)
      const git = (...args: string[]) => execFileSync('/usr/bin/git', ['-c', 'user.name=f', '-c', 'user.email=f@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: root, env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', HOME: '/nonexistent' } as unknown as NodeJS.ProcessEnv, encoding: 'utf8' }).trim()
      git('init', '-q', '-b', 'main'); writeFileSync(join(root, 'f.txt'), 'x\n'); git('add', 'f.txt'); git('commit', '-q', '-m', 'c')
      const sha = git('rev-parse', 'HEAD')
      git('remote', 'add', 'origin', 'https://github.com/Bumbi190/ai-operating-platform.git'); git('update-ref', 'refs/remotes/origin/main', sha)
      const substrate = createIsolationSubstrateForTests({ repositories: { [OMNIRA_LOCAL_REPOSITORY.repositoryId]: { ...OMNIRA_LOCAL_REPOSITORY, approvedLocalRoot: root, approvedWorktreeParent: parent } }, docker: null, dockerSocketPath: null })
      try {
        const workId = '50000000-0000-4000-8000-0000000000aa'
        const result = await substrate.prepareWorktree({ workId, repositoryId: OMNIRA_LOCAL_REPOSITORY.repositoryId, pinnedBaseSha: sha })
        expect(result).toMatchObject({ status: 'prepared', headSha: sha, branchName: `sdf1/${workId}` })
        if (LIVE) console.log('[sdf1c3-live] synthetic worktree prepared:', JSON.stringify(result))
      } finally { substrate.dispose() }
    } finally { rmSync(base, { recursive: true, force: true }) }              // fixture-only cleanup
  })
})

d('SDF-1C3A LOCAL MAC LIVE PROOF (Docker Desktop, VM-backed) — explicit, env-gated', () => {
  it('when enabled, proves Docker Desktop Linux-container mode, the pinned image and the fully inspected fixed probe; otherwise only that the gating is coherent', async () => {
    // The live proof is an explicit request: it must be paired with the VM expectation, never silently weaker.
    expect(!LIVE || EXPECT_VM).toBe(true)
    if (!LIVE) return
    const result = await runSandboxHealthProbe(runner, { requireVmBacked: true })
    console.log('[sdf1c3-live] sandbox probe:', JSON.stringify(result, null, 1))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.host).toMatchObject({ provider: 'docker_desktop', osType: 'linux', vmBacked: true, hostPlatform: 'darwin' })
    expect(result.probe).toEqual({ uid: 10001, gid: 10001 })
    expect(result.containerRemoved).toBe(true)
  })
})
