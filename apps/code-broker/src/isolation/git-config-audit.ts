/**
 * SDF-1C3A — audit of the repository-local Git configuration BEFORE any checkout/worktree
 * materialization.
 *
 * Why: creating a worktree performs a checkout, and a checkout can execute programs Git was
 * configured to launch: smudge/process filter drivers, an fsmonitor hook, hooks from
 * core.hooksPath (post-checkout), credential helpers, an ssh command, external diff/merge
 * drivers, or anything reached through `include`. Global and system config are not loaded at all
 * (see buildGitEnv), and command-line overrides neutralize the rest; this audit refuses a
 * repository whose OWN config re-introduces any of them, instead of assuming they are harmless.
 *
 * Refused classes (each refusal is a closed code, never Git's text):
 *   filter_driver        filter.<name>.{clean,smudge,process}
 *   fsmonitor            core.fsmonitor other than false/empty
 *   hooks_path           core.hooksPath (any value; the broker forces its own)
 *   credential_helper    credential.*helper with a value
 *   ssh_or_askpass       core.sshCommand, core.askPass, core.gitProxy
 *   pager_editor         core.pager, core.editor, sequence.editor
 *   include              include.*, includeIf.*  (config that changes behaviour from elsewhere)
 *   external_driver      diff.<x>.{command,textconv}, merge.<x>.driver, difftool/mergetool.*.cmd
 *   shell_alias          alias.* beginning with `!`
 *   worktree_config      extensions.worktreeConfig=true (a per-worktree config layer)
 *   alternate_worktree   core.worktree, core.bare=true
 */

import { normalizeGitHubRemote, sameRemoteIdentity } from './remote-identity.js'
import type { NormalizedRemoteIdentity } from './registry.js'

export type GitConfigRefusal =
  | 'filter_driver' | 'fsmonitor' | 'hooks_path' | 'credential_helper' | 'ssh_or_askpass' | 'pager_editor'
  | 'include' | 'external_driver' | 'shell_alias' | 'worktree_config' | 'alternate_worktree'
  | 'config_unparseable' | 'remote_missing' | 'remote_malformed' | 'remote_identity_mismatch'

export interface AuditedRemote { name: string; urls: string[]; pushUrls: string[] }

export type GitConfigAudit =
  | { ok: true; remotes: AuditedRemote[] }
  | { ok: false; refusal: GitConfigRefusal }

export function parseGitConfigZ(stdout: string): Array<{ key: string; value: string }> | null {
  const entries: Array<{ key: string; value: string }> = []
  for (const raw of stdout.split('\0')) {
    if (raw === '') continue
    const nl = raw.indexOf('\n')
    const key = (nl === -1 ? raw : raw.slice(0, nl)).trim()
    if (key === '' || !/^[A-Za-z0-9][A-Za-z0-9.\-_/:@+ ]*$/.test(key)) return null
    entries.push({ key, value: nl === -1 ? '' : raw.slice(nl + 1) })
  }
  return entries
}

const truthy = (value: string) => /^(?:true|yes|on|1)$/i.test(value)

export function auditGitConfig(stdout: string, trustedRemoteName: string, trusted: NormalizedRemoteIdentity): GitConfigAudit {
  const entries = parseGitConfigZ(stdout)
  if (!entries) return { ok: false, refusal: 'config_unparseable' }
  const remotes = new Map<string, AuditedRemote>()

  for (const { key, value } of entries) {
    const lower = key.toLowerCase()
    const parts = lower.split('.')
    const section = parts[0]
    const variable = parts[parts.length - 1]

    if (section === 'filter' && ['clean', 'smudge', 'process'].includes(variable) && value !== '') return { ok: false, refusal: 'filter_driver' }
    if (lower === 'core.fsmonitor' && !(value === '' || /^(?:false|no|off|0)$/i.test(value))) return { ok: false, refusal: 'fsmonitor' }
    if (lower === 'core.hookspath') return { ok: false, refusal: 'hooks_path' }
    if (section === 'credential' && variable === 'helper' && value !== '') return { ok: false, refusal: 'credential_helper' }
    if (['core.sshcommand', 'core.askpass', 'core.gitproxy'].includes(lower) && value !== '') return { ok: false, refusal: 'ssh_or_askpass' }
    if (['core.pager', 'core.editor', 'sequence.editor'].includes(lower) && value !== '') return { ok: false, refusal: 'pager_editor' }
    if (section === 'include' || section === 'includeif') return { ok: false, refusal: 'include' }
    if (section === 'diff' && ['command', 'textconv'].includes(variable) && value !== '') return { ok: false, refusal: 'external_driver' }
    if (section === 'merge' && variable === 'driver' && value !== '') return { ok: false, refusal: 'external_driver' }
    if ((section === 'difftool' || section === 'mergetool') && variable === 'cmd' && value !== '') return { ok: false, refusal: 'external_driver' }
    if (section === 'alias' && value.trimStart().startsWith('!')) return { ok: false, refusal: 'shell_alias' }
    if (lower === 'extensions.worktreeconfig' && truthy(value)) return { ok: false, refusal: 'worktree_config' }
    if (lower === 'core.worktree' && value !== '') return { ok: false, refusal: 'alternate_worktree' }
    if (lower === 'core.bare' && truthy(value)) return { ok: false, refusal: 'alternate_worktree' }

    if (section === 'remote' && parts.length >= 3 && ['url', 'pushurl'].includes(variable)) {
      const name = key.slice('remote.'.length, key.length - variable.length - 1)
      const remote = remotes.get(name) ?? { name, urls: [], pushUrls: [] }
      ;(variable === 'url' ? remote.urls : remote.pushUrls).push(value)
      remotes.set(name, remote)
    }
  }

  const trustedRemote = remotes.get(trustedRemoteName)
  if (!trustedRemote || trustedRemote.urls.length === 0) return { ok: false, refusal: 'remote_missing' }
  // Every remote, fetch and push, must normalize to the ONE trusted repository identity: a second
  // repository identity is never accepted, and a raw-text equality check is never used.
  for (const remote of remotes.values()) {
    for (const url of [...remote.urls, ...remote.pushUrls]) {
      const identity = normalizeGitHubRemote(url)
      if (!identity) return { ok: false, refusal: 'remote_malformed' }
      if (!sameRemoteIdentity(identity, trusted)) return { ok: false, refusal: 'remote_identity_mismatch' }
    }
  }
  return { ok: true, remotes: [...remotes.values()] }
}
