/**
 * lib/atlas/knowledge/policy.ts — the vault's rules, expressed once.
 *
 * These constants are a transcription of the vault's OWN policy documents
 * (Knowledge/Omnira-Vault/VAULT_POLICY.md and CLAUDE_OPERATING_RULES.md), not a
 * competing ruleset invented here. Where the two could disagree, the vault
 * documents are the source and this file is the implementation of them — so a
 * change to vault policy should change this file, never the reverse.
 *
 * Pure data and pure predicates. No I/O.
 */

import type { KnowledgeAuthorityRank, KnowledgeStatus, KnowledgeType } from './types'

/** The documented note vocabulary. Anything else is not silently accepted. */
export const KNOWLEDGE_TYPES: readonly KnowledgeType[] = [
  'architecture', 'decision', 'project', 'research', 'reference', 'memory-note',
] as const

export const KNOWLEDGE_STATUSES: readonly KnowledgeStatus[] = [
  'draft', 'reviewed', 'approved', 'archived',
] as const

export const KNOWLEDGE_SOURCES_OF_TRUTH = ['repository', 'vault', 'external'] as const

/**
 * Folders excluded from ordinary search.
 *
 * `00 Inbox/` is unsorted capture and `90 Archive/` is superseded material.
 * Neither has been reviewed as knowledge, so neither may drift into a normal
 * result. A caller can opt in explicitly (`includeExcludedFolders`), which keeps
 * the choice visible at the call site instead of buried in ranking.
 */
export const DEFAULT_EXCLUDED_FOLDERS: readonly string[] = ['00 Inbox', '90 Archive'] as const

/**
 * Paths never traversed under any query mode. Application state, version
 * control internals and trash are not knowledge, and `.git/` in particular would
 * expose the vault's entire history as searchable text.
 */
export const ALWAYS_EXCLUDED_SEGMENTS: readonly string[] = [
  '.obsidian', '.git', '.trash',
] as const

/** Bounds protecting a caller from unlimited note ingestion. */
export const KNOWLEDGE_BOUNDS = {
  /** Hard ceiling on returned hits, whatever the caller asks for. */
  maxHits: 20,
  /** Default when the caller does not specify. */
  defaultHits: 8,
  /** Per-hit excerpt ceiling. */
  maxExcerptChars: 800,
  /** Ceiling across all excerpts in one result set. */
  maxAggregateChars: 6_000,
  /** Ceiling on a single document returned by `get`. */
  maxDocumentChars: 40_000,
  /** Files larger than this are not read at all. */
  maxFileBytes: 1_000_000,
} as const

/**
 * VAULT_POLICY.md §5 precedence, as a rank. Lower wins.
 *
 *   1  repository canonical state
 *   2  provenance-backed promoted books
 *   3  approved vault knowledge
 *   4  reviewed vault knowledge
 *   5  draft (and anything unrecognized — see below)
 *
 * Rank 2 has no producer in this phase: the local vault adapter reads notes, and
 * `Knowledge/Books/` is outside the vault and is not traversed. The rank exists
 * so a future books provider slots into the same ladder rather than inventing a
 * parallel one.
 *
 * FAIL CLOSED: an unrecognized or absent status ranks as draft. A note whose
 * metadata we could not understand must never be treated as approved.
 */
export function authorityRankFor(
  sourceOfTruth: string | null,
  status: KnowledgeStatus | null,
): KnowledgeAuthorityRank {
  if (sourceOfTruth === 'repository') return 1
  if (status === 'approved') return 3
  if (status === 'reviewed') return 4
  return 5
}

export function isKnowledgeType(value: unknown): value is KnowledgeType {
  return typeof value === 'string' && (KNOWLEDGE_TYPES as readonly string[]).includes(value)
}

export function isKnowledgeStatus(value: unknown): value is KnowledgeStatus {
  return typeof value === 'string' && (KNOWLEDGE_STATUSES as readonly string[]).includes(value)
}

export function isSourceOfTruth(value: unknown): boolean {
  return typeof value === 'string' && (KNOWLEDGE_SOURCES_OF_TRUTH as readonly string[]).includes(value)
}

/** The first path segment, used for folder policy. */
export function topFolderOf(relativePath: string): string {
  const [head] = relativePath.split('/')
  return head === relativePath ? '' : head
}

/** True when a source-relative path is excluded under the given query mode. */
export function isExcludedPath(relativePath: string, includeExcludedFolders = false): boolean {
  const segments = relativePath.split('/')
  // Never traversed, under any mode.
  if (segments.some((s) => (ALWAYS_EXCLUDED_SEGMENTS as readonly string[]).includes(s))) return true
  // Any other dot-prefixed segment is hidden/system material, not knowledge.
  if (segments.some((s) => s.startsWith('.'))) return true
  if (includeExcludedFolders) return false
  return (DEFAULT_EXCLUDED_FOLDERS as readonly string[]).includes(topFolderOf(relativePath))
}
