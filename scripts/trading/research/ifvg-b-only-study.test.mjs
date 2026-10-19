import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runIfvgBOnlyStudy} from './ifvg-b-only-study.mjs'
import {inspectIfvg} from './pattern-candidates.mjs'

const study=runIfvgBOnlyStudy()
const scenario=id=>study.cases.find(x=>x.id===id)
const t=i=>new Date(Date.parse('2026-10-15T14:00:00.000Z')+i*60000).toISOString()
const baseRows=[
 ['105','106','104','104.5'],['102','103','100','101'],
 ['99','100','98','99'],['99','106','99','105']
]
const data=limit=>({source:'SYNTHETIC',calendar:'SYNTHETIC_CONTIGUOUS',
 settled:true,candles:baseRows.slice(0,limit).map(([open,high,low,close],i)=>({
  openTime:t(i),open,high,low,close,complete:true
 }))})

test('BONLY-01: explicit experiment retains human-approved strict completed candle-close crossing',()=>{
 assert.equal(study.bProfile.concept,'INVERSION_FAIR_VALUE_GAP')
 assert.equal(study.bProfile.inversionCrossing,'CLOSE_BEYOND_FAR_EDGE')
 assert.equal(study.bProfile.originalGapFormation,'AFTER_MANIPULATION')
 assert.equal(study.bProfile.barsMustBeComplete,true)
 assert.equal(study.baselineProfile.originalGapFormation,'ANY')
})
test('BONLY-02: older gap confirmed at cutoff is filtered only by B',()=>{
 const old=scenario('BASE_GAP_CONFIRMED_BEFORE_OR_AT_MANIPULATION')
 assert.equal(old.bOnly.observationCount,0)
 assert.equal(old.alternativeAPlusB.observationCount,1)
 assert.equal(old.alternativeAPlusB.firstObservedCandle,3)
 assert.equal(old.manipulationCompleteAt,old.originFvgCompleteAt)
})
test('BONLY-03: base gap formed after manipulation counts for both research variants',()=>{
 const recent=scenario('BASE_GAP_CONFIRMED_AFTER_MANIPULATION')
 assert.equal(recent.bOnly.observationCount,1)
 assert.equal(recent.alternativeAPlusB.observationCount,1)
 assert.equal(recent.bOnly.firstObservedCandle,3)
 assert.equal(recent.bOnly.firstObservedAt,t(4))
 assert.equal(recent.bOnly.entryPermitted,false)
})
test('BONLY-04: important semantic ambiguity – final FVG candle after manipulation but first was before',()=>{
 const caseRow=scenario('GAP_THREE_CANDLES_STRADDLE_MANIPULATION')
 assert.equal(caseRow.bOnly.observationCount,1)
 assert.equal(caseRow.fullOriginalFvgThreeCandleWindowAfterManipulation,false)
 assert.equal(caseRow.originFvgFirstCandleOpen,t(0))
 assert.equal(caseRow.originFvgCompleteAt,t(3))
 assert.equal(caseRow.manipulationCompleteAt,t(2))
 assert.ok(study.criticalUnresolvedSemantics.includes('DOES_B_REQUIRE_ALL_THREE_BASE_FVG_CANDLES_AFTER_MANIPULATION'))
})
test('BONLY-05: no future candle borrowed by strict B on replay prefix',()=>{
 const opts={manipulationCompleteAt:t(1),formation:'AFTER_MANIPULATION',
 crossing:'CLOSE_BEYOND_FAR_EDGE'}
 const prefix=inspectIfvg(data(3),opts)
 assert.equal(prefix.observations.length,0)
 const full=inspectIfvg(data(4),opts)
 assert.equal(full.observations.length,1)
 assert.equal(full.observations[0].at,t(4))
 assert.equal(full.observations[0].entryPermitted,false)
})
test('BONLY-06: after-manipulation B does not mean wick-only trigger',()=>{
 const bars=data(4)
 bars.candles[3]={...bars.candles[3],close:'103',high:'105'}
 const b=inspectIfvg(bars,{manipulationCompleteAt:t(1),
   formation:'AFTER_MANIPULATION',crossing:'CLOSE_BEYOND_FAR_EDGE'})
 const wick=inspectIfvg(bars,{manipulationCompleteAt:t(1),
   formation:'AFTER_MANIPULATION',crossing:'WICK_BEYOND_FAR_EDGE'})
 assert.equal(b.observations.length,0)
 assert.equal(wick.observations.length,1)
})
test('BONLY-07: real or unsettled market data is refused, never backtested',()=>{
 const d=data(4)
 for(const invalid of [{...d,source:'REAL_CME'},{...d,settled:false},
  {...d,candles:d.candles.map((c,i)=>i===3?{...c,complete:false}:c)}]){
  const r=inspectIfvg(invalid,{manipulationCompleteAt:t(1),
    formation:'AFTER_MANIPULATION',crossing:'CLOSE_BEYOND_FAR_EDGE'})
  assert.equal(r.status,'INDETERMINATE')
  assert.equal(r.observations.length,0)
 }
})
test('BONLY-08: zero trades, financial results, quantitative prevalence and gate promotions',()=>{
 assert.equal(study.gate01,'OPEN')
 assert.equal(study.canonicalDetectorApproved,false)
 assert.equal(study.tradingEnabled,false)
 assert.equal(study.strategySignalsAuthorized,false)
 assert.equal(study.realBacktestPerformed,false)
 assert.equal(study.historicalPricesUsed,false)
 assert.equal(study.creditsOrCallsUsed,0)
 assert.equal(study.cases.every(x=>x.firstTradeIndex===null&&x.observedHistoricalPnl===null),true)
 assert.equal(study.reportedAdvisorFeedback,
  'A_AND_B_BOTH_POSSIBLE__B_MORE_COMMON_UNQUANTIFIED')
})
test('BONLY-09: matrix and pending canonical registry remain unresolved',()=>{
 const {rules,canProduceStrategySignals,canAuthorizeExecution}=JSON.parse(readFileSync(
  new URL('../../../docs/trading-system/research/pattern-gates-pending-v0.1.json',import.meta.url),'utf8'))
 assert.equal(canProduceStrategySignals,false)
 assert.equal(canAuthorizeExecution,false)
 const g=rules.find(x=>x.gate==='GATE-01')
 assert.equal(g.decisions.creationVsManipulationOrder,null)
 assert.equal(g.approvedDetectionVersion,null)
 assert.equal(g.status,'OPEN')
 assert.equal(g.humanRelayedExpertFeedback.BOnlyRequirementApproved,false)
})
test('BONLY-10: study is deterministic and never reaches live provider, strategy or execution',()=>{
 assert.equal(JSON.stringify(runIfvgBOnlyStudy()),JSON.stringify(study))
 assert.equal(Object.isFrozen(study),true)
 assert.equal(Object.isFrozen(study.cases),true)
 const src=readFileSync(new URL('./ifvg-b-only-study.mjs',import.meta.url),'utf8')
  .replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1')
 const imports=[...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(x=>x[1])
 assert.deepEqual(imports,['./pattern-candidates.mjs'])
 for(const pat of [/\bfetch\s*\(/,/XMLHttpRequest/,/\bWebSocket\b/,
  /process\.env/,/submitOrder\s*\(/,/RiskClearance/,/ApprovalGrant/,
  /Math\.random\s*\(/])assert.doesNotMatch(src,pat)
})
