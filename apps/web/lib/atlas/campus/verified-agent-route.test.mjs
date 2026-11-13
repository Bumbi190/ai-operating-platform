import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createContext,SourceTextModule,SyntheticModule} from 'node:vm'
import {stripTypeScriptTypes} from 'node:module'
import {resolveVerifiedAgentBinding} from './verified-agent-binding.fixture.mjs'

const route=readFileSync(new URL('../../../app/api/atlas/campus/agents/[id]/route.ts',import.meta.url),'utf8')
const ctx=createContext({console,Date,Object,Error,String,URL,RegExp})
let currentModel=null
let throwSecret=false
let modelCalls=0
const responses={json:(payload,options={})=>({
  payload,status:options.status??200,headers:options.headers??{}
})}
const make=(names,values,specifier)=>new SyntheticModule(names,function(){
  for(const name of names)this.setExport(name,values[name])
},{context:ctx,identifier:specifier})
const mocks={
  'next/server':make(['NextResponse'],{NextResponse:responses},'next/server'),
  '@/lib/os/organisation':make(['loadOrganisationModel'],{
    loadOrganisationModel:async()=>{
      modelCalls++
      if(throwSecret)throw new Error('DATABASE_SECRET_WILL_NOT_LEAK')
      return currentModel
    }
  },'organisation'),
  '@/lib/atlas/campus/verified-agent-binding':make(['resolveVerifiedAgentBinding'],{
    resolveVerifiedAgentBinding
  },'binding')
}
const vm=new SourceTextModule(stripTypeScriptTypes(route),{context:ctx,identifier:'route.ts'})
await vm.link(id=>{
  const result=mocks[id]
  if(!result)throw new Error('Unexpected import '+id)
  return result
})
await vm.evaluate()
const GET=vm.namespace.GET
const PROJECT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AGENT='11111111-1111-4111-8111-111111111111'
const OTHER='22222222-2222-4222-8222-222222222222'
const data={
  operatorName:'PRIVATE_OPERATOR',
  projects:[{
    id:PROJECT,slug:'ai-media-automation',name:'The Prompt',color:'#cccccc',
    agents:[{
      id:AGENT,name:'Real Pling',model:'SECRET_MODEL',
      description:'Research specialist\nsecret remainder',
      href:'/projects/ai-media-automation/agents/'+AGENT,
      working:true
    }],runningRuns:1
  }],
  availability:{projects:true,agents:true,activity:true}
}
const req=(part='?projectId='+PROJECT)=>({url:'https://omniraos.se/api/atlas/campus/agents/'+AGENT+part})
const options={params:{id:AGENT}}

test('no operator session => generic 401, no private data and no-cache',async()=>{
  currentModel=null
  throwSecret=false
  const res=await GET(req(),options)
  assert.equal(res.status,401)
  assert.equal(res.payload.error,'Unauthorized')
  assert.equal(res.headers['Vary'],'Cookie')
  assert.match(res.headers['Cache-Control'],/private, no-store/)
  assert.equal(res.headers['X-Content-Type-Options'],'nosniff')
})
test('matching project and agent produce only minimal verified identity; never an execution or chat session',async()=>{
  currentModel=data
  const res=await GET(req(),options)
  assert.equal(res.status,200)
  assert.equal(res.payload.agent.id,AGENT)
  assert.equal(res.payload.project.id,PROJECT)
  assert.equal(res.payload.agent.name,'Real Pling')
  assert.equal(res.payload.verifiedIdentity,true)
  assert.equal(res.payload.public3dBinding,'none')
  assert.equal(res.payload.executionStatus,'not_verified')
  assert.equal(res.payload.approvalStatus,'not_checked')
  assert.equal(res.payload.chatStatus,'not_connected')
  assert.equal(res.payload.callStatus,'not_connected')
  const json=JSON.stringify(res)
  assert(!json.includes('SECRET_MODEL'))
  assert(!json.includes('PRIVATE_OPERATOR'))
  assert(!json.includes('secret remainder'))
  assert(!json.includes('system_prompt'))
  assert(!json.includes(OTHER))
})
test('project agent mismatch returns 404 without revealing other identities',async()=>{
  currentModel=data
  for(const params of [{id:OTHER},{id:'33333333-3333-4333-8333-333333333333'}]){
    const res=await GET(req(),{params})
    assert.equal(res.status,404)
    assert.equal(res.payload.error,'Not found')
    assert(!JSON.stringify(res).includes('Real Pling'))
  }
})
test('only a single exact UUID projectId query is accepted',async()=>{
  currentModel=data
  for(const bad of [
    '?projectId=evil',
    '?projectId='+PROJECT+'&projectId='+PROJECT,
    '?projectId='+PROJECT+'&agent=private',
    '?agentId='+AGENT,
    '',
  ]){
    const res=await GET(req(bad),options)
    assert.equal(res.status,400,bad)
  }
  assert.equal((await GET(req(),{params:{id:'INVALID'}})).status,400)
})
test('unavailable reads return 503 rather than pretending agent does not exist',async()=>{
  for(const avail of [
    {...data.availability,projects:false},
    {...data.availability,agents:false}
  ]){
    currentModel={...data,availability:avail}
    const res=await GET(req(),options)
    assert.equal(res.status,503)
  }
  currentModel=data
  throwSecret=true
  const err=await GET(req(),options)
  throwSecret=false
  assert.equal(err.status,503)
  assert(!JSON.stringify(err).includes('DATABASE_SECRET_WILL_NOT_LEAK'))
})
test('route is strictly GET-only and delegates all auth/scoping to the existing organisation loader',()=>{
  assert.match(route,/export async function GET\(/)
  assert.match(route,/await loadOrganisationModel\(\)/)
  assert.doesNotMatch(route,/export async function (POST|PUT|PATCH|DELETE)/)
  assert.doesNotMatch(route,/createAdminClient|\.from\(|\.insert\(|\.update\(|\.delete\(/)
  assert.match(route,/resolveVerifiedAgentBinding\(model, ids\[0\]!, params\.id\)/)
  assert(modelCalls>0)
})
