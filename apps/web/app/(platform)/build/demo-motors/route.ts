import {resolveProjectAccess} from '@/lib/auth/project-access'

export const dynamic='force-dynamic'

/** Preserve the pinned relative asset URLs by using an actual index.html path. */
export async function GET(request:Request):Promise<Response>{
 const access=await resolveProjectAccess()
 if(!access.ok)return access.response
 if(!access.allowedProjectIds.length)return new Response('Forbidden',{status:403})
 return Response.redirect(new URL('/build/demo-motors/index.html',request.url),307)
}
