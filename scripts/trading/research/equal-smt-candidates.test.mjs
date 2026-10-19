import test from 'node:test'
import assert from 'node:assert/strict'
import { compareEqualPivots, inspectSmtPair } from './equal-smt-candidates.mjs'

const origin = Date.parse('2026-10-15T14:00:00.000Z')
const stamp = (minute) => new Date(origin + minute * 60000).toISOString()
const rowsHigh = [
  ['99','100','98','99'], ['100','101','99','100.5'],
  ['99','100','98','99'], ['99','100','98','99'],
  ['100','101.25','99','100'], ['99','100','98','99']
]
const rowsLow = [
  ['98','100','96','98'], ['97','99','95','97'],
  ['98','100','96','98'], ['98','100','96','98'],
  ['97','99','94.75','97'], ['98','100','96','98']
]
function series(root, rows, tf = '5m', startingMinute=0) {
  const step = { '1m':1, '5m':5, '15m':15 }[tf]
  return {
    source:'SYNTHETIC', calendar:'SYNTHETIC_CONTIGUOUS', settled:true,
    root, contractId:'SYN-'+root+'-2026-Q4', timeframe:tf,
    candles:rows.map(([open,high,low,close],i) => ({
      openTime:stamp(startingMinute+i*step), open,high,low,close,complete:true
    }))
  }
}
const equalArgs = (overrides={}) => ({
  series:series('NQ', rowsHigh), kind:'HIGH', firstIndex:1,secondIndex:4,
  toleranceTicks:1,inclusive:true,tickSize:'0.25',observedThrough:stamp(30),...overrides
})
const nqRows = [
  ['100','102','99','101'], ['101','105','100','103'], ['103','104','101','102']
]
const esRows = [
  ['50','51','49','50'], ['50','51.5','49','50.5'], ['50.5','51.5','49.5','50']
]
function smtArgs(overrides={}) {
  return {
    nq:series('NQ',nqRows,'1m',2), es:series('ES',esRows,'1m',2),
    nqRef:{pairId:'SYNPAIR-1',kind:'HIGH',contractId:'SYN-NQ-2026-Q4',timeframe:'1m',price:'104',confirmedAt:stamp(0)},
    esRef:{pairId:'SYNPAIR-1',kind:'HIGH',contractId:'SYN-ES-2026-Q4',timeframe:'1m',price:'52',confirmedAt:stamp(1)},
    kind:'HIGH', crossing:'WICK', evaluationAt:stamp(5), maxReferenceDeltaMinutes:1,...overrides
  }
}
test('EQUAL-01: confirmed strict swing highs one tick apart match inclusively',()=>{
  const r=compareEqualPivots(equalArgs())
  assert.equal(r.status,'EQUAL_RESEARCH')
  assert.equal(r.distanceTicks,1)
  assert.equal(r.confirmedAt,stamp(30))
  assert.equal(r.tradePermitted,false)
})
test('EQUAL-02: exact boundary fails the strict comparison variant',()=>{
  assert.equal(compareEqualPivots(equalArgs({inclusive:false})).status,'DIFFERENT_RESEARCH')
  assert.equal(compareEqualPivots(equalArgs({toleranceTicks:0})).status,'DIFFERENT_RESEARCH')
  assert.equal(compareEqualPivots(equalArgs({toleranceTicks:2})).status,'EQUAL_RESEARCH')
})
test('EQUAL LOW: strict swing lows are symmetric but still research-only',()=>{
  const r=compareEqualPivots(equalArgs({series:series('MNQ',rowsLow),kind:'LOW'}))
  assert.equal(r.status,'EQUAL_RESEARCH')
  assert.equal(r.distanceTicks,1)
  assert.equal(r.tradePermitted,false)
})
test('EQUAL confirmation: future right-hand candle cannot be used early',()=>{
  assert.equal(compareEqualPivots(equalArgs({observedThrough:stamp(25)})).reason,'FUTURE_PIVOT_CONFIRMATION_UNAVAILABLE')
  const partial=series('NQ',rowsHigh.slice(0,5))
  assert.equal(compareEqualPivots(equalArgs({series:partial})).status,'UNKNOWN')
})
test('EQUAL strict pivots: plateau highs do not become confirmed swings',()=>{
  const bad=rowsHigh.map((r,i)=>i===2?['100','101','98','100']:r)
  assert.equal(compareEqualPivots(equalArgs({series:series('NQ',bad)})).reason,'UNCONFIRMED_STRICT_SWING')
})
test('EQUAL-03: missing/invalid tick size and non-grid prices are UNKNOWN',()=>{
  assert.equal(compareEqualPivots(equalArgs({tickSize:undefined})).status,'UNKNOWN')
  assert.equal(compareEqualPivots(equalArgs({tickSize:'0'})).status,'UNKNOWN')
  assert.equal(compareEqualPivots(equalArgs({tickSize:'0.3'})).status,'UNKNOWN')
  assert.equal(compareEqualPivots(equalArgs({tickSize:0.25})).status,'UNKNOWN')
  assert.equal(compareEqualPivots(equalArgs({series:{...series('NQ',rowsHigh),contractId:'ACTUAL-NQ'}})).status,'UNKNOWN')
})
test('EQUAL fail closed: incomplete bars, real sources, missing bars and invalid time',()=>{
  const original=series('NQ',rowsHigh)
  assert.equal(compareEqualPivots(equalArgs({series:{...original,source:'REAL_CME'}})).status,'UNKNOWN')
  assert.equal(compareEqualPivots(equalArgs({series:{...original,candles:original.candles.map((c,i)=>i===5?{...c,complete:false}:c)}})).reason,'INCOMPLETE_BAR')
  assert.equal(compareEqualPivots(equalArgs({observedThrough:'2026-13-01T14:00:00.000Z'})).status,'UNKNOWN')
  assert.equal(compareEqualPivots(equalArgs({series:{...original,candles:[...original.candles.slice(0,3),...original.candles.slice(4)]}})).reason,'SYNTHETIC_GAP_OR_REORDER')
})
test('EQUAL: 5m and 15m are separate research windows with explicit indices',()=>{
  const s=series('ES',rowsHigh,'15m')
  assert.equal(compareEqualPivots(equalArgs({series:s,observedThrough:stamp(90)})).status,'EQUAL_RESEARCH')
  assert.equal(compareEqualPivots(equalArgs({series:series('NQ',rowsHigh,'1m'),observedThrough:stamp(6)})).reason,'UNSUPPORTED_TIMEFRAME')
})
test('SMT-01: explicit NQ/ES pair NQ-only high sweep on aligned settled data',()=>{
  const r=inspectSmtPair(smtArgs())
  assert.equal(r.status,'DIVERGENCE_RESEARCH')
  assert.equal(r.side,'NQ_ONLY')
  assert.equal(r.nqSwept,true)
  assert.equal(r.esSwept,false)
  assert.equal(r.tradePermitted,false)
})
test('SMT crossing interpretation: wick and close observe different outcomes',()=>{
  assert.equal(inspectSmtPair(smtArgs({crossing:'WICK'})).status,'DIVERGENCE_RESEARCH')
  assert.equal(inspectSmtPair(smtArgs({crossing:'CLOSE'})).status,'NO_DIVERGENCE_OBSERVED_RESEARCH')
})
test('SMT-02: both instruments sweeping same kind of liquidity is not divergence',()=>{
  const d=smtArgs()
  const es={...d.es,candles:d.es.candles.map((c,i)=>i===1?{...c,high:'53'}:c)}
  const r=inspectSmtPair({...d,es})
  assert.equal(r.status,'NO_DIVERGENCE_OBSERVED_RESEARCH')
  assert.equal(r.esSwept,true)
})
test('SMT reversed: ES-only divergence is observed symmetrically',()=>{
  const d=smtArgs()
  const nq={...d.nq,candles:d.nq.candles.map((c,i)=>i===1?{...c,high:'103'}:c)}
  const es={...d.es,candles:d.es.candles.map((c,i)=>i===1?{...c,high:'53'}:c)}
  const r=inspectSmtPair({...d,nq,es})
  assert.equal(r.status,'DIVERGENCE_RESEARCH')
  assert.equal(r.side,'ES_ONLY')
})
test('SMT low sweep: NQ-only low takes liquidity while ES does not',()=>{
  const d=smtArgs({
    kind:'LOW',
    nqRef:{pairId:'SYNPAIR-2',kind:'LOW',contractId:'SYN-NQ-2026-Q4',timeframe:'1m',price:'98',confirmedAt:stamp(0)},
    esRef:{pairId:'SYNPAIR-2',kind:'LOW',contractId:'SYN-ES-2026-Q4',timeframe:'1m',price:'48',confirmedAt:stamp(1)}
  })
  const nq={...d.nq,candles:d.nq.candles.map((c,i)=>i===1?{...c,low:'97'}:c)}
  const r=inspectSmtPair({...d,nq})
  assert.equal(r.status,'DIVERGENCE_RESEARCH')
  assert.equal(r.side,'NQ_ONLY')
})
test('SMT correspondence delta is a genuinely unresolved explicit parameter',()=>{
  assert.equal(inspectSmtPair(smtArgs({maxReferenceDeltaMinutes:0})).reason,'REFERENCE_TIMING_POLICY_NOT_MET')
  assert.equal(inspectSmtPair(smtArgs({maxReferenceDeltaMinutes:1})).status,'DIVERGENCE_RESEARCH')
  assert.equal(inspectSmtPair(smtArgs({maxReferenceDeltaMinutes:2})).status,'DIVERGENCE_RESEARCH')
})
test('SMT-03: missing, unsettled, unequal bars must return UNKNOWN, never false',()=>{
  const d=smtArgs()
  assert.equal(inspectSmtPair({...d,es:{...d.es,settled:false}}).status,'UNKNOWN')
  assert.equal(inspectSmtPair({...d,es:{...d.es,candles:d.es.candles.slice(0,2)}}).status,'UNKNOWN')
  assert.equal(inspectSmtPair({...d,es:{...d.es,candles:d.es.candles.map((c,i)=>i===1?{...c,complete:false}:c)}}).status,'UNKNOWN')
  assert.equal(inspectSmtPair({...d,es:{...d.es,source:'EXCHANGE'}}).status,'UNKNOWN')
})
test('SMT-04: mismatched instrument, timeframe, pair ID or contract ID fail closed',()=>{
  const d=smtArgs()
  assert.equal(inspectSmtPair({...d,es:{...d.es,root:'MNQ'}}).status,'UNKNOWN')
  assert.equal(inspectSmtPair({...d,es:{...d.es,timeframe:'5m'}}).status,'UNKNOWN')
  assert.equal(inspectSmtPair({...d,esRef:{...d.esRef,pairId:'SYNPAIR-OTHER'}}).status,'UNKNOWN')
  assert.equal(inspectSmtPair({...d,esRef:{...d.esRef,contractId:'SYN-ES-OLD'}}).status,'UNKNOWN')
})
test('SMT no lookahead or stale observation window',()=>{
  const d=smtArgs()
  assert.equal(inspectSmtPair({...d,evaluationAt:stamp(1)}).status,'UNKNOWN')
  assert.equal(inspectSmtPair({...d,evaluationAt:stamp(4)}).status,'UNKNOWN')
  assert.equal(inspectSmtPair({...d,evaluationAt:stamp(6)}).status,'UNKNOWN')
})
test('Research data NEVER carries approval, entry, grade promotion or execution authority',()=>{
  for(const r of [compareEqualPivots(equalArgs()),inspectSmtPair(smtArgs())]){
    assert.equal(r.policy,'NON_CANONICAL_RESEARCH')
    assert.equal(r.tradePermitted,false)
    for(const field of ['entry','orderId','grade','canExecute','riskClearance','approval','account']) {
      assert.equal(Object.prototype.hasOwnProperty.call(r,field),false)
    }
  }
})
