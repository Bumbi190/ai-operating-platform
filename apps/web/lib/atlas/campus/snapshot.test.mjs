import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

import { projectCampusSnapshot } from './snapshot.ts'

const NOW=new Date('2026-10-28T08:00:00Z')
const PROJECT='11111111-1111-4111-8111-111111111111'
const AGENT='22222222-2222-4222-8222-222222222222'
const makeAgent=(id=AGENT,working=true)=>({
  id,name:'Pling – nyhetsagent',description:'do not expose',model:'private-model',
  href:'/should-not-escape',working
})
const makeProject=(extra={})=>({
  id:PROJECT,name:'The Prompt',slug:'the-prompt',color:'#a78bfa',
  href:'/private/project',runningRuns:1,
  agents:[makeAgent()],...extra
})
const model=(availability={projects:true,agents:true,activity:true},projects=[makeProject()])=>({
  operatorName:'sensitive@example.com',
  availability,projects,
})

test('authorized snapshot uses real source, read time and scoped project identity',()=>{
  const result=projectCampusSnapshot(model(),NOW)
  assert(result)
  assert.equal(result.schemaVersion,2)
  assert.equal(result.dataSource,'authorized_organisation_read')
  assert.equal(result.generatedAt,NOW.toISOString())
  assert.equal(result.projectCount,1)
  assert.deepEqual(result.availability,{projects:true,agents:true,activity:true,stepEvidence:false})
  assert.equal(result.projects[0].runningRuns,1)
  assert.equal(result.projects[0].agents[0].membershipEvidence,'unavailable')
  assert.equal(result.projects[0].agents[0].executionEvidence,'unavailable')
  assert.equal(result.projects[0].agents[0].stepRequest,null)
  const json=JSON.stringify(result)
  assert(!json.includes('sensitive@example.com'))
  assert(!json.includes('private-model'))
  assert(!json.includes('/private/project'))
  assert(!json.includes('do not expose'))
})

test('failed project read never becomes misleading empty success',()=>{
  assert.equal(projectCampusSnapshot(model({projects:false,agents:true,activity:true}),NOW),null)
  assert.equal(projectCampusSnapshot(model({projects:true,agents:true,activity:true},[]),NOW)?.projectCount,0)
  assert.throws(()=>projectCampusSnapshot(model(),new Date(NaN)),TypeError)
})

test('read failures do not fabricate no activity, no agents, or available KPI data',()=>{
  for(const unavailable of [
    {projects:true,agents:false,activity:true},
    {projects:true,agents:true,activity:false},
    {projects:true,agents:false,activity:false}
  ]){
    const dto=projectCampusSnapshot(model(unavailable),NOW)
    assert(dto)
    assert.equal(dto.projects[0].agents[0].membershipEvidence,'unavailable')
    assert.equal(dto.projects[0].agents[0].executionEvidence,'unavailable')
    if(!unavailable.activity){
      assert.equal(dto.projects[0].runningRuns,null)
      assert.equal(dto.projects[0].runningRunsLabel,'Ej tillgänglig')
    }
  }
})

test('not listed in running workflow does not mean idle or actively typing',()=>{
  const dto=projectCampusSnapshot(model(undefined,[makeProject({
    agents:[makeAgent(AGENT,false)],runningRuns:0
  })]),NOW)
  const agent=dto.projects[0].agents[0]
  assert.equal(agent.membershipEvidence,'unavailable')
  assert.equal(agent.executionEvidence,'unavailable')
  assert.equal(dto.projects[0].runningRunsLabel,'Inga pågående körningar registrerade')
})

test('sanitizes labels and colors but does not alter approved project ids',()=>{
  const res=projectCampusSnapshot(model(undefined,[makeProject({
    name:'The\nPrompt\u0000',color:'red; background:url(evil)',
    agents:[{...makeAgent(),name:'Research\u0000Worker'}]
  })]),NOW)
  assert.equal(res.projects[0].name,'The Prompt')
  assert.equal(res.projects[0].color,'#6366f1')
  assert.equal(res.projects[0].id,PROJECT)
  assert.equal(res.projects[0].agents[0].name,'Research Worker')
})

test('caps project and agent payloads without misreporting portfolio sizes',()=>{
  const big=Array.from({length:27},(_,i)=>makeProject({
    id:String(100+i),slug:'project-'+i,
    agents:Array.from({length:33},(_,j)=>makeAgent('agent-'+i+'-'+j,false)),
  }))
  const res=projectCampusSnapshot(model(undefined,big),NOW)
  assert.equal(res.projectCount,27)
  assert.equal(res.projects.length,25)
  assert.equal(res.additionalProjectsNotShown,2)
  assert.equal(res.projects[0].agents.length,30)
  assert.equal(res.projects[0].additionalAgentsNotShown,3)
})

test('HTTP handler remains GET-only, authenticated, no-store and uses canonical scoped reader',()=>{
  const route=readFileSync(new URL('../../../app/api/atlas/campus/snapshot/route.ts',import.meta.url),'utf8')
  const organisation=readFileSync(new URL('../../../lib/os/organisation.ts',import.meta.url),'utf8')
  assert.match(route,/export async function GET/)
  assert.doesNotMatch(route,/export async function (POST|PUT|DELETE|PATCH)/)
  assert.match(route,/await loadOrganisationModel\(\)/)
  assert.match(route,/projectCampusSnapshot\(/)
  assert.match(route,/readScopedStepEvidence\(organisation\)/)
  assert.match(route,/status: 401/)
  assert.match(route,/status: 503/)
  assert.match(route,/private, no-store/)
  assert.match(route,/Vary': 'Cookie'/)
  assert.doesNotMatch(route,/createAdminClient|\.insert\(|\.update\(|\.delete\(|service_role/i)
  // Owner scope, exact count and owner-transfer behavior run in private-organisation-loader.test.ts.
  assert.match(organisation,/scopeProjectFilter\(allowedProjectIds\)/)
  assert.match(organisation,/auth\.getUser\(\)/)
})

test('portfolio-wide working boolean is NOT agent execution proof in a project',()=>{
  const wrong=projectCampusSnapshot(model(undefined,[makeProject({
    runningRuns:0,agents:[makeAgent(AGENT,true)]
  })]),NOW)
  assert.equal(wrong.projects[0].agents[0].membershipEvidence,'unavailable')
  assert.equal(wrong.projects[0].agents[0].executionEvidence,'unavailable')
  assert.equal(wrong.projects[0].runningRuns,0)
})
