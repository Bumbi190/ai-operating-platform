/** Disabled P18 operator review HTTP contract. No production route. */
import type {CreativePendingEnrollment, CreativeReviewDecisionParams} from './review-store-p18.mjs'
export const CREATIVE_REVIEW_HTTP_LIVE: false
export const CREATIVE_REVIEW_POST_PATH: '/api/atlas/creative/enrollments/review'
export type TrustedOperatorResolution =
  | { ok: true; userId: string }
  | { ok: false; reason?: string }
export interface CreativeReviewHttpDependencies {
  readonly expectedOrigin: string
  readonly operator: () => Promise<TrustedOperatorResolution>
  readonly projectOwners: (ids: string[]) => Promise<readonly { id: string; ownerId: string }[]>
  readonly store: {
    getPendingEnrollment(enrollmentId: string): Promise<CreativePendingEnrollment | null>
    recordDecision(value: CreativeReviewDecisionParams): Promise<boolean>
  }
}
export function makeCreativeReviewHttpBoundary(
  dependencies: CreativeReviewHttpDependencies,
): (request: Request) => Promise<Response>
