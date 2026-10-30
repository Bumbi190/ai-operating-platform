import {cleanupReviewApi} from '@/lib/atlas/handlarborsen-test-data/review-api'
export const dynamic='force-dynamic'
export async function POST(request:Request,{params}:{params:{packageId:string}}){return cleanupReviewApi(request,params.packageId)}
export async function GET(request:Request,{params}:{params:{packageId:string}}){return cleanupReviewApi(request,params.packageId)}
