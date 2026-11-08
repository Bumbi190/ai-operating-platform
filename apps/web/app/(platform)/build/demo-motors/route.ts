import {resolveProjectAccess} from '@/lib/auth/project-access'

export const dynamic='force-dynamic'

/** Default to the authored cinematic hero; the classic index.html stays available. */
export async function GET(request:Request):Promise<Response>{
 const access=await resolveProjectAccess()
 if(!access.ok)return access.response
 if(!access.allowedProjectIds.length)return new Response('Forbidden',{status:403})
 return Response.redirect(new URL('/build/demo-motors/cinematic',request.url),307)
}
