import {test} from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'

registerHooks({resolve(specifier,ctx,next){
  if (['./contract','./source-collector','./reviewer-preview',
    './independent-review','./report-record','./nova-autonomy-policy']
    .includes(specifier) && ctx.parentURL?.includes('/factcheck/')) {
    return next(specifier+'.ts',ctx)
  }
  if(specifier==='../script-writer-provenance' &&
      ctx.parentURL?.includes('/factcheck/'))return next(specifier+'.ts',ctx)
  return next(specifier,ctx)
}})

const {prepareNovaShadowReceipt}=await import('./nova-shadow-receipt.ts')
const {evaluateIndependentReview}=await import('./independent-review.ts')
const {prepareFactCheckReport}=await import('./report-record.ts')
const {stampedScriptOutput}=await import('../script-writer-provenance.ts')

const projectId='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const scriptId='b9271d5b-5254-4ad8-a36c-ce7c66e9c63e'
const runId='94e620bf-31d4-401c-baf8-ec1521f5ba13'
const claimId='824ecfe1-cbda-4a7a-9de5-7683d454bc08'
const agentId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const reportId='b5b5b5b5-b5b5-45b5-85b5-b5b5b5b5b5b5'
const now=Date.parse('2026-10-28T16:00:00Z')
const material={
  projectId,scriptId,revisionId:'v1',
  hook:'Researchers published a new technical API.',
  script:'Developers can read the public documentation today.',
  captions:['Researchers published a new technical API.'],
  socialCaption:'Developers can read the public documentation today.',
  cta:'The documentation is available to the public.',
  thumbnailText:'New public research API',
  riskTier:'standard',
}
const author={
  hook:material.hook,script:material.script,
  captions:[...material.captions],hashtags:['#AI'],cta:material.cta,
  tone:'educational',estimated_duration:'~22 seconds',difficulty:'intermediate',
}
const writerResp={type:'message',id:'msg_approved_nova_author',
  model:'claude-sonnet-4-6'}
const script={
  id:scriptId,project_id:projectId,version:1,...author,
  raw_output:stampedScriptOutput(author,writerResp,1),
}
const project={id:projectId,slug:'ai-media-automation',execution_paused:false}
const baseText=[
  material.hook,material.script,material.cta,
  material.socialCaption,...material.captions,material.thumbnailText,
  'This public announcement includes links and technical limitations.',
].join(' ')
const sources=[
  {id:'source-0',url:'https://www.gov.uk/government/news/technical-api',
    publisherGroup:'uk-government',kind:'primary',
    retrievedAt:new Date(now).toISOString(),
    text:baseText+' This is a published government primary source.'},
  {id:'source-1',url:'https://www.reuters.com/world/technical-api',
    publisherGroup:'reuters',kind:'independent_reporting',
    retrievedAt:new Date(now).toISOString(),
    text:baseText+' Reuters independently reported the announcement.'},
]
const run={id:runId,project_id:projectId,claim_id:claimId,status:'running',
  lease_until:new Date(now+60_000).toISOString(),cancel_requested:false}
const nova={id:agentId,project_id:projectId,name:'Nova'}
async function freshFixture(){
  const review=await evaluateIndependentReview(material,sources,projectId,
    'claude-sonnet-4-6',now,async prompt=>{
      const {requiredUnits}=JSON.parse(prompt.user)
      return JSON.stringify({
        framing:'faithful_to_evidence',
        framingReason:'All synthetic claims match both independent source articles.',
        findings:requiredUnits.map(unit=>({
          unitId:unit.id,exactText:unit.text,verdict:'supported',
          explanation:'The original claim is in the two independent records.',
          evidence:sources.map(s=>({sourceId:s.id,exactQuote:unit.text})),
        })),
      })
    })
  assert.equal(review.decision.outcome,'ready_for_editor')
  const reportPrepared=prepareFactCheckReport({
    trustedProjectId:projectId,currentScript:script,currentRun:run,
    material,writerModel:'claude-sonnet-4-6',
    sources,review,nowMs:now,
  })
  assert.equal(reportPrepared.ok,true,JSON.stringify(reportPrepared))
  return {
    mode:'offline_shadow_only',featureEnabled:true,
    agent:nova,claimedRun:run,
    storedReport:{id:reportId,...reportPrepared.record},
    reviewContext:{previewMode:'offline_only',featureEnabled:true,
      project,script,material,sources,review,nowMs:now,
      sourceAttempts:0,reviewAttempts:0,rewrites:0},
  }
}
const reason=x=>x.ok?'UNEXPECTED_ACCEPTED':x.reason

test('ordinary fact-checked script yields a separately identified Nova shadow receipt',async()=>{
  const input=await freshFixture()
  const result=prepareNovaShadowReceipt(input)
  assert.equal(result.ok,true,JSON.stringify(result))
  if(!result.ok)return
  assert.equal(result.receipt.agent_id,agentId)
  assert.equal(result.receipt.run_id,runId)
  assert.equal(result.receipt.claim_id,claimId)
  assert.equal(result.receipt.report_id,reportId)
  assert.equal(result.receipt.script_version,1)
  assert.equal(result.receipt.policy_version,'nova.shadow.v1')
  assert.equal(result.receipt.decision,'editorial_candidate')
  assert.equal(Object.isFrozen(result.receipt),true)
  for(const forbidden of ['decided_by','owner_id','human_approved',
    'canPublish','canSpend','approved','publishedAt']){
    assert.equal(Object.hasOwn(result.receipt,forbidden),false)
  }
})

test('disabled shadow mode refuses and does not emit any candidate',async()=>{
  const input=await freshFixture()
  assert.equal(reason(prepareNovaShadowReceipt({...input,featureEnabled:false})),
    'nova_shadow_not_enabled')
  assert.equal(reason(prepareNovaShadowReceipt({...input,mode:'production'})),
    'nova_shadow_not_enabled')
})

test('agent ID, project and registered name must match Nova',async()=>{
  const input=await freshFixture()
  for(const agent of [
    {...nova,id:'unverified'},
    {...nova,name:'GrowthAgent'},
    {...nova,project_id:scriptId},
    {...nova,name:'Nova-impersonator'},
  ])assert.equal(reason(prepareNovaShadowReceipt({...input,agent})),
    'registered_project_nova_required')
})

test('claimed run is fresh, active, and bound to the same project',async()=>{
  const input=await freshFixture()
  for(const claimedRun of [
    {...run,claim_id:null},
    {...run,claim_id:'not-a-uuid'},
    {...run,project_id:scriptId},
    {...run,status:'completed'},
    {...run,cancel_requested:true},
    {...run,lease_until:new Date(now-1).toISOString()},
  ])assert.equal(reason(prepareNovaShadowReceipt({...input,claimedRun})),
    'nova_claim_not_current')
})

test('recorded report cannot be moved to another run, claim, project or script',async()=>{
  const input=await freshFixture()
  for(const storedReport of [
    {...input.storedReport,id:'not-a-uuid'},
    {...input.storedReport,run_id:scriptId},
    {...input.storedReport,claim_id:scriptId},
    {...input.storedReport,project_id:scriptId},
    {...input.storedReport,script_id:runId},
  ])assert.equal(reason(prepareNovaShadowReceipt({...input,storedReport})),
    'report_run_project_mismatch')
})

test('reviewer and source-set digests must match exact persisted report bytes',async()=>{
  const input=await freshFixture()
  for(const storedReport of [
    {...input.storedReport,content_sha256:'0'.repeat(64)},
    {...input.storedReport,source_set_sha256:'1'.repeat(64)},
    {...input.storedReport,reviewer_run_id:scriptId},
    {...input.storedReport,writer_model:'gpt-5.4-mini'},
    {...input.storedReport,risk_tier:'sensitive'},
    {...input.storedReport,findings:[]},
    {...input.storedReport,source_receipts:[]},
    {...input.storedReport,manuscript_snapshot:{
      ...input.storedReport.manuscript_snapshot,hook:'A fabricated headline',
    }},
  ])assert.equal(prepareNovaShadowReceipt({...input,storedReport}).ok,false)
})

test('unknown or OpenAI script author cannot use the OpenAI reviewer',async()=>{
  const input=await freshFixture()
  for(const raw_output of [
    null,{writer_model:'claude-sonnet-4-6'},
    stampedScriptOutput(author,null,1),
    stampedScriptOutput(author,{
      writer_transport:'governed_openai_reserve_v1',model:'gpt-5.4-mini',
    },1),
  ]){
    const reviewContext={...input.reviewContext,
      script:{...script,raw_output}}
    assert.equal(prepareNovaShadowReceipt({...input,reviewContext}).ok,false)
  }
})

test('changed source text or revised public script forces re-review',async()=>{
  const input=await freshFixture()
  for(const reviewContext of [
    {...input.reviewContext,
      sources:[{...sources[0],text:sources[0].text+' silently edited'},sources[1]]},
    {...input.reviewContext,
      material:{...material,socialCaption:'The government uses AI to decide cases.'}},
    {...input.reviewContext,
      script:{...script,version:2}},
    {...input.reviewContext,
      project:{...project,execution_paused:true}},
  ])assert.equal(prepareNovaShadowReceipt({...input,reviewContext}).ok,false)
})

test('a sensitive or contradicted report requires human handling or is discarded',async()=>{
  const input=await freshFixture()
  for(const storedReport of [
    {...input.storedReport,outcome:'requires_review',
      risk_tier:'sensitive',reasons:['sensitive_or_unclassified']},
    {...input.storedReport,outcome:'rejected',
      reasons:['material_claim_contradicted_or_misleading']},
  ])assert.equal(prepareNovaShadowReceipt({...input,storedReport}).ok,false)
})

test('a forged Nova planning action is irrelevant; real inputs are re-evaluated',async()=>{
  const input=await freshFixture()
  const result=prepareNovaShadowReceipt({...input,reviewContext:{
    ...input.reviewContext,review:null,
  }})
  assert.equal(result.ok,false)
})
