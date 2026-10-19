import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runFixtureBacktest} from './first-fixture-backtest.mjs'

const ts = readFileSync(new URL('../../../apps/web/lib/backtest-lab/approved-fixture-demo.ts', import.meta.url),'utf8')
const prefix = 'export const APPROVED_FIXTURE_DEMO_HTML = '
const start=ts.indexOf(prefix)
if(start<0)throw new Error('fixture demo source not found')
const end=ts.lastIndexOf(' as const;')
if(end<0)throw new Error('fixture demo source not terminated')
const html = JSON.parse(ts.slice(start+prefix.length,end))
const fixtureString=/<script id="fixture" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1]
if(!fixtureString)throw new Error('embedded fixture JSON missing')
const embedded=JSON.parse(fixtureString)
const engine=runFixtureBacktest()

test('UI-PARITY-01: actual approved HTML contains the exact same authored candle values and instants',()=>{
 assert.deepEqual(embedded.bars,engine.bars)
})
test('UI-PARITY-02: all authored entries/exits/outcomes still match offline research engine',()=>{
 assert.equal(embedded.trades.length,engine.trades.length)
 for(const [i,t] of embedded.trades.entries()){
  const e=engine.trades[i]
  for(const key of ['id','signalIndex','entryIndex','entryTicks','stopTicks',
    'targetTicks','entryPrice','stopPrice','targetPrice','status','exitIndex','rMultiple',
    'signalAt','entryAt','exitAt'])assert.deepEqual(t[key],e[key],key)
 }
})
test('UI-PARITY-03: user-approved performance display is illustrative, never profit evidence',()=>{
 assert.deepEqual(embedded.metrics, Object.fromEntries(Object.entries(engine.metrics)
  .filter(([k])=>Object.hasOwn(embedded.metrics,k))))
 assert.equal(embedded.tradeExecutionPermitted,false)
 assert.equal(embedded.usesCanonicalLiquidityManipulation,false)
 assert.equal(embedded.marketData,'SYNTHETIC')
 assert.equal(embedded.feesAndSlippage,'NOT_MODELLED')
})
test('UI-PARITY-04: stage replay widgets and warnings remain in the approved visual',()=>{
 for(const marker of [
  'SYNTETISK REPLAY','INTE RIKTIG BACKTEST','id="chart"','id="equity"',
  'id="seek"','id="play"','data-speed="1"','data-speed="3"','data-speed="8"',
  'AMBIGUOUS_INTRABAR'
 ])assert.ok(html.includes(marker),marker)
})
