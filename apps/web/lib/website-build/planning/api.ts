import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {buildErrorResponse,readWebsiteBuildBody} from '../api'
import {WebsiteBuildError} from '../store'
import {approveWebsitePlan,readWebsitePlan,saveWebsitePlanRevision,startApprovedWebsitePlan,readProjectWebsiteBuilder,setProjectWebsiteBuilder,readOperatorProjectRoot,setOperatorProjectRoot} from './store'
import type {SavePlanInput,ProjectRoot} from './types'
const headers={'cache-control':'private, no-store'}
function fields(body:Record<string,unknown>,allowed:string[]){if(Object.keys(body).some(k=>!allowed.includes(k)))throw new WebsiteBuildError('INVALID_BODY')}
async function access(request:Request,write:boolean){
 const a=await resolveProjectAccess()
 if(!a.ok){a.response.headers.set('cache-control',headers['cache-control']);return a}
 if(write){const denied=assertSameOrigin(request);if(denied){denied.headers.set('cache-control',headers['cache-control']);return {ok:false as const,response:denied}}}
 return a
}
export async function websitePlanApi(action:'save'|'get'|'approve'|'start',request:Request,params:{planId?:string}):Promise<Response>{
 const a=await access(request,action!=='get');if(!a.ok)return a.response
 try{
  const db=createAdminClient(),body=action==='get'?{}:await readWebsiteBuildBody(request)
  const projectId=(body.projectId??new URL(request.url).searchParams.get('projectId')) as string,planId=params.planId as string
  if(action==='get')return Response.json(await readWebsitePlan(db,a,{projectId,planId}),{headers})
  if(action==='save'){fields(body,['projectId','conversationId','planId','expectedRevisionId','content','idempotencyKey']);return Response.json(await saveWebsitePlanRevision(db,a,body as unknown as SavePlanInput),{status:201,headers})}
  fields(body,action==='approve'?['projectId','revisionId','sha256','idempotencyKey']:['projectId','revisionId','sha256','decisionId'])
  const ref={projectId,planId,revisionId:body.revisionId as string,sha256:body.sha256 as string}
  if(action==='approve')return Response.json(await approveWebsitePlan(db,a,{...ref,idempotencyKey:body.idempotencyKey as string}),{headers})
  return Response.json(await startApprovedWebsitePlan(db,a,{...ref,decisionId:body.decisionId as string}),{status:201,headers})
 }catch(error){return buildErrorResponse(error)}
}
export async function websiteBuilderSettingsApi(request:Request):Promise<Response>{
 const write=request.method!=='GET',a=await access(request,write);if(!a.ok)return a.response
 try{
  const db=createAdminClient(),body=write?await readWebsiteBuildBody(request):{},projectId=(body.projectId??new URL(request.url).searchParams.get('projectId')) as string
  if(!write)return Response.json(await readProjectWebsiteBuilder(db,a,projectId),{headers})
  fields(body,['projectId','agentId','location'])
  return Response.json(await setProjectWebsiteBuilder(db,a,{projectId,agentId:body.agentId as string|null,...('location' in body?{location:body.location as ProjectRoot|null}:{})}),{headers})
 }catch(error){return buildErrorResponse(error)}
}
export async function websiteProjectRootApi(request:Request):Promise<Response>{
 const write=request.method!=='GET',a=await access(request,write);if(!a.ok)return a.response
 try{
  const db=createAdminClient()
  if(!write)return Response.json(await readOperatorProjectRoot(db,a),{headers})
  const body=await readWebsiteBuildBody(request);fields(body,['root'])
  if(!('root'in body))throw new WebsiteBuildError('INVALID_BODY')
  return Response.json(await setOperatorProjectRoot(db,a,body.root as ProjectRoot|null),{headers})
 }catch(error){return buildErrorResponse(error)}
}
