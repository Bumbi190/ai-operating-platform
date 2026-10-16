import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {buildErrorResponse,readWebsiteBuildBody} from '../api'
import {WebsiteBuildError} from '../store'
import {approveWebsiteMockup,readWebsiteMockupArtifact} from './store'
import type {MockupApprovalInput} from './types'
const headers={'cache-control':'private, no-store'}
export async function websiteMockupApi(action:'get'|'approve',request:Request,params:{planId:string;mockupId?:string}):Promise<Response>{
 const access=await resolveProjectAccess()
 if(!access.ok){access.response.headers.set('cache-control',headers['cache-control']);return access.response}
 if(action==='approve'){const denied=assertSameOrigin(request);if(denied){denied.headers.set('cache-control',headers['cache-control']);return denied}}
 try{
  const body=action==='approve'?await readWebsiteBuildBody(request):Object.fromEntries(new URL(request.url).searchParams)
  const fields=action==='approve'?['projectId','revisionId','sha256','mockupId','mockupSha256','idempotencyKey']:['projectId','revisionId','sha256','mockupSha256']
  if(Object.keys(body).some(key=>!fields.includes(key)))throw new WebsiteBuildError('INVALID_BODY')
  const input={...body,planId:params.planId,...(action==='get'?{mockupId:params.mockupId}:{})} as unknown as MockupApprovalInput
  const db=createAdminClient()
  return Response.json(action==='approve'?await approveWebsiteMockup(db,access,input):await readWebsiteMockupArtifact(db,access,input),{headers})
 }catch(error){const response=buildErrorResponse(error);response.headers.set('cache-control',headers['cache-control']);return response}
}
