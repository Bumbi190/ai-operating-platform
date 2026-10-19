/**
 * FIRST REAL NQ/ES HISTORICAL INTAKE — USER-APPROVED SINGLE DAY ONLY.
 * THIS SCRIPT IS NOT A GENERAL PROVIDER, TRADING, OR BACKTEST ENGINE.
 *
 * Requires a previously obtained local free quote and a key provided through
 * a transient environment variable by the local PowerShell launcher.
 * It fails closed on any cost increase; final streaming billing is provider
 * metered so a pre-download quote is NOT a contractual hard guarantee.
 *
 * No retries of billable endpoints. A private local attempt marker prevents
 * duplicate billable requests. Keep raw JSONL + SHA256 for reproducibility.
 *
 * Never import this script into Next/browser/Strategy/Paper/Live/Execution.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'

export const FIRST_DAY=Object.freeze({
  dataset:'GLBX.MDP3',schema:'ohlcv-1m',
  start:'2026-10-15T00:00:00Z',
  end:'2026-10-16T00:00:00Z',
  approvedQuoteCeilingUSD:0.010076165,
  symbols:Object.freeze([
    Object.freeze({root:'NQ',symbol:'NQZ6',instrumentId:'261401',quotedUSD:0.0050380826}),
    Object.freeze({root:'ES',symbol:'ESZ6',instrumentId:'10252',quotedUSD:0.0050380826})
  ])
})
const BASE='https://hist.databento.com'
const MAX_BYTES_PER_SYMBOL=2*1024*1024
const DEC=/^(?:0|[1-9]\d{0,7})(?:\.\d{1,9})?$/
const timestamp=/^\d{4}-\d\d-\d\dT\d\d:\d\d:00(?:\.\d{1,9})?Z$/
const fail=(code)=>{throw Error(code)}
function costWithinQuote(quoted,ref){
 if(typeof quoted!=='number'||!Number.isFinite(quoted)||quoted<0 ||
    quoted>ref+0.00000001)fail('COST_INCREASE_OR_INVALID_QUOTE')
}
export function validateLocalQuote(q){
 if(!q||q.status!=='FREE_METADATA_ONLY_COMPLETE'||q.dataset!==FIRST_DAY.dataset||
 q.schema!==FIRST_DAY.schema||q.start!==FIRST_DAY.start||q.end!==FIRST_DAY.end||
 q.downloadAuthorized!==false||q.billableEndpointsCalled!==0||q.downloadedRecords!==0||
 !Array.isArray(q.instruments)||q.instruments.length!==2||
 !Array.isArray(q.quotes)||q.quotes.length!==2)
  fail('QUOTED_DAY_OR_CONTRACTS_NOT_VERIFIED')
 for(const s of FIRST_DAY.symbols){
  const i=q.instruments.find(x=>x.root===s.root)
  const quote=q.quotes.find(x=>x.root===s.root)
  if(!i||!quote||i.rawSymbol!==s.symbol||quote.rawSymbol!==s.symbol||
   String(i.instrumentId)!==s.instrumentId||
   i.mappingStart>'2026-10-15'||i.mappingEnd<'2026-10-16')
   fail('QUOTED_CONTRACT_MAPPING_MISMATCH_'+s.root)
  costWithinQuote(Number(quote.estimateUSD),s.quotedUSD)
 }
 costWithinQuote(Number(q.combinedEstimatedUSD),FIRST_DAY.approvedQuoteCeilingUSD)
 return Object.freeze({verified:true,localQuotedUSD:Number(q.combinedEstimatedUSD)})
}
const asNanos=text=>{
 if(typeof text!=='string'||!DEC.test(text))fail('INVALID_DECIMAL_PRICE')
 const [whole,frac='']=text.split('.')
 return BigInt(whole)*1000000000n+BigInt(frac.padEnd(9,'0'))
}
function isoMinute(text){
 if(typeof text!=='string'||!timestamp.test(text))fail('INVALID_BAR_EVENT_TIMESTAMP')
 const parsed=Date.parse(text)
 if(!Number.isFinite(parsed)||parsed%60000!==0)fail('INVALID_BAR_MINUTE')
 const t=new Date(parsed).toISOString().replace('.000Z','Z')
 if(t<FIRST_DAY.start||t>=FIRST_DAY.end)fail('BAR_OUT_OF_APPROVED_DATE')
 return t
}
const safeInt=v=>{
 if((typeof v!=='number'&&typeof v!=='string')||! /^(?:0|[1-9]\d*)$/.test(String(v)))fail('BAD_UNSIGNED_INTEGER')
 const n=BigInt(String(v))
 if(n>BigInt(Number.MAX_SAFE_INTEGER))fail('TOO_LARGE_FOR_SAFE_JSON_NUMBER')
 return Number(n)
}
export function validateOhlcvJsonLines(text,spec){
 if(typeof text!=='string'||text.length>MAX_BYTES_PER_SYMBOL*2)fail('OVERSIZED_JSONL')
 const lines=text.split(/\r?\n/).filter(x=>x.trim())
 if(lines.length<100||lines.length>1440)fail('UNEXPECTED_1M_RECORD_COUNT')
 const bars=[]
 let prev=-1
 let publisher=null
 for(const line of lines){
  let data
  try{data=JSON.parse(line)}catch{fail('BAD_JSON_LINE')}
  const hd=data.hd??data
  if(hd.rtype!==33||String(hd.instrument_id)!==spec.instrumentId)
   fail('MISMATCHED_SCHEMA_OR_INSTRUMENT_ID')
  if(data.symbol!==undefined&&data.symbol!==spec.symbol)
   fail('SYMBOL_MISMATCH')
  const t=isoMinute(hd.ts_event)
  const minutes=Date.parse(t)/60000
  if(minutes<=prev)fail('DUPLICATE_OR_NONMONOTONIC_BARS')
  prev=minutes
  const p=[data.open,data.high,data.low,data.close].map(asNanos)
  const [o,h,l,c]=p
  if(h<l||o>h||o<l||c>h||c<l)fail('IMPOSSIBLE_OHLC')
  if(p.some(x=>x%250000000n!==0n))fail('PRICE_OFF_EXCHANGE_TICK')
  if(hd.publisher_id===undefined)fail('MISSING_PUBLISHER')
  if(publisher===null)publisher=safeInt(hd.publisher_id)
  else if(publisher!==safeInt(hd.publisher_id))fail('PUBLISHER_MISMATCH')
  bars.push(Object.freeze({
   time:t,open:Number(o)/1e9,high:Number(h)/1e9,
   low:Number(l)/1e9,close:Number(c)/1e9,
   volume:safeInt(data.volume)
  }))
 }
 return Object.freeze({root:spec.root,symbol:spec.symbol,instrumentId:spec.instrumentId,
   dataset:FIRST_DAY.dataset,schema:FIRST_DAY.schema,source:'REAL_DATABENTO_HISTORICAL',
   sessionCalendarVerified:false,marketDataIntegrity:'BAR_SCHEMA_VALIDATED',
   candleCount:bars.length,firstBar:bars[0].time,lastBar:bars.at(-1).time,
   bars:Object.freeze(bars)})
}
function authHeader(key){
 if(typeof key!=='string'||!/^db-[A-Za-z0-9_-]{20,}$/.test(key))fail('NO_VALID_LOCAL_KEY')
 return 'Basic '+Buffer.from(key+':','utf8').toString('base64')
}
const form=record=>new URLSearchParams(record).toString()
async function quotedCost(fetchFn,header,spec){
 const u=new URL('/v0/metadata.get_cost',BASE)
 u.search=form({dataset:FIRST_DAY.dataset,schema:FIRST_DAY.schema,
  symbols:spec.symbol,stype_in:'raw_symbol',start:FIRST_DAY.start,end:FIRST_DAY.end})
 const res=await fetchFn(u.toString(),{
  method:'GET',redirect:'error',headers:{Authorization:header},
  signal:AbortSignal.timeout(15000)
 })
 if(!res.ok)fail('METADATA_QUOTE_HTTP_'+res.status)
 const raw=await res.text()
 if(raw.length>1000)fail('QUOTE_SIZE_INVALID')
 let quote
 try{quote=JSON.parse(raw)}catch{fail('NONNUMERIC_REQUOTE')}
 costWithinQuote(quote,spec.quotedUSD)
 return quote
}
async function fetchAndLimit(fetchFn,header,spec){
 // A SINGLE billable request. Explicitly no retry if timed out or interrupted.
 const u=new URL('/v0/timeseries.get_range',BASE)
 const body=form({dataset:FIRST_DAY.dataset,schema:FIRST_DAY.schema,
  start:FIRST_DAY.start,end:FIRST_DAY.end,symbols:spec.symbol,
  stype_in:'raw_symbol',encoding:'json',
  compression:'none',pretty_px:'true',pretty_ts:'true',map_symbols:'true'
 })
 const res=await fetchFn(u.toString(),{
  method:'POST',redirect:'error',headers:{
   Authorization:header,'Content-Type':'application/x-www-form-urlencoded',
   Accept:'application/x-ndjson,application/json'
  },body,signal:AbortSignal.timeout(120000)
 })
 if(!res.ok)fail('PAID_DATA_HTTP_'+res.status)
 if(!res.body||typeof res.body.getReader!=='function')
  fail('DATA_STREAM_MISSING')
 const reader=res.body.getReader()
 const chunks=[]
 let size=0
 while(true){
  const {value,done}=await reader.read()
  if(done)break
  size+=value.byteLength
  if(size>MAX_BYTES_PER_SYMBOL){
   await reader.cancel()
   fail('RESPONSE_SIZE_LIMIT_REACHED_AFTER_BILLABLE_START')
  }
  chunks.push(Buffer.from(value))
 }
 if(size===0)fail('EMPTY_DATA_RESPONSE')
 return Buffer.concat(chunks)
}
function publicError(err){
 const reason=String(err?.message||'ERROR')
 if(/^[A-Z0-9_]{4,110}$/.test(reason))return reason
 return 'UNEXPECTED_OPERATION_ERROR'
}
/**
 * One-time, user-authorized 2026-10-15 NQZ6/ESZ6 fetch.
 *
 * Dependency-injected transport is used only in offline tests. No automatic
 * retry or resume. No market data gets uploaded to GitHub/Vercel/Supabase.
 */
export async function importFirstRealHistoricalDay({
 key,localQuote,outputDirectory,fetchFn=fetch
}={}){
 const verified=validateLocalQuote(localQuote)
 if(typeof outputDirectory!=='string'||!outputDirectory)fail('NO_LOCAL_OUTPUT_PATH')
 const header=authHeader(key)
 const prices=[]
 for(const spec of FIRST_DAY.symbols){
  prices.push({root:spec.root,costUSD:await quotedCost(fetchFn,header,spec)})
 }
 const total=prices.reduce((sum,x)=>sum+x.costUSD,0)
 costWithinQuote(total,FIRST_DAY.approvedQuoteCeilingUSD)
 const root=resolve(outputDirectory)
 // Exclusive directory: rerunning on the same target is forbidden, even if a
 // previous attempt failed after one instrument. Prevent duplicate billing.
 mkdirSync(root,{recursive:false})
 const manifest={
  schemaVersion:'omnira.real_historical_first_day.v0.1',
  status:'ONE_TIME_DOWNLOAD_STARTED',
  dataset:FIRST_DAY.dataset,schema:FIRST_DAY.schema,
  start:FIRST_DAY.start,end:FIRST_DAY.end,
  localQuoteUSD:verified.localQuotedUSD,
  reverifiedEstimateUSD:total,
  providerCostIsEstimateNotGuaranteedMaximum:true,
  symbols:[],purchaseApprovedByUser:true,
  paidRequestsInitiated:0,hasLiveTrades:false,
  cashPnL:null,winRate:null,backtestCompleted:false,
  sessionCalendarVerified:false,tradeExecutionEnabled:false
 }
 const writeManifest=()=>writeFileSync(join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600})
 writeManifest()
 try{
  for(const s of FIRST_DAY.symbols){
   manifest.paidRequestsInitiated++
   writeManifest() // persist each attempted paid call BEFORE sending it
   const raw=await fetchAndLimit(fetchFn,header,s)
   const text=raw.toString('utf8')
   const normalized=validateOhlcvJsonLines(text,s)
   const hash=createHash('sha256').update(raw).digest('hex')
   // Only write after validating complete streaming response.
   writeFileSync(join(root,s.root+'Z6_2026-10-15.raw.jsonl'),raw,{flag:'wx',mode:0o600})
   writeFileSync(join(root,s.root+'Z6_2026-10-15.bars.json'),
    JSON.stringify(normalized,null,2)+'\n',{flag:'wx',mode:0o600})
   manifest.symbols.push({
    root:s.root,symbol:s.symbol,instrumentId:s.instrumentId,
    rawSha256:hash,bytes:raw.byteLength,barCount:normalized.candleCount,
    firstBar:normalized.firstBar,lastBar:normalized.lastBar,
    rawFile:s.root+'Z6_2026-10-15.raw.jsonl',
    barsFile:s.root+'Z6_2026-10-15.bars.json'
   })
   writeManifest()
  }
  manifest.status='REAL_HISTORICAL_BAR_FILES_READY_UNVERIFIED_SESSION'
  writeManifest()
  return Object.freeze({...manifest})
 }catch(error){
  manifest.status='FAILED_CLOSED_NO_AUTORETRY'
  manifest.errorCode=publicError(error)
  writeManifest()
  throw Error(manifest.errorCode)
 }
}
const invoked=process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])
if(invoked){
 if(process.argv[2]!=='--approved-first-day'||
  process.argv.length!==5)fail('USAGE_APPROVED_FIRST_DAY_QUOTEFILE_AND_OUTPUT_PATH')
 const quote=JSON.parse(readFileSync(resolve(process.argv[3]),'utf8').replace(/^\uFEFF/,''))
 try{
  const result=await importFirstRealHistoricalDay({
   key:process.env.DATABENTO_API_KEY,localQuote:quote,
   outputDirectory:process.argv[4]
  })
  console.log(JSON.stringify({
   status:result.status,downloadCostEstimateUSD:result.reverifiedEstimateUSD,
   files:result.symbols.map(x=>({root:x.root,bars:x.barCount,sha256:x.rawSha256})),
   outputDirectory:process.argv[4],tradingEnabled:false
  },null,2))
 }catch(error){
  console.error('IMPORT_BLOCKED_OR_FAILED: '+publicError(error))
  process.exitCode=2
 }
}
