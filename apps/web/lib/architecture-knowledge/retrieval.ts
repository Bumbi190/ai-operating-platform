import { createKnowledgeCitation, sourceReferenceFromChunk } from './citations'
import { sha256 } from './hash'
import { loadArchitectureKnowledge, type KnowledgeLoaderStatus } from './loader'
import { normalizeQuery } from './normalize'
import { filterEligibleChunks, filterEligibleSources } from './policy'
import { scoreLexicalChunks } from './lexical-index'
import type {
  KnowledgeFailureCode,
  KnowledgeRetrievalDiagnostics,
  KnowledgeRetrievalEnvelope,
  KnowledgeRetrievalResponse,
  LoadedKnowledgeArtifact,
} from './types'
import { KNOWLEDGE_RETRIEVER_VERSION } from './types'

interface RetrievalOptions {
  load?: () => KnowledgeLoaderStatus
  now?: () => string
  clock?: () => number
  disableCache?: boolean
}

const CACHE_TTL_MS = 30_000
const CACHE_MAX = 100
const cache = new Map<string, { at: number; response: KnowledgeRetrievalResponse }>()

function diagnostics(start: number, clock: () => number, failureCode: KnowledgeFailureCode, artifact?: LoadedKnowledgeArtifact): KnowledgeRetrievalDiagnostics {
  return {
    ok: false,
    artifactVersion: artifact?.manifest.builderVersion ?? null,
    indexManifestChecksum: artifact?.manifestChecksum ?? null,
    sourceIds: [], resultIds: [], chunkIds: [], ranks: [], resultCount: 0, selectedTokenCount: 0,
    latencyMs: Math.max(0, clock() - start), cacheHit: false, failureCode,
  }
}

function cacheKey(envelope: KnowledgeRetrievalEnvelope, artifact: LoadedKnowledgeArtifact): string {
  const policy = envelope.policy
  return sha256(JSON.stringify({
    manifest: artifact.manifestChecksum,
    query: normalizeQuery(envelope.query),
    principal: policy.principalId,
    internal: policy.internalAuthorized,
    tenant: policy.tenantId ?? null,
    projects: [...policy.allowedProjectIds].sort(),
    ceiling: policy.classificationCeiling,
    runtime: policy.runtime,
    book: envelope.requestedBookId ?? null,
    version: envelope.requestedVersion ?? null,
    budget: envelope.tokenBudget,
    max: envelope.maxResults,
  }))
}

export function clearKnowledgeRetrievalCache(): void { cache.clear() }

export async function retrieveArchitectureKnowledge(
  envelope: KnowledgeRetrievalEnvelope,
  options: RetrievalOptions = {},
): Promise<KnowledgeRetrievalResponse> {
  const clock = options.clock ?? Date.now
  const started = clock()
  if (!normalizeQuery(envelope.query) || envelope.maxResults <= 0 || envelope.tokenBudget <= 0) {
    return { results: [], diagnostics: diagnostics(started, clock, 'query_empty') }
  }
  const loaded = (options.load ?? loadArchitectureKnowledge)()
  if (!loaded.ok) return { results: [], diagnostics: diagnostics(started, clock, loaded.reason) }
  const artifact = loaded.artifact
  const key = cacheKey(envelope, artifact)
  if (!options.disableCache) {
    const hit = cache.get(key)
    if (hit && clock() - hit.at <= CACHE_TTL_MS) {
      return { ...hit.response, diagnostics: { ...hit.response.diagnostics, cacheHit: true, latencyMs: Math.max(0, clock() - started) } }
    }
  }

  try {
    // Authority, classification and scope are resolved before any scoring.
    const eligibleSources = filterEligibleSources(
      artifact.sources,
      envelope.policy,
      envelope.requestedVersion,
      envelope.requestedBookId,
    )
    if (!eligibleSources.length) return { results: [], diagnostics: diagnostics(started, clock, 'policy_denied', artifact) }
    const eligibleChunks = filterEligibleChunks(artifact.chunks, eligibleSources)
    const scores = scoreLexicalChunks(envelope.query, eligibleChunks, artifact.index)
    const chunksById = new Map(eligibleChunks.map(chunk => [chunk.chunkId, chunk]))
    const duplicateGroups = new Map<string, typeof eligibleChunks>()
    for (const chunk of eligibleChunks) {
      const list = duplicateGroups.get(chunk.textChecksum) ?? []
      list.push(chunk)
      duplicateGroups.set(chunk.textChecksum, list)
    }
    const seenContent = new Set<string>()
    const results: KnowledgeRetrievalResponse['results'] = []
    let selectedTokens = 0
    const retrievedAt = (options.now ?? (() => new Date().toISOString()))()
    for (const scored of scores) {
      if (results.length >= Math.min(envelope.maxResults, 20)) break
      const chunk = chunksById.get(scored.chunkId)
      if (!chunk || seenContent.has(chunk.textChecksum)) continue
      if (selectedTokens + chunk.tokenEstimate > envelope.tokenBudget && results.length) continue
      seenContent.add(chunk.textChecksum)
      selectedTokens += chunk.tokenEstimate
      const alternates = (duplicateGroups.get(chunk.textChecksum) ?? []).filter(item => item.chunkId !== chunk.chunkId)
      const resultId = `akr:${sha256(`${artifact.manifestChecksum}:${chunk.chunkId}`).slice(0, 24)}`
      const citation = createKnowledgeCitation(resultId, chunk, alternates, artifact.manifestChecksum)
      results.push({
        resultId,
        chunkId: chunk.chunkId,
        text: chunk.text,
        score: scored.score,
        retrievalMethod: 'deterministic_lexical',
        retrieverVersion: KNOWLEDGE_RETRIEVER_VERSION,
        matchedTerms: scored.matchedTerms,
        source: sourceReferenceFromChunk(chunk),
        alternateSources: alternates.map(sourceReferenceFromChunk),
        policy: { classification: chunk.classification, scope: chunk.scope },
        provenance: { indexManifestChecksum: artifact.manifestChecksum, retrievedAt },
        citation,
        tokenEstimate: chunk.tokenEstimate,
      })
    }
    const response: KnowledgeRetrievalResponse = {
      results,
      diagnostics: {
        ok: results.length > 0,
        artifactVersion: artifact.manifest.builderVersion,
        indexManifestChecksum: artifact.manifestChecksum,
        sourceIds: [...new Set(results.map(result => result.source.knowledgeSourceId))],
        resultIds: results.map(result => result.resultId),
        chunkIds: results.map(result => result.chunkId),
        ranks: results.map((result, index) => ({ resultId: result.resultId, rank: index + 1, score: result.score, tokenEstimate: result.tokenEstimate })),
        resultCount: results.length,
        selectedTokenCount: selectedTokens,
        latencyMs: Math.max(0, clock() - started),
        cacheHit: false,
        failureCode: results.length ? null : 'no_results',
      },
    }
    if (!options.disableCache) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value ?? '')
      cache.set(key, { at: clock(), response })
    }
    return response
  } catch {
    return { results: [], diagnostics: diagnostics(started, clock, 'internal_error', artifact) }
  }
}
