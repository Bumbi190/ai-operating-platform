import {socialConnectionStart} from '@/lib/social-connections/api'
export const dynamic='force-dynamic'
export async function POST(request:Request,{params}:{params:{provider:string}}){return socialConnectionStart(request,params)}
