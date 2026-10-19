/**
 * Omnira trading research — verified, explicitly NON-EXECUTABLE first-day
 * Databento historical data intake PLAN plus JSONL inspection.
 *
 * NO HTTP, no API key access, no purchases, no orders and no strategies.
 * Real historical data request is a SEPARATE, still unapproved future step.
 *
 * Source: verified local FREE metadata-only quote for 2026-10-15.
 * Databento timeseries.get_range accepts POST form parameters and charges for
 * data. JSON output is NDJSON, with the OHLCV ts_event at START OF MINUTE.
 *
 * This module does NOT establish market-session calendars or SETTLED state.
 */
import {createHash} from 'node:crypto'

const DATE='2026-10-15'
const START=DATE+'T00:00:00Z'
const END='2026-10-16T00:00:00Z'
const SYMBOLS=Object.freeze(['NQZ6','ESZ6'])
const ROOTS=Object.freeze(['NQ','ES'])
const DECIMAL=/^(?:0|[1-9]\d{0,5})(?:\.\d{1,12})?$/
const PRICE=/^(?:0|[1-9]\d{0,8})(?:\.\d{1,9})?$/
const MINUTE=60000
const SCALED_USD=1000000000000n
const block=code=>Object.freeze({status:'BLOCKED',reason:code,
 canExecutePaidRequest:false,historicalBarsLoaded:false,authorizedForStrategy:false})
const scaled=s=>{
 if(typeof s!=='string'||!DECIMAL.test(s))return null
 const [a,b='']=s.split('.')
 return BigInt(a)*SCALED_USD+BigInt(b.padEnd(12,'0'))
}
const isoMs=s=>{
 if(typeof s!=='string'||! /^\d{4}-\d\d-\d\dT\d\d:\d\d:00(?:\.0{1,9})?Z$/.test(s))return null
 const t=Date.parse(s)
 return Number.isFinite(t)&&t%MINUTE===0?t:null
}
const exactDecimal=v=>{
 if(typeof v!=='string'||!PRICE.test(v))return null
 const [a,b='']=v.split('.')
 return BigInt(a)*1000000000n+BigInt(b.padEnd(9,'0'))
}
const safeWhole=v=>{
 if(typeof v!=='number'&&typeof v!=='string')return null
 const s=String(v)
 if(!/^(?:0|[1-9]\d{0,16})$/.test(s))return null
 const n=BigInt(s)
 return n<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n):null
}
/**
 * Quote itself came from free Databento symbology.resolve / metadata.get_cost.
 * Account credit cannot be confirmed from this quote, and final cost may differ.
 */
export function prepareFirstRealNqEsIntake(quote,{
 proposedHardLimitUSD='0.02',termsReviewed=false,operatorApproved=false
}={}){
 // operatorApproved is intentionally ignored: this planner grants no
 // authority, even if a caller tries to set a flag.
 if(!quote||quote.kind!=='DATABENTO_HISTORICAL_FREE_METADATA_QUOTE'||
  quote.status!=='FREE_METADATA_ONLY_COMPLETE'||quote.reason!==null||
  quote.downloadAuthorized!==false||quote.billableEndpointsCalled!==0||
  quote.downloadedRecords!==0)return block('VERIFIED_FREE_QUOTE_REQUIRED')
 if(quote.dataset!=='GLBX.MDP3'||quote.schema!=='ohlcv-1m'||
  quote.start!==START||quote.end!==END)return block('DATASET_SCHEMA_OR_WINDOW_MISMATCH')
 if(typeof quote.observedAt!=='string'||!Number.isFinite(Date.parse(quote.observedAt))||
  Date.parse(quote.observedAt)<Date.parse('2026-10-19T00:00:00Z'))
  return block('OUTDATED_OR_MISSING_QUOTE_TIMESTAMP')
 if(!Array.isArray(quote.instruments)||quote.instruments.length!==2||
  !Array.isArray(quote.quotes)||quote.quotes.length!==2)
  return block('TWO_EXACT_CONTRACTS_REQUIRED')
 const contracts=[]
 const costs=[]
 for(let i=0;i<2;i++){
  const id=quote.instruments[i],p=quote.quotes[i]
  if(!id||id.root!==ROOTS[i]||id.rawSymbol!==SYMBOLS[i]||
   typeof id.instrumentId!=='string'||!/^[1-9]\d{0,9}$/.test(id.instrumentId)||
   BigInt(id.instrumentId)>4294967295n||
   id.mappingStart>DATE||id.mappingEnd<'2026-10-16')
    return block('CONTRACT_MAPPING_UNVERIFIED_'+ROOTS[i])
  if(!p||p.root!==ROOTS[i]||p.rawSymbol!==SYMBOLS[i])
    return block('CONTRACT_COST_MISMATCH_'+ROOTS[i])
  const amount=scaled(String(p.estimateUSD))
  if(amount===null)return block('INVALID_VENDOR_QUOTE_'+ROOTS[i])
  contracts.push(Object.freeze({
    root:ROOTS[i],rawSymbol:SYMBOLS[i],instrumentId:id.instrumentId,
    mappingStart:id.mappingStart,mappingEnd:id.mappingEnd
  }))
  costs.push(Object.freeze({root:ROOTS[i],estimatedUSD:String(p.estimateUSD)}))
 }
 const total=costs.reduce((s,p)=>s+scaled(p.estimatedUSD),0n)
 const combined=scaled(String(quote.combinedEstimatedUSD))
 const limit=scaled(proposedHardLimitUSD)
 if(combined===null||limit===null)return block('INVALID_TOTAL_QUOTE_OR_LIMIT')
 // Metadata report rounds the two-summed quote to 9 decimals.
 if((combined>total?combined-total:total-combined)>1000n)return block('QUOTED_TOTAL_INCONSISTENT')
 if(total>limit)return block('ESTIMATE_EXCEEDS_PROPOSED_LIMIT')
 return Object.freeze({
  status:'PLAN_READY_AWAITING_SEPARATE_APPROVAL',
  policy:'RESEARCH_PLANNING_ONLY',
  dataset:quote.dataset,schema:quote.schema,start:START,end:END,
  quoteObservedAt:quote.observedAt,
  instruments:Object.freeze(contracts),
  quotedCosts:Object.freeze(costs),
  vendorEstimatedCombinedUSD:String(quote.combinedEstimatedUSD),
  proposedHardLimitUSD,
  termsReviewed:termsReviewed===true, // not evidence of license from provider
  operatorApproved:false,
  approvalGate:'REQUIRES_EXPLICIT_QUOTED_DATA_DOWNLOAD_AND_LICENSE_REVIEW',
  projectCreditsUserReportedUSD:'125',
  finalBillingMayDifferFromEstimate:true,
  dataRequestMethod:'POST',
  dataRequestEndpoint:'/v0/timeseries.get_range',
  downloadRequests:Object.freeze(contracts.map(x=>Object.freeze({
   dataset:'GLBX.MDP3',schema:'ohlcv-1m',symbols:x.rawSymbol,
   stype_in:'raw_symbol',
   start:START,end:END,encoding:'json',compression:'none',
   pretty_px:'true',pretty_ts:'true',map_symbols:'true',
   limit:'1800'
  }))),
  // This module cannot dispatch a request.
  canExecutePaidRequest:false,canDownload:false,approvedVersion:null,
  historicalBarsLoaded:false,sourceSettled:false,
  calendarVerified:false,authorizedForStrategy:false,
  backtestCompleted:false,tradingEnabled:false
 })
}
/**
 * Audit Databento JSON-lines *after* a separately approved future download.
 * Inputs are RAW TEXT and the prepared plan, not synthetic OHLCV fixtures.
 * Fail closed on wrong contract/period, malformed data, non-positive prices,
 * duplicate or out-of-order rows, incompleteness, and approximate floats.
 *
 * Output never marks data as "SETTLED" or grants trading authority; even a
 * passing record collection needs official exchange/session calendar checks.
 */
export function auditCandidateDatabentoJsonl(plan,symbol,jsonl){
 if(plan?.status!=='PLAN_READY_AWAITING_SEPARATE_APPROVAL'||
  plan.canExecutePaidRequest!==false)return block('NON_EXECUTABLE_PLAN_REQUIRED')
 const found=plan.instruments?.find(x=>x.rawSymbol===symbol)
 if(!found||!SYMBOLS.includes(symbol))return block('UNRECOGNIZED_CONTRACT')
 if(typeof jsonl!=='string'||!jsonl.trim()||Buffer.byteLength(jsonl,'utf8')>4000000)
  return block('MISSING_OR_OVERSIZE_JSONL')
 if(!jsonl.endsWith('\n'))return block('TRUNCATED_OR_MISSING_FINAL_NEWLINE')
 const lines=jsonl.trimEnd().split('\n')
 if(!lines.length||lines.length>1800)return block('INVALID_RECORD_COUNT')
 let last=-Infinity
 let absent=0,first=null,final=null
 let totalVolume=0
 for(const raw of lines){
  if(!raw||raw.length>5000)return block('INVALID_JSON_LINE')
  let x
  try{x=JSON.parse(raw)}catch{return block('INVALID_JSON_LINE')}
  if(!x||typeof x!=='object')return block('INVALID_JSON_RECORD')
  const head=x.hd??x
  const barOpen=isoMs(head.ts_event)
  if(barOpen===null||barOpen<Date.parse(START)||barOpen>=Date.parse(END))
   return block('OUT_OF_WINDOW_OR_NONMINUTE_TIMESTAMP')
  if(last>=barOpen)return block('DUPLICATE_OR_OUT_OF_ORDER_BAR')
  const gap=last>-Infinity?(barOpen-last)/MINUTE-1:0
  if(gap<0||!Number.isInteger(gap))return block('INVALID_BAR_SEQUENCE')
  absent+=gap
  last=barOpen;first??=barOpen;final=barOpen
  if(safeWhole(head.rtype)!==33||
   safeWhole(head.instrument_id)!==Number(found.instrumentId)||
   safeWhole(head.publisher_id)===null||safeWhole(head.publisher_id)>65535||
   x.symbol!==symbol)
   return block('SCHEMA_OR_CONTRACT_IDENTITY_MISMATCH')
  const open=exactDecimal(x.open),high=exactDecimal(x.high)
  const low=exactDecimal(x.low),close=exactDecimal(x.close)
  const volume=safeWhole(x.volume)
  if([open,high,low,close].some(p=>p===null||p===0n)||volume===null||
   high<low||open>high||open<low||close>high||close<low)
   return block('INVALID_OHLCV_BAR')
  totalVolume+=volume
 }
 const digest=createHash('sha256').update(jsonl,'utf8').digest('hex')
 return Object.freeze({
  status:'RAW_JSONL_VALIDATED_CALENDAR_PENDING',
  sourceType:'REAL_PROVIDER_JSONL_UNVERIFIED_CALENDAR',
  symbol,contractInstrumentId:found.instrumentId,
  dataset:plan.dataset,schema:plan.schema,start:plan.start,end:plan.end,
  sha256:digest,rawByteLength:Buffer.byteLength(jsonl,'utf8'),
  observedBarCount:lines.length,
  gapMinutesBetweenObservedBars:absent,
  firstObservedAt:new Date(first).toISOString(),
  lastObservedAt:new Date(final).toISOString(),
  volumeAggregate:totalVolume,
  providerAuthProvenFromJsonl:false,exchangeCalendarVerified:false,
  sourceSettled:false,canFeedCanonicalTrading:false,
  canAuthorizeExecution:false,notAStrategyResult:true
 })
}
