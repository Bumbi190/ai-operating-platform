/**
 * Types for the Node-compatible .mjs pure search core.
 * Keep this aligned with catalog-search.mjs and its standalone smoke suite.
 */
export interface ExternalSourceQualityAssessment {
  readonly evidenceLevel: 'metadata_only_unverified' | 'pinned_json_structure_spot_checked'
  readonly sourceFileInspected: boolean
  readonly workingAutomationVerified: false
  readonly approvedForIntegration: false
  readonly observedStructure: null | {
    readonly nodeCount: number
    readonly connectionCount: number
    readonly noOpNodeCount: number
    readonly emailActionNodeCount: number
    readonly httpRequestNodeCount: number
    readonly credentialReferenceNodeCount: number
  }
  readonly warnings: readonly string[]
}

export interface ExternalWorkflowReferenceHit {
  readonly name: string
  readonly description: string
  readonly category: string
  readonly integrations: readonly string[]
  readonly nodeCountClaim: number | null
  readonly metadataPresent: boolean
  readonly sourceUrl: string
  readonly sourcePath: string
  readonly reviewState: 'unreviewed_reference_only'
  readonly qualityAssessment: ExternalSourceQualityAssessment
  readonly runnableInOmnira: false
}

export interface ExternalWorkflowSearchResult {
  readonly ok: boolean
  readonly code?: 'CATALOG_UNAVAILABLE' | 'INVALID_SEARCH_QUERY'
  readonly message?: string
  readonly matches: readonly ExternalWorkflowReferenceHit[]
  /** Supplemental pinned structural evidence, not part of the limited search hits. */
  readonly auditedNoOpExamples?: ReadonlyArray<{
    readonly name: string
    readonly sourcePath: string
    readonly sourceUrl: string
    readonly qualityAssessment: ExternalSourceQualityAssessment
    readonly reviewState: 'unreviewed_reference_only'
    readonly runnableInOmnira: false
  }>
  readonly auditedNoOpEvidenceScope?: 'five_pinned_json_files_only_not_full_catalog'
  readonly projectContext?: string | null
  readonly source?: {
    readonly repository: string
    readonly pinnedSha: string
    readonly upstreamIndexGeneratedAt: string | null
  }
  readonly indexedCount?: number
  readonly metadataCount?: number | null
  readonly upstreamClaimedTotal?: number | null
  readonly filenameOnlyCount?: number | null
  readonly totalKeywordMatches?: number
  readonly uniqueKeywordMatches?: number
  readonly duplicatesSuppressed?: number
  readonly truncated?: boolean
  readonly limitation?: string
}

export declare function searchReferences(
  index: unknown,
  input?: { readonly query?: unknown; readonly project?: unknown; readonly limit?: unknown; readonly includeNoOpAuditExamples?: unknown },
): ExternalWorkflowSearchResult
