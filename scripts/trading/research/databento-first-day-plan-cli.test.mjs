import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {generateIntakePlan} from './databento-first-day-plan-cli.mjs'
const fixture={
 observedAt:'2026-10-19T14:20:34.8041245Z',kind:'DATABENTO_HISTORICAL_FREE_METADATA_QUOTE',
 status:'FREE_METADATA_ONLY_COMPLETE',reason:null,downloadedRecords:0,
 billableEndpointsCalled:0,downloadAuthorized:false,dataset:'GLBX.MDP3',schema:'ohlcv-1m',
 start:'2026-10-15T00:00:00Z',end:'2026-10-16T00:00:00Z',
 instruments:[
  {root:'NQ',rawSymbol:'NQZ6',instrumentId:'261401',mappingStart:'2026-10-15',mappingEnd:'2026-10-16'},
  {root:'ES',rawSymbol:'ESZ6',instrumentId:'10252',mappingStart:'2026-10-15',mappingEnd:'2026-10-16'}],
 quotes:[
  {root:'NQ',rawSymbol:'NQZ6',estimateUSD:0.0050380826},
  {root:'ES',rawSymbol:'ESZ6',estimateUSD:0.0050380826}],
 combinedEstimatedUSD:0.010076165
}
async function sandbox(fn){
 const base=await mkdtemp(join(tmpdir(),'omnira-previews-data-intake-'))
 const quote=join(base,'Quote_Result_Public.json')
 const out=join(base,'previews','snapshot')
 await writeFile(quote,'\uFEFF'+JSON.stringify(fixture),'utf8')
 try{await fn({base,quote,out})}finally{await rm(base,{recursive:true,force:true})}
}
test('PLANCLI-01: real-shaped free quote safely generates a non-executable plan and public SHA',async()=>{
 await sandbox(async({quote,out})=>{
  const r=await generateIntakePlan({quotePath:quote,outDir:out})
  assert.equal(r.status,'PLAN_READY_AWAITING_SEPARATE_APPROVAL')
  assert.equal(r.contractCount,2)
  assert.equal(r.combinedEstimateUSD,'0.010076165')
  assert.equal(r.downloadedRecords,0)
  assert.equal(r.userApprovedPaidRequest,false)
  assert.match(r.quotePublicFileSha256,/^[a-f0-9]{64}$/)
  const j=JSON.parse(await readFile(r.file,'utf8'))
  assert.equal(j.canExecutePaidRequest,false)
  assert.equal(j.canDownload,false)
  assert.equal(j.dataRequestEndpoint,'/v0/timeseries.get_range')
  assert.deepEqual(j.instruments.map(x=>x.instrumentId),['261401','10252'])
 })
})
test('PLANCLI-02: no overwrite or duplicate pay request after plan creation',async()=>{
 await sandbox(async({quote,out})=>{
  await generateIntakePlan({quotePath:quote,outDir:out})
  await assert.rejects(generateIntakePlan({quotePath:quote,outDir:out}),e=>e.code==='EEXIST')
 })
})
test('PLANCLI-03: quote file must be named public metadata only',async()=>{
 await sandbox(async({base,out})=>{
  await assert.rejects(generateIntakePlan({quotePath:join(base,'.env'),outDir:out}),
   /PUBLIC_METADATA_QUOTE_REQUIRED/)
 })
})
test('PLANCLI-04: refuse arbitrary repository destination',async()=>{
 await sandbox(async({quote,base})=>{
  await assert.rejects(generateIntakePlan({
   quotePath:quote,outDir:join(base,'ai-operating-platform','scripts')
  }),/OUTPUT_MUST_BE_A_NONREPO_PREVIEW_OR_TEMP_DIRECTORY/)
 })
})
test('PLANCLI-05: blocked and tampered quote cannot create intake plan',async()=>{
 await sandbox(async({quote,out})=>{
  await writeFile(quote,JSON.stringify({...fixture,status:'BLOCKED'}))
  await assert.rejects(generateIntakePlan({quotePath:quote,outDir:out}),
   /IMPORT_PLAN_BLOCKED_VERIFIED_FREE_QUOTE_REQUIRED/)
 })
})
test('PLANCLI-06: malformed quote JSON never creates an approval or files',async()=>{
 await sandbox(async({quote,out})=>{
  await writeFile(quote,'{')
  await assert.rejects(generateIntakePlan({quotePath:quote,outDir:out}),
   /INVALID_QUOTE_JSON/)
 })
})
