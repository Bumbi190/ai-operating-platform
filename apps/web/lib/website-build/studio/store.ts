import 'server-only'
import { WebsiteBuildError, validateBuildUuid } from '../store'
import { ATLAS_WEB_BUILDER_PRESET } from './preset'
import type { Db, Principal, EnsureStudioInput, StudioWorkspaceRef } from './types'

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
    if(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>120||/[\u0000-\u001f]/.test(input.name))throw new WebsiteBuildError('INVALID_STUDIO_INPUT')
    validated={kind:'new',name:input.name.trim(),idempotencyKey:input.idempotencyKey}
  }else if(input.kind==='existing'){
    validateBuildUuid(input.projectId);studioPrincipal(p,input.projectId)
    validated={kind:'existing',projectId:input.projectId,idempotencyKey:input.idempotencyKey}
  }else throw new WebsiteBuildError('INVALID_STUDIO_INPUT')
  return studioRpc(db,'website_build_studio_ensure',p,validated,{p_preset:ATLAS_WEB_BUILDER_PRESET})
}
