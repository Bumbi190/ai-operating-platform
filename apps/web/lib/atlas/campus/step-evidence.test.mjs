import test from 'node:test'
import assert from 'node:assert/strict'
import {identifyOutstandingAgentSteps} from './step-evidence.ts'

const now=Date.parse('2026-10-28T07:10:00Z')
const project='11111111-1111-4111-8111-111111111111'
const other='44444444-4444-4444-8444-444444444444'
const agent='22222222-2222-4222-8222-222222222222'
const otherAgent='33333333-3333-4333-8333-333333333333'
const runId='55555555-5555-4555-8555-555555555555'
const anotherRun='66666666-6666-4666-8666-666666666666'
const when=(ms)=>new Date(now+ms).toISOString()
const allowed=new Map([[project,new Set([agent])]])
const run=(mods={})=>({
  id:runId,project_id:project,status:'running',
  claim_id:'77777777-7777-4777-8777-777777777777',
  claimed_at:when(-65000),lease_until:when(40000),
  finished_at:null,cancel_requested:false,reconciliation_required:false,
  steps_snapshot:[{order:1,name:'step 1',agent_id:agent,output_key:'draft'}],
  ...mods
})
const log=(mods={})=>({
  id:'88888888-8888-4888-8888-888888888888',
  run_id:runId,step_order:1,role:'user',created_at:when(-30000),...mods
})
function find(runs=[run()],logs=[log()],scope=allowed,complete=true){
  return identifyOutstandingAgentSteps({runs,logs,allowedAgents:scope,now,complete})
}
function current(map){return map.get(project+':'+agent)}

test('fresh unmatched step request with active run claim produces *limited* log evidence',()=>{
  const result=current(find())
  assert(result)
  assert.equal(result.projectId,project)
  assert.equal(result.agentId,agent)
  assert.equal(result.runId,runId)
  assert.equal(result.stepOrder,1)
  assert.equal(result.kind,'step_request_waiting_for_reply')
  assert.match(result.label,/loggindikation/)
  assert.doesNotMatch(result.label,/arbetar just nu|slutfört|godkänd/i)
  assert.equal(result.source,'claimed_run_and_step_log')
})
test('assistant response closes pending indication even if run is still running',()=>{
  const response=log({id:'99999999-9999-4999-8999-999999999999',
    role:'assistant',created_at:when(-5000)})
  assert.equal(current(find([run()],[log(),response])),undefined)
})
test('expired lease, cancelled flag, terminal state and reconciliation suppress evidence',()=>{
  const fail=[
    {lease_until:when(-1)},
    {lease_until:when(1000)},
    {claim_id:null},{claimed_at:null},{claimed_at:when(20000)},
    {status:'done'},{status:'failed'},{status:'pending'},
    {status:'awaiting_approval'},{status:'cancelled'},
    {finished_at:when(-10000)},{cancel_requested:true},
    {reconciliation_required:true}
  ]
  for(const modifiers of fail){
    assert.equal(current(find([run(modifiers)])),undefined,JSON.stringify(modifiers))
  }
})
test('old log, future log, or log from a prior lease cannot imply current agent work',()=>{
  for(const modifiers of [
    {created_at:when(-91000)},
    {created_at:when(4000)},
    {created_at:when(-80000)},
  ]){
    assert.equal(current(find([run()],[log(modifiers)])),undefined,
      'Rejected invalid timestamp: '+modifiers.created_at)
  }
})
test('project-scope and agent membership must agree with immutable snapshot',()=>{
  assert.equal(current(find([run({project_id:other})])),undefined)
  assert.equal(current(find([run({steps_snapshot:[{order:1,agent_id:otherAgent}]})])),undefined)
  assert.equal(current(find([run({steps_snapshot:null})])),undefined)
  assert.equal(current(find([run({steps_snapshot:[]})])),undefined)
  assert.equal(current(find([run({steps_snapshot:[{order:1,agent_id:agent},{order:1,agent_id:agent}]})])),undefined)
  assert.equal(current(find([run()],undefined,new Map([[other,new Set([agent])]]))),undefined)
})
test('ambiguous simultaneous logs, unknown roles and stale timestamps fail closed',()=>{
  const tied=log({id:'99999999-9999-4999-8999-999999999999'})
  assert.equal(current(find([run()],[log(),tied])),undefined)
  assert.equal(current(find([run()],[log({role:'system'})])),undefined)
  assert.equal(current(find([run()],[log({step_order:null})])),undefined)
  assert.equal(current(find([run()],[log({step_order:99})])),undefined)
})
test('two fresh parallel requests for same agent yield UNKNOWN, not chosen at random',()=>{
  const b=run({id:anotherRun,claim_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})
  const bLog=log({id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    run_id:anotherRun,created_at:when(-10000)})
  assert.equal(current(find([run(),b],[log(),bLog])),undefined)
})
test('partial or failed bounded read cannot produce evidence',()=>{
  assert.equal(find([run()],[log()],allowed,false).size,0)
  assert.equal(find([run()],[log()],new Map()).size,0)
  assert.equal(identifyOutstandingAgentSteps({
    allowedAgents:allowed,runs:[run()],logs:[log()],now:NaN,
  }).size,0)
})
test('run logs are metadata only and source contains no content access',()=>{
  const result=current(find())
  const text=JSON.stringify(result)
  assert(!text.includes('system_prompt'))
  assert(!text.includes('content'))
  assert(!text.includes('customer'))
})
