import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {buildErrorResponse,readWebsiteBuildBody} from '@/lib/website-build/api'
import {WebsiteBuildError} from '@/lib/website-build/store'
import {CINEMATIC_BINDING,importCinematicPlan,type CinematicImportInput} from '@/lib/website-build/studio/cinematic-import'
export const dynamic='force-dynamic'
const headers={'cache-control':'private, no-store'}
export async function GET(){
 const a=await resolveProjectAccess()
 if(!a.ok)return a.response
 return Response.json({binding:CINEMATIC_BINDING},{headers})
}
export async function POST(request:Request){
 const a=await resolveProjectAccess()
 if(!a.ok)return a.response
 const denied=assertSameOrigin(request)
 if(denied)return denied
 try{
  const body=await readWebsiteBuildBody(request)
  if(Object.keys(body).some(k=>!['projectId','conversationId','planId','expectedRevisionId','expectedPackageSha','idempotencyKey'].includes(k)))throw new WebsiteBuildError('INVALID_BODY')
  return Response.json(await importCinematicPlan(createAdminClient(),a,body as unknown as CinematicImportInput),{status:201,headers})
 }catch(error){return buildErrorResponse(error)}
}
