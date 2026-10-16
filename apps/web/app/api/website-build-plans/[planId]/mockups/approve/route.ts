import {websiteMockupApi} from '@/lib/website-build/planning/mockup-api'
export const dynamic='force-dynamic'
export async function POST(request:Request,context:{params:Promise<{planId:string}>}){return websiteMockupApi('approve',request,await context.params)}
