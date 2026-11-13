import {prospectApi} from '@/lib/website-build/prospects/api'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=120
type Context={params:Promise<{prospectId:string;assetId?:string}>}
export const GET=async(request:Request,context:Context)=>prospectApi(request,{...await context.params})
export const POST=async(request:Request,context:Context)=>prospectApi(request,await context.params)
