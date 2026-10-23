import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {auditMediaNewsCallees,buildMediaNewsCalleeCatalogQuery,
 mediaNewsCalleeNames,reviewedMediaNewsPins} from './calendar-media-news-callees-audit.mjs'

const source=readFileSync(new URL('../supabase/migrations/20261018083917_media_news_review_evidence.sql',import.meta.url),'utf8')
const roles=['anon','authenticated','service_role','social_schedule_rpc_only_fixture',
 'social_schedule_broker_intent_fixture','social_schedule_broker_review_fixture',
 'social_schedule_operator_review_fixture']
const strictName='media_news_canonical_json'
const immutable=new Set([strictName,'media_news_review_caption'])
function migrationDefinition(name){
 const start=source.indexOf('create or replace function public.'+name+'(')
 assert.ok(start>0,'missing pinned media source '+name)
 const open=source.indexOf('$fn$',start)
 const close=source.indexOf('$fn$',open+4)
 assert.ok(close>open,'unterminated media function SQL '+name)
 return source.slice(start,close+4)
}
function snapshot(){
 const functions=mediaNewsCalleeNames.map(name=>({
  name,signature:name+(name==='media_news_review_caption'?
   '(media_scripts)':name===strictName?'(jsonb)':'(uuid,jsonb)'),
  owner:'supabase_admin',definer:false,
  language:name==='media_news_review_caption'?'sql':'plpgsql',
  volatility:immutable.has(name)?'i':'v',
  configuration:['search_path=""'],
  body:migrationDefinition(name),
  strict:name===strictName,publicExecute:false,
  grants:Object.fromEntries(roles.map(role=>[role,role==='service_role'])),
 }))
 const result={functions,meta:{fixtureOnly:true}}
 const current=auditMediaNewsCallees(result)
 const pins={
  signatures:Object.fromEntries(current.functions.map(f=>[f.name,f.signature])),
  bodies:Object.fromEntries(current.functions.map(f=>[f.name,f.sha256])),
  calls:Object.fromEntries(current.functions.map(f=>[f.name,f.calls])),
  references:Object.fromEntries(current.functions.map(f=>[f.name,f.references])),
  grants:Object.fromEntries(current.functions.map(f=>[f.name,structuredClone(f.grants)])),
 }
 return {result,pins}
}
test('all three existing migration functions are present and pass the canonicalization/provenance gate',()=>{
 const {result,pins}=snapshot()
 const reviewed=auditMediaNewsCallees(result,{pins,requirePins:true})
 assert.equal(reviewed.reviewedFunctions,3)
 assert.equal(reviewed.functions.filter(f=>f.invoker).length,3)
 assert.deepEqual(reviewed.functions.find(f=>f.name==='media_news_snapshot_requirements').calls,
  ['media_news_canonical_json','media_news_review_caption'])
 assert.ok(reviewed.functions.every(f=>f.grants.anon===false&&
  f.grants.authenticated===false&&f.grants.social_schedule_rpc_only_fixture===false))
})
test('missing, extra and signature/owner/definer/strictness changes fail closed',()=>{
 const variants=[
  v=>{v.functions.pop()},
  v=>{v.functions.push({...v.functions[0],name:'extra_media_reader'})},
  v=>{v.functions[0].signature='media_news_canonical_json(text)'},
  v=>{v.functions[0].owner='authenticated'},
  v=>{v.functions[0].definer=true},
  v=>{v.functions[0].strict=false},
  v=>{v.functions[1].strict=true},
  v=>{v.functions[0].language='sql'},
  v=>{v.functions[1].volatility='v'},
  v=>{v.functions[0].configuration=['search_path=public']},
 ]
 for(const mutate of variants){
  const {result,pins}=snapshot();mutate(result)
  assert.throws(()=>auditMediaNewsCallees(result,{pins,requirePins:true}))
 }
})
test('PUBLIC, anon, session, worker, broker and accidental service grant drift fail',()=>{
 const variants=[
  v=>{v.functions[0].publicExecute=true},
  v=>{v.functions[1].grants.anon=true},
  v=>{v.functions[1].grants.authenticated=true},
  v=>{v.functions[1].grants.social_schedule_rpc_only_fixture=true},
  v=>{v.functions[1].grants.social_schedule_broker_intent_fixture=true},
  v=>{v.functions[1].grants.service_role=false},
  v=>{v.functions[2].grants.social_schedule_operator_review_fixture=true},
 ]
 for(const mutate of variants){
  const {result,pins}=snapshot();mutate(result)
  assert.throws(()=>auditMediaNewsCallees(result,{pins,requirePins:true}))
 }
})
test('removed deterministic JSON key/array order, caption data and video provenance proof fail',()=>{
 const cases=[
  ['media_news_canonical_json','collate "C"'],
  ['media_news_canonical_json','order by ord'],
  ['media_news_review_caption','jsonb_array_elements_text'],
  ['media_news_review_caption','hashtags'],
  ['media_news_snapshot_requirements','the-prompt-review-admission-v1'],
  ['media_news_snapshot_requirements','media-assets-private'],
  ['media_news_snapshot_requirements','source_published_at'],
  ['media_news_snapshot_requirements','48 hours'],
  ['media_news_snapshot_requirements','cost_events'],
  ['media_news_snapshot_requirements','social_launch_plan_decisions'],
  ['media_news_snapshot_requirements','social_account_bindings'],
  ['media_news_snapshot_requirements','news_project_stopped'],
 ]
 for(const [name,needle] of cases){
  const {result,pins}=snapshot()
  const f=result.functions.find(x=>x.name===name)
  assert.ok(f.body.toLowerCase().includes(needle.toLowerCase()),name+' '+needle)
  f.body=f.body.replace(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'removed')
  assert.throws(()=>auditMediaNewsCallees(result,{pins,requirePins:true}),name+' '+needle)
 }
})
test('added qualified SQL calls, token reads, dynamic SQL and signature/body drift are refused',()=>{
 const extra=[
  ' PERFORM public.extra_unreviewed_writer();',
  ' SELECT * FROM public.platform_tokens;',
  ' EXECUTE untrusted_sql;',
  ' PERFORM set_config(\'role\',\'service_role\',false);',
  ' SELECT 42;',
 ]
 for(const snippet of extra){
  const {result,pins}=snapshot()
  result.functions[2].body+=snippet
  assert.throws(()=>auditMediaNewsCallees(result,{pins,requirePins:true}))
 }
 const {result,pins}=snapshot()
 result.functions[0].body+=' /*comment drift*/'
 assert.throws(()=>auditMediaNewsCallees(result,{pins,requirePins:true}))
})
test('catalog query reads actual function owners, signatures, EXECUTE ACL, strictness and definitions without DDL',()=>{
 const q=buildMediaNewsCalleeCatalogQuery()
 for(const expected of [
  'pg_proc','pg_namespace','pg_language','pg_get_functiondef','aclexplode',
  'has_function_privilege','proisstrict','prosecdef','proconfig',
  'media_news_canonical_json','media_news_review_caption','media_news_snapshot_requirements'
 ])assert.ok(q.includes(expected),expected)
 assert.match(q,/^SELECT jsonb_build_object/)
 assert.doesNotMatch(q,/\b(?:create|alter|grant|revoke|insert|update|delete|drop)\s+(?:function|role|table)\b/i)
})
test('all three reviewed PostgreSQL function fingerprints and ACL inventories are permanently pinned',()=>{
 for(const name of ['signatures','bodies','calls','references','grants'])
  assert.deepEqual(Object.keys(reviewedMediaNewsPins[name]).sort(),
   [...mediaNewsCalleeNames].sort(),'incomplete '+name+' fingerprints')
 assert.ok(Object.values(reviewedMediaNewsPins.bodies)
  .every(x=>/^[0-9a-f]{64}$/.test(x)))
 assert.deepEqual(reviewedMediaNewsPins.calls.media_news_snapshot_requirements,
  ['media_news_canonical_json','media_news_review_caption'])
 assert.equal(reviewedMediaNewsPins.grants.media_news_snapshot_requirements.authenticated,false)
 assert.equal(reviewedMediaNewsPins.grants.media_news_snapshot_requirements.service_role,true)
})
