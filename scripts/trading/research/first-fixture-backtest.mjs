/**
 * Omnira – FIRST VISIBLE BACKTEST PIPELINE, fixture-only v0.1
 *
 * This is an illustrative deterministic replay of pre-authored markers.
 * It is NOT Liquidity Manipulation, a trading strategy detector, real NQ/ES
 * history, a broker simulator, an execution path or statistical evidence.
 *
 * GATE-01 (iFVG), GATE-02 (CISD), GATE-03 (equals), GATE-04 (SMT) and
 * GATE-08 (real CME market data) remain OPEN. No canonical promotion.
 *
 * No imports, no network, no clock, no randomness and no money operations.
 * All prices are integer quarter-points in synthetic 'NQ' fixtures.
 */
export const DEMO_POLICY = 'SYNTHETIC_DEMONSTRATION_ONLY'
const minute=60_000
const baseTime=Date.parse('2026-10-15T14:00:00.000Z')
const startTicks=80_000  // 20000 synthetic points – not an actual price
const scriptedSignals=Object.freeze([
  {id:'SYN-W',signalIndex:8,entryIndex:9,side:'LONG',riskTicks:8,rewardTicks:12,note:'Illustration: target hit'},
  {id:'SYN-L',signalIndex:20,entryIndex:21,side:'LONG',riskTicks:8,rewardTicks:12,note:'Illustration: stop hit'},
  {id:'SYN-?',signalIndex:32,entryIndex:33,side:'LONG',riskTicks:8,rewardTicks:12,note:'Illustration: both hit, outcome unknown'},
])
export const priceText = ticks => {
  if(!Number.isSafeInteger(ticks))throw new Error('non-integer synthetic ticks')
  const n=Math.abs(ticks)
  return (ticks<0?'-':'')+Math.floor(n/4)+'.'+String((n%4)*25).padStart(2,'0')
}
export function fixtureBars() {
  const bars=[]
  let previous=startTicks
  const steps=[2,-1,3,-2,1,-3,2]
  for(let i=0;i<45;i++){
    let o=previous, c=o+steps[i%steps.length]
    let h=Math.max(o,c)+2, l=Math.min(o,c)-2
    if([9,21,33].includes(i)){c=o+1;h=o+2;l=o-2}
    if(i===10){const e=bars[9].o;h=e+14;l=e-2;c=e+13}
    if(i===22){const e=bars[21].o;h=e+2;l=e-11;c=e-8}
    if(i===34){const e=bars[33].o;h=e+14;l=e-10;c=e+3}
    const t=new Date(baseTime+i*minute).toISOString()
    bars.push(Object.freeze({i,time:t,o,h,l,c,volume:100+(i%7)*11}))
    previous=c
  }
  return Object.freeze(bars)
}
function invariantBars(bars){
  if(!Array.isArray(bars)||bars.length<35)return false
  return bars.every((b,i)=>b && Number.isInteger(b.o)&&Number.isInteger(b.h)&&Number.isInteger(b.l)&&Number.isInteger(b.c)
    && b.l<=b.o&&b.l<=b.c&&b.h>=b.o&&b.h>=b.c && b.l<=b.h
    && b.i===i&&b.time===new Date(baseTime+i*minute).toISOString()
    && (i===0||b.o===bars[i-1].c))
}
/**
 * Exactly stated artificial assumptions: authored signal at close of bar N;
 * hypothetical fill at OPEN of N+1, no fees/slippage, fixed 8-tick stop and
 * 12-tick target. An OHLC bar touching BOTH must be UNKNOWN (no "win bias").
 * These assumptions are NOT actual strategy rules or realistic fill modelling.
 */
export function runFixtureBacktest(bars=fixtureBars(),signals=scriptedSignals){
  if(!invariantBars(bars))throw new Error('invalid synthetic OHLC time series')
  if(!Array.isArray(signals))throw new Error('invalid signals')
  const trades=[]
  for(const signal of signals){
    if(!signal || !Number.isInteger(signal.signalIndex) || !Number.isInteger(signal.entryIndex)
      || signal.entryIndex!==signal.signalIndex+1||signal.entryIndex<1||
      signal.entryIndex>=bars.length||signal.side!=='LONG'||
      !Number.isInteger(signal.riskTicks)||signal.riskTicks<=0||
      !Number.isInteger(signal.rewardTicks)||signal.rewardTicks<=0)
      throw new Error('invalid illustrative signal')
    const entry=bars[signal.entryIndex].o
    const stop=entry-signal.riskTicks,target=entry+signal.rewardTicks
    let status='OPEN_UNRESOLVED',exitIndex=null,exitTicks=null,rMultiple=null
    const last=Math.min(bars.length-1,signal.entryIndex+8)
    for(let i=signal.entryIndex;i<=last;i++){
      const bar=bars[i],hitStop=bar.l<=stop,hitTarget=bar.h>=target
      if(hitStop && hitTarget){status='AMBIGUOUS_INTRABAR';exitIndex=i;break}
      if(hitStop){status='STOP';exitIndex=i;exitTicks=stop;rMultiple=-1;break}
      if(hitTarget){status='TARGET';exitIndex=i;exitTicks=target;rMultiple=signal.rewardTicks/signal.riskTicks;break}
    }
    if(status==='OPEN_UNRESOLVED'){status='TIMEOUT_UNRESOLVED';exitIndex=last}
    trades.push(Object.freeze({
      ...signal,entryTicks:entry,stopTicks:stop,targetTicks:target,
      entryPrice:priceText(entry),stopPrice:priceText(stop),targetPrice:priceText(target),
      status,exitIndex,exitPrice:exitTicks===null?null:priceText(exitTicks),rMultiple,
      signalAt:bars[signal.signalIndex].time,entryAt:bars[signal.entryIndex].time,
      exitAt:exitIndex===null?null:bars[exitIndex].time,
      riskUSD:null,brokerOrderId:null
    }))
  }
  // Equity steps happen ONLY when an exit is unambiguous; unresolved positions
  // are excluded, not scored at zero or assumed closed.
  const scored=trades.filter(t=>t.rMultiple!==null).sort((a,b)=>a.exitIndex-b.exitIndex)
  const equitySteps=[Object.freeze({barIndex:0,r:0})]
  let cumulative=0,peak=0,maxDrawdownR=0
  for(const t of scored){
    cumulative+=t.rMultiple
    peak=Math.max(peak,cumulative)
    maxDrawdownR=Math.max(maxDrawdownR,peak-cumulative)
    equitySteps.push(Object.freeze({barIndex:t.exitIndex,r:cumulative}))
  }
  const wins=scored.filter(t=>t.rMultiple>0)
  const losses=scored.filter(t=>t.rMultiple<0)
  const grossWinR=wins.reduce((s,t)=>s+t.rMultiple,0)
  const grossLossAbsR=-losses.reduce((s,t)=>s+t.rMultiple,0)
  return Object.freeze({
    policy:DEMO_POLICY,marketData:'SYNTHETIC',instrumentLabel:'NQ (påhittad fixtur)',
    currencyMetricsAvailable:false,usesCanonicalLiquidityManipulation:false,
    requiresHumanApprovalForRealTrading:true,tradeExecutionPermitted:false,
    assumedEntry:'NEXT_CANDLE_OPEN',ambiguousBarPolicy:'UNKNOWN_NOT_PROFIT',
    feesAndSlippage:'NOT_MODELLED',calibration:'AUTHOR_CREATED_OUTCOMES',
    bars:Object.freeze([...bars]),trades:Object.freeze(trades),
    metrics:Object.freeze({
      authoredSignals:signals.length,determinateTrades:scored.length,
      unresolvedTrades:trades.length-scored.length,wins:wins.length,losses:losses.length,
      illustrativeWinRate:scored.length?wins.length/scored.length:null,
      netKnownR:Math.round(cumulative*10000)/10000,
      averageKnownR:scored.length?cumulative/scored.length:null,
      profitFactor:grossLossAbsR?grossWinR/grossLossAbsR:null,
      maxDrawdownR,financialNetUSD:null
    }),
    equitySteps:Object.freeze(equitySteps)
  })
}
