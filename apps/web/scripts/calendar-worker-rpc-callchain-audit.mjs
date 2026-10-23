import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

// TEST ONLY. A bounded privileged SQL call-chain audit of the exact six
// calendar worker RPCs, the six renamed unchecked owner-privileged bodies,
// and the three inner scope guards. Do not confuse catalog evidence or
// lexical qualified calls with a complete dynamic PL/pgSQL call graph.
const sigs={
 social_schedule_claim:'social_schedule_claim(jsonb)',
 social_schedule_authorize_write:'social_schedule_authorize_write(jsonb,jsonb)',
 social_schedule_step:'social_schedule_step(jsonb,jsonb)',
 social_schedule_peek:'social_schedule_peek(jsonb)',
 social_schedule_receipt:'social_schedule_receipt(jsonb)',
 social_schedule_recover_checkpoint:'social_schedule_recover_checkpoint(jsonb)',
}
const internals={
 social_schedule_claim:'social_schedule_claim_unchecked_fixture(jsonb)',
 social_schedule_authorize_write:'social_schedule_authorize_unchecked_fixture(jsonb,jsonb)',
 social_schedule_step:'social_schedule_step_unchecked_fixture(jsonb,jsonb)',
 social_schedule_peek:'social_schedule_peek_unchecked_fixture(jsonb)',
 social_schedule_receipt:'social_schedule_receipt_unchecked_fixture(jsonb)',
 social_schedule_recover_checkpoint:'social_schedule_recover_unchecked_fixture(jsonb)',
}
const guards=[
 'social_schedule_rpc_check_project_fixture(uuid)',
 'social_schedule_rpc_check_projects_fixture(jsonb)',
 'social_schedule_rpc_check_job_fixture(jsonb)',
]
export const schedulerCallableSignatures=Object.freeze(Object.values(sigs).sort())
export const privilegedChainSignatures=Object.freeze([
 ...Object.values(sigs),...Object.values(internals),...guards,
].sort())
const signatureName=signature=>signature.split('(')[0]
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex')
const roles=[
 'anon','authenticated','service_role','social_schedule_rpc_only_fixture',
 'social_schedule_broker_intent_fixture','social_schedule_broker_review_fixture',
 'social_schedule_operator_review_fixture','social_schedule_operator_review_fixture',
]
// Source references must be compared with pinned expected call sites, not
// interpreted as Postgres pg_depend transitively resolving PL/pgSQL calls.
function referencedCalls(body,ownName){
 const source=body.replace(/--[^\r\n]*/g,'')
 const calls=[]
 for(const hit of source.matchAll(/\bpublic[.]([a-z_][a-z0-9_]*)\s*\(/gi)){
  const name=hit[1].toLowerCase()
  // INSERT INTO public.table_name(col, ...) looks like a function call
  // to a naive regex. Exclude those table-target occurrences explicitly;
  // retain those table identifiers in referencedTables for the review.
  const prefix=source.slice(Math.max(0,hit.index-50),hit.index)
  if(name===ownName||/\binto\s*$/i.test(prefix))continue
  calls.push(name)
 }
 return [...new Set(calls)].sort()
}
function referencedTables(body){
 const source=body.replace(/--[^\r\n]*/g,'')
 return [...new Set([...source.matchAll(/\b(?:public|auth)[.]([a-z_][a-z0-9_]*)\b/gi)]
  .map(x=>x[0].toLowerCase()))].sort()
}
const expectedGuardLinks={
 [sigs.social_schedule_claim]:['social_schedule_rpc_check_projects_fixture','social_schedule_claim_unchecked_fixture'],
 [sigs.social_schedule_authorize_write]:['social_schedule_rpc_check_job_fixture','social_schedule_rpc_check_projects_fixture','social_schedule_authorize_unchecked_fixture'],
 [sigs.social_schedule_step]:['social_schedule_rpc_check_job_fixture','social_schedule_step_unchecked_fixture'],
 [sigs.social_schedule_peek]:['social_schedule_rpc_check_projects_fixture','social_schedule_peek_unchecked_fixture'],
 [sigs.social_schedule_receipt]:['social_schedule_rpc_check_job_fixture','social_schedule_receipt_unchecked_fixture'],
 [sigs.social_schedule_recover_checkpoint]:['social_schedule_rpc_check_job_fixture','social_schedule_recover_unchecked_fixture'],
}
export const reviewedRpcChainPins=Object.freeze({
 bodies:Object.freeze({
  'social_schedule_authorize_unchecked_fixture(jsonb,jsonb)': "e52e671a90846dcfd5fe2ec91458439cc77dcf1d1b6769a0dd6c31a942f0d53b",
  'social_schedule_authorize_write(jsonb,jsonb)': "0f6b1697f3186fc395b5bca3ed25f7e0930b9093ed807f8e936e88159edf547b",
  'social_schedule_claim_unchecked_fixture(jsonb)': "7510e14cd06717834c3a38c9cdbbd0b49d933e418498493cc5a7adb685327fbc",
  'social_schedule_claim(jsonb)': "feff1bdcab4e1badbd3d2aea55bdac6a5e475470a9de574fdeaa51d5eb5bb89d",
  'social_schedule_peek_unchecked_fixture(jsonb)': "4df9e6862aa6974de80ed1818fe44da8679028550305f9f79f46f5ccc4cbdda0",
  'social_schedule_peek(jsonb)': "ad5eedd07c11fe9a22202e6e21b663d15dabc47b00a568b3720653b01c607679",
  'social_schedule_receipt_unchecked_fixture(jsonb)': "26c2a184b8df941cdd49d9a348186740454dc8a995d305384d1295434663cdd6",
  'social_schedule_receipt(jsonb)': "6e42a04edb67e2e540730975151d9cef0bd2e79ce7c1b64de6ef4017b64ac283",
  'social_schedule_recover_checkpoint(jsonb)': "4b29973a1637207aff191126c31c01a7c61bf992d1dd8c0efa326bc2bc798211",
  'social_schedule_recover_unchecked_fixture(jsonb)': "d6398d28be7991d55dcbf74bae681aa35926bb1a5b09c0c5f5e1179bb50ae0c6",
  'social_schedule_rpc_check_job_fixture(jsonb)': "2fb82198d2ee03e7e24559b97f4bfa11d68d74db0c0bdea9957e3fe283ca4a64",
  'social_schedule_rpc_check_project_fixture(uuid)': "588f081e31e838206424e6fc2cfbcb426738520ce8378d0de2073fb77d82226e",
  'social_schedule_rpc_check_projects_fixture(jsonb)': "adf14ad1311bb4ab448608520710264cc8de8435033eeba634b0497015329031",
  'social_schedule_step_unchecked_fixture(jsonb,jsonb)': "1ffaf64588b21fc7036775446afb14d86abc118c11a808075b7850501c8202a2",
  'social_schedule_step(jsonb,jsonb)': "482ec802c1456e2a230cfb6fff3d48efc00d4afd4519223c868fdfe2aa833bbe",
 }),
 calls:Object.freeze({
  'social_schedule_authorize_unchecked_fixture(jsonb,jsonb)': ["social_schedule_authority","social_schedule_locked_claim"],
  'social_schedule_authorize_write(jsonb,jsonb)': ["social_schedule_authorize_unchecked_fixture","social_schedule_rpc_check_job_fixture","social_schedule_rpc_check_projects_fixture"],
  'social_schedule_claim_unchecked_fixture(jsonb)': ["calendar_source_gate_try_begin_probe","social_schedule_authority","social_schedule_fields","social_schedule_now","social_schedule_snapshot"],
  'social_schedule_claim(jsonb)': ["social_schedule_claim_unchecked_fixture","social_schedule_rpc_check_projects_fixture"],
  'social_schedule_peek_unchecked_fixture(jsonb)': ["social_schedule_authority","social_schedule_fields","social_schedule_now"],
  'social_schedule_peek(jsonb)': ["social_schedule_peek_unchecked_fixture","social_schedule_rpc_check_projects_fixture"],
  'social_schedule_receipt_unchecked_fixture(jsonb)': ["social_publication_record","social_schedule_fields","social_schedule_snapshot"],
  'social_schedule_receipt(jsonb)': ["social_schedule_receipt_unchecked_fixture","social_schedule_rpc_check_job_fixture"],
  'social_schedule_recover_checkpoint(jsonb)': ["social_schedule_recover_unchecked_fixture","social_schedule_rpc_check_job_fixture"],
  'social_schedule_recover_unchecked_fixture(jsonb)': ["calendar_source_gate_begin_probe","social_schedule_fields","social_schedule_now","social_schedule_receipt"],
  'social_schedule_rpc_check_job_fixture(jsonb)': ["social_schedule_rpc_check_project_fixture"],
  'social_schedule_rpc_check_project_fixture(uuid)': [],
  'social_schedule_rpc_check_projects_fixture(jsonb)': ["social_schedule_rpc_check_project_fixture"],
  'social_schedule_step_unchecked_fixture(jsonb,jsonb)': ["social_schedule_authority","social_schedule_fields","social_schedule_locked_claim","social_schedule_now","social_schedule_receipt"],
  'social_schedule_step(jsonb,jsonb)': ["social_schedule_rpc_check_job_fixture","social_schedule_step_unchecked_fixture"],
 }),
 references:Object.freeze({
  'social_schedule_authorize_unchecked_fixture(jsonb,jsonb)': ["public.social_schedule_authority","public.social_schedule_authorize_unchecked_fixture","public.social_schedule_jobs","public.social_schedule_locked_claim"],
  'social_schedule_authorize_write(jsonb,jsonb)': ["public.social_schedule_authorize_unchecked_fixture","public.social_schedule_authorize_write","public.social_schedule_rpc_check_job_fixture","public.social_schedule_rpc_check_projects_fixture"],
  'social_schedule_claim_unchecked_fixture(jsonb)': ["public.calendar_source_gate_try_begin_probe","public.projects","public.social_monthly_release_evidence","public.social_publication_events","public.social_publications","public.social_schedule_authority","public.social_schedule_claim_unchecked_fixture","public.social_schedule_decisions","public.social_schedule_events","public.social_schedule_fields","public.social_schedule_jobs","public.social_schedule_now","public.social_schedule_snapshot"],
  'social_schedule_claim(jsonb)': ["public.social_schedule_claim","public.social_schedule_claim_unchecked_fixture","public.social_schedule_rpc_check_projects_fixture"],
  'social_schedule_peek_unchecked_fixture(jsonb)': ["public.social_schedule_authority","public.social_schedule_fields","public.social_schedule_jobs","public.social_schedule_now","public.social_schedule_peek_unchecked_fixture"],
  'social_schedule_peek(jsonb)': ["public.social_schedule_peek","public.social_schedule_peek_unchecked_fixture","public.social_schedule_rpc_check_projects_fixture"],
  'social_schedule_receipt_unchecked_fixture(jsonb)': ["public.social_publication_record","public.social_publications","public.social_schedule_fields","public.social_schedule_jobs","public.social_schedule_receipt_unchecked_fixture","public.social_schedule_snapshot"],
  'social_schedule_receipt(jsonb)': ["public.social_schedule_receipt","public.social_schedule_receipt_unchecked_fixture","public.social_schedule_rpc_check_job_fixture"],
  'social_schedule_recover_checkpoint(jsonb)': ["public.social_schedule_recover_checkpoint","public.social_schedule_recover_unchecked_fixture","public.social_schedule_rpc_check_job_fixture"],
  'social_schedule_recover_unchecked_fixture(jsonb)': ["public.calendar_source_gate_begin_probe","public.projects","public.social_publication_events","public.social_publications","public.social_schedule_events","public.social_schedule_fields","public.social_schedule_jobs","public.social_schedule_now","public.social_schedule_receipt","public.social_schedule_recover_unchecked_fixture"],
  'social_schedule_rpc_check_job_fixture(jsonb)': ["public.social_schedule_jobs","public.social_schedule_rpc_check_job_fixture","public.social_schedule_rpc_check_project_fixture"],
  'social_schedule_rpc_check_project_fixture(uuid)': ["public.social_schedule_rpc_check_project_fixture","public.social_schedule_rpc_scope_fixture"],
  'social_schedule_rpc_check_projects_fixture(jsonb)': ["public.social_schedule_rpc_check_project_fixture","public.social_schedule_rpc_check_projects_fixture"],
  'social_schedule_step_unchecked_fixture(jsonb,jsonb)': ["public.social_publication_events","public.social_publications","public.social_schedule_authority","public.social_schedule_decisions","public.social_schedule_events","public.social_schedule_fields","public.social_schedule_jobs","public.social_schedule_locked_claim","public.social_schedule_now","public.social_schedule_receipt","public.social_schedule_step_unchecked_fixture"],
  'social_schedule_step(jsonb,jsonb)': ["public.social_schedule_rpc_check_job_fixture","public.social_schedule_step","public.social_schedule_step_unchecked_fixture"],
 }),
})
export function auditSchedulerRpcChain(snapshot,{
 pins=reviewedRpcChainPins,requirePins=false,
}={}){
 assert.ok(snapshot&&Array.isArray(snapshot.functions)&&snapshot.meta?.fixtureOnly===true,
  'missing isolated scheduler RPC catalog provenance')
 const entries=snapshot.functions
 assert.deepEqual(entries.map(x=>x.signature).sort(),privilegedChainSignatures,
  'calendar RPC/unchecked/guard function inventory changed')
 assert.equal(new Set(entries.map(x=>x.signature)).size,entries.length,
  'duplicate function signatures in callable inventory')
 const report=[]
 const entryNames=new Set(Object.values(sigs))
 const receiptSet=new Set([sigs.social_schedule_receipt,internals.social_schedule_receipt])
 for(const f of entries){
  const name=signatureName(f.signature)
  const expectedEntry=entryNames.has(f.signature)
  assert.equal(f.definer,true,'calendar worker callable lost owner-only execution')
  assert.equal(f.owner,'supabase_admin','unexpected privileged calendar RPC owner')
  assert.equal(f.language,'plpgsql','unreviewed procedural language')
  assert.deepEqual(f.configuration,['search_path=""'],'calendar RPC search_path drift')
  assert.equal(f.volatility,receiptSet.has(f.signature)?'s':'v',
   'unexpected SQL volatility / side-effect classification')
  assert.equal(f.publicExecute,false,'PUBLIC can EXECUTE privileged calendar function')
  assert.ok(typeof f.body==='string'&&f.body.length>300,
   'missing function body '+f.signature)
  for(const role of new Set(roles)){
   const expected=expectedEntry&&role==='social_schedule_rpc_only_fixture'
   assert.equal(f.grants?.[role],expected,
    'privileged callee directly callable by '+role+': '+f.signature)
  }
  const source=f.body.replace(/--[^\r\n]*/g,'')
  assert.doesNotMatch(source,/\b(?:execute|dblink|set_config|copy|pg_read_file|pg_ls_dir)\b/i,
   'dynamic SQL / dangerous helper needs review '+f.signature)
  const calls=referencedCalls(f.body,name)
  if(expectedEntry){
   assert.deepEqual(calls,expectedGuardLinks[f.signature].slice().sort(),
    'outer RPC scope gate or privileged callee changed: '+f.signature)
  }
  const refs=referencedTables(f.body)
  const digest=sha(f.body)
  if(requirePins){
   assert.equal(digest,pins.bodies?.[f.signature],
    'privileged calendar function definition changed: '+f.signature)
   assert.deepEqual(calls,pins.calls?.[f.signature],
    'unreviewed direct qualified SQL function call: '+f.signature)
   assert.deepEqual(refs,pins.references?.[f.signature],
    'unreviewed qualified SQL data access: '+f.signature)
  }
  report.push({signature:f.signature,sha256:digest,directCalls:calls,references:refs,
   exposedToWorker:expectedEntry})
 }
 const allNames=new Set(entries.map(x=>signatureName(x.signature)))
 // A direct call to a renamed unchecked function is permitted ONLY inside
 // the reviewed wrapper bodies; any other function needs explicit re-review.
 for(const item of report){
  for(const name of item.directCalls){
   if(name.endsWith('_unchecked_fixture'))
    assert.ok(entryNames.has(item.signature)&&
      expectedGuardLinks[item.signature].includes(name),
      'unreviewed direct unchecked helper caller: '+item.signature)
  }
 }
 assert.deepEqual(report.filter(x=>x.exposedToWorker).map(x=>x.signature).sort(),
  schedulerCallableSignatures,'worker callable function drift')
 assert.equal(allNames.size,15,'signature overload/alias changed')
 return Object.freeze({
  reviewedPrivilegedBodies:report,
  exposedWorkerRpcs:schedulerCallableSignatures,
  privilegedUncheckedBodies:6,
  scopeGuards:3,
  auditKind:'bounded_static_callchain',
 })
}
export function buildSchedulerRpcChainCatalogQuery(){
 const quoted=privilegedChainSignatures.map(x=>"'"+x+"'").join(',')
 const grants=[...new Set(roles)].map(role=>
  "'"+role+"',has_function_privilege('"+role+"',p.oid,'EXECUTE')").join(',')
 return `SELECT jsonb_build_object(
  'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'signature',p.oid::regprocedure::text,
    'definer',p.prosecdef,
    'owner',pg_get_userbyid(p.proowner),
    'language',l.lanname,'volatility',p.provolatile,
    'configuration',coalesce(to_jsonb(p.proconfig),'[]'::jsonb),
    'body',pg_get_functiondef(p.oid),
    'publicExecute',coalesce((SELECT bool_or(g.grantee=0 AND g.privilege_type='EXECUTE')
     FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g),false),
    'grants',jsonb_build_object(${grants})
  ) ORDER BY p.oid::regprocedure::text),'[]'::jsonb)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_language l ON l.oid=p.prolang
  WHERE n.nspname='public' AND p.oid::regprocedure::text IN (${quoted})),
  'meta',jsonb_build_object('fixtureOnly',true)
 )`
}
