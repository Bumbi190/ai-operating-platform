import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  prepareHistoricalQuote,
  reviewHistoricalQuote,
  inspectNormalizedOhlcv1m,
} from './databento-historical-preflight.mjs'

const CONTRACT={root:'NQ',cycle:{year:2026,quarterMonth:12}}
const FROM='2026-10-01T14:00:00Z'
const TO='2026-10-01T15:00:00Z'
const mapping={
  dataset:'GLBX.MDP3',schema:'ohlcv-1m',stypeIn:'raw_symbol',
  rawSymbol:'NQZ6',contract:CONTRACT,
  evidenceId:'VERIFIED-SYNTHETIC-ONLY-2026',
  instrumentId:91001,publisherId:1,
  validFrom:'2026-09-01T00:00:00Z',validTo:'2026-12-01T00:00:00Z',
}
const plan=(patch={})=>prepareHistoricalQuote({contract:CONTRACT,from:FROM,to:TO,mapping,...patch})
const ns=(t)=>String(BigInt(Date.parse(t))*1000000n)
const row={
  dataset:'GLBX.MDP3',schema:'ohlcv-1m',rtype:33,
  publisher_id:1,instrument_id:91001,ts_event_ns:ns(FROM),
  open_nano:'20000250000000',high_nano:'20001250000000',
  low_nano:'19999250000000',close_nano:'20000500000000',
  volume:'123'
}
test('Q-01: safe quote descriptor is never a downloadable request',()=>{
 const r=plan()
 assert.equal(r.status,'READY_FOR_METADATA_QUOTE')
 assert.equal(r.downloadAllowed,false)
 assert.equal(r.freeMetadataMethod,'metadata.get_cost')
 assert.deepEqual(r.quoteParameters,{
   dataset:'GLBX.MDP3',schema:'ohlcv-1m',stype_in:'raw_symbol',
   symbols:'NQZ6',start:FROM,end:TO
 })
 assert.equal(JSON.stringify(r).includes('db-'),false)
})
test('Q-02: cannot infer a contract from root or use continuous/parent symbology',()=>{
 assert.equal(plan({contract:'NQ'}).reason,'CONTRACT_NOT_VERIFIED')
 assert.equal(plan({mapping:{...mapping,stypeIn:'continuous'}}).status,'BLOCKED')
 assert.equal(plan({mapping:{...mapping,stypeIn:'parent',rawSymbol:'NQ.FUT'}}).status,'BLOCKED')
})
test('Q-03: precise point-in-time mapping and instrument ID required',()=>{
 assert.equal(plan({mapping:{...mapping,evidenceId:''}}).reason,'EXPLICIT_POINT_IN_TIME_MAPPING_REQUIRED')
 assert.equal(plan({mapping:{...mapping,contract:{root:'MNQ',cycle:CONTRACT.cycle}}}).status,'BLOCKED')
 assert.equal(plan({mapping:{...mapping,validFrom:'2026-10-02T00:00:00Z'}}).status,'BLOCKED')
 assert.equal(plan({mapping:{...mapping,instrumentId:0}}).status,'BLOCKED')
})
test('Q-04: rejects malformed and empty windows, and research scope above 31 days',()=>{
 assert.equal(plan({from:TO,to:FROM}).reason,'INVALID_MINUTE_WINDOW')
 assert.equal(plan({to:FROM}).reason,'INVALID_MINUTE_WINDOW')
 assert.equal(plan({to:'2026-10-01T15:00:30Z'}).reason,'INVALID_MINUTE_WINDOW')
 assert.equal(plan({to:'2026-11-03T15:00:00Z'}).reason,'RESEARCH_WINDOW_EXCEEDS_31_DAYS')
})
test('Q-05: no license review means no data authorization even under budget',()=>{
 const r=reviewHistoricalQuote(plan(),{
   quotedUSD:'0.25',limitUSD:'5',
   quoteAppliesToEvidenceId:mapping.evidenceId,
   licenseReview:'PENDING'
 })
 assert.equal(r.status,'BLOCKED')
 assert.equal(r.reason,'HISTORICAL_USAGE_RIGHTS_NOT_CONFIRMED')
})
test('Q-06: quote higher than budget refuses, using exact decimal arithmetic',()=>{
 const r=reviewHistoricalQuote(plan(),{
  quotedUSD:'0.300001',limitUSD:'0.30',
  quoteAppliesToEvidenceId:mapping.evidenceId,
  licenseReview:'CONFIRMED_FOR_SPECIFIC_HISTORICAL_USE'
 })
 assert.equal(r.reason,'COST_EXCEEDS_LIMIT')
})
test('Q-07: approved quote is STILL only for human review, never purchase',()=>{
 const r=reviewHistoricalQuote(plan(),{
  quotedUSD:'0.30',limitUSD:'0.30',
  quoteAppliesToEvidenceId:mapping.evidenceId,
  licenseReview:'CONFIRMED_FOR_SPECIFIC_HISTORICAL_USE'
 })
 assert.equal(r.status,'READY_FOR_HUMAN_REVIEW_ONLY')
 assert.equal(r.purchaseAllowed,false)
 assert.equal(r.downloadAllowed,false)
})
test('Q-08: quote evidence must match mapping and numeric quote must be supplied',()=>{
 assert.equal(reviewHistoricalQuote(plan(),{quotedUSD:'0.10',limitUSD:'2',licenseReview:'CONFIRMED_FOR_SPECIFIC_HISTORICAL_USE',quoteAppliesToEvidenceId:'VERIFIED-OTHER'}).reason,'QUOTE_EVIDENCE_MISMATCH')
 assert.equal(reviewHistoricalQuote(plan(),{quotedUSD:'1e4',limitUSD:'5'}).status,'BLOCKED')
})
test('B-01: exact nanounit OHLCV becomes a review-only candle, never SETTLED',()=>{
 const r=inspectNormalizedOhlcv1m(row,mapping)
 assert.equal(r.status,'UNTRUSTED_CANDLE_FOR_REVIEW')
 assert.equal(r.sourceState,'UNKNOWN')
 assert.equal(r.canBecomeStrategyEvidence,false)
 assert.deepEqual(r.candle,{
  openTime:'2026-10-01T14:00:00.000Z',
  open:'20000.25',high:'20001.25',
  low:'19999.25',close:'20000.5',volume:'123'
 })
})
test('B-02: no inferred source finality or exchange closure even for one valid candle',()=>{
 const r=inspectNormalizedOhlcv1m({...row,volume:'0'},mapping)
 assert.equal(r.candle.volume,'0')
 assert.equal(r.sourceState,'UNKNOWN')
 assert.equal(r.canBecomeStrategyEvidence,false)
 assert.equal(Object.hasOwn(r,'coverage'),false)
})
test('B-03: schema and record type must match GLBX.MDP3 OHLCV-1m',()=>{
 for(const broken of [{...row,rtype:32},{...row,schema:'trades'},{...row,dataset:'OTHER'}])
  assert.equal(inspectNormalizedOhlcv1m(broken,mapping).reason,'INVALID_DATASET_SCHEMA_OR_RTYPE')
})
test('B-04: no float, scientific-notation or invalid nanounit prices accepted',()=>{
 for(const price of [20000250000000,'2e14','200.25','999999999999999999999999999'])
  assert.equal(inspectNormalizedOhlcv1m({...row,open_nano:price},mapping).reason,'INVALID_EXACT_PRICE_OR_VOLUME')
})
test('B-05: nanosecond timestamp must be exactly a minute open',()=>{
 const shifted=(BigInt(row.ts_event_ns)+1n).toString()
 assert.equal(inspectNormalizedOhlcv1m({...row,ts_event_ns:shifted},mapping).reason,'INVALID_BAR_OPEN_NANOSECONDS')
})
test('B-06: wrong instrument or publisher cannot be accepted',()=>{
 assert.equal(inspectNormalizedOhlcv1m({...row,instrument_id:99999},mapping).reason,'INSTRUMENT_OR_PUBLISHER_MISMATCH')
 assert.equal(inspectNormalizedOhlcv1m({...row,publisher_id:2},mapping).reason,'INSTRUMENT_OR_PUBLISHER_MISMATCH')
})
test('B-07: source row outside the mapping period cannot be accepted',()=>{
 const bad={...mapping,validTo:'2026-10-01T14:00:30Z'}
 assert.equal(inspectNormalizedOhlcv1m(row,bad).reason,'POINT_IN_TIME_MAPPING_NOT_VERIFIED')
})
test('B-08: OHLC high low order remains a hard data fault',()=>{
 assert.equal(inspectNormalizedOhlcv1m({...row,high_nano:'19998250000000'},mapping).reason,'INVALID_OHLC_ORDER')
})
test('B-09: unknown or missing volume cannot be silently converted to zero',()=>{
 assert.equal(inspectNormalizedOhlcv1m({...row,volume:null},mapping).reason,'INVALID_EXACT_PRICE_OR_VOLUME')
 assert.equal(inspectNormalizedOhlcv1m({...row,volume:undefined},mapping).reason,'INVALID_EXACT_PRICE_OR_VOLUME')
})
test('B-10: synthetic fixture identity does not assert a real verified CME contract',()=>{
 const r=inspectNormalizedOhlcv1m(row,{...mapping,evidenceId:'UNVERIFIED'})
 assert.equal(r.status,'BLOCKED')
 assert.equal(r.canBecomeStrategyEvidence,undefined)
})
test('B-11: results have no API or execution grant',()=>{
 const r=inspectNormalizedOhlcv1m(row,mapping)
 for(const f of ['approval','ExecutionIntent','riskDecision','order','providerCall','canFetch','canExecute']){
  assert.equal(Object.hasOwn(r,f),false)
 }
})

test('S-01: research module cannot reach network, credentials or orders',()=>{
 const code=readFileSync(new URL('./databento-historical-preflight.mjs',import.meta.url),'utf8')
   .replace(/\/\*[\s\S]*?\*\//g,'')
   .replace(/(^|[^:])\/\/.*$/gm,'$1')
 for(const pattern of [
  /from\s+['"]node:(?:http|https|net|fs|child_process)/,
  /\brequire\s*\(/, /\bfetch\s*\(/, /\baxios\b/,
  /XMLHttpRequest/, /WebSocket/, /process\.env/,
  /\bsubmitOrder\b/, /\bplaceOrder\b/, /\bcheckout\b/,
  /new\s+URL\s*\(/,
 ]){
  assert.doesNotMatch(code,pattern)
 }
 assert.match(code,/downloadAllowed:false/)
 assert.match(code,/canBecomeStrategyEvidence:false/)
})
