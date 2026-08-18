/**
 * Executive Intelligence — Atlas Knowledge Edition v1.0 source adapter.
 *
 * The package is a pre-built, hash-sealed knowledge edition derived from
 * Canonical v1.0. This adapter therefore does not re-parse a document: it
 * re-verifies the package against the canonical v1.0 contract and normalizes it
 * into the shared knowledge record shape. Every invariant below is executable —
 * the adapter fails closed and names the invariant it failed.
 *
 * Canonical v1.0 contract (ATLAS_KNOWLEDGE_EDITION_MANIFEST.md, 07_Validation):
 *   32 numbered chapters · 6,705 numbered canonical sections · 4 front-matter
 *   records. Front matter is canonical but is NOT part of the numbered section
 *   sequence, and is never counted as one of the 6,705.
 *
 * Provenance model (EI-S1.1 owner decision 4): the PRIMARY canonical identity of
 * every record is the canonical Executive v1.0 book registered in this
 * repository (`source.canonicalPath` / `source.sourceChecksum`), which the
 * adapter re-verifies against the file on disk. The package's per-chapter
 * source-file digest is preserved as SECONDARY provenance only — it is audit
 * metadata, never the identity used for source validation or citation binding.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizeCanonicalText } from '../normalize'
import { sha256, sha256File } from '../hash'
import type { KnowledgeSection, KnowledgeSource } from '../types'
import type { KnowledgeSourceAdapter } from './types'

/** Canonical v1.0 contract constants. Sourced from the package manifest + validation reports. */
export const EXECUTIVE_EXPECTED_CHAPTERS = 32
export const EXECUTIVE_EXPECTED_CANONICAL_SECTIONS = 6705
export const EXECUTIVE_EXPECTED_FRONT_MATTER = 4
export const EXECUTIVE_EXPECTED_FRONT_MATTER_IDS = ['FM.1', 'FM.2', 'FM.3', 'FM.4'] as const

const SECTIONS_RELATIVE_PATH = '01_Canonical_Knowledge/executive-intelligence-sections.jsonl'
const FRONT_MATTER_RELATIVE_PATH = '01_Canonical_Knowledge/front-matter.jsonl'
const SHA256 = /^[a-f0-9]{64}$/

/** Front matter sorts ahead of chapter 1 and is excluded from every chapter count. */
export const FRONT_MATTER_CHAPTER_NUMBER = 0
const FRONT_MATTER_CHAPTER_TITLE = 'Front Matter'

interface ExecutiveSectionRecord {
  chapter_number: number
  chapter_title: string
  section_id: string
  section_title: string
  canonical_text: string
  canonical_book_sha256: string
  canonical_source_file_sha256: string
  section_text_sha256: string
  implementation_status: string
}

interface ExecutiveFrontMatterRecord {
  front_matter_section: number
  section_id: string
  heading: string
  canonical_text: string
  canonical_book_sha256: string
  section_text_sha256: string
  source_type: string
}

/** Fails closed with the invariant name. Never embeds a machine path or secret. */
function invariant(condition: boolean, name: string, detail?: string): asserts condition {
  if (!condition) {
    throw new Error(`executive-intelligence: invariant ${name} failed${detail ? ` (${detail})` : ''}`)
  }
}

function readJsonl<T>(path: string, invariantName: string): T[] {
  const raw = readFileSync(path, 'utf8').trim()
  invariant(raw.length > 0, invariantName, 'package file is empty')
  return raw.split('\n').map(line => JSON.parse(line) as T)
}

function requireString(value: unknown, invariantName: string, field: string): string {
  invariant(typeof value === 'string' && value.trim().length > 0, invariantName, `missing ${field}`)
  return value as string
}

/**
 * Retrieval-facing record text. The canonical wording is never rewritten; the
 * stable record id and title are prefixed so an exact-id query ("7.29", "FM.2")
 * reaches the record the same way numbered headings do in the Markdown books.
 */
function composeRecordText(recordId: string, title: string, canonicalText: string): string {
  return normalizeCanonicalText(`${recordId} ${title}\n\n${canonicalText}`)
}

function verifyCanonicalBook(source: KnowledgeSource, repoRoot: string): string {
  invariant(
    ['approved', 'verified'].includes(source.canonicalStatus),
    'canonical-status-eligible',
    `canonicalStatus=${source.canonicalStatus}`,
  )
  invariant(SHA256.test(source.sourceChecksum), 'canonical-checksum-format')
  let actual: string
  try {
    actual = sha256File(resolve(repoRoot, source.canonicalPath))
  } catch {
    // The path itself is registry data, but the resolved absolute path is not reported.
    invariant(false, 'canonical-source-resolvable', 'registered canonical book is not readable in this repository')
    throw new Error('unreachable')
  }
  invariant(actual === source.sourceChecksum, 'canonical-book-checksum')
  return actual
}

function loadFrontMatter(
  source: KnowledgeSource,
  packageRoot: string,
  canonicalBookSha: string,
): KnowledgeSection[] {
  const records = readJsonl<ExecutiveFrontMatterRecord>(
    resolve(packageRoot, FRONT_MATTER_RELATIVE_PATH),
    'front-matter-present',
  )
  invariant(
    records.length === EXECUTIVE_EXPECTED_FRONT_MATTER,
    'front-matter-count-4',
    `received ${records.length}`,
  )

  const ordered = [...records].sort((a, b) => a.front_matter_section - b.front_matter_section)
  const seen = new Set<string>()
  const sections: KnowledgeSection[] = []

  for (const [ordinal, record] of ordered.entries()) {
    const sectionId = requireString(record.section_id, 'front-matter-required-fields', 'section_id')
    const heading = requireString(record.heading, 'front-matter-required-fields', 'heading')
    const canonicalText = requireString(record.canonical_text, 'front-matter-required-fields', 'canonical_text')
    invariant(record.source_type === 'canonical_front_matter', 'front-matter-source-type', sectionId)
    invariant(!seen.has(sectionId), 'front-matter-unique-ids', sectionId)
    seen.add(sectionId)
    invariant(
      record.canonical_book_sha256 === canonicalBookSha,
      'front-matter-book-sha-consistent',
      sectionId,
    )
    invariant(
      sha256(canonicalText) === record.section_text_sha256,
      'front-matter-record-text-checksum',
      sectionId,
    )

    const text = composeRecordText(sectionId, heading, canonicalText)
    sections.push({
      knowledgeSourceId: source.knowledgeSourceId,
      bookId: source.bookId,
      title: source.title,
      version: source.version,
      chapterNumber: FRONT_MATTER_CHAPTER_NUMBER,
      chapterTitle: FRONT_MATTER_CHAPTER_TITLE,
      canonicalStatus: source.canonicalStatus,
      // Front matter describes intended architecture exactly like every other
      // canonical record: knowledge, never proof of implementation.
      implementationStatus: 'unknown_not_verified_in_this_package',
      canonicalPath: source.canonicalPath,
      sourceChecksum: canonicalBookSha,
      effectiveAt: source.effectiveAt,
      scope: source.scope,
      classification: source.classification,
      sectionId,
      sectionTitle: heading,
      anchor: `section-${sectionId.replace(/\./g, '-').toLowerCase()}`,
      ordinal,
      text,
      textChecksum: sha256(text),
      recordClass: 'canonical_front_matter',
      // Front matter has no separate source file in the package hash schema.
      secondarySourceChecksum: null,
    })
  }

  const ids = sections.map(section => section.sectionId)
  invariant(
    EXECUTIVE_EXPECTED_FRONT_MATTER_IDS.every(id => ids.includes(id)),
    'front-matter-expected-ids',
    ids.join(','),
  )
  return sections
}

function loadCanonicalSections(
  source: KnowledgeSource,
  packageRoot: string,
  canonicalBookSha: string,
): KnowledgeSection[] {
  const records = readJsonl<ExecutiveSectionRecord>(
    resolve(packageRoot, SECTIONS_RELATIVE_PATH),
    'canonical-sections-present',
  )
  invariant(
    records.length === EXECUTIVE_EXPECTED_CANONICAL_SECTIONS,
    'canonical-section-count-6705',
    `received ${records.length}`,
  )

  const seen = new Set<string>()
  const chapters = new Map<number, string>()
  const ordinalByChapter = new Map<number, number>()
  const sections: KnowledgeSection[] = []
  let previousChapter = 0

  for (const record of records) {
    const sectionId = requireString(record.section_id, 'canonical-required-fields', 'section_id')
    const sectionTitle = requireString(record.section_title, 'canonical-required-fields', 'section_title')
    const chapterTitle = requireString(record.chapter_title, 'canonical-required-fields', 'chapter_title')
    const canonicalText = requireString(record.canonical_text, 'canonical-required-fields', 'canonical_text')
    const secondary = requireString(
      record.canonical_source_file_sha256,
      'canonical-required-fields',
      'canonical_source_file_sha256',
    )
    requireString(record.implementation_status, 'canonical-required-fields', 'implementation_status')

    const chapterNumber = record.chapter_number
    invariant(
      Number.isInteger(chapterNumber) &&
        chapterNumber >= 1 &&
        chapterNumber <= EXECUTIVE_EXPECTED_CHAPTERS,
      'canonical-chapter-range-1-32',
      `${sectionId} → ${String(chapterNumber)}`,
    )
    // The package is emitted in canonical reading order; a regression in that
    // order would silently change chunk boundaries, so it is an invariant.
    invariant(chapterNumber >= previousChapter, 'canonical-chapter-order-stable', sectionId)
    previousChapter = chapterNumber

    invariant(!seen.has(sectionId), 'canonical-unique-section-ids', sectionId)
    seen.add(sectionId)
    invariant(SHA256.test(secondary), 'canonical-secondary-checksum-format', sectionId)
    invariant(
      record.canonical_book_sha256 === canonicalBookSha,
      'canonical-book-sha-consistent',
      sectionId,
    )
    invariant(
      sha256(canonicalText) === record.section_text_sha256,
      'canonical-record-text-checksum',
      sectionId,
    )

    const existingTitle = chapters.get(chapterNumber)
    invariant(
      existingTitle === undefined || existingTitle === chapterTitle,
      'canonical-chapter-title-stable',
      `chapter ${chapterNumber}`,
    )
    chapters.set(chapterNumber, chapterTitle)

    const ordinal = ordinalByChapter.get(chapterNumber) ?? 0
    ordinalByChapter.set(chapterNumber, ordinal + 1)

    const text = composeRecordText(sectionId, sectionTitle, canonicalText)
    sections.push({
      knowledgeSourceId: source.knowledgeSourceId,
      bookId: source.bookId,
      title: source.title,
      version: source.version,
      chapterNumber,
      chapterTitle,
      canonicalStatus: source.canonicalStatus,
      implementationStatus: record.implementation_status,
      canonicalPath: source.canonicalPath,
      // PRIMARY identity = the repository-resolvable canonical book.
      sourceChecksum: canonicalBookSha,
      effectiveAt: source.effectiveAt,
      scope: source.scope,
      classification: source.classification,
      sectionId,
      sectionTitle,
      anchor: `section-${sectionId.replace(/\./g, '-').toLowerCase()}`,
      ordinal,
      text,
      textChecksum: sha256(text),
      recordClass: 'canonical_section',
      // SECONDARY audit provenance: the package's per-chapter source-file digest.
      secondarySourceChecksum: secondary,
    })
  }

  invariant(
    chapters.size === EXECUTIVE_EXPECTED_CHAPTERS,
    'canonical-chapter-count-32',
    `received ${chapters.size}`,
  )
  return sections
}

export const executiveIntelligenceAdapter: KnowledgeSourceAdapter = {
  id: 'executive-intelligence',
  async load(source, repoRoot) {
    const canonicalBookSha = verifyCanonicalBook(source, repoRoot)
    const packageRoot = resolve(repoRoot, source.knowledgePath)

    const frontMatter = loadFrontMatter(source, packageRoot, canonicalBookSha)
    const canonicalSections = loadCanonicalSections(source, packageRoot, canonicalBookSha)
    const sections = [...frontMatter, ...canonicalSections]

    const chapters = new Set(
      canonicalSections.map(section => section.chapterNumber),
    )

    return {
      source,
      sections,
      diagnostics: {
        chapterCount: chapters.size,
        sectionCount: sections.length,
        deterministicChecks: [
          'canonical-status-eligible',
          'canonical-book-checksum',
          'canonical-book-sha-consistent',
          'canonical-record-text-checksum',
          'canonical-chapter-count-32',
          'canonical-section-count-6705',
          'canonical-unique-section-ids',
          'canonical-chapter-range-1-32',
          'canonical-chapter-order-stable',
          'front-matter-count-4',
          'front-matter-expected-ids',
          'front-matter-unique-ids',
          'front-matter-record-text-checksum',
        ],
      },
    }
  },
}
