import {test} from 'node:test'
import assert from 'node:assert/strict'
const {
  stampedScriptOutput,serverWriterIdentity,scriptAuthorDigest,
  verifiedStoredWriterModel,SCRIPT_WRITER_PROVENANCE,
}=await import('./script-writer-provenance.ts')

const script={
  hook:'The AI research API is now public.',
  script:'The official developer guide was published today.',
  captions:['API released','Docs available'],
  hashtags:['#AI','#Research'],
  cta:'Read the published documentation.',
  tone:'educational',estimated_duration:'~22 seconds',difficulty:'intermediate',
}
const anthropic={type:'message',id:'msg_456tLd',model:'claude-sonnet-4-6',
  content:[{type:'text',text:JSON.stringify(script)}]}
const openai={writer_transport:'governed_openai_reserve_v1',model:'gpt-5.4-mini',
  content:[{type:'text',text:JSON.stringify(script)}]}
test('trusted actual Anthropic provider response yields bound author provenance',()=>{
  const stamped=stampedScriptOutput(script,anthropic,1)
  assert.equal(stamped.writer_model,'claude-sonnet-4-6')
  assert.equal(stamped.writer_provider,'anthropic')
  assert.equal(stamped.writer_provenance,SCRIPT_WRITER_PROVENANCE)
  assert.equal(stamped.writer_version,1)
  assert.equal(stamped.writer_content_sha256,scriptAuthorDigest(1,script))
  assert.equal(verifiedStoredWriterModel(stamped,{...script,version:1}),'claude-sonnet-4-6')
})
test('a true server-tagged OpenAI fallback does not masquerade as Claude',()=>{
  const result=stampedScriptOutput(script,openai,1)
  assert.equal(result.writer_model,'gpt-5.4-mini')
  assert.equal(result.writer_provider,'openai')
  assert.equal(verifiedStoredWriterModel(result,{...script,version:1}),'gpt-5.4-mini')
})
test('requested model name alone is never provenance',()=>{
  const claimed={type:'message',model:'claude-sonnet-4-6'}
  const result=stampedScriptOutput(script,claimed,1)
  assert.equal(result.writer_model,null)
  assert.equal(verifiedStoredWriterModel(result,{...script,version:1}),null)
})
test('unknown, missing or forged provider response is refused',()=>{
  for(const fake of [
    null,{},'claude-sonnet-4-6',
    {type:'message',id:'fake',model:'claude-sonnet-4-6'},
    {type:'message',id:'msg_123',model:'gpt-5.4-mini'},
    {writer_transport:'governed_openai_reserve_v1',model:'claude-sonnet-4-6'},
    {writer_transport:'fake',model:'gpt-5.4-mini'},
    {type:'message',id:'msg_123',model:'unknown'},
  ]){
    const result=stampedScriptOutput(script,fake,1)
    assert.equal(result.writer_model,null,JSON.stringify(fake))
  }
})
test('malicious user/AI JSON fields can NEVER stamp their own origin',()=>{
  const malicious={...script,
    writer_model:'claude-sonnet-4-6',
    writer_provider:'anthropic',
    writer_provenance:SCRIPT_WRITER_PROVENANCE,
    writer_version:1,
    writer_content_sha256:'a'.repeat(64),
    approval:true,
    factcheck_status:'ready_for_editor',
  }
  const clean=stampedScriptOutput(malicious,null,1)
  assert.equal(clean.writer_model,null)
  assert.equal(clean.writer_provider,null)
  assert.equal(clean.writer_provenance,null)
  assert.equal(clean.writer_content_sha256,null)
  assert.equal('approval' in clean,false)
  assert.equal('factcheck_status' in clean,false)
  assert.deepEqual(Object.keys(clean).sort(),[
    'hook','script','captions','hashtags','cta','tone','estimated_duration','difficulty',
    'writer_model','writer_provider','writer_provenance','writer_version','writer_content_sha256',
  ].sort())
})
test('manual editing any authorable field invalidates the old attribution',()=>{
  const valid=stampedScriptOutput(script,anthropic,1)
  for(const change of [
    {hook:'A different headline'},
    {script:'The AI silently took control.'},
    {captions:['Changed caption']},
    {hashtags:['#Different']},
    {cta:'Click to read a fabricated claim'},
    {tone:'breaking'},
    {estimated_duration:'~25 seconds'},
    {version:2},
  ]){
    assert.equal(verifiedStoredWriterModel(valid,{...script,version:1,...change}),null,
      JSON.stringify(change))
  }
})
test('a rewritten but identical script needs a NEW provider record for new version',()=>{
  const old=stampedScriptOutput(script,anthropic,1)
  assert.equal(verifiedStoredWriterModel(old,{...script,version:2}),null)
  const newVersion=stampedScriptOutput(script,anthropic,2)
  assert.notEqual(old.writer_content_sha256,newVersion.writer_content_sha256)
  assert.equal(verifiedStoredWriterModel(newVersion,{...script,version:2}),'claude-sonnet-4-6')
})
test('server-stamp fields cannot be declared without a trustworthy provider result',()=>{
  const r=stampedScriptOutput(script,null,1)
  assert.equal(r.writer_model,null)
  const extra={...r,writer_model:'claude-sonnet-4-6',writer_provider:'anthropic',
    writer_provenance:SCRIPT_WRITER_PROVENANCE}
  assert.equal(verifiedStoredWriterModel(extra,{...script,version:1}),null)
})
test('malformed script arrays or strings cannot create a writer stamp',()=>{
  const cases=[
    {...script,captions:null},
    {...script,hashtags:'AI'},
    {...script,hook:''},
    {...script,cta:undefined},
    {...script,tone:undefined},
  ]
  for(const c of cases){
    assert.equal(serverWriterIdentity(anthropic,c,1),null)
  }
})
test('provider text is not the origin of the writer model',()=>{
  const forgedInText={...anthropic,
    content:[{type:'text',text:'{"writer_model":"gpt-5.4-mini"}'}]}
  const stamped=stampedScriptOutput(script,forgedInText,1)
  assert.equal(stamped.writer_model,'claude-sonnet-4-6')
})
