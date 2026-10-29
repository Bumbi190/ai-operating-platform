/**
 * Atlas OpenViking project-only evidence lookup, no production caller.
 * The remote index is ONLY a relevance hint: all returned source text comes
 * from the independently hash-validated publication artifact (corpus.ts).
 * A caller MUST supply fresh, authenticated allowed project IDs.
 */
import 'server-only'

import { knowledgeRoot, type PublishedCorpus, type PublishedDocument } from './corpus'
import { searchOpenVikingIdentifiers, type OpenVikingReadConfig } from './client'

export interface ProjectKnowledgeEvidence extends PublishedDocument {
  readonly projectId: string
  readonly snapshotId: string
  readonly score: number
  readonly sourceUntrusted: true
  readonly actionAuthority: false
}

/** Never fetch text from an arbitrary URI returned by OpenViking. */
export async function findProjectKnowledge(args: {
  config: OpenVikingReadConfig
  corpus: PublishedCorpus
  query: string
  /** From fresh server authorization, never user input or remote model output. */
  authorizedProjectIds: readonly string[]
  fetcher?: typeof fetch
  signal?: AbortSignal
}): Promise<ProjectKnowledgeEvidence[]> {
  const project = args.corpus.projectId
  if (!Array.isArray(args.authorizedProjectIds) || !args.authorizedProjectIds.includes(project)
    || !args.query.trim() || args.query.length > 2_000 || args.corpus.documents.length === 0) {
    return []
  }
  const root = knowledgeRoot(args.corpus)
  try {
    const response = await searchOpenVikingIdentifiers({
      config: args.config, projectRoot: root, query: args.query,
      fetcher: args.fetcher, signal: args.signal,
    })
    if (!response || typeof response !== 'object' || Array.isArray(response)) return []
    const envelope = response as Record<string, unknown>
    if (envelope.status !== 'ok' || !envelope.result
      || typeof envelope.result !== 'object' || Array.isArray(envelope.result)) return []
    const resources = (envelope.result as Record<string, unknown>).resources
    if (!Array.isArray(resources) || resources.length > 64) return []

    // Exact, immutable source IDs, never a prefix match or a remote URL.
    // Current pilot protocol used nested leaf filenames at level 2; fail
    // closed on any future server-format changes until reverified.
    const known = new Map(args.corpus.documents.map(doc =>
      [root + '/' + doc.id + '.md/' + doc.id + '.md', doc] as const))
    const used = new Set<string>()
    const evidence: ProjectKnowledgeEvidence[] = []
    let remaining = 6_000
    for (const result of resources) {
      if (!result || typeof result !== 'object' || Array.isArray(result)) continue
      const hit = result as Record<string, unknown>
      if (hit.level !== 2 || hit.context_type !== 'resource'
        || typeof hit.uri !== 'string' || typeof hit.score !== 'number'
        || !Number.isFinite(hit.score) || hit.score < 0) continue
      const doc = known.get(hit.uri)
      if (!doc || used.has(doc.id)) continue
      used.add(doc.id)
      const content = doc.content.slice(0, Math.min(1_200, remaining))
      remaining -= content.length
      if (!content) continue
      evidence.push({
        ...doc, content, score: hit.score,
        projectId: project, snapshotId: args.corpus.snapshotId,
        sourceUntrusted: true, actionAuthority: false,
      })
      if (evidence.length >= 8 || remaining <= 0) break
    }
    return evidence
  } catch {
    // No silent fallback to a different project or old snapshot.
    return []
  }
}
