import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const {assessReviewerAdmission}=await import('./reviewer-admission.ts')

const projectId='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const scriptId='b9271d5b-5254-4ad8-a36c-ce7c66e9c63e'
const runId='94e620bf-31d4-401c-baf8-ec1521f5ba13'
const claimId='824ecfe1-cbda-4a7a-9de5-7683d454bc08'
const good={
  flag:'true',
  spendGateEnforced:true,
  execution:{context:'AUTONOMOUS',scope:{kind:'PROJECT',
    project:{projectSlug:'ai-media-automation'}}},
  authority:{kind:'RUN_BOUND',runId,claimId,context:'AUTONOMOUS'},
  trustedProjectId:projectId,
  material:{projectId,scriptId,revisionId:'rev-1',hook:'A new API exists.',
    script:'The research API is available to developers.',
    captions:['A research update'],socialCaption:'Technology news',riskTier:'standard'},
}
const check=x=>assessReviewerAdmission({...good,...x})
test('off by default: no feature flag never authorizes cost',()=>{
  for(const flag of [undefined,'','false','1','TRUE']){
    const result=check({flag})
    assert.equal(result.allowed,false)
    assert.equal(result.reason,'factcheck_not_enabled')
  }
})
test('advisory spend gate is denied even with explicit enabled flag',()=>{
  assert.deepEqual(check({spendGateEnforced:false}),
    {allowed:false,reason:'hard_spend_gate_required'})
})
test('only autonomous and operator execution scopes are supported',()=>{
  for(const context of ['OPERATOR_INTERACTIVE','made_up',null]){
    const r=check({execution:{...good.execution,context}})
    assert.equal(r.allowed,false)
    assert.equal(r.reason,'invalid_execution_context')
  }
})
test('global, foreign project and project-id-only scopes are refused',()=>{
  for(const scope of [
    {kind:'GLOBAL_ONLY'},
    {kind:'PROJECT',project:{projectSlug:'another-project'}},
    {kind:'PROJECT',project:{projectId}},
    {kind:'PROJECT',project:null},
  ]){
    const r=check({execution:{...good.execution,scope}})
    assert.equal(r.allowed,false)
    assert.equal(r.reason,'wrong_execution_project')
  }
})
test('an owned, UUID-bound run and claim are mandatory',()=>{
  for(const authority of [
    null,
    {kind:'CONTRACT_ONLY'},
    {...good.authority,runId:'synthetic'},
    {...good.authority,claimId:'xxx'},
    {...good.authority,context:'OPERATOR_EXECUTION'},
  ]){
    const r=check({authority})
    assert.equal(r.allowed,false)
    assert.equal(r.reason,'owned_run_required')
  }
})
test('the project ID and script must be owned and UUID-verified',()=>{
  for(const mutation of [
    {trustedProjectId:'not-a-uuid'},
    {trustedProjectId:'2716a16a-c84f-4c90-bd29-98fa7b89f0dc'},
    {material:{...good.material,projectId:'different'}},
    {material:{...good.material,scriptId:'fake-id'}},
  ]){
    const r=check(mutation)
    assert.equal(r.allowed,false)
    assert.equal(r.reason,'unverified_story_project')
  }
})
test('same owner+spend+scope+claim is a valid PRECONDITION, not publication permission',()=>{
  assert.deepEqual(check({}),{allowed:true,reason:null})
  const res=check({execution:{...good.execution,context:'OPERATOR_EXECUTION'},
    authority:{...good.authority,context:'OPERATOR_EXECUTION'}})
  assert.equal(res.allowed,true)
})
test('live adapter calls only sanctioned spending boundary and has no public route',()=>{
  const source=readFileSync(new URL('./governed-reviewer.ts',import.meta.url),'utf8')
  assert.match(source,/import 'server-only'/)
  assert.match(source,/openAIChatCompletion/)
  assert.match(source,/isSpendGateEnforced/)
  assert.match(source,/THE_PROMPT_FACTCHECK_MODEL_ENABLED/)
  assert.match(source,/assessReviewerAdmission/)
  assert.match(source,/RUN_BOUND/)
  assert.match(source,/max_completion_tokens: FACTCHECK_REVIEW_MAX_OUTPUT_TOKENS/)
  assert.match(source,/choice\.finish_reason !== 'stop'/)
  assert.match(source,/evaluateIndependentReview/)
  assert.doesNotMatch(source,/fetch\s*\(|new OpenAI\s*\(|new Anthropic\s*\(/)
  const workflow=JSON.parse(readFileSync('docs/workflows/the-prompt.factcheck.v1.json','utf8'))
  assert.equal(workflow.enabled,false)
  assert.equal(workflow.authority.can_publish,false)
})
