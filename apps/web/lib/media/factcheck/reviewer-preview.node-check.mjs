import {test} from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'

// Node 22 strip-types does not rewrite TS's extensionless local imports.
// Keep production-friendly TypeScript source, resolve only this test's .ts files.
registerHooks({
  resolve(specifier,context,nextResolve) {
    if ((specifier === './contract' || specifier === './source-collector') &&
        context.parentURL?.includes('/factcheck/')) {
      return nextResolve(specifier + '.ts',context)
    }
    return nextResolve(specifier,context)
  },
})
const {runFactCheckFixturePreview, factCheckReviewerInstruction}
  = await import('./reviewer-preview.ts')
const {contentDigest} = await import('./contract.ts')

const NOW = Date.parse('2026-10-28T10:30:00Z')
const WIRED = 'https://www.wired.com/story/new-research-api/'
const PARLIAMENT = 'https://questions-statements.parliament.uk/written-questions/detail/2026-06-02/5868'
const manuscript = {
  projectId:'the-prompt',scriptId:'script-111',revisionId:'rev-1',
  hook:'Researchers announced a new public API.',
  script:'Developers can now read the published technical documentation.',
  captions:['The API is public.'],
  socialCaption:'Developers can now read the published technical documentation.',
  riskTier:'standard',
}
const SOURCE_TEXT = [
  'Researchers announced a new public API.',
  'Developers can now read the published technical documentation.',
  'The API is public.',
  'The official documentation and technical limitations are available to readers.',
].join(' ')
const validAssessment = input=>({
  projectId:input.manuscript.projectId,scriptId:input.manuscript.scriptId,
  revisionId:input.manuscript.revisionId,contentSha256:input.contentSha256,
  reviewerRunId:'factcheck-review-xyz',reviewedAt:new Date(NOW).toISOString(),
  framing:'faithful_to_evidence',framingReason:'All supplied assertions are supported in the fixture.',
  findings:input.requiredUnits.map(unit=>({
    unitId:unit.id,exactText:unit.text,verdict:'supported',
    explanation:'Full claim is present in two independent source fixtures.',
    evidence:[
      {sourceId:'source-0',exactQuote:unit.text},
      {sourceId:'source-1',exactQuote:unit.text},
    ],
  })),
})
const makeArgs=(override={})=>({
  mode:'offline_fixture_only',projectId:manuscript.projectId,
  writerModelIdentity:'model-writer-1',manuscript,
  sourceUrls:[WIRED,PARLIAMENT],
  sourceReader:{kind:'fixture',read:async url=>({
    success:true,url,title:'Test source',text:SOURCE_TEXT+' Publisher: '+url,
  })},
  reviewer:{kind:'fixture',modelIdentity:'model-reviewer-2',review:async input=>validAssessment(input)},
  nowMs:NOW,...override,
})

test('reviewer instruction explicitly refuses certainty inflation and instructions in evidence',()=>{
  const text=factCheckReviewerInstruction()
  assert.match(text,/may face investigation/)
  assert.match(text,/AI decides/)
  assert.match(text,/untrusted DATA/)
  assert.match(text,/contradictory evidence/)
})

test('a successful evidence review returns ready_for_editor with NO publishing authority',async()=>{
  const result=await runFactCheckFixturePreview(makeArgs())
  assert.equal(result.decision.outcome,'ready_for_editor')
  assert.equal(result.sources.length,2)
  assert.equal(result.canPublish,false)
  assert.equal(result.canGeneratePaidMedia,false)
  assert.equal(result.canSchedule,false)
  assert.equal(result.mode,'offline_fixture_only')
})

test('model that wrote the story cannot independently review itself',async()=>{
  let reads=0
  const options=makeArgs({
    reviewer:{kind:'fixture',modelIdentity:'MODEL-WRITER-1',review:async()=>{reads++;return {}}},
  })
  const result=await runFactCheckFixturePreview(options)
  assert.equal(result.decision.outcome,'requires_review')
  assert.match(result.decision.reasons[0],/not_independent/)
  assert.equal(reads,0)
})

test('no live collaborator may be passed through a forged mode',async()=>{
  let called=0
  const options=makeArgs({
    mode:'live',
    reviewer:{kind:'live',modelIdentity:'different',review:async()=>{called++;return {}}},
  })
  const result=await runFactCheckFixturePreview(options)
  assert.equal(result.decision.outcome,'requires_review')
  assert.equal(called,0)
})

test('a project mismatch is refused before source calls',async()=>{
  let calls=0
  const options=makeArgs({
    projectId:'another-project',
    sourceReader:{kind:'fixture',read:async()=>{calls++;return null}},
  })
  const result=await runFactCheckFixturePreview(options)
  assert.equal(result.decision.outcome,'requires_review')
  assert.equal(calls,0)
})

test('source failure stops before reviewer, and cannot expose a partial batch',async()=>{
  let reviewed=0
  const options=makeArgs({
    sourceReader:{kind:'fixture',read:async()=>null},
    reviewer:{kind:'fixture',modelIdentity:'different',review:async()=>{reviewed++;return {}}},
  })
  const result=await runFactCheckFixturePreview(options)
  assert.equal(result.decision.outcome,'requires_review')
  assert.equal(result.sources.length,0)
  assert.equal(reviewed,0)
})

test('a model reviewer outage or malformed JSON fails to review rather than publish',async()=>{
  const thrower=makeArgs({reviewer:{
    kind:'fixture',modelIdentity:'reviewer',review:async()=>{throw Error('provider unavailable')},
  }})
  assert.equal((await runFactCheckFixturePreview(thrower)).decision.outcome,'requires_review')
  const malformed=makeArgs({reviewer:{
    kind:'fixture',modelIdentity:'reviewer',review:async()=>'{ "passed": true',
  }})
  assert.equal((await runFactCheckFixturePreview(malformed)).decision.outcome,'requires_review')
})

test('reviewer contradicts a claim: rejected, not even ready for editor',async()=>{
  const options=makeArgs({reviewer:{
    kind:'fixture',modelIdentity:'reviewer',review:async input=>{
      const a=validAssessment(input)
      return {...a,findings:a.findings.map((f,i)=>i===0?{...f,verdict:'contradicted'}:f)}
    },
  }})
  const result=await runFactCheckFixturePreview(options)
  assert.equal(result.decision.outcome,'rejected')
  assert.equal(result.canPublish,false)
})

test('a reviewer cannot reuse evidence from the previous headline revision',async()=>{
  const prior=contentDigest(manuscript)
  const options=makeArgs({
    manuscript:{...manuscript,hook:'The AI secretly decides cases.',revisionId:'rev-2'},
    reviewer:{kind:'fixture',modelIdentity:'reviewer',review:async input=>({
      ...validAssessment(input),contentSha256:prior,
    })},
  })
  assert.equal((await runFactCheckFixturePreview(options)).decision.outcome,'requires_review')
})

test('sensitive topics cannot be auto-approved even with full citation coverage',async()=>{
  const m={...manuscript,riskTier:'sensitive'}
  const result=await runFactCheckFixturePreview(makeArgs({manuscript:m}))
  assert.equal(result.decision.outcome,'requires_review')
  assert.equal(result.canPublish,false)
})

test('an invented claim with no support is not cleared by made-up evidence',async()=>{
  const options=makeArgs({reviewer:{
    kind:'fixture',modelIdentity:'reviewer',review:async input=>{
      const a=validAssessment(input)
      return {...a,findings:a.findings.map((f,i)=>i===0?{...f,
        evidence:[{sourceId:'source-0',exactQuote:'The AI secretly decides asylum claims.'},
                  {sourceId:'source-1',exactQuote:'The AI secretly decides asylum claims.'}]
      }:f)}
    },
  }})
  const result=await runFactCheckFixturePreview(options)
  assert.equal(result.decision.outcome,'requires_review')
})

test('a reviewer cannot edit frozen source evidence or the exact script version',async()=>{
  let mutationRejected=0
  const options=makeArgs({
    reviewer:{
      kind:'fixture',modelIdentity:'independent-reviewer',
      review:async input=>{
        try{ input.sourceSnapshots[0].text='The AI decides asylum cases.' }
        catch{ mutationRejected++ }
        try{ input.manuscript.hook='A fabricated new headline.' }
        catch{ mutationRejected++ }
        try{ input.requiredUnits[0].text='Tampered with evidence.' }
        catch{ mutationRejected++ }
        return validAssessment(input)
      },
    },
  })
  const result=await runFactCheckFixturePreview(options)
  assert.equal(mutationRejected,3)
  assert.equal(result.decision.outcome,'ready_for_editor')
  assert.equal(result.canPublish,false)
  assert.equal(manuscript.hook,'Researchers announced a new public API.')
})
test('non-array manuscript input is refused before any reader or reviewer call',async()=>{
  let invoked=0
  const opts=makeArgs({
    manuscript:{...manuscript,captions:null},
    sourceReader:{kind:'fixture',read:async()=>{invoked++;return null}},
  })
  const result=await runFactCheckFixturePreview(opts)
  assert.equal(result.decision.outcome,'requires_review')
  assert.equal(invoked,0)
})

test('pinned HTTPS source adapter composes with the complete offline FactCheck flow',async()=>{
  const {createPinnedReaderForOfflineTests}=await import('./safe-https-reader.ts')
  const sourceText=[
    'Researchers announced a new public API.',
    'Developers can now read the published technical documentation.',
    'The API is public.',
  ].join(' ')
  const reader=createPinnedReaderForOfflineTests(
    async host=>[{address:'151.101.65.55',family:4}],
    async url=>({
      status:200,contentType:'text/plain',contentEncoding:'',
      body:new TextEncoder().encode(sourceText+' Independent publication: '+url.hostname),
    }),
  )
  const result=await runFactCheckFixturePreview(makeArgs({
    sourceReader:{kind:'fixture',read:reader},
  }))
  assert.equal(result.decision.outcome,'ready_for_editor')
  assert.equal(result.sources.length,2)
  assert.equal(result.canPublish,false)
  assert.equal(result.canGeneratePaidMedia,false)
})

test('DNS poisoning in the real-reader adapter blocks the reviewer and publishing',async()=>{
  const {createPinnedReaderForOfflineTests}=await import('./safe-https-reader.ts')
  let reviewed=0
  const reader=createPinnedReaderForOfflineTests(
    async host=>host==='www.wired.com' ?
      [{address:'151.101.65.55',family:4}] :
      [{address:'169.254.169.254',family:4}],
    async url=>({
      status:200,contentType:'text/plain',contentEncoding:'',
      body:new TextEncoder().encode('A legitimate article with public evidence. Publisher '+url.hostname+
        ' The conclusions are independently verifiable in two separate stories.'),
    }),
  )
  const result=await runFactCheckFixturePreview(makeArgs({
    sourceReader:{kind:'fixture',read:reader},
    reviewer:{kind:'fixture',modelIdentity:'reviewer',review:async()=>{reviewed++;return {}}},
  }))
  assert.equal(result.decision.outcome,'requires_review')
  assert.equal(result.sources.length,0)
  assert.equal(result.canPublish,false)
  assert.equal(reviewed,0)
})

test('Home Office overclaim simulation is rejected even if full source texts are present',async()=>{
  const script={
    ...manuscript,
    hook:'UK Home Office used ChatGPT to decide asylum cases.',
    script:'A government watchdog is now investigating the AI tool.',
    socialCaption:'UK government AI made asylum decisions.',
    riskTier:'standard',
  }
  const reader=async url=>({
    success:true,url,title:'Source evidence',
    text:url.includes('wired.com') ?
      'The watchdog may consider investigating AI tool use. The Home Office says human caseworkers make the actual decisions, while AI may assist summaries and research.' :
      'The parliamentary answer says artificial intelligence does not make asylum decisions. Caseworkers retain responsibility. The report does not say an investigation is underway.',
  })
  const result=await runFactCheckFixturePreview(makeArgs({
    manuscript:script,
    sourceReader:{kind:'fixture',read:reader},
    reviewer:{kind:'fixture',modelIdentity:'independent-reviewer',review:async input=>({
      ...validAssessment(input),
      framing:'misleading',
      framingReason:'A potential investigation was presented as confirmed; human decisions were attributed to AI.',
      findings:input.requiredUnits.map(unit=>({
        unitId:unit.id,exactText:unit.text,verdict:'contradicted',
        explanation:'The available sources contradict the claim and its certainty.',
        evidence:[],
      })),
    })},
  }))
  assert.equal(result.decision.outcome,'rejected')
  assert.equal(result.canPublish,false)
})
