/**
 * SDF-1C3A — trusted executable identities for the infrastructure tools the broker may launch:
 * exactly `git` and `docker`.
 *
 * The executable is NEVER chosen by a caller, a model, a WorkPackage or a request body, and it is
 * never found through PATH: resolution walks a fixed list of absolute candidates and accepts the
 * first that passes a trust check (regular file after realpath, executable, not group/other
 * writable, owned by root or the broker's own uid, and no group/other-writable-by-others
 * ancestor). The result is an opaque, unforgeable-by-shape `TrustedTool`.
 *
 * Tests inject a different candidate list / filesystem view through `ToolchainDeps`, which is an
 * internal seam: no production input reaches it.
 */

import { lstatSync, realpathSync, statSync, type Stats } from 'node:fs'
import { dirname } from 'node:path'

export type ToolName = 'git' | 'docker'

export const TRUSTED_TOOL_CANDIDATES: Readonly<Record<ToolName, readonly string[]>> = Object.freeze({
  git: Object.freeze(['/usr/bin/git', '/opt/homebrew/bin/git', '/usr/local/bin/git']),
  docker: Object.freeze([
    '/Applications/Docker.app/Contents/Resources/bin/docker',
    '/usr/local/bin/docker',
    '/opt/homebrew/bin/docker',
    '/usr/bin/docker',
  ]),
})

export interface TrustedTool {
  readonly tool: ToolName
  /** Realpath of the accepted executable. */
  readonly path: string
}

const ISSUED = new WeakSet<object>()

/** True only for a `TrustedTool` this module issued. A structurally identical object is not one. */
export function isTrustedTool(value: unknown): value is TrustedTool {
  return typeof value === 'object' && value !== null && ISSUED.has(value)
}

export interface ToolchainDeps {
  candidates?: Readonly<Partial<Record<ToolName, readonly string[]>>>
  uid?: number
  realpath?: (path: string) => string
  stat?: (path: string) => Pick<Stats, 'isFile' | 'mode' | 'uid'>
  lstat?: (path: string) => Pick<Stats, 'isDirectory' | 'mode'>
}

export type ToolRefusal = 'no_trusted_candidate'

function untrustedReason(path: string, uid: number, d: Required<Omit<ToolchainDeps, 'candidates' | 'uid'>>): string | null {
  if (!path.startsWith('/')) return 'not_absolute'
  let real: string
  try { real = d.realpath(path) } catch { return 'missing' }
  if (!real.startsWith('/')) return 'not_absolute'
  let st: Pick<Stats, 'isFile' | 'mode' | 'uid'>
  try { st = d.stat(real) } catch { return 'missing' }
  if (!st.isFile()) return 'not_regular_file'
  if ((st.mode & 0o111) === 0) return 'not_executable'
  if ((st.mode & 0o022) !== 0) return 'group_or_other_writable'
  if (st.uid !== 0 && st.uid !== uid) return 'untrusted_owner'
  for (let dir = dirname(real); dir !== '/' && dir !== '.'; dir = dirname(dir)) {
    try { if ((d.lstat(dir).mode & 0o002) !== 0) return 'other_writable_ancestor' } catch { return 'missing' }
  }
  return null
}

export function resolveTrustedTool(tool: ToolName, deps: ToolchainDeps = {}): TrustedTool | null {
  const candidates = deps.candidates?.[tool] ?? TRUSTED_TOOL_CANDIDATES[tool]
  const uid = deps.uid ?? (typeof process.getuid === 'function' ? process.getuid() : -1)
  const d = {
    realpath: deps.realpath ?? ((p: string) => realpathSync(p)),
    stat: deps.stat ?? ((p: string) => statSync(p)),
    lstat: deps.lstat ?? ((p: string) => lstatSync(p)),
  }
  for (const candidate of candidates) {
    if (untrustedReason(candidate, uid, d) !== null) continue
    const tool_: TrustedTool = Object.freeze({ tool, path: d.realpath(candidate) })
    ISSUED.add(tool_)
    return tool_
  }
  return null
}

/** Why each candidate was rejected — for diagnostics/tests only; never contains file contents. */
export function explainToolCandidates(tool: ToolName, deps: ToolchainDeps = {}): Array<{ path: string; reason: string | null }> {
  const candidates = deps.candidates?.[tool] ?? TRUSTED_TOOL_CANDIDATES[tool]
  const uid = deps.uid ?? (typeof process.getuid === 'function' ? process.getuid() : -1)
  const d = {
    realpath: deps.realpath ?? ((p: string) => realpathSync(p)),
    stat: deps.stat ?? ((p: string) => statSync(p)),
    lstat: deps.lstat ?? ((p: string) => lstatSync(p)),
  }
  return candidates.map(path => ({ path, reason: untrustedReason(path, uid, d) }))
}
