import {test} from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'

registerHooks({resolve(specifier,ctx,next){
  if (['./contract','./source-collector','./reviewer-preview',
    './independent-review','./report-record','./nova-autonomy-policy','./nova-run-step-identity']
    .includes(specifier) && ctx.parentURL?.includes('/factcheck/')) {
    return next(specifier+'.ts',ctx)
  }
  if(specifier==='../script-writer-provenance' &&
      ctx.parentURL?.includes('/factcheck/'))return next(specifier+'.ts',ctx)
  if(specifier==='../../atlas/identity' &&
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
const workflowId='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const stepLogId='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
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
  lease_until:new Date(now+60_000).toISOString(),cancel_requested:false,
  claimed_at:new Date(now-120_000).toISOString(),workflow_id:workflowId,
  steps_snapshot:[{order:1,name:'Atlas FactCheck',agent_id:agentId,
    input_template:'{{sources}}',output_key:'review'}],
}
const workflow={id:workflowId,project_id:projectId}
const assistantLog={id:stepLogId,run_id:runId,step_order:1,
  step_name:'Atlas FactCheck',role:'assistant',
  created_at:new Date(now-60_000).toISOString(),
  content:'Nova reviewed the independent original evidence and flagged no contradictions.'}
const nova={id:agentId,project_id:projectId,name:'News Hunter'}
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
    agent:nova,claimedRun:run,workflow,assistantLog,
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
  assert.equal(result.receipt.actor_key,'atlas.core')
  assert.equal(result.receipt.workflow_agent_id,agentId)
  assert.equal(Object.hasOwn(result.receipt,'decided_by'),false)
  assert.equal(result.receipt.run_id,runId)
  assert.equal(result.receipt.claim_id,claimId)
  assert.equal(result.receipt.report_id,reportId)
  assert.equal(result.receipt.script_version,1)
  assert.equal(result.receipt.workflow_id,workflowId)
  assert.equal(result.receipt.agent_step_order,1)
  assert.equal(result.receipt.agent_step_log_id,stepLogId)
  assert.equal(result.receipt.agent_step_output_sha256.length,64)
  assert.equal(result.receipt.policy_version,'atlas.shadow.v1')
  assert.equal(result.receipt.decision,'editorial_candidate')
  assert.equal(Object.isFrozen(result.receipt),true)
  for(const forbidden of ['decided_by','owner_id','human_approved',
    'canPublish','canSpend','approved','publishedAt']){
    assert.equal(Object.hasOwn(result.receipt,forbidden),false)
  }
})

test('Atlas can delegate the evidence step to an already registered non-Nova project role',async()=>{
  const input=await freshFixture()
  const result=prepareNovaShadowReceipt({...input,agent:{...nova,name:'Script Writer'}})
  assert.equal(result.ok,true)
  if(result.ok){
    assert.equal(result.receipt.actor_key,'atlas.core')
    assert.equal(result.receipt.workflow_agent_id,agentId)
  }
})

test('disabled shadow mode refuses and does not emit any candidate',async()=>{
  const input=await freshFixture()
  assert.equal(reason(prepareNovaShadowReceipt({...input,featureEnabled:false})),
    'nova_shadow_not_enabled')
  assert.equal(reason(prepareNovaShadowReceipt({...input,mode:'production'})),
    'nova_shadow_not_enabled')
})

test('Atlas is central; a delegated project role must exist, never a second Nova role',async()=>{
  const input=await freshFixture()
  for(const agent of [
    {...nova,id:'unverified'},
    {...nova,name:'Nova'},
    {...nova,name:''},
    {...nova,project_id:scriptId},
    {...nova,name:'  '},
  ])assert.equal(reason(prepareNovaShadowReceipt({...input,agent})),
    'registered_delegated_workflow_role_required')
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
    {...run,claimed_at:null},
    {...run,claimed_at:new Date(now+60_000).toISOString()},
  ]){
    const rejection=reason(prepareNovaShadowReceipt({...input,claimedRun}))
    assert.match(rejection,/^nova_claim_not_current$|^nova_agent_run_binding_missing:/)
  }
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

test('Postgres JSONB key reordering does not break exact source/report proof',async()=>{
  const input=await freshFixture()
  const reorder=value=>{
    if(Array.isArray(value))return value.map(reorder)
    if(value && typeof value==='object')
      return Object.fromEntries(Object.entries(value).reverse()
        .map(([k,v])=>[k,reorder(v)]))
    return value
  }
  const report={
    ...input.storedReport,
    manuscript_snapshot:reorder(input.storedReport.manuscript_snapshot),
    source_receipts:reorder(input.storedReport.source_receipts),
    findings:reorder(input.storedReport.findings),
  }
  const output=prepareNovaShadowReceipt({...input,storedReport:report})
  assert.equal(output.ok,true,JSON.stringify(output))
})

test('Postgres JSONB normalization never permits source or claim array reordering',async()=>{
  const input=await freshFixture()
  for(const storedReport of [
    {...input.storedReport,source_receipts:
      [...input.storedReport.source_receipts].reverse()},
    {...input.storedReport,findings:
      [...input.storedReport.findings].reverse()},
  ]){
    assert.equal(prepareNovaShadowReceipt({...input,storedReport}).ok,false)
  }
})

test('Nova candidate needs an agent assignment in an immutable RUN snapshot',async()=>{
  const input=await freshFixture()
  const cases=[
    {claimedRun:{...run,workflow_id:null}},
    {claimedRun:{...run,workflow_id:scriptId}},
    {workflow:{...workflow,project_id:scriptId}},
    {claimedRun:{...run,steps_snapshot:null}},
    {claimedRun:{...run,steps_snapshot:[]}},
    {claimedRun:{...run,steps_snapshot:[
      {...run.steps_snapshot[0],agent_id:scriptId}]}},
    {claimedRun:{...run,steps_snapshot:[
      run.steps_snapshot[0],{...run.steps_snapshot[0],order:2}]}},
    {claimedRun:{...run,steps_snapshot:[
      run.steps_snapshot[0],{...run.steps_snapshot[0]}]}},
  ]
  for(const patch of cases){
    const actual=prepareNovaShadowReceipt({...input,...patch})
    assert.equal(actual.ok,false,JSON.stringify(patch))
    assert.match(actual.reason,/nova_agent_run_binding_missing|nova_workflow_or_claim_not_current/)
  }
})

test('a log that belongs to another run, role or step cannot attest Nova',async()=>{
  const input=await freshFixture()
  const cases=[
    {...assistantLog,id:'forged'},
    {...assistantLog,run_id:scriptId},
    {...assistantLog,step_order:2},
    {...assistantLog,step_name:'Script Writer'},
    {...assistantLog,role:'user'},
    {...assistantLog,content:''},
    {...assistantLog,content:'short'},
    {...assistantLog,created_at:new Date(now-180_000).toISOString()},
    {...assistantLog,created_at:new Date(now+30_000).toISOString()},
  ]
  for(const assistantLog of cases){
    const actual=prepareNovaShadowReceipt({...input,assistantLog})
    assert.equal(actual.ok,false,JSON.stringify(assistantLog))
    assert.match(actual.reason,/nova_agent_run_binding_missing/)
  }
})

test('durably logged Nova step output SHA is byte-exact',async()=>{
  const input=await freshFixture()
  const a=prepareNovaShadowReceipt(input)
  assert.equal(a.ok,true)
  if(!a.ok)return
  const {createHash}=await import('node:crypto')
  const expected=createHash('sha256').update(assistantLog.content).digest('hex')
  assert.equal(a.receipt.agent_step_output_sha256,expected)
  const changed=prepareNovaShadowReceipt({...input,
    assistantLog:{...assistantLog,content:assistantLog.content+' additional text'},
  })
  assert.equal(changed.ok,true)
  if(changed.ok){
    assert.notEqual(changed.receipt.agent_step_output_sha256,expected)
    assert.equal(changed.receipt.agent_step_log_id,a.receipt.agent_step_log_id)
  }
})

test('no production media API can activate a Nova step receipt or shadow INSERT',async()=>{
  const {readFileSync,readdirSync}=await import('node:fs')
  const {join}=await import('node:path')
  let inspected=0
  const visit=dir=>{
    for(const item of readdirSync(dir,{withFileTypes:true})){
      const path=join(dir,item.name)
      if(item.isDirectory())visit(path)
      else if(item.isFile()&&(path.endsWith('.ts')||path.endsWith('.tsx'))){
        inspected++
        const content=readFileSync(path,'utf8')
        for(const forbidden of [
          'prepareNovaShadowReceipt','proveNovaAssignedWorkflowStep',
          'media_factcheck_atlas_decisions','nova-run-step-identity',
        ]){
          assert.ok(!content.includes(forbidden),
            'Nova shadow decision route activated: '+path+' '+forbidden)
        }
      }
    }
  }
  visit('apps/web/app/api/media')
  assert.ok(inspected>20,'expected the real The Prompt API route tree')
})
