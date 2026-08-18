export const KNOWLEDGE_SCHEMA_VERSION = '1.0' as const
export const KNOWLEDGE_BUILDER_VERSION = 'akr-stage1-builder-v2' as const
export const KNOWLEDGE_INDEX_VERSION = 'lexical-v1' as const
export const KNOWLEDGE_RETRIEVER_VERSION = 'lexical-bm25-v1' as const

export type CanonicalStatus = 'verified' | 'approved' | 'candidate' | 'draft' | 'deprecated' | 'superseded'
export type ActivationStatus = 'active' | 'inactive'
export type KnowledgeClassification = 'public' | 'internal' | 'confidential' | 'local_only' | 'prohibited'

/**
 * The provenance class of one normalized knowledge record. Canonical books may
 * carry front matter (doctrine notices, implementation scope) that is NOT part
 * of the numbered chapter/section sequence. Both are canonical, but they are
 * counted, reported and cited as distinct record classes — front matter is
 * never folded into the numbered canonical section count.
 */
export type KnowledgeRecordClass = 'canonical_section' | 'canonical_front_matter'

export type KnowledgeScope =
  | { kind: 'platform' }
  | { kind: 'tenant'; tenantId: string }
  | { kind: 'project'; tenantId?: string; projectId: string }

export type KnowledgeAdapterId =
  | 'intelligence-fabric'
  | 'mobile-intelligence'
  | 'intelligence-graph'
  | 'executive-intelligence'

export interface KnowledgeSourceVersion {
  knowledgeSourceId: string
  bookId: string
  title: string
  version: string
  canonicalStatus: CanonicalStatus
  activationStatus: ActivationStatus
  current: boolean
  canonicalPath: string
  knowledgePath: string
  adapter: KnowledgeAdapterId
  manifestPath: string
  sourceChecksum: string
  approvedAt: string | null
  effectiveAt: string | null
  supersedes: string | null
  supersededBy: string | null
  deprecatedAt: string | null
  scope: KnowledgeScope
  classification: KnowledgeClassification
}

export type KnowledgeSource = KnowledgeSourceVersion

export interface KnowledgeSourceRegistry {
  schemaVersion: typeof KNOWLEDGE_SCHEMA_VERSION
  sources: KnowledgeSource[]
}

export interface KnowledgeChapter {
  knowledgeSourceId: string
  bookId: string
  title: string
  version: string
  chapterNumber: number
  chapterTitle: string
  canonicalStatus: CanonicalStatus
  implementationStatus: string
  canonicalPath: string
  sourceChecksum: string
  effectiveAt: string | null
  scope: KnowledgeScope
  classification: KnowledgeClassification
}

export interface KnowledgeSection extends KnowledgeChapter {
  sectionId: string
  sectionTitle: string
  anchor: string
  ordinal: number
  text: string
  textChecksum: string
  /** Numbered canonical section vs canonical front matter. Never conflated. */
  recordClass: KnowledgeRecordClass
  /**
   * Optional secondary provenance (e.g. a per-chapter source-file digest) kept
   * for audit. `sourceChecksum` remains the PRIMARY canonical identity and must
   * resolve to `canonicalPath` in this repository; this field never replaces it.
   */
  secondarySourceChecksum: string | null
}

export interface KnowledgeChunk {
  chunkId: string
  knowledgeSourceId: string
  bookId: string
  title: string
  version: string
  chapterNumber: number
  chapterTitle: string
  sectionIds: string[]
  sectionTitles: string[]
  anchors: string[]
  text: string
  tokenEstimate: number
  canonicalPath: string
  sourceChecksum: string
  textChecksum: string
  duplicateGroupId: string
  canonicalStatus: CanonicalStatus
  authorityKind: 'canonical_target'
  implementationStatus: string
  classification: KnowledgeClassification
  scope: KnowledgeScope
  effectiveAt: string | null
  /** Homogeneous across the grouped sections — the chunker never mixes classes. */
  recordClass: KnowledgeRecordClass
  secondarySourceChecksum: string | null
}

export interface LexicalPosting {
  chunkId: string
  termFrequency: number
}

export interface KnowledgeLexicalIndex {
  schemaVersion: typeof KNOWLEDGE_SCHEMA_VERSION
  indexVersion: typeof KNOWLEDGE_INDEX_VERSION
  documentCount: number
  averageDocumentLength: number
  documentLengths: Record<string, number>
  postings: Record<string, LexicalPosting[]>
}

export interface KnowledgeArtifactManifest {
  schemaVersion: typeof KNOWLEDGE_SCHEMA_VERSION
  builderVersion: typeof KNOWLEDGE_BUILDER_VERSION
  indexVersion: typeof KNOWLEDGE_INDEX_VERSION
  retrievalAlgorithmVersion: typeof KNOWLEDGE_RETRIEVER_VERSION
  registryChecksum: string
  sourceIds: string[]
  sourceVersions: Record<string, string>
  sourceChecksums: Record<string, string>
  artifactChecksums: Record<'sources.json' | 'sections.jsonl' | 'chunks.jsonl' | 'lexical-index.json', string>
  sourceCount: number
  /** Distinct numbered chapters. Front-matter records are excluded by design. */
  chapterCount: number
  /** Total normalized records (numbered sections + front matter). */
  sectionCount: number
  /** Numbered canonical sections only. */
  canonicalSectionCount: number
  /** Canonical front-matter records only. */
  frontMatterCount: number
  chunkCount: number
}

export interface KnowledgePolicyContext {
  principalId: string
  internalAuthorized: boolean
  tenantId?: string | null
  allowedProjectIds: string[]
  agentId?: string | null
  classificationCeiling: Exclude<KnowledgeClassification, 'local_only' | 'prohibited'>
  runtime: 'cloud' | 'local'
}

export interface KnowledgeRetrievalEnvelope {
  query: string
  policy: KnowledgePolicyContext
  tokenBudget: number
  maxResults: number
  requestedBookId?: string | null
  requestedVersion?: string | null
  correlationId?: string | null
}

export interface KnowledgeSourceReference {
  knowledgeSourceId: string
  bookId: string
  title: string
  version: string
  canonicalStatus: CanonicalStatus
  authorityKind: 'canonical_target'
  implementationStatus: string
  chapterNumber: number
  chapterTitle: string
  sectionIds: string[]
  sectionTitles: string[]
  anchor: string
  canonicalPath: string
  /** PRIMARY canonical identity: resolves to `canonicalPath` in the repository. */
  sourceChecksum: string
  /** Secondary audit provenance; never the identity used for source validation. */
  secondarySourceChecksum: string | null
  recordClass: KnowledgeRecordClass
  textChecksum: string
  effectiveAt: string | null
}

export interface KnowledgeResultPolicy {
  classification: KnowledgeClassification
  scope: KnowledgeScope
}

export interface KnowledgeCitation {
  citationId: string
  resultId: string
  chunkId: string
  artifactManifestChecksum: string
  sources: KnowledgeSourceReference[]
}

export interface KnowledgeRetrievalResult {
  resultId: string
  chunkId: string
  text: string
  score: number
  retrievalMethod: 'deterministic_lexical'
  retrieverVersion: typeof KNOWLEDGE_RETRIEVER_VERSION
  matchedTerms: string[]
  source: KnowledgeSourceReference
  alternateSources: KnowledgeSourceReference[]
  policy: KnowledgeResultPolicy
  provenance: {
    indexManifestChecksum: string
    retrievedAt: string
  }
  citation: KnowledgeCitation
  tokenEstimate: number
}

export type KnowledgeFailureCode =
  | 'artifact_missing'
  | 'artifact_invalid'
  | 'artifact_oversized'
  | 'policy_denied'
  | 'query_empty'
  | 'no_results'
  | 'deadline'
  | 'internal_error'

export interface KnowledgeRetrievalDiagnostics {
  ok: boolean
  artifactVersion: string | null
  indexManifestChecksum: string | null
  sourceIds: string[]
  resultIds: string[]
  chunkIds: string[]
  ranks: Array<{ resultId: string; rank: number; score: number; tokenEstimate: number }>
  resultCount: number
  selectedTokenCount: number
  latencyMs: number
  cacheHit: boolean
  failureCode: KnowledgeFailureCode | null
}

export interface KnowledgeRetrievalResponse {
  results: KnowledgeRetrievalResult[]
  diagnostics: KnowledgeRetrievalDiagnostics
}

export interface LoadedKnowledgeArtifact {
  manifest: KnowledgeArtifactManifest
  manifestChecksum: string
  sources: KnowledgeSource[]
  sections: KnowledgeSection[]
  chunks: KnowledgeChunk[]
  index: KnowledgeLexicalIndex
}
