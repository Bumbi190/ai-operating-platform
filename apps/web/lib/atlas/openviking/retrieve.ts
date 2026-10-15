import { knowledgeRoot, type PublishedKnowledgeCorpus, type PublishedDocument } from './corpus'
import { requestJson, type OpenVikingConfig } from './client'

export interface KnowledgeEvidence extends PublishedDocument { snapshotId: string; score: number }
/** The remote index selects exact IDs; all returned text comes from the deployed publication. */
export async function findKnowledge(args: {
  config: OpenVikingConfig; corpus: PublishedKnowledgeCorpus; query: string; signal?: AbortSignal
}): Promise<KnowledgeEvidence[]> {
  const query = args.query.trim()
  if (!query || query.length > 2000 || args.corpus.documents.length === 0) return []
  try {
    const root = knowledgeRoot(args.corpus)
    const response = await requestJson(args.config, '/api/v1/search/find', {
      method: 'POST',
      body: JSON.stringify({ query, target_uri: root, context_type: 'resource', level: 2, limit: 8 }),
    }, args.signal) as { status?: unknown; result?: { resources?: unknown } }
    if (response?.status !== 'ok' || !Array.isArray(response.result?.resources) ||
      response.result.resources.length > 64) return []
    // v0.5.0 root_uri names a resource folder; its leaf keeps the uploaded filename.
    const available = new Map(args.corpus.documents.map((doc) => [root + '/' + doc.id + '.md/' + doc.id + '.md', doc]))
    const selected = new Set<string>()
    const evidence: KnowledgeEvidence[] = []
    let remaining = 6000
    for (const hit of response.result.resources) {
      if (!hit || typeof hit !== 'object' || hit.level !== 2 || hit.context_type !== 'resource' ||
        typeof hit.uri !== 'string' || typeof hit.score !== 'number' || !Number.isFinite(hit.score) || hit.score < 0) continue
      const doc = available.get(hit.uri)
      if (!doc || selected.has(doc.id)) continue
      selected.add(doc.id)
      const content = doc.content.slice(0, Math.min(1200, remaining))
      remaining -= content.length
      if (!content) continue
      evidence.push({ ...doc, content, snapshotId: args.corpus.snapshotId, score: hit.score })
      if (evidence.length === 8 || remaining === 0) break
    }
    return evidence
  } catch { return [] }
}
