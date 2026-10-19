/**
 * Databento HISTORICAL metadata-only preflight — research, no billed endpoints.
 *
 * Endpoints on strict allowlist:
 *   POST hist.databento.com/v0/symbology.resolve  (free metadata, form data)
 *   GET hist.databento.com/v0/metadata.get_cost   (free estimate)
 *
 * NEVER requests timeseries.get_range, batch.submit_job, live data, or data.
 * Does not create an account, assume license, buy, download, authorize orders,
 * or save an API key. CLI defaults to OFFLINE DRY RUN.
 *
 * The candidate raw symbols (NQZ6, ESZ6) are NOT verified contract mappings
 * until symbology.resolve confirms them for the exact historical day.
 */
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'

const DATASET='GLBX.MDP3'
const SCHEMA='ohlcv-1m'
const BASE='https://hist.databento.com'
const DAY='2026-10-15' // archived day, safely >24 h before 2026-10-19
const NEXT='2026-10-16'
const INSTRUMENTS=Object.freeze([
 Object.freeze({root:'NQ',candidateRawSymbol:'NQZ6'}),
 Object.freeze({root:'ES',candidateRawSymbol:'ESZ6'})
])
const APPROVED_ENDPOINTS=Object.freeze([
 '/v0/symbology.resolve','/v0/metadata.get_cost'
])
const no=s=>Object.freeze({status:'BLOCKED',reason:s,downloadAuthorized:false})
const safeId=value=>typeof value==='string'&&/^[0-9]{1,10}$/.test(value)&&
 BigInt(value)>0n&&BigInt(value)<=4294967295n
const params=p=>new URLSearchParams(p)

export function dryRunPlan(){
 return Object.freeze({
  status:'METADATA_READY_NEEDS_ACCOUNT',
  dataset:DATASET,schema:SCHEMA,
  start:DAY+'T00:00:00Z',end:NEXT+'T00:00:00Z',
  symbols:INSTRUMENTS,
  authConfigured:false,
  contractMappingsVerified:false,
  actualQuotesUSD:null,
  requiresUserPermissionBeforeDownload:true,
  chargeableEndpointsReachable:false,
  noMonthlySubscriptionRequiredForHistorical:true,
  allowedFreeMethods:APPROVED_ENDPOINTS
 })
}

export async function probeHistoricalMetadata({
 apiKey,fetchFn=fetch
}={}){
 if(typeof apiKey!=='string'||!/^db-[A-Za-z0-9_-]{20,}$/.test(apiKey))
   return no('DATABENTO_API_KEY_NOT_CONFIGURED')
 if(typeof fetchFn!=='function')return no('NO_TRANSPORT')
 const authorized='Basic '+Buffer.from(apiKey+':','utf8').toString('base64')
 const request=async(path,query)=>{
  if(!APPROVED_ENDPOINTS.includes(path))throw Error('UNAPPROVED_ENDPOINT')
  const u=new URL(path,BASE)
  if(u.protocol!=='https:'||u.hostname!=='hist.databento.com')throw Error('INVALID_HOST')
  // Databento historical API: symbology.resolve is POST form encoded;
  // metadata.get_cost is GET with querystring. BOTH are free metadata.
  const isResolve=path==='/v0/symbology.resolve'
  const encoded=params(query).toString()
  if(!isResolve)u.search=encoded
  const response=await fetchFn(u.toString(),{
   method:isResolve?'POST':'GET',redirect:'error',
   headers:{
    Authorization:authorized,Accept:'application/json',
    ...(isResolve?{'Content-Type':'application/x-www-form-urlencoded'}:{})
   },
   ...(isResolve?{body:encoded}:{}),
   signal:AbortSignal.timeout(20000)
  })
  if(!response.ok)throw Error('METADATA_ENDPOINT_HTTP_'+response.status)
  const size=response.headers?.get?.('content-length')
  if(size&&Number(size)>100000)return no('METADATA_RESULT_TOO_LARGE')
  const raw=await response.text()
  if(raw.length>100000)return no('METADATA_RESULT_TOO_LARGE')
  try{return JSON.parse(raw)}catch{throw Error('INVALID_METADATA_JSON')}
 }
 try{
  const mappings=[]
  for(const {root,candidateRawSymbol} of INSTRUMENTS){
   const mapping=await request('/v0/symbology.resolve',{
    dataset:DATASET,symbols:candidateRawSymbol,
    stype_in:'raw_symbol',stype_out:'instrument_id',
    start_date:DAY,end_date:NEXT
   })
   if(mapping?.status==='BLOCKED')return mapping
   if(mapping?.status!==0||!Array.isArray(mapping?.not_found)||mapping.not_found.length||
     !Array.isArray(mapping?.partial)||mapping.partial.length)
     return no('SYMBOL_NOT_FULLY_RESOLVED_'+root)
   const entries=mapping?.result?.[candidateRawSymbol]
   if(!Array.isArray(entries)||entries.length!==1||!safeId(entries[0]?.s)||
     typeof entries[0]?.d0!=='string'||typeof entries[0]?.d1!=='string'||
     entries[0].d0>DAY||entries[0].d1<NEXT)
     return no('NO_SINGLE_DAY_SCOPED_INSTRUMENT_'+root)
   mappings.push(Object.freeze({root,rawSymbol:candidateRawSymbol,
    instrumentId:entries[0].s,mappingStart:entries[0].d0,
    mappingEnd:entries[0].d1,source:'DATABENTO_SYMBOLOGY_METADATA_ONLY'}))
  }
  const quotes=[]
  for(const m of mappings){
   const result=await request('/v0/metadata.get_cost',{
    dataset:DATASET,symbols:m.rawSymbol,schema:SCHEMA,
    stype_in:'raw_symbol',start:DAY+'T00:00:00Z',end:NEXT+'T00:00:00Z'
   })
   if(result?.status==='BLOCKED')return result
   if(typeof result!=='number'||!Number.isFinite(result)||result<0)
     return no('COST_ESTIMATE_INVALID_'+m.root)
   quotes.push(Object.freeze({root:m.root,rawSymbol:m.rawSymbol,
    estimateUSD:result,estimateOnly:true}))
  }
  return Object.freeze({
   status:'FREE_METADATA_ONLY_COMPLETE',
   dataset:DATASET,schema:SCHEMA,
   start:DAY+'T00:00:00Z',end:NEXT+'T00:00:00Z',
   instruments:Object.freeze(mappings),quotes:Object.freeze(quotes),
   combinedEstimatedUSD:Number(quotes.reduce((a,q)=>a+q.estimateUSD,0).toFixed(9)),
   estimateMayDifferFromFinalBilling:true,
   userHasApprovedPurchase:false,
   vendorDataAccessEntitlementVerified:false,
   historicalUsageTermsReviewed:false,
   downloadedRecords:0,
   billableEndpointsCalled:0,
   downloadAuthorized:false,
   realBacktestExecuted:false,
  })
 }catch(e){
  return no('METADATA_PROBE_FAILED_'+String(e?.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'_').slice(0,80))
 }
}

const invoked=process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])
if(invoked){
 const mode=process.argv[2]??'--dry-run'
 if(mode==='--dry-run'){
  console.log(JSON.stringify(dryRunPlan(),null,2))
 }else if(mode==='--metadata-only'){
  const result=await probeHistoricalMetadata({apiKey:process.env.DATABENTO_API_KEY})
  console.log(JSON.stringify(result,null,2))
  if(result.status!=='FREE_METADATA_ONLY_COMPLETE')process.exitCode=2
 }else{
  console.error('Only --dry-run or --metadata-only are supported. No download command exists.')
  process.exitCode=2
 }
}
