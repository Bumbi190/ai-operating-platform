/**
 * SDF-1C3A — composition root of the local isolation substrate.
 *
 * There is NO production caller in this phase. The CLI stays `generate | enroll | diagnostic`, no
 * broker route reaches this code, and the operational claim loop does not use it. Its only callers
 * are the tests and the explicit, env-gated live-proof step. Do not import this from cli.ts or
 * from protocol/*; a structural test fails if anything outside isolation/ (or a test) does.
 */

import { createInfraRunner, createIsolatedHome, disposeIsolatedHome, type InfraRunner } from './process-runner.js'
import { resolveDockerSocket } from './docker-host.js'
import { lookupLocalRepository, type LocalTrustedRepository } from './registry.js'
import { resolveTrustedTool, type ToolchainDeps, type TrustedTool } from './toolchain.js'
import { runSandboxHealthProbe, type SandboxProbeOptions, type SandboxProbeResult } from './sandbox-probe.js'
import { prepareIsolatedWorktree, type PrepareResult } from './worktree.js'

export interface IsolationSubstrate {
  prepareWorktree(input: unknown): Promise<PrepareResult>
  runSandboxHealthProbe(options: SandboxProbeOptions): Promise<SandboxProbeResult>
  dispose(): void
}

interface SubstrateParts {
  runner: InfraRunner
  lookup: (repositoryId: unknown) => LocalTrustedRepository | null
  dispose: () => void
}

function compose(parts: SubstrateParts): IsolationSubstrate {
  return {
    prepareWorktree: input => prepareIsolatedWorktree(input, { runner: parts.runner, lookup: parts.lookup }),
    runSandboxHealthProbe: options => runSandboxHealthProbe(parts.runner, options),
    dispose: parts.dispose,
  }
}

/** Production: closed registry, trusted toolchain resolved from fixed absolute candidates, no options. */
export function createIsolationSubstrate(): IsolationSubstrate {
  const isolatedHome = createIsolatedHome()
  const runner = createInfraRunner({
    isolatedHome,
    git: resolveTrustedTool('git'),
    docker: resolveTrustedTool('docker'),
    dockerSocketPath: resolveDockerSocket(),
  })
  return compose({ runner, lookup: lookupLocalRepository, dispose: () => disposeIsolatedHome(isolatedHome) })
}

/**
 * INTERNAL test seam. Not reachable from any production input: nothing outside tests imports this
 * name, and it accepts injected repositories / toolchain candidates that production never does.
 */
export function createIsolationSubstrateForTests(deps: {
  repositories: Readonly<Record<string, LocalTrustedRepository>>
  toolchain?: ToolchainDeps
  git?: TrustedTool | null
  docker?: TrustedTool | null
  dockerSocketPath?: string | null
  spawnImpl?: Parameters<typeof createInfraRunner>[0]['spawnImpl']
}): IsolationSubstrate & { runner: InfraRunner } {
  const isolatedHome = createIsolatedHome()
  const runner = createInfraRunner({
    isolatedHome,
    git: deps.git === undefined ? resolveTrustedTool('git', deps.toolchain) : deps.git,
    docker: deps.docker === undefined ? resolveTrustedTool('docker', deps.toolchain) : deps.docker,
    dockerSocketPath: deps.dockerSocketPath === undefined ? resolveDockerSocket() : deps.dockerSocketPath,
    spawnImpl: deps.spawnImpl,
  })
  const lookup = (id: unknown) => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(deps.repositories, id) ? deps.repositories[id] : null)
  return { ...compose({ runner, lookup, dispose: () => disposeIsolatedHome(isolatedHome) }), runner }
}
