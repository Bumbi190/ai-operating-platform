// Test-only helper: starts through the same real plan/decision gate as operators.
import type {createAdminClient} from '@/lib/supabase/admin'
import type {BuildPrincipal,BuildSessionView} from '../types'
import type {PlanContent,PlanView,StartApprovedPlanInput} from './types'
import {saveWebsitePlanRevision,approveWebsiteMockup,approveWebsitePlan,startApprovedWebsitePlan,setProjectWebsiteBuilder} from './store'
import {testSql} from '../test-db'
export async function approvedTestInput(db:ReturnType<typeof createAdminClient>,p:BuildPrincipal,input:{projectId:string;agentId:string;conversationId:string;brief:string;idempotencyKey:string;pages?:PlanContent['pages']}):Promise<StartApprovedPlanInput>{
 await setProjectWebsiteBuilder(db,p,{projectId:input.projectId,agentId:input.agentId})
 const content:PlanContent={title:'Testbygge',purpose:input.brief,audience:'Testanvändare',pages:input.pages??[{key:'index',title:'Hem',purpose:'Visa innehåll'}],design:{style:'Tydlig',reference:null},features:[],architecture:'Statiskt sidpaket',steps:['Bygg','Kontrollera'],domain:{registrar:'strato',requestedName:null}}
 const raw=testSql("select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',current_revision_id)),'[]') from website_build_plans where project_id='"+input.projectId+"' and created_by='"+p.userId+"' and conversation_id='"+input.conversationId+"';")
 const current=JSON.parse(raw)[0] as {id:string;revision:string}|undefined
 const plan=await saveWebsitePlanRevision(db,p,{projectId:input.projectId,conversationId:input.conversationId,planId:current?.id,expectedRevisionId:current?.revision??null,content,idempotencyKey:input.idempotencyKey})
 await approveTestMockup(db,p,plan)
 const decision=await approveWebsitePlan(db,p,{...plan.currentRevision,idempotencyKey:'approve-'+input.idempotencyKey})
 return {projectId:plan.ref.projectId,planId:plan.ref.planId,revisionId:plan.currentRevision.revisionId,sha256:plan.currentRevision.sha256,decisionId:decision.id}
}
export async function approvedTestBuild(db:ReturnType<typeof createAdminClient>,p:BuildPrincipal,input:{projectId:string;agentId:string;conversationId:string;brief:string;idempotencyKey:string;pages?:PlanContent['pages']}):Promise<BuildSessionView>{
 return startApprovedWebsitePlan(db,p,await approvedTestInput(db,p,input))
}

export async function approveTestMockup(db:ReturnType<typeof createAdminClient>,p:BuildPrincipal,plan:PlanView):Promise<PlanView>{
 if(!plan.designReview?.required)return plan
 const option=plan.designReview.options[0]
 return approveWebsiteMockup(db,p,{...plan.currentRevision,mockupId:option.id,mockupSha256:option.sha256,idempotencyKey:'mockup-'+plan.currentRevision.revisionId})
}
