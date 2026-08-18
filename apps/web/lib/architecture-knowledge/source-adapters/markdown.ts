import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { sha256File } from '../hash'
import { parseMarkdownSections, stripFrontMatter } from '../normalize'
import type { KnowledgeSection, KnowledgeSource } from '../types'

export interface MarkdownChapterIndexEntry {
  chapter: number
  title?: string
  title_en?: string
  title_sv?: string
  markdown?: string
  file?: string
  source_docx?: string
  source_sha256: string
  markdown_sha256?: string
  approved?: boolean
  status?: string
}

export function loadMarkdownPackage(
  source: KnowledgeSource,
  repoRoot: string,
  indexRelativePath = 'index/chapters.json',
): KnowledgeSection[] {
  const packageRoot = resolve(repoRoot, source.knowledgePath)
  const entries = JSON.parse(readFileSync(resolve(packageRoot, indexRelativePath), 'utf8')) as MarkdownChapterIndexEntry[]
  const sections: KnowledgeSection[] = []
  for (const entry of entries.sort((a, b) => a.chapter - b.chapter)) {
    const markdownRelative = entry.markdown ?? entry.file
    if (!markdownRelative) throw new Error(`${source.knowledgeSourceId}: chapter ${entry.chapter} missing Markdown path`)
    const markdownPath = resolve(packageRoot, markdownRelative)
    if (entry.markdown_sha256 && sha256File(markdownPath) !== entry.markdown_sha256) {
      throw new Error(`${source.knowledgeSourceId}: Markdown checksum mismatch for chapter ${entry.chapter}`)
    }
    if (entry.approved === false) throw new Error(`${source.knowledgeSourceId}: unapproved chapter ${entry.chapter}`)
    const markdown = readFileSync(markdownPath, 'utf8')
    const { frontMatter } = stripFrontMatter(markdown)
    const chapterTitle = entry.title ?? entry.title_en ?? entry.title_sv ?? frontMatter.title ?? `Chapter ${entry.chapter}`
    let canonicalPath = source.canonicalPath
    if (entry.source_docx) {
      const candidate = resolve(dirname(markdownPath), entry.source_docx)
      canonicalPath = relative(repoRoot, candidate)
    }
    for (const draft of parseMarkdownSections(markdown, entry.chapter)) {
      sections.push({
        knowledgeSourceId: source.knowledgeSourceId,
        bookId: source.bookId,
        title: source.title,
        version: source.version,
        chapterNumber: entry.chapter,
        chapterTitle,
        canonicalStatus: source.canonicalStatus,
        implementationStatus: frontMatter.implementation_status ?? 'unknown_not_verified_in_this_package',
        canonicalPath,
        sourceChecksum: entry.source_sha256,
        effectiveAt: source.effectiveAt,
        scope: source.scope,
        classification: source.classification,
        recordClass: 'canonical_section',
        // Markdown packages carry no separate secondary digest beyond the
        // per-chapter source checksum already used as the primary identity.
        secondarySourceChecksum: null,
        ...draft,
      })
    }
  }
  return sections
}
