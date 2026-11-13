import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm'
import {identifyOutstandingAgentSteps} from './step-evidence.ts'

const PROJECT='11111111-1111-4111-8111-111111111111'
const AGENT='22222222-2222-4222-8222-222222222222'
const RUN='55555555-5555-4555-8555-555555555555'
const NOW=new Date('2026-10-28T07:10:00Z')
const at=diff=>new Date(+NOW+diff).toISOString()
const row=()=>({
  id:RUN,project_id:PROJECT,status:'running',
  claim_id:'77777777-7777-4777-8777-777777777777',
  claimed_at:at(-65000),lease_until:at(60000),finished_at:null,
  cancel_requested:false,reconciliation_required:false,
  steps_snapshot:[{order:1,agent_id:AGENT,name:'draft',output_key:'draft'}],
})
const entry=()=>({
  id:'88888888-8888-4888-8888-888888888888',
  run_id:RUN,step_order:1,role:'user',created_at:at(-30000)
})
const organisation=()=>({
  availability:{projects:true,agents:true,activity:true},
  projects:[{id:PROJECT,agents:[{id:AGENT}],name:'The Prompt'}],
})
const activity={runs:[row()],run_logs:[entry()],user:{id:'safe-user'}}
const calls=[]
let mocked={...activity}
function query(table){
  const chain={
    select(...params){calls.push([table,'select',...params]);return chain},
    eq(...params){calls.push([table,'eq',...params]);return chain},
    in(...params){calls.push([table,'in',...params]);return chain},
    order(...params){calls.push([table,'order',...params]);return chain},
    limit(value){
      calls.push([table,'limit',value])
      return Promise.resolve(mocked[table]||{data:[],error:null})
    }
  }
  return chain
}
const fakeDb={
  auth:{getUser:async()=>({data:{user:mocked.user},error:mocked.authError||null})},
  from(name){calls.push([name,'from']);return query(name)}
}
function fixture(table){return {data:table,error:null}}
mocked={runs:fixture([row()]),run_logs:fixture([entry()]),user:{id:'signed-in'}}
const context=createContext({console,Date,Object,Map,Set,String,Number})
const src=readFileSync(new URL('./step-evidence-reader.ts',import.meta.url),'utf8')
const serverModule=new SyntheticModule([],function(){},{context,identifier:'server-only'})
const clientModule=new SyntheticModule(['createClient'],function(){
  this.setExport('createClient',async()=>fakeDb)
},{context,identifier:'@/lib/supabase/server'})
const scopeModule=new SyntheticModule(['scopeProjectFilter'],function(){
  this.setExport('scopeProjectFilter',ids=>ids.length?ids:['00000000-0000-0000-0000-000000000000'])
},{context,identifier:'@/lib/atlas/isolation'})
const proofModule=new SyntheticModule(['identifyOutstandingAgentSteps'],function(){
  this.setExport('identifyOutstandingAgentSteps',identifyOutstandingAgentSteps)
},{context,identifier:'./step-evidence'})
const mod=new SourceTextModule(stripTypeScriptTypes(src),{context,identifier:'step-evidence-reader.ts'})
await mod.link(specifier=>{
  if(specifier==='server-only')return serverModule
  if(specifier==='@/lib/supabase/server')return clientModule
  if(specifier==='@/lib/atlas/isolation')return scopeModule
  if(specifier==='./step-evidence')return proofModule
  throw new Error('Unrecognized read-only reader dependency '+specifier)
})
await mod.evaluate()
const read=mod.namespace.readScopedStepEvidence
function reset(){
  calls.length=0
  mocked={runs:fixture([row()]),run_logs:fixture([entry()]),user:{id:'signed-in'}}
}
test('only authorized project ID is queried; log metadata excludes content and secrets',async()=>{
  reset()
  const res=await read(organisation(),NOW)
  assert.equal(res.available,true)
  assert.equal(res.signals.get(PROJECT+':'+AGENT)?.stepOrder,1)
  assert.deepEqual(Array.from(calls.find(x=>x[0]==='runs'&&x[1]==='in'&&x[2]==='project_id')?.[3]||[]),[PROJECT])
  const selection=calls.find(x=>x[0]==='run_logs'&&x[1]==='select')[2]
  assert(selection.includes('step_order, role, created_at'))
  assert(!selection.includes('content'))
  assert(!selection.includes('tokens'))
  assert(calls.find(x=>x[0]==='run_logs'&&x[1]==='in'&&x[2]==='run_id'))
})
test('no logged-in user never reaches database',async()=>{
  reset();mocked.user=null
  const result=await read(organisation(),NOW)
  assert.equal(result.available,false)
  assert(!calls.some(x=>x[1]==='from'))
})
test('read failure and run/log truncation fail closed',async()=>{
  reset();mocked.run_logs={data:null,error:{message:'private database error'}}
  let result=await read(organisation(),NOW)
  assert.equal(result.available,false)
  assert.equal(result.signals.size,0)
  reset();mocked.runs=fixture(Array.from({length:12},()=>row()))
  result=await read(organisation(),NOW)
  assert.equal(result.available,false)
  reset();mocked.run_logs=fixture(Array.from({length:120},()=>entry()))
  result=await read(organisation(),NOW)
  assert.equal(result.available,false)
})
test('reader never queries when no authorized projects or no project-agent membership',async()=>{
  reset()
  const none=await read({...organisation(),projects:[]},NOW)
  assert.equal(none.available,true)
  assert(!calls.some(x=>x[1]==='from'))
  reset()
  const noAgents=await read({...organisation(),projects:[{id:PROJECT,agents:[]}]},NOW)
  assert.equal(noAgents.available,true)
  assert(!calls.some(x=>x[1]==='from'))
})
test('stale/mismatched records are not returned as false-positive agent activity',async()=>{
  reset()
  mocked.runs=fixture([{...row(),project_id:'other-project'}])
  const res=await read(organisation(),NOW)
  assert.equal(res.available,true)
  assert.equal(res.signals.size,0)
  reset()
  mocked.run_logs=fixture([{...entry(),created_at:at(-180000)}])
  const res2=await read(organisation(),NOW)
  assert.equal(res2.signals.size,0)
})
