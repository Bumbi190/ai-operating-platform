import {test} from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
registerHooks({
  resolve(specifier,ctx,next){
    if (['./contract','./source-collector'].includes(specifier) &&
        ctx.parentURL?.includes('/factcheck/'))
      return next(specifier+'.ts',ctx)
    if (specifier==='../script-writer-provenance' &&
        ctx.parentURL?.includes('/factcheck/'))
      return next(specifier+'.ts',ctx)
    return next(specifier,ctx)
  },
})
const {evaluateFactCheckEditorialPreview}=await import('./editorial-admission.ts')
const {contentDigest}=await import('./contract.ts')
const {stampedScriptOutput}=await import('../script-writer-provenance.ts')
const NOW=Date.parse('2026-10-28T10:00:00Z')
const iso=min=>new Date(NOW-min*60*1000).toISOString()
const projectId='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const owner='66666666-6666-4666-8666-666666666666'
const scriptId='b9271d5b-5254-4ad8-a36c-ce7c66e9c63e'
const reportId='77777777-7777-4777-8777-777777777777'
const decisionId='88888888-8888-4888-8888-888888888888'
const postId='99999999-9999-4999-8999-999999999999'
const revisionId='12121212-1212-4212-8212-121212121212'
const socialDecisionId='23232323-2323-4232-8232-232323232323'
const videoId='34343434-3434-4434-8434-343434343434'
const reportHash='a'.repeat(64)
const socialHash='b'.repeat(64)
const sourceHash='c'.repeat(64)
const material={
  projectId,scriptId,revisionId:'v1',
  hook:'Researchers released a new public research API.',
  script:'The technical documentation was published today.',
  captions:['Official research API'],
  socialCaption:'A public research API is available today.',
  cta:'Read the official guide.',
  thumbnailText:'Research API',
  riskTier:'standard',
}
const author={
  hook:material.hook,script:material.script,
  captions:[...material.captions],hashtags:['#AI'],
  cta:material.cta,tone:'educational',estimated_duration:'~22 seconds',
  difficulty:'intermediate',
}
const raw=stampedScriptOutput(author,{
  type:'message',id:'msg_editorial_preview',model:'claude-sonnet-4-6',
},1)
const project={
  id:projectId,slug:'ai-media-automation',owner_id:owner,
  execution_paused:false,
}
const script={
  ...author,id:scriptId,project_id:projectId,version:1,raw_output:raw,
}
const source_receipts=[
 {sourceId:'source-0',publisherGroup:'bbc',
   url:'https://www.bbc.com/news/research-api',textSha256:'d'.repeat(64)},
 {sourceId:'source-1',publisherGroup:'reuters',
   url:'https://www.reuters.com/world/research-api',textSha256:'e'.repeat(64)},
]
const evidence=[
 {sourceId:'source-0',exactQuote:'Researchers released a public research API.'},
 {sourceId:'source-1',exactQuote:'Researchers released a public research API.'},
]
const findings=[
 {unitId:'hook:0',verdict:'supported',evidence},
 {unitId:'script:0',verdict:'supported',evidence},
]
const report={
  id:reportId,project_id:projectId,script_id:scriptId,
  script_version:1,revision_id:'v1',
  content_sha256:contentDigest(material),source_set_sha256:sourceHash,
  reviewer_model:'gpt-5.4-mini',writer_model:'claude-sonnet-4-6',
  risk_tier:'standard',outcome:'ready_for_editor',
  framing:'faithful_to_evidence',reasons:[],
  reviewed_at:iso(30),recorded_at:iso(25),
  manuscript_snapshot:{...material},source_receipts,findings,
}
const ownerDecision={
  id:decisionId,project_id:projectId,report_id:reportId,script_id:scriptId,
  script_version:1,revision_id:'v1',content_sha256:report.content_sha256,
  source_set_sha256:sourceHash,decision:'approve',
  notes:'I read the original evidence and approved the exact script version.',
  sensitive_risk_acknowledged:false,decided_by:owner,decided_at:iso(20),
}
const social={
  post:{id:postId,project_id:projectId,current_revision_id:revisionId},
  revision:{
    id:revisionId,project_id:projectId,post_id:postId,
    sha256:socialHash,
    draft:{title:material.hook,text:material.socialCaption,
      channel:'instagram',format:'video',mediaIds:[videoId]},
  },
  decision:{
    id:socialDecisionId,project_id:projectId,post_id:postId,
    revision_id:revisionId,sha256:socialHash,decision:'approve',
    decided_by:owner,decided_at:iso(10),
  },
  evidence:{
    project_id:projectId,post_id:postId,revision_id:revisionId,
    revision_sha256:socialHash,script_id:scriptId,
    channel:'instagram',video_asset_id:videoId,
    snapshot_sha256:reportHash,reasons:[],
  },
}
const ctx=(override={})=>({
  mode:'offline_preview_only',featureEnabled:true,
  project,sessionUserId:owner,script,material,report,
  ownerDecision,nowMs:NOW,...override,
})
const hold=x=>{assert.equal(x.phase,'hold');assert.equal(x.canPublish,false)}

test('disabled gate remains inert, cannot spend, render or publish',()=>{
  const result=evaluateFactCheckEditorialPreview(ctx({featureEnabled:false}))
  hold(result)
  assert.deepEqual(result.blockers,['factcheck_editorial_not_enabled'])
  assert.equal(result.canSpend,false)
  assert.equal(result.canRender,false)
})
test('exact fact-checked script and human-owner approval prepare only creative review',()=>{
  const result=evaluateFactCheckEditorialPreview(ctx())
  assert.equal(result.phase,'ready_for_creative_review')
  assert.equal(result.blockers.length,0)
  assert.equal(result.canSpend,false)
  assert.equal(result.canRender,false)
  assert.equal(result.canPublish,false)
})
test('approval from another user or project is rejected',()=>{
  for (const override of [
    {sessionUserId:scriptId},
    {project:{...project,slug:'familje-stunden'}},
    {project:{...project,execution_paused:true}},
    {ownerDecision:{...ownerDecision,decided_by:scriptId}},
    {ownerDecision:{...ownerDecision,project_id:scriptId}},
    {report:{...report,project_id:scriptId}},
  ]) hold(evaluateFactCheckEditorialPreview(ctx(override)))
})
test('a passed news story with no explicit human decision cannot start media',()=>{
  for (const candidateDecision of [null,
    {...ownerDecision,decision:'reject'},
    {...ownerDecision,report_id:scriptId},
    {...ownerDecision,content_sha256:'f'.repeat(64)},
    {...ownerDecision,source_set_sha256:'f'.repeat(64)},
  ]) hold(evaluateFactCheckEditorialPreview(ctx({ownerDecision:candidateDecision})))
})
test('manus revision, changed hook, captions and CTA are all fenced',()=>{
  for(const override of [
    {script:{...script,version:2}},
    {script:{...script,hook:'New misleading headline'}},
    {script:{...script,captions:['Different caption']}},
    {script:{...script,cta:'An unverified claim'}},
    {material:{...material,thumbnailText:'Sensational headline'}},
    {material:{...material,socialCaption:'Changed social post'}},
    {report:{...report,revision_id:'v2'}},
    {report:{...report,content_sha256:'0'.repeat(64)}},
  ]) hold(evaluateFactCheckEditorialPreview(ctx(override)))
})
test('stale or unknown original model cannot validate independence',()=>{
  for(const raw_output of [
    null,{writer_model:'claude-sonnet-4-6'},
    stampedScriptOutput(author,null,1),
    stampedScriptOutput(author,{
      writer_transport:'governed_openai_reserve_v1',model:'gpt-5.4-mini',
    },1),
  ]) hold(evaluateFactCheckEditorialPreview(ctx({
    script:{...script,raw_output},
  })))
})
test('outdated review or approval and wrong chronology are rejected',()=>{
  for(const override of [
    {report:{...report,reviewed_at:iso(4000)}},
    {report:{...report,recorded_at:iso(40)}},
    {ownerDecision:{...ownerDecision,decided_at:iso(200)}},
    {ownerDecision:{...ownerDecision,decided_at:iso(-10)}},
    {nowMs:Number.NaN},
  ]) hold(evaluateFactCheckEditorialPreview(ctx(override)))
})
test('unsupported, contradicted or maliciously polished HOLD can NEVER pass',()=>{
  for(const reportOverride of [
    {outcome:'rejected'},
    {outcome:'requires_review',reasons:['claim_unverified'],framing:'unverified'},
    {outcome:'requires_review',reasons:['missing_sources']},
    {outcome:'requires_review',reasons:['sensitive_or_unclassified','claim_unverified']},
    {outcome:'ready_for_editor',framing:'misleading'},
    {outcome:'ready_for_editor',reasons:['uncertain']},
    {source_set_sha256:null},
    {source_receipts:[]},
    {findings:[]},
  ]) hold(evaluateFactCheckEditorialPreview(ctx({
    report:{...report,...reportOverride},
  })))
})
test('sensitive-risk-only HOLD requires an explicit, substantial owner acknowledgement',()=>{
  const sensitiveMaterial={...material,riskTier:'sensitive'}
  const sensitiveReport={
    ...report,risk_tier:'sensitive',outcome:'requires_review',
    reasons:['sensitive_or_unclassified'],content_sha256:contentDigest(sensitiveMaterial),
    manuscript_snapshot:sensitiveMaterial,
  }
  const sensitiveDecision={
    ...ownerDecision,content_sha256:sensitiveReport.content_sha256,
    notes:'I personally checked all independent evidence and accept the heightened safety review responsibilities.',
  }
  const base={material:sensitiveMaterial,report:sensitiveReport,
    ownerDecision:sensitiveDecision}
  hold(evaluateFactCheckEditorialPreview(ctx(base)))
  assert.equal(evaluateFactCheckEditorialPreview(ctx({...base,ownerDecision:{
    ...sensitiveDecision,sensitive_risk_acknowledged:true,
  }})).phase,'ready_for_creative_review')
  hold(evaluateFactCheckEditorialPreview(ctx({...base,report:{
    ...sensitiveReport,findings:[...findings,{unitId:'other',verdict:'contradicted'}],
  },ownerDecision:{...sensitiveDecision,sensitive_risk_acknowledged:true}})))
})
test('report snapshot cannot be silently replaced with other wording',()=>{
  hold(evaluateFactCheckEditorialPreview(ctx({report:{
    ...report,manuscript_snapshot:{...material,hook:'Fake headline'},
  }})))
})
test('even a complete editorial decision has no publication authority',()=>{
  const result=evaluateFactCheckEditorialPreview(ctx({finalSocial:social}))
  assert.equal(result.phase,'ready_for_final_social_review')
  assert.equal(result.canPublish,false)
  assert.equal(result.canSpend,false)
  assert.equal(result.canRender,false)
})
test('no final social approval or stale revision can claim readiness',()=>{
  for(const finalSocial of [
    {...social,decision:{...social.decision,decision:'reject'}},
    {...social,post:{...social.post,current_revision_id:reportId}},
    {...social,revision:{...social.revision,sha256:'f'.repeat(64)}},
    {...social,decision:{...social.decision,decided_by:scriptId}},
    {...social,decision:{...social.decision,decided_at:iso(60)}},
    {...social,revision:{...social.revision,draft:{
      ...social.revision.draft,text:'A completely different social claim',
    }}},
  ]) hold(evaluateFactCheckEditorialPreview(ctx({finalSocial})))
})
test('modified video asset or receipt requires new final review',()=>{
  for(const evidence of [
    {...social.evidence,video_asset_id:reportId},
    {...social.evidence,revision_sha256:'1'.repeat(64)},
    {...social.evidence,script_id:reportId},
    {...social.evidence,channel:'youtube'},
    {...social.evidence,snapshot_sha256:'not-hash'},
    {...social.evidence,reasons:['media_changed']},
  ]) hold(evaluateFactCheckEditorialPreview(ctx({
    finalSocial:{...social,evidence},
  })))
})
test('changed social thumbnail or version cannot reuse a former FactCheck hash',()=>{
  for(const materialOverride of [
    {thumbnailText:'Clickbait: unverified AI revelation'},
    {revisionId:'v2'},
  ]) hold(evaluateFactCheckEditorialPreview(ctx({
    material:{...material,...materialOverride},
    finalSocial:social,
  })))
})

test('citation badges do not substitute for independent publisher evidence',()=>{
  const invalid=[
    {source_receipts:[source_receipts[0],{...source_receipts[1],
      publisherGroup:'bbc'}]},
    {source_receipts:[source_receipts[0],{...source_receipts[1],
      url:'https://reuters.com.evil.test/world/research-api'}]},
    {source_receipts:[source_receipts[0],{...source_receipts[1],
      textSha256:source_receipts[0].textSha256}]},
    {findings:[{...findings[0],evidence:[evidence[0]]},findings[1]]},
    {findings:[{...findings[0],verdict:'misleading'},findings[1]]},
    {findings:[{...findings[0],evidence:[
      evidence[0],{sourceId:'source-0',exactQuote:'Another quote from the same group.'},
    ]},findings[1]]},
  ]
  for(const variant of invalid)hold(evaluateFactCheckEditorialPreview(ctx({
    report:{...report,...variant},
  })))
})
test('a forged standard classification cannot bypass sensitive-topic escalation',()=>{
  const sensitiveText='A government investigation into asylum cases is underway.'
  const forged={...material,hook:sensitiveText,riskTier:'standard'}
  const forgedReport={
    ...report,content_sha256:contentDigest(forged),
    manuscript_snapshot:forged,
  }
  const changedAuthor={...author,hook:sensitiveText}
  const scriptWithStamp={...script,...changedAuthor,
    raw_output:stampedScriptOutput(changedAuthor,{
      type:'message',id:'msg_sensitive',model:'claude-sonnet-4-6',
    },1),
  }
  const ownerDecisionForged={...ownerDecision,
    content_sha256:forgedReport.content_sha256}
  hold(evaluateFactCheckEditorialPreview(ctx({
    material:forged,report:forgedReport,script:scriptWithStamp,
    ownerDecision:ownerDecisionForged,
  })))
})

test('the new editorial rehearsal never enables paid media or imports live routes',async()=>{
  const {readFileSync,readdirSync}=await import('node:fs')
  const {join}=await import('node:path')
  const policy=readFileSync('apps/web/lib/media/factcheck/editorial-admission.ts','utf8')
  assert.match(policy,/canSpend:false/)
  assert.match(policy,/canRender:false/)
  assert.match(policy,/canPublish:false/)
  assert.doesNotMatch(policy,/new OpenAI\(|openAIChatCompletion\(|createAdminClient\(|\.insert\(|fetch\(/)
  const roots=['apps/web/app/api/media']
  let inspected=0
  const visit=dir=>{
    for(const entry of readdirSync(dir,{withFileTypes:true})){
      const path=join(dir,entry.name)
      if(entry.isDirectory())visit(path)
      else if(entry.isFile() && (path.endsWith('.ts')||path.endsWith('.tsx'))){
        inspected++
        const source=readFileSync(path,'utf8')
        assert.equal(
          source.includes('evaluateFactCheckEditorialPreview') ||
          source.includes('factcheck/editorial-admission') ||
          source.includes('media_factcheck_editorial_decisions'),
          false,'unexpected live approval wiring in '+path)
      }
    }
  }
  roots.forEach(visit)
  assert.ok(inspected>20,'expected actual media API files')
})
