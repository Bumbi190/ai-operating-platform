import test from 'node:test'
import assert from 'node:assert/strict'
import {auditCalendarHelperChain,buildCalendarHelperCatalogQuery,
 reviewedHelperNames,reviewedHelperPins} from './calendar-helper-chain-audit.mjs'

const roles=['anon','authenticated','service_role','social_schedule_rpc_only_fixture',
 'social_schedule_broker_intent_fixture','social_schedule_broker_review_fixture',
 'social_schedule_operator_review_fixture']
const sqlNames=new Set(['social_schedule_snapshot','social_schedule_revision',
 'social_publication_record','social_schedule_now'])
const immutables=new Set(['social_schedule_fields','social_schedule_revision',
 'social_publication_record'])
const definite='calendar_source_gate_try_begin_probe'
const mustCall={
 calendar_source_gate_try_begin_probe:['calendar_source_gate_begin_probe'],
 social_content_requirements:['media_news_review_requirements'],
 social_schedule_authority:['social_content_active','social_schedule_item_guard',
  'social_schedule_snapshot'],
 social_schedule_item_guard:['social_content_requirements','social_schedule_fields'],
 social_schedule_locked_claim:['calendar_source_gate_begin_probe','social_schedule_fields'],
 social_schedule_snapshot:['social_publication_record','social_schedule_revision'],
}
function fixture(){
 const functions=reviewedHelperNames.map(name=>{
  const body='CREATE OR REPLACE FUNCTION public.'+name+
   '() RETURNS text LANGUAGE plpgsql SET search_path TO \x27\x27 AS $$\n'+
   '  SELECT * FROM public.social_schedule_jobs;\n'+
   (mustCall[name]??[]).map(call=>'  PERFORM public.'+call+'(null);\n').join('')+
   "  SELECT 'calendar';\n".repeat(8)+
   'END $$;'
  const grants=Object.fromEntries([
   ['public',false],...roles.map(role=>[
    role,role==='service_role',
   ]),
  ])
  return {name,signature:name+'(mock)',owner:'supabase_admin',
   definer:name===definite,language:sqlNames.has(name)?'sql':'plpgsql',
   volatility:immutables.has(name)?'i':
    name==='social_schedule_snapshot'?'s':'v',
   configuration:['search_path=""'],body,grants,publicExecute:false}
 })
 const snapshot={functions,meta:{fixtureOnly:true}}
 const report=auditCalendarHelperChain(snapshot)
 const pins={
  signatures:Object.fromEntries(report.functions.map(x=>[x.name,x.signature])),
  bodies:Object.fromEntries(report.functions.map(x=>[x.name,x.sha256])),
  calls:Object.fromEntries(report.functions.map(x=>[x.name,x.calls])),
  references:Object.fromEntries(report.functions.map(x=>[x.name,x.references])),
  grants:Object.fromEntries(report.functions.map(x=>[x.name,structuredClone(x.grants)])),
 }
 return {snapshot,pins}
}
test('strict helper catalogue contains all named helper bodies and fingerprint pins',()=>{
 const {snapshot,pins}=fixture()
 const result=auditCalendarHelperChain(snapshot,{pins,requirePins:true})
 assert.equal(result.functions.length,12)
 assert.equal(result.privilegedHelpers,1)
 assert.equal(result.invokerHelpers,11)
 assert.equal(result.scanKind,'bounded_lexical_next_hop')
})
test('missing helpers, owner/grant drift and unsafe function mode fail closed',()=>{
 const changes=[
  s=>s.functions.pop(),
  s=>s.functions[0].name='other_helper',
  s=>s.functions[0].owner='authenticated',
  s=>s.functions[0].configuration=['search_path=public'],
  s=>s.functions[0].language='sql',
  s=>s.functions[0].definer=false,
  s=>s.functions.find(x=>x.name==='social_schedule_snapshot').volatility='v',
  s=>s.functions[0].grants.anon=true,
  s=>s.functions[0].publicExecute=true,
 ]
 for(const change of changes){
  const {snapshot,pins}=fixture();change(snapshot)
  assert.throws(()=>auditCalendarHelperChain(snapshot,{pins,requirePins:true}))
 }
})
test('injected table, changed function call, dangerous dynamic SQL and body drift require review',()=>{
 const mods=[
  s=>s.functions[1].body+=' SELECT * FROM public.platform_tokens;',
  s=>s.functions[1].body+=' PERFORM public.new_unreviewed_function();',
  s=>s.functions[1].body+=' EXECUTE evil_statement;',
  s=>s.functions[1].body+=' PERFORM set_config(\x27role\x27,\x27service_role\x27,false);',
  s=>s.functions[1].body+=' SELECT 42;',
  s=>s.functions[1].signature='social_content_active(uuid,boolean)',
  s=>s.meta.fixtureOnly=false,
 ]
 for(const mod of mods){
  const {snapshot,pins}=fixture();mod(snapshot)
  assert.throws(()=>auditCalendarHelperChain(snapshot,{pins,requirePins:true}))
 }
})
test('helper SQL catalog query is read only and includes owner/mode/privileges/body',()=>{
 const query=buildCalendarHelperCatalogQuery()
 for(const s of ['pg_proc','pg_namespace','pg_language','pg_get_functiondef',
  'aclexplode','has_function_privilege','prosecdef','proconfig',
  'calendar_source_gate_try_begin_probe','social_schedule_authority',
  'social_content_requirements','media_news_review_requirements',
  'social_schedule_locked_claim'])
  assert.ok(query.includes(s),s)
 assert.doesNotMatch(query,/\b(?:create|alter|delete|insert|grant|revoke|drop)\s+(?:role|function|table)\b/i)
})
test('committed signature, body, direct-call, reference and permission pins cover all twelve helpers',()=>{
 for(const k of ['signatures','bodies','calls','references','grants'])
  assert.deepEqual(Object.keys(reviewedHelperPins[k]).sort(),reviewedHelperNames.slice().sort())
 assert.ok(Object.values(reviewedHelperPins.bodies).every(x=>/^[a-f0-9]{64}$/.test(x)))
 assert.equal(reviewedHelperPins.calls.social_content_requirements.includes('media_news_review_requirements'),true)
 assert.equal(reviewedHelperPins.calls.media_news_review_requirements.includes('media_news_snapshot_requirements'),true)
 assert.equal(reviewedHelperPins.grants.calendar_source_gate_try_begin_probe.authenticated,false)
 assert.equal(reviewedHelperPins.grants.calendar_source_gate_try_begin_probe.public,false)
})
test('source authority, image requirements and signed transaction lock are structural hard gates',()=>{
 const {snapshot}=fixture()
 const authority=snapshot.functions.find(x=>x.name==='social_schedule_authority')
 authority.body=authority.body.replace('PERFORM public.social_schedule_item_guard(null);','')
 assert.throws(()=>auditCalendarHelperChain(snapshot))
 const second=fixture()
 const content=second.snapshot.functions.find(x=>x.name==='social_content_requirements')
 content.body=content.body.replace('PERFORM public.media_news_review_requirements(null);','')
 assert.throws(()=>auditCalendarHelperChain(second.snapshot))
 const third=fixture()
 const locked=third.snapshot.functions.find(x=>x.name==='social_schedule_locked_claim')
 locked.body=locked.body.replace('PERFORM public.calendar_source_gate_begin_probe(null);','')
 assert.throws(()=>auditCalendarHelperChain(third.snapshot))
})
