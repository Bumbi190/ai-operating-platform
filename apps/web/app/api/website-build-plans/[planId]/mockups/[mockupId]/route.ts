import {websiteMockupApi} from '@/lib/website-build/planning/mockup-api'
export const dynamic='force-dynamic'
export async function GET(request:Request,context:{params:Promise<{planId:string;mockupId:string}>}){return websiteMockupApi('get',request,await context.params)}
