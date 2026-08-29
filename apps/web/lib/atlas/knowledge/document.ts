/**
 * lib/atlas/knowledge/document.ts — raw Markdown → validated knowledge metadata.
 *
 * Functional core: pure, no I/O, no filesystem. Given a file's text and its
 * source-relative path, produce the parsed shape plus an honest account of what
 * could not be trusted.
 *
 * ── WHY NO YAML PARSER ───────────────────────────────────────────────────────
 * The repo has no YAML dependency and deliberately keeps one out of the runtime
 * bundle (see lib/workflows/definitions/index.ts). The Phase-0 frontmatter
 * convention is a flat `key: value` block, which the repo's existing
 * `stripFrontMatter` already reads — so this module reuses it rather than
 * adding a parser or a second convention.
 *
 * ── FAIL CLOSED ON AUTHORITY, OPEN ON DIAGNOSTICS ────────────────────────────
 * A field outside the documented vocabulary does not become a guess. `status`
 * and `type` go null, the note ranks as draft, and the reason is recorded in
 * `diagnostics` so an operator can fix the note. Malformed metadata must never
 * produce approved or canonical knowledge; it should still be findable and
 * visibly broken.
 */

import { sha256 } from '@/lib/architecture-knowledge/hash'
import { stripFrontMatter } from '@/lib/architecture-knowledge/normalize'
import {
  authorityRankFor, isKnowledgeStatus, isKnowledgeType, isSourceOfTruth,
} from './policy'
import type {
  KnowledgeAuthorityRank, KnowledgeDiagnostic, KnowledgeProvenance,
  KnowledgeSourceOfTruth, KnowledgeStatus, KnowledgeType,
} from './types'

export interface ParsedKnowledgeDocument {
  id: string
  title: string
  path: string
  type: KnowledgeType | null
  status: KnowledgeStatus | null
  project: string | null
  sourceOfTruth: KnowledgeSourceOfTruth | null
  canonicalPath: string | null
  authorityRank: KnowledgeAuthorityRank
  /** Body with the frontmatter block removed. */
  body: string
  /** Headings, kept separately so ranking can weight them. */
  headings: string[]
  contentHash: string
  diagnostics: KnowledgeDiagnostic[]
}

/** Stable across runs for an unchanged path; independent of file content. */
export function knowledgeIdFor(relativePath: string): string {
  return sha256(relativePath).slice(0, 16)
}

function titleFrom(body: string, relativePath: string): string {
  for (const line of body.split('\n')) {
    const heading = line.match(/^#\s+(.+?)\s*$/)
    if (heading) return heading[1].trim()
  }
  const base = relativePath.split('/').pop() ?? relativePath
  return base.replace(/\.md$/i, '')
}

function headingsFrom(body: string): string[] {
  const out: string[] = []
  for (const line of body.split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/)
    if (heading) out.push(heading[1].trim())
  }
  return out
}

export function parseKnowledgeDocument(raw: string, relativePath: string): ParsedKnowledgeDocument {
  const diagnostics: KnowledgeDiagnostic[] = []
  const { body, frontMatter } = stripFrontMatter(raw)
  const hasFrontMatter = Object.keys(frontMatter).length > 0

  if (!hasFrontMatter) {
    diagnostics.push({
      issue: 'frontmatter_missing',
      field: '(document)',
      detail: 'no frontmatter block; type/status not declared, ranked as draft',
    })
  }

  // type — recognized or null. Never inferred from the folder.
  let type: KnowledgeType | null = null
  if (frontMatter.type === undefined) {
    if (hasFrontMatter) {
      diagnostics.push({ issue: 'field_missing', field: 'type', detail: 'no type declared' })
    }
  } else if (isKnowledgeType(frontMatter.type)) {
    type = frontMatter.type
  } else {
    diagnostics.push({
      issue: 'field_unrecognized', field: 'type',
      detail: `"${frontMatter.type}" is outside the documented vocabulary`,
    })
  }

  // status — recognized or null. An unrecognized status must not become approved.
  let status: KnowledgeStatus | null = null
  if (frontMatter.status === undefined) {
    if (hasFrontMatter) {
      diagnostics.push({ issue: 'field_missing', field: 'status', detail: 'no status declared' })
    }
  } else if (isKnowledgeStatus(frontMatter.status)) {
    status = frontMatter.status
  } else {
    diagnostics.push({
      issue: 'field_unrecognized', field: 'status',
      detail: `"${frontMatter.status}" is outside the documented vocabulary; ranked as draft`,
    })
  }

  let sourceOfTruth: KnowledgeSourceOfTruth | null = null
  if (frontMatter.source_of_truth !== undefined) {
    if (isSourceOfTruth(frontMatter.source_of_truth)) {
      sourceOfTruth = frontMatter.source_of_truth as KnowledgeSourceOfTruth
    } else {
      diagnostics.push({
        issue: 'field_unrecognized', field: 'source_of_truth',
        detail: `"${frontMatter.source_of_truth}" is outside the documented vocabulary`,
      })
    }
  }

  const canonicalPath = frontMatter.canonical_path?.trim() || null
  // A note claiming the repository is authoritative must say WHICH file, or the
  // claim is unverifiable and the pointer half of the contract is missing.
  if (sourceOfTruth === 'repository' && !canonicalPath) {
    diagnostics.push({
      issue: 'canonical_pointer_missing', field: 'canonical_path',
      detail: 'source_of_truth is repository but no canonical_path was given',
    })
  }

  const project = frontMatter.project?.trim() || null

  return {
    id: knowledgeIdFor(relativePath),
    title: titleFrom(body, relativePath),
    path: relativePath,
    type,
    status,
    project,
    sourceOfTruth,
    canonicalPath,
    authorityRank: authorityRankFor(sourceOfTruth, status),
    body,
    headings: headingsFrom(body),
    contentHash: sha256(raw),
    diagnostics,
  }
}

export function provenanceFor(doc: ParsedKnowledgeDocument, providerId: string): KnowledgeProvenance {
  return {
    provider: providerId,
    sourcePath: doc.path,
    contentHash: doc.contentHash,
    // Unstated source-of-truth defaults to 'vault': the note speaks only for
    // itself. It never defaults to 'repository', which would silently borrow
    // canonical authority the note has not earned.
    sourceOfTruth: doc.sourceOfTruth ?? 'vault',
    canonicalPath: doc.canonicalPath,
  }
}
