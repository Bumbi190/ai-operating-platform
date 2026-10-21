/** Types for the P18 guarded review-store adapter; no active route. */
export interface CreativeReviewDecisionParams {
  readonly enrollmentId: string
  readonly reviewerUserId: string
  readonly decision: 'approve_registration_only' | 'reject_registration'
  readonly keySha256: string
  readonly proofSha256: string
  readonly projectIds: readonly string[]
  readonly reviewNonceSha256: string
  readonly reasonCode: string
}
export interface CreativePendingEnrollment {
  readonly enrollmentId: string
  readonly state: 'pending_review'
  readonly keySha256: string
  readonly proofSha256: string
  readonly projectIds: readonly string[]
}
export function makeCreativeOwnerGuardedReviewStore(db: unknown): Readonly<{
  getPendingEnrollment(id: string): Promise<CreativePendingEnrollment | null>
  recordDecision(value: CreativeReviewDecisionParams): Promise<boolean>
}>
