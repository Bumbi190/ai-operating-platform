import { loadMarkdownPackage } from './markdown'
import type { KnowledgeSourceAdapter } from './types'

export const intelligenceFabricAdapter: KnowledgeSourceAdapter = {
  id: 'intelligence-fabric',
  async load(source, repoRoot) {
    const sections = loadMarkdownPackage(source, repoRoot)
    const chapters = new Set(sections.map(section => section.chapterNumber))
    if (chapters.size !== 28) throw new Error(`${source.knowledgeSourceId}: expected 28 chapters, received ${chapters.size}`)
    return {
      source,
      sections,
      diagnostics: { chapterCount: chapters.size, sectionCount: sections.length, deterministicChecks: ['markdown-checksums', 'chapter-count-28'] },
    }
  },
}
