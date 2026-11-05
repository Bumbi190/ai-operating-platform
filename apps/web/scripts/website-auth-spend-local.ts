// Test-only real spend-boundary acceptance. No provider credentials or successful provider dispatch.
import {executeWebsiteBuildRun} from '../lib/website-build/worker'
import {SpendRefusedError,withGovernedSpend} from '../lib/cost/governed-spend'
import {reserveSpend,releaseSpend,isSpendGateEnforced} from '../lib/cost/budget-gate'
import {projectScope} from '../lib/governance/execution-stop'
export async function probeWorkerSpend({db,run,check,externalAttempts}:any){
 check('spend_enforcement_active',isSpendGateEnforced())
 check('spend_no_provider_credentials',!process.env.ANTHROPIC_API_KEY&&!process.env.OPENAI_API_KEY)
 const before=externalAttempts()
 let refusal:any
 try{await executeWebsiteBuildRun(db,run,run.claim_id)}catch(error){refusal=error}
 check('spend_real_worker_zero_budget_refused',refusal instanceof SpendRefusedError&&refusal.reason==='budget_exceeded')
 check('spend_refusal_bound_to_real_operation',refusal.provider==='anthropic'&&refusal.operation==='website.feedback.interpret')
 check('spend_project_monthly_is_binding',refusal.verdict?.bindingScope==='project_monthly'&&refusal.verdict.allowed===false&&refusal.verdict.advisoryOverride===false)
 const row=await db.from('spend_reservations').select('status,dispatched_at,dispatch_token,estimated_sek').eq('id',refusal.verdict.reservationId).single()
 check('spend_refused_reservation_never_dispatched',!row.error&&row.data.status==='released'&&row.data.dispatched_at===null&&row.data.dispatch_token===null&&Number(row.data.estimated_sek)>0)
 check('spend_real_worker_attempted_no_external_request',externalAttempts()===before)
}
export async function testReservationSafety({db,http,jarA,f,check,externalAttempts}:any){
 let callbacks=0,missing:any
 const missingProject=f.context.projects[0],before=externalAttempts()
 const config=await db.from('project_budgets').select('project_id').eq('project_id',missingProject)
 check('spend_missing_budget_fixture_is_unconfigured',!config.error&&config.data.length===0)
 try{
  await withGovernedSpend({project:{projectId:missingProject},execution:{context:'AUTONOMOUS',scope:projectScope({projectId:missingProject})},provider:'local_test',operation:'missing_budget_probe',estimatedSek:0.1,ceilingBasis:'internal_fixed'},async()=>{callbacks++;return 'unexpected-dispatch'})
 }catch(error){missing=error}
 check('spend_missing_budget_refused',missing instanceof SpendRefusedError&&missing.reason==='no_budget_configured')
 check('spend_missing_budget_callback_not_called',callbacks===0)
 const created=await http('/api/website-build/studio',jarA,{kind:'new',name:'Fictional reservation race',idempotencyKey:'reservation-race-project'})
 check('spend_race_project_created',created.status===201)
 const projectId=created.data.projectId
 const budget=await http('/api/website-build/studio/budget',jarA,{projectId,monthlySek:1,expectedMonthlySek:null,idempotencyKey:'reservation-race-budget'})
 check('spend_race_budget_configured',budget.status===200&&budget.data.monthlySek===1)
 const inputs=[0,1].map(i=>({projectId,estimatedSek:0.75,idempotencyKey:'race-'+projectId+'-'+i,provider:'local_test',operation:'reservation_race'}))
 const results=await Promise.all(inputs.map(input=>reserveSpend(input)))
 check('spend_concurrent_holds_cannot_oversubscribe',results.filter(r=>r.allowed).length===1&&results.filter(r=>r.reason==='budget_exceeded'&&!r.allowed).length===1)
 const winner=results.findIndex(r=>r.allowed),id=results[winner].reservationId
 const open=await db.from('spend_reservations').select('status,estimated_sek,dispatched_at').eq('id',id).single()
 check('spend_allowed_hold_is_undispatched',!open.error&&open.data.status==='open'&&Number(open.data.estimated_sek)===0.75&&open.data.dispatched_at===null)
 await releaseSpend(id)
 const released=await db.from('spend_reservations').select('status,dispatched_at').eq('id',id).single()
 check('spend_unused_hold_released',!released.error&&released.data.status==='released'&&released.data.dispatched_at===null)
 // Even advisory mode cannot turn an already-used key into permission for another dispatch.
 process.env.H1_SPEND_GATE='0'
 try{
  const replay=await reserveSpend(inputs[winner])
  check('spend_released_key_never_reauthorizes',replay.allowed===false&&replay.reason==='replay_released'&&replay.advisoryOverride===false)
 }finally{process.env.H1_SPEND_GATE='1'}
 const restored=await reserveSpend({projectId,estimatedSek:1,idempotencyKey:'restored-'+projectId,provider:'local_test',operation:'headroom_probe'})
 check('spend_released_hold_restores_headroom',restored.allowed&&restored.headroomSek===1)
 await releaseSpend(restored.reservationId)
 const remaining=await db.from('spend_reservations').select('id').eq('status','open')
 check('spend_no_open_holds_left',!remaining.error&&remaining.data.length===0)
 check('spend_all_probes_attempted_no_external_request',externalAttempts()===before)
}
