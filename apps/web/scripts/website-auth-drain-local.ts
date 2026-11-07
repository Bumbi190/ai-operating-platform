// Real drain route against only the owned disposable SQL/Auth fixture.
import {randomUUID} from 'node:crypto'
import {GET} from '../app/api/runs/drain/route'
export async function testBudgetDrain({db,http,jarA,sessionPath,query,projectId,oldId,expectedArtifact,check,externalAttempts}:any){
 const before=externalAttempts(),secret=randomUUID();process.env.CRON_SECRET=secret
 const added=await http(sessionPath+'/feedback',jarA,{projectId,idempotencyKey:'drain-budget-feedback',text:'Byt kontaktknappen till Kontakta oss.',inputSource:'text',viewedRevisionId:oldId})
 check('drain_feedback_accepted',added.status===200)
 const queued=await http(sessionPath+query,jarA),runId=queued.data.currentRunId
 const denied=await GET(new Request('http://client/api/runs/drain'))
 check('drain_requires_cron_auth',denied.status===401)
 const untouched=await db.from('runs').select('status,attempts').eq('id',runId).single()
 check('drain_unauthorized_does_not_claim',!untouched.error&&untouched.data.status==='pending'&&untouched.data.attempts===0)
 const request=()=>new Request('http://client/api/runs/drain',{headers:{authorization:'Bearer '+secret}})
 const response=await GET(request()),body=await response.json()
 check('drain_real_route_completed',response.status===200&&body.claimed===1)
 check('drain_failure_is_real_budget_refusal',body.results?.some((r:any)=>r.run_id===runId&&typeof r.error==='string'&&r.error.includes('budget_exceeded')))
 check('drain_budget_refusal_is_terminal',body.results?.some((r:any)=>r.run_id===runId&&r.status==='failed'))
 const run=await db.from('runs').select('status,attempts,finished_at,lease_until,claimed_at,last_error').eq('id',runId).single()
 check('drain_failed_run_releases_lease',!run.error&&run.data.status==='failed'&&run.data.attempts===1&&Boolean(run.data.finished_at)&&run.data.lease_until===null&&run.data.claimed_at===null)
 const view=await http(sessionPath+query,jarA),artifact=await http(sessionPath+'/revisions/'+oldId+query,jarA)
 check('drain_session_exposes_failure',view.data.status==='failed')
 check('drain_budget_stop_preserves_preview',view.data.activePreviewRevisionId===oldId&&view.data.revisions.length===2&&JSON.stringify(artifact.data)===JSON.stringify(expectedArtifact))
 const again=await GET(request()),second=await again.json()
 check('drain_terminal_budget_refusal_not_reclaimed',again.status===200&&second.claimed===0)
 const final=await db.from('runs').select('attempts').eq('id',runId).single()
 check('drain_budget_refusal_has_one_attempt',!final.error&&final.data.attempts===1)
 check('drain_attempted_no_external_request',externalAttempts()===before)
}
