import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {dryRunPlan,probeHistoricalMetadata} from './databento-free-metadata-only.mjs'

const key='db-'+'A'.repeat(29)
const entry=(s)=>({status:0,partial:[],not_found:[],result:{
  [s]:[{d0:'2026-10-01',d1:'2026-11-01',s:s==='NQZ6'?'301':'302'}]
}})
const asResponse=(value,status=200)=>({
 ok:status===200,status,headers:{get:()=>null},
 text:async()=>JSON.stringify(value)
})
const mock=(fn)=>(url,opts)=>{
 const u=new URL(url)
 assert.equal(u.protocol,'https:')
 assert.equal(u.hostname,'hist.databento.com')
 assert.equal(opts.method,'GET')
 assert.equal(opts.redirect,'error')
 assert.ok(opts.headers.Authorization.startsWith('Basic '))
 assert.ok(!url.includes('db-'))
 return fn(u,opts)
}
test('META-01 dry run requires no key, no network and no data download',()=>{
 const r=dryRunPlan()
 assert.equal(r.status,'METADATA_READY_NEEDS_ACCOUNT')
 assert.equal(r.authConfigured,false)
 assert.equal(r.contractMappingsVerified,false)
 assert.equal(r.actualQuotesUSD,null)
 assert.equal(r.chargeableEndpointsReachable,false)
 assert.deepEqual(r.symbols.map(x=>x.candidateRawSymbol),['NQZ6','ESZ6'])
})
test('META-02 no configured key returns blocked before any request',async()=>{
 let requests=0
 const r=await probeHistoricalMetadata({fetchFn:async()=>{requests++;throw Error('NO')}})
 assert.equal(r.status,'BLOCKED')
 assert.equal(r.reason,'DATABENTO_API_KEY_NOT_CONFIGURED')
 assert.equal(requests,0)
})
test('META-03 strictly four free metadata calls for NQ and ES, no paid path',async()=>{
 const calls=[]
 const fetchFn=mock((u)=>{
  calls.push(u)
  const s=u.searchParams.get('symbols')
  assert.ok(['NQZ6','ESZ6'].includes(s))
  assert.equal(u.searchParams.get('dataset'),'GLBX.MDP3')
  if(u.pathname==='/v0/symbology.resolve'){
   assert.equal(u.searchParams.get('stype_in'),'raw_symbol')
   assert.equal(u.searchParams.get('stype_out'),'instrument_id')
   assert.equal(u.searchParams.get('start_date'),'2026-10-15')
   assert.equal(u.searchParams.get('end_date'),'2026-10-16')
   return asResponse(entry(s))
  }
  if(u.pathname==='/v0/metadata.get_cost'){
   assert.equal(u.searchParams.get('schema'),'ohlcv-1m')
   assert.equal(u.searchParams.get('stype_in'),'raw_symbol')
   assert.equal(u.searchParams.get('start'),'2026-10-15T00:00:00Z')
   assert.equal(u.searchParams.get('end'),'2026-10-16T00:00:00Z')
   return asResponse(s==='NQZ6'?0.13:0.07)
  }
  throw Error('Chargeable or unexpected API endpoint '+u.pathname)
 })
 const r=await probeHistoricalMetadata({apiKey:key,fetchFn})
 assert.equal(r.status,'FREE_METADATA_ONLY_COMPLETE')
 assert.equal(r.downloadAuthorized,false)
 assert.equal(r.userHasApprovedPurchase,false)
 assert.equal(r.downloadedRecords,0)
 assert.equal(r.billableEndpointsCalled,0)
 assert.equal(r.combinedEstimatedUSD,0.2)
 assert.deepEqual(r.instruments.map(x=>x.instrumentId),['301','302'])
 assert.deepEqual(calls.map(x=>x.pathname),[
  '/v0/symbology.resolve','/v0/symbology.resolve',
  '/v0/metadata.get_cost','/v0/metadata.get_cost'
 ])
 assert.equal(r.historicalUsageTermsReviewed,false)
})
test('META-04 unresolved symbol stops before quote, never guesses a future contract',async()=>{
 let calls=0
 const fetchFn=mock(u=>{
  calls++
  if(u.searchParams.get('symbols')==='ESZ6')
    return asResponse({status:2,partial:[],not_found:['ESZ6'],result:{}})
  return asResponse(entry('NQZ6'))
 })
 const r=await probeHistoricalMetadata({apiKey:key,fetchFn})
 assert.equal(r.status,'BLOCKED')
 assert.equal(r.reason,'SYMBOL_NOT_FULLY_RESOLVED_ES')
 assert.equal(calls,2)
})
test('META-05 partial symbology mapping blocks quote despite present ID',async()=>{
 const fetchFn=mock(u=>asResponse({...entry(u.searchParams.get('symbols')),status:1,partial:['NQZ6']}))
 const r=await probeHistoricalMetadata({apiKey:key,fetchFn})
 assert.equal(r.status,'BLOCKED')
 assert.equal(r.reason,'SYMBOL_NOT_FULLY_RESOLVED_NQ')
})
test('META-06 multiple mappings or wrong-day mappings are rejected',async()=>{
 for(const item of [
  [{d0:'2026-10-01',d1:'2026-10-16',s:'10'},{d0:'2026-10-16',d1:'2026-11-01',s:'11'}],
  [{d0:'2026-10-16',d1:'2026-11-01',s:'10'}],
  [{d0:'2026-10-01',d1:'2026-10-15',s:'10'}],
  [{d0:'2026-10-01',d1:'2026-11-01',s:'4294967296'}]
 ]){
  const r=await probeHistoricalMetadata({apiKey:key,fetchFn:mock(u=>asResponse({
   status:0,partial:[],not_found:[],result:{[u.searchParams.get('symbols')]:item}
  }))})
  assert.equal(r.status,'BLOCKED')
  assert.equal(r.reason,'NO_SINGLE_DAY_SCOPED_INSTRUMENT_NQ')
 }
})
test('META-07 cannot interpret a malformed or negative quote as authorized data',async()=>{
 for(const bad of [-1,'0.12',{'usd':0.1},null]){
  const r=await probeHistoricalMetadata({apiKey:key,fetchFn:mock(u=>
    asResponse(u.pathname.includes('symbology')?entry(u.searchParams.get('symbols')):bad))})
  assert.equal(r.status,'BLOCKED')
  assert.equal(r.reason,'COST_ESTIMATE_INVALID_NQ')
 }
})
test('META-08 missing/invalid JSON or HTTP errors never turn into $0 quote',async()=>{
 for(const status of [401,403,429,500]){
  const r=await probeHistoricalMetadata({apiKey:key,fetchFn:mock(()=>asResponse({message:'failure'},status))})
  assert.equal(r.status,'BLOCKED')
  assert.ok(r.reason.includes('METADATA_ENDPOINT_HTTP_'+status))
 }
})
test('META-09 source never contains a download, live, batch, or trading route',()=>{
 const src=readFileSync(new URL('./databento-free-metadata-only.mjs',import.meta.url),'utf8')
 const routes=[...src.matchAll(/['"]\/v0\/([a-z_.]+)['"]/g)].map(x=>x[1])
 assert.deepEqual([...new Set(routes)].sort(),['metadata.get_cost','symbology.resolve'])
 assert.ok(!src.includes('timeseries.get_range('))
 assert.ok(!src.includes('batch.submit_job('))
 assert.ok(!src.includes('orders.place('))
})
test('META-10 importer has no API key persistence and CLI defaults to offline',()=>{
 const r=dryRunPlan()
 assert.equal(r.requiresUserPermissionBeforeDownload,true)
 assert.deepEqual(r.allowedFreeMethods,[
  '/v0/symbology.resolve','/v0/metadata.get_cost'
 ])
})
