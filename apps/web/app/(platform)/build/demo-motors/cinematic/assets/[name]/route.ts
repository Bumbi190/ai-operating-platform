import {resolveProjectAccess} from '@/lib/auth/project-access'
import {cinematicAssetResponse} from '@/lib/website-build/studio/cinematic-assets'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:{name:string}}):Promise<Response>{
 const access=await resolveProjectAccess()
 if(!access.ok)return access.response
 if(!access.allowedProjectIds.length)return new Response('Forbidden',{status:403})
 return cinematicAssetResponse(request,params.name)
}
