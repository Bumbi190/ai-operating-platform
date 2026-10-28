/**
 * lib/article/factcheck/types.ts
 *
 * Website-article FactCheck — shared types (report version 2: headline, lede and
 * body are checked and bound together).
 *
 * This is a SEPARATE gate from lib/article/qa.ts. Article QA checks structure,
 * attribution, slop and copy overlap; it never verifies a factual claim. A row
 * that passes QA is not fact-checked, and nothing in this module may be read as
 * if it were the other.
 */

/** How a source relates to the claim it supports. Assigned by host policy, never by a model. */
export type SourceKind = 'primary' | 'originating_report' | 'independent_reporting'

export interface SourceSnapshot {
  /** Stable id within one check, e.g. "s1". Referenced by evidence. */
  readonly id: string
  /** Final https URL as observed by the reader. */
  readonly url: string
  readonly host: string
  /** Ownership group used to count INDEPENDENT corroboration (two Condé Nast titles are one group). */
  readonly publisherGroup: string
  readonly kind: SourceKind
  readonly retrievedAt: string
  readonly title: string
  readonly text: string
}

/** Per-claim verdict as produced by the reviewer model, before deterministic validation. */
export type ModelClaimVerdict = 'supported' | 'uncertain' | 'contradicted' | 'unsupported'

/** Final per-claim verdict after deterministic validation. */
export type ClaimVerdict = ModelClaimVerdict

export type ClaimImportance = 'central' | 'supporting'

export interface ClaimEvidence {
  readonly sourceId: string
  readonly exactQuote: string
}

/** What the reviewer model returns for one claim. Untrusted until validated. */
export interface ModelClaim {
  readonly sentence: string
  readonly claim: string
  readonly importance: ClaimImportance
  readonly verdict: ModelClaimVerdict
  readonly evidence: readonly ClaimEvidence[]
  readonly note: string
}

/** The publishable text fields a fact-check covers. Each is published as-is by the review route. */
export type ArticleField = 'title' | 'summary' | 'body'

/** Exactly what the reader sees: the payload's title, summary (lede) and body. */
export interface ArticleText {
  readonly title: string
  /** null/undefined is treated as the empty string, matching `payload.summary || null`. */
  readonly summary?: string | null
  readonly body: string
}

export interface CheckedClaim {
  readonly id: string
  /** Where the sentence was found. Headline and lede claims are always central. */
  readonly field: ArticleField
  readonly sentence: string
  readonly claim: string
  readonly importance: ClaimImportance
  /** Verdict the model proposed. Kept for inspection. */
  readonly modelVerdict: ModelClaimVerdict
  /** Verdict after deterministic validation; this one gates publication. */
  readonly verdict: ClaimVerdict
  /** Evidence whose quote was found verbatim in the cited snapshot. */
  readonly evidence: readonly ClaimEvidence[]
  /** Evidence the model cited but that does not exist in the snapshot (fabricated or misquoted). */
  readonly rejectedEvidence: readonly ClaimEvidence[]
  /** Distinct publisher groups behind the verified evidence. */
  readonly publisherGroups: readonly string[]
  readonly hasPrimarySource: boolean
  readonly note: string
  /** Deterministic reasons the verdict differs from the model's, if any. */
  readonly downgrades: readonly string[]
}

/**
 * passed          — every central claim is supported by verified evidence; nothing contradicted.
 * needs_revision  — the headline, lede or body contains claims that must be corrected, qualified or removed.
 * blocked         — cannot be fact-checked (no usable sources, invalid review) or failed after revision.
 */
export type FactCheckVerdict = 'passed' | 'needs_revision' | 'blocked'

export interface FactCheckReport {
  readonly version: 2
  readonly verdict: FactCheckVerdict
  readonly reasons: readonly string[]
  /**
   * sha256 of each exact field that was checked. The review route re-hashes the
   * payload it is about to publish; a change to ANY field (even only the headline)
   * invalidates the report until the new version is checked.
   */
  readonly fieldSha256: { readonly title: string; readonly summary: string; readonly body: string }
  /** sha256 over the canonical [title, summary, body] triple; the single binding value. */
  readonly contentSha256: string
  readonly checkedAt: string
  readonly reviewerModel: string | null
  readonly sources: ReadonlyArray<Omit<SourceSnapshot, 'text'> & { readonly chars: number }>
  readonly claims: readonly CheckedClaim[]
  readonly counts: {
    readonly supported: number
    readonly uncertain: number
    readonly contradicted: number
    readonly unsupported: number
    readonly central: number
    readonly centralSingleGroup: number
  }
  /** Revision round this report belongs to (0 = first draft). */
  readonly round: number
}
