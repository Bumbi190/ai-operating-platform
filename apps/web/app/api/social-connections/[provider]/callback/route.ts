import {socialConnectionCallback} from '@/lib/social-connections/api'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{provider:string}>}){return socialConnectionCallback(request,(await params))}
