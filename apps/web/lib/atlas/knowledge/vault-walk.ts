/**
 * lib/atlas/knowledge/vault-walk.ts — vault traversal and containment, once.
 *
 * Extracted verbatim from vault-provider.ts so the Atlas-facing provider and the
 * operator-only projection source share ONE implementation of the rules that
 * actually keep the vault boundary safe: real-path containment, symlink escape
 * refusal, hidden-path exclusion, folder policy, deterministic ordering and the
 * file-size ceiling.
 *
 * Duplicating those in a second walker is how the two drift, and the direction
 * they drift in is "the publisher saw something the provider would have refused".
 * Behaviour is unchanged — the Phase-1 provider suite passes against this
 * untouched, which is the proof the extraction is faithful.
 *
 * ── UNBOUNDED BY CONSTRUCTION ────────────────────────────────────────────────
 * `walkVaultMarkdown` takes no limit and returns no truncation flag. The 20-hit
 * ceiling belongs to `KnowledgeProvider.search`, which applies it AFTER this walk
 * — so a caller needing exhaustive enumeration (the publisher) gets it here
 * without widening the Atlas-facing interface.
 */

import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

import { parseKnowledgeDocument, type ParsedKnowledgeDocument } from './document'
import { KNOWLEDGE_BOUNDS, isExcludedPath } from './policy'

/** Thrown when a configured vault root is unusable. Never thrown for a bad query. */
export class VaultRootError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultRootError'
  }
}

/** Resolve and validate a vault root to its real path. Throws VaultRootError. */
export function resolveVaultRoot(vaultRoot: string): string {
  if (!vaultRoot || !vaultRoot.trim()) throw new VaultRootError('vaultRoot is required')
  let realRoot: string
  try {
    realRoot = realpathSync(resolve(vaultRoot))
  } catch {
    throw new VaultRootError(`vault root is not readable: ${vaultRoot}`)
  }
  if (!statSync(realRoot).isDirectory()) {
    throw new VaultRootError(`vault root is not a directory: ${vaultRoot}`)
  }
  return realRoot
}

/**
 * True when `candidate` is the root itself or lives beneath it. Compares REAL
 * paths, so a symlink escaping the vault fails here even though its literal path
 * looked contained.
 */
export function isInsideRoot(realRoot: string, candidate: string): boolean {
  if (candidate === realRoot) return true
  return candidate.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep)
}

/** Source-relative, POSIX-style path for a file inside the vault. */
export function relativePathOf(realRoot: string, absolute: string): string {
  return absolute.slice(realRoot.length + 1).split(sep).join('/')
}

/**
 * Every allowed Markdown file under the vault, deterministically ordered.
 *
 * No limit parameter exists, by design. Hidden and system segments
 * (.obsidian, .git, .trash, any dot-prefix) are never traversed under any mode;
 * `includeExcludedFolders` only governs the editorial folders (00 Inbox,
 * 90 Archive).
 */
export function walkVaultMarkdown(realRoot: string, includeExcludedFolders: boolean): string[] {
  const found: string[] = []

  const walk = (absoluteDir: string): void => {
    let entries
    try {
      entries = readdirSync(absoluteDir, { withFileTypes: true })
    } catch {
      return // unreadable directory — skip rather than fail the whole walk
    }
    // Sort by name so traversal order never depends on the filesystem.
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'sv-SE'))) {
      const absolute = join(absoluteDir, entry.name)

      // Resolve through symlinks and refuse anything that leaves the vault.
      let real: string
      try {
        real = realpathSync(absolute)
      } catch {
        continue // broken symlink
      }
      if (!isInsideRoot(realRoot, real)) continue

      const relative = relativePathOf(realRoot, absolute)
      if (isExcludedPath(relative, includeExcludedFolders)) continue

      let isDir: boolean
      try {
        isDir = statSync(real).isDirectory()
      } catch {
        continue
      }

      if (isDir) { walk(absolute); continue }
      if (!entry.name.toLowerCase().endsWith('.md')) continue
      found.push(absolute)
    }
  }

  walk(realRoot)
  return found
}

/** Read + parse one file. Returns null when it cannot be read or is oversized. */
export function readVaultDocument(realRoot: string, absolute: string): ParsedKnowledgeDocument | null {
  try {
    if (statSync(absolute).size > KNOWLEDGE_BOUNDS.maxFileBytes) return null
    const raw = readFileSync(absolute, 'utf8')
    return parseKnowledgeDocument(raw, relativePathOf(realRoot, absolute))
  } catch {
    return null
  }
}

/** ISO-8601 modification time, epoch when unavailable. */
export function modifiedAtOf(absolute: string): string {
  try {
    return statSync(absolute).mtime.toISOString()
  } catch {
    return new Date(0).toISOString()
  }
}
