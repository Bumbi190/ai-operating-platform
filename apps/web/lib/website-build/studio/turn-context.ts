import 'server-only'
import {WebsiteBuildError,validateBuildUuid} from '../store'
import {studioObject,studioPrincipal} from './store'
import type {Db,Principal} from './types'
export type StudioTurnContext={projectId:string;conversationId:string}
export async function resolveStudioTurnContext(db:Db,p:Principal,conversationId:string|null,value:unknown):Promise<StudioTurnContext>{
 const context=studioObject(value,['projectId','conversationId'])
 validateBuildUuid(context.projectId);validateBuildUuid(context.conversationId);studioPrincipal(p,context.projectId)
 if(conversationId!==context.conversationId)throw new WebsiteBuildError('NOT_FOUND',404)
 const query=db as unknown as {from:(table:string)=>any}
 const [conv,project,life,budget]=await Promise.all([
  db.from('conversations').select('id').eq('id',conversationId).eq('user_id',p.userId).eq('project_id',context.projectId).maybeSingle(),
  db.from('projects').select('id,execution_paused').eq('id',context.projectId).eq('owner_id',p.userId).maybeSingle(),
  query.from('project_lifecycle').select('state').eq('project_id',context.projectId).eq('owner_id',p.userId).maybeSingle(),
  query.from('project_budgets').select('monthly_sek').eq('project_id',context.projectId).maybeSingle(),
 ])
 if([conv,project,life,budget].some(r=>r.error))throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
 if(!conv.data||!project.data)throw new WebsiteBuildError('NOT_FOUND',404)
 if(life.data&&life.data.state!=='active'||project.data.execution_paused)throw new WebsiteBuildError('PROJECT_INACTIVE',409)
 if(budget.data?.monthly_sek==null)throw new WebsiteBuildError('PROJECT_BUDGET_REQUIRED',409)
 return {projectId:context.projectId,conversationId:context.conversationId}
}
