import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'
import { projectCampusSnapshot } from './snapshot.ts'

const routeCode = readFileSync(new URL('../../../app/api/atlas/campus/snapshot/route.ts',import.meta.url),'utf8')
const ctx = createContext({console,Date,Object,Error,String})
let nextModel=null
let shouldThrow=false
let proofAvailable=true
let proofSignals=new Map()
let evidenceCalls=0
const nextResponses={
  json:(payload,options={})=>({payload,status:options.status||200,headers:options.headers||{}})
}
const nextModule=new SyntheticModule(['NextResponse'],function(){
  this.setExport('NextResponse',nextResponses)
},{context:ctx,identifier:'next/server'})
const readerModule=new SyntheticModule(['loadOrganisationModel'],function(){
  this.setExport('loadOrganisationModel',async()=>{
    if(shouldThrow)throw new Error('sensitive_database_detail')
    return nextModel
  })
},{context:ctx,identifier:'@/lib/os/organisation'})
const projectorModule=new SyntheticModule(['projectCampusSnapshot'],function(){
  this.setExport('projectCampusSnapshot',projectCampusSnapshot)
},{context:ctx,identifier:'@/lib/atlas/campus/snapshot'})
const evidenceModule=new SyntheticModule(['readScopedStepEvidence'],function(){
  this.setExport('readScopedStepEvidence',async()=>{
    evidenceCalls++
    return {available:proofAvailable,signals:proofSignals}
  })
},{context:ctx,identifier:'@/lib/atlas/campus/step-evidence-reader'})
const routeModule=new SourceTextModule(stripTypeScriptTypes(routeCode),{context:ctx,identifier:'route.ts'})
await routeModule.link((specifier)=>{
  if(specifier==='next/server')return nextModule
  if(specifier==='@/lib/os/organisation')return readerModule
  if(specifier==='@/lib/atlas/campus/snapshot')return projectorModule
  if(specifier==='@/lib/atlas/campus/step-evidence-reader')return evidenceModule
  throw new Error('unexpected server import '+specifier)
})
await routeModule.evaluate()
const GET=routeModule.namespace.GET

const MINIMAL={
  operatorName:'private',
  projects:[{
    id:'11111111-1111-4111-8111-111111111111',
    name:'The Prompt',slug:'the-prompt',color:'#abcdef',href:'/should-not-escape',
    agents:[{id:'22222222-2222-4222-8222-222222222222',
      name:'Agent X',description:null,model:'sensitive',href:null,working:true}],
    runningRuns:2
  }],
  availability:{projects:true,agents:true,activity:true}
}

test('unauthenticated returns 401 with no content and no-store headers',async()=>{
  nextModel=null;shouldThrow=false
  const callsBefore=evidenceCalls
  const response=await GET()
  assert.equal(evidenceCalls,callsBefore,'Unauthorized requests must not read log evidence')
  assert.equal(response.status,401)
  assert.equal(response.payload.error,'Unauthorized')
  assert.match(response.headers['Cache-Control'],/private, no-store/)
  assert.equal(response.headers.Vary,'Cookie')
})
test('authenticated returns only bounded projector DTO, no service role data',async()=>{
  nextModel=MINIMAL;shouldThrow=false
  const response=await GET()
  assert.equal(response.status,200)
  assert.equal(response.payload.schemaVersion,2)
  assert.equal(response.payload.projects.length,1)
  assert.equal(response.payload.projects[0].runningRuns,2)
  assert.equal(response.payload.projects[0].agents[0].executionEvidence,'unavailable')
  assert.equal(response.payload.availability.stepEvidence,true)
  assert.equal(response.payload.projects[0].agents[0].stepRequest,null)
  const str=JSON.stringify(response.payload)
  assert(!str.includes('/should-not-escape'))
  assert(!str.includes('sensitive'))
  assert(!str.includes('private'))
  assert.equal(response.headers['X-Content-Type-Options'],'nosniff')
  assert.match(response.headers['Cache-Control'],/no-store/)
})
test('project read error fails closed with generic 503, not empty success',async()=>{
  nextModel={...MINIMAL,projects:[],availability:{...MINIMAL.availability,projects:false}}
  shouldThrow=false
  const response=await GET()
  assert.equal(response.status,503)
  assert.equal(response.payload.error,'Campus data unavailable')
})
test('unexpected source failure fails closed without leaking database details',async()=>{
  nextModel=MINIMAL;shouldThrow=true
  const response=await GET()
  shouldThrow=false
  assert.equal(response.status,503)
  assert(!JSON.stringify(response).includes('sensitive_database_detail'))
})

test('matched fresh step evidence is attributed only to the correct agent',async()=>{
  nextModel=MINIMAL;shouldThrow=false;proofAvailable=true
  const project=MINIMAL.projects[0],agent=project.agents[0]
  const key=project.id+':'+agent.id
  proofSignals=new Map([[key,{
    projectId:project.id,agentId:agent.id,
    runId:'55555555-5555-4555-8555-555555555555',
    stepOrder:1,observedAt:'2026-10-28T07:09:30.000Z',
    leaseUntil:'2026-10-28T07:12:00.000Z',
    kind:'step_request_waiting_for_reply',
    label:'Steg skickat – väntar på svar (loggindikation)',
    source:'claimed_run_and_step_log'
  }]])
  const response=await GET()
  assert.equal(response.status,200)
  const observed=response.payload.projects[0].agents[0].stepRequest
  assert(observed)
  assert.equal(observed.stepOrder,1)
  assert.equal(observed.kind,'step_request_waiting_for_reply')
  assert(!('leaseUntil' in observed),'Only minimal evidence is exposed')
  assert(!('source' in observed),'Do not leak internal source details')
  assert.equal(response.payload.projects[0].agents[0].executionEvidence,'unavailable')
  proofSignals=new Map()
})
test('unavailable log metadata read stays unknown without erasing authorized projects',async()=>{
  nextModel=MINIMAL;shouldThrow=false;proofAvailable=false;proofSignals=new Map()
  const response=await GET()
  assert.equal(response.status,200)
  assert.equal(response.payload.projects.length,1)
  assert.equal(response.payload.availability.stepEvidence,false)
  assert.equal(response.payload.projects[0].agents[0].stepRequest,null)
  proofAvailable=true
})
