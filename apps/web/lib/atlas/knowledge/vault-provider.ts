/**
 * lib/atlas/knowledge/vault-provider.ts — the LOCAL Obsidian vault adapter.
 *
 * Imperative shell. Reads ordinary Markdown files from a configured directory
 * and returns normalized Knowledge results through the read-only contract in
 * ./types.ts.
 *
 * ── IT NEVER TOUCHES OBSIDIAN ────────────────────────────────────────────────
 * No `obsidian` executable, no CLI, no Local REST API, no shell, no running
 * desktop application. The official Obsidian CLI is an OPERATOR and Claude
 * interface; a production system whose correctness depends on someone's GUI
 * being open is not a system. This adapter reads files, which is all an Obsidian
 * vault actually is.
 *
 * ── THE VAULT ROOT IS CONFIGURED, NOT ASSUMED ────────────────────────────────
 * No owner path is hard-coded. The root is supplied by the caller (the operator
 * harness passes it explicitly or via ATLAS_KNOWLEDGE_VAULT_ROOT). This adapter
 * is the LOCAL adapter behind the provider boundary; production transport is a
 * later, separate decision and nothing here presumes it.
 *
 * ── PATH SAFETY FAILS CLOSED ─────────────────────────────────────────────────
 * Every candidate is resolved to a real path and checked for containment inside
 * the real vault root before it is opened. Traversal, absolute identifiers and
 * symlinks pointing outside the vault are refused rather than sanitized —
 * `Knowledge/Books/` and the code repository sit next to this vault on disk, and
 * a canonical_path pointer is a POINTER, never permission to crawl.
 *
 * (No `import 'server-only'` in this phase, deliberately: there are zero
 * production consumers, and the operator harness runs under tsx where that
 * import throws. It belongs here the day a server route consumes this provider.)
 */

import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

import { normalizeQuery, tokenize } from '@/lib/architecture-knowledge/normalize'
import { parseKnowledgeDocument, provenanceFor, type ParsedKnowledgeDocument } from './document'
import { KNOWLEDGE_BOUNDS, isExcludedPath } from './policy'
import { compareScored, scoreDocument } from './rank'
import type {
  KnowledgeDocument, KnowledgeHit, KnowledgeProvider, KnowledgeQuery, KnowledgeSearchResult,
} from './types'

export const VAULT_PROVIDER_ID = 'obsidian-vault'

export interface VaultProviderConfig {
  /** Absolute path to the vault root. Required — never defaulted to an owner path. */
  vaultRoot: string
  /** Override the provider id recorded in provenance. */
  providerId?: string
}

/** Thrown when the configured root is unusable. Never thrown for a bad query. */
export class VaultRootError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultRootError'
  }
}

/**
 * True when `candidate` is the root itself or lives beneath it. Compares REAL
 * paths, so a symlink escaping the vault fails here even though its literal path
 * looked contained.
 */
function isInsideRoot(realRoot: string, candidate: string): boolean {
  if (candidate === realRoot) return true
  return candidate.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep)
}

/** Source-relative, POSIX-style path for a file inside the vault. */
function relativePathOf(realRoot: string, absolute: string): string {
  return absolute.slice(realRoot.length + 1).split(sep).join('/')
}

/**
 * Deterministic excerpt: the body's leading prose, blank runs collapsed, cut at
 * a fixed budget. Same input, same output, every run — no "smart" snippet
 * selection that would move when the ranker changes.
 */
function excerptOf(body: string, budget: number): { text: string; truncated: boolean } {
  const collapsed = body.replace(/\n{3,}/g, '\n\n').trim()
  if (budget <= 0) return { text: '', truncated: collapsed.length > 0 }
  if (collapsed.length <= budget) return { text: collapsed, truncated: false }
  return { text: collapsed.slice(0, budget), truncated: true }
}

export function createVaultKnowledgeProvider(config: VaultProviderConfig): KnowledgeProvider {
  const providerId = config.providerId ?? VAULT_PROVIDER_ID

  if (!config.vaultRoot || !config.vaultRoot.trim()) {
    throw new VaultRootError('vaultRoot is required')
  }

  let realRoot: string
  try {
    realRoot = realpathSync(resolve(config.vaultRoot))
  } catch {
    throw new VaultRootError(`vault root is not readable: ${config.vaultRoot}`)
  }
  if (!statSync(realRoot).isDirectory()) {
    throw new VaultRootError(`vault root is not a directory: ${config.vaultRoot}`)
  }

  /** Walk the vault, deterministically, returning allowed Markdown files. */
  function collectFiles(includeExcludedFolders: boolean): string[] {
    const found: string[] = []

    const walk = (absoluteDir: string): void => {
      let entries
      try {
        entries = readdirSync(absoluteDir, { withFileTypes: true })
      } catch {
        return // unreadable directory — skip rather than fail the whole search
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

  /** Read + parse one file. Returns null when it cannot be trusted or read. */
  function loadDocument(absolute: string): ParsedKnowledgeDocument | null {
    try {
      if (statSync(absolute).size > KNOWLEDGE_BOUNDS.maxFileBytes) return null
      const raw = readFileSync(absolute, 'utf8')
      return parseKnowledgeDocument(raw, relativePathOf(realRoot, absolute))
    } catch {
      return null
    }
  }

  function modifiedAtOf(absolute: string): string {
    try {
      return statSync(absolute).mtime.toISOString()
    } catch {
      return new Date(0).toISOString()
    }
  }

  return {
    id: providerId,

    async search(query: KnowledgeQuery): Promise<KnowledgeSearchResult> {
      const includeExcluded = query.includeExcludedFolders === true
      const requested = query.limit ?? KNOWLEDGE_BOUNDS.defaultHits
      const maxHits = Math.max(0, Math.min(requested, KNOWLEDGE_BOUNDS.maxHits))
      const queryTokens = tokenize(query.query ?? '')

      const files = collectFiles(includeExcluded)
      let unreadable = 0
      const scored = []

      for (const absolute of files) {
        const doc = loadDocument(absolute)
        if (!doc) { unreadable += 1; continue }
        if (query.project && doc.project !== query.project) continue
        if (query.types?.length && (doc.type === null || !query.types.includes(doc.type))) continue

        const result = scoreDocument(doc, normalizeQuery(query.query ?? ''), queryTokens, query.project)
        // An empty query lists in-policy knowledge; a real query returns matches only.
        if (queryTokens.length > 0 && result.matchedTokens === 0) continue
        scored.push({ ...result, absolute })
      }

      scored.sort(compareScored)
      const totalMatched = scored.length
      const selected = scored.slice(0, maxHits)

      // Aggregate budget spent in rank order: the most relevant hits keep their
      // content, later ones shrink. Deterministic, and never silent.
      let aggregateRemaining = KNOWLEDGE_BOUNDS.maxAggregateChars
      let excerptTruncated = false
      let aggregateTruncated = false

      const hits: KnowledgeHit[] = selected.map((entry) => {
        const budget = Math.min(KNOWLEDGE_BOUNDS.maxExcerptChars, aggregateRemaining)
        const { text, truncated } = excerptOf(entry.doc.body, budget)
        aggregateRemaining -= text.length
        if (truncated) {
          excerptTruncated = true
          if (budget < KNOWLEDGE_BOUNDS.maxExcerptChars) aggregateTruncated = true
        }
        return {
          id: entry.doc.id,
          title: entry.doc.title,
          path: entry.doc.path,
          type: entry.doc.type,
          status: entry.doc.status,
          project: entry.doc.project,
          provenance: provenanceFor(entry.doc, providerId),
          authorityRank: entry.doc.authorityRank,
          modifiedAt: modifiedAtOf(entry.absolute),
          score: entry.score,
          excerpt: text,
          excerptTruncated: truncated,
          diagnostics: entry.doc.diagnostics,
        }
      })

      return {
        hits,
        totalMatched,
        unreadable,
        truncated: {
          hits: totalMatched > hits.length,
          excerpt: excerptTruncated,
          aggregate: aggregateTruncated,
        },
        bounds: {
          maxHits,
          maxExcerptChars: KNOWLEDGE_BOUNDS.maxExcerptChars,
          maxAggregateChars: KNOWLEDGE_BOUNDS.maxAggregateChars,
        },
      }
    },

    async get(path: string): Promise<KnowledgeDocument | null> {
      if (typeof path !== 'string' || path.trim() === '') return null
      // Refuse caller-supplied absolute identifiers and traversal outright,
      // before any filesystem call — no sanitizing, no second chances.
      if (path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:/.test(path)) return null
      if (path.split(/[/\\]/).includes('..')) return null

      const normalized = path.split(/[\\/]/).join('/')
      // Folder policy applies to `get` exactly as it applies to `search`. A
      // caller must not be able to ingest unreviewed capture (00 Inbox) or
      // superseded material (90 Archive) merely by possessing or constructing a
      // path. Operators and Claude still inspect those notes through the
      // Obsidian CLI or the filesystem — that need does not justify widening
      // the generic Atlas-facing provider.
      if (isExcludedPath(normalized, false)) return null

      const absolute = resolve(realRoot, normalized)
      let real: string
      try {
        real = realpathSync(absolute)
      } catch {
        return null
      }
      if (!isInsideRoot(realRoot, real)) return null
      try {
        if (!statSync(real).isFile()) return null
      } catch {
        return null
      }

      const doc = loadDocument(absolute)
      if (!doc) return null

      const truncated = doc.body.length > KNOWLEDGE_BOUNDS.maxDocumentChars
      return {
        id: doc.id,
        title: doc.title,
        path: doc.path,
        type: doc.type,
        status: doc.status,
        project: doc.project,
        provenance: provenanceFor(doc, providerId),
        authorityRank: doc.authorityRank,
        modifiedAt: modifiedAtOf(absolute),
        content: truncated ? doc.body.slice(0, KNOWLEDGE_BOUNDS.maxDocumentChars) : doc.body,
        contentTruncated: truncated,
        diagnostics: doc.diagnostics,
      }
    },
  }
}
