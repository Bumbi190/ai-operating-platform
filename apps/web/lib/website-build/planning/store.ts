import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { WebsiteBuildError, validateBuildUuid } from '../store'
import type { BuildPrincipal, BuildSessionView } from '../types'
import type { PlanView,PlanRef,SavePlanInput,ApprovePlanInput,StartApprovedPlanInput,BuilderSetting,ProjectRoot,PlanDecision } from './types'
import { validatePlanContent, hashPlanContent, compileStaticBrief } from './validation'
import { bindProjectLocation, validateProjectRoot } from './project-layout'
type Db=ReturnType<typeof createAdminClient>
const hash=/^[a-f0-9]{64}$/
function principal(p:BuildPrincipal){validateBuildUuid(p.userId)}
function allowed(p:BuildPrincipal,projectId:string){principal(p);validateBuildUuid(projectId);if(!p.allowedProjectIds.includes(projectId))throw new WebsiteBuildError('NOT_FOUND',404)}
function key(k:string){if(typeof k!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(k))throw new WebsiteBuildError('INVALID_IDEMPOTENCY_KEY')}
function revision(i:ApprovePlanInput|StartApprovedPlanInput){validateBuildUuid(i.planId);validateBuildUuid(i.revisionId);if(typeof i.sha256!=='string'||!hash.test(i.sha256))throw new WebsiteBuildError('INVALID_PLAN')}
async function call<T>(db:Db,name:string,p:BuildPrincipal,input:unknown,allowNull=false):Promise<T>{
 const invoke=db as unknown as {rpc(n:string,args:Record<string,unknown>):Promise<{data:unknown;error:{code?:string;message?:string}|null}>}
 const {data,error}=await invoke.rpc(name,{p_principal:p,p_input:input})
 if(error){
  const known=['PLAN_REVIEW_REQUIRED','PLAN_STALE','BUILD_AGENT_REQUIRED','PROJECT_LOCATION_LOCKED','PLAN_REVISION_IMMUTABLE','PLAN_DECISION_IMMUTABLE','INVALID_PLAN','INVALID_PROJECT_ROOT','INVALID_IDEMPOTENCY_KEY'].find(c=>error.message?.includes(c))
  const code=known??(error.code==='23505'?'CONFLICT':error.code==='P0002'||error.code==='42501'?'NOT_FOUND':'BUILD_UNAVAILABLE')
  throw new WebsiteBuildError(code,code==='NOT_FOUND'?404:code.startsWith('INVALID_')?400:code==='BUILD_UNAVAILABLE'?503:409)
 }
 if(data==null&&!allowNull)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 return data as T
}
export async function readWebsitePlan(db:Db,p:BuildPrincipal,i:PlanRef):Promise<PlanView>{allowed(p,i.projectId);validateBuildUuid(i.planId);return call(db,'website_build_plan_view',p,i)}
export async function saveWebsitePlanRevision(db:Db,p:BuildPrincipal,i:SavePlanInput):Promise<PlanView>{
 allowed(p,i.projectId);validateBuildUuid(i.conversationId);if(i.planId)validateBuildUuid(i.planId);if(i.expectedRevisionId!==null)validateBuildUuid(i.expectedRevisionId);key(i.idempotencyKey)
 const content=validatePlanContent(i.content)
 return call(db,'website_build_plan_save',p,{...i,content,canonicalContent:JSON.stringify(content),sha256:hashPlanContent(content),brief:compileStaticBrief(content)})
}
export async function approveWebsitePlan(db:Db,p:BuildPrincipal,i:ApprovePlanInput):Promise<PlanDecision>{allowed(p,i.projectId);revision(i);key(i.idempotencyKey);return call(db,'website_build_plan_approve',p,i)}
export async function startApprovedWebsitePlan(db:Db,p:BuildPrincipal,i:StartApprovedPlanInput):Promise<BuildSessionView>{allowed(p,i.projectId);revision(i);validateBuildUuid(i.decisionId);return call(db,'website_build_plan_start',p,i)}
export async function readProjectWebsiteBuilder(db:Db,p:BuildPrincipal,projectId:string):Promise<BuilderSetting>{allowed(p,projectId);return call(db,'website_build_builder_get',p,{projectId})}
export async function readOperatorProjectRoot(db:Db,p:BuildPrincipal):Promise<ProjectRoot|null>{principal(p);return call(db,'website_build_root_get',p,{},true)}
export async function setOperatorProjectRoot(db:Db,p:BuildPrincipal,input:ProjectRoot|null):Promise<ProjectRoot|null>{principal(p);const root=input===null?null:validateProjectRoot(input);return call(db,'website_build_root_set',p,{root},true)}
export async function setProjectWebsiteBuilder(db:Db,p:BuildPrincipal,i:{projectId:string;agentId:string|null;location?:ProjectRoot|null}):Promise<BuilderSetting>{
 allowed(p,i.projectId);if(i.agentId!==null)validateBuildUuid(i.agentId)
 const current=await readProjectWebsiteBuilder(db,p,i.projectId)
 const root=i.location===undefined?null:i.location===null?null:validateProjectRoot(i.location)
 let location=current.location
 const base=root??(!location?await readOperatorProjectRoot(db,p):null)
 if(base){const {data,error}=await db.from('projects').select('id,name').eq('id',i.projectId).maybeSingle();if(error||!data)throw new WebsiteBuildError('NOT_FOUND',404);location=bindProjectLocation(base,data.name,i.projectId,root?null:current.location)}
 return call(db,'website_build_builder_set',p,{projectId:i.projectId,agentId:i.agentId,location})
}
