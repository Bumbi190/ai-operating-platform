import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {auditNativeDefinerSurface,buildNativeDefinerCatalogQuery} from
 './calendar-native-definer-surface.mjs'

const allRoles=[
 'anon','authenticated','service_role','social_schedule_rpc_only_fixture',
 'social_schedule_broker_intent_fixture','social_schedule_broker_review_fixture',
 'social_schedule_operator_review_fixture',
]
const refs={
 social_schedule_native_operator_guard_fixture:[
  'auth.sessions','public.social_schedule_native_operator_guard_fixture',
  'public.social_schedule_operator_scope_fixture',
 ],
 social_schedule_native_operator_history_fixture:[
  'public.social_schedule_dispatch_intents_fixture',
  'public.social_schedule_native_operator_guard_fixture',
  'public.social_schedule_native_operator_history_fixture',
  'public.social_schedule_operator_review_events_fixture',
 ],
 social_schedule_native_operator_append_fixture:[
  'public.social_publications',
  'public.social_schedule_dispatch_intents_fixture',
  'public.social_schedule_native_operator_append_fixture',
  'public.social_schedule_native_operator_guard_fixture',
  'public.social_schedule_operator_review_events_fixture',
 ],
}
const tracked=[
 'auth.sessions','public.social_schedule_operator_scope_fixture',
 'public.social_schedule_operator_review_events_fixture',
 'public.social_schedule_dispatch_intents_fixture',
]
function fixture(){
 const functions=Object.entries(refs).map(([name,dependencies])=>{
  // The mock contains SQL identifiers, but never runs as SQL.
  const body='CREATE FUNCTION public.'+name+'() AS $$ BEGIN\n'+
   dependencies.map(ref=>'  SELECT * FROM '+ref+';\n').join('')+
   "  SELECT 'human_only' AS status;\n".repeat(17)+
   'END $$ LANGUAGE plpgsql;'
  return {name,owner:'supabase_admin',definer:true,language:'plpgsql',
   volatility:'v',configuration:['search_path=""'],body,publicExecute:false,
   grants:Object.fromEntries(allRoles.map(role=>[
    role,role==='authenticated'&&name!=='social_schedule_native_operator_guard_fixture'
   ]))}
 })
 const tables=tracked.map(name=>({name,rls:true,grants:{
  anon:{SELECT:false,INSERT:false,UPDATE:false,DELETE:false},
  authenticated:{SELECT:false,INSERT:false,UPDATE:false,DELETE:false},
 }}))
 const snapshot={functions,tables,meta:{fixtureOnly:true}}
 const fingerprint=Object.fromEntries(functions.map(f=>[
  f.name,createHash('sha256').update(f.body).digest('hex')]))
 return {snapshot,fingerprint}
}
test('catalog auditor validates complete native definer surfaces and reviewed body fingerprints',()=>{
 const {snapshot,fingerprint}=fixture()
 const report=auditNativeDefinerSurface(snapshot,{
  fingerprints:fingerprint,requireFingerprints:true,
 })
 assert.equal(report.reviewedRoutines.length,3)
 assert.equal(report.reviewedTables,4)
 assert.equal(report.localOnly,true)
 assert.equal(report.reviewedRoutines.every(r=>r.sha256===fingerprint[r.function]),true)
})
test('unexpected function, role grants, public execute, owner and search_path are denied',()=>{
 const tweaks=[
  s=>{s.functions.pop()},
  s=>{s.functions[0].owner='authenticated'},
  s=>{s.functions[0].definer=false},
  s=>{s.functions[0].language='sql'},
  s=>{s.functions[0].volatility='s'},
  s=>{s.functions[0].configuration=['search_path=public']},
  s=>{s.functions[0].publicExecute=true},
  s=>{s.functions[0].grants.anon=true},
  s=>{s.functions.find(f=>f.name.endsWith('_guard_fixture')).grants.authenticated=true},
 ]
 for(const mutate of tweaks){
  const {snapshot,fingerprint}=fixture()
  mutate(snapshot)
  assert.throws(()=>auditNativeDefinerSurface(snapshot,{
   fingerprints:fingerprint,requireFingerprints:true,
  }))
 }
})
test('extra privileged table, dynamic SQL, changed body and unreviewed inserts fail closed',()=>{
 const tweaks=[
  s=>{s.functions[0].body+='\nSELECT * FROM public.platform_tokens;'},
  s=>{s.functions[0].body+='\nEXECUTE sql_statement;'},
  s=>{s.functions[0].body+='\nSELECT 42;'},
  s=>{s.functions[0].body+='\nset_config(\'search_path\',\'public\',true);'},
  s=>{s.tables[0].rls=false},
  s=>{s.tables[1].grants.authenticated.INSERT=true},
  s=>{s.meta.fixtureOnly=false},
 ]
 for(const mutate of tweaks){
  const {snapshot,fingerprint}=fixture()
  mutate(snapshot)
  assert.throws(()=>auditNativeDefinerSurface(snapshot,{
   fingerprints:fingerprint,requireFingerprints:true,
  }))
 }
})
test('catalog SQL queries pg_proc/pg_namespace/pg_language, RLS and actual ACLs without DDL',()=>{
 const query=buildNativeDefinerCatalogQuery().toLowerCase()
 for(const part of ['pg_proc','pg_namespace','pg_language','prosecdef','proconfig',
  'pg_get_functiondef','has_function_privilege','has_table_privilege',
  'relrowsecurity','aclexplode'])assert.ok(query.includes(part),part)
 assert.doesNotMatch(query,/\b(insert|update|delete|alter|grant|revoke|create|drop)\s+(table|function|role|policy)\b/i)
})
