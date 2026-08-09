import { loadMarkdownPackage } from './markdown'
import type { KnowledgeSourceAdapter } from './types'

export const mobileIntelligenceAdapter: KnowledgeSourceAdapter = {
  id: 'mobile-intelligence',
  async load(source, repoRoot) {
    const sections = loadMarkdownPackage(source, repoRoot)
    const chapters = new Set(sections.map(section => section.chapterNumber))
    if (chapters.size !== 32) throw new Error(`${source.knowledgeSourceId}: expected 32 chapters, received ${chapters.size}`)
    return {
      source,
      sections,
      diagnostics: { chapterCount: chapters.size, sectionCount: sections.length, deterministicChecks: ['chapter-index', 'chapter-count-32'] },
    }
  },
}
