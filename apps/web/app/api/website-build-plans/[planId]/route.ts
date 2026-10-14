import {websitePlanApi} from '@/lib/website-build/planning/api'
export const dynamic='force-dynamic'
export async function GET(request:Request,context:{params:Promise<{planId:string}>}){return websitePlanApi('get',request,await context.params)}
