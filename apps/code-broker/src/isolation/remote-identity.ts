/**
 * SDF-1C3A — GitHub remote normalization for the local broker. A behavioural copy of the
 * canonical `normalizeGitHubRemote` in apps/web/lib/atlas/code-work/repository-registry.ts
 * (kept separate to preserve the package boundary; a parity corpus test in apps/web/lib/qa
 * fails if the two ever disagree). Raw remote text equality is never trusted.
 */

import type { NormalizedRemoteIdentity } from './registry.js'

export function normalizeGitHubRemote(input: unknown): NormalizedRemoteIdentity | null {
  if (typeof input !== 'string' || input.trim() !== input || input.length === 0 || input.includes('\0')) return null

  let owner: string
  let name: string
  const scp = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(input)
  if (scp) {
    owner = scp[1]
    name = scp[2]
  } else {
    let url: URL
    try { url = new URL(input) } catch { return null }
    if (!['https:', 'ssh:'].includes(url.protocol)) return null
    if (url.hostname.toLowerCase() !== 'github.com') return null
    if (url.username && url.username !== 'git') return null
    if (url.password || url.search || url.hash || url.port) return null
    const segments = url.pathname.replace(/^\//, '').split('/')
    if (segments.length !== 2 || !segments[0] || !segments[1]) return null
    owner = segments[0]
    name = segments[1].replace(/\.git$/i, '')
  }

  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) return null
  return { provider: 'github', host: 'github.com', owner: owner.toLowerCase(), name: name.toLowerCase() }
}

export function sameRemoteIdentity(a: NormalizedRemoteIdentity, b: NormalizedRemoteIdentity): boolean {
  return a.provider === b.provider && a.host === b.host && a.owner === b.owner && a.name === b.name
}
