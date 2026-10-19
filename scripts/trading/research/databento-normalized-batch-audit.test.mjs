import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {auditNormalizedHistoricalInterval} from './databento-normalized-batch-audit.mjs'
import {inspectNormalizedOhlcv1m, prepareHistoricalQuote} from './databento-historical-preflight.mjs'

const contract = {root:'NQ',cycle:{year:2026,quarterMonth:12}}
const from = '2026-10-01T14:00:00Z'
const to = '2026-10-01T15:00:00Z'
const mapping={
 dataset:'GLBX.MDP3',schema:'ohlcv-1m',stypeIn:'raw_symbol',rawSymbol:'NQZ6',
 contract,evidenceId:'VERIFIED-SYNTHETIC-ONLY-2026',instrumentId:91001,publisherId:1,
 validFrom:'2026-09-01T00:00:00Z',validTo:'2026-12-01T00:00:00Z'
}
function row(offset=0, patch={}) {
 const ts=BigInt(Date.parse(from)+offset*60000)*1000000n
 return {
  dataset:'GLBX.MDP3',schema:'ohlcv-1m',rtype:33,
  ts_event_ns:ts.toString(),publisher_id:1,instrument_id:91001,
  open_nano:'20000250000000',high_nano:'20001250000000',
  low_nano:'19999250000000',close_nano:'20000500000000',volume:'123',
  ...patch
 }
}
const audit=(rows,opts={})=>auditNormalizedHistoricalInterval({contract,from,to,mapping,rows,...opts})

test('A-01: a valid synthetic batch is REVIEW_ONLY and explicitly not canonical data',()=>{
 const v=audit([row(0),row(2),row(4)])
 assert.equal(v.status,'REVIEW_ONLY')
 assert.equal(v.rowsExamined,3)
 assert.equal(v.intervalMinuteCount,60)
 assert.equal(v.unobservedCandidateMinutes,57)
 assert.equal(v.firstUnobservedSample.length,5)
 assert.equal(v.firstUnobservedSample[0],'2026-10-01T14:01:00.000Z')
 assert.equal(v.firstUnobservedSample[1],'2026-10-01T14:03:00.000Z')
 assert.equal(v.sourceState,'UNKNOWN')
 assert.equal(v.dataSourceVerified,false)
 assert.equal(v.exchangeCalendarVerified,false)
 assert.equal(v.canBecomeStrategyEvidence,false)
 assert.equal(v.purchaseAllowed,false)
 assert.equal(v.downloadAllowed,false)
})
test('A-02: missing minutes are candidates, never filled synthetic candles or claimed exchange closures',()=>{
 const v=audit([row(0),row(59)])
 assert.equal(v.status,'REVIEW_ONLY')
 assert.equal(v.rowsExamined,2)
 assert.equal(v.unobservedCandidateMinutes,58)
 assert.equal(v.firstUnobservedSample[0],'2026-10-01T14:01:00.000Z')
 assert.equal(v.firstUnobservedSample.length,5)
 assert.equal(Object.hasOwn(v,'candles'),false)
 assert.equal(Object.hasOwn(v,'completeness'),false)
})
test('A-03: no rows is NOT proof the exchange was closed',()=>{
 const v=audit([])
 assert.equal(v.status,'REVIEW_ONLY')
 assert.equal(v.rowsExamined,0)
 assert.equal(v.unobservedCandidateMinutes,60)
 assert.equal(v.sourceState,'UNKNOWN')
 assert.equal(v.exchangeCalendarVerified,false)
})
test('A-04: duplicate minute is blocked before any report can be emitted',()=>{
 const v=audit([row(0),row(0)])
 assert.equal(v.status,'BLOCKED')
 assert.equal(v.reason,'DUPLICATE_MINUTE_OPEN')
 assert.equal(v.recordIndex,1)
})
test('A-05: unordered inputs are not sorted or repaired',()=>{
 const v=audit([row(2),row(1)])
 assert.equal(v.status,'BLOCKED')
 assert.equal(v.reason,'UNORDERED_MINUTE_OPEN')
 assert.equal(v.recordIndex,1)
})
test('A-06: out of range, even exactly end, is refused',()=>{
 assert.equal(audit([row(60)]).reason,'ROW_OUTSIDE_REQUEST_WINDOW')
 assert.equal(audit([row(-1)]).reason,'ROW_OUTSIDE_REQUEST_WINDOW')
})
test('A-07: malformed OHLC, mismatch and invalid timestamp block with record index',()=>{
 assert.deepEqual([audit([row(0,{high_nano:'1'})]).reason,
   audit([row(0,{publisher_id:9})]).reason,
   audit([row(0,{ts_event_ns:'0'})]).reason],
   ['INVALID_OHLC_ORDER','INSTRUMENT_OR_PUBLISHER_MISMATCH','POINT_IN_TIME_MAPPING_NOT_VERIFIED'])
 for(const r of [
  row(0,{open_nano: '9223372036854775807'}),
  row(0,{high_nano: '9223372036854775807'}),
  row(0,{low_nano: '9223372036854775807'}),
  row(0,{close_nano: '9223372036854775807'}),
 ]){
  const report=audit([r])
  assert.equal(report.status,'BLOCKED')
  assert.equal(report.reason,'INVALID_EXACT_PRICE_OR_VOLUME')
  assert.equal(report.recordIndex,0)
 }
})
test('A-08: reject unrepresentable publisher and instrument id instead of trusting safe integer',()=>{
 assert.equal(audit([row()],{mapping:{...mapping,instrumentId:4294967296}}).status,'BLOCKED')
 assert.equal(audit([row()],{mapping:{...mapping,publisherId:65536}}).status,'BLOCKED')
 assert.equal(prepareHistoricalQuote({contract,from,to,mapping:{...mapping,instrumentId:4294967295}}).status,'READY_FOR_METADATA_QUOTE')
 assert.equal(prepareHistoricalQuote({contract,from,to,mapping:{...mapping,publisherId:65535}}).status,'READY_FOR_METADATA_QUOTE')
})
test('A-09: stable normalized checksum ignores JSON property insertion order',()=>{
 const rows=[row(0),row(2),row(4)]
 const reversed=rows.map(r=>Object.fromEntries(Object.entries(r).reverse()))
 const a=audit(rows), b=audit(reversed)
 assert.equal(a.status,'REVIEW_ONLY')
 assert.equal(a.normalizedFieldSequenceSha256,b.normalizedFieldSequenceSha256)
 assert.match(a.normalizedFieldSequenceSha256,/^[a-f0-9]{64}$/)
 assert.equal(a.digestKind,'NORMALIZED_FIELDS_NOT_RAW_PROVIDER_BYTES')
})
test('A-10: checksum changes on changed valid bar contents without altering price precision',()=>{
 const a=audit([row(0)])
 const b=audit([row(0,{close_nano:'20000600000000'})])
 assert.equal(a.status,'REVIEW_ONLY')
 assert.equal(b.status,'REVIEW_ONLY')
 assert.notEqual(a.normalizedFieldSequenceSha256,b.normalizedFieldSequenceSha256)
})
test('A-11: one sampled minute does not imply source-settled status',()=>{
 const v=audit([row(59)])
 assert.equal(v.status,'REVIEW_ONLY')
 assert.equal(v.sourceState,'UNKNOWN')
 assert.equal(v.dataSourceVerified,false)
 assert.equal(Object.hasOwn(v,'approval'),false)
})
test('A-12: wrong mapping, missing array, oversized array and invalid window fail closed',()=>{
 assert.equal(audit(undefined).reason,'ROWS_MISSING_OR_OVER_RESEARCH_LIMIT')
 assert.equal(audit([], {mapping:{...mapping,rawSymbol:'NQ.FUT'}}).reason,'EXPLICIT_POINT_IN_TIME_MAPPING_REQUIRED')
 assert.equal(audit([], {to:'2026-11-03T15:00:00Z'}).reason,'RESEARCH_WINDOW_EXCEEDS_31_DAYS')
 const many=new Array(44641).fill(row(0))
 assert.equal(audit(many).reason,'ROWS_MISSING_OR_OVER_RESEARCH_LIMIT')
})
test('A-13: reported volume zero is legitimate but not settledness evidence',()=>{
 const v=audit([row(0,{volume:'0'})])
 assert.equal(v.status,'REVIEW_ONLY')
 assert.equal(v.sourceState,'UNKNOWN')
 assert.equal(v.unobservedCandidateMinutes,59)
})
test('A-14: adjacent minute data is chronological and can cover entire 1h without proving license',()=>{
 const rows=Array.from({length:60},(_,i)=>row(i))
 const v=audit(rows)
 assert.equal(v.status,'REVIEW_ONLY')
 assert.equal(v.rowsExamined,60)
 assert.equal(v.unobservedCandidateMinutes,0)
 assert.equal(v.firstUnobservedSample.length,0)
 assert.equal(v.dataSourceVerified,false)
 assert.equal(v.canBecomeStrategyEvidence,false)
})
test('A-15: source code is strictly offline and cannot mint trading authority',()=>{
 const src=readFileSync(new URL('./databento-normalized-batch-audit.mjs',import.meta.url),'utf8')
  .replace(/\/\*[\s\S]*?\*\//g,'')
  .replace(/(^|[^:])\/\/.*$/gm,'$1')
 for(const pat of [
   /\bfetch\s*\(/,/https?:\/\//,/WebSocket/,/XMLHttpRequest/,
   /process\.env/,/apiKey/,/submitOrder/,/RiskClearance/,/ApprovalGrant/,
   /new URL\s*\(/,/readFileSync/,/writeFileSync/,/createWriteStream/,
 ]){
  assert.doesNotMatch(src,pat)
 }
 assert.match(src,/sourceState: 'UNKNOWN'/)
 assert.match(src,/canBecomeStrategyEvidence: false/)
})
test('A-16: malformed sentinel price directly in single-row adapter is blocked',()=>{
 const r=inspectNormalizedOhlcv1m(row(0,{open_nano:'9223372036854775807'}),mapping)
 assert.equal(r.reason,'INVALID_EXACT_PRICE_OR_VOLUME')
})
