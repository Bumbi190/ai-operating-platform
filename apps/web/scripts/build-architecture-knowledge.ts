import { buildArchitectureKnowledge } from '../lib/architecture-knowledge/build'
import { findRepositoryRoot, knowledgeArtifactDirectory } from '../lib/architecture-knowledge/paths'

async function main(): Promise<void> {
  const repoRoot = findRepositoryRoot()
  const report = await buildArchitectureKnowledge(repoRoot, knowledgeArtifactDirectory(repoRoot))
  console.log(JSON.stringify(report, null, 2))
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
