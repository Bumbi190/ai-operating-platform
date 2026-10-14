import {websitePlanApi} from '@/lib/website-build/planning/api'
export const dynamic='force-dynamic'
export async function POST(request:Request){return websitePlanApi('save',request,{})}
