import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {assessFactCheck, contentDigest, materialUnits} from './contract.ts'

const now = Date.parse('2026-10-28T09:00:00Z')
const material = {
  projectId: 'project-the-prompt', scriptId: 'script-123', revisionId: 'revision-1',
  hook: 'OpenAI launched a public research API.',
  script: 'The API is now available to developers.',
  captions: ['OpenAI launched a public research API.'],
  socialCaption: 'The API is now available to developers.',
  riskTier: 'standard',
}
const sourceText = 'OpenAI launched a public research API. The API is now available to developers. Researchers can access the published documentation now.'
const sources = [
  {id:'press',url:'https://openai.com/news/research',publisherGroup:'openai',
   kind:'primary',retrievedAt:'2026-10-28T08:45:00Z',text:sourceText},
  {id:'paper',url:'https://example.org/report',publisherGroup:'independent-paper',
   kind:'independent_reporting',retrievedAt:'2026-10-28T08:50:00Z',text:sourceText},
]
const assessment = {
  projectId: material.projectId,scriptId:material.scriptId,revisionId:material.revisionId,
  contentSha256:contentDigest(material),reviewerRunId:'independent-review-run-1',
  reviewedAt:'2026-10-28T08:55:00Z',
  framing:'faithful_to_evidence',framingReason:'Claims are stated at the level of the evidence.',
  findings:materialUnits(material).map(unit=>({
    unitId:unit.id,exactText:unit.text,verdict:'supported',
    explanation:'Evidence is cited by source excerpt.',
    evidence:sources.map(s=>({sourceId:s.id,exactQuote:unit.text})),
  })),
}
const run=(m=material,s=sources,a=assessment)=>assessFactCheck(m,s,a,now)

test('a fully evidenced ordinary story is ONLY ready for editorial approval',()=>{
  const result=run()
  assert.equal(result.outcome,'ready_for_editor')
  assert.equal(result.unitCount,4)
  assert.deepEqual(result.reasons,[])
})
test('without an assessment publication is never authorized',()=>{
  assert.equal(run(material,sources,null).outcome,'requires_review')
})
test('one source, or two from one publisher, is insufficient',()=>{
  assert.equal(run(material,sources.slice(0,1)).outcome,'requires_review')
  assert.equal(run(material,[sources[0],{...sources[1],publisherGroup:'openai'}]).outcome,'requires_review')
})
test('a model cannot invent a quotation not in the retrieved source text',()=>{
  const bad={...assessment,findings:assessment.findings.map((f,i)=>i===0
    ?{...f,evidence:[{sourceId:'press',exactQuote:'The UK Home Office uses ChatGPT to decide asylum.'},
                    {sourceId:'paper',exactQuote:f.exactText}]}
    :f)}
  assert.equal(run(material,sources,bad).outcome,'requires_review')
})
test('a factually contradicted sentence is rejected even with citations',()=>{
  const bad={...assessment,findings:assessment.findings.map((f,i)=>i===0?{...f,verdict:'contradicted'}:f)}
  assert.equal(run(material,sources,bad).outcome,'rejected')
})
test('sensational, misleading framing is rejected before publication',()=>{
  assert.equal(run(material,sources,{...assessment,framing:'misleading'}).outcome,'rejected')
})
test('risk tier sensitive or unknown requires a human',()=>{
  for(const riskTier of ['sensitive','unknown']){
    const m={...material,riskTier}
    assert.equal(run(m,sources,{...assessment,contentSha256:contentDigest(m)}).outcome,'requires_review')
  }
})
test('a rewritten script cannot reuse the old fact-check',()=>{
  const edited={...material,hook:'OpenAI is secretly deciding elections.'}
  assert.equal(run(edited).outcome,'requires_review')
  const editedCaption={...material,socialCaption:'A hidden AI scandal.'}
  assert.equal(run(editedCaption).outcome,'requires_review')
})
test('stale or structurally broken assessments never pass',()=>{
  assert.equal(run(material,sources,{...assessment,reviewedAt:'2026-10-01T00:00:00Z'}).outcome,'requires_review')
  assert.equal(run(material,sources,{...assessment,findings:null}).outcome,'requires_review')
  assert.equal(run(material,sources,{...assessment,reviewerRunId:null}).outcome,'requires_review')
})
test('public CTA and thumbnail changes also invalidate the evidence',()=>{
  assert.equal(run({...material,cta:'This is a prediction.'}).outcome,'requires_review')
  assert.equal(run({...material,thumbnailText:'Secret AI scandal'}).outcome,'requires_review')
})
test('cross-project and wrong revision evidence never applies',()=>{
  assert.equal(run(material,sources,{...assessment,projectId:'another-project'}).outcome,'requires_review')
  assert.equal(run(material,sources,{...assessment,revisionId:'another-version'}).outcome,'requires_review')
})
test('omitted claim, missing evidence and false neutrality cannot pass',()=>{
  assert.equal(run(material,sources,{...assessment,findings:assessment.findings.slice(1)}).outcome,'requires_review')
  assert.equal(run(material,sources,{...assessment,framing:'unverified'}).outcome,'requires_review')
  assert.equal(run(material,sources,{...assessment,findings:assessment.findings.map((f,i)=>
    i===1?{...f,verdict:'not_factual'}:f)}).outcome,'requires_review')
})
test('stale or suspicious source snapshots cannot authorize approval',()=>{
  assert.equal(run(material,[{...sources[0],retrievedAt:'2026-10-01T00:00:00Z'},sources[1]]).outcome,'requires_review')
  assert.equal(run(material,[{...sources[0],url:'http://openai.com/news/research'},sources[1]]).outcome,'requires_review')
  assert.equal(run(material,[sources[0],{...sources[0]}]).outcome,'requires_review')
})
test('community posts cannot count as independent verification',()=>{
  assert.equal(run(material,[sources[0],{...sources[1],kind:'community'}]).outcome,'requires_review')
})

test('the FactCheck blueprint cannot silently become a production publisher',()=>{
  const workflow=JSON.parse(readFileSync('docs/workflows/the-prompt.factcheck.v1.json','utf8'))
  assert.equal(workflow.id,'the-prompt.factcheck')
  assert.equal(workflow.enabled,false)
  assert.equal(workflow.status,'design_only_not_registered')
  assert.equal(workflow.authority.can_publish,false)
  assert.equal(workflow.authority.can_generate_paid_media,false)
  assert.ok(workflow.stages.some(step=>step.id==='independent_claim_review'))
  assert.ok(workflow.stages.some(step=>step.id==='atlas_editorial_candidate'))
  assert.ok(workflow.stages.some(step=>step.id==='human_exception_only'))
  assert.equal(workflow.executive_identity.requires_new_nova_project_agent,false)
  assert.equal(workflow.executive_identity.canonical_name,'Atlas')
})

test('malformed reviewer and source payloads fail closed without throwing',()=>{
  assert.equal(run(material,sources,{...assessment,framingReason:123}).outcome,'requires_review')
  assert.equal(run(material,sources,{...assessment,findings:[
    {...assessment.findings[0],explanation:123},...assessment.findings.slice(1),
  ]}).outcome,'requires_review')
  assert.equal(run(material,sources,{...assessment,findings:[
    {...assessment.findings[0],evidence:[null]},...assessment.findings.slice(1),
  ]}).outcome,'requires_review')
  assert.equal(run(material,[{...sources[0],publisherGroup:undefined},sources[1]]).outcome,'requires_review')
  assert.equal(run({...material,captions:null}).outcome,'requires_review')
})

test('known high-impact topics require human review even if riskTier is forged standard',()=>{
  for (const dangerous of [
    'The Home Office is using AI to make asylum decisions.',
    'A company is facing a government investigation.',
    'Researchers claim a new cancer diagnosis system works.',
    'An AI election prediction is supposedly confirmed.',
    'The provider reported a major data breach.',
    'AI används för beslut i asylärenden.',
    'Ett riksdagsval avgörs nu av automatiserade modeller.',
    'Forskare hävdar att ett nytt läkemedel botar cancer.',
    'Regeringen möter en myndighetsutredning om dataintrång.',
    'Åtal väcks efter en stor personuppgiftsincident.',
  ]) {
    const m={...material,hook:dangerous,riskTier:'standard'}
    const revised={...assessment,contentSha256:contentDigest(m),
      findings:materialUnits(m).map(unit=>({
        unitId:unit.id,exactText:unit.text,verdict:'supported',
        explanation:'Test of the policy, not of real factual verification.',
        evidence:sources.map(source=>({sourceId:source.id,exactQuote:
          'Researchers can access the published documentation now.'})),
      })),
    }
    assert.equal(run(m,sources,revised).outcome,'requires_review')
  }
})
