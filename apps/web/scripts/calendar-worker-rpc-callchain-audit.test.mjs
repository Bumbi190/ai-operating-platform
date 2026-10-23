import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {
 auditSchedulerRpcChain,buildSchedulerRpcChainCatalogQuery,
 privilegedChainSignatures,schedulerCallableSignatures,reviewedRpcChainPins,
} from './calendar-worker-rpc-callchain-audit.mjs'

const roles=['anon','authenticated','service_role',
 'social_schedule_rpc_only_fixture','social_schedule_broker_intent_fixture',
 'social_schedule_broker_review_fixture','social_schedule_operator_review_fixture']
const links={
 'social_schedule_claim(jsonb)':['social_schedule_rpc_check_projects_fixture','social_schedule_claim_unchecked_fixture'],
 'social_schedule_authorize_write(jsonb,jsonb)':['social_schedule_rpc_check_job_fixture','social_schedule_rpc_check_projects_fixture','social_schedule_authorize_unchecked_fixture'],
 'social_schedule_step(jsonb,jsonb)':['social_schedule_rpc_check_job_fixture','social_schedule_step_unchecked_fixture'],
 'social_schedule_peek(jsonb)':['social_schedule_rpc_check_projects_fixture','social_schedule_peek_unchecked_fixture'],
 'social_schedule_receipt(jsonb)':['social_schedule_rpc_check_job_fixture','social_schedule_receipt_unchecked_fixture'],
 'social_schedule_recover_checkpoint(jsonb)':['social_schedule_rpc_check_job_fixture','social_schedule_recover_unchecked_fixture'],
}
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex')
function sample(){
 const functions=privilegedChainSignatures.map(signature=>{
  const exposed=schedulerCallableSignatures.includes(signature)
  const name=signature.split('(')[0]
  const body='CREATE OR REPLACE FUNCTION public.'+name+
   '() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$\n'+
   (links[signature]??[]).map(x=>'  PERFORM public.'+x+'(null);\n').join('')+
   '  SELECT true;\n'.repeat(35)+' END $$;'
  return {
   signature,owner:'supabase_admin',definer:true,language:'plpgsql',
   configuration:['search_path=""'],
   volatility:name.includes('receipt')?'s':'v',
   body,publicExecute:false,
   grants:Object.fromEntries(roles.map(role=>[
    role,exposed&&role==='social_schedule_rpc_only_fixture',
   ])),
  }
 })
 const snapshot={functions,meta:{fixtureOnly:true}}
 const report=auditSchedulerRpcChain(snapshot)
 const pins={bodies:Object.fromEntries(report.reviewedPrivilegedBodies.map(
  f=>[f.signature,f.sha256])),
  calls:Object.fromEntries(report.reviewedPrivilegedBodies.map(
  f=>[f.signature,f.directCalls])),
  references:Object.fromEntries(report.reviewedPrivilegedBodies.map(
  f=>[f.signature,f.references])),
 }
 return {snapshot,pins}
}
test('bounded catalog must include six wrappers, six owner-privileged unchecked callees, three scope guards',()=>{
 const {snapshot,pins}=sample()
 const result=auditSchedulerRpcChain(snapshot,{pins,requirePins:true})
 assert.equal(result.reviewedPrivilegedBodies.length,15)
 assert.equal(result.privilegedUncheckedBodies,6)
 assert.equal(result.scopeGuards,3)
 assert.deepEqual(result.exposedWorkerRpcs,schedulerCallableSignatures)
})
test('wrong definer ownership, search path, lifetime and unexpected grants fail before execution',()=>{
 const changes=[
  s=>s.functions.pop(),
  s=>s.functions.push({...s.functions[0],signature:'social_schedule_fake(jsonb)'}),
  s=>s.functions[0].owner='authenticated',
  s=>s.functions[0].definer=false,
  s=>s.functions[0].language='sql',
  s=>s.functions[0].configuration=['search_path=public'],
  s=>s.functions[0].volatility='s',
  s=>s.functions[0].publicExecute=true,
  s=>s.functions[0].grants.authenticated=true,
  s=>s.functions[0].grants.service_role=true,
  s=>s.functions.find(f=>f.signature.includes('_unchecked_fixture')).grants.social_schedule_rpc_only_fixture=true,
  s=>s.functions.find(f=>f.signature.includes('_check_project_fixture')).grants.social_schedule_rpc_only_fixture=true,
 ]
 for(const apply of changes){
  const {snapshot,pins}=sample();apply(snapshot)
  assert.throws(()=>auditSchedulerRpcChain(snapshot,{pins,requirePins:true}))
 }
})
test('scope guard removal, extra unchecked invocation or unknown direct table calls fail closed',()=>{
 const mutations=[
  s=>s.functions.find(f=>f.signature==='social_schedule_claim(jsonb)')
   .body=s.functions.find(f=>f.signature==='social_schedule_claim(jsonb)').body
   .replace('public.social_schedule_rpc_check_projects_fixture','public.unchecked_bypass'),
  s=>s.functions.find(f=>f.signature==='social_schedule_step(jsonb,jsonb)')
   .body+=' PERFORM public.social_schedule_step_unchecked_fixture(null);',
  s=>s.functions.find(f=>f.signature==='social_schedule_claim_unchecked_fixture(jsonb)')
   .body+=' PERFORM public.social_schedule_step_unchecked_fixture(null);',
  s=>s.functions[0].body+=' SELECT * FROM public.platform_tokens;',
  s=>s.functions[0].body+=' EXECUTE format(\'DELETE FROM public.platform_tokens\');',
  s=>s.functions[0].body+=' SELECT 0;',
 ]
 for(const change of mutations){
  const {snapshot,pins}=sample();change(snapshot)
  assert.throws(()=>auditSchedulerRpcChain(snapshot,{pins,requirePins:true}))
 }
})
test('INSERT INTO a qualified table is classified as data access, not a callable function',()=>{
 const {snapshot}=sample()
 const functionUnderTest=snapshot.functions.find(x=>x.signature==='social_schedule_claim_unchecked_fixture(jsonb)')
 functionUnderTest.body+='\n INSERT INTO public.social_schedule_events(project_id) VALUES (null);'
 const audit=auditSchedulerRpcChain(snapshot)
 const item=audit.reviewedPrivilegedBodies.find(x=>x.signature===functionUnderTest.signature)
 assert.equal(item.directCalls.includes('social_schedule_events'),false)
 assert.equal(item.references.includes('public.social_schedule_events'),true)
})
test('default SQL source pins are complete for all 15 owner-privileged functions',()=>{
 const expected=privilegedChainSignatures.slice().sort()
 for(const map of [reviewedRpcChainPins.bodies,
  reviewedRpcChainPins.calls,reviewedRpcChainPins.references]){
  assert.deepEqual(Object.keys(map).sort(),expected)
 }
 assert.ok(Object.values(reviewedRpcChainPins.bodies).every(x=>/^[a-f0-9]{64}$/.test(x)))
 assert.deepEqual(reviewedRpcChainPins.calls['social_schedule_claim(jsonb)'],
  ['social_schedule_claim_unchecked_fixture','social_schedule_rpc_check_projects_fixture'])
 assert.ok(!reviewedRpcChainPins.calls['social_schedule_step_unchecked_fixture(jsonb,jsonb)']
  .includes('social_publications'),'table writes must not be misclassified as SQL calls')
})
test('privileged catalog query is pure read, includes actual ACLs, 15 signatures and bodies',()=>{
 const query=buildSchedulerRpcChainCatalogQuery()
 for(const required of [
  'pg_proc','pg_namespace','pg_language','pg_get_functiondef',
  'aclexplode','has_function_privilege','prosecdef','proconfig',
  'social_schedule_claim_unchecked_fixture',
  'social_schedule_rpc_check_project_fixture',
 ]){
  assert.ok(query.includes(required),required)
 }
 assert.doesNotMatch(query,/\b(?:create|insert|delete|alter|grant|revoke|drop|truncate)\s+(?:table|function|role)\b/i)
})
