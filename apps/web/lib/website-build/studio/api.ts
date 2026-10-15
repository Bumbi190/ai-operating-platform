import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {buildErrorResponse,readWebsiteBuildBody} from '../api'
import {WebsiteBuildError} from '../store'
import {ensureStudioWorkspace,requestStudioWorkspace} from './store'
import {loadStudioView} from './loader'
import type {EnsureStudioInput,StudioSelection,WorkspaceRequestInput} from './types'
import {setStudioProjectBudget,type StudioBudgetInput} from './budget'
import {readStudioCosts,stopStudioProject,studioCostProject} from './costs'
const headers={'cache-control':'private, no-store'}
export function studioSelection(params:URLSearchParams):{selection:StudioSelection;include:'active'|'archived'|'trashed'}{
  const allowed=['project','conversation','session','include']
  for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)throw new WebsiteBuildError('INVALID_STUDIO_INPUT')
  const include=params.get('include')??'active'
  if(!['active','archived','trashed'].includes(include))throw new WebsiteBuildError('INVALID_STUDIO_INPUT')
  return {selection:{...(params.has('project')?{projectSlug:params.get('project')!}:{}),...(params.has('conversation')?{conversationId:params.get('conversation')!}:{}),...(params.has('session')?{sessionId:params.get('session')!}:{})},include:include as 'active'|'archived'|'trashed'}
}
export async function studioApi(action:'get'|'ensure'|'workspace-request'|'budget'|'costs'|'stop',request:Request):Promise<Response>{
  const access=await resolveProjectAccess()
  if(!access.ok){access.response.headers.set('cache-control',headers['cache-control']);return access.response}
  try{
    if(action==='costs')return Response.json(await readStudioCosts(createAdminClient(),access,studioCostProject(new URL(request.url).searchParams)),{headers})
    if(action==='get'){
      const {selection,include}=studioSelection(new URL(request.url).searchParams),model=await loadStudioView(selection,include)
      if(!model)return Response.json({error:'Unauthorized'},{status:401,headers})
      return Response.json(model,{headers})
    }
    const denied=assertSameOrigin(request);if(denied){denied.headers.set('cache-control',headers['cache-control']);return denied}
    const body=await readWebsiteBuildBody(request),db=createAdminClient()
    if(action==='stop')return Response.json(await stopStudioProject(db,access,body),{headers})
    if(action==='budget')return Response.json(await setStudioProjectBudget(db,access,body as StudioBudgetInput),{headers})
    return Response.json(action==='ensure'?await ensureStudioWorkspace(db,access,body as EnsureStudioInput):await requestStudioWorkspace(db,access,body as WorkspaceRequestInput),{status:201,headers})
  }catch(error){return buildErrorResponse(error)}
}
