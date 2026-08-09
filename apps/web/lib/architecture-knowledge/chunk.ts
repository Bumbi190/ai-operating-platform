import { sha256 } from './hash'
import type { KnowledgeChunk, KnowledgeSection } from './types'

const CHARS_PER_TOKEN = 4
export const MIN_CHUNK_TOKENS = 300
export const TARGET_CHUNK_TOKENS = 550
export const MAX_CHUNK_TOKENS = 800

export function estimateKnowledgeTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

interface Fragment {
  sections: KnowledgeSection[]
  text: string
  part: number
}

function splitLargeSection(section: KnowledgeSection): Fragment[] {
  if (estimateKnowledgeTokens(section.text) <= MAX_CHUNK_TOKENS) return [{ sections: [section], text: section.text, part: 1 }]
  const paragraphs = section.text.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
  const fragments: Fragment[] = []
  let current: string[] = []
  for (const paragraph of paragraphs) {
    const candidate = [...current, paragraph].join('\n\n')
    if (current.length && estimateKnowledgeTokens(candidate) > MAX_CHUNK_TOKENS) {
      fragments.push({ sections: [section], text: current.join('\n\n'), part: fragments.length + 1 })
      current = [paragraph]
    } else {
      current.push(paragraph)
    }
  }
  if (current.length) fragments.push({ sections: [section], text: current.join('\n\n'), part: fragments.length + 1 })
  return fragments
}

function createChunk(fragments: Fragment[]): KnowledgeChunk {
  const sections = fragments.flatMap(fragment => fragment.sections)
  const first = sections[0]
  const uniqueSections = [...new Map(sections.map(section => [section.sectionId, section])).values()]
  const text = fragments.map(fragment => fragment.text).join('\n\n')
  const textChecksum = sha256(text)
  const interval = `${uniqueSections[0].sectionId}..${uniqueSections[uniqueSections.length - 1].sectionId}`
  const part = fragments.length === 1 ? fragments[0].part : 1
  return {
    chunkId: `ak:${first.bookId}:${first.version}:ch${first.chapterNumber}:${interval}:p${part}:${textChecksum.slice(0, 16)}`,
    knowledgeSourceId: first.knowledgeSourceId,
    bookId: first.bookId,
    title: first.title,
    version: first.version,
    chapterNumber: first.chapterNumber,
    chapterTitle: first.chapterTitle,
    sectionIds: uniqueSections.map(section => section.sectionId),
    sectionTitles: uniqueSections.map(section => section.sectionTitle),
    anchors: uniqueSections.map(section => section.anchor),
    text,
    tokenEstimate: estimateKnowledgeTokens(text),
    canonicalPath: first.canonicalPath,
    sourceChecksum: first.sourceChecksum,
    textChecksum,
    duplicateGroupId: `dup:${textChecksum}`,
    canonicalStatus: first.canonicalStatus,
    authorityKind: 'canonical_target',
    implementationStatus: first.implementationStatus,
    classification: first.classification,
    scope: first.scope,
    effectiveAt: first.effectiveAt,
  }
}

/** Deterministic section-first grouping. It never crosses a chapter boundary. */
export function chunkKnowledgeSections(sections: KnowledgeSection[]): KnowledgeChunk[] {
  const sorted = [...sections].sort((a, b) =>
    a.knowledgeSourceId.localeCompare(b.knowledgeSourceId) ||
    a.chapterNumber - b.chapterNumber ||
    a.ordinal - b.ordinal,
  )
  const chunks: KnowledgeChunk[] = []
  let group: Fragment[] = []
  let groupKey = ''

  const flush = () => {
    if (group.length) chunks.push(createChunk(group))
    group = []
  }

  for (const section of sorted) {
    const key = `${section.knowledgeSourceId}:${section.chapterNumber}`
    if (groupKey && key !== groupKey) flush()
    groupKey = key
    for (const fragment of splitLargeSection(section)) {
      const nextTokens = estimateKnowledgeTokens([...group.map(item => item.text), fragment.text].join('\n\n'))
      const currentTokens = estimateKnowledgeTokens(group.map(item => item.text).join('\n\n'))
      if (group.length && nextTokens > MAX_CHUNK_TOKENS && currentTokens >= MIN_CHUNK_TOKENS) flush()
      // A split fragment already represents a stable large-section boundary.
      if (fragment.part > 1 || (fragment.part === 1 && estimateKnowledgeTokens(section.text) > MAX_CHUNK_TOKENS)) {
        flush()
        chunks.push(createChunk([fragment]))
      } else {
        group.push(fragment)
        if (estimateKnowledgeTokens(group.map(item => item.text).join('\n\n')) >= TARGET_CHUNK_TOKENS) flush()
      }
    }
  }
  flush()
  const ids = new Set<string>()
  for (const chunk of chunks) {
    if (ids.has(chunk.chunkId)) throw new Error(`Duplicate chunk identity: ${chunk.chunkId}`)
    ids.add(chunk.chunkId)
  }
  return chunks
}
