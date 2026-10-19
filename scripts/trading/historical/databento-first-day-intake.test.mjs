import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,existsSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {FIRST_DAY,validateLocalQuote,validateOhlcvJsonLines,
 importFirstRealHistoricalDay} from './databento-first-day-intake.mjs'

const key='db-'+'A'.repeat(29)
const q={
 status:'FREE_METADATA_ONLY_COMPLETE',dataset:'GLBX.MDP3',
 schema:'ohlcv-1m',start:FIRST_DAY.start,end:FIRST_DAY.end,
 downloadedRecords:0,billableEndpointsCalled:0,downloadAuthorized:false,
 instruments:FIRST_DAY.symbols.map(s=>({
  root:s.root,rawSymbol:s.symbol,instrumentId:s.instrumentId,
  mappingStart:'2026-10-15',mappingEnd:'2026-10-16'
 })),
 quotes:FIRST_DAY.symbols.map(s=>({
  root:s.root,rawSymbol:s.symbol,estimateUSD:s.quotedUSD
 })),
 combinedEstimatedUSD:0.010076165
}
const mkrows=(spec,n=120)=>{
 const lines=[]
 const start=Date.parse(FIRST_DAY.start)
 for(let i=0;i<n;i++){
  const price=spec.root==='NQ'?24000:7000
  const time=new Date(start+i*60000).toISOString().replace('.000Z','.000000000Z')
  lines.push(JSON.stringify({
   hd:{ts_event:time,rtype:33,publisher_id:1,
     instrument_id:Number(spec.instrumentId)},
   symbol:spec.symbol,open:(price+i*0.25).toFixed(9),
   high:(price+i*0.25+0.5).toFixed(9),
   low:(price+i*0.25-0.25).toFixed(9),
   close:(price+i*0.25+0.25).toFixed(9),
   volume:1000+i
  }))
 }
 return lines.join('\n')+'\n'
}
function mock(options={}){
 const calls=[]
 const fetchFn=async(url,settings)=>{
  const u=new URL(url)
  assert.equal(u.hostname,'hist.databento.com')
  assert.equal(u.protocol,'https:')
  assert.ok(settings.headers.Authorization.startsWith('Basic '))
  const isPaid=u.pathname==='/v0/timeseries.get_range'
  const params=isPaid?new URLSearchParams(settings.body):u.searchParams
  const symbol=params.get('symbols')
  const spec=FIRST_DAY.symbols.find(s=>s.symbol===symbol)
  assert.ok(spec,'invalid requested symbol')
  assert.equal(params.get('dataset'),'GLBX.MDP3')
  assert.equal(params.get('schema'),'ohlcv-1m')
  assert.equal(params.get('start'),FIRST_DAY.start)
  assert.equal(params.get('end'),FIRST_DAY.end)
  calls.push({method:settings.method,path:u.pathname,symbol})
  if(!isPaid){
   assert.equal(settings.method,'GET')
   return {ok:true,text:async()=>JSON.stringify(options.increasedQuote&&symbol==='NQZ6'?0.02:spec.quotedUSD)}
  }
  assert.equal(settings.method,'POST')
  assert.equal(params.get('encoding'),'json')
  assert.equal(params.get('pretty_px'),'true')
  assert.equal(params.get('pretty_ts'),'true')
  assert.equal(params.get('map_symbols'),'true')
  if(options.failPaid&&symbol==='NQZ6'){
   return {ok:false,status:429}
  }
  const text=options.badData&&symbol==='NQZ6'?'CORRUPTED\n':mkrows(spec)
  const bytes=new TextEncoder().encode(text)
  const body=new ReadableStream({
   start(controller){controller.enqueue(bytes);controller.close()}
  })
  return {ok:true,body}
 }
 return {fetchFn,calls}
}
const tmp=()=>mkdtempSync(join(tmpdir(),'omnira-real-day-test-'))
test('HIST-01 local quote pins exact date, both contracts and $0.010076165 cost',()=>{
 assert.equal(validateLocalQuote(q).verified,true)
 assert.equal(validateLocalQuote(q).localQuotedUSD,0.010076165)
 assert.throws(()=>validateLocalQuote({...q,combinedEstimatedUSD:0.02}),/COST_INCREASE/)
 assert.throws(()=>validateLocalQuote({...q,downloadAuthorized:true}),/QUOTED_DAY/)
 assert.throws(()=>validateLocalQuote({...q,quotes:q.quotes.map(x=>({...x,estimateUSD:1}))}),/COST_INCREASE/)
})
test('HIST-02 checks original contract ID mapping before network or disk side-effects',async()=>{
 const dir=tmp()
 try{
  const m=mock()
  await assert.rejects(()=>importFirstRealHistoricalDay({
   key,localQuote:{...q,instruments:[{...q.instruments[0],instrumentId:'55'},q.instruments[1]]},
   outputDirectory:join(dir,'out'),fetchFn:m.fetchFn
  }),/QUOTED_CONTRACT_MAPPING_MISMATCH_NQ/)
  assert.equal(m.calls.length,0)
  assert.equal(existsSync(join(dir,'out')),false)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('HIST-03 successfully saves raw immutable provider rows, parsed bars, and manifest',async()=>{
 const dir=tmp()
 try{
  const m=mock()
  const out=join(dir,'once')
  const r=await importFirstRealHistoricalDay({key,localQuote:q,
   outputDirectory:out,fetchFn:m.fetchFn})
  assert.equal(r.status,'REAL_HISTORICAL_BAR_FILES_READY_UNVERIFIED_SESSION')
  assert.equal(r.reverifiedEstimateUSD,0.0100761652)
  assert.equal(r.paidRequestsInitiated,2)
  assert.equal(r.symbols.length,2)
  assert.deepEqual(m.calls.map(x=>x.path),[
   '/v0/metadata.get_cost','/v0/metadata.get_cost',
   '/v0/timeseries.get_range','/v0/timeseries.get_range'
  ])
  for(const s of r.symbols){
   assert.equal(s.barCount,120)
   assert.ok(/^[0-9a-f]{64}$/.test(s.rawSha256))
   const bars=JSON.parse(readFileSync(join(out,s.barsFile),'utf8'))
   assert.equal(bars.bars.length,120)
   assert.equal(bars.source,'REAL_DATABENTO_HISTORICAL')
   assert.equal(bars.sessionCalendarVerified,false)
   assert.ok(existsSync(join(out,s.rawFile)))
  }
  assert.equal(r.backtestCompleted,false)
  assert.equal(r.winRate,null)
  assert.equal(r.tradeExecutionEnabled,false)
  await assert.rejects(()=>importFirstRealHistoricalDay({key,localQuote:q,
   outputDirectory:out,fetchFn:m.fetchFn}),/EEXIST/)
  assert.equal(m.calls.filter(x=>x.path.includes('timeseries')).length,2)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('HIST-04 changed quote aborts BEFORE ANY billable calls',async()=>{
 const dir=tmp()
 try{
  const m=mock({increasedQuote:true})
  await assert.rejects(()=>importFirstRealHistoricalDay({
   key,localQuote:q,outputDirectory:join(dir,'once'),fetchFn:m.fetchFn
  }),/COST_INCREASE/)
  assert.equal(m.calls.length,1)
  assert.ok(m.calls.every(x=>x.path==='/v0/metadata.get_cost'))
  assert.equal(existsSync(join(dir,'once')),false)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('HIST-05 failed paid HTTP call leaves failed closed marker and no retries',async()=>{
 const dir=tmp()
 try{
  const m=mock({failPaid:true})
  await assert.rejects(()=>importFirstRealHistoricalDay({
   key,localQuote:q,outputDirectory:join(dir,'once'),fetchFn:m.fetchFn
  }),/PAID_DATA_HTTP_429/)
  assert.equal(m.calls.filter(x=>x.path.includes('timeseries')).length,1)
  const j=JSON.parse(readFileSync(join(dir,'once','manifest.json'),'utf8'))
  assert.equal(j.status,'FAILED_CLOSED_NO_AUTORETRY')
  assert.equal(j.paidRequestsInitiated,1)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('HIST-06 invalid dataset content after billable stream blocks second paid call',async()=>{
 const dir=tmp()
 try{
  const m=mock({badData:true})
  await assert.rejects(()=>importFirstRealHistoricalDay({
   key,localQuote:q,outputDirectory:join(dir,'once'),fetchFn:m.fetchFn
  }),/UNEXPECTED_1M_RECORD_COUNT/)
  assert.equal(m.calls.filter(x=>x.path.includes('timeseries')).length,1)
  assert.equal(existsSync(join(dir,'once','NQZ6_2026-10-15.raw.jsonl')),false)
  assert.equal(JSON.parse(readFileSync(join(dir,'once','manifest.json'),'utf8')).status,
   'FAILED_CLOSED_NO_AUTORETRY')
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('HIST-07 strict tick size, contract ID, time, and candle completeness',()=>{
 const spec=FIRST_DAY.symbols[0]
 const ok=mkrows(spec)
 assert.equal(validateOhlcvJsonLines(ok,spec).candleCount,120)
 const wrongId=ok.replace('"instrument_id":261401','"instrument_id":123456')
 assert.throws(()=>validateOhlcvJsonLines(wrongId,spec),/MISMATCHED_SCHEMA_OR_INSTRUMENT_ID/)
 const offTick=ok.replace('"open":"24000.000000000"','"open":"24000.100000000"')
 assert.throws(()=>validateOhlcvJsonLines(offTick,spec),/PRICE_OFF_EXCHANGE_TICK/)
 const badTime=ok.replace('2026-10-15T00:00:00.000000000Z','2026-10-16T00:00:00.000000000Z')
 assert.throws(()=>validateOhlcvJsonLines(badTime,spec),/BAR_OUT_OF_APPROVED_DATE/)
})
test('HIST-08 rejects even well-formed provider rows if symbol differs',()=>{
 const spec=FIRST_DAY.symbols[0]
 const wrong=mkrows(spec).replace('"symbol":"NQZ6"','"symbol":"ESZ6"')
 assert.throws(()=>validateOhlcvJsonLines(wrong,spec),/SYMBOL_MISMATCH/)
})
test('HIST-09 does not carry secrets or real price bytes to GitHub itself',()=>{
 const src=readFileSync(new URL('./databento-first-day-intake.mjs',import.meta.url),'utf8')
 assert.doesNotMatch(src,/new\s+WebSocket|submitOrder|ApprovalGrant|RiskClearance/)
 assert.equal(src.includes("'/v0/timeseries.get_range'"),true)
 assert.equal(src.includes('PAID_DATA_HTTP_'),true)
 assert.equal(src.includes('FAILED_CLOSED_NO_AUTORETRY'),true)
})
