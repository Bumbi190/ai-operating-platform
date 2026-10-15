import 'server-only'
import { WebsiteBuildError, validateBuildUuid } from '../store'
import { ATLAS_WEB_BUILDER_PRESET } from './preset'
import {bindProjectLocation,validateProjectRoot} from '../planning/project-layout'
import {readProjectWebsiteBuilder} from '../planning/store'
import type { Db, Principal, EnsureStudioInput, StudioWorkspaceRef, WorkspaceRequestInput, WorkspaceRequestView } from './types'

export async function requestStudioWorkspace(db:Db,p:Principal,value:WorkspaceRequestInput):Promise<WorkspaceRequestView>{
  const input=studioObject(value,['projectId','targetId','mode','root','idempotencyKey'])
  validateBuildUuid(input.projectId);studioPrincipal(p,input.projectId);studioKey(input.idempotencyKey)
  if(!['new','existing_git','existing_folder'].includes(String(input.mode)))throw new WebsiteBuildError('INVALID_STUDIO_INPUT')
  if(input.targetId!==null)validateBuildUuid(input.targetId)
  let root=validateProjectRoot(input.root)
  if(root.targetId!==input.targetId)throw new WebsiteBuildError('INVALID_PROJECT_ROOT')
  if(input.mode==='new'){
    const setting=await readProjectWebsiteBuilder(db,p,input.projectId)
    const {data,error}=await db.from('projects').select('name').eq('id',input.projectId).eq('owner_id',p.userId).maybeSingle()
    if(error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
    if(!data)throw new WebsiteBuildError('NOT_FOUND',404)
    const location=bindProjectLocation(root,data.name,input.projectId,setting.location)
    root={os:location.os,root:location.root,targetId:location.targetId}
    if(root.targetId!==input.targetId)throw new WebsiteBuildError('INVALID_PROJECT_ROOT')
  }
  return studioRpc(db,'website_build_workspace_request',p,{projectId:input.projectId,targetId:input.targetId,mode:input.mode,root,idempotencyKey:input.idempotencyKey})
}
export async function readLatestWorkspaceRequest(db:Db,p:Principal,projectId:string):Promise<WorkspaceRequestView|null>{
  studioPrincipal(p,projectId)
  const query=db as unknown as {from:(table:string)=>any}
  const {data,error}=await query.from('website_build_workspace_requests').select('id,project_id,mode,root,target_id,generation,state,intent_key,created_at').eq('project_id',projectId).eq('owner_id',p.userId).order('generation',{ascending:false}).limit(1).maybeSingle()
  if(error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  return data?{projectId:data.project_id,requestId:data.id,targetId:data.target_id,mode:data.mode,root:data.root,generation:Number(data.generation),state:'pending_runner',idempotencyKey:data.intent_key,requestedAt:data.created_at}:null
}

export function studioObject(value:unknown, keys:readonly string[]):Record<string,unknown> {
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!keys.includes(k))) throw new WebsiteBuildError('INVALID_STUDIO_INPUT')
  return value as Record<string,unknown>
}
export function studioKey(value:unknown):asserts value is string {
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))throw new WebsiteBuildError('INVALID_IDEMPOTENCY_KEY')
}
export function studioPrincipal(p:Principal,projectId?:string):void {
  validateBuildUuid(p?.userId)
  if(!Array.isArray(p.allowedProjectIds))throw new WebsiteBuildError('INVALID_PRINCIPAL')
  if(projectId!==undefined){validateBuildUuid(projectId);if(!p.allowedProjectIds.includes(projectId))throw new WebsiteBuildError('NOT_FOUND',404)}
}
export async function studioRpc<T>(db:Db,name:string,p:Principal,input:unknown,extra:Record<string,unknown>={}):Promise<T> {
  const invoke=db as unknown as {rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{code?:string;message?:string}|null}>}
  const {data,error}=await invoke.rpc(name,{p_principal:p,p_input:input,...extra})
  if(error){
    const code=error.code==='23505'?'CONFLICT':['P0002','42501'].includes(error.code??'')?'NOT_FOUND':error.code==='22023'||error.code==='22P02'?'INVALID_STUDIO_INPUT':error.code==='40001'?'CONFLICT':error.code==='55000'?'PROJECT_INACTIVE':'BUILD_UNAVAILABLE'
    throw new WebsiteBuildError(code,code==='NOT_FOUND'?404:code==='INVALID_STUDIO_INPUT'?400:code==='BUILD_UNAVAILABLE'?503:409,error.message??code)
  }
  if(data==null)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  return data as T
}
export async function ensureStudioWorkspace(db:Db,p:Principal,value:EnsureStudioInput):Promise<StudioWorkspaceRef> {
  studioPrincipal(p)
  const input=studioObject(value,value?.kind==='new'?['kind','name','idempotencyKey']:['kind','projectId','idempotencyKey'])
  studioKey(input.idempotencyKey)
  let validated:EnsureStudioInput
  if(input.kind==='new'){
    if(p.allowedProjectIds.length===0)throw new WebsiteBuildError('NOT_FOUND',404)
    if(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>120||/[\u0000-\u001f]/.test(input.name))throw new WebsiteBuildError('INVALID_STUDIO_INPUT')
    validated={kind:'new',name:input.name.trim(),idempotencyKey:input.idempotencyKey}
  }else if(input.kind==='existing'){
    validateBuildUuid(input.projectId);studioPrincipal(p,input.projectId)
    validated={kind:'existing',projectId:input.projectId,idempotencyKey:input.idempotencyKey}
  }else throw new WebsiteBuildError('INVALID_STUDIO_INPUT')
  return studioRpc(db,'website_build_studio_ensure',p,validated,{p_preset:ATLAS_WEB_BUILDER_PRESET})
}
