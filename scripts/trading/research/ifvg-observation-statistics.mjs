/**
 * iFVG B-only observation statistics — SYNTHETIC DRY RUN, never PnL.
 *
 * We compare fixed, deliberately varied mock scenarios under the same
 * pre-approved operator subchoice: inversion requires a fully CLOSED 1m candle
 * beyond the far FVG edge. The B-only formation filter is still RESEARCH.
 *
 * This module does not detect genuine liquidity manipulation: each fixture
 * supplies its own manipulationCompleteAt. No real data, accounts, feed, risk,
 * signals, orders, fills, fees, slippage, win rate, profit or edge claims.
 *
 * No modules beyond the existing, synthetic-only research candidate inspector.
 */
import {inspectIfvg} from './pattern-candidates.mjs'

const epoch=Date.parse('2026-10-15T14:00:00.000Z')
const at=i=>new Date(epoch+i*60000).toISOString()
const baseLong=[
  ['105','106','104','104.5'],['102','103','100','101'],
  ['99','100','98','99'],['99','106','99','105']
]
const baseShort=[
  ['98','100','97','99'],['101','104','100','103'],
  ['105','106','104','105'],['105','106','98','99']
]
const twoGaps=[
  ['110','111','108','109'],['107','108','106','107'],
  ['100','101','99','100'],['98','99','97','98'],
  ['98','112','97','110']
]
function scenario(id,category,rows,cutoffIndex=1,options={}){
  const candles=rows.map(([open,high,low,close],i)=>Object.freeze({
    openTime:at(i),open,high,low,close,complete:true
  }))
  if(options.incompleteAt!==undefined){
    const i=options.incompleteAt
    candles[i]=Object.freeze({...candles[i],complete:false})
  }
  if(options.gapAt!==undefined){
    const i=options.gapAt
    candles[i]=Object.freeze({...candles[i],openTime:at(i+1)})
  }
  return Object.freeze({
    id,category,cutoffAt:at(cutoffIndex),
    data:Object.freeze({
      source:options.source??'SYNTHETIC',
      settled:options.settled??true,
      calendar:'SYNTHETIC_CONTIGUOUS',
      candles:Object.freeze(candles)
    })
  })
}
const FIXTURES=Object.freeze([
  scenario('LONG_POST','POST_FORMATION',baseLong,1),
  scenario('LONG_OLD','PRE_FORMATION',baseLong,3),
  scenario('SHORT_POST','POST_FORMATION',baseShort,1),
  scenario('SHORT_OLD','PRE_FORMATION',baseShort,3),
  scenario('LONG_SPANNING','SPANNING_FORMATION',baseLong,2),
  scenario('WICK_ONLY','NO_CLOSE_CONFIRMATION',[
    ...baseLong.slice(0,3),['99','105','99','103']
  ],1),
  scenario('TOUCH_ONLY','EQUAL_BOUNDARY_CLOSE',[
    ...baseLong.slice(0,3),['99','105','99','104']
  ],1),
  scenario('MULTIPLE_GAPS','AMBIGUOUS_CANDIDATES',twoGaps,0),
  scenario('FLAT_NO_GAP','NO_GAP',[
    ['100','102','99','100'],['100','102','99','101'],
    ['101','102','99','100'],['100','101','99','100']
  ],1),
  scenario('UNSETTLED','SOURCE_UNSETTLED',baseLong,1,{settled:false}),
  scenario('INCOMPLETE','INCOMPLETE_CANDLE',baseLong,1,{incompleteAt:3}),
  scenario('MISSING_MINUTE','NONCONTIGUOUS',baseLong,1,{gapAt:2})
])
const freeze=x=>Object.freeze(x)
const inspect=(fixture,formation)=>inspectIfvg(fixture.data,{
  manipulationCompleteAt:fixture.cutoffAt,
  crossing:'CLOSE_BEYOND_FAR_EDGE',
  formation
})
function describe(result,cutoffAt){
 const valid=result.status==='RESEARCH_OBSERVATIONS_ONLY'
 const observations=valid?result.observations:[]
 const ambiguities=valid?result.ambiguities:[]
 return freeze({
  status:result.status,
  reason:result.reason??null,
  candidateCount:observations.length,
  longCount:observations.filter(x=>x.side==='LONG').length,
  shortCount:observations.filter(x=>x.side==='SHORT').length,
  ambiguousCandleCount:ambiguities.length,
  ambiguousCandidateCount:ambiguities.reduce((n,a)=>n+a.candidateIds.length,0),
  confirmationLagMinutes:freeze(observations.map(x=>(Date.parse(x.at)-Date.parse(cutoffAt))/60000)),
  observedThrough:observations.length?observations.at(-1).at:null,
  candidateIds:freeze(observations.map(x=>x.id)),
  executionAuthorized:false
 })
}
function summarize(rows,profile){
 const statuses={}
 const categoryCounts={}
 let candidateCount=0,longCount=0,shortCount=0,ambiguousCandleCount=0,ambiguousCandidateCount=0
 let validFixtureCount=0,invalidFixtureCount=0,casesWithObservedCandidate=0
 const lags=[]
 for(const row of rows){
  const item=row[profile]
  statuses[item.status]=(statuses[item.status]??0)+1
  categoryCounts[row.category]=(categoryCounts[row.category]??0)+1
  if(item.status==='INDETERMINATE')invalidFixtureCount++
  else validFixtureCount++
  candidateCount+=item.candidateCount
  longCount+=item.longCount;shortCount+=item.shortCount
  ambiguousCandleCount+=item.ambiguousCandleCount
  ambiguousCandidateCount+=item.ambiguousCandidateCount
  if(item.candidateCount)casesWithObservedCandidate++
  lags.push(...item.confirmationLagMinutes)
 }
 return freeze({
  // These are TEST FIXTURE COUNTS, not historical market signal frequencies.
  totalFixtures:rows.length,
  validFixtureCount,invalidFixtureCount,casesWithObservedCandidate,
  candidateCount,longCount,shortCount,
  ambiguousCandleCount,ambiguousCandidateCount,
  averageResearchConfirmationLagMinutes:lags.length
    ?Math.round((lags.reduce((a,b)=>a+b,0)/lags.length)*1000)/1000:null,
  minResearchConfirmationLagMinutes:lags.length?Math.min(...lags):null,
  maxResearchConfirmationLagMinutes:lags.length?Math.max(...lags):null,
  statusCounts:freeze(statuses),
  fixtureCategoryCounts:freeze(categoryCounts),
  financialMetricsAvailable:false,
  performanceMetricsAvailable:false,
  observedWinRate:null,expectancyR:null,profitFactor:null,
  maxDrawdownR:null,netProfitUSD:null,
 })
}
export function runIfvgSyntheticStatistics(){
 const rows=FIXTURES.map(f=>{
  const b=describe(inspect(f,'AFTER_MANIPULATION'),f.cutoffAt)
  const a=describe(inspect(f,'ANY'),f.cutoffAt)
  return freeze({id:f.id,category:f.category,
    bars:f.data.candles.length,manipulationCompleteAt:f.cutoffAt,
    bOnly:b,aPlusB:a,
    candidatesRemovedByB:a.candidateCount-b.candidateCount,
    ambiguityDifference:b.ambiguousCandleCount-a.ambiguousCandleCount
  })
 })
 const totalB=summarize(rows,'bOnly'),totalAB=summarize(rows,'aPlusB')
 return freeze({
  schemaVersion:'research.ifvg_observational_fixture_statistics.v0.1',
  status:'SYNTHETIC_RESEARCH_ONLY',
  profile:'POST_MANIPULATION_FVG_FORMATION__COMPLETE_1M_CLOSE_INVERSION',
  control:'ANY_FVG_FORMATION__COMPLETE_1M_CLOSE_INVERSION',
  concept:'INVERSION_FAIR_VALUE_GAP',
  scenarioDesign:'DELIBERATELY_AUTHORED_CASES_NOT_SAMPLED_MARKET_DAYS',
  source:'EXPLICIT_SYNTHETIC_COMPLETE_1M_FIXTURES',
  tradingPermission:false,
  canonicalStrategyVersionApproved:false,
  gate01Status:'OPEN',
  marketDataLicensedOrFetched:false,
  caveat:'COUNTS_AND_LAGS_ARE_FIXTURE_QA_ONLY_NOT_ACTUAL_TRADE_STATISTICS',
  bOnly:totalB,aPlusB:totalAB,
  pairwise:freeze({
    candidateReductionOnFixtures:totalAB.candidateCount-totalB.candidateCount,
    scenariosWithDifferentCandidateCounts:rows.filter(x=>x.candidatesRemovedByB!==0).length,
    scenariosWithDifferentAmbiguity:rows.filter(x=>x.ambiguityDifference!==0).length
  }),
  cases:freeze(rows)
 })
}
