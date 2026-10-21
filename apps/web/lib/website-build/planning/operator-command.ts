import 'server-only'
import {createHash} from 'node:crypto'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {BuildPrincipal,BuildSessionView} from '../types'
import {WebsiteBuildError,validateBuildUuid} from '../store'
import type {PlanRevisionRef,PlanView} from './types'
import {resolvePlanOperatorIntent} from './operator-intent'
import {readWebsitePlan,approveWebsitePlan,startApprovedWebsitePlan,findWebsitePlanDecision} from './store'
export function parseWebsitePlanRef(value:unknown):PlanRevisionRef|null{
 if(value===undefined||value===null)return null
 if(!value||typeof value!=='object'||Array.isArray(value))throw new WebsiteBuildError('INVALID_PLAN')
 const v=value as Record<string,unknown>
 if(Object.keys(v).some(k=>!['projectId','planId','revisionId','sha256','mockupDecisionId'].includes(k)))throw new WebsiteBuildError('INVALID_PLAN')
 for(const k of ['projectId','planId','revisionId'])validateBuildUuid(v[k])
 if(typeof v.sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sha256))throw new WebsiteBuildError('INVALID_PLAN')
 if(v.mockupDecisionId!=null)validateBuildUuid(v.mockupDecisionId)
 return {mockupDecisionId:v.mockupDecisionId as string|null|undefined,projectId:v.projectId as string,planId:v.planId as string,revisionId:v.revisionId as string,sha256:v.sha256}
}
export async function executeVisiblePlanApproval({db,principal,conversationId,visiblePlan,userText}:{db:ReturnType<typeof createAdminClient>;principal:BuildPrincipal;conversationId:string;visiblePlan:PlanRevisionRef|null;userText:string}):Promise<{plan:PlanView;session:BuildSessionView}|null>{
 if(resolvePlanOperatorIntent(userText,visiblePlan)!=='approve_visible_plan'||!visiblePlan)return null
 validateBuildUuid(conversationId)
 const plan=await readWebsitePlan(db,principal,visiblePlan)
 if(plan.conversationId!==conversationId)throw new WebsiteBuildError('NOT_FOUND',404)
 const committed=await findWebsitePlanDecision(db,principal,visiblePlan)
 if(committed?.mockup_decision_id&&committed.mockup_decision_id!==visiblePlan.mockupDecisionId)throw new WebsiteBuildError('MOCKUP_STALE',409)
 if(committed?.session_id){const session=await startApprovedWebsitePlan(db,principal,{...visiblePlan,decisionId:committed.id});return {plan,session}}
 if(plan.currentRevision.revisionId!==visiblePlan.revisionId||plan.currentRevision.sha256!==visiblePlan.sha256)throw new WebsiteBuildError('PLAN_STALE',409)
 const idempotencyKey='chat-'+createHash('sha256').update(conversationId+':'+visiblePlan.planId+':'+visiblePlan.revisionId+':'+visiblePlan.sha256+':'+(visiblePlan.mockupDecisionId??'legacy')).digest('hex')
 const decision=await approveWebsitePlan(db,principal,{...visiblePlan,idempotencyKey})
 const session=await startApprovedWebsitePlan(db,principal,{...visiblePlan,decisionId:decision.id})
 return {plan:await readWebsitePlan(db,principal,visiblePlan),session}
}