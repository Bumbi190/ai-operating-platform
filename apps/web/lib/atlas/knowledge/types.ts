/**
 * lib/atlas/knowledge/types.ts — the Knowledge Provider contract.
 *
 * ── KNOWLEDGE IS NOT MEMORY ──────────────────────────────────────────────────
 * Atlas Memory M4 (lib/atlas/memory/**) is operational, episodic runtime memory:
 * events the platform emitted, outcomes, confidence, retention, recall. This is
 * a different system entirely — curated long-term knowledge a human wrote and
 * approved. They share the word "knowledge/memory" and nothing else. Neither
 * imports the other, and Knowledge must never become a second Memory backend.
 *
 * ── READ-ONLY BY CONSTRUCTION, NOT BY CONVENTION ─────────────────────────────
 * The interface below exposes `search` and `get`. There is no create, append,
 * update, delete, rename, move, or generic `execute`. A caller holding a
 * KnowledgeProvider is structurally incapable of modifying the source. That is
 * the point: this contract is the seam a future write path would have to
 * visibly break, rather than quietly widen.
 *
 * ── KNOWLEDGE IS DATA, NEVER AUTHORITY ───────────────────────────────────────
 * A KnowledgeHit may inform reasoning. It can never grant authorization, approve
 * an action, change spend permissions, or create execution or delegation
 * authority. Nothing in these types encodes an authorization or execution
 * decision, and `status: 'approved'` below is EDITORIAL — it means a human
 * reviewed the note, not that anything is permitted.
 */

/** Note kinds from the vault's own frontmatter vocabulary (VAULT_POLICY.md §3). */
export type KnowledgeType =
  | 'architecture'
  | 'decision'
  | 'project'
  | 'research'
  | 'reference'
  /** A note *about* Atlas Memory M4. Not Memory data. */
  | 'memory-note'

/** Editorial review state. NOT an authorization state. */
export type KnowledgeStatus = 'draft' | 'reviewed' | 'approved' | 'archived'

/** Where the authoritative version of this material actually lives. */
export type KnowledgeSourceOfTruth = 'repository' | 'vault' | 'external'

/**
 * Why a note's declared metadata was not trusted. Following the adapter idiom in
 * lib/workflows/adapters/types.ts: fail closed, but say WHICH kind of closed —
 * a missing field and a misspelled status are different operator problems.
 */
export type KnowledgeMetadataIssue =
  /** No frontmatter block at all. */
  | 'frontmatter_missing'
  /** A required field is absent. */
  | 'field_missing'
  /** A field is present but outside the documented vocabulary. */
  | 'field_unrecognized'
  /** `source_of_truth: repository` with no `canonical_path` to point at. */
  | 'canonical_pointer_missing'

export interface KnowledgeDiagnostic {
  issue: KnowledgeMetadataIssue
  field: string
  /** Operator-facing detail. Never note content. */
  detail: string
}

/**
 * Where a hit came from and how to check it. `canonicalPath` is a POINTER, not
 * permission to crawl: it names the authoritative repository file so a reader
 * can go and look, and it is never dereferenced by this provider.
 */
export interface KnowledgeProvenance {
  /** Provider id, e.g. 'obsidian-vault'. */
  provider: string
  /** Source-relative path. Never absolute — the vault root does not leak out. */
  sourcePath: string
  /** SHA-256 of the raw file bytes, so a caller can detect drift. */
  contentHash: string
  sourceOfTruth: KnowledgeSourceOfTruth
  /** Repo-relative canonical file when sourceOfTruth is 'repository'. */
  canonicalPath: string | null
}

/**
 * Source-of-truth precedence, preserving VAULT_POLICY.md §5. Lower rank wins.
 * The repository always outranks a note; a note describing repository material
 * is a description of it, never a competing original.
 */
export type KnowledgeAuthorityRank = 1 | 2 | 3 | 4 | 5

export interface KnowledgeHit {
  /** Stable across runs for an unchanged path. Derived from the source path. */
  id: string
  title: string
  /** Source-relative path, e.g. '10 Architecture/note.md'. */
  path: string
  /** null when the note declared nothing recognizable — never guessed. */
  type: KnowledgeType | null
  status: KnowledgeStatus | null
  project: string | null
  provenance: KnowledgeProvenance
  /** Precedence rank per VAULT_POLICY.md §5. */
  authorityRank: KnowledgeAuthorityRank
  /** ISO-8601 file modification time. */
  modifiedAt: string
  /** Deterministic relevance score. Comparable only within one result set. */
  score: number
  /** Bounded body excerpt. */
  excerpt: string
  excerptTruncated: boolean
  /** Metadata that failed validation — surfaced for operators, never trusted. */
  diagnostics: KnowledgeDiagnostic[]
}

export interface KnowledgeQuery {
  query: string
  /** Restrict to one project (frontmatter `project:`). */
  project?: string
  /** Restrict to these note types. */
  types?: KnowledgeType[]
  /** Caller's requested hit count. Clamped by the provider's own bounds. */
  limit?: number
  /**
   * Opt in to folders excluded by default (Inbox, Archive). Off by default so
   * unreviewed capture cannot drift into normal results.
   */
  includeExcludedFolders?: boolean
}

/** What the provider had to cut, and why — never silent. */
export interface KnowledgeTruncation {
  /** More documents matched than the hit bound allowed. */
  hits: boolean
  /** At least one excerpt was shortened. */
  excerpt: boolean
  /** The aggregate character budget was reached and later hits lost content. */
  aggregate: boolean
}

export interface KnowledgeSearchResult {
  hits: KnowledgeHit[]
  /** Documents that matched before hit bounding. */
  totalMatched: number
  /** Documents scanned that could not be read or parsed at all. */
  unreadable: number
  truncated: KnowledgeTruncation
  /** The bounds actually applied to this call. */
  bounds: {
    maxHits: number
    maxExcerptChars: number
    maxAggregateChars: number
  }
}

/** One full document, still bounded. */
export interface KnowledgeDocument {
  id: string
  title: string
  path: string
  type: KnowledgeType | null
  status: KnowledgeStatus | null
  project: string | null
  provenance: KnowledgeProvenance
  authorityRank: KnowledgeAuthorityRank
  modifiedAt: string
  content: string
  contentTruncated: boolean
  diagnostics: KnowledgeDiagnostic[]
}

/**
 * The read-only Knowledge boundary. Two verbs, deliberately.
 *
 * Adding a mutation verb here is not a refactor — it is a change of what this
 * layer is, and it needs its own approved phase plus an off-machine backup of
 * whatever it would write to.
 */
export interface KnowledgeProvider {
  readonly id: string
  search(query: KnowledgeQuery): Promise<KnowledgeSearchResult>
  /** `path` is source-relative. Returns null when absent or out of policy. */
  get(path: string): Promise<KnowledgeDocument | null>
}
