/**
 * GATE-08 research: STRICTLY OFFLINE / NO BILLABLE REQUESTS.
 *
 * Candidate evaluation for GLBX.MDP3 ohlcv-1m historical data only.
 * NOT a provider adapter, no credentials, fetch, network, orders, database
 * writes or authorization. No data may be marked SETTLED from this module.
 *
 * These inputs are EXPLICIT normalized fixture records, not raw DBN/JSON
 * schema. A separate vetted decoder and licensed, versioned dataset are
 * required before plugging an actual provider into C3C.
 */
const INSTRUMENTS=new Set(['NQ','MNQ','ES'])
const QUARTERS=new Set([3,6,9,12])
const DIGITS=/^(0|[1-9]\d*)$/
const DECIMAL=/^(0|[1-9]\d{0,12})(?:\.\d{1,6})?$/
const NS_PER_MINUTE=BigInt('60000000000')
const NS_PER_MILLISECOND=BigInt('1000000')
const NANO_PRICE=BigInt('1000000000')
const I64_MIN=-(BigInt(1)<<BigInt(63))
const I64_MAX=(BigInt(1)<<BigInt(63))-BigInt(1)
const U64_MAX=(BigInt(1)<<BigInt(64))-BigInt(1)
const STOP=(reason)=>Object.freeze({status:'BLOCKED',reason,downloadAllowed:false})
const sameContract=(a,b)=>a?.root===b?.root && a?.cycle?.year===b?.cycle?.year && a?.cycle?.quarterMonth===b?.cycle?.quarterMonth
const validContract=(c)=>c && INSTRUMENTS.has(c.root) && Number.isInteger(c.cycle?.year) && QUARTERS.has(c.cycle?.quarterMonth)
function instant(s) {
  if(typeof s!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(s)) return null
  const t=Date.parse(s)
  if(!Number.isFinite(t)) return null
  const parsed=new Date(t).toISOString()
  if(parsed!==s && parsed.replace('.000Z','Z')!==s)return null
  return t
}
function inRange(value,low,high){
  if(typeof value!=='string'||!DIGITS.test(value))return null
  const n=BigInt(value)
  return n>=low&&n<=high?n:null
}
function priceNano(value) {
  if(typeof value!=='string'||!/^(-?)(0|[1-9]\d*)$/.test(value))return null
  const n=BigInt(value)
  return n>=I64_MIN && n<=I64_MAX?n:null
}
function priceText(n) {
  const sign=n<0n?'-':''
  const u=n<0n?-n:n
  const whole=u/NANO_PRICE
  const frac=(u%NANO_PRICE).toString().padStart(9,'0').replace(/0+$/,'')
  return sign+whole.toString()+(frac?'.'+frac:'')
}
function isExplicitMapping(mapping,contract,from,to) {
  if(!mapping || mapping.dataset!=='GLBX.MDP3' || mapping.schema!=='ohlcv-1m' ||
     mapping.stypeIn!=='raw_symbol' || typeof mapping.rawSymbol!=='string' ||
     !/^[A-Z0-9]{3,12}$/.test(mapping.rawSymbol) ||
     typeof mapping.evidenceId!=='string' || !/^VERIFIED-[A-Z0-9-]{6,}$/.test(mapping.evidenceId) ||
     !Number.isSafeInteger(mapping.instrumentId)||mapping.instrumentId<=0||
     !Number.isSafeInteger(mapping.publisherId)||mapping.publisherId<=0||
     !sameContract(mapping.contract,contract))return false
  const validFrom=instant(mapping.validFrom),validTo=instant(mapping.validTo)
  return validFrom!==null && validTo!==null && validFrom<=from&&validTo>=to&&validFrom<validTo
}
/**
 * Construct a METADATA COST-QUOTE *descriptor*, never a callable URL.
 * It is not enough to know the symbol pattern: a trusted, point-in-time
 * instrument definition must map this raw symbol to the specific contract.
 * No continuous/parent symbols, no inferred roll dates, no live data.
 */
export function prepareHistoricalQuote(input) {
  const c=input?.contract
  if(!validContract(c))return STOP('CONTRACT_NOT_VERIFIED')
  const from=instant(input?.from),to=instant(input?.to)
  if(from===null||to===null||from>=to||from%60000!==0||to%60000!==0)
    return STOP('INVALID_MINUTE_WINDOW')
  // Operational research scope, not a provider or trading policy.
  if(to-from>31*24*3600000)return STOP('RESEARCH_WINDOW_EXCEEDS_31_DAYS')
  if(!isExplicitMapping(input.mapping,c,from,to))return STOP('EXPLICIT_POINT_IN_TIME_MAPPING_REQUIRED')
  return Object.freeze({
    status:'READY_FOR_METADATA_QUOTE',
    historicalOnly:true,
    downloadAllowed:false,
    provider:'Databento',
    freeMetadataMethod:'metadata.get_cost',
    quoteParameters:Object.freeze({
      dataset:'GLBX.MDP3',
      schema:'ohlcv-1m',
      stype_in:'raw_symbol',
      symbols:input.mapping.rawSymbol,
      start:input.from,
      end:input.to,
    }),
    contract:c,
    mappingEvidenceId:input.mapping.evidenceId,
  })
}
function scaledUSD(s) {
  if(typeof s!=='string'||!DECIMAL.test(s))return null
  const [w,f='']=s.split('.')
  return BigInt(w)*BigInt(1000000)+BigInt(f.padEnd(6,'0'))
}
/** Reports a quote for human approval. No checkout / API execution exists. */
export function reviewHistoricalQuote(plan,quote) {
  if(plan?.status!=='READY_FOR_METADATA_QUOTE'||plan.downloadAllowed!==false)
    return STOP('QUOTE_PLAN_REQUIRED')
  const amount=scaledUSD(quote?.quotedUSD),limit=scaledUSD(quote?.limitUSD)
  if(amount===null||limit===null)return STOP('COST_QUOTE_OR_BUDGET_MISSING')
  if(amount>limit)return STOP('COST_EXCEEDS_LIMIT')
  if(quote?.licenseReview!=='CONFIRMED_FOR_SPECIFIC_HISTORICAL_USE')
    return STOP('HISTORICAL_USAGE_RIGHTS_NOT_CONFIRMED')
  if(quote?.quoteAppliesToEvidenceId!==plan.mappingEvidenceId)
    return STOP('QUOTE_EVIDENCE_MISMATCH')
  return Object.freeze({
    status:'READY_FOR_HUMAN_REVIEW_ONLY',
    downloadAllowed:false,
    purchaseAllowed:false,
    quotedUSD:quote.quotedUSD,
    budgetUSD:quote.limitUSD,
    evidenceId:plan.mappingEvidenceId,
    quoteParameters:plan.quoteParameters,
  })
}
/**
 * Decode one explicitly NORMALIZED / UNTRUSTED simulated DBN OHLCV record.
 * Input integer strings encode Databento's 1e-9 price units and ns timestamp.
 *
 * Cannot decide source coverage or SETTLED. A vendor's omission of a no-trade
 * minute is not evidence of exchange closure, nor a green backtest bar.
 */
export function inspectNormalizedOhlcv1m(record,mapping) {
  if(!mapping||!validContract(mapping.contract))return STOP('VERIFIED_MAPPING_REQUIRED')
  // A standalone row cannot supply a time range, so validate its instant
  // against a point-in-time definition but never claim calendar completeness.
  if(!record || record.dataset!=='GLBX.MDP3'||record.schema!=='ohlcv-1m'||record.rtype!==33)
    return STOP('INVALID_DATASET_SCHEMA_OR_RTYPE')
  const nanos=inRange(record.ts_event_ns,0n,U64_MAX)
  if(nanos===null||nanos%NS_PER_MINUTE!==0n)return STOP('INVALID_BAR_OPEN_NANOSECONDS')
  const millis=nanos/NS_PER_MILLISECOND
  if(millis>BigInt(Number.MAX_SAFE_INTEGER))return STOP('INVALID_BAR_OPEN_NANOSECONDS')
  const ms=Number(millis)
  const date=new Date(ms)
  if(!Number.isFinite(date.getTime()))return STOP('INVALID_BAR_OPEN_NANOSECONDS')
  const start=instant(mapping.validFrom),end=instant(mapping.validTo)
  if(!isExplicitMapping(mapping,mapping.contract,ms,ms+60000)||start===null||end===null)
    return STOP('POINT_IN_TIME_MAPPING_NOT_VERIFIED')
  if(record.instrument_id!==mapping.instrumentId||record.publisher_id!==mapping.publisherId)
    return STOP('INSTRUMENT_OR_PUBLISHER_MISMATCH')
  const o=priceNano(record.open_nano),h=priceNano(record.high_nano)
  const l=priceNano(record.low_nano),c=priceNano(record.close_nano)
  const volume=inRange(record.volume,0n,U64_MAX)
  if([o,h,l,c].some(x=>x===null)||volume===null)return STOP('INVALID_EXACT_PRICE_OR_VOLUME')
  if(h<l||o>h||o<l||c>h||c<l)return STOP('INVALID_OHLC_ORDER')
  return Object.freeze({
    status:'UNTRUSTED_CANDLE_FOR_REVIEW',
    downloadAllowed:false,
    sourceState:'UNKNOWN',
    canBecomeStrategyEvidence:false,
    candle:Object.freeze({
      openTime:date.toISOString(),
      open:priceText(o), high:priceText(h),
      low:priceText(l),close:priceText(c), volume:volume.toString(),
    }),
    mappingEvidenceId:mapping.evidenceId,
    contract:mapping.contract,
  })
}
