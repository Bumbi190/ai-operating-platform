/**
 * Types for the Node-compatible .mjs pure search core.
 * Keep this aligned with catalog-search.mjs and its standalone smoke suite.
 */
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
  readonly runnableInOmnira: false
}

export interface ExternalWorkflowSearchResult {
  readonly ok: boolean
  readonly code?: 'CATALOG_UNAVAILABLE' | 'INVALID_SEARCH_QUERY'
  readonly message?: string
  readonly matches: readonly ExternalWorkflowReferenceHit[]
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
  readonly truncated?: boolean
  readonly limitation?: string
}

export declare function searchReferences(
  index: unknown,
  input?: { readonly query?: unknown; readonly project?: unknown; readonly limit?: unknown },
): ExternalWorkflowSearchResult
