import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chunkKnowledgeSections } from './chunk'
import { loadAndValidateArtifactFiles } from './artifact'
import { sha256, sha256File, stableJson } from './hash'
import { buildLexicalIndex } from './lexical-index'
import { activeKnowledgeSources, artifactEligibilityFailure, loadKnowledgeRegistry } from './registry'
import { sourceAdapterFor } from './source-adapters'
import type { KnowledgeArtifactManifest, KnowledgeSection } from './types'
import { KNOWLEDGE_BUILDER_VERSION, KNOWLEDGE_INDEX_VERSION, KNOWLEDGE_RETRIEVER_VERSION, KNOWLEDGE_SCHEMA_VERSION } from './types'

function jsonLines(values: unknown[]): string {
  return values.map(value => JSON.stringify(value)).join('\n') + (values.length ? '\n' : '')
}

export interface KnowledgeBuildReport {
  manifest: KnowledgeArtifactManifest
  artifactDirectory: string
  artifactSizeBytes: number
  sourceDiagnostics: Record<string, { chapterCount: number; sectionCount: number; deterministicChecks: string[] }>
}

export async function buildArchitectureKnowledge(repoRoot: string, artifactDirectory: string): Promise<KnowledgeBuildReport> {
  const registry = loadKnowledgeRegistry(repoRoot)
  const registryRaw = readFileSync(resolve(repoRoot, 'docs/architecture/knowledge-runtime/registry.v1.json'), 'utf8')
  const sources = activeKnowledgeSources(registry)
  const allSections: KnowledgeSection[] = []
  const sourceDiagnostics: KnowledgeBuildReport['sourceDiagnostics'] = {}
  for (const source of sources) {
    const canonicalPath = resolve(repoRoot, source.canonicalPath)
    if (sha256File(canonicalPath) !== source.sourceChecksum) throw new Error(`${source.knowledgeSourceId}: canonical source checksum mismatch`)
    const result = await sourceAdapterFor(source).load(source, repoRoot)
    allSections.push(...result.sections)
    sourceDiagnostics[source.knowledgeSourceId] = result.diagnostics
  }
  const sections = allSections.sort((a, b) =>
    a.knowledgeSourceId.localeCompare(b.knowledgeSourceId) || a.chapterNumber - b.chapterNumber || a.ordinal - b.ordinal,
  )
  const chunks = chunkKnowledgeSections(sections)
  const index = buildLexicalIndex(chunks)
  mkdirSync(artifactDirectory, { recursive: true })
  const payloads = {
    'sources.json': stableJson(sources),
    'sections.jsonl': jsonLines(sections),
    'chunks.jsonl': jsonLines(chunks),
    'lexical-index.json': stableJson(index),
  }
  for (const [file, payload] of Object.entries(payloads)) writeFileSync(resolve(artifactDirectory, file), payload)
  const canonicalSections = sections.filter(section => section.recordClass === 'canonical_section')
  const frontMatterSections = sections.filter(section => section.recordClass === 'canonical_front_matter')
  // Chapters are counted over numbered canonical sections only: front matter is
  // canonical doctrine but is not a chapter and never inflates the count.
  const chapterCount = new Set(canonicalSections.map(section => `${section.knowledgeSourceId}:${section.chapterNumber}`)).size
  const manifest: KnowledgeArtifactManifest = {
    schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
    builderVersion: KNOWLEDGE_BUILDER_VERSION,
    indexVersion: KNOWLEDGE_INDEX_VERSION,
    retrievalAlgorithmVersion: KNOWLEDGE_RETRIEVER_VERSION,
    registryChecksum: sha256(registryRaw),
    sourceIds: sources.map(source => source.knowledgeSourceId),
    sourceVersions: Object.fromEntries(sources.map(source => [source.knowledgeSourceId, source.version])),
    sourceChecksums: Object.fromEntries(sources.map(source => [source.knowledgeSourceId, source.sourceChecksum])),
    artifactChecksums: Object.fromEntries(Object.entries(payloads).map(([file, payload]) => [file, sha256(payload)])) as KnowledgeArtifactManifest['artifactChecksums'],
    sourceCount: sources.length,
    chapterCount,
    sectionCount: sections.length,
    canonicalSectionCount: canonicalSections.length,
    frontMatterCount: frontMatterSections.length,
    chunkCount: chunks.length,
  }
  writeFileSync(resolve(artifactDirectory, 'manifest.json'), stableJson(manifest))
  const validated = loadAndValidateArtifactFiles(artifactDirectory)
  return {
    manifest: validated.manifest,
    artifactDirectory,
    artifactSizeBytes: Object.keys(payloads).reduce((sum, file) => sum + Buffer.byteLength(payloads[file as keyof typeof payloads]), Buffer.byteLength(stableJson(manifest))),
    sourceDiagnostics,
  }
}

export function verifyArchitectureKnowledge(repoRoot: string, artifactDirectory: string): KnowledgeBuildReport {
  const registry = loadKnowledgeRegistry(repoRoot)
  const registryRaw = readFileSync(resolve(repoRoot, 'docs/architecture/knowledge-runtime/registry.v1.json'), 'utf8')
  const active = activeKnowledgeSources(registry)
  for (const source of active) {
    if (sha256File(resolve(repoRoot, source.canonicalPath)) !== source.sourceChecksum) throw new Error(`${source.knowledgeSourceId}: source checksum mismatch`)
  }
  const artifact = loadAndValidateArtifactFiles(artifactDirectory)
  if (artifact.manifest.registryChecksum !== sha256(registryRaw)) throw new Error('Artifact/source registry divergence')
  const expectedIds = active.map(source => source.knowledgeSourceId).sort()
  if (artifact.manifest.sourceIds.slice().sort().join('|') !== expectedIds.join('|')) throw new Error('Artifact active source set mismatch')
  // Generic registry/artifact divergence check. Every source the artifact
  // actually carries must still exist in the registry, be byte-identical to its
  // registry row, and independently satisfy the same eligibility rule the
  // builder selected on. No book is named here — an inactive, candidate,
  // superseded, non-current or cloud-ineligible source is rejected by identity
  // of the rule, not by a special case.
  const registered = new Map(registry.sources.map(source => [source.knowledgeSourceId, source]))
  for (const source of artifact.sources) {
    const match = registered.get(source.knowledgeSourceId)
    if (!match) throw new Error(`Artifact carries unregistered source: ${source.knowledgeSourceId}`)
    // Eligibility is checked before row equality so the reported cause is the
    // specific rule the artifact broke, not the generic "it differs" symptom.
    const failure = artifactEligibilityFailure(source)
    if (failure) throw new Error(`Ineligible source entered artifact: ${source.knowledgeSourceId} (${failure})`)
    if (stableJson(match) !== stableJson(source)) throw new Error(`Artifact/registry source divergence: ${source.knowledgeSourceId}`)
  }
  return {
    manifest: artifact.manifest,
    artifactDirectory,
    artifactSizeBytes: 0,
    sourceDiagnostics: {},
  }
}
