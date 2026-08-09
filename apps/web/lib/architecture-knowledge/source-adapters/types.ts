import type { KnowledgeSection, KnowledgeSource } from '../types'

export interface SourceAdapterResult {
  source: KnowledgeSource
  sections: KnowledgeSection[]
  diagnostics: {
    chapterCount: number
    sectionCount: number
    deterministicChecks: string[]
  }
}

export interface KnowledgeSourceAdapter {
  id: KnowledgeSource['adapter']
  load(source: KnowledgeSource, repoRoot: string): Promise<SourceAdapterResult>
}
