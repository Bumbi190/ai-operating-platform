import { verifyArchitectureKnowledge } from '../lib/architecture-knowledge/build'
import { findRepositoryRoot, knowledgeArtifactDirectory } from '../lib/architecture-knowledge/paths'

const repoRoot = findRepositoryRoot()
const report = verifyArchitectureKnowledge(repoRoot, knowledgeArtifactDirectory(repoRoot))
console.log(JSON.stringify({ ok: true, manifest: report.manifest }, null, 2))
