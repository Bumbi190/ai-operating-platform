import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareFirstRealNqEsIntake,auditCandidateDatabentoJsonl} from './databento-first-day-gate.mjs'

const verified={
 observedAt:'2026-10-19T14:20:34.8041245Z',
 kind:'DATABENTO_HISTORICAL_FREE_METADATA_QUOTE',
 status:'FREE_METADATA_ONLY_COMPLETE',reason:null,
 downloadedRecords:0,billableEndpointsCalled:0,downloadAuthorized:false,
 dataset:'GLBX.MDP3',schema:'ohlcv-1m',
 start:'2026-10-15T00:00:00Z',end:'2026-10-16T00:00:00Z',
 instruments:[
  {root:'NQ',rawSymbol:'NQZ6',instrumentId:'261401',mappingStart:'2026-10-15',mappingEnd:'2026-10-16'},
  {root:'ES',rawSymbol:'ESZ6',instrumentId:'10252',mappingStart:'2026-10-15',mappingEnd:'2026-10-16'}
 ],
 quotes:[
  {root:'NQ',rawSymbol:'NQZ6',estimateUSD:0.0050380826},
  {root:'ES',rawSymbol:'ESZ6',estimateUSD:0.0050380826}
 ],
 combinedEstimatedUSD:0.010076165,estimateOnly:true
}
const plan=prepareFirstRealNqEsIntake(verified)
const row=(sym='NQZ6',id=261401,minute=0,options={})=>({
 hd:{
  ts_event:new Date(Date.parse('2026-10-15T14:00:00Z')+minute*60000)
    .toISOString().replace('.000Z','.000000000Z'),
  rtype:33,instrument_id:id,publisher_id:1
 },
 symbol:sym,open:'100.000000000',high:'102.000000000',
 low:'99.500000000',close:'101.250000000',volume:123,...options
})
const raw=(...bars)=>bars.map(x=>JSON.stringify(x)).join('\n')+'\n'
test('DAY-01 real metadata quote for both explicitly verified NQ and ES yields non-executable plan',()=>{
 assert.equal(plan.status,'PLAN_READY_AWAITING_SEPARATE_APPROVAL')
 assert.equal(plan.instruments[0].instrumentId,'261401')
 assert.equal(plan.instruments[1].instrumentId,'10252')
 assert.equal(plan.vendorEstimatedCombinedUSD,'0.010076165')
 assert.equal(plan.proposedHardLimitUSD,'0.02')
 assert.equal(plan.operatorApproved,false)
 assert.equal(plan.canExecutePaidRequest,false)
 assert.equal(plan.canDownload,false)
 assert.equal(plan.sourceSettled,false)
})
test('DAY-02 explicit paid endpoints described but never callable by this module',()=>{
 assert.equal(plan.dataRequestEndpoint,'/v0/timeseries.get_range')
 assert.equal(plan.dataRequestMethod,'POST')
 assert.equal(plan.downloadRequests.length,2)
 for(const r of plan.downloadRequests){
  assert.equal(r.dataset,'GLBX.MDP3')
  assert.equal(r.schema,'ohlcv-1m')
  assert.equal(r.encoding,'json')
  assert.equal(r.compression,'none')
  assert.equal(r.pretty_ts,'true')
  assert.equal(r.pretty_px,'true')
  assert.equal(r.map_symbols,'true')
  assert.equal(r.limit,'1800')
  assert.equal(r.start,'2026-10-15T00:00:00Z')
  assert.equal(r.end,'2026-10-16T00:00:00Z')
 }
})
test('DAY-03 pretending operator approves at call site does not enable paid requests',()=>{
 const p=prepareFirstRealNqEsIntake(verified,{
  operatorApproved:true,termsReviewed:true,proposedHardLimitUSD:'1.00'
 })
 assert.equal(p.status,'PLAN_READY_AWAITING_SEPARATE_APPROVAL')
 assert.equal(p.operatorApproved,false)
 assert.equal(p.canExecutePaidRequest,false)
 assert.equal(p.canDownload,false)
})
test('DAY-04 quote with wrong identity, stale day or asymmetric symbols blocks',()=>{
 for(const q of [
  {...verified,status:'BLOCKED'},
  {...verified,dataset:'CME.MDP3'},
  {...verified,start:'2026-10-14T00:00:00Z'},
  {...verified,instruments:[verified.instruments[0]]},
  {...verified,quotes:[verified.quotes[0]]},
  {...verified,instruments:[
   {...verified.instruments[0],instrumentId:'9999999999'},
   verified.instruments[1]
  ]},
  {...verified,downloadAuthorized:true},
  {...verified,observedAt:'2025-10-19T00:00:00Z'}
 ]){
  assert.equal(prepareFirstRealNqEsIntake(q).status,'BLOCKED')
 }
})
test('DAY-05 tight proposed hard limit fails closed while 0.02 allows the quote',()=>{
 assert.equal(prepareFirstRealNqEsIntake(verified,{proposedHardLimitUSD:'0.009'}).status,'BLOCKED')
 assert.equal(prepareFirstRealNqEsIntake(verified,{proposedHardLimitUSD:'0.02'}).status,'PLAN_READY_AWAITING_SEPARATE_APPROVAL')
})
test('DAY-06 corrupted or mismatched quote total fails closed',()=>{
 for(const v of [0,0.01,0.014,'invalid']){
  assert.equal(prepareFirstRealNqEsIntake({...verified,combinedEstimatedUSD:v}).status,'BLOCKED')
 }
})
test('DAY-07 valid raw Databento NQ JSON lines keep exact source SHA and need calendar verification',()=>{
 const blob=raw(row(),row('NQZ6',261401,1),row('NQZ6',261401,2))
 const r=auditCandidateDatabentoJsonl(plan,'NQZ6',blob)
 assert.equal(r.status,'RAW_JSONL_VALIDATED_CALENDAR_PENDING')
 assert.equal(r.observedBarCount,3)
 assert.equal(r.gapMinutesBetweenObservedBars,0)
 assert.match(r.sha256,/^[a-f0-9]{64}$/)
 assert.equal(r.exchangeCalendarVerified,false)
 assert.equal(r.sourceSettled,false)
 assert.equal(r.canFeedCanonicalTrading,false)
 assert.equal(r.canAuthorizeExecution,false)
})
test('DAY-08 real no-trade minute becomes explicit potential coverage gap, never fake candle',()=>{
 const r=auditCandidateDatabentoJsonl(plan,'NQZ6',
  raw(row(),row('NQZ6',261401,2)))
 assert.equal(r.status,'RAW_JSONL_VALIDATED_CALENDAR_PENDING')
 assert.equal(r.observedBarCount,2)
 assert.equal(r.gapMinutesBetweenObservedBars,1)
 assert.equal(r.exchangeCalendarVerified,false)
})
test('DAY-09 rejects spoofed ES/NQ instrument ID or mismatched symbol',()=>{
 const a=auditCandidateDatabentoJsonl(plan,'ESZ6',raw(row()))
 const b=auditCandidateDatabentoJsonl(plan,'ESZ6',raw(row('ESZ6',261401)))
 const c=auditCandidateDatabentoJsonl(plan,'NQZ6',raw(row('ESZ6',10252)))
 assert.equal(a.status,'BLOCKED')
 assert.equal(b.status,'BLOCKED')
 assert.equal(c.status,'BLOCKED')
 const es=auditCandidateDatabentoJsonl(plan,'ESZ6',raw(row('ESZ6',10252)))
 assert.equal(es.status,'RAW_JSONL_VALIDATED_CALENDAR_PENDING')
})
test('DAY-10 duplicate or out-of-order bars fail closed',()=>{
 assert.equal(auditCandidateDatabentoJsonl(plan,'NQZ6',raw(row(),row())).reason,
  'DUPLICATE_OR_OUT_OF_ORDER_BAR')
 assert.equal(auditCandidateDatabentoJsonl(plan,'NQZ6',
  raw(row('NQZ6',261401,2),row('NQZ6',261401,1))).reason,
  'DUPLICATE_OR_OUT_OF_ORDER_BAR')
})
test('DAY-11 malformed, truncated or empty provider files fail closed',()=>{
 for(const blob of ['', 'not-json\n',JSON.stringify(row())]){
  assert.equal(auditCandidateDatabentoJsonl(plan,'NQZ6',blob).status,'BLOCKED')
 }
})
test('DAY-12 OHLC prices must be exact decimal strings, not unsafe floats or impossible',()=>{
 for(const change of [
  {open:100.5},{high:'98.0'}, {volume:-1},
  {low:'102.000000001'}, {close:'0'},
  {close:'9223372036.854775807'}, {volume:1e17}
 ]){
  const r=auditCandidateDatabentoJsonl(plan,'NQZ6',raw(row('NQZ6',261401,0,change)))
  assert.equal(r.status,'BLOCKED',JSON.stringify(change))
 }
})
test('DAY-13 refuse incomplete/out-of-window timestamp and wrong record type',()=>{
 for(const change of [
  {rtype:32},
  {ts_event:'2026-10-16T00:00:00.000000000Z'},
  {ts_event:'2026-10-15T14:00:30.000000000Z'}
 ]){
  const item=row()
  item.hd={...item.hd,...change}
  assert.equal(auditCandidateDatabentoJsonl(plan,'NQZ6',raw(item)).status,'BLOCKED')
 }
})
test('DAY-14 cap records & raw bytes, never bypass reject if plan mutated',()=>{
 const over=' '.repeat(4_000_001)
 assert.equal(auditCandidateDatabentoJsonl(plan,'NQZ6',over).status,'BLOCKED')
 assert.equal(auditCandidateDatabentoJsonl({...plan,status:'READY_TO_PURCHASE'},
  'NQZ6',raw(row())).status,'BLOCKED')
 assert.equal(auditCandidateDatabentoJsonl({...plan,canExecutePaidRequest:true},
  'NQZ6',raw(row())).status,'BLOCKED')
})
test('DAY-15 deterministic report, source does not contain HTTP requests or trading engine',()=>{
 assert.deepEqual(prepareFirstRealNqEsIntake(verified),plan)
 assert.equal(Object.isFrozen(plan),true)
 assert.equal(Object.isFrozen(plan.instruments),true)
 assert.equal(plan.backtestCompleted,false)
 assert.equal(plan.tradingEnabled,false)
 assert.equal(plan.termsReviewed,false)
})
