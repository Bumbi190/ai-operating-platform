import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizeCanonicalText } from '../normalize'
import { sha256 } from '../hash'
import type { KnowledgeSection } from '../types'
import type { KnowledgeSourceAdapter } from './types'

interface ExecutiveSectionRecord {
  chapter_number: number
  chapter_title: string
  section_id: string
  section_title: string
  canonical_text: string
  canonical_source_file_sha256: string
  section_text_sha256: string
  implementation_status: string
}

export const executiveIntelligenceAdapter: KnowledgeSourceAdapter = {
  id: 'executive-intelligence',
  async load(source, repoRoot) {
    // This adapter is intentionally available for validation, but the registry
    // keeps the source inactive until package activation is separately approved.
    const path = resolve(repoRoot, source.knowledgePath, '01_Canonical_Knowledge/executive-intelligence-sections.jsonl')
    const records = readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line) as ExecutiveSectionRecord)
    const sections: KnowledgeSection[] = records.map((record, ordinal) => {
      const text = normalizeCanonicalText(`${record.section_title}\n\n${record.canonical_text}`)
      return {
        knowledgeSourceId: source.knowledgeSourceId,
        bookId: source.bookId,
        title: source.title,
        version: source.version,
        chapterNumber: record.chapter_number,
        chapterTitle: record.chapter_title,
        canonicalStatus: source.canonicalStatus,
        implementationStatus: record.implementation_status,
        canonicalPath: source.canonicalPath,
        sourceChecksum: record.canonical_source_file_sha256,
        effectiveAt: source.effectiveAt,
        scope: source.scope,
        classification: source.classification,
        sectionId: record.section_id,
        sectionTitle: record.section_title,
        anchor: `section-${record.section_id.replace(/\./g, '-')}`,
        ordinal,
        text,
        textChecksum: sha256(text),
      }
    })
    const chapters = new Set(sections.map(section => section.chapterNumber))
    return { source, sections, diagnostics: { chapterCount: chapters.size, sectionCount: sections.length, deterministicChecks: ['package-record-checksums'] } }
  },
}
