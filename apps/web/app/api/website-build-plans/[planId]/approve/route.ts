import {websitePlanApi} from '@/lib/website-build/planning/api'
export const dynamic='force-dynamic'
export async function POST(request:Request,context:{params:Promise<{planId:string}>}){return websitePlanApi('approve',request,await context.params)}
