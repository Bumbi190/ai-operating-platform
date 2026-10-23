import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

// Closed replay ONLY. Audits the next privileged hop reached when scheduled
// writes or the operator audit table fire database triggers. This is a
// bounded STATIC code/trigger inventory, not a whole-database or runtime
// taint-analysis certification. PL/pgSQL dynamic calls are not fully
// described by pg_depend; review the bodies as well as this guard.
export const trackedCalendarTriggerEntries=[
 ['projects','project_lifecycle_resume_guard','project_lifecycle_resume_guard()',true,19],
 ['projects','stop_guard_projects','stop_guard_projects()',false,23],
 ['projects','survival_input_epoch_bump','survival_input_epoch_bump()',true,13],
 ['projects','survival_input_epoch_bump_population','survival_input_epoch_bump()',true,17],
 ['projects','survival_input_truncate_refused','survival_input_truncate_refused()',true,34],
 ['social_publication_events','social_publication_events_immutable','social_launch_immutable()',false,27],
 ['social_publication_events','social_publication_events_no_truncate','social_launch_immutable()',false,34],
 ['social_publications','calendar_gate_publications_after_probe','calendar_source_gate_bump_probe()',true,29],
 ['social_publications','calendar_gate_publications_before_probe','calendar_source_gate_assert_probe()',true,31],
 ['social_schedule_events','social_schedule_events_immutable','social_launch_immutable()',false,27],
 ['social_schedule_events','social_schedule_events_no_truncate','social_launch_immutable()',false,34],
 ['social_schedule_jobs','calendar_gate_jobs_after_probe','calendar_source_gate_bump_probe()',true,29],
 ['social_schedule_jobs','calendar_gate_jobs_before_probe','calendar_source_gate_assert_probe()',true,31],
 ['social_schedule_operator_review_events_fixture','social_schedule_operator_review_no_truncate_fixture','social_schedule_operator_review_immutable_fixture()',false,34],
 ['social_schedule_operator_review_events_fixture','social_schedule_operator_review_no_update_fixture','social_schedule_operator_review_immutable_fixture()',false,27],
].sort((a,b)=>a[0].localeCompare(b[0],'en')||a[1].localeCompare(b[1],'en'))
const triggers=trackedCalendarTriggerEntries
const sha=value=>createHash('sha256').update(value,'utf8').digest('hex')
const isExpectedPath=x=>Array.isArray(x)&&x.length===1&&x[0]==='search_path=""'
const triggerId=x=>x.table+'.'+x.trigger
const bodyId=x=>x.signature

// LOCK only after comparing an actual isolated catalog snapshot to the
// reviewed source. A mismatch fails CI/test, never auto-updates the lock.
export const triggerChainFingerprints=Object.freeze({
 // Pinned values are populated from the reviewed isolated PostgreSQL catalog.
 functions:{
  'calendar_source_gate_assert_probe()': 'c8d95dac4cd82a6242e5a8e7b1b174cad7f67ea93900097a6d5adf55baf37a47',
  'calendar_source_gate_bump_probe()': 'ded0e73977171b5f6fcecce7d49f53afb0168e5626588d788f946e6810f425c9',
  'project_lifecycle_resume_guard()': '2202fecf04a59ec3e2626d95cb594bec4a0bb3ee76da2a59f8b74b7c06cc777f',
  'social_launch_immutable()': '77ba5eab58bb5f96dee15552dc9110737726c98e4dbde5d02278449376570e94',
  'social_schedule_operator_review_immutable_fixture()': '203a4e23574a0cafadf8b9e99559dbe2bdc022c8e7e6628d28a9fa3df74c5a3d',
  'stop_guard_projects()': 'a393215baf2e4429e30d1a7eaa1480b8336d2fe2b432194456c19ca7720df01f',
  'survival_input_epoch_bump()': '26130c8d618e0b20041662b450125909f89deaaa4bb532ad934a42b59e468acb',
  'survival_input_truncate_refused()': '3b3f357dceecce457bb43d0bec9de4ed7e3baab2758c03c51c8a0070dd14b3eb',
 },
 triggers:{
  'projects.project_lifecycle_resume_guard': '8750e45b0675900daae3de644f5743be78382c3f11040c0a00772f3240862811',
  'projects.stop_guard_projects': '80de720c0f5c1e9e1daf38abe10157cc8bbf467694d01716a35fb30bb50a24a7',
  'projects.survival_input_epoch_bump': '75ea50101183a20ef62745204c6bc865244b4402edc22db939b00dc7528dc069',
  'projects.survival_input_epoch_bump_population': '40a58f735e1b8745ab4f97c3f76fdd5093d0ceb6d7333eac2c58a133ee3893cd',
  'projects.survival_input_truncate_refused': '3414dc7c93c620697d09a5462bea3aa6da35e110eb088defbd58f6e66d8fe3eb',
  'social_publication_events.social_publication_events_immutable': '6e64d96b394966ccc15f857823d978a6e5deba884f05ed1a1257f791c6e36230',
  'social_publication_events.social_publication_events_no_truncate': '9cd66f8c3cc2b3ace0067508627c29c887e8630df918c0a6da73824c6b2191bd',
  'social_publications.calendar_gate_publications_after_probe': '153b6faf9d60c5a7817828b5507d55192acc3de4d47ab1d1a8ad2ef14b91ad21',
  'social_publications.calendar_gate_publications_before_probe': '0f696442e7bfdd7a773315fd93eb15efe719fd3d3b28ffbfb8b8fdaf1b7d0901',
  'social_schedule_events.social_schedule_events_immutable': 'd3e801169caf021ae0b169a150d118eda1e882f07063dd9f30fbcef08c38fc62',
  'social_schedule_events.social_schedule_events_no_truncate': '896860b4f0d305a27e773e71f4f717682be8affc9db3c289a4ff06ff7c6c4808',
  'social_schedule_jobs.calendar_gate_jobs_after_probe': 'b29842d3356d4e7eb7eb590f4d20796b580ce4ad5aafe23278f2ee7a0f7dbce7',
  'social_schedule_jobs.calendar_gate_jobs_before_probe': '68dd5e7f1075fcfcaf427d22015714ccf83e14fa20fea82d124d207cd84df670',
  'social_schedule_operator_review_events_fixture.social_schedule_operator_review_no_truncate_fixture': 'a6276afeaf1a23fa25e0f56c53b291becd1992117e5a1f90bf2a65fde680c6a6',
  'social_schedule_operator_review_events_fixture.social_schedule_operator_review_no_update_fixture': 'b1ca02d0106ce206d1116f002fc3bb5a6ce2d8cb3b24266dfbbd1635980cbaff',
 },
 gate:'f03727489cf43750824ee0d184293fc63771e398a77909bab0dbde99d9441f65',
})

export function auditCalendarTriggerChain(snapshot,{
 expected=triggerChainFingerprints,requireFingerprints=false,
}={}){
 assert.ok(snapshot&&Array.isArray(snapshot.triggers)&&
  Array.isArray(snapshot.gate),'missing trigger-chain catalog')
 assert.deepEqual(snapshot.triggers.map(t=>[
  t.table,t.trigger,t.signature,t.definer,t.eventBits,
 ]).sort((a,b)=>a[0].localeCompare(b[0],'en')||a[1].localeCompare(b[1],'en')),
 triggers,'scheduled/operated table trigger inventory drift')
 const funcs=new Map()
 const triggerEvidence=[]
 for(const t of snapshot.triggers){
  assert.equal(t.enabled,'O','disabled trigger: '+triggerId(t))
  assert.equal(t.owner,'supabase_admin','unexpected trigger function owner')
  assert.equal(t.language,'plpgsql','non-PLPGSQL trigger')
  assert.ok(isExpectedPath(t.searchPath),'trigger search_path drift')
  assert.ok(t.body?.length>70,'trigger function source unavailable')
  assert.ok(t.triggerSql?.startsWith('CREATE TRIGGER ')||
    t.triggerSql?.startsWith('CREATE CONSTRAINT TRIGGER '),
    'trigger DDL unavailable')
  if(requireFingerprints){
   assert.equal(sha(t.triggerSql),expected.triggers?.[triggerId(t)],
    'trigger event/condition/target definition changed: '+triggerId(t))
  }
  const prev=funcs.get(bodyId(t))
  const bodyHash=sha(t.body)
  if(prev)assert.equal(prev.sha256,bodyHash,'conflicting function body across triggers')
  else funcs.set(bodyId(t),{
   signature:t.signature,definer:t.definer,owner:t.owner,
   sha256:bodyHash,source:t.body,
  })
  triggerEvidence.push({
   table:t.table,trigger:t.trigger,callback:t.signature,
   eventBits:t.eventBits,triggerHash:sha(t.triggerSql),
  })
 }
 const names=[...funcs.keys()].sort()
 const expectedFns=[
  'calendar_source_gate_assert_probe()','calendar_source_gate_bump_probe()',
  'project_lifecycle_resume_guard()','social_launch_immutable()',
  'social_schedule_operator_review_immutable_fixture()',
  'stop_guard_projects()','survival_input_epoch_bump()',
  'survival_input_truncate_refused()',
 ]
 assert.deepEqual(names,expectedFns,'unexpected function behind tracked triggers')
 for(const [signature,fn] of funcs){
  if(requireFingerprints)
   assert.equal(fn.sha256,expected.functions?.[signature],
    'privileged callback body changed: '+signature)
 }
 assert.equal(snapshot.gate.length,1,'unexpected number of calendar signing gates')
 const gate=snapshot.gate[0]
 assert.equal(gate.signature,'calendar_source_gate_begin_probe(uuid)')
 assert.equal(gate.definer,true,'source proof gate lost SECURITY DEFINER')
 assert.equal(gate.owner,'supabase_admin','source proof gate owner drift')
 assert.equal(gate.language,'plpgsql','source proof gate language drift')
 assert.ok(isExpectedPath(gate.searchPath),'source proof gate search_path drift')
 assert.ok(gate.body.includes('calendar_gate_private_probe.secret'),'source key no longer isolated')
 assert.ok(gate.body.includes('public.calendar_source_revision_probe'),'source revision lock removed')
 assert.ok(gate.body.includes('for update'),'source revision lock removed')
 assert.ok(gate.body.includes('omnira.calendar_gate_probe_v1'),'proof marker missing')
 if(requireFingerprints)assert.equal(sha(gate.body),expected.gate,
  'calendar source HMAC / revision gate definition changed')
 return Object.freeze({
  triggers:triggerEvidence,
  functions:names.map(signature=>{
   const f=funcs.get(signature)
   return {
    signature,sha256:f.sha256,definer:f.definer,
    // Static qualified references only. A separate review must inspect
    // any unresolved or dynamically-built calls / SQL fragments.
    qualifiedReferences:[...new Set(
     (f.source.match(/\b(?:public|auth|calendar_gate_private_probe)\.[a-z_][a-z0-9_]*/gi)||[])
      .map(x=>x.toLowerCase()))].sort(),
   }
  }),
  gate:{signature:gate.signature,sha256:sha(gate.body)},
  boundedStaticAudit:true,
 })
}

export function buildCalendarTriggerChainQuery(){
 const selectedTables=[...new Set(triggers.map(t=>t[0]))].map(s=>"'"+s+"'").join(',')
 return `SELECT jsonb_build_object(
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'table',c.relname,'trigger',t.tgname,'enabled',t.tgenabled,
   'eventBits',t.tgtype,
   'triggerSql',pg_get_triggerdef(t.oid,true),
   'signature',p.oid::regprocedure::text,
   'definer',p.prosecdef,'owner',pg_get_userbyid(p.proowner),
   'language',l.lanname,
   'searchPath',coalesce(to_jsonb(p.proconfig),'[]'::jsonb),
   'body',pg_get_functiondef(p.oid)
 ) ORDER BY c.relname,t.tgname),'[]'::jsonb)
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_proc p ON p.oid=t.tgfoid
 JOIN pg_language l ON l.oid=p.prolang
 WHERE n.nspname='public' AND NOT t.tgisinternal
 AND c.relname IN (${selectedTables})),
 'gate',(SELECT coalesce(jsonb_agg(jsonb_build_object(
  'signature',p.oid::regprocedure::text,
  'definer',p.prosecdef,'owner',pg_get_userbyid(p.proowner),
  'language',l.lanname,
  'searchPath',coalesce(to_jsonb(p.proconfig),'[]'::jsonb),
  'body',pg_get_functiondef(p.oid)
 )),'[]'::jsonb)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_language l ON l.oid=p.prolang
 WHERE n.nspname='public'
 AND p.proname='calendar_source_gate_begin_probe')
 )`
}
