/**
 * Local historical NQ/ES snapshots for the authenticated trading/backtest view.
 *
 * Data NEVER enters public/ or is committed. Only reads the explicitly
 * configured local directory, verifies original raw SHA256, instrument IDs,
 * provider provenance, and session-data caveats.
 *
 * Production without OMNIRA_HISTORICAL_DATA_DIR shows an empty/not-connected
 * workspace; never fetches from a paid API on page load.
 */
import 'server-only'
import { readFileSync,statSync } from 'node:fs'
import { join,resolve } from 'node:path'
import { createHash } from 'node:crypto'

export interface HistoricalBar {
  time:string;open:number;high:number;low:number;close:number;volume:number
}
export interface HistoricalAsset {
  root:'NQ'|'ES'; symbol:string;instrumentId:string
  source:'REAL_DATABENTO_HISTORICAL'
  sessionCalendarVerified:false
  bars:HistoricalBar[]
  sha256:string
}
export interface HistoricalDay {
  date:'2026-10-15'
  dataset:'GLBX.MDP3'
  schema:'ohlcv-1m'
  sessionCalendarVerified:false
  realHistoricalBars:true
  strategyTradesVerified:false
  assets:HistoricalAsset[]
}
export type HistoricalLoadResult =
  | { status:'READY'; value:HistoricalDay }
  | { status:'NOT_CONFIGURED'|'NOT_AVAILABLE'|'FAILED_INTEGRITY'; value:null }

const EXPECTED={
  NQ:{symbol:'NQZ6',id:'261401'},
  ES:{symbol:'ESZ6',id:'10252'}
} as const

const readLimited=(path:string,max:number):Buffer=>{
  const size=statSync(path).size
  if(size<=0||size>max)throw Error('INVALID_LOCAL_HISTORY_SIZE')
  return readFileSync(path)
}

function parseAsset(folder:string,root:'NQ'|'ES',m:{
  root:string;symbol:string;instrumentId:string;rawSha256:string
  rawFile:string;barsFile:string;barCount:number
}):HistoricalAsset {
  const expect=EXPECTED[root]
  const prefix=root+'Z6_2026-10-15.'
  if(m.root!==root||m.symbol!==expect.symbol||m.instrumentId!==expect.id||
   m.rawFile!==prefix+'raw.jsonl'||m.barsFile!==prefix+'bars.json'||
   !/^[a-f0-9]{64}$/.test(m.rawSha256))throw Error('UNEXPECTED_LOCAL_CONTRACT')
  const raw=readLimited(join(folder,m.rawFile),2*1024*1024)
  if(createHash('sha256').update(raw).digest('hex')!==m.rawSha256)
   throw Error('RAW_DATA_INTEGRITY_ERROR')
  const parsed=JSON.parse(readLimited(join(folder,m.barsFile),700000).toString('utf8'))
  if(parsed.source!=='REAL_DATABENTO_HISTORICAL'||
   parsed.dataset!=='GLBX.MDP3'||parsed.schema!=='ohlcv-1m'||
   parsed.symbol!==expect.symbol||parsed.instrumentId!==expect.id||
   parsed.sessionCalendarVerified!==false||
   !Array.isArray(parsed.bars)||parsed.bars.length!==m.barCount||
   parsed.bars.length<100||parsed.bars.length>1440)
   throw Error('INVALID_PARSED_HISTORY')
  let last=-1
  const bars:HistoricalBar[]=parsed.bars.map((b:HistoricalBar)=>{
   if(!b||typeof b.time!=='string'||!/^2026-10-15T\d\d:\d\d:00Z$/.test(b.time))
    throw Error('INVALID_BAR_TIMESTAMP')
   const t=Date.parse(b.time)
   if(!Number.isFinite(t)||t<=last)throw Error('DUPLICATE_OR_NONMONOTONIC')
   last=t
   for(const prop of ['open','high','low','close','volume'] as const){
    if(typeof b[prop]!=='number'||!Number.isFinite(b[prop])||b[prop]<0)
     throw Error('INVALID_BAR_NUMBER')
   }
   if(b.high<b.low||b.open>b.high||b.open<b.low||
      b.close>b.high||b.close<b.low)throw Error('IMPOSSIBLE_OHLC')
   for(const prop of ['open','high','low','close'] as const){
    if(Math.abs(b[prop]*4-Math.round(b[prop]*4))>0.00001)
     throw Error('OFF_TICK_PRICE')
   }
   return {time:b.time,open:b.open,high:b.high,low:b.low,
     close:b.close,volume:b.volume}
  })
  return {root,symbol:expect.symbol,instrumentId:expect.id,
    source:'REAL_DATABENTO_HISTORICAL',sessionCalendarVerified:false,
    sha256:m.rawSha256,bars}
}

export function loadLocalHistoricalDay():HistoricalLoadResult{
 const configured=process.env.OMNIRA_HISTORICAL_DATA_DIR
 if(!configured||!configured.trim())return {status:'NOT_CONFIGURED',value:null}
 const folder=resolve(configured)
 try{
  const manifest=JSON.parse(readLimited(join(folder,'manifest.json'),20000).toString('utf8'))
  if(manifest.status!=='REAL_HISTORICAL_BAR_FILES_READY_UNVERIFIED_SESSION'||
   manifest.dataset!=='GLBX.MDP3'||manifest.schema!=='ohlcv-1m'||
   manifest.start!=='2026-10-15T00:00:00Z'||
   manifest.end!=='2026-10-16T00:00:00Z'||
   manifest.sessionCalendarVerified!==false||
   manifest.tradeExecutionEnabled!==false||
   manifest.backtestCompleted!==false||
   manifest.paidRequestsInitiated!==2||
   !Array.isArray(manifest.symbols)||manifest.symbols.length!==2)
   return {status:'FAILED_INTEGRITY',value:null}
  const nq=manifest.symbols.find((x:{root:string})=>x.root==='NQ')
  const es=manifest.symbols.find((x:{root:string})=>x.root==='ES')
  if(!nq||!es)return {status:'FAILED_INTEGRITY',value:null}
  const assets=[parseAsset(folder,'NQ',nq),parseAsset(folder,'ES',es)]
  return {status:'READY',value:{
   date:'2026-10-15',dataset:'GLBX.MDP3',schema:'ohlcv-1m',
   sessionCalendarVerified:false,realHistoricalBars:true,
   strategyTradesVerified:false,assets
  }}
 }catch(error){
  if(error instanceof Error&&
   (error.message.includes('ENOENT')||error.message.includes('ENOTDIR')))
   return {status:'NOT_AVAILABLE',value:null}
  return {status:'FAILED_INTEGRITY',value:null}
 }
}
