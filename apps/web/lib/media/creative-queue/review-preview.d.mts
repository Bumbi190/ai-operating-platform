/** Static declarations for the disabled P17 creative review projection. */
export const CREATIVE_REVIEW_UI_LIVE: false

export interface CreativeReviewPreview {
  readonly enrollmentId: string
  readonly workerId: string
  readonly projectIds: readonly string[]
  readonly keySha256: string
  readonly proofSha256: string
  readonly status: 'pending_review'
  readonly reviewSubmissionAvailable: false
  readonly workerIdentityActivated: false
  readonly executionAuthorized: false
  readonly publishAuthorized: false
}

export type CreativeReviewPreviewResult =
  | { readonly status: 'ok'; readonly preview: CreativeReviewPreview }
  | { readonly status: 'invalid_request' | 'operator_required' | 'unavailable' | 'not_available' | 'not_permitted' }

export function makeCreativeReviewPreviewReader(deps: {
  operator: () => Promise<unknown>
  lookup: (enrollmentId: string) => Promise<unknown>
  projectOwners: (projectIds: string[]) => Promise<unknown>
}): Readonly<{ read(enrollmentId: string): Promise<CreativeReviewPreviewResult> }>
