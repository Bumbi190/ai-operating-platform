import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveVerifiedAgentBinding, AGENT_BINDING_SOURCE } from './verified-agent-binding.fixture.mjs'
import { PLING_APPROVED_VOICE } from './voice-identity.ts'

const PA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const A1='11111111-1111-4111-8111-111111111111'
const A2='22222222-2222-4222-8222-222222222222'
const B1='33333333-3333-4333-8333-333333333333'
const agent=(id,name,project)=>({
  id,name,description:'Specialist i marknadsföring\nINTERNAL_PROMPT_MUST_NOT_LEAK',
  model:'private-model',href:`/projects/${project}/agents/${id}`,working:true
})
const model={
  operatorName:'secret operator',
  projects:[
    {id:PA,slug:'ai-media-automation',name:'The Prompt',color:'#aaccee',
      href:'/projects/ai-media-automation',
      agents:[agent(A1,'Research', 'ai-media-automation'),
        agent(A2,'Writer', 'ai-media-automation')],runningRuns:2},
    {id:PB,slug:'familje-stunden',name:'Familje-Stunden',color:'#aabbcc',
      href:'/projects/familje-stunden',agents:[agent(B1,'Creative','familje-stunden')],
      runningRuns:1}
  ],
  availability:{projects:true,agents:true,activity:true}
}
const FIXED=new Date('2026-10-29T14:00:00.000Z')

test('exact project+agent pairing yields one PRIVATE authenticated card with shared Pling voice label',()=>{
  const result=resolveVerifiedAgentBinding(model,PA,A2,FIXED)
  assert(result)
  assert.equal(result.source,AGENT_BINDING_SOURCE)
  assert.equal(result.schemaVersion,1)
  assert.equal(result.verifiedIdentity,true)
  assert.equal(result.verifiedAt,FIXED.toISOString())
  assert.deepEqual({...result.project},{id:PA,slug:'ai-media-automation',name:'The Prompt'})
  assert.equal(result.agent.id,A2)
  assert.equal(result.agent.name,'Writer')
  assert.equal(result.agent.description,'Specialist i marknadsföring')
  assert.equal(result.agent.detailsHref,'/projects/ai-media-automation/agents/'+A2)
  assert.equal(result.voice.label,PLING_APPROVED_VOICE.label)
  assert.equal(result.voice.profileApproved,true)
  assert.equal(result.voice.liveSynthesisReady,false)
  assert.equal(result.public3dBinding,'none')
  assert.equal(result.chatStatus,'not_connected')
  assert.equal(result.callStatus,'not_connected')
  assert.equal(result.executionStatus,'not_verified')
  assert.equal(result.approvalStatus,'not_checked')
  assert(Object.isFrozen(result))
  assert(Object.isFrozen(result.project))
})
test('multiple project Plings require explicit selected ID, never bind the first available agent',()=>{
  assert.equal(resolveVerifiedAgentBinding(model,PA,A1)?.agent.name,'Research')
  assert.equal(resolveVerifiedAgentBinding(model,PA,A2)?.agent.name,'Writer')
  assert.equal(resolveVerifiedAgentBinding(model,PA,B1),null)
  assert.equal(resolveVerifiedAgentBinding(model,PB,A1),null)
  assert.equal(resolveVerifiedAgentBinding(model,PB,B1)?.project.slug,'familje-stunden')
})
test('foreign or missing agent is indistinguishable from absent and invalid IDs fail closed',()=>{
  for(const id of ['bad','__proto__','../',null,'00000000-0000-0000-0000-000000000000']){
    assert.equal(resolveVerifiedAgentBinding(model,PA,id),null)
    assert.equal(resolveVerifiedAgentBinding(model,id,A1),null)
  }
  assert.equal(resolveVerifiedAgentBinding(model,PA,A1,new Date('invalid')),null)
  assert.equal(resolveVerifiedAgentBinding(null,PA,A1),null)
})
test('unavailable projects/agent reads do not produce a ghost or empty project identity',()=>{
  assert.equal(resolveVerifiedAgentBinding({...model,availability:{...model.availability,agents:false}},PA,A1),null)
  assert.equal(resolveVerifiedAgentBinding({...model,availability:{...model.availability,projects:false}},PA,A1),null)
  assert.equal(resolveVerifiedAgentBinding({...model,projects:[]},PA,A1),null)
  const ambiguous=structuredClone(model)
  ambiguous.projects[0].agents.push({...ambiguous.projects[0].agents[0]})
  assert.equal(resolveVerifiedAgentBinding(ambiguous,PA,A1),null)
})
test('no confidential system prompt, model, operator, working boolean, other agent or per-agent voice secret escapes payload',()=>{
  const result=resolveVerifiedAgentBinding(model,PA,A1)
  const json=JSON.stringify(result)
  for(const forbidden of [
    'secret operator','private-model','INTERNAL_PROMPT_MUST_NOT_LEAK',
    A2,B1,PLING_APPROVED_VOICE.voiceId,'system_prompt','working',
    'ai-message-key','approved_run','running'
  ])assert(!json.includes(forbidden),forbidden)
})
test('a noncanonical agent href never becomes user-clickable and no guessed fallback is built',()=>{
  const bad=structuredClone(model)
  bad.projects[0].agents[0].href='https://evil.example/agent'
  assert.equal(resolveVerifiedAgentBinding(bad,PA,A1)?.agent.detailsHref,null)
  bad.projects[0].slug='not-safe/?'
  assert.equal(resolveVerifiedAgentBinding(bad,PA,A1),null)
})
