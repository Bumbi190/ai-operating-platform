import {cleanupReviewApi} from '@/lib/atlas/handlarborsen-test-data/review-api'
export const dynamic='force-dynamic'
export async function POST(request:Request,{params}:{params:Promise<{packageId:string}>}){return cleanupReviewApi(request,(await params).packageId)}
export async function GET(request:Request,{params}:{params:Promise<{packageId:string}>}){return cleanupReviewApi(request,(await params).packageId)}
