/**
 * iFVG B-only RESEARCH PROFILE – offline, synthetic, no trades.
 *
 * Operator relayed that both pre- and post-manipulation FVGs CAN be valid,
 * but post-manipulation ("B") is reportedly more common. Evaluate B as an
 * isolated EXPERIMENT without replacing that nuanced source guidance with
 * a canonical B-only strategy.
 *
 * "B" here means ORIGINAL FVG's third (confirming) candle has FINISHED
 * strictly after manipulationCompleteAt. It does NOT mean all three candles
 * start after manipulation. That alternative remains explicitly unresolved.
 *
 * Crossing rule is user-confirmed: a fully CLOSED 1m candle must CLOSE
 * strictly beyond the original FVG far edge. Wicks are not sufficient.
 *
 * Never import into Strategy/Replay runtime/Risk/Execution. No real data.
 */
import { inspectIfvg } from './pattern-candidates.mjs'

const origin=Date.parse('2026-10-15T14:00:00.000Z')
const time=index=>new Date(origin+index*60000).toISOString()
const rows=[
 ['105','106','104','104.5'],
 ['102','103','100','101'],
 ['99','100','98','99'],
 ['99','106','99','105']
]
const candles=Object.freeze(rows.map(([open,high,low,close],i)=>Object.freeze({
  openTime:time(i),open,high,low,close,complete:true
})))
const makeData=through=>Object.freeze({
 source:'SYNTHETIC',
 calendar:'SYNTHETIC_CONTIGUOUS',
 settled:true,
 candles:Object.freeze(candles.slice(0,through))
})
const view=result=>Object.freeze({
 status:result.status,
 reason:result.reason??null,
 observationCount:result.observations?.length??0,
 firstObservedCandle:result.observations?.[0]?.candleIndex??null,
 firstObservedAt:result.observations?.[0]?.at??null,
 ambiguities:result.ambiguities?.length??0,
 entryPermitted:false
})
const profile=(formation)=>Object.freeze({
 concept:'INVERSION_FAIR_VALUE_GAP',
 originalGapFormation:formation,
 inversionCrossing:'CLOSE_BEYOND_FAR_EDGE',
 barsMustBeComplete:true,
 syntheticOnly:true,
 canTrade:false,
 canonicalApproved:false
})
const frozenRow=(id,manipulationCompleteAt,bOnly,aPlusB,firstGapOpen,firstGapComplete)=>{
 const outcomeB=view(inspectIfvg(makeData(4),{manipulationCompleteAt,
   crossing:'CLOSE_BEYOND_FAR_EDGE',formation:'AFTER_MANIPULATION'}))
 const outcomeAB=view(inspectIfvg(makeData(4),{manipulationCompleteAt,
   crossing:'CLOSE_BEYOND_FAR_EDGE',formation:'ANY'}))
 return Object.freeze({
  id,
  originFvgFirstCandleOpen:firstGapOpen,
  originFvgCompleteAt:firstGapComplete,
  manipulationCompleteAt,
  bOnly:outcomeB,
  alternativeAPlusB:outcomeAB,
  postManipulationFvgUnderCurrentB:outcomeB.observationCount>0,
  fullOriginalFvgThreeCandleWindowAfterManipulation:
    Date.parse(firstGapOpen)>=Date.parse(manipulationCompleteAt),
  firstTradeIndex:null,
  observedHistoricalPnl:null,
  data:'SYNTHETIC',
  tradePermitted:false
 })
}

/**
 * This study is intentionally constructed from two opposite scenarios using
 * the SAME exact OHLC sequence, changing ONLY manipulation completion.
 * Consequence: no empirical sensitivity/profitability inference is possible.
 */
export function runIfvgBOnlyStudy(){
 const caseA=frozenRow('BASE_GAP_CONFIRMED_BEFORE_OR_AT_MANIPULATION',
   time(3),null,null,time(0),time(3))
 const caseB=frozenRow('BASE_GAP_CONFIRMED_AFTER_MANIPULATION',
   time(1),null,null,time(0),time(3))
 const straddle=frozenRow('GAP_THREE_CANDLES_STRADDLE_MANIPULATION',
   time(2),null,null,time(0),time(3))
 const caseRows=Object.freeze([caseA,caseB,straddle])
 return Object.freeze({
  schemaVersion:'research.ifvg_b_only_study.v0.1',
  policy:'NON_CANONICAL_RESEARCH',
  source:'SYNTHETIC_FOUR_CANDLES_ONLY',
  experiment:'POST_MANIPULATION_FVG_CONFIRMATION_ONLY',
  reportedAdvisorFeedback:'A_AND_B_BOTH_POSSIBLE__B_MORE_COMMON_UNQUANTIFIED',
  comparisonBaseline:'A_PLUS_B_ANY_FORMATION',
  bProfile:profile('AFTER_MANIPULATION'),
  baselineProfile:profile('ANY'),
  criticalUnresolvedSemantics:Object.freeze([
    'DOES_B_REQUIRE_ALL_THREE_BASE_FVG_CANDLES_AFTER_MANIPULATION',
    'OLD_GAP_MITIGATION_OR_TOUCH_HANDLING',
    'FVG_EXPIRY_AND_MAX_AGE',
    'MULTIPLE_FVG_TIE_BREAK_AND_INVALIDATION'
  ]),
  cases:caseRows,
  canonicalDetectorApproved:false,
  gate01:'OPEN',
  sourceCanBeSettledForRealCme:false,
  realBacktestPerformed:false,
  historicalPricesUsed:false,
  strategySignalsAuthorized:false,
  tradingEnabled:false,
  creditsOrCallsUsed:0,
  verdict:'B_IS_TESTABLE_AS_A_CANDIDATE_BUT_CANNOT_BE_CHOSEN_AS_PROFITABLE_FROM_FIXTURES'
 })
}

if (process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href) {
 console.log(JSON.stringify(runIfvgBOnlyStudy(),null,2))
}
