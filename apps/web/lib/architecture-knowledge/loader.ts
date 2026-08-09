import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadAndValidateArtifactFiles, MAX_KNOWLEDGE_ARTIFACT_BYTES } from './artifact'
import { findRepositoryRoot, knowledgeArtifactDirectory } from './paths'
import type { LoadedKnowledgeArtifact } from './types'

export type KnowledgeLoaderStatus =
  | { ok: true; artifact: LoadedKnowledgeArtifact }
  | { ok: false; reason: 'artifact_missing' | 'artifact_invalid' | 'artifact_oversized' }

const FILES = ['manifest.json', 'sources.json', 'sections.jsonl', 'chunks.jsonl', 'lexical-index.json'] as const
let cache: { fingerprint: string; artifact: LoadedKnowledgeArtifact } | null = null

export function loadArchitectureKnowledge(directory = knowledgeArtifactDirectory(findRepositoryRoot())): KnowledgeLoaderStatus {
  let fingerprint = ''
  let size = 0
  try {
    const stats = FILES.map(file => statSync(resolve(directory, file)))
    size = stats.reduce((sum, stat) => sum + stat.size, 0)
    fingerprint = stats.map(stat => `${stat.size}:${stat.mtimeMs}`).join('|')
  } catch {
    return { ok: false, reason: 'artifact_missing' }
  }
  if (size > MAX_KNOWLEDGE_ARTIFACT_BYTES) return { ok: false, reason: 'artifact_oversized' }
  if (cache?.fingerprint === fingerprint) return { ok: true, artifact: cache.artifact }
  try {
    const artifact = loadAndValidateArtifactFiles(directory)
    cache = { fingerprint, artifact }
    return { ok: true, artifact }
  } catch {
    return { ok: false, reason: 'artifact_invalid' }
  }
}

export function clearArchitectureKnowledgeLoaderCache(): void {
  cache = null
}
