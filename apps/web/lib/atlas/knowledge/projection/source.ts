/**
 * lib/atlas/knowledge/projection/source.ts — the exhaustive, operator-only source.
 *
 * ── THIS IS NOT AN ATLAS INTERFACE ───────────────────────────────────────────
 * `KnowledgeProvider` (search + get) stays exactly as merged. It is bounded to
 * 20 hits on purpose, which makes it correct for retrieval and WRONG for
 * publication: a publisher built on `search` would silently ship only the first
 * 20 eligible notes the day the vault grows past 20. The fix is not to widen the
 * Atlas-facing interface — it is this separate local boundary, which production
 * must never import (enforced in atlas-knowledge-boundary.test.ts).
 *
 * ── EXHAUSTIVE BY CONSTRUCTION ───────────────────────────────────────────────
 * `listAll()` takes no limit, returns no truncation flag, and paginates nothing,
 * because there is nothing to truncate. It walks every non-hidden Markdown file
 * via the shared `walkVaultMarkdown` — the same unbounded traversal the provider
 * uses before applying its own ceiling.
 *
 * ── NOTHING DISAPPEARS SILENTLY ──────────────────────────────────────────────
 * Every discovered file lands in exactly one accounted state, and the counters
 * are asserted rather than trusted. A file that is neither readable nor
 * evaluated is a bug, so it raises ProjectionReconciliationError instead of
 * quietly shrinking the publication.
 *
 * READ-ONLY: no create, append, update, delete, rename, move, or execute.
 */

import type { ParsedKnowledgeDocument } from '../document'
import { readVaultDocument, resolveVaultRoot, walkVaultMarkdown, modifiedAtOf, relativePathOf } from '../vault-walk'
import { evaluateEligibility, type EligibilityResult } from './eligibility'

export const PROJECTION_SOURCE_ID = 'obsidian-vault-projection'

export interface ProjectionSourceConfig {
  /** Absolute path to the vault root. Required — never defaulted to an owner path. */
  vaultRoot: string
  /** Declared project-slug → project-id map. Empty in Slice 1; Slice 2 owns it. */
  projectScopeMap?: Record<string, string>
  sourceId?: string
}

/** One evaluated source note. Metadata only — bodies are never carried here. */
export interface ProjectionCandidate {
  id: string
  path: string
  title: string
  type: ParsedKnowledgeDocument['type']
  status: ParsedKnowledgeDocument['status']
  project: string | null
  /** What the note declared, before the pointer contract is applied. */
  declaredSourceOfTruth: ParsedKnowledgeDocument['declaredSourceOfTruth']
  /** What a consumer may act on. */
  trustedSourceOfTruth: ParsedKnowledgeDocument['sourceOfTruth']
  canonicalPath: string | null
  contentHash: string
  modifiedAt: string
  diagnostics: ParsedKnowledgeDocument['diagnostics']
  eligibility: EligibilityResult
}

/** Every discovered file lands in exactly one of these buckets. */
export interface ProjectionAccounting {
  filesDiscovered: number
  filesUnreadable: number
  candidatesEvaluated: number
  eligible: number
  ineligible: number
}

export interface ProjectionListing {
  sourceId: string
  candidates: ProjectionCandidate[]
  /** Vault-relative paths that could not be read or parsed. Never dropped. */
  unreadable: string[]
  accounting: ProjectionAccounting
}

/** Raised when the counters do not add up. Never swallowed. */
export class ProjectionReconciliationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectionReconciliationError'
  }
}

export interface KnowledgeProjectionSource {
  readonly id: string
  /** Exhaustive. No limit, no pagination, no truncation flag — by construction. */
  listAll(): ProjectionListing
  /** One document by vault-relative path, or null. */
  readDocument(path: string): ParsedKnowledgeDocument | null
}

/**
 * Text handed to the secret scan: everything that could end up serialized into a
 * remote projection — the body, every declared frontmatter value, AND the
 * source-relative path.
 *
 * The path belongs here because it is projection metadata, not just a local
 * lookup key. Redacting a credential-shaped filename in the operator report is
 * necessary but not sufficient: redaction governs what an operator SEES, while
 * eligibility governs what LEAVES THE MACHINE. A note named after a token would
 * otherwise render safely and publish anyway.
 *
 * The note's text is used and discarded — no candidate ever carries it.
 */
function scannableTextOf(doc: ParsedKnowledgeDocument): string {
  return [doc.path, doc.body, ...Object.values(doc.rawFrontMatter)].join('\n')
}

export function createKnowledgeProjectionSource(
  config: ProjectionSourceConfig,
): KnowledgeProjectionSource {
  const sourceId = config.sourceId ?? PROJECTION_SOURCE_ID
  const realRoot = resolveVaultRoot(config.vaultRoot)
  const projectScopeMap = config.projectScopeMap ?? {}

  return {
    id: sourceId,

    listAll(): ProjectionListing {
      // includeExcludedFolders: true — Inbox and Archive are ENUMERATED so the
      // operator sees them, then marked ineligible by folder policy. Hiding them
      // at the walk would under-report the vault; they still never publish.
      const files = walkVaultMarkdown(realRoot, true)

      const candidates: ProjectionCandidate[] = []
      const unreadable: string[] = []

      for (const absolute of files) {
        const doc = readVaultDocument(realRoot, absolute)
        if (!doc) { unreadable.push(relativePathOf(realRoot, absolute)); continue }

        candidates.push({
          id: doc.id,
          path: doc.path,
          title: doc.title,
          type: doc.type,
          status: doc.status,
          project: doc.project,
          declaredSourceOfTruth: doc.declaredSourceOfTruth,
          trustedSourceOfTruth: doc.sourceOfTruth,
          canonicalPath: doc.canonicalPath,
          contentHash: doc.contentHash,
          modifiedAt: modifiedAtOf(absolute),
          diagnostics: doc.diagnostics,
          eligibility: evaluateEligibility({
            doc,
            rawFrontMatter: doc.rawFrontMatter,
            projectScopeMap,
            content: scannableTextOf(doc),
          }),
        })
      }

      // Deterministic: byte-stable path order, independent of locale and of
      // filesystem enumeration.
      candidates.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      unreadable.sort()

      const eligible = candidates.filter((c) => c.eligibility.eligible).length
      const accounting: ProjectionAccounting = {
        filesDiscovered: files.length,
        filesUnreadable: unreadable.length,
        candidatesEvaluated: candidates.length,
        eligible,
        ineligible: candidates.length - eligible,
      }

      assertReconciled(accounting)
      return { sourceId, candidates, unreadable, accounting }
    },

    readDocument(path: string): ParsedKnowledgeDocument | null {
      if (typeof path !== 'string' || path.trim() === '') return null
      if (path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:/.test(path)) return null
      if (path.split(/[/\\]/).includes('..')) return null
      const normalized = path.split(/[\\/]/).join('/')
      // Enumerated set only — never an arbitrary filesystem read, and never a
      // hidden path, since walkVaultMarkdown refuses those under every mode.
      const match = walkVaultMarkdown(realRoot, true)
        .find((abs) => relativePathOf(realRoot, abs) === normalized)
      return match ? readVaultDocument(realRoot, match) : null
    },
  }
}

/** Every discovered file must be exactly one of unreadable or evaluated. */
export function assertReconciled(a: ProjectionAccounting): void {
  if (a.filesUnreadable + a.candidatesEvaluated !== a.filesDiscovered) {
    throw new ProjectionReconciliationError(
      `discovered ${a.filesDiscovered} but accounted ${a.filesUnreadable} unreadable + ` +
        `${a.candidatesEvaluated} evaluated`,
    )
  }
  if (a.eligible + a.ineligible !== a.candidatesEvaluated) {
    throw new ProjectionReconciliationError(
      `evaluated ${a.candidatesEvaluated} but accounted ${a.eligible} eligible + ` +
        `${a.ineligible} ineligible`,
    )
  }
}
