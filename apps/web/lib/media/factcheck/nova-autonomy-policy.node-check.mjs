import {test} from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'

registerHooks({resolve(specifier,context,next){
  if (['./contract','./source-collector','./independent-review','./reviewer-preview']
    .includes(specifier) && context.parentURL?.includes('/factcheck/')){
    return next(specifier+'.ts',context)
  }
  if (specifier==='../script-writer-provenance' &&
    context.parentURL?.includes('/factcheck/')){
    return next(specifier+'.ts',context)
  }
  return next(specifier,context)
}})
const {planNovaEditorialReview}=await import('./nova-autonomy-policy.ts')
const {evaluateIndependentReview}=await import('./independent-review.ts')
const {stampedScriptOutput}=await import('../script-writer-provenance.ts')
const now=Date.parse('2026-10-28T16:00:00Z')
const projectId='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const scriptId='b9271d5b-5254-4ad8-a36c-ce7c66e9c63e'
const material={
  projectId,scriptId,revisionId:'v1',
  hook:'Researchers published a new public API.',
  script:'Developers can read the official documentation today.',
  socialCaption:'The public documentation was made available today.',
  captions:['Researchers published a new public API.'],
  cta:'Read the published technical documentation.',
  thumbnailText:'New public research API',
  riskTier:'standard',
}
const author={
  hook:material.hook,script:material.script, captions:[...material.captions],
  hashtags:['#AI'],cta:material.cta,tone:'educational',
  estimated_duration:'~20 seconds',difficulty:'intermediate',
}
const writer={
  id:scriptId,project_id:projectId,version:1,...author,
  raw_output:stampedScriptOutput(author,{
    type:'message',id:'msg_nova_writer',model:'claude-sonnet-4-6',
  },1),
}
const project={id:projectId,slug:'ai-media-automation',execution_paused:false}
const evidenceText=[
  material.hook,material.script,material.socialCaption,
  ...material.captions,material.cta,material.thumbnailText,
  'The report contains caveats about scope and planned features.',
].join(' ')
const source0={
  id:'source-0',url:'https://www.gov.uk/government/news/technical-api',
  kind:'primary',publisherGroup:'uk-government',
  retrievedAt:new Date(now).toISOString(),
  text:evidenceText+' Government release is the primary record.',
}
const source1={
  id:'source-1',url:'https://www.reuters.com/world/technology-api',
  kind:'independent_reporting',publisherGroup:'reuters',
  retrievedAt:new Date(now).toISOString(),
  text:evidenceText+' Reuters checked the announcement separately.',
}
const sources=[source0,source1]
async function reviewed(mat=material,src=sources,change=undefined){
  return evaluateIndependentReview(mat,src,mat.projectId,'claude-sonnet-4-6',now,
    async prompt=>{
      const args=JSON.parse(prompt.user)
      const answer={
        framing:'faithful_to_evidence',
        framingReason:'The material accurately describes this public technical release.',
        findings:args.requiredUnits.map(unit=>({
          unitId:unit.id,exactText:unit.text,verdict:'supported',
          explanation:'Both independent source texts support the original statement.',
          evidence:src.map(s=>({sourceId:s.id,exactQuote:unit.text})),
        })),
      }
      change?.(answer)
      return JSON.stringify(answer)
    })
}
const base=(review,override={})=>({
  previewMode:'offline_only',featureEnabled:true,
  project,script:writer,material,sources,review,
  nowMs:now,sourceAttempts:0,reviewAttempts:0,rewrites:0,...override,
})
function requireSafe(result){
  assert.equal(result.canPublish,false)
  assert.equal(result.canSpend,false)
  assert.equal(result.canRender,false)
  assert.equal(result.canSchedule,false)
  assert.equal(result.agent,'nova')
}
test('Nova independently accepts a low-risk, corroborated news draft without asking owner',async()=>{
  const result=planNovaEditorialReview(base(await reviewed()))
  assert.equal(result.action,'automatic_editorial_candidate')
  assert.equal(result.reason,'ordinary_story_independently_supported')
  assert.equal(result.question,null)
  requireSafe(result)
})
test('Nova escalates sensitive, verified reports with concise evidence links',async()=>{
  const mat={...material,hook:'New asylum evidence received a technical update.',riskTier:'sensitive'}
  const src=sources.map(s=>({...s,text:s.text+' '+mat.hook}))
  const r=await reviewed(mat,src)
  const result=planNovaEditorialReview(base(r,{
    material:mat,sources:src,script:{...writer,hook:mat.hook,
      raw_output:stampedScriptOutput({...author,hook:mat.hook},{
        type:'message',id:'msg_nova_sensitive',model:'claude-sonnet-4-6',
      },1),
    },
  }))
  assert.equal(result.action,'ask_owner')
  assert.ok(result.question?.sourceUrls.length===2)
  assert.match(result.question?.context??'',/asylum/)
  assert.equal(result.question?.options.length,2)
  requireSafe(result)
})
test('Nova rewrites a contradicting claim once, then skips instead of publishing',async()=>{
  const r=await reviewed(material,sources,answer=>{
    answer.findings[0].verdict='contradicted'
    answer.findings[0].evidence=[]
  })
  const first=planNovaEditorialReview(base(r))
  assert.equal(first.action,'rewrite_and_recheck')
  assert.equal(first.question,null)
  const after=planNovaEditorialReview(base(r,{rewrites:1}))
  assert.equal(after.action,'skip_story')
  requireSafe(after)
})
test('without primary evidence Nova researches more, then skips routine news',async()=>{
  const noPrimary=[
    {...source0,id:'source-0',url:'https://www.bbc.com/news/api-announcement',
      publisherGroup:'bbc',kind:'independent_reporting'},
    source1,
  ]
  const r=await reviewed(material,sources)
  assert.equal(planNovaEditorialReview(base(r,{sources:noPrimary})).action,
    'collect_more_evidence')
  const after=planNovaEditorialReview(base(r,{
    sources:noPrimary,sourceAttempts:2,
  }))
  assert.equal(after.action,'skip_story')
  assert.equal(after.question,null)
  requireSafe(after)
})
test('missing independent source group cannot masquerade as corroboration',async()=>{
  const r=await reviewed()
  const syndicated=[source0,{...source1,publisherGroup:'uk-government'}]
  assert.equal(planNovaEditorialReview(base(r,{sources:syndicated})).action,
    'collect_more_evidence')
})
test('Nova never accepts AI-declared writer model without server provider receipt',async()=>{
  const r=await reviewed()
  for(const raw_output of [null,{writer_model:'claude-sonnet-4-6'},
    stampedScriptOutput(author,null,1)]){
    const output=planNovaEditorialReview(base(r,{
      script:{...writer,raw_output},
    }))
    assert.equal(output.action,'hold_system')
    requireSafe(output)
  }
})
test('OpenAI fallback must not also be fact-checked by OpenAI alone',async()=>{
  const r=await reviewed()
  const alt=stampedScriptOutput(author,{
    writer_transport:'governed_openai_reserve_v1',
    model:'gpt-5.4-mini',
  },1)
  const result=planNovaEditorialReview(base(r,{
    script:{...writer,raw_output:alt},
  }))
  assert.equal(result.action,'select_independent_reviewer')
  assert.equal(result.reason,'different_provider_required')
})
test('Nova holds if manuscript version, public caption or project is different',async()=>{
  const r=await reviewed()
  for(const change of [
    {script:{...writer,version:2}},
    {material:{...material,socialCaption:'An unverified claim added later.'}},
    {material:{...material,thumbnailText:'Shocking new discovery'}},
    {project:{...project,slug:'familje-stunden'}},
    {project:{...project,execution_paused:true}},
    {project:{...project,id:'c3d12345-a777-4777-8777-777777777777'}},
  ]){
    const output=planNovaEditorialReview(base(r,change))
    assert.equal(output.action,'hold_system')
    requireSafe(output)
  }
})
test('source body changed after review invalidates evidence set',async()=>{
  const r=await reviewed()
  const newSources=[{...source0,text:source0.text+' Another new claim.'},source1]
  const result=planNovaEditorialReview(base(r,{sources:newSources}))
  assert.equal(result.action,'hold_system')
  assert.equal(result.reason,'independent_review_missing_or_unbound')
})
test('forged reviewer outcome never yields automatic editorial candidate',async()=>{
  const r=await reviewed()
  const changed={...r,decision:{...r.decision,outcome:'rejected'}}
  const result=planNovaEditorialReview(base(changed))
  assert.equal(result.action,'hold_system')
  assert.equal(result.reason,'review_decision_not_consistent_with_evidence')
})
test('unsupported draft is researched again, not escalated as fake certainty',async()=>{
  const r=await reviewed(material,sources,answer=>{
    answer.findings[0].verdict='unsupported'
    answer.findings[0].evidence=[]
  })
  const first=planNovaEditorialReview(base(r))
  assert.equal(first.action,'collect_more_evidence')
  const repeat=planNovaEditorialReview(base(r,{sourceAttempts:2}))
  assert.equal(repeat.action,'skip_story')
  requireSafe(repeat)
})
test('sensitive unverified claim cannot be approved even if owner says yes',async()=>{
  const mat={...material,hook:'A newly announced cancer medicine may cure everyone.',
    riskTier:'standard'}
  const src=sources.map(s=>({...s,text:s.text+' '+mat.hook}))
  const r=await reviewed(mat,src,answer=>{
    answer.findings[0].verdict='contradicted'
    answer.findings[0].evidence=[]
  })
  const output=planNovaEditorialReview(base(r,{
    material:mat,sources:src,
    script:{...writer,hook:mat.hook,
      raw_output:stampedScriptOutput({...author,hook:mat.hook},{
        type:'message',id:'msg_risky_story',model:'claude-sonnet-4-6',
      },1),
    },
  }))
  assert.equal(output.action,'rewrite_and_recheck')
  assert.equal(output.question,null)
})
test('not even a clean Nova plan grants social publishing or media spending',async()=>{
  const result=planNovaEditorialReview(base(await reviewed()))
  assert.equal(result.action,'automatic_editorial_candidate')
  requireSafe(result)
  assert.ok(!Object.keys(result).some(k=>['approvedByOwner','publishedAt'].includes(k)))
})
test('disabled Nova planner is always inert, even with strong evidence',async()=>{
  const result=planNovaEditorialReview(base(await reviewed(),{
    featureEnabled:false,
  }))
  assert.equal(result.action,'hold_system')
  assert.equal(result.reason,'nova_autonomy_not_enabled')
  requireSafe(result)
})

test('Nova runs missing independent review autonomously, then stops after bounded attempts',async()=>{
  const first=planNovaEditorialReview(base(null))
  assert.equal(first.action,'request_independent_review')
  assert.equal(first.question,null)
  requireSafe(first)
  const last=planNovaEditorialReview(base(null,{reviewAttempts:2}))
  assert.equal(last.action,'skip_story')
  assert.equal(last.question,null)
})
test('an unavailable second provider is skipped without mislabeling its output',async()=>{
  const r=await reviewed()
  const gptStamp=stampedScriptOutput(author,{
    writer_transport:'governed_openai_reserve_v1',model:'gpt-5.4-mini',
  },1)
  const last=planNovaEditorialReview(base(r,{
    script:{...writer,raw_output:gptStamp},reviewAttempts:2,
  }))
  assert.equal(last.action,'skip_story')
  assert.equal(last.canPublish,false)
})

test('Nova policy is a design-only recommender, not a live publishing route',async()=>{
  const {readFileSync,readdirSync}=await import('node:fs')
  const {join}=await import('node:path')
  const code=readFileSync('apps/web/lib/media/factcheck/nova-autonomy-policy.ts','utf8')
  assert.match(code,/canSpend:false/)
  assert.match(code,/canRender:false/)
  assert.match(code,/canSchedule:false/)
  assert.match(code,/canPublish:false/)
  assert.doesNotMatch(code,/openAIChatCompletion\(|\.insert\(|createAdminClient\(|\bfetch\(/)
  let count=0
  const visit=dir=>{
    for(const e of readdirSync(dir,{withFileTypes:true})){
      const path=join(dir,e.name)
      if(e.isDirectory())visit(path)
      else if(e.isFile()&&(path.endsWith('.ts')||path.endsWith('.tsx'))){
        count++
        const text=readFileSync(path,'utf8')
        assert.ok(!text.includes('planNovaEditorialReview'),
          'unexpected Nova autonomy activation in '+path)
      }
    }
  }
  visit('apps/web/app/api/media')
  assert.ok(count>20,'expected real media API routes')
})
