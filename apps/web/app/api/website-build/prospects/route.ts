import {prospectApi} from '@/lib/website-build/prospects/api'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=120
export const GET=(request:Request)=>prospectApi(request)
export const POST=(request:Request)=>prospectApi(request)
