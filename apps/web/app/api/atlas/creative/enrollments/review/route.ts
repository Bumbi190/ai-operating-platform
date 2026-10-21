/**
 * P19 DORMANT, not a new approval permission. Even a public HTTP request
 * fails before Supabase cookies, operator auth or the media worker load.
 */
import {handleDormantCreativeReviewRoute} from '@/lib/media/creative-queue/review-route-gate.mjs'

export const dynamic='force-dynamic'
export const revalidate=0

export async function GET(request: Request) {
 return handleDormantCreativeReviewRoute(request)
}

export async function POST(request: Request) {
 return handleDormantCreativeReviewRoute(request)
}
