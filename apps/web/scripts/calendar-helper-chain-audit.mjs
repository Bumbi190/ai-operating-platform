import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

// TEST-ONLY CATALOG INVENTORY. This reviews the next bounded SQL-hop
// reached from six owner-privileged unchecked calendar routines.
// It is NOT a full dynamic PL/pgSQL call-graph or deployable migration.
const names=[
 'calendar_source_gate_try_begin_probe',
 'media_news_review_requirements',
 'social_content_active',
 'social_content_requirements',
 'social_publication_record',
 'social_schedule_authority',
 'social_schedule_fields',
 'social_schedule_item_guard',
 'social_schedule_locked_claim',
 'social_schedule_now',
 'social_schedule_revision',
 'social_schedule_snapshot',
]
const roles=[
 'anon','authenticated','service_role','social_schedule_rpc_only_fixture',
 'social_schedule_broker_intent_fixture','social_schedule_broker_review_fixture',
 'social_schedule_operator_review_fixture',
]
const dataTypes={
 calendar_source_gate_try_begin_probe:'plpgsql',
 media_news_review_requirements:'plpgsql',
 social_content_active:'plpgsql',
 social_content_requirements:'plpgsql',
 social_publication_record:'sql',
 social_schedule_authority:'plpgsql',
 social_schedule_fields:'plpgsql',
 social_schedule_item_guard:'plpgsql',
 social_schedule_locked_claim:'plpgsql',
 social_schedule_now:'sql',
 social_schedule_revision:'sql',
 social_schedule_snapshot:'sql',
}
const immutableNames=new Set([
 'social_schedule_fields','social_publication_record','social_schedule_revision',
])
const stableNames=new Set(['social_schedule_snapshot'])
const privilegedDefiners=new Set(['calendar_source_gate_try_begin_probe'])
const requiredSecurityEdges=Object.freeze({
 calendar_source_gate_try_begin_probe:['calendar_source_gate_begin_probe'],
 social_content_requirements:['media_news_review_requirements'],
 social_schedule_authority:['social_content_active','social_schedule_item_guard',
  'social_schedule_snapshot'],
 social_schedule_item_guard:['social_content_requirements','social_schedule_fields'],
 social_schedule_locked_claim:['calendar_source_gate_begin_probe','social_schedule_fields'],
 social_schedule_snapshot:['social_publication_record','social_schedule_revision'],
})
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex')
export const reviewedHelperNames=Object.freeze(names)
export const reviewedHelperPins=Object.freeze({
 signatures:{
  "calendar_source_gate_try_begin_probe": "calendar_source_gate_try_begin_probe(uuid)",
  "media_news_review_requirements": "media_news_review_requirements(uuid)",
  "social_content_active": "social_content_active(uuid)",
  "social_content_requirements": "social_content_requirements(uuid)",
  "social_publication_record": "social_publication_record(social_publications)",
  "social_schedule_authority": "social_schedule_authority(social_schedule_jobs,boolean)",
  "social_schedule_fields": "social_schedule_fields(jsonb,text[],text[])",
  "social_schedule_item_guard": "social_schedule_item_guard(uuid,jsonb)",
  "social_schedule_locked_claim": "social_schedule_locked_claim(jsonb)",
  "social_schedule_now": "social_schedule_now()",
  "social_schedule_revision": "social_schedule_revision(social_content_revisions)",
  "social_schedule_snapshot": "social_schedule_snapshot(social_schedule_jobs)"
},
 bodies:{
  "calendar_source_gate_try_begin_probe": "3cefc32f74bf21a3db18effecdc7a3d5c5abcd7906684d10363885550cef7f46",
  "media_news_review_requirements": "8a68890a71bd7af0c8e3e3ca8b9e98d419b568550b087670998f6258e3c5d763",
  "social_content_active": "dc7922d96738b90f7bde3229023da1849a309f8f6d96ba3cd84d275b6310487a",
  "social_content_requirements": "89743153a1a773256fc1f204e31bf9bfc0560c7b79908b994a3d39e98fc08381",
  "social_publication_record": "f1e0c9f9c8851a795ba2d088a89854832c6cfb292b6c7790b5a255582557ee33",
  "social_schedule_authority": "fd3d20268e197c030c0172f68c6b115c14b20e98cd1ec2a2e2652a250173e4f6",
  "social_schedule_fields": "037c870e58e446b8ee6241089056f48e178f9d6bd8d6ef5cd9b3416840d6fedb",
  "social_schedule_item_guard": "c24524428deb303873dbaf1a4a01eebfa62d5d71f49b20a782839db6adc92736",
  "social_schedule_locked_claim": "009bc1a230d02807f62a33d0f908f1a2e5ab6a85333737191c659395e4a101c8",
  "social_schedule_now": "dad406c91067398b98301f82b5516c42edcb3e341f7f57da46456e2236dc797d",
  "social_schedule_revision": "ab92e18b9bf22b20a6da44ff82db549ccdf5d8f89b81993afd3ab2c024bc9c26",
  "social_schedule_snapshot": "f19809ddc1d32c59f363692ea0bd74ebbe0bdb5602563c346ba75a205debbe35"
},
 calls:{
  "calendar_source_gate_try_begin_probe": [
    "calendar_source_gate_begin_probe"
  ],
  "media_news_review_requirements": [
    "media_news_canonical_json",
    "media_news_review_caption",
    "media_news_snapshot_requirements"
  ],
  "social_content_active": [],
  "social_content_requirements": [
    "media_news_review_requirements"
  ],
  "social_publication_record": [],
  "social_schedule_authority": [
    "social_content_active",
    "social_schedule_item_guard",
    "social_schedule_now",
    "social_schedule_snapshot"
  ],
  "social_schedule_fields": [],
  "social_schedule_item_guard": [
    "social_content_requirements",
    "social_schedule_fields"
  ],
  "social_schedule_locked_claim": [
    "calendar_source_gate_begin_probe",
    "social_schedule_fields",
    "social_schedule_now"
  ],
  "social_schedule_now": [],
  "social_schedule_revision": [],
  "social_schedule_snapshot": [
    "social_publication_record",
    "social_schedule_revision"
  ]
},
 references:{
  "calendar_source_gate_try_begin_probe": [
    "public.calendar_source_gate_begin_probe",
    "public.calendar_source_gate_try_begin_probe",
    "public.calendar_source_revision_probe",
    "public.projects"
  ],
  "media_news_review_requirements": [
    "public.asset_provenance",
    "public.media_news_canonical_json",
    "public.media_news_review_caption",
    "public.media_news_review_evidence",
    "public.media_news_review_requirements",
    "public.media_news_snapshot_requirements",
    "public.media_scripts",
    "public.social_content_revisions"
  ],
  "social_content_active": [
    "public.platform_config",
    "public.project_lifecycle",
    "public.projects",
    "public.social_content_active"
  ],
  "social_content_requirements": [
    "public.assets",
    "public.media_news_review_requirements",
    "public.social_account_bindings",
    "public.social_content_requirements",
    "public.social_content_revisions",
    "public.social_launch_plan_decisions",
    "public.social_launch_plan_revisions",
    "public.social_launch_plans"
  ],
  "social_publication_record": [
    "public.social_publication_record"
  ],
  "social_schedule_authority": [
    "public.projects",
    "public.social_content_active",
    "public.social_monthly_release_evidence",
    "public.social_schedule_authority",
    "public.social_schedule_batches",
    "public.social_schedule_decisions",
    "public.social_schedule_item_guard",
    "public.social_schedule_now",
    "public.social_schedule_snapshot"
  ],
  "social_schedule_fields": [
    "public.social_schedule_fields"
  ],
  "social_schedule_item_guard": [
    "public.assets",
    "public.social_content_decisions",
    "public.social_content_posts",
    "public.social_content_requirements",
    "public.social_content_revisions",
    "public.social_schedule_fields",
    "public.social_schedule_item_guard"
  ],
  "social_schedule_locked_claim": [
    "public.calendar_source_gate_begin_probe",
    "public.projects",
    "public.social_schedule_fields",
    "public.social_schedule_jobs",
    "public.social_schedule_locked_claim",
    "public.social_schedule_now"
  ],
  "social_schedule_now": [
    "public.social_schedule_now"
  ],
  "social_schedule_revision": [
    "public.social_schedule_revision"
  ],
  "social_schedule_snapshot": [
    "public.social_content_revisions",
    "public.social_publication_record",
    "public.social_publications",
    "public.social_schedule_batches",
    "public.social_schedule_revision",
    "public.social_schedule_snapshot"
  ]
},
 grants:{
  "calendar_source_gate_try_begin_probe": {
    "anon": false,
    "public": false,
    "service_role": true,
    "authenticated": false,
    "social_schedule_rpc_only_fixture": false,
    "social_schedule_broker_intent_fixture": false,
    "social_schedule_broker_review_fixture": false,
    "social_schedule_operator_review_fixture": false
  },
  "media_news_review_requirements": {
    "anon": false,
    "public": false,
    "service_role": true,
    "authenticated": false,
    "social_schedule_rpc_only_fixture": false,
    "social_schedule_broker_intent_fixture": false,
    "social_schedule_broker_review_fixture": false,
    "social_schedule_operator_review_fixture": false
  },
  "social_content_active": {
    "anon": false,
    "public": false,
    "service_role": true,
    "authenticated": false,
    "social_schedule_rpc_only_fixture": false,
    "social_schedule_broker_intent_fixture": false,
    "social_schedule_broker_review_fixture": false,
    "social_schedule_operator_review_fixture": false
  },
  "social_content_requirements": {
    "anon": false,
    "public": false,
    "service_role": true,
    "authenticated": false,
    "social_schedule_rpc_only_fixture": false,
    "social_schedule_broker_intent_fixture": false,
    "social_schedule_broker_review_fixture": false,
    "social_schedule_operator_review_fixture": false
  },
  "social_publication_record": {
    "anon": false,
    "public": false,
    "service_role": true,
    "authenticated": false,
    "social_schedule_rpc_only_fixture": false,
    "social_schedule_broker_intent_fixture": false,
    "social_schedule_broker_review_fixture": false,
    "social_schedule_operator_review_fixture": false
  },
  "social_schedule_authority": {
    "anon": false,
    "public": false,
    "service_role": true,
    "authenticated": false,
    "social_schedule_rpc_only_fixture": false,
    "social_schedule_broker_intent_fixture": false,
    "social_schedule_broker_review_fixture": false,
    "social_schedule_operator_review_fixture": false
  },
  "social_schedule_fields": {
    "anon": false,
    "public": false,
    "service_role": true,
    "authenticated": false,
    "social_schedule_rpc_only_fixture": false,
    "social_schedule_broker_intent_fixture": false,
    "social_schedule_broker_review_fixture": false,
    "social_schedule_operator_review_fixture": false
  },
  "social_schedule_item_guard": {
    "anon": false,
    "public": false,
    "service_role": true,
    "authenticated": false,
    "social_schedule_rpc_only_fixture": false,
    "social_schedule_broker_intent_fixture": false,
    "social_schedule_broker_review_fixture": false,
    "social_schedule_operator_review_fixture": false
  },
  "social_schedule_locked_claim": {
    "anon": false,
    "public": false,
    "service_role": true,
    "authenticated": false,
    "social_schedule_rpc_only_fixture": false,
    "social_schedule_broker_intent_fixture": false,
    "social_schedule_broker_review_fixture": false,
    "social_schedule_operator_review_fixture": false
  },
  "social_schedule_now": {
    "anon": false,
    "public": false,
    "service_role": true,
    "authenticated": false,
    "social_schedule_rpc_only_fixture": false,
    "social_schedule_broker_intent_fixture": false,
    "social_schedule_broker_review_fixture": false,
    "social_schedule_operator_review_fixture": false
  },
  "social_schedule_revision": {
    "anon": false,
    "public": false,
    "service_role": true,
    "authenticated": false,
    "social_schedule_rpc_only_fixture": false,
    "social_schedule_broker_intent_fixture": false,
    "social_schedule_broker_review_fixture": false,
    "social_schedule_operator_review_fixture": false
  },
  "social_schedule_snapshot": {
    "anon": false,
    "public": false,
    "service_role": true,
    "authenticated": false,
    "social_schedule_rpc_only_fixture": false,
    "social_schedule_broker_intent_fixture": false,
    "social_schedule_broker_review_fixture": false,
    "social_schedule_operator_review_fixture": false
  }
},
})
function sourceWithoutComments(source){
 return source.replace(/--[^\r\n]*/g,'')
}
function extractCalls(source,ownName){
 const body=sourceWithoutComments(source)
 const found=[]
 for(const hit of body.matchAll(/\bpublic[.]([a-z_][a-z0-9_]*)\s*\(/gi)){
  const name=hit[1].toLowerCase()
  const context=body.slice(Math.max(0,hit.index-65),hit.index)
  if(name===ownName||/\binto\s*$/i.test(context))continue
  found.push(name)
 }
 return [...new Set(found)].sort()
}
function extractQualifiedRefs(source){
 return [...new Set(
  [...sourceWithoutComments(source).matchAll(/\b(?:public|auth|calendar_gate_private_probe)[.]([a-z_][a-z0-9_]*)\b/gi)]
   .map(hit=>hit[0].toLowerCase())
 )].sort()
}
export function auditCalendarHelperChain(snapshot,{
 pins=reviewedHelperPins,requirePins=false,
}={}){
 assert.ok(snapshot&&Array.isArray(snapshot.functions)&&
  snapshot.meta?.fixtureOnly===true,'untrusted/incomplete fixture catalog')
 const functions=snapshot.functions
 assert.deepEqual(functions.map(f=>f.name).sort(),names.slice().sort(),
  'helper list/overload changed')
 assert.equal(functions.length,names.length)
 const report=[]
 for(const f of functions){
  const expectedDefiner=privilegedDefiners.has(f.name)
  const expectedVolatility=immutableNames.has(f.name)?'i':
   stableNames.has(f.name)?'s':'v'
  assert.equal(f.owner,'supabase_admin','unexpected helper function owner: '+f.name)
  assert.equal(f.definer,expectedDefiner,'helper SECURITY INVOKER/DEFINER changed: '+f.name)
  assert.equal(f.language,dataTypes[f.name],'helper language changed: '+f.name)
  assert.equal(f.volatility,expectedVolatility,'helper volatility changed: '+f.name)
  assert.deepEqual(f.configuration,['search_path=""'],
   'helper search_path changed: '+f.name)
  assert.ok(typeof f.body==='string'&&f.body.length>120,
   'helper source missing/short: '+f.name)
  const source=sourceWithoutComments(f.body)
  // SQL EXECUTE statements would evade the lexical dependency list.
  assert.doesNotMatch(source,/\b(?:execute|dblink|set_config|pg_read_file|pg_ls_dir)\b/i,
   'unreviewed dynamic SQL/capability within '+f.name)
  if(expectedDefiner){
   assert.equal(f.publicExecute,false,'privileged helper exposed to PUBLIC: '+f.name)
   for(const role of ['anon','authenticated','social_schedule_rpc_only_fixture'])
    assert.equal(f.grants?.[role],false,'privileged helper direct access: '+f.name+'/'+role)
  }
  const calls=extractCalls(f.body,f.name)
  for(const required of requiredSecurityEdges[f.name]??[])
   assert.ok(calls.includes(required),'critical downstream gate removed: '+f.name+' -> '+required)
  const references=extractQualifiedRefs(f.body)
  const fingerprint=sha(f.body)
  if(requirePins){
   assert.equal(f.signature,pins.signatures?.[f.name],
    'helper function signature changed: '+f.name)
   assert.equal(fingerprint,pins.bodies?.[f.name],
    'helper source changed: '+f.name)
   assert.deepEqual(calls,pins.calls?.[f.name],
    'helper qualified SQL callee set changed: '+f.name)
   assert.deepEqual(references,pins.references?.[f.name],
    'helper qualified SQL reference set changed: '+f.name)
   assert.deepEqual(f.grants,pins.grants?.[f.name],
    'helper EXECUTE permission set changed: '+f.name)
   assert.equal(f.publicExecute,pins.grants?.[f.name]?.public??false,
    'helper PUBLIC EXECUTE permission changed: '+f.name)
  }
  report.push({name:f.name,signature:f.signature,
   definer:expectedDefiner,sha256:fingerprint,
   calls,references,grants:f.grants,publicExecute:f.publicExecute})
 }
 return Object.freeze({
  functions:report,invokerHelpers:names.length-privilegedDefiners.size,
  privilegedHelpers:privilegedDefiners.size,
  scanKind:'bounded_lexical_next_hop',
 })
}

export function buildCalendarHelperCatalogQuery(){
 const namesString=names.map(name=>"'"+name+"'").join(',')
 const grantees=roles.map(role=>
  "'"+role+"',has_function_privilege('"+role+"',p.oid,'EXECUTE')").join(',')
 return `SELECT jsonb_build_object(
 'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'name',p.proname,'signature',p.oid::regprocedure::text,
   'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,
   'language',l.lanname,'volatility',p.provolatile,
   'configuration',coalesce(to_jsonb(p.proconfig),'[]'::jsonb),
   'body',pg_get_functiondef(p.oid),
   'publicExecute',coalesce((SELECT bool_or(g.grantee=0 AND g.privilege_type='EXECUTE')
      FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g),false),
   'grants',jsonb_build_object('public',coalesce((SELECT bool_or(g.grantee=0 AND g.privilege_type='EXECUTE')
      FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g),false),
      ${grantees})
  ) ORDER BY p.proname),'[]'::jsonb)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_language l ON l.oid=p.prolang
  WHERE n.nspname='public' AND p.proname IN (${namesString})),
 'meta',jsonb_build_object('fixtureOnly',true)
 )`
}
