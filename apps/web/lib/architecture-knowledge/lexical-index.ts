import { normalizeQuery, tokenize } from './normalize'
import type { KnowledgeChunk, KnowledgeLexicalIndex } from './types'
import { KNOWLEDGE_INDEX_VERSION, KNOWLEDGE_SCHEMA_VERSION } from './types'

export function buildLexicalIndex(chunks: KnowledgeChunk[]): KnowledgeLexicalIndex {
  const postings = new Map<string, Array<{ chunkId: string; termFrequency: number }>>()
  const documentLengths: Record<string, number> = {}
  for (const chunk of [...chunks].sort((a, b) => a.chunkId.localeCompare(b.chunkId))) {
    const terms = tokenize([
      chunk.title,
      `chapter ${chunk.chapterNumber} kapitel ${chunk.chapterNumber}`,
      chunk.chapterTitle,
      chunk.sectionIds.join(' '),
      chunk.sectionTitles.join(' '),
      chunk.text,
    ].join('\n'))
    documentLengths[chunk.chunkId] = terms.length
    const frequencies = new Map<string, number>()
    for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1)
    for (const [term, termFrequency] of frequencies) {
      const list = postings.get(term) ?? []
      list.push({ chunkId: chunk.chunkId, termFrequency })
      postings.set(term, list)
    }
  }
  const sortedPostings: KnowledgeLexicalIndex['postings'] = {}
  for (const term of [...postings.keys()].sort()) {
    sortedPostings[term] = postings.get(term)!.sort((a, b) => a.chunkId.localeCompare(b.chunkId))
  }
  const lengths = Object.values(documentLengths)
  return {
    schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
    indexVersion: KNOWLEDGE_INDEX_VERSION,
    documentCount: chunks.length,
    averageDocumentLength: lengths.length ? lengths.reduce((sum, length) => sum + length, 0) / lengths.length : 0,
    documentLengths: Object.fromEntries(Object.entries(documentLengths).sort(([a], [b]) => a.localeCompare(b))),
    postings: sortedPostings,
  }
}

export interface LexicalScore {
  chunkId: string
  score: number
  matchedTerms: string[]
}

export function scoreLexicalChunks(
  query: string,
  chunks: KnowledgeChunk[],
  index: KnowledgeLexicalIndex,
): LexicalScore[] {
  const normalized = normalizeQuery(query)
  const queryTerms = [...new Set(tokenize(query))]
  if (!queryTerms.length) return []
  const eligible = new Map(chunks.map(chunk => [chunk.chunkId, chunk]))
  const scores = new Map<string, { score: number; matched: Set<string> }>()
  const n = Math.max(chunks.length, 1)
  const avgdl = Math.max(index.averageDocumentLength, 1)
  const k1 = 1.2
  const b = 0.75

  for (const term of queryTerms) {
    const postings = (index.postings[term] ?? []).filter(posting => eligible.has(posting.chunkId))
    if (!postings.length) continue
    const idf = Math.log(1 + (n - postings.length + 0.5) / (postings.length + 0.5))
    for (const posting of postings) {
      const dl = index.documentLengths[posting.chunkId] ?? avgdl
      const tf = posting.termFrequency
      const bm25 = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgdl)))
      const score = scores.get(posting.chunkId) ?? { score: 0, matched: new Set<string>() }
      score.score += bm25
      score.matched.add(term)
      scores.set(posting.chunkId, score)
    }
  }

  const chapterHint = normalized.match(/(?:chapter|kapitel)\s*(\d+)/)?.[1]
  const sectionHints = normalized.match(/\b\d+(?:\.\d+)+\b/g) ?? []
  const idHints = normalized.match(/\b[a-z]{2,}-\d{1,3}-\d{1,4}\b/g) ?? []
  for (const [chunkId, value] of scores) {
    const chunk = eligible.get(chunkId)!
    const title = normalizeQuery(chunk.title)
    const bookTerms = new Set(tokenize(chunk.title))
    const chapterTerms = new Set(tokenize(chunk.chapterTitle))
    const sectionTerms = new Set(tokenize(chunk.sectionTitles.join(' ')))
    for (const term of queryTerms) {
      if (bookTerms.has(term)) value.score += 4
      if (chapterTerms.has(term)) value.score += 6
      if (sectionTerms.has(term)) value.score += 3
    }
    const haystack = normalizeQuery(`${chunk.chapterTitle}\n${chunk.sectionTitles.join('\n')}\n${chunk.text}`)
    if (normalized.includes(title) || title.includes(normalized)) value.score += 12
    if (chapterHint && Number(chapterHint) === chunk.chapterNumber) value.score += 30
    for (const hint of sectionHints) if (chunk.sectionIds.includes(hint)) value.score += 80
    for (const hint of idHints) if (haystack.includes(hint)) value.score += 60
    if (normalized.length >= 8 && haystack.includes(normalized)) value.score += 10
    if (chunk.canonicalStatus === 'verified' || chunk.canonicalStatus === 'approved') value.score += 0.25
  }
  return [...scores.entries()]
    .map(([chunkId, value]) => ({ chunkId, score: Number(value.score.toFixed(6)), matchedTerms: [...value.matched].sort() }))
    .sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId))
}
