/**
 * lib/atlas/knowledge/rank.ts — deterministic relevance, auditable by reading it.
 *
 * Functional core: pure, no I/O.
 *
 * ── WHY THIS IS DELIBERATELY SIMPLE ──────────────────────────────────────────
 * Phase 1 needs no external API, no embeddings, no paid provider and no network.
 * A pseudo-semantic algorithm nobody can audit would be worse than useless here:
 * when Knowledge eventually informs Atlas reasoning, "why did this note rank
 * first?" must have an answer a human can check. So the score is a small sum of
 * named, documented boosts, and every one of them is visible below.
 *
 * Determinism is a hard requirement, not a nicety: the same vault and the same
 * query must produce the same ordering on every run, including ties. Ties break
 * on authority rank, then on path — never on filesystem enumeration order.
 */

import { tokenize } from '@/lib/architecture-knowledge/normalize'
import type { ParsedKnowledgeDocument } from './document'

/**
 * Weights. Tuned for one property only: an exact title or path match should beat
 * an incidental body mention, and an approved note should beat an otherwise
 * equivalent draft. Nothing here is learned or adaptive.
 */
export const RANK_WEIGHTS = {
  /** Query appears verbatim in the title. */
  titlePhrase: 10,
  /** A query token appears in the title. */
  titleToken: 4,
  /** A query token appears in the source path (folder or filename). */
  pathToken: 2,
  /** A query token appears in a heading. */
  headingToken: 1.5,
  /** A query token appears in the body, counted once regardless of frequency. */
  bodyToken: 1,
  /** Every query token was found somewhere. */
  allTokensPresent: 3,
  /** Editorial status boost — approved outranks an equivalent draft. */
  statusApproved: 2.5,
  statusReviewed: 1.25,
  /** Declared project matches the query's project filter. */
  projectMatch: 1,
} as const

export interface ScoredDocument {
  doc: ParsedKnowledgeDocument
  score: number
  /** Which tokens were found at all — used to drop non-matches. */
  matchedTokens: number
}

/**
 * Score one document against pre-tokenized query terms.
 *
 * Body tokens count ONCE each. Term frequency is deliberately ignored: a note
 * that repeats a word thirty times is not thirty times more relevant, and
 * frequency weighting would let a long rambling draft outrank a precise approved
 * note. Length normalisation would then be needed to fix that, and the whole
 * thing stops being auditable. Presence is enough for Phase 1.
 */
export function scoreDocument(
  doc: ParsedKnowledgeDocument,
  rawQuery: string,
  queryTokens: string[],
  projectFilter?: string,
): ScoredDocument {
  const title = doc.title.toLocaleLowerCase('sv-SE')
  const path = doc.path.toLocaleLowerCase('sv-SE')
  const normalizedQuery = rawQuery.trim().toLocaleLowerCase('sv-SE')

  const titleTokens = new Set(tokenize(doc.title))
  const pathTokens = new Set(tokenize(doc.path.replace(/[/_-]/g, ' ')))
  const headingTokens = new Set(doc.headings.flatMap((h) => tokenize(h)))
  const bodyTokens = new Set(tokenize(doc.body))

  let score = 0
  let matchedTokens = 0

  if (normalizedQuery.length > 0 && title.includes(normalizedQuery)) {
    score += RANK_WEIGHTS.titlePhrase
  }

  for (const token of queryTokens) {
    let found = false
    if (titleTokens.has(token)) { score += RANK_WEIGHTS.titleToken; found = true }
    if (pathTokens.has(token)) { score += RANK_WEIGHTS.pathToken; found = true }
    if (headingTokens.has(token)) { score += RANK_WEIGHTS.headingToken; found = true }
    if (bodyTokens.has(token)) { score += RANK_WEIGHTS.bodyToken; found = true }
    if (found) matchedTokens += 1
  }

  if (queryTokens.length > 0 && matchedTokens === queryTokens.length) {
    score += RANK_WEIGHTS.allTokensPresent
  }

  // Editorial boost applies only to documents that matched at all — it promotes
  // a relevant approved note over a relevant draft, and never manufactures a
  // match out of status alone.
  if (matchedTokens > 0) {
    if (doc.status === 'approved') score += RANK_WEIGHTS.statusApproved
    else if (doc.status === 'reviewed') score += RANK_WEIGHTS.statusReviewed
    if (projectFilter && doc.project === projectFilter) score += RANK_WEIGHTS.projectMatch
  }

  return { doc, score: Math.round(score * 1000) / 1000, matchedTokens }
}

/**
 * Deterministic ordering: score desc → authority rank asc (repository-backed and
 * approved material first) → path asc. Path is unique within a vault, so the
 * comparator is total and the result never depends on directory read order.
 */
export function compareScored(a: ScoredDocument, b: ScoredDocument): number {
  if (b.score !== a.score) return b.score - a.score
  if (a.doc.authorityRank !== b.doc.authorityRank) return a.doc.authorityRank - b.doc.authorityRank
  return a.doc.path.localeCompare(b.doc.path, 'sv-SE')
}
