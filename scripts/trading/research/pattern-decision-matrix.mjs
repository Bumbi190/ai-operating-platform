/**
 * Trading GATE-01–04 — deterministic, OFFLINE, human decision matrix.
 *
 * Compares conflicting research interpretations on SYNTHETIC candles only.
 * No canonical strategy setting is picked by this module. Never import into
 * Strategy, Replay runtime, Paper, Risk, prop, approvals or execution.
 * Nothing here grants trades, upgrades grades, or claims backtest results.
 *
 * For now every decision remains null / OPEN. Published results are examples
 * of WHERE policy variants disagree, not which policy has a profitable edge.
 */
import {inspectIfvg,inspectCisd} from './pattern-candidates.mjs'
import {compareEqualPivots,inspectSmtPair} from './equal-smt-candidates.mjs'

const origin=Date.parse('2026-10-15T14:00:00.000Z')
const at=mins=>new Date(origin+mins*60000).toISOString()
const material=(rows,interval=1)=>rows.map(([open,high,low,close],i)=>Object.freeze({
  openTime:at(i*interval),open,high,low,close,complete:true
}))
const minuteSeries=rows=>({
 source:'SYNTHETIC',calendar:'SYNTHETIC_CONTIGUOUS',settled:true,
 candles:material(rows)
})
const contracted=(root,rows,timeframe='1m',begin=0)=>({
 source:'SYNTHETIC',calendar:'SYNTHETIC_CONTIGUOUS',settled:true,
 root,contractId:'SYN-'+root+'-2026-Q4',timeframe,
 candles:rows.map(([open,high,low,close],i)=>({
   openTime:at(begin+i*({'1m':1,'5m':5,'15m':15}[timeframe])),
   open,high,low,close,complete:true
 }))
})
const bearishGap=[
 ['105','106','104','104.5'],
 ['102','103','100','101'],
 ['99','100','98','99'],
 ['99','105','99','103'],
 ['103','106','102','105']
]
const earlyBearishGap=[
 ['105','106','104','104.5'],['102','103','100','101'],
 ['99','100','98','99'],['99','106','99','105']
]
const cisdBars=[
 ['104','105','101','102'],['102','103','99','100'],
 ['100','104','100','103'],['103','106','102','105']
]
const swingHigh=[
 ['99','100','98','99'], ['100','101','99','100.5'],
 ['99','100','98','99'],['99','100','98','99'],
 ['100','101.25','99','100'],['99','100','98','99']
]
const nqBars=[['100','102','99','101'],['101','105','100','103'],['103','104','101','102']]
const esBars=[['50','51','49','50'],['50','51.5','49','50.5'],['50.5','51.5','49.5','50']]
const smt=(opts={})=>({
 nq:contracted('NQ',nqBars,'1m',2),
 es:contracted('ES',esBars,'1m',2),
 nqRef:{pairId:'SYNPAIR-1',kind:'HIGH',contractId:'SYN-NQ-2026-Q4',timeframe:'1m',price:'104',confirmedAt:at(0)},
 esRef:{pairId:'SYNPAIR-1',kind:'HIGH',contractId:'SYN-ES-2026-Q4',timeframe:'1m',price:'52',confirmedAt:at(1)},
 kind:'HIGH',crossing:'WICK',maxReferenceDeltaMinutes:1,evaluationAt:at(5),...opts
})
const equal=opts=>compareEqualPivots({
 series:contracted('NQ',swingHigh,'5m'),kind:'HIGH',
 firstIndex:1,secondIndex:4,toleranceTicks:1,inclusive:true,
 tickSize:'0.25',observedThrough:at(30),...opts
})
const signalSummary=x=>Object.freeze({
 status:x.status,
 reason:x.reason??null,
 firstIndex:x.observations?.[0]?.candleIndex??null,
 firstAt:x.observations?.[0]?.at??null,
 observationCount:x.observations?.length??0,
 ambiguityCount:x.ambiguities?.length??0,
 entryPermitted:false
})
const compareSummary=x=>Object.freeze({
 status:x.status,reason:x.reason,
 tradePermitted:false,
 distanceTicks:x.distanceTicks??null,side:x.side??null
})
const record=(gate,id,title,question,variants,notes,operatorSelectedVariant=null)=>Object.freeze({
 gate,id,title,question,variants:Object.freeze(variants),
 notes,operatorSelectedVariant,
 // An operator may approve an isolated interpretation without approving the
 // complete canonical detector. Never treat this as gate-level promotion.
 approvedVariant:null,humanApprovalRequired:true,
 status:operatorSelectedVariant===null?'UNDECIDED':'OPERATOR_CHOICE_CONFIRMED_AWAITING_CANONICAL',
 eligibleForStrategy:false
})

/** Returns only an immutable, nonauthoritative review matrix. */
export function buildPatternDecisionMatrix(){
 const gap=minuteSeries(bearishGap)
 const early=minuteSeries(earlyBearishGap)
 const cis=minuteSeries(cisdBars)
 const ifvgClose=inspectIfvg(gap,{manipulationCompleteAt:at(0),crossing:'CLOSE_BEYOND_FAR_EDGE'})
 const ifvgWick=inspectIfvg(gap,{manipulationCompleteAt:at(0),crossing:'WICK_BEYOND_FAR_EDGE'})
 const orderAny=inspectIfvg(early,{manipulationCompleteAt:at(3),formation:'ANY'})
 const orderAfter=inspectIfvg(early,{manipulationCompleteAt:at(3),formation:'AFTER_MANIPULATION'})
 const cisdFirst=inspectCisd(cis,{manipulationCompleteAt:at(0),anchor:'FIRST_RUN_OPEN'})
 const cisdLast=inspectCisd(cis,{manipulationCompleteAt:at(0),anchor:'LAST_RUN_OPEN'})
 const inclusive=equal({inclusive:true}),exclusive=equal({inclusive:false})
 const wick=inspectSmtPair(smt({crossing:'WICK'}))
 const close=inspectSmtPair(smt({crossing:'CLOSE'}))
 const delta0=inspectSmtPair(smt({maxReferenceDeltaMinutes:0}))
 const delta1=inspectSmtPair(smt({maxReferenceDeltaMinutes:1}))
 const missingEs=inspectSmtPair(smt({es:{...smt().es,settled:false}}))

 const rows=[
  record('GATE-01','IFVG_CROSSING','Inverterad FVG – wick eller stängningskurs?',
    'Ska en iFVG bekräftas först när en färdig candle stänger strikt bortom zonen, eller räcker en wick?',
    {CLOSE_BEYOND_FAR_EDGE:signalSummary(ifvgClose),WICK_BEYOND_FAR_EDGE:signalSummary(ifvgWick)},
    'Inversion FVG-begreppet är bekräftat. Operatören valde färdig 1m CLOSE strikt förbi bortre zonkanten; formation/expiry/övriga kriterier kvarstår.',
    'CLOSE_BEYOND_FAR_EDGE'),
  record('GATE-01','IFVG_FORMATION','FVG bildad före manipulation?',
    'Får gapet ha bildats innan manipulationen avslutas, eller enbart efteråt?',
    {ANY:signalSummary(orderAny),AFTER_MANIPULATION:signalSummary(orderAfter)},
    'Extern feedback: båda bildningsordningar kan förekomma, oftast bildas gapet efter manipulationen (B). Frekvens ej uppmätt. Ingen B-only filtrering, åldersgräns eller tie-break godkänd.'),
  record('GATE-02','CISD_ANCHOR','CISD – första eller sista motriktade candles open?',
    'Vilken candle i den föregående motriktade runnen definierar CISD-nivån?',
    {FIRST_RUN_OPEN:signalSummary(cisdFirst),LAST_RUN_OPEN:signalSummary(cisdLast)},
    'Olika utlösningstid för samma syntetiska nedåtrun; doji och reference-leg är fortfarande olösta.'),
  record('GATE-03','EQUAL_BOUNDARY','Equal highs – inkludera ticktoleransens gräns?',
    'Är exakt en tick i avstånd equal när gränsen är en tick: ≤ eller <?',
    {INCLUSIVE:compareSummary(inclusive),EXCLUSIVE:compareSummary(exclusive)},
    'Fem-minuters syntetiska bekräftade swing highs 101 och 101.25; tickstorlek 0.25, ej real metadata.'),
  record('GATE-04','SMT_CROSSING','SMT – sweep med wick eller candle-close?',
    'Ska SMT-observation utlösas av wick genom referensnivån eller först av full candle-close?',
    {WICK:compareSummary(wick),CLOSE:compareSummary(close)},
    'Explicita handparade NQ/ES-referenser, inte automatisk matching eller bekräftad real SMT.'),
  record('GATE-04','SMT_PAIR_TIME','SMT – hur långt får referenspivots skilja?',
    'Får syntetiska NQ/ES-referenser bekräftas med en minuts tidsavstånd, eller krävs identisk tid?',
    {'0_MINUTES':compareSummary(delta0),'1_MINUTE':compareSummary(delta1)},
    'Samma påhittade referenspar; tidsmatchningen ändrar UNKNOWN till forskningsobservation.'),
  record('GATE-04','SMT_MISSING_ES','SMT – saknade ES-observationer',
    'Vad gör Atlas när ES saknas eller inte är färdig? Förslag: stanna i UNKNOWN och aldrig låtsas att SMT är false.',
    {ES_UNSETTLED:compareSummary(missingEs)},'En enda kandidat; negativt säkerhetsexempel, inget val av positiv signal.')
 ]
 const choices=Object.freeze(rows)
 const gateIds=['GATE-01','GATE-02','GATE-03','GATE-04']
 return Object.freeze({
  schemaVersion:'research.trading_pattern_decision_matrix.v0.1',
  data:'SYNTHETIC_FIXTURES_ONLY',
  policy:'NON_CANONICAL_RESEARCH',
  // Operator-confirmed terminology, NOT a detection rule or gate promotion.
  confirmedTerminology:Object.freeze({
    'GATE-01':Object.freeze({
      abbreviation:'iFVG',
      concept:'INVERSION_FAIR_VALUE_GAP',
      notConcept:'IMPLIED_FAIR_VALUE_GAP',
      userConfirmed:true,
      detectionRulesApproved:false,
      evidence:'Operator confirmation in trading review conversation, 2026-10-19'
    })
  }),
  // OPERATOR SUBDECISION ONLY. No approvedDetectionVersion or trade signal.
  confirmedSubdecisions:Object.freeze({
    'GATE-01':Object.freeze({
      iFvgCrossing:'CLOSE_BEYOND_FAR_EDGE',
      barPolicy:'COMPLETED_1M_CANDLE_ONLY',
      comparison:'STRICT_GREATER_THAN_FAR_EDGE_FOR_LONG_OR_STRICT_LESS_FOR_SHORT',
      alternativeRejected:'WICK_BEYOND_FAR_EDGE',
      operatorConfirmed:true,
      canonicalDetectorApproved:false,
      source:'Operator selected option B in trading review, 2026-10-19'
    })
  }),
  // Human-relayed feedback from strategy reviewer, not a signed rule or
  // empirical distribution. BOTH formation orders may be valid; B is said to
  // be more common, but a frequency or B-only filter is NOT established.
  formationReviewFeedback:Object.freeze({
    gate:'GATE-01',
    topic:'ORIGINAL_FVG_CREATION_RELATIVE_TO_MANIPULATION',
    reportedFrom:'USER_SHARED_CONTACT_FEEDBACK',
    bothFormationOrdersPlausible:true,
    beforeManipulationAllowedInPrinciple:true,
    afterManipulationAllowedInPrinciple:true,
    qualitativelyMoreCommon:'AFTER_MANIPULATION',
    numericalFrequencyEvidence:null,
    olderGapAgeLimitApproved:null,
    prioritizationAlgorithmApproved:false,
    fullRuleApproved:false,
    operatorSelectedVariant:null,
    pendingDecisions:Object.freeze([
      'MAX_ORIGINAL_FVG_AGE',
      'GAP_UNTOUCHED_OR_MITIGATED_POLICY',
      'CANDIDATE_TIE_BREAK',
      'GAP_EXPIRY_AND_INVALIDATION'
    ])
  }),
  canonicalRulesChanged:false,
  historicalBacktestPerformed:false,
  providerConnected:false,
  tradingEnabled:false,
  gateStatus:Object.freeze(Object.fromEntries(gateIds.map(g=>[g,'OPEN']))),
  approvals:Object.freeze(Object.fromEntries(gateIds.map(g=>[g,null]))),
  observations:Object.freeze(choices),
  reviewOnly:true,
  requiredBeforePromotion:Object.freeze([
    'Human signoff of each unresolved semantic decision',
    'Separate versioned detection contracts and golden fixtures',
    'Independent review, contract/session calendars and licensed historical data',
    'No lookahead, trade-cost and out-of-sample testing on approved implementation'
  ])
 })
}
