// Test-only acceptance: real HTTP approvals, queue admission and zero-provider preset worker.
import {createAdminClient} from '../lib/supabase/admin'
import {executeWebsiteBuildRun} from '../lib/website-build/worker'
import {CINEMATIC_BINDING} from '../lib/website-build/studio/cinematic-binding'
import {isFencedError} from '../lib/ai/fencing'
import {randomUUID} from 'node:crypto'
export async function runWorkerAcceptance({base,jarA,jarB,f,check}:any){
 const db=createAdminClient()
 async function http(path:string,jar:any[],body?:unknown){
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{origin:base,host:new URL(base).host,'content-type':'application/json',cookie:jar.map(c=>c.name+'='+c.value).join('; ')},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'})
  const data=await response.json()
  check('worker_http_private_'+path.split('/').at(-1),response.headers.get('cache-control')==='private, no-store')
  return {status:response.status,data}
 }
 const created=await http('/api/website-build/studio',jarA,{kind:'new',name:'Fictional preset worker',idempotencyKey:'preset-worker-studio'})
 check('worker_studio_created',created.status===201)
 const {projectId,conversationId}=created.data
 const setting=await http('/api/website-build-settings?projectId='+projectId,jarA)
 check('worker_factory_builder_exists',setting.status===200&&Boolean(setting.data.builderAgentId))
 const content={title:'Fictional preset worker',purpose:'Verify reviewed preset build',audience:'Synthetic acceptance users',pages:['index','roadster','viewer','nord-r','visning'].map(key=>({key,title:key,purpose:'Reviewed preset page'})),design:{style:'Preserve reviewed package',reference:CINEMATIC_BINDING.id+':'+CINEMATIC_BINDING.sha256,cinematic:CINEMATIC_BINDING},features:[],architecture:'Version-pinned static preset',steps:['Review','Compile','Validate'],domain:{registrar:'strato',requestedName:null}}
 const saved=await http('/api/website-build-plans',jarA,{projectId,conversationId,expectedRevisionId:null,content,idempotencyKey:'preset-worker-plan'})
 check('worker_cinematic_plan_saved',saved.status===201)
 const plan=saved.data,planPath='/api/website-build-plans/'+plan.ref.planId
 const ref={projectId,revisionId:plan.currentRevision.revisionId,sha256:plan.currentRevision.sha256},option=plan.designReview.options[0]
 const mockup=await http(planPath+'/mockups/approve',jarA,{...ref,mockupId:option.id,mockupSha256:option.sha256,idempotencyKey:'preset-worker-mockup'})
 check('worker_mockup_approved',mockup.status===200&&Boolean(mockup.data.designReview?.approved?.id))
 const approval=await http(planPath+'/approve',jarA,{...ref,mockupDecisionId:mockup.data.designReview.approved.id,idempotencyKey:'preset-worker-approve'})
 check('worker_plan_approved',approval.status===200&&approval.data.approvedBy===f.a.id)
 const start={...ref,decisionId:approval.data.id}
 const missing=await http(planPath+'/start',jarA,start)
 check('worker_missing_budget_is_actionable',missing.status===409&&missing.data.code==='PROJECT_BUDGET_REQUIRED')
 const empty=await db.from('runs').select('id').eq('project_id',projectId)
 check('worker_missing_budget_creates_no_job',!empty.error&&empty.data.length===0)
 const budget=await http('/api/website-build/studio/budget',jarA,{projectId,monthlySek:0,expectedMonthlySek:null,idempotencyKey:'preset-zero-budget'})
 check('worker_zero_budget_recorded',budget.status===200&&budget.data.monthlySek===0)
 const foreign=await http(planPath+'/start',jarB,start)
 check('worker_foreign_start_refused',foreign.status===404)
 const first=await http(planPath+'/start',jarA,start),again=await http(planPath+'/start',jarA,start)
 check('worker_approved_plan_queued',first.status===201&&first.data.status==='queued')
 check('worker_start_idempotent',again.status===201&&again.data.sessionId===first.data.sessionId&&again.data.currentRunId===first.data.currentRunId)
 const queued=await db.from('runs').select('*').eq('project_id',projectId)
 check('worker_one_real_pending_run',!queued.error&&queued.data.length===1&&queued.data[0].kind==='website.static.build.v1'&&queued.data[0].status==='pending')
 const claimed=await db.rpc('claim_runs' as any,{p_limit:1,p_lease_seconds:320} as any)
 check('worker_canonical_claim_rpc',!claimed.error&&Array.isArray(claimed.data)&&claimed.data.length===1)
 const run=(claimed.data as any[])[0]
 check('worker_claim_matches_approved_run',run.id===first.data.currentRunId&&run.project_id===projectId&&run.status==='running'&&Boolean(run.claim_id))
 let paid=0,fenced=false
 const hooks={beforePaidStep:()=>{paid++;throw Error('UNEXPECTED_PAID_STEP')}}
 try{await executeWebsiteBuildRun(db,run,randomUUID(),hooks)}catch(error){fenced=isFencedError(error)}
 check('worker_wrong_claim_refused',fenced)
 await executeWebsiteBuildRun(db,run,run.claim_id,hooks)
 check('worker_preset_makes_no_paid_step',paid===0)
 const session=await http('/api/website-builds/'+first.data.sessionId+'?projectId='+projectId,jarA)
 check('worker_first_preview_ready',session.status===200&&session.data.status==='ready'&&session.data.revisions.length===1&&Boolean(session.data.activePreviewRevisionId))
 const artifact=await http('/api/website-builds/'+first.data.sessionId+'/revisions/'+session.data.activePreviewRevisionId+'?projectId='+projectId,jarA)
 check('worker_preset_has_five_pages',artifact.status===200&&artifact.data.pages?.length===5)
 check('worker_preview_preserves_reviewed_binding',artifact.data.cinematicPreset?.binding.sha256===CINEMATIC_BINDING.sha256)
 const hidden=await http('/api/website-builds/'+first.data.sessionId+'?projectId='+projectId,jarB)
 check('worker_preview_hidden_from_other_user',hidden.status===404)
 return {projectSlug:created.data.projectSlug,conversationId,sessionId:first.data.sessionId}
 // Drain terminalization, provider-backed generation and media/export are separate acceptance.
}
