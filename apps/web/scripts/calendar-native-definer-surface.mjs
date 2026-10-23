import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

// TEST-ONLY audit: runtime PostgreSQL catalog evidence is compared against
// reviewed signatures, grants and explicitly referenced tables/functions.
// PL/pgSQL SQL-string dependencies aren't fully tracked by pg_depend; source
// fingerprints and a separate human call-graph review are both necessary.
const roles=[
 'anon','authenticated','service_role','social_schedule_rpc_only_fixture',
 'social_schedule_broker_intent_fixture','social_schedule_broker_review_fixture',
 'social_schedule_operator_review_fixture',
]
const refSpec={
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
  'public.social_publications','public.social_schedule_dispatch_intents_fixture',
  'public.social_schedule_native_operator_append_fixture',
  'public.social_schedule_native_operator_guard_fixture',
  'public.social_schedule_operator_review_events_fixture',
 ],
}
const expectedNames=Object.keys(refSpec).sort()

// SHA-256 over the PostgreSQL 17.11.0.004 fixture's pg_get_functiondef
// output, measured against the exact pinned native operator candidate on
// 23 October 2026. A changing function body is a REVIEW GATE, never an
// automatically acceptable update. Postgres-version reformatting will
// also require deliberate re-review and a new expected fingerprint.
export const reviewedNativeDefinerFingerprints=Object.freeze({
 social_schedule_native_operator_append_fixture:
  'f5465e22b640a5f1218524ffad947f1bbffba24dfa11a65457b242a863f40ddd',
 social_schedule_native_operator_guard_fixture:
  'c2282ee41e58067465267c1809541aeff130d7755837da26554ffc87bba22853',
 social_schedule_native_operator_history_fixture:
  '3f8b78dc464b27376fd78cec8c88d884bc55f5ad9ac92cb862e7a2cccb7c1834',
})
const noDynamic=/\b(execute|dblink|set_config|pg_read_file|pg_ls_dir|copy|create\s+extension|alter\s+role)\b/i
function references(body){
 return [...new Set((body.replace(/--[^\n\r]*/g,'').match(/\b(?:public|auth)\.[a-z_][a-z0-9_]*/gi)||[])
  .map(r=>r.toLowerCase()))].sort()
}
export function auditNativeDefinerSurface(snapshot,{
 fingerprints={},requireFingerprints=false,
}={}){
 assert.ok(snapshot&&Array.isArray(snapshot.functions)&&Array.isArray(snapshot.tables),
  'incomplete native operator catalog snapshot')
 const functions=snapshot.functions
 assert.deepEqual(functions.map(x=>x.name).sort(),expectedNames,
  'native exposed function inventory changed')
 const evidence=[]
 for(const f of functions){
  assert.equal(f.owner,'supabase_admin','unexpected SECURITY DEFINER owner: '+f.name)
  assert.equal(f.definer,true,'unexpected SECURITY INVOKER or removed definer: '+f.name)
  assert.equal(f.language,'plpgsql','unreviewed PL/pgSQL language')
  assert.equal(f.volatility,'v','changing function volatility needs review')
  assert.deepEqual(f.configuration,['search_path=""'],
   'SECURITY DEFINER search_path drift: '+f.name)
  assert.equal(typeof f.body,'string','function definition absent: '+f.name)
  assert.ok(f.body.length>450,'unexpectedly short function')
  const normalized=f.body.replace(/--[^\n\r]*/g,'')
  assert.equal(noDynamic.test(normalized),false,'dynamic/unsafe SQL token: '+f.name)
  assert.deepEqual(references(f.body),refSpec[f.name],
   'unexpected SQL table/function reference: '+f.name)
  assert.equal(f.publicExecute,false,'unexpected PUBLIC execute: '+f.name)
  for(const role of roles){
   const mayExecute=f.name!=='social_schedule_native_operator_guard_fixture'&&
    role==='authenticated'
   assert.equal(f.grants?.[role],mayExecute,
    'wrong SQL function execute grant: '+f.name+' / '+role)
  }
  const sha256=createHash('sha256').update(f.body,'utf8').digest('hex')
  if(requireFingerprints){
   assert.equal(fingerprints[f.name],sha256,
    'reviewed privileged function body changed: '+f.name)
  }
  evidence.push({function:f.name,sha256,references:refSpec[f.name]})
 }
 const map=new Map(snapshot.tables.map(t=>[t.name,t]))
 for(const table of [
  'auth.sessions','public.social_schedule_operator_scope_fixture',
  'public.social_schedule_operator_review_events_fixture',
  'public.social_schedule_dispatch_intents_fixture',
 ]){
  const row=map.get(table)
  assert.ok(row,'trusted session or audit table missing: '+table)
  assert.equal(row.rls,true,'RLS unexpectedly off for '+table)
  for(const role of ['anon','authenticated']){
   for(const op of ['SELECT','INSERT','UPDATE','DELETE']){
    assert.equal(row.grants?.[role]?.[op],false,
     'direct '+op+' unexpectedly allowed to '+role+' on '+table)
   }
  }
 }
 assert.equal(snapshot.meta?.fixtureOnly,true,'unverified catalog provenance')
 return Object.freeze({
  reviewedRoutines:evidence,
  reviewedTables:map.size,
  localOnly:true,
 })
}

export function buildNativeDefinerCatalogQuery(){
 const quotedNames=expectedNames.map(x=>"'"+x+"'").join(',')
 const grantMap=roles.map(role=>`'${role}',has_function_privilege('${role}',p.oid,'EXECUTE')`).join(',')
 const tableMap=roles.slice(0,2).map(role=>
  `'${role}',jsonb_build_object(${['SELECT','INSERT','UPDATE','DELETE']
   .map(op=>`'${op}',has_table_privilege('${role}',c.oid,'${op}')`).join(',')})`).join(',')
 return `SELECT jsonb_build_object(
  'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'name',p.proname,
   'owner',pg_get_userbyid(p.proowner),
   'definer',p.prosecdef,
   'language',l.lanname,'volatility',p.provolatile,
   'configuration',coalesce(to_jsonb(p.proconfig),'[]'::jsonb),
   'body',pg_get_functiondef(p.oid),
   'publicExecute',coalesce((SELECT bool_or(e.grantee=0 AND e.privilege_type='EXECUTE')
      FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) e),false),
   'grants',jsonb_build_object(${grantMap})
  ) ORDER BY p.proname),'[]'::jsonb)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_language l ON l.oid=p.prolang
  WHERE n.nspname='public' AND p.proname IN (${quotedNames})),
  'tables',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'name',n.nspname||'.'||c.relname,'rls',c.relrowsecurity,
   'grants',jsonb_build_object(${tableMap})
  ) ORDER BY n.nspname,c.relname),'[]'::jsonb)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname||'.'||c.relname IN (
   'auth.sessions','public.social_schedule_operator_scope_fixture',
   'public.social_schedule_operator_review_events_fixture',
   'public.social_schedule_dispatch_intents_fixture')),
  'meta',jsonb_build_object('fixtureOnly',true)
 )`
}
