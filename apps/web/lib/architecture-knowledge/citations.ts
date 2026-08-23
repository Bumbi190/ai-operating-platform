import { sha256 } from './hash'
import type { KnowledgeCitation, KnowledgeChunk, KnowledgeRetrievalResult, KnowledgeSourceReference, LoadedKnowledgeArtifact } from './types'

export function sourceReferenceFromChunk(chunk: KnowledgeChunk): KnowledgeSourceReference {
  return {
    knowledgeSourceId: chunk.knowledgeSourceId,
    bookId: chunk.bookId,
    title: chunk.title,
    version: chunk.version,
    canonicalStatus: chunk.canonicalStatus,
    authorityKind: 'canonical_target',
    implementationStatus: chunk.implementationStatus,
    chapterNumber: chunk.chapterNumber,
    chapterTitle: chunk.chapterTitle,
    sectionIds: chunk.sectionIds,
    sectionTitles: chunk.sectionTitles,
    anchor: chunk.anchors[0] ?? '',
    canonicalPath: chunk.canonicalPath,
    sourceChecksum: chunk.sourceChecksum,
    secondarySourceChecksum: chunk.secondarySourceChecksum,
    recordClass: chunk.recordClass,
    textChecksum: chunk.textChecksum,
    effectiveAt: chunk.effectiveAt,
  }
}

export function createKnowledgeCitation(
  resultId: string,
  chunk: KnowledgeChunk,
  alternateChunks: KnowledgeChunk[],
  manifestChecksum: string,
): KnowledgeCitation {
  const sources = [chunk, ...alternateChunks]
    .map(sourceReferenceFromChunk)
    .sort((a, b) => `${a.knowledgeSourceId}:${a.chapterNumber}:${a.sectionIds.join(',')}`.localeCompare(`${b.knowledgeSourceId}:${b.chapterNumber}:${b.sectionIds.join(',')}`))
  const citationId = `akc:${sha256(`${manifestChecksum}:${resultId}:${chunk.chunkId}:${sources.map(source => source.sourceChecksum).join(':')}`).slice(0, 24)}`
  return { citationId, resultId, chunkId: chunk.chunkId, artifactManifestChecksum: manifestChecksum, sources }
}

export function validateKnowledgeCitation(
  citation: KnowledgeCitation,
  artifact: LoadedKnowledgeArtifact,
  result?: KnowledgeRetrievalResult,
): boolean {
  if (citation.artifactManifestChecksum !== artifact.manifestChecksum) return false
  const chunk = artifact.chunks.find(item => item.chunkId === citation.chunkId)
  if (!chunk || chunk.textChecksum !== citation.sources[0]?.textChecksum) return false
  if (result && (result.resultId !== citation.resultId || result.chunkId !== citation.chunkId)) return false
  const recreated = createKnowledgeCitation(citation.resultId, chunk, artifact.chunks.filter(item => item.textChecksum === chunk.textChecksum && item.chunkId !== chunk.chunkId), artifact.manifestChecksum)
  if (recreated.citationId !== citation.citationId) return false
  // The citation identifier only binds manifest, result, chunk and source checksums. Every other
  // reference field (canonicalPath, chapter, sectionIds, statuses) must also match the artifact,
  // so a presented citation can never carry an invented canonical path or section range.
  return JSON.stringify(recreated.sources) === JSON.stringify(citation.sources)
}
