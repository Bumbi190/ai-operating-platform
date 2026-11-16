import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepareManualEditorialReview, BedrockPilotRefused } from '../../lib/ai/bedrock-pilot/manual-review-contract.ts'

const pid = '00000000-0000-4000-8000-000000000001'
const ctx = {
  environment:'preview', branch:'feat/omnira-bedrock-pilot-20261116',
  hardSpendGate:true, pilotEnabled:true, operatorApproved:true,
  operation:'manual_editorial_quality_review',executionContext:'OPERATOR_EXECUTION',
  executionScopeKind:'PROJECT',executionProjectId:pid,
}
const input={
  projectId:pid, script:'Google uses AI results in school search. The timeline needs review.',
  sources:[
    {url:'https://www.wired.com/story/news',excerpt:'Some schools report trouble opting out.'},
    {url:'https://blog.google/products/education',excerpt:'School administrators have controls.'}
  ],
  maxOutputTokens:128,
}
const deny=(c={},i={})=>assert.throws(()=>prepareManualEditorialReview({...ctx,...c},{...input,...i}),e=>e instanceof BedrockPilotRefused)
test('prepared input is read-only planning data and has no dispatch flag',()=>{
  const r=prepareManualEditorialReview(ctx,input)
  assert.equal(r.modelId,'amazon.nova-micro-v1:0')
  assert.equal(r.sourceReferencesFactChecked,false)
  assert.equal(r.maxOutputTokens,128)
  assert.equal(r.operation,'manual_editorial_quality_review')
  assert.match(r.prompt,/have NOT independently verified/)
  assert.equal('canDispatch' in r,false)
})
test('pilot disabled by default',()=>deny({pilotEnabled:false}))
test('production rejected even if enabled',()=>deny({environment:'production'}))
test('other preview branch rejected',()=>deny({branch:'main'}))
test('missing hard stop rejects',()=>deny({hardSpendGate:false}))
test('manual operator consent required',()=>deny({operatorApproved:false}))
test('no autonomous, news hunter or chat bypass',()=>{
  for(const c of [
    {operation:'Analyze News'}, {operation:'publish'}, {executionContext:'AUTONOMOUS'},
    {executionContext:'OPERATOR_INTERACTIVE'},
  ])deny(c)
})
test('scope matching is strict',()=>{
  deny({executionProjectId:'00000000-0000-4000-8000-000000000002'})
  deny({executionScopeKind:'GLOBAL_ONLY'})
  deny({}, {projectId:'blah'})
})
test('source extracts must be real nonempty bounded HTTPS text',()=>{
  deny({}, {sources:input.sources.slice(0,1)})
  deny({}, {sources:[input.sources[0], input.sources[0]]})
  deny({}, {sources:[...input.sources,{url:'file:///etc/passwd',excerpt:'x'}]})
  deny({}, {sources:[{url:'https://localhost/admin',excerpt:'x'},input.sources[1]]})
  deny({}, {sources:[{url:'https://evil.example/@secret',excerpt:'x'},input.sources[1]]})
  deny({}, {sources:[{url:'https://example.com',excerpt:'x'.repeat(1001)},input.sources[1]]})
})
test('prompt and output caps enforced',()=>{
  deny({}, {script:''})
  deny({}, {script:'X'.repeat(4097)})
  deny({}, {maxOutputTokens:0})
  deny({}, {maxOutputTokens:257})
  deny({}, {maxOutputTokens:NaN})
  deny({}, {sources:[...input.sources,{url:'https://three.example',excerpt:'Y'.repeat(1000)},{url:'https://four.example',excerpt:'Z'.repeat(1000)},{url:'https://five.example',excerpt:'W'.repeat(1000)},{url:'https://six.example',excerpt:'V'.repeat(1000)}],script:'A'.repeat(4000)})
})
