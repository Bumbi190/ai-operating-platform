/** P20: read-only review HTTP seam; NOT wired to Next.js host. */
export const CREATIVE_REVIEW_READ_DEPLOYED: false
export const CREATIVE_REVIEW_READ_PATH: '/api/atlas/creative/enrollments/review'
export interface CreativeReviewReadDeps {
 readonly canonicalOrigin: string
 readonly operator: () => Promise<unknown>
 readonly lookup: (id: string) => Promise<unknown>
 readonly projectOwners: (ids: string[]) => Promise<unknown>
}
export function makeCreativeReviewReadHttpBoundary(
 deps: CreativeReviewReadDeps
): (request: Request)=>Promise<Response>
