import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {loadChatConversation} from '@/lib/os/chat'
import {WebsiteBuildError,validateBuildUuid} from '../store'
import {readConversationWorkspace} from '../planning/conversation-workspace'
import {readProjectWebsiteBuilder} from '../planning/store'
import {readLatestWorkspaceRequest,studioObject} from './store'
import type {Db,Principal,StudioProject,StudioSelection,StudioView} from './types'

type QueryResult={data:any;error:unknown}
function checked(result:QueryResult):any{if(result.error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503);return result.data}
async function projectModel(db:Db,p:Principal,row:{id:string;slug:string;name:string;execution_paused:boolean}):Promise<StudioProject>{
  const query=db as unknown as {from:(table:string)=>any}
  const [life,builder,workspaceRequest,budget,running]=await Promise.all([
    query.from('project_lifecycle').select('state,version').eq('project_id',row.id).eq('owner_id',p.userId).maybeSingle(),
    readProjectWebsiteBuilder(db,p,row.id),readLatestWorkspaceRequest(db,p,row.id),
    query.from('project_budgets').select('monthly_sek').eq('project_id',row.id).maybeSingle(),
    query.from('runs').select('id,status,lease_until').eq('project_id',row.id).eq('status','running'),
  ])
  const l=checked(life),writers=checked(running)
  return {id:row.id,slug:row.slug,name:row.name,builderAgentId:builder.builderAgentId,workspaceRequest,
    lifecycle:{projectId:row.id,state:l?.state??'active',version:Number(l?.version??0),executionPaused:row.execution_paused,stopping:Array.isArray(writers)&&writers.length>0&&l?.state!=='active'&&!!l},
    budget:budget.error?{state:'unknown',monthlySek:null}:budget.data?.monthly_sek!=null?{state:'configured',monthlySek:Number(budget.data.monthly_sek)}:{state:'missing',monthlySek:null}}
}
export async function loadStudioView(selection:StudioSelection,include:'active'|'archived'|'trashed'='active'):Promise<StudioView|null>{
  const access=await resolveProjectAccess();if(!access.ok)return null
  studioObject(selection,['projectSlug','conversationId','sessionId'])
  if(!['active','archived','trashed'].includes(include))throw new WebsiteBuildError('INVALID_STUDIO_INPUT')
  if(selection.projectSlug!==undefined&&(typeof selection.projectSlug!=='string'||!selection.projectSlug||selection.projectSlug.length>120))throw new WebsiteBuildError('INVALID_STUDIO_INPUT')
  if(selection.conversationId!==undefined)validateBuildUuid(selection.conversationId)
  if(selection.sessionId!==undefined)validateBuildUuid(selection.sessionId)
  const db=createAdminClient(),query=db as unknown as {from:(table:string)=>any}
  const rows=checked(await db.from('projects').select('id,name,slug,execution_paused').eq('owner_id',access.userId))??[]
  const owned=rows.filter((p:{id:string})=>access.allowedProjectIds.includes(p.id))
  const all=await Promise.all(owned.map((p:any)=>projectModel(db,access,p)))
  all.sort((a,b)=>a.name.localeCompare(b.name,'sv'))
  let selected=selection.projectSlug?all.find(p=>p.slug===selection.projectSlug)??null:null
  if(selection.projectSlug&&!selected)throw new WebsiteBuildError('NOT_FOUND',404)
  let conversationId=selection.conversationId
  if(selection.sessionId){
    const s=checked(await db.from('website_build_sessions').select('project_id,conversation_id').eq('id',selection.sessionId).eq('created_by',access.userId).maybeSingle())
    if(!s||!all.some(p=>p.id===s.project_id)||selected&&selected.id!==s.project_id||conversationId&&conversationId!==s.conversation_id)throw new WebsiteBuildError('NOT_FOUND',404)
    selected??=all.find(p=>p.id===s.project_id)??null;conversationId=s.conversation_id
  }
  if(!conversationId&&selected){
    const intent=checked(await query.from('website_build_studio_intents').select('conversation_id').eq('owner_id',access.userId).eq('project_id',selected.id).order('created_at',{ascending:false}).limit(1).maybeSingle())
    const plan=intent?null:checked(await query.from('website_build_plans').select('conversation_id').eq('created_by',access.userId).eq('project_id',selected.id).order('updated_at',{ascending:false}).limit(1).maybeSingle())
    conversationId=intent?.conversation_id??plan?.conversation_id
  }
  let conversation:StudioView['conversation']=null,plan:StudioView['plan']=null,session:StudioView['session']=null,state:StudioView['state']='ok'
  if(conversationId){
    const binding=checked(await db.from('conversations').select('id,project_id').eq('id',conversationId).eq('user_id',access.userId).maybeSingle())
    if(!binding||!all.some(p=>p.id===binding.project_id)||selected&&selected.id!==binding.project_id)throw new WebsiteBuildError('NOT_FOUND',404)
    selected??=all.find(p=>p.id===binding.project_id)??null
    if(!selected)throw new WebsiteBuildError('NOT_FOUND',404)
    const loaded=await loadChatConversation(conversationId)
    if(!loaded||loaded==='not_found'||loaded.projectId!==selected?.id)throw new WebsiteBuildError('NOT_FOUND',404)
    const workspace=await readConversationWorkspace(db,access,conversationId,selection.sessionId)
    if(workspace.plan&&workspace.plan.ref.projectId!==selected.id||workspace.session&&workspace.session.projectId!==selected.id)throw new WebsiteBuildError('NOT_FOUND',404)
    conversation={...loaded,website:workspace};plan=workspace.plan;session=workspace.session
    if(loaded.state!=='ok'||workspace.state!=='ok')state='error'
  }
  return {operatorId:access.userId,canCreateProject:owned.length>0,projects:all.filter(p=>p.lifecycle.state===include),selected,conversation,plan,session,state}
}
