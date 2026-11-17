import {socialConnectionStart} from '@/lib/social-connections/api'
export const dynamic='force-dynamic'
export async function POST(request:Request,{params}:{params:Promise<{provider:string}>}){return socialConnectionStart(request,(await params))}
