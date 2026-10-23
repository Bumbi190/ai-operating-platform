import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

// Isolated, read-only catalog audit of the three private media-news SQL
// callees reached via social_content_requirements() and the scheduler.
// This is a bounded static review, not full PL/pgSQL dataflow analysis.
export const mediaNewsCalleeNames=Object.freeze([
 'media_news_canonical_json',
 'media_news_review_caption',
 'media_news_snapshot_requirements',
])
const roles=[
 'anon','authenticated','service_role','social_schedule_rpc_only_fixture',
 'social_schedule_broker_intent_fixture','social_schedule_broker_review_fixture',
 'social_schedule_operator_review_fixture',
]
const metadata={
 media_news_canonical_json:{
  signature:'media_news_canonical_json(jsonb)',language:'plpgsql',volatility:'i',
  calls:[],required:['jsonb_typeof','string_agg','collate "C"','order by ord','public.media_news_canonical_json'],
 },
 media_news_review_caption:{
  signature:'media_news_review_caption(media_scripts)',language:'sql',volatility:'i',
  calls:[],required:['jsonb_array_elements_text','string_agg','order by ord','captions','hashtags','cta','concat_ws'],
 },
 media_news_snapshot_requirements:{
  signature:'media_news_snapshot_requirements(uuid,jsonb)',language:'plpgsql',volatility:'v',
  calls:['media_news_canonical_json','media_news_review_caption'],
  required:[
   'the-prompt-review-admission-v1',
   'media-assets-private',
   'cost_events','source_published_at','48 hours',
   'asset_provenance','social_launch_plan_decisions',
   'social_account_bindings','provider_metadata',
   'snapshot','news_project_stopped',
   'news_evidence_invalid','news_evidence_changed',
   'video/mp4','sha256','simulated',
  ],
 },
}
export const reviewedMediaNewsPins=Object.freeze({
 signatures:{
  "media_news_canonical_json": "media_news_canonical_json(jsonb)",
  "media_news_review_caption": "media_news_review_caption(media_scripts)",
  "media_news_snapshot_requirements": "media_news_snapshot_requirements(uuid,jsonb)"
},
 bodies:{
  "media_news_canonical_json": "0d841b2da4ae7e39e903cb34327a1d80e0f62ffdaa8e78ab89bcf943679a1d92",
  "media_news_review_caption": "0f98d7b5b4f85a0be71f00dac929b7eb11dec98d38f85d18cc7b357d7052bdb4",
  "media_news_snapshot_requirements": "5fae8e7ae4e6b4ae5238ff40d7a4960236a36981b6267e31cf2e19495a40d32a"
},
 calls:{
  "media_news_canonical_json": [],
  "media_news_review_caption": [],
  "media_news_snapshot_requirements": [
    "media_news_canonical_json",
    "media_news_review_caption"
  ]
},
 references:{
  "media_news_canonical_json": [
    "public.media_news_canonical_json"
  ],
  "media_news_review_caption": [
    "public.media_news_review_caption"
  ],
  "media_news_snapshot_requirements": [
    "public.asset_provenance",
    "public.assets",
    "public.cost_events",
    "public.media_news_canonical_json",
    "public.media_news_items",
    "public.media_news_review_caption",
    "public.media_news_snapshot_requirements",
    "public.media_scripts",
    "public.platform_config",
    "public.project_lifecycle",
    "public.projects",
    "public.social_account_bindings",
    "public.social_launch_plan_decisions",
    "public.social_launch_plan_revisions",
    "public.social_launch_plans"
  ]
},
 grants:{
  "media_news_canonical_json": {
    "anon": false,
    "service_role": true,
    "authenticated": false,
    "social_schedule_rpc_only_fixture": false,
    "social_schedule_broker_intent_fixture": false,
    "social_schedule_broker_review_fixture": false,
    "social_schedule_operator_review_fixture": false
  },
  "media_news_review_caption": {
    "anon": false,
    "service_role": true,
    "authenticated": false,
    "social_schedule_rpc_only_fixture": false,
    "social_schedule_broker_intent_fixture": false,
    "social_schedule_broker_review_fixture": false,
    "social_schedule_operator_review_fixture": false
  },
  "media_news_snapshot_requirements": {
    "anon": false,
    "service_role": true,
    "authenticated": false,
    "social_schedule_rpc_only_fixture": false,
    "social_schedule_broker_intent_fixture": false,
    "social_schedule_broker_review_fixture": false,
    "social_schedule_operator_review_fixture": false
  }
},
})
const digest=s=>createHash('sha256').update(s,'utf8').digest('hex')
function stripLineComments(source){return source.replace(/--[^\r\n]*/g,'')}
function callsIn(source,own){
 const s=stripLineComments(source), result=[]
 for(const hit of s.matchAll(/\bpublic[.]([a-z_][a-z0-9_]*)\s*\(/gi)){
  const name=hit[1].toLowerCase()
  const prefix=s.slice(Math.max(0,hit.index-60),hit.index)
  if(name===own||/\binto\s*$/i.test(prefix))continue
  result.push(name)
 }
 return [...new Set(result)].sort()
}
function referencesIn(source){
 return [...new Set(
  [...stripLineComments(source).matchAll(/\b(?:public|auth)[.]([a-z_][a-z0-9_]*)\b/gi)]
   .map(m=>m[0].toLowerCase())
 )].sort()
}
export function auditMediaNewsCallees(snapshot,{
 pins=reviewedMediaNewsPins,requirePins=false,
}={}){
 assert.ok(snapshot&&Array.isArray(snapshot.functions)&&
  snapshot.meta?.fixtureOnly===true,'invalid media SQL catalog provenance')
 assert.deepEqual(snapshot.functions.map(x=>x.name).sort(),[...mediaNewsCalleeNames].sort(),
  'media-news dependency list changed')
 assert.equal(new Set(snapshot.functions.map(x=>x.signature)).size,mediaNewsCalleeNames.length,
  'new media-news function overload or duplicate')
 const report=[]
 for(const fn of snapshot.functions){
  const spec=metadata[fn.name]
  assert.ok(spec,'unexpected news/voice/provenance function')
  assert.equal(fn.signature,spec.signature,'media-news signature drift: '+fn.name)
  assert.equal(fn.owner,'supabase_admin','media-news SQL owner drift')
  assert.equal(fn.definer,false,'media-news SQL function escalated to SECURITY DEFINER')
  assert.equal(fn.language,spec.language,'media-news function language drift')
  assert.equal(fn.volatility,spec.volatility,'media-news function volatility drift')
  assert.deepEqual(fn.configuration,['search_path=""'],
   'unlocked schema search_path on media function')
  assert.ok(typeof fn.body==='string'&&fn.body.length>200,
   'missing media-news function definition')
  assert.equal(fn.publicExecute,false,'PUBLIC can execute media-news function')
  assert.equal(fn.strict,fn.name==='media_news_canonical_json',
   'JSON canonicalization strict/null contract changed')
  for(const role of roles)assert.equal(fn.grants?.[role],role==='service_role',
   'unexpected media-news direct RPC grant: '+fn.name+'/'+role)
  const body=stripLineComments(fn.body)
  assert.doesNotMatch(body,/\b(?:execute|dblink|set_config|pg_read_file|pg_ls_dir)\b/i,
   'unreviewed dynamic SQL or privileged media-news operation')
  for(const signal of spec.required){
   assert.ok(body.toLowerCase().includes(signal.toLowerCase()),
    'required media proof/canonicalization check missing: '+fn.name+' '+signal)
  }
  const calls=callsIn(fn.body,fn.name)
  assert.deepEqual(calls,spec.calls,
   'unexpected direct qualified media-news helper call: '+fn.name)
  const references=referencesIn(fn.body)
  const sha256=digest(fn.body)
  if(requirePins){
   assert.equal(pins.signatures?.[fn.name],fn.signature,'media-news signature changed')
   assert.equal(pins.bodies?.[fn.name],sha256,'media-news trusted function body changed')
   assert.deepEqual(pins.calls?.[fn.name],calls,
    'unreviewed media-news function dependency changed')
   assert.deepEqual(pins.references?.[fn.name],references,
    'media-news qualified SQL reference set changed')
   assert.deepEqual(pins.grants?.[fn.name],fn.grants,
    'media-news SQL role permissions changed')
  }
  report.push({name:fn.name,signature:fn.signature,sha256,calls,
   references,grants:fn.grants,invoker:!fn.definer})
 }
 return Object.freeze({
  functions:report,reviewedFunctions:report.length,
  reviewScope:'bounded_static_media_news_callees',
 })
}
export function buildMediaNewsCalleeCatalogQuery(){
 const quoted=mediaNewsCalleeNames.map(x=>"'"+x+"'").join(',')
 const grants=roles.map(role=>
  "'"+role+"',has_function_privilege('"+role+"',p.oid,'EXECUTE')").join(',')
 const publicGrant=`coalesce((SELECT bool_or(a.grantee=0 AND a.privilege_type='EXECUTE')
    FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),false)`
 return `SELECT jsonb_build_object(
  'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'name',p.proname,'signature',p.oid::regprocedure::text,
   'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,
   'language',l.lanname,'volatility',p.provolatile,
   'configuration',coalesce(to_jsonb(p.proconfig),'[]'::jsonb),
   'body',pg_get_functiondef(p.oid),'strict',p.proisstrict,
   'publicExecute',${publicGrant},
   'grants',jsonb_build_object(${grants})
  ) ORDER BY p.proname),'[]'::jsonb)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_language l ON l.oid=p.prolang
  WHERE n.nspname='public' AND p.proname IN (${quoted})),
  'meta',jsonb_build_object('fixtureOnly',true)
 )`
}
