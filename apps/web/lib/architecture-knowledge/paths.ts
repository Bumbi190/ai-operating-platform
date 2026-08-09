import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export function findRepositoryRoot(start = process.cwd()): string {
  const candidates = [start, resolve(start, '..'), resolve(start, '../..'), resolve(start, '../../..')]
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'docs/architecture')) && existsSync(resolve(candidate, 'apps/web/package.json'))) {
      return candidate
    }
  }
  throw new Error(`Could not resolve repository root from ${start}`)
}

export function knowledgeRegistryPath(repoRoot = findRepositoryRoot()): string {
  return resolve(repoRoot, 'docs/architecture/knowledge-runtime/registry.v1.json')
}

export function knowledgeArtifactDirectory(repoRoot = findRepositoryRoot()): string {
  return resolve(repoRoot, 'apps/web/data/architecture-knowledge/v1')
}
