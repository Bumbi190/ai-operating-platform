import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { sha256 } from './hash'
import { validateKnowledgeRegistry } from './registry'
import type {
  KnowledgeArtifactManifest,
  KnowledgeChunk,
  KnowledgeLexicalIndex,
  KnowledgeSection,
  KnowledgeSource,
  LoadedKnowledgeArtifact,
} from './types'
import { KNOWLEDGE_BUILDER_VERSION, KNOWLEDGE_INDEX_VERSION, KNOWLEDGE_SCHEMA_VERSION, KNOWLEDGE_RETRIEVER_VERSION } from './types'

export const MAX_KNOWLEDGE_ARTIFACT_BYTES = 128 * 1024 * 1024
const ARTIFACT_FILES = ['manifest.json', 'sources.json', 'sections.jsonl', 'chunks.jsonl', 'lexical-index.json'] as const

function parseJsonLines<T>(raw: string): T[] {
  if (!raw.trim()) return []
  return raw.trimEnd().split('\n').map(line => JSON.parse(line) as T)
}

function assertManifest(value: unknown): KnowledgeArtifactManifest {
  if (!value || typeof value !== 'object') throw new Error('Artifact manifest must be an object')
  const manifest = value as KnowledgeArtifactManifest
  if (manifest.schemaVersion !== KNOWLEDGE_SCHEMA_VERSION) throw new Error('Unsupported artifact schemaVersion')
  if (manifest.builderVersion !== KNOWLEDGE_BUILDER_VERSION) throw new Error('Unsupported artifact builderVersion')
  if (manifest.indexVersion !== KNOWLEDGE_INDEX_VERSION) throw new Error('Unsupported lexical index version')
  if (manifest.retrievalAlgorithmVersion !== KNOWLEDGE_RETRIEVER_VERSION) throw new Error('Unsupported retrieval algorithm version')
  return manifest
}

export function loadAndValidateArtifactFiles(directory: string): LoadedKnowledgeArtifact {
  let totalBytes = 0
  for (const file of ARTIFACT_FILES) totalBytes += statSync(resolve(directory, file)).size
  if (totalBytes > MAX_KNOWLEDGE_ARTIFACT_BYTES) throw new Error('Architecture knowledge artifact exceeds size limit')
  const rawManifest = readFileSync(resolve(directory, 'manifest.json'), 'utf8')
  const rawSources = readFileSync(resolve(directory, 'sources.json'), 'utf8')
  const rawSections = readFileSync(resolve(directory, 'sections.jsonl'), 'utf8')
  const rawChunks = readFileSync(resolve(directory, 'chunks.jsonl'), 'utf8')
  const rawIndex = readFileSync(resolve(directory, 'lexical-index.json'), 'utf8')
  const manifest = assertManifest(JSON.parse(rawManifest))
  const sourceRegistry = validateKnowledgeRegistry({ schemaVersion: KNOWLEDGE_SCHEMA_VERSION, sources: JSON.parse(rawSources) })
  const sources = sourceRegistry.sources
  const sections = parseJsonLines<KnowledgeSection>(rawSections)
  const chunks = parseJsonLines<KnowledgeChunk>(rawChunks)
  const index = JSON.parse(rawIndex) as KnowledgeLexicalIndex
  const checksums = {
    'sources.json': sha256(rawSources),
    'sections.jsonl': sha256(rawSections),
    'chunks.jsonl': sha256(rawChunks),
    'lexical-index.json': sha256(rawIndex),
  }
  for (const [file, checksum] of Object.entries(checksums)) {
    if (manifest.artifactChecksums[file as keyof typeof checksums] !== checksum) throw new Error(`Artifact checksum mismatch: ${file}`)
  }
  if (manifest.sourceCount !== sources.length || manifest.sectionCount !== sections.length || manifest.chunkCount !== chunks.length) {
    throw new Error('Artifact manifest counts do not match payloads')
  }
  // Record classes are counted separately and must reconcile with the total, so
  // front matter can never be silently folded into the numbered section count.
  const canonicalSectionCount = sections.filter(section => section.recordClass === 'canonical_section').length
  const frontMatterCount = sections.filter(section => section.recordClass === 'canonical_front_matter').length
  if (manifest.canonicalSectionCount !== canonicalSectionCount || manifest.frontMatterCount !== frontMatterCount) {
    throw new Error('Artifact manifest record-class counts do not match payloads')
  }
  if (canonicalSectionCount + frontMatterCount !== sections.length) {
    throw new Error('Artifact contains sections with an unknown record class')
  }
  if (index.schemaVersion !== KNOWLEDGE_SCHEMA_VERSION || index.indexVersion !== KNOWLEDGE_INDEX_VERSION || index.documentCount !== chunks.length) {
    throw new Error('Malformed lexical index')
  }
  const sourceIds = new Set(sources.map(source => source.knowledgeSourceId))
  const sectionKeys = new Set(sections.map(section => `${section.knowledgeSourceId}:${section.chapterNumber}:${section.sectionId}`))
  const chunkIds = new Set<string>()
  for (const chunk of chunks) {
    if (chunkIds.has(chunk.chunkId)) throw new Error(`Duplicate chunk identity: ${chunk.chunkId}`)
    chunkIds.add(chunk.chunkId)
    if (!sourceIds.has(chunk.knowledgeSourceId)) throw new Error(`Chunk references missing source: ${chunk.chunkId}`)
    if (sha256(chunk.text) !== chunk.textChecksum) throw new Error(`Chunk text checksum mismatch: ${chunk.chunkId}`)
    for (const sectionId of chunk.sectionIds) {
      if (!sectionKeys.has(`${chunk.knowledgeSourceId}:${chunk.chapterNumber}:${sectionId}`)) throw new Error(`Chunk references missing section: ${chunk.chunkId}/${sectionId}`)
    }
    if (index.documentLengths[chunk.chunkId] === undefined) throw new Error(`Lexical index missing chunk: ${chunk.chunkId}`)
  }
  return { manifest, manifestChecksum: sha256(rawManifest), sources, sections, chunks, index }
}

export function artifactPayloadSize(directory: string): number {
  return ARTIFACT_FILES.reduce((sum, file) => sum + statSync(resolve(directory, file)).size, 0)
}

export function artifactSources(value: unknown): KnowledgeSource[] {
  return validateKnowledgeRegistry({ schemaVersion: KNOWLEDGE_SCHEMA_VERSION, sources: value }).sources
}
