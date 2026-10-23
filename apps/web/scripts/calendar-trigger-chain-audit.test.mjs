import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {
 auditCalendarTriggerChain,buildCalendarTriggerChainQuery,
 trackedCalendarTriggerEntries,triggerChainFingerprints,
} from './calendar-trigger-chain-audit.mjs'

const sha=x=>createHash('sha256').update(x,'utf8').digest('hex')
const gateBody=`CREATE OR REPLACE FUNCTION public.calendar_source_gate_begin_probe(uuid)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
 AS $$ BEGIN
 SELECT key FROM calendar_gate_private_probe.secret;
 SELECT revision FROM public.calendar_source_revision_probe for update;
 SELECT 'omnira.calendar_gate_probe_v1' AS marker;
 END $$;`
function fixture(){
 const triggers=trackedCalendarTriggerEntries.map(
  ([table,trigger,signature,definer,eventBits])=>({
   table,trigger,signature,definer,eventBits,enabled:'O',
   owner:'supabase_admin',language:'plpgsql',searchPath:['search_path=""'],
   triggerSql:'CREATE TRIGGER '+trigger+' '+eventBits+
     ' ON public.'+table+' EXECUTE FUNCTION public.'+signature,
   body:'CREATE OR REPLACE FUNCTION public.'+signature+
     ' RETURNS trigger LANGUAGE plpgsql SECURITY '+(definer?'DEFINER':'INVOKER')+
     " SET search_path TO '' AS $$ BEGIN SELECT 1; RETURN NULL; END $$;",
  }))
 const gate=[{signature:'calendar_source_gate_begin_probe(uuid)',
  definer:true,owner:'supabase_admin',language:'plpgsql',
  searchPath:['search_path=""'],body:gateBody}]
 const expected={functions:{},triggers:{},gate:sha(gateBody)}
 for(const entry of triggers){
  expected.functions[entry.signature]=sha(entry.body)
  expected.triggers[entry.table+'.'+entry.trigger]=sha(entry.triggerSql)
 }
 return {snapshot:{triggers,gate},expected}
}
test('static audit locks the expected trigger fan-out, callback bodies and HMAC gate',()=>{
 const {snapshot,expected}=fixture()
 const x=auditCalendarTriggerChain(snapshot,{expected,requireFingerprints:true})
 assert.equal(x.triggers.length,15)
 assert.equal(x.functions.length,8)
 assert.equal(x.gate.signature,'calendar_source_gate_begin_probe(uuid)')
 assert.equal(x.boundedStaticAudit,true)
})
test('trigger expansion, removal, retargeting, disabling and timing drift all fail closed',()=>{
 const modifications=[
  s=>s.triggers.pop(),
  s=>s.triggers.push({...s.triggers[0],trigger:'evil_after_write'}),
  s=>s.triggers[0].signature='social_schedule_step(jsonb,jsonb)',
  s=>s.triggers[0].enabled='D',
  s=>s.triggers[0].eventBits=0,
  s=>s.triggers[0].table='platform_tokens',
 ]
 for(const modify of modifications){
  const {snapshot,expected}=fixture();modify(snapshot)
  assert.throws(()=>auditCalendarTriggerChain(snapshot,{
   expected,requireFingerprints:true,
  }))
 }
})
test('unreviewed trigger code, caller privileges, function source or gate lock changes are denied',()=>{
 const mods=[
  s=>s.triggers[0].definer=!s.triggers[0].definer,
  s=>s.triggers[0].owner='authenticated',
  s=>s.triggers[0].language='sql',
  s=>s.triggers[0].searchPath=['search_path=public'],
  s=>s.triggers[0].triggerSql+=' WHEN (TRUE)',
  s=>s.triggers[0].body+=' SELECT public.platform_tokens;',
  s=>s.gate[0].body+=' SELECT public.platform_tokens;',
  s=>s.gate[0].body=s.gate[0].body.replace('for update',''),
  s=>s.gate[0].definer=false,
  s=>s.gate.push({...s.gate[0]}),
 ]
 for(const mod of mods){
  const {snapshot,expected}=fixture();mod(snapshot)
  assert.throws(()=>auditCalendarTriggerChain(snapshot,{
   expected,requireFingerprints:true,
  }))
 }
})
test('reviewed default fingerprints are complete and specific',()=>{
 assert.equal(Object.keys(triggerChainFingerprints.functions).length,8)
 assert.equal(Object.keys(triggerChainFingerprints.triggers).length,15)
 assert.match(triggerChainFingerprints.gate,/^[a-f0-9]{64}$/)
 assert.ok(Object.values(triggerChainFingerprints.functions).every(x=>/^[a-f0-9]{64}$/.test(x)))
 assert.ok(Object.values(triggerChainFingerprints.triggers).every(x=>/^[a-f0-9]{64}$/.test(x)))
})
test('read-only SQL is catalog-derived and includes all scheduled and operator audit trigger tables',()=>{
 const sql=buildCalendarTriggerChainQuery()
 for(const part of [
  'pg_trigger','pg_proc','pg_class','pg_namespace',
  'pg_get_functiondef','pg_get_triggerdef','tgenabled','prosecdef',
  'social_schedule_operator_review_events_fixture',
  'social_schedule_jobs','social_publications','projects',
 ])
  assert.ok(sql.includes(part),part)
 assert.match(sql,/^SELECT jsonb_build_object/)
 assert.doesNotMatch(sql,/\b(?:alter|create|drop|grant|revoke|truncate)\s+(?:role|table|function|trigger)\b/i)
})
