/**
 * Types for structural observations. These are explicitly NOT runtime or
 * security verification and never grant import/execution rights.
 */
export declare const SOURCE_AUDIT_PIN: string
export declare const AUDITED_SOURCE_PATHS: readonly string[]

export interface SourceStructuralAssessment {
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

export declare function sourceAuditFor(
  path: unknown,
  pinnedSha: unknown,
  metadataNodeCount: unknown,
): SourceStructuralAssessment
