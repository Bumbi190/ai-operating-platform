import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {buildErrorResponse,readWebsiteBuildBody} from '@/lib/website-build/api'
import {studioObject} from '@/lib/website-build/studio/store'
import {readProjectLifecycle,changeProjectLifecycle} from './store'
import type {ChangeLifecycleInput} from './types'
const headers={'cache-control':'private, no-store'}
export async function lifecycleApi(method:'get'|'change',request:Request,projectId:string):Promise<Response>{
 const access=await resolveProjectAccess()
 if(!access.ok){access.response.headers.set('cache-control',headers['cache-control']);return access.response}
 try{
  if(method==='get')return Response.json(await readProjectLifecycle(createAdminClient(),access,projectId),{headers})
  const denied=assertSameOrigin(request);if(denied){denied.headers.set('cache-control',headers['cache-control']);return denied}
  const body=studioObject(await readWebsiteBuildBody(request),['action','expectedVersion','idempotencyKey'])
  return Response.json(await changeProjectLifecycle(createAdminClient(),access,{...body,projectId} as ChangeLifecycleInput),{headers})
 }catch(error){return buildErrorResponse(error)}
}
