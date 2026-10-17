import {test} from 'node:test'
import assert from 'node:assert/strict'
import {recordTrialMetricSnapshot} from '../../web/lib/media/the-prompt-trial-snapshot'

const projectId='11111111-1111-4111-8111-111111111111'
const scriptId='22222222-2222-4222-8222-222222222222'
const base={
 projectId,scriptId,platform:'instagram' as const,creativeVersion:'text_motion',
 publishedAt:'2026-10-19T08:00:00Z',fetchedAt:'2026-10-20T08:00:00Z',
 views:55,likes:1,shares:2,
}
function fixture(fail=false){
 const calls:Array<Record<string,unknown>>=[]
 const db={
  from(table:string){
   assert.equal(table,'media_pilot_metric_snapshots')
   return {async upsert(row:Record<string,unknown>,opt:{onConflict:string,ignoreDuplicates:boolean}){
    calls.push({...row,...opt})
    return {error:fail?{message:'no table'}:null}
   }}
  },
 }
 return {db,calls}
}
const settings={enabled:'true',projectId}
test('default disabled does no DB writes',async()=>{
 const f=fixture()
 assert.equal(await recordTrialMetricSnapshot(f.db,base,{enabled:undefined,projectId}), 'disabled')
 assert.equal(f.calls.length,0)
})
test('only same project and valid creative variant can append snapshots',async()=>{
 const f=fixture()
 assert.equal(await recordTrialMetricSnapshot(f.db,base,{enabled:'true',projectId:'33333333-3333-4333-8333-333333333333'}),'out_of_scope')
 assert.equal(await recordTrialMetricSnapshot(f.db,{...base,creativeVersion:null},settings),'not_a_trial_post')
 assert.equal(await recordTrialMetricSnapshot(f.db,{...base,creativeVersion:'legacy'},settings),'not_a_trial_post')
 assert.equal(f.calls.length,0)
})
test('real timestamp, platform and measured values preserved; no arbitrary zero-filling',async()=>{
 const f=fixture()
 assert.equal(await recordTrialMetricSnapshot(f.db,base,settings),'recorded')
 assert.equal(f.calls.length,1)
 assert.equal(f.calls[0].views,55)
 assert.equal(f.calls[0].likes,1)
 assert.equal(f.calls[0].comments,null)
 assert.equal(f.calls[0].saved,null)
 assert.equal(f.calls[0].shares,2)
 assert.equal(f.calls[0].creative_version,'text_motion')
 assert.equal(f.calls[0].onConflict,'project_id,script_id,platform,fetched_at')
 assert.equal(f.calls[0].ignoreDuplicates,true)
})
test('invalid or negative values never enter snapshot ledger',async()=>{
 const f=fixture()
 assert.equal(await recordTrialMetricSnapshot(f.db,{...base,views:-3},settings),'invalid_measurement')
 assert.equal(await recordTrialMetricSnapshot(f.db,{...base,fetchedAt:'2026-10-18T08:00:00Z'},settings),'invalid_measurement')
 assert.equal(await recordTrialMetricSnapshot(f.db,{...base,shares:Number.NaN},settings),'invalid_measurement')
 assert.equal(f.calls.length,0)
})
test('missing planned migration produces explicit persistence error only if enabled',async()=>{
 const f=fixture(true)
 await assert.rejects(()=>recordTrialMetricSnapshot(f.db,base,settings),/PILOT_SNAPSHOT_PERSISTENCE_FAILED/)
 assert.equal(f.calls.length,1)
})
