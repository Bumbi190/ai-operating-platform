/**
 * Pure, synthetic end-to-end C3C history -> segment -> SessionCalendar evidence.
 * All session intervals are AUTHORED TEST FIXTURES, never market schedules.
 * No provider, broker, trade approval, StrategyEngine or live API is called.
 */
import { describe, expect, it } from 'vitest'
import { asTimestamp, toEpochMs, type Timestamp } from '../time'
import { contractCycle, resolvedContract } from '../contract-identity'
import { priceText } from '../market-price'
import {
  bucketAt, buildSessionCalendar, fourHourStrategyStanding,
  type NominalBucket, type SessionCalendar,
} from '../session-calendar'
import type { HistoricalContractCandleSource, HistoricalContractSourceResult } from './historical-contract-source'
import { MAX_HISTORICAL_CHUNKS_PER_BUCKET, readHistoricalBucketEvidence } from './historical-bucket-evidence'

const T = (value: string): Timestamp => asTimestamp(value)
const NQ_H26 = resolvedContract('NQ', contractCycle(2026, 3))
const NQ_M26 = resolvedContract('NQ', contractCycle(2026, 6))
const WINTER_START = T('2026-01-15T07:00:00Z') // 02:00 ET, synthetic
const WINTER_END = T('2026-01-15T11:00:00Z')
const FIVE_END = T('2026-01-15T07:05:00Z')
const SUMMER_START = T('2026-07-16T06:00:00Z') // 02:00 ET, synthetic
const SUMMER_END = T('2026-07-16T10:00:00Z')

const minuteAt = (start: Timestamp, i: number): Timestamp =>
  T(new Date(toEpochMs(start) + i * 60000).toISOString())

function bucket(timeframe: '1m'|'5m'|'15m'|'4H', time: Timestamp): NominalBucket {
  const resolved = bucketAt(timeframe, time)
  if (!resolved.ok) throw new Error('synthetic canonical bucket refused')
  return resolved.bucket
}
function calendar(from: Timestamp, to: Timestamp, tradable: readonly (readonly [Timestamp,Timestamp])[]): SessionCalendar {
  const built = buildSessionCalendar({
    calendarVersion:'SYNTHETIC-NOT-EXCHANGE-2026-10-19',
    coverage:[{from,to}],
    tradingIntervals:tradable.map(([a,b])=>({from:a,to:b})),
  })
  if (!built.ok) throw new Error('invalid synthetic calendar')
  return built.calendar
}
function c(at: Timestamp) {
  return {
    openTime:at,open:priceText('100.00'),high:priceText('100.25'),
    low:priceText('99.75'),close:priceText('100.0'),volume:null,
  }
}
function source(fn: HistoricalContractCandleSource['read']): HistoricalContractCandleSource {
  return {read:fn}
}
function fullSource(times: readonly Timestamp[], sourceState:'SETTLED'|'UNKNOWN'='SETTLED'): HistoricalContractCandleSource {
  return source(async (request):Promise<HistoricalContractSourceResult> => ({
    kind: times.length ? 'OBSERVATIONS' : 'NO_DATA',
    contract: request.contract, coverage:{from:request.from,to:request.to},sourceState,
    ...(times.length ? {candles:times.map(c)} : {}),
  } as HistoricalContractSourceResult))
}
const read = (sourceInstance:HistoricalContractCandleSource, b:NominalBucket, cal:SessionCalendar, contract=NQ_H26) =>
  readHistoricalBucketEvidence({source:sourceInstance,bucket:b,calendar:cal,contract})

describe('C3C -> canonical SessionCalendar evidence, synthetic only',()=>{
  const five=bucket('5m',WINTER_START)
  const fiveCalendar=calendar(WINTER_START,FIVE_END,[[WINTER_START,FIVE_END]])
  const winterFull=calendar(WINTER_START,WINTER_END,[[WINTER_START,WINTER_END]])

  it('E2E-01: a settled full five-minute interval becomes COMPLETE only after calendar join',async()=>{
    const result=await read(fullSource(Array.from({length:5},(_,i)=>minuteAt(WINTER_START,i))),five,fiveCalendar)
    expect(result.kind).toBe('EVIDENCE')
    if(result.kind!=='EVIDENCE')return
    expect(result.acceptedChunks).toBe(1)
    expect(result.observedMinuteCount).toBe(5)
    expect(result.evidence).toMatchObject({ok:true,kind:'ASSESSED',completeness:'COMPLETE',sessionTruncated:false})
    expect(result.calendarVersion).toBe('SYNTHETIC-NOT-EXCHANGE-2026-10-19')
    expect(result).not.toHaveProperty('tradePermitted')
    expect(result).not.toHaveProperty('StrategySignal')
  })

  it('E2E-02: a settled source missing an expected minute is PARTIAL, never repaired',async()=>{
    const times=[0,1,3,4].map(i=>minuteAt(WINTER_START,i))
    const result=await read(fullSource(times),five,fiveCalendar)
    expect(result.kind).toBe('EVIDENCE')
    if(result.kind!=='EVIDENCE')return
    expect(result.evidence).toMatchObject({kind:'ASSESSED',completeness:'PARTIAL'})
    expect(result.observedMinuteCount).toBe(4)
  })

  it('E2E-03: two settled prefix chunks yield one COMPLETE interval only after final chunk',async()=>{
    const queries: Array<readonly [Timestamp,Timestamp]>=[]
    const src=source(async req=>{
      queries.push([req.from,req.to])
      const initial=toEpochMs(req.from)===toEpochMs(WINTER_START)
      return {
        kind:'OBSERVATIONS' as const,contract:req.contract,sourceState:'SETTLED' as const,
        coverage:{from:req.from,to:initial?minuteAt(WINTER_START,2):req.to},
        candles:(initial?[0,1]:[2,3,4]).map(i=>c(minuteAt(WINTER_START,i))),
      }
    })
    const result=await read(src,five,fiveCalendar)
    expect(result.kind).toBe('EVIDENCE')
    if(result.kind!=='EVIDENCE')return
    expect(result.acceptedChunks).toBe(2)
    expect(result.evidence).toMatchObject({completeness:'COMPLETE'})
    expect(queries).toEqual([[WINTER_START,FIVE_END],[minuteAt(WINTER_START,2),FIVE_END]])
  })

  it('E2E-04: a full source prefix is not enough; a later refusal blocks assessment',async()=>{
    let count=0
    const src=source(async req=>{
      count++
      return count===1
        ? {kind:'OBSERVATIONS' as const,contract:req.contract,sourceState:'SETTLED' as const,
           coverage:{from:req.from,to:minuteAt(WINTER_START,2)},candles:[c(WINTER_START),c(minuteAt(WINTER_START,1))]}
        : {kind:'REFUSED' as const,reason:'SOURCE_REQUEST_UNAVAILABLE' as const}
    })
    const result=await read(src,five,fiveCalendar)
    expect(result).toMatchObject({kind:'BLOCKED',problem:'SOURCE_REFUSED',acceptedChunks:1})
    expect(result).not.toHaveProperty('evidence')
  })

  it('E2E-05: NO_DATA + SETTLED in a known fully closed session means NO_CANONICAL_CANDLE',async()=>{
    const closed=calendar(WINTER_START,FIVE_END,[])
    const result=await read(fullSource([]),five,closed)
    expect(result.kind).toBe('EVIDENCE')
    if(result.kind!=='EVIDENCE')return
    expect(result.evidence).toMatchObject({ok:true,kind:'NO_CANONICAL_CANDLE',sessionTruncated:true})
    expect(result.evidence).not.toHaveProperty('completeness')
  })

  it('E2E-06: NO_DATA + SETTLED while five minutes were expected means PARTIAL',async()=>{
    const result=await read(fullSource([]),five,fiveCalendar)
    expect(result.kind).toBe('EVIDENCE')
    if(result.kind!=='EVIDENCE')return
    expect(result.evidence).toMatchObject({kind:'ASSESSED',completeness:'PARTIAL'})
  })

  it('E2E-07: NO_DATA + UNKNOWN never means a finished empty session',async()=>{
    const result=await read(fullSource([],'UNKNOWN'),five,fiveCalendar)
    expect(result).toMatchObject({kind:'BLOCKED',problem:'SOURCE_UNSETTLED',acceptedChunks:1})
    expect(result).not.toHaveProperty('evidence')
  })

  it('E2E-08: an UNKNOWN calendar refuses without even asking the source',async()=>{
    const unknown=calendar(WINTER_START,minuteAt(WINTER_START,2),[[WINTER_START,minuteAt(WINTER_START,2)]])
    let calls=0
    const src=source(async()=>{calls++;return {kind:'REFUSED',reason:'SOURCE_REQUEST_UNAVAILABLE'}})
    const result=await read(src,five,unknown)
    expect(result).toMatchObject({kind:'BLOCKED',problem:'CALENDAR_UNKNOWN',acceptedChunks:0})
    expect(calls).toBe(0)
  })

  it('E2E-09: source returning a different contract cannot supply evidence',async()=>{
    const src=source(async req=>({
      kind:'OBSERVATIONS',contract:NQ_M26,sourceState:'SETTLED',
      coverage:{from:req.from,to:req.to},candles:[c(WINTER_START)]
    }))
    const result=await read(src,five,fiveCalendar)
    expect(result).toMatchObject({kind:'BLOCKED',problem:'SOURCE_INVARIANT',sourceProblem:'CONTRACT_MISMATCH'})
    expect(result).not.toHaveProperty('evidence')
  })

  it('E2E-10: source lying about its prefix cannot supply evidence',async()=>{
    const result=await read(source(async req=>({
      kind:'OBSERVATIONS',contract:req.contract,sourceState:'SETTLED',
      coverage:{from:minuteAt(WINTER_START,1),to:req.to},candles:[c(minuteAt(WINTER_START,1))]
    })),five,fiveCalendar)
    expect(result).toMatchObject({kind:'BLOCKED',problem:'SOURCE_INVARIANT',sourceProblem:'INVALID_COVERAGE'})
  })

  it('E2E-11: invalid candle ordering or duplicates cannot reach the calendar assessment',async()=>{
    const src=source(async req=>({
      kind:'OBSERVATIONS',contract:req.contract,sourceState:'SETTLED',
      coverage:{from:req.from,to:req.to},candles:[c(WINTER_START),c(WINTER_START)]
    }))
    const result=await read(src,five,fiveCalendar)
    expect(result).toMatchObject({kind:'BLOCKED',problem:'SOURCE_SEGMENT_REFUSED',sourceProblem:'DUPLICATE_CANDLE_INSTANT'})
  })

  it('E2E-12: technical source failures remain rejected Promises',async()=>{
    const src=source(async()=>{throw new Error('synthetic transport failure')})
    await expect(read(src,five,fiveCalendar)).rejects.toThrow('synthetic transport failure')
  })

  it('E2E-13: completed 02:00 NY winter four-hour bucket uses all 240 minutes',async()=>{
    const four=bucket('4H',WINTER_START)
    expect(four.nominalTo).toBe(WINTER_END)
    const result=await read(fullSource(Array.from({length:240},(_,i)=>minuteAt(WINTER_START,i))),four,winterFull)
    expect(result.kind).toBe('EVIDENCE')
    if(result.kind!=='EVIDENCE')return
    expect(result.observedMinuteCount).toBe(240)
    expect(result.evidence).toMatchObject({kind:'ASSESSED',completeness:'COMPLETE',sessionTruncated:false})
  })

  it('E2E-14: summer 02:00 NY bucket is 06:00Z, not fixed winter UTC offset',async()=>{
    const b=bucket('4H',SUMMER_START)
    expect(b.open).toBe(SUMMER_START)
    expect(b.nominalTo).toBe(SUMMER_END)
    const cal=calendar(SUMMER_START,SUMMER_END,[[SUMMER_START,SUMMER_END]])
    const result=await read(fullSource(Array.from({length:240},(_,i)=>minuteAt(SUMMER_START,i))),b,cal)
    expect(result.kind).toBe('EVIDENCE')
    if(result.kind!=='EVIDENCE')return
    expect(result.evidence).toMatchObject({kind:'ASSESSED',completeness:'COMPLETE'})
  })

  it('E2E-15: early close can be COMPLETE and sessionTruncated simultaneously',async()=>{
    const four=bucket('4H',WINTER_START)
    const earlyEnd=minuteAt(WINTER_START,180)
    const cal=calendar(WINTER_START,WINTER_END,[[WINTER_START,earlyEnd]])
    const result=await read(fullSource(Array.from({length:180},(_,i)=>minuteAt(WINTER_START,i))),four,cal)
    expect(result.kind).toBe('EVIDENCE')
    if(result.kind!=='EVIDENCE')return
    expect(result.evidence).toMatchObject({kind:'ASSESSED',completeness:'COMPLETE',sessionTruncated:true})
  })

  it('E2E-16: halt inside the bucket removes expected bars but not its end',async()=>{
    const five=bucket('5m',WINTER_START)
    const haltFrom=minuteAt(WINTER_START,2)
    const haltTo=minuteAt(WINTER_START,3)
    const cal=calendar(WINTER_START,FIVE_END,[[WINTER_START,haltFrom],[haltTo,FIVE_END]])
    const result=await read(fullSource([0,1,3,4].map(i=>minuteAt(WINTER_START,i))),five,cal)
    expect(result.kind).toBe('EVIDENCE')
    if(result.kind!=='EVIDENCE')return
    expect(result.evidence).toMatchObject({kind:'ASSESSED',completeness:'COMPLETE',sessionTruncated:false})
  })

  it('E2E-17: a malformed 4H bucket end is blocked before source access',async()=>{
    let calls=0
    const src=source(async()=>{calls++;return {kind:'REFUSED',reason:'SOURCE_REQUEST_UNAVAILABLE'}})
    const malformed={...bucket('4H',WINTER_START),nominalTo:FIVE_END}
    const result=await read(src,malformed,winterFull)
    expect(result).toMatchObject({kind:'BLOCKED',problem:'INVALID_BUCKET'})
    expect(calls).toBe(0)
  })

  it('E2E-18: small-progress source is bounded; no optimistic completion',async()=>{
    let count=0
    const four=bucket('4H',WINTER_START)
    const src=source(async req=>{
      count++
      // Thirty-second settled NO_DATA prefixes: 256 chunks cover only 128m of this 240m bucket.
      const advanced=T(new Date(toEpochMs(req.from)+30000).toISOString())
      return {
        kind:'NO_DATA' as const,contract:req.contract,sourceState:'SETTLED' as const,
        coverage:{from:req.from,to:advanced},
      }
    })
    const result=await read(src,four,winterFull)
    expect(result).toMatchObject({kind:'BLOCKED',problem:'CHUNK_LIMIT_REACHED'})
    expect(count).toBe(MAX_HISTORICAL_CHUNKS_PER_BUCKET)
    expect(result).not.toHaveProperty('evidence')
  })

  it('E2E-19: a complete 02:00 winter data bucket is eligible DATA, not a trade',async()=>{
    const four=bucket('4H',WINTER_START)
    const src=fullSource(Array.from({length:240},(_,i)=>minuteAt(WINTER_START,i)))
    const result=await read(src,four,winterFull)
    expect(result.kind).toBe('EVIDENCE')
    if(result.kind!=='EVIDENCE')return
    expect(fourHourStrategyStanding(four,result.evidence)).toBe('ELIGIBLE')
    expect(result).not.toHaveProperty('approval')
    expect(result).not.toHaveProperty('executionIntent')
  })

  it('E2E-20: early-close COMPLETE data is ineligible for 4H strategy evidence',async()=>{
    const four=bucket('4H',WINTER_START)
    const close=minuteAt(WINTER_START,180)
    const early=calendar(WINTER_START,WINTER_END,[[WINTER_START,close]])
    const result=await read(fullSource(Array.from({length:180},(_,i)=>minuteAt(WINTER_START,i))),four,early)
    expect(result.kind).toBe('EVIDENCE')
    if(result.kind!=='EVIDENCE')return
    expect(result.evidence).toMatchObject({kind:'ASSESSED',completeness:'COMPLETE',sessionTruncated:true})
    expect(fourHourStrategyStanding(four,result.evidence)).toBe('INELIGIBLE')
  })

  it('E2E-21: a completed 14:00 NY data bucket is not a strategy 4H open',async()=>{
    const laterFrom=T('2026-01-15T19:00:00Z')
    const laterTo=T('2026-01-15T23:00:00Z')
    const four=bucket('4H',laterFrom)
    const cal=calendar(laterFrom,laterTo,[[laterFrom,laterTo]])
    const result=await read(fullSource(Array.from({length:240},(_,i)=>minuteAt(laterFrom,i))),four,cal)
    expect(result.kind).toBe('EVIDENCE')
    if(result.kind!=='EVIDENCE')return
    expect(result.evidence).toMatchObject({kind:'ASSESSED',completeness:'COMPLETE'})
    expect(fourHourStrategyStanding(four,result.evidence)).toBe('NOT_STRATEGY_RELEVANT')
  })

  it('E2E-22: repeated observations deterministically produce identical evidence',async()=>{
    const src=fullSource(Array.from({length:5},(_,i)=>minuteAt(WINTER_START,i)))
    const a=await read(src,five,fiveCalendar)
    const b=await read(src,five,fiveCalendar)
    expect(a).toEqual(b)
  })
})
