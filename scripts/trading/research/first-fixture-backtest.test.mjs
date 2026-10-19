import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fixtureBars,runFixtureBacktest,priceText,DEMO_POLICY} from './first-fixture-backtest.mjs'

test('DEMO-01 deterministic authored candle series and no hidden real prices',()=>{
 const a=fixtureBars(),b=fixtureBars()
 assert.deepEqual(a,b)
 assert.equal(a.length,45)
 assert.equal(a[0].time,'2026-10-15T14:00:00.000Z')
 assert.equal(a.at(-1).time,'2026-10-15T14:44:00.000Z')
 assert.ok(a.every(x=>x.l<=x.o&&x.l<=x.c&&x.h>=x.o&&x.h>=x.c))
})
test('DEMO-02 three preauthored markers, no inferred trading setup',()=>{
 const r=runFixtureBacktest()
 assert.equal(r.policy,DEMO_POLICY)
 assert.equal(r.usesCanonicalLiquidityManipulation,false)
 assert.equal(r.metrics.authoredSignals,3)
 assert.deepEqual(r.trades.map(t=>t.id),['SYN-W','SYN-L','SYN-?'])
 assert.deepEqual(r.trades.map(t=>t.entryIndex),[9,21,33])
})
test('DEMO-03 synthetic winner is a known 1.5R TARGET, not realistic trade',()=>{
 const t=runFixtureBacktest().trades[0]
 assert.equal(t.status,'TARGET')
 assert.equal(t.exitIndex,10)
 assert.equal(t.rMultiple,1.5)
 assert.equal(t.entryTicks-t.stopTicks,8)
 assert.equal(t.targetTicks-t.entryTicks,12)
})
test('DEMO-04 synthetic losing case does not assume a profitable fill',()=>{
 const t=runFixtureBacktest().trades[1]
 assert.equal(t.status,'STOP')
 assert.equal(t.exitIndex,22)
 assert.equal(t.rMultiple,-1)
})
test('DEMO-05 simultaneous SL and TP is NOT automatically scored',()=>{
 const t=runFixtureBacktest().trades[2]
 assert.equal(t.status,'AMBIGUOUS_INTRABAR')
 assert.equal(t.exitIndex,34)
 assert.equal(t.exitPrice,null)
 assert.equal(t.rMultiple,null)
})
test('DEMO-06 unresolved trades are excluded, not counted as 0R wins/losses',()=>{
 const m=runFixtureBacktest().metrics
 assert.deepEqual([m.authoredSignals,m.determinateTrades,m.unresolvedTrades,m.wins,m.losses],
   [3,2,1,1,1])
 assert.equal(m.illustrativeWinRate,0.5)
 assert.equal(m.netKnownR,0.5)
 assert.equal(m.averageKnownR,0.25)
 assert.equal(m.maxDrawdownR,1)
 assert.equal(m.financialNetUSD,null)
})
test('DEMO-07 equity changes only at determinate exits',()=>{
 const r=runFixtureBacktest()
 assert.deepEqual(r.equitySteps,[{barIndex:0,r:0},{barIndex:10,r:1.5},{barIndex:22,r:0.5}])
})
test('DEMO-08 no use of broker, provider or real contract/authority',()=>{
 const r=runFixtureBacktest()
 assert.equal(r.marketData,'SYNTHETIC')
 assert.equal(r.tradeExecutionPermitted,false)
 assert.equal(r.currencyMetricsAvailable,false)
 assert.equal(r.feesAndSlippage,'NOT_MODELLED')
 assert.ok(r.trades.every(t=>t.brokerOrderId===null&&t.riskUSD===null))
})
test('DEMO-09 exact tick display is reproducible without float candle math',()=>{
 assert.equal(priceText(80_001),'20000.25')
 assert.equal(priceText(80_003),'20000.75')
 assert.equal(priceText(80_006),'20001.50')
})
test('DEMO-10 invalid OHLC and noncausal signal fail closed',()=>{
 const orig=fixtureBars()
 assert.throws(()=>runFixtureBacktest([...orig.slice(0,9),{...orig[9],h:orig[9].l-1},...orig.slice(10)]),/invalid synthetic OHLC/)
 assert.throws(()=>runFixtureBacktest(orig,[{signalIndex:10,entryIndex:10,side:'LONG',riskTicks:8,rewardTicks:12}]),/invalid illustrative signal/)
})
test('DEMO-11 same inputs give byte-identical results',()=>{
 assert.equal(JSON.stringify(runFixtureBacktest()),JSON.stringify(runFixtureBacktest()))
})
test('DEMO-12 engine is offline and has no credential, order, risk or external UI imports',()=>{
 const text=readFileSync(new URL('./first-fixture-backtest.mjs',import.meta.url),'utf8')
  .replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1')
 for(const p of [/^import\s/m,/\bfetch\s*\(/,/process\.env/,/\bWebSocket\b/,
  /submitOrder\s*\(/,/createExecutionIntent\s*\(/,/new Date\s*\(\s*\)/,
  /Math\.random\s*\(/,/require\s*\(/])assert.doesNotMatch(text,p)
})
