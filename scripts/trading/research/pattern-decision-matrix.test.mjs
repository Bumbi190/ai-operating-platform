import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildPatternDecisionMatrix} from './pattern-decision-matrix.mjs'
import {inspectIfvg} from './pattern-candidates.mjs'

const matrix=buildPatternDecisionMatrix()
const at=id=>matrix.observations.find(o=>o.id===id)
test('REVIEW-01: all four gates remain OPEN and unapproved',()=>{
 assert.deepEqual(matrix.gateStatus,{'GATE-01':'OPEN','GATE-02':'OPEN','GATE-03':'OPEN','GATE-04':'OPEN'})
 assert.deepEqual(matrix.approvals,{'GATE-01':null,'GATE-02':null,'GATE-03':null,'GATE-04':null})
 assert.equal(matrix.reviewOnly,true)
 assert.equal(matrix.tradingEnabled,false)
 assert.equal(matrix.historicalBacktestPerformed,false)
 assert.equal(matrix.canonicalRulesChanged,false)
})
test('REVIEW-12: operator confirms iFVG = Inversion FVG, not Implied; both detection variants remain unapproved',()=>{
 const concept=matrix.confirmedTerminology['GATE-01']
 assert.equal(concept.abbreviation,'iFVG')
 assert.equal(concept.concept,'INVERSION_FAIR_VALUE_GAP')
 assert.equal(concept.notConcept,'IMPLIED_FAIR_VALUE_GAP')
 assert.equal(concept.userConfirmed,true)
 assert.equal(concept.detectionRulesApproved,false)
 assert.equal(matrix.gateStatus['GATE-01'],'OPEN')
 assert.equal(matrix.approvals['GATE-01'],null)
 assert.equal(at('IFVG_CROSSING').approvedVariant,null)
 assert.equal(at('IFVG_FORMATION').approvedVariant,null)
})
test('REVIEW-13: operator chose B close strictly beyond far edge, never wick-only or execution',()=>{
 const choice=matrix.confirmedSubdecisions['GATE-01']
 assert.equal(choice.iFvgCrossing,'CLOSE_BEYOND_FAR_EDGE')
 assert.equal(choice.alternativeRejected,'WICK_BEYOND_FAR_EDGE')
 assert.equal(choice.barPolicy,'COMPLETED_1M_CANDLE_ONLY')
 assert.equal(choice.operatorConfirmed,true)
 assert.equal(choice.canonicalDetectorApproved,false)
 const row=at('IFVG_CROSSING')
 assert.equal(row.operatorSelectedVariant,'CLOSE_BEYOND_FAR_EDGE')
 assert.equal(row.status,'OPERATOR_CHOICE_CONFIRMED_AWAITING_CANONICAL')
 assert.equal(row.approvedVariant,null)
 assert.equal(row.eligibleForStrategy,false)
 assert.equal(matrix.gateStatus['GATE-01'],'OPEN')
 assert.equal(matrix.approvals['GATE-01'],null)
})
test('REVIEW-14: selected crossing ignores early wick and requires later finished bar close',()=>{
 const start=Date.parse('2026-10-15T14:00:00.000Z')
 const tuples=[
  ['105','106','104','104.5'],['102','103','100','101'],
  ['99','100','98','99'],['99','105','99','103'],
  ['103','106','102','105']
 ]
 const candles=tuples.map(([open,high,low,close],i)=>({
  openTime:new Date(start+i*60000).toISOString(),
  open,high,low,close,complete:true
 }))
 const data={source:'SYNTHETIC',calendar:'SYNTHETIC_CONTIGUOUS',settled:true,candles}
 const opts={manipulationCompleteAt:new Date(start).toISOString(),
   crossing:matrix.confirmedSubdecisions['GATE-01'].iFvgCrossing}
 const early=inspectIfvg({...data,candles:candles.slice(0,4)},opts)
 assert.equal(early.observations.filter(x=>x.side==='LONG').length,0)
 const after=inspectIfvg(data,opts)
 const event=after.observations.find(x=>x.side==='LONG')
 assert.equal(event?.candleIndex,4)
 assert.equal(event?.at,new Date(start+5*60000).toISOString())
 assert.equal(event?.entryPermitted,false)
 const wick=inspectIfvg({...data,candles:candles.slice(0,4)},
   {...opts,crossing:'WICK_BEYOND_FAR_EDGE'})
 assert.equal(wick.observations.find(x=>x.side==='LONG')?.candleIndex,3)
})
test('REVIEW-15: pending gate register records only iFVG subdecision, not a full strategy approval',()=>{
 const json=readFileSync(new URL('../../../docs/trading-system/research/pattern-gates-pending-v0.1.json',import.meta.url),'utf8')
 const pending=JSON.parse(json)
 const gate=pending.rules.find(x=>x.gate==='GATE-01')
 assert.equal(pending.canProduceStrategySignals,false)
 assert.equal(pending.canAuthorizeExecution,false)
 assert.equal(gate.status,'OPEN')
 assert.equal(gate.approvedDetectionVersion,null)
 assert.equal(gate.decisions.inversionCrossingRule,'CLOSE_BEYOND_FAR_EDGE')
 assert.equal(gate.operatorConfirmedSubdecisions.wickAloneCounts,false)
 assert.equal(gate.operatorConfirmedSubdecisions.remainingMandatoryDecisionsOpen,true)
 assert.ok(Object.values(gate.decisions).filter(x=>x===null).length>=6)
 assert.ok(pending.rules.every(x=>x.status==='OPEN'&&x.approvedDetectionVersion===null))
 assert.equal(pending.promotion.automatedApprovalAllowed,false)
})
test('REVIEW-02: iFVG crossing variant moves synthetic confirmation time',()=>{
 const row=at('IFVG_CROSSING')
 assert.equal(row.variants.WICK_BEYOND_FAR_EDGE.firstIndex,3)
 assert.equal(row.variants.CLOSE_BEYOND_FAR_EDGE.firstIndex,4)
 assert.equal(row.variants.WICK_BEYOND_FAR_EDGE.entryPermitted,false)
 assert.equal(row.approvedVariant,null)
})
test('REVIEW-03: iFVG formation-before-manipulation creates a decision fork',()=>{
 const r=at('IFVG_FORMATION')
 assert.equal(r.variants.ANY.observationCount,1)
 assert.equal(r.variants.AFTER_MANIPULATION.observationCount,0)
 assert.equal(r.approvedVariant,null)
})
test('REVIEW-04: CISD competing anchors change outcome time',()=>{
 const row=at('CISD_ANCHOR')
 assert.equal(row.variants.FIRST_RUN_OPEN.firstIndex,3)
 assert.equal(row.variants.LAST_RUN_OPEN.firstIndex,2)
 assert.equal(row.variants.FIRST_RUN_OPEN.entryPermitted,false)
})
test('REVIEW-05: equal highs exactly 1 tick apart disagree at inclusion boundary',()=>{
 const r=at('EQUAL_BOUNDARY')
 assert.equal(r.variants.INCLUSIVE.distanceTicks,1)
 assert.equal(r.variants.INCLUSIVE.status,'EQUAL_RESEARCH')
 assert.equal(r.variants.EXCLUSIVE.status,'DIFFERENT_RESEARCH')
})
test('REVIEW-06: SMT wick and close give different observations',()=>{
 const r=at('SMT_CROSSING')
 assert.equal(r.variants.WICK.status,'DIVERGENCE_RESEARCH')
 assert.equal(r.variants.WICK.side,'NQ_ONLY')
 assert.equal(r.variants.CLOSE.status,'NO_DIVERGENCE_OBSERVED_RESEARCH')
})
test('REVIEW-07: SMT reference time cutoff changes UNKNOWN into an observation only',()=>{
 const r=at('SMT_PAIR_TIME')
 assert.equal(r.variants['0_MINUTES'].status,'UNKNOWN')
 assert.equal(r.variants['1_MINUTE'].status,'DIVERGENCE_RESEARCH')
 assert.equal(r.variants['0_MINUTES'].reason,'REFERENCE_TIMING_POLICY_NOT_MET')
})
test('REVIEW-08: missing or unsettled ES stays UNKNOWN, not a boolean false',()=>{
 const r=at('SMT_MISSING_ES')
 assert.equal(r.variants.ES_UNSETTLED.status,'UNKNOWN')
 assert.equal(r.variants.ES_UNSETTLED.tradePermitted,false)
})
test('REVIEW-09: all rows are human decisions, never trading instructions',()=>{
 assert.equal(matrix.observations.length,7)
 for(const row of matrix.observations){
  assert.equal(row.approvedVariant,null)
  assert.equal(row.status,row.id==='IFVG_CROSSING'
    ? 'OPERATOR_CHOICE_CONFIRMED_AWAITING_CANONICAL' : 'UNDECIDED')
  assert.equal(row.operatorSelectedVariant,row.id==='IFVG_CROSSING'
    ? 'CLOSE_BEYOND_FAR_EDGE' : null)
  assert.equal(row.humanApprovalRequired,true)
  assert.equal(row.eligibleForStrategy,false)
  for(const v of Object.values(row.variants)){
   assert.equal(v.tradePermitted??v.entryPermitted,false)
   for(const key of ['order','execution','riskClearance','approval','canTrade','grade','tradeId','entryPrice']){
    assert.equal(Object.hasOwn(v,key),false,key)
   }
  }
 }
})
test('REVIEW-10: reproducible byte-identical matrix, no clock dependence',()=>{
 assert.equal(JSON.stringify(buildPatternDecisionMatrix()),JSON.stringify(buildPatternDecisionMatrix()))
 assert.equal(Object.isFrozen(matrix),true)
 assert.equal(Object.isFrozen(matrix.observations),true)
})
test('REVIEW-11: no real inputs, services or runtime trading imports',()=>{
 const src=readFileSync(new URL('./pattern-decision-matrix.mjs',import.meta.url),'utf8')
  .replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1')
 const imports=[...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m=>m[1])
 assert.deepEqual(imports.sort(),['./equal-smt-candidates.mjs','./pattern-candidates.mjs'])
 for(const re of [/\bfetch\s*\(/,/process\.env/,/WebSocket/,/XMLHttpRequest/,
   /submitOrder/,/createTradeProposal/,/RiskClearance/,/ApprovalGrant/,
   /new Date\(\)/,/Math\.random\s*\(/])
  assert.doesNotMatch(src,re)
})
