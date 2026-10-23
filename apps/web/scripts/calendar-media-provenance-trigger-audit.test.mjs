import test from 'node:test'
import assert from 'node:assert/strict'
import {auditMediaProvenanceTriggers,mediaProvenanceCatalogSql,mediaProvenancePins} from './calendar-media-provenance-trigger-audit.mjs'
const expected=[
 ['asset_provenance','asset_provenance_no_delete','asset_provenance_reject_orphan_delete()',11],
 ['asset_provenance','asset_provenance_no_update','asset_reject_mutation()',19],
 ['asset_provenance','media_news_review_reserved_provenance','media_news_review_guard_provenance()',7],
 ['media_news_review_evidence','media_news_review_insert_guard','media_news_review_guard_evidence()',7],
 ['media_news_review_evidence','media_news_review_no_mutation','media_news_review_reject_mutation()',27],
 ['media_news_review_evidence','media_news_review_no_truncate','media_news_review_reject_mutation()',34],
]
const bodies={
 'asset_provenance_reject_orphan_delete()':"CREATE FUNCTION x AS $$ BEGIN IF EXISTS(SELECT 1 FROM public.assets WHERE id=old.asset_id) THEN RAISE EXCEPTION 'append-only'; END IF; RETURN OLD; END $$;",
 'asset_reject_mutation()':"CREATE FUNCTION x AS $$ BEGIN RAISE EXCEPTION 'append-only' using errcode='restrict_violation'; SELECT tg_op; END $$;",
 'media_news_review_guard_provenance()':"CREATE FUNCTION x AS $$ BEGIN IF new.adapter_version='the-prompt-review-admission-v1' and current_user<>'service_role' THEN RAISE EXCEPTION 'REVIEW_ADMISSION_SERVER_ONLY'; END IF; RETURN NEW; END $$;",
 'media_news_review_guard_evidence()':"CREATE FUNCTION x AS $$ BEGIN SELECT * FROM public.social_content_decisions; SELECT * FROM public.social_content_revisions; SELECT public.media_news_canonical_json('{}'); SELECT public.media_news_snapshot_requirements('{}'); RAISE EXCEPTION 'SOCIAL_CONTENT_REVIEW_REQUIRED'; END $$;",
 'media_news_review_reject_mutation()':"CREATE FUNCTION x AS $$ BEGIN RAISE EXCEPTION 'append-only'; END $$;",
}
function sample(){
 const triggers=expected.map(([table,trigger,callback,eventBits])=>({
  table,trigger,callback,eventBits,enabled:'O',
  definer:false,owner:'supabase_admin',language:'plpgsql',
  config:callback==='asset_provenance_reject_orphan_delete()'||callback==='asset_reject_mutation()'?[]:['search_path=""'],body:bodies[callback],
  definition:'CREATE TRIGGER '+trigger+' ON '+table+' EXECUTE FUNCTION '+callback,
  publicExecute:false,grants:{anon:false,authenticated:false,social_schedule_rpc_only_fixture:false},
 }))
 const catalog={triggers}
 const result=auditMediaProvenanceTriggers(catalog)
 const pins={
  functions:Object.fromEntries(result.functions.map(x=>[x.signature,x.sha256])),
  triggers:Object.fromEntries(result.triggers.map(x=>[x.id,x.hash])),
  acl:Object.fromEntries(triggers.map(x=>[x.table+'.'+x.trigger,{publicExecute:x.publicExecute,grants:structuredClone(x.grants)}])),
 }
 return {catalog,pins}
}
test('all six provenance/evidence triggers and five guard bodies are inventoried',()=>{
 const {catalog,pins}=sample()
 const result=auditMediaProvenanceTriggers(catalog,{pins,enforce:true})
 assert.equal(result.triggers.length,6)
 assert.equal(result.functions.length,5)
})
test('mutated trigger topology, timing, target, disabled state and permission changes fail closed',()=>{
 const mutations=[
  x=>x.triggers.pop(),
  x=>x.triggers[0].trigger='unexpected_name',
  x=>x.triggers[0].eventBits=29,
  x=>x.triggers[0].enabled='D',
  x=>x.triggers[0].definer=true,
  x=>x.triggers[0].owner='authenticated',
  x=>x.triggers[0].config=['search_path=public'],
  x=>x.triggers[2].grants.anon=true,
  x=>x.triggers[2].publicExecute=true,
  x=>x.triggers[0].definition+=' WHEN TRUE',
  x=>x.triggers[0].body+=' SELECT 1;',
 ]
 for(const mutate of mutations){
  const {catalog,pins}=sample();mutate(catalog)
  assert.throws(()=>auditMediaProvenanceTriggers(catalog,{pins,enforce:true}))
 }
})
test('removing account, append-only, canonical media proof checks fails closed',()=>{
 const mutations=[
  [0,'public.assets'],
  [1,'append-only'],
  [2,'service_role'],
  [2,'the-prompt-review-admission-v1'],
  [3,'social_content_decisions'],
  [3,'media_news_snapshot_requirements'],
  [4,'append-only'],
 ]
 for(const [index,word] of mutations){
  const {catalog,pins}=sample()
  catalog.triggers[index].body=catalog.triggers[index].body.replace(word,'UNSAFE')
  assert.throws(()=>auditMediaProvenanceTriggers(catalog,{pins,enforce:true}))
 }
})
test('committed PostgreSQL source/trigger SHA-256 locks cover every known media provenance guard',()=>{
 assert.equal(Object.keys(mediaProvenancePins.functions).length,5)
 assert.equal(Object.keys(mediaProvenancePins.triggers).length,6)
 assert.ok(Object.values(mediaProvenancePins.functions).every(v=>/^[a-f0-9]{64}$/.test(v)))
 assert.ok(Object.values(mediaProvenancePins.triggers).every(v=>/^[a-f0-9]{64}$/.test(v)))
})
test('catalog SQL reads only pg_trigger and exact function/ACL metadata',()=>{
 const sql=mediaProvenanceCatalogSql()
 for(const term of ['pg_trigger','pg_class','pg_namespace','pg_get_triggerdef',
  'pg_get_functiondef','has_function_privilege','proconfig','tgenabled']){
  assert.ok(sql.includes(term),term)
 }
 assert.doesNotMatch(sql,/\b(?:create|alter|drop|insert|delete|update|grant|revoke)\s+(?:table|trigger|function|role)\b/i)
})
