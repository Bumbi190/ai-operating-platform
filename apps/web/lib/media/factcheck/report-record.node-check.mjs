import {test} from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
registerHooks({
  resolve(specifier,context,next){
    if (['./contract','./independent-review','./reviewer-preview','./source-collector']
      .includes(specifier) && context.parentURL?.includes('/factcheck/')) {
      return next(specifier+'.ts',context)
    }
    return next(specifier,context)
  },
})
const {prepareFactCheckReport}=await import('./report-record.ts')
const {evaluateIndependentReview,sourceSetDigest}
  =await import('./independent-review.ts')
const {contentDigest}=await import('./contract.ts')

const projectId='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const scriptId='b9271d5b-5254-4ad8-a36c-ce7c66e9c63e'
const runId='94e620bf-31d4-401c-baf8-ec1521f5ba13'
const claimId='824ecfe1-cbda-4a7a-9de5-7683d454bc08'
const now=Date.parse('2026-10-28T11:40:00Z')
const material={
  projectId,scriptId,revisionId:'v1',
  hook:'Researchers published a new technical API.',
  script:'Developers can read the public documentation today.',
  captions:['Researchers published a new technical API.'],
  socialCaption:'Developers can read the public documentation today.',
  cta:'The documentation is available to the public.',
  thumbnailText:'',
  riskTier:'standard',
}
const sourceText=[
  material.hook, material.script,
  material.cta,
  'Further technical limitations and details are available in the original document.',
].join(' ')
const sources=[
  {id:'source-0',url:'https://www.gov.uk/government/news/research-update',
    publisherGroup:'uk-government',kind:'primary',
    retrievedAt:new Date(now).toISOString(),text:sourceText+' Original research note.'},
  {id:'source-1',url:'https://www.reuters.com/world/independent-research-report',
    publisherGroup:'reuters',kind:'independent_reporting',
    retrievedAt:new Date(now).toISOString(),text:sourceText+' Independently reviewed source.'},
]
const script={
  id:scriptId,project_id:projectId,version:1,
  hook:material.hook,script:material.script,
  captions:[...material.captions],cta:material.cta,
}
const run={
  id:runId,project_id:projectId,claim_id:claimId,
  status:'running',cancel_requested:false,
  lease_until:new Date(now+60000).toISOString(),
}

async function evaluated(mat=material,src=sources){
  return evaluateIndependentReview(mat,src,mat.projectId,'claude-sonnet-4-6',now,
    async prompt=>{
      const args=JSON.parse(prompt.user)
      return JSON.stringify({
        framing:'faithful_to_evidence',
        framingReason:'All material claims in this synthetic case are supported.',
        findings:args.requiredUnits.map(unit=>({
          unitId:unit.id,exactText:unit.text,verdict:'supported',
          explanation:'The exact sentence appears in both sources.',
          evidence:[
            {sourceId:'source-0',exactQuote:unit.text},
            {sourceId:'source-1',exactQuote:unit.text},
          ],
        })),
      })
    })
}
const data=(review,patch={})=>({
  trustedProjectId:projectId,
  currentScript:script,currentRun:run,material,
  sources,review,writerModel:'claude-sonnet-4-6',
  nowMs:now,...patch,
})
const reason=(result)=>result.ok?'unexpected_success':result.reason

test('a verified review creates only an evidence record, not approval',async()=>{
  const review=await evaluated()
  assert.equal(review.decision.outcome,'ready_for_editor')
  const outcome=prepareFactCheckReport(data(review))
  assert.equal(outcome.ok,true)
  if(!outcome.ok)return
  const r=outcome.record
  assert.equal(r.project_id,projectId)
  assert.equal(r.script_id,scriptId)
  assert.equal(r.run_id,runId)
  assert.equal(r.claim_id,claimId)
  assert.equal(r.script_version,1)
  assert.equal(r.content_sha256,contentDigest(material))
  assert.equal(r.source_set_sha256,sourceSetDigest(sources))
  assert.equal(r.reviewer_run_id,review.assessment.reviewerRunId)
  assert.equal(r.reviewed_at,review.assessment.reviewedAt)
  assert.equal(r.outcome,'ready_for_editor')
  assert.equal(r.source_receipts.length,2)
  assert.equal(r.findings.length,5)
  assert.equal(r.manuscript_snapshot.socialCaption,material.socialCaption)
  assert.ok(!Object.hasOwn(r,'approved'))
  assert.ok(!Object.hasOwn(r,'canPublish'))
  assert.ok(!JSON.stringify(r).includes('Original research note.'),
    'Full source article text should not be copied into reports')
})

test('report and nested citations cannot be rewritten after admission',async()=>{
  const out=prepareFactCheckReport(data(await evaluated()))
  assert.equal(out.ok,true)
  if(!out.ok)return
  assert.equal(Object.isFrozen(out.record),true)
  assert.equal(Object.isFrozen(out.record.manuscript_snapshot.captions),true)
  assert.equal(Object.isFrozen(out.record.source_receipts[0]),true)
  assert.equal(Object.isFrozen(out.record.findings[0].evidence[0]),true)
  assert.throws(()=>{out.record.source_receipts[0].publisherGroup='different'},TypeError)
  assert.throws(()=>{out.record.findings[0].evidence[0].exactQuote='invented'},TypeError)
})

test('wrong or swapped project IDs cannot prepare a report',async()=>{
  const r=await evaluated()
  for(const patch of [
    {trustedProjectId:'721f2fbe-17b9-4230-afc7-b1c805b5350f'},
    {currentScript:{...script,project_id:'721f2fbe-17b9-4230-afc7-b1c805b5350f'}},
    {currentRun:{...run,project_id:'721f2fbe-17b9-4230-afc7-b1c805b5350f'}},
    {currentScript:{...script,id:'721f2fbe-17b9-4230-afc7-b1c805b5350f'}},
  ]) {
    const result=prepareFactCheckReport(data(r,patch))
    assert.equal(result.ok,false,JSON.stringify(patch))
  }
})

test('expired or missing claim, cancelled run or wrong status refuses',async()=>{
  const r=await evaluated()
  for(const currentRun of [
    {...run,claim_id:null},
    {...run,lease_until:new Date(now-1000).toISOString()},
    {...run,status:'completed'},
    {...run,status:'pending'},
    {...run,cancel_requested:true},
  ]) {
    const result=prepareFactCheckReport(data(r,{currentRun}))
    assert.equal(result.ok,false,JSON.stringify(currentRun))
  }
})

test('changed hook, script, captions, CTA or version refuses before persistence',async()=>{
  const r=await evaluated()
  const mutations=[
    {...script,hook:'A newly edited title'},
    {...script,script:'The API is used to decide government cases.'},
    {...script,captions:['A newly edited caption']},
    {...script,cta:'Click for unrelated rumours.'},
    {...script,version:2},
  ]
  for(const currentScript of mutations){
    assert.equal(reason(prepareFactCheckReport(data(r,{currentScript}))),
      'current_script_content_changed')
  }
})

test('changed social caption or thumbnail invalidates earlier review digest',async()=>{
  const r=await evaluated()
  for(const patch of [
    {material:{...material,socialCaption:'A sensational new caption.'}},
    {material:{...material,thumbnailText:'SECRET LEAK!'}},
  ]) {
    const result=prepareFactCheckReport(data(r,patch))
    assert.equal(result.ok,false,JSON.stringify(patch))
  }
})

test('unsupported or malicious model cannot claim independent review',async()=>{
  const r=await evaluated()
  const bad=[
    {...r,model:'claude-sonnet-4-6'},
    {...r,assessment:{...r.assessment,reviewerRunId:'forged-uuid'}},
    {...r,sourceSetSha256:'0'.repeat(64)},
    {...r,decision:{...r.decision,contentSha256:'1'.repeat(64)}},
    {...r,decision:{...r.decision,outcome:'rejected'}},
  ]
  for(const review of bad) {
    assert.equal(prepareFactCheckReport(data(review)).ok,false)
  }
})

test('no usable independent assessment means nothing to write',async()=>{
  const noModel=await evaluateIndependentReview(
    material,sources,projectId,'claude-sonnet-4-6',now,
    async()=>{throw new Error('provider_unavailable')})
  assert.equal(noModel.decision.outcome,'requires_review')
  const result=prepareFactCheckReport(data(noModel))
  assert.equal(result.ok,false)
  assert.equal(result.reason,'identity_missing_or_invalid')
})

test('changed source words, URL, publisher or stale date refuse proof',async()=>{
  const r=await evaluated()
  const changed=[
    [{...sources[0],text:sources[0].text+' silently changed'},sources[1]],
    [{...sources[0],url:'https://www.wired.com/story/misattributed'},sources[1]],
    [{...sources[0],publisherGroup:'made-up-publisher'},sources[1]],
    [{...sources[0],retrievedAt:'2026-10-01T00:00:00Z'},sources[1]],
    [{...sources[0],text:sources[1].text},sources[1]],
  ]
  for(const src of changed) {
    assert.equal(prepareFactCheckReport(data(r,{sources:src})).ok,false)
  }
})

test('model cannot forge "ready for editor" by changing just the verdict',async()=>{
  const r=await evaluated()
  const swapped={
    ...r,decision:{...r.decision,reasons:['no_problem']}
  }
  assert.equal(prepareFactCheckReport(data(swapped)).ok,false)
})

test('high-impact content results in a human-review receipt, NOT approval',async()=>{
  const s={
    ...material,
    hook:'Researchers described a new cancer diagnosis system.',
    riskTier:'sensitive',
  }
  const sr=sources.map(x=>({...x,text:x.text+' '+s.hook}))
  const review=await evaluated(s,sr)
  assert.equal(review.decision.outcome,'requires_review')
  const currentScript={...script,hook:s.hook}
  const result=prepareFactCheckReport(data(review,{material:s,sources:sr,currentScript}))
  assert.equal(result.ok,true)
  if(result.ok){
    assert.equal(result.record.outcome,'requires_review')
    assert.deepEqual(result.record.reasons,['sensitive_or_unclassified'])
  }
})

test('an unverified writer model is refused even if evidence looks correct',async()=>{
  const r=await evaluated()
  for(const writerModel of ['gpt-5.4-mini','unknown','openai/gpt-5','']){
    assert.equal(prepareFactCheckReport(data(r,{writerModel})).ok,false)
  }
})

test('old reviewer evidence is not currently valid',async()=>{
  const r=await evaluated()
  const result=prepareFactCheckReport(data(r,{nowMs:now+2*24*60*60*1000}))
  assert.equal(result.ok,false)
})
