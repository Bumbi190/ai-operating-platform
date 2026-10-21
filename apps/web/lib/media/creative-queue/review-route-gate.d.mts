/** Compile-time disabled creative review Next route contract. */
export const CREATIVE_REVIEW_ROUTE_ENABLED: false
export const CREATIVE_REVIEW_ROUTE_SCHEMA: 'omnira.creative.review.route.v1'
export function handleDormantCreativeReviewRoute(
  request: Request | null,
  loadLiveHandler?: () => Promise<(request: Request) => Promise<Response>>,
): Promise<Response>
