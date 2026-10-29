import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const mediaBase='apps/web/app/api/media/'
const file=s=>readFileSync(s,'utf8')
const checkTable=[
  {file:mediaBase+'cron/step1/route.ts',rw:true},
  {file:mediaBase+'cron/autonomous/route.ts',rw:true},
  {file:mediaBase+'pipeline/full/route.ts',rw:true},
  {file:mediaBase+'breaking/route.ts',rw:false},
  {file:mediaBase+'scripts/[id]/regenerate/route.ts',rw:false},
]
test('all provider-backed media script paths persist the server-stamped final response model',()=>{
 for(const entry of checkTable){
  const source=file(entry.file)
  assert.match(source,/import \{ stampedScriptOutput \} from '@\/lib\/media\/script-writer-provenance'/,entry.file)
  assert.match(source,/raw_output:\s*toJson\(stampedScriptOutput\(/,entry.file)
  assert.match(source,/\.messages\.create\(/,entry.file)
  if(entry.rw){
    assert.match(source,/let actualScriptWriterResponse = scriptRes/,entry.file)
    assert.match(source,/actualScriptWriterResponse = rewriteRes/,entry.file)
    assert.match(source,/stampedScriptOutput\(script, actualScriptWriterResponse, 1\)/,entry.file)
  }
 }
})
test('regenerate binds provenance to the new version and rejects simultaneous rewrites',()=>{
 const source=file(mediaBase+'scripts/[id]/regenerate/route.ts')
 assert.match(source,/stampedScriptOutput\(newScript, res, \(script\.version \?\? 1\) \+ 1\)/)
 assert.match(source,/\.eq\('project_id', projectId\)/)
 assert.match(source,/\.eq\('version', script\.version \?\? 1\)/)
})
test('workflow-imported JSON cannot self-assert a writer provider',()=>{
 const source=file(mediaBase+'scripts/from-run/route.ts')
 assert.match(source,/stampedScriptOutput\(parsed, null, 1\)/)
 assert.match(source,/status: 'pending_review'/)
})
test('manual text editing revokes provenance and all stale quality/render acceptance',()=>{
 const source=file(mediaBase+'scripts/[id]/route.ts')
 assert.match(source,/const editsPublicContent = body\.hook !== undefined \|\| body\.script !== undefined/)
 for(const [field,pattern] of [
   ['version',/updates\.version = \(existing\.version \?\? 1\) \+ 1/],
   ['writer_model',/writer_model: null/],
   ['writer_provenance',/writer_provenance: null/],
   ['writer_content_sha256',/writer_content_sha256: null/],
   ['quality_score',/updates\.quality_score = null/],
   ['status',/updates\.status = 'pending_review'/],
   ['voice_status',/updates\.voice_status = 'none'/],
   ['video_status',/updates\.video_status = 'none'/],
 ]){
   assert.match(source,pattern,field)
 }
 assert.match(source,/hook: body\.hook \?\? existing\.hook/)
 assert.match(source,/script: body\.script \?\? existing\.script/)
 assert.match(source,/\.eq\('version', existing\.version \?\? 1\)/)
})
test('governed OpenAI fallback is distinguishable and never attributed to requested model',()=>{
 const source=file('apps/web/lib/media/text-client.ts')
 assert.match(source,/model: typeof response\.model === 'string' \? response\.model : undefined/)
 assert.match(source,/writer_transport: 'governed_openai_reserve_v1'/)
 assert.doesNotMatch(source,/model:\s*input\.model,\s*writer_transport:/)
})
test('report writer revalidates stamped provenance against stored script fields, not the JSON label',()=>{
 const source=file('apps/web/lib/media/factcheck/report-writer.ts')
 assert.match(source,/verifiedStoredWriterModel/)
 assert.match(source,/\.select\('id,project_id,version,hook,script,captions,hashtags,cta,tone,estimated_duration,raw_output'\)/)
 assert.match(source,/factcheck_writer_provenance_absent_or_changed/)
 assert.doesNotMatch(source,/\(raw as Record<string,unknown>\)\.writer_model/)
})
test('new provenance helper is pure and never invokes billable models or DB actions',()=>{
 const source=file('apps/web/lib/media/script-writer-provenance.ts')
 assert.match(source,/provider_response_v1/)
 assert.match(source,/response\.type==='message'/)
 assert.match(source,/response\.writer_transport==='governed_openai_reserve_v1'/)
 assert.doesNotMatch(source,/new OpenAI\(|getAnthropic\(|openAIChatCompletion\(|createAdminClient\(|fetch\(/)
})
