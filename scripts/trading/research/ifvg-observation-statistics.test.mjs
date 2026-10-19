import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runIfvgSyntheticStatistics} from './ifvg-observation-statistics.mjs'

const stats=runIfvgSyntheticStatistics()
const row=id=>stats.cases.find(x=>x.id===id)
test('STATS-01: audit includes 12 independent authored cases, not empirical trade samples',()=>{
 assert.equal(stats.cases.length,12)
 assert.equal(stats.bOnly.totalFixtures,12)
 assert.equal(stats.aPlusB.totalFixtures,12)
 assert.equal(stats.scenarioDesign,'DELIBERATELY_AUTHORED_CASES_NOT_SAMPLED_MARKET_DAYS')
 assert.equal(stats.status,'SYNTHETIC_RESEARCH_ONLY')
})
test('STATS-02: B-only removes old gaps in LONG and SHORT without changing B post-cases',()=>{
 for(const key of ['LONG_OLD','SHORT_OLD']){
  assert.equal(row(key).bOnly.candidateCount,0)
  assert.equal(row(key).aPlusB.candidateCount,1)
  assert.equal(row(key).candidatesRemovedByB,1)
 }
 for(const key of ['LONG_POST','SHORT_POST']){
  assert.equal(row(key).bOnly.candidateCount,1)
  assert.equal(row(key).aPlusB.candidateCount,1)
  assert.equal(row(key).candidatesRemovedByB,0)
 }
})
test('STATS-03: straddling FVG is still eligible as a research candidate in this B variant',()=>{
 assert.equal(row('LONG_SPANNING').bOnly.candidateCount,1)
 assert.equal(row('LONG_SPANNING').aPlusB.candidateCount,1)
})
test('STATS-04: wick-only and close exactly at far edge never confirm candidate',()=>{
 for(const key of ['WICK_ONLY','TOUCH_ONLY']){
  assert.equal(row(key).bOnly.candidateCount,0)
  assert.equal(row(key).aPlusB.candidateCount,0)
 }
})
test('STATS-05: multiple candidates remain ambiguous, not optimistically picked',()=>{
 const x=row('MULTIPLE_GAPS')
 assert.equal(x.bOnly.candidateCount,0)
 assert.equal(x.bOnly.ambiguousCandleCount,1)
 assert.equal(x.bOnly.ambiguousCandidateCount,2)
 assert.equal(x.aPlusB.ambiguousCandleCount,1)
})
test('STATS-06: incomplete/unsettled/missing synthetic candles excluded not counted no-signal',()=>{
 for(const key of ['UNSETTLED','INCOMPLETE','MISSING_MINUTE']){
  const x=row(key)
  assert.equal(x.bOnly.status,'INDETERMINATE')
  assert.equal(x.aPlusB.status,'INDETERMINATE')
  assert.equal(x.bOnly.candidateCount,0)
  assert.ok(x.bOnly.reason)
 }
})
test('STATS-07: no-gap case remains a valid zero-observation fixture',()=>{
 assert.equal(row('FLAT_NO_GAP').bOnly.status,'RESEARCH_OBSERVATIONS_ONLY')
 assert.equal(row('FLAT_NO_GAP').bOnly.candidateCount,0)
})
test('STATS-08: summary counts are exactly reconstructed from individual cases',()=>{
 for(const key of ['bOnly','aPlusB']){
  const total=stats.cases.reduce((s,x)=>s+x[key].candidateCount,0)
  const long=stats.cases.reduce((s,x)=>s+x[key].longCount,0)
  const short=stats.cases.reduce((s,x)=>s+x[key].shortCount,0)
  const invalid=stats.cases.filter(x=>x[key].status==='INDETERMINATE').length
  assert.equal(stats[key].candidateCount,total)
  assert.equal(stats[key].longCount,long)
  assert.equal(stats[key].shortCount,short)
  assert.equal(stats[key].invalidFixtureCount,invalid)
  assert.equal(stats[key].validFixtureCount+stats[key].invalidFixtureCount,12)
 }
})
test('STATS-09: B-only never produces a later time unavailable in its source candles',()=>{
 for(const key of ['bOnly','aPlusB']){
  for(const x of stats.cases){
   if(!x[key].observedThrough)continue
   const maxTime=Date.parse('2026-10-15T14:00:00.000Z')+x.bars*60000
   assert.ok(Date.parse(x[key].observedThrough)<=maxTime,x.id)
   assert.ok(x[key].confirmationLagMinutes.every(v=>v>=0),x.id)
  }
 }
})
test('STATS-10: no win rate, profit, expectancy, drawdown or trade authorization',()=>{
 for(const item of [stats.bOnly,stats.aPlusB]){
  assert.equal(item.observedWinRate,null)
  assert.equal(item.expectancyR,null)
  assert.equal(item.profitFactor,null)
  assert.equal(item.netProfitUSD,null)
  assert.equal(item.maxDrawdownR,null)
  assert.equal(item.financialMetricsAvailable,false)
 }
 assert.equal(stats.tradingPermission,false)
 assert.equal(stats.canonicalStrategyVersionApproved,false)
 assert.equal(stats.gate01Status,'OPEN')
 assert.equal(stats.marketDataLicensedOrFetched,false)
 for(const c of stats.cases){
  assert.equal(c.bOnly.executionAuthorized,false)
  assert.equal(c.aPlusB.executionAuthorized,false)
 }
})
test('STATS-11: repeatable results, frozen data and nonrandom clock-free runtime',()=>{
 assert.deepEqual(runIfvgSyntheticStatistics(),stats)
 assert.equal(Object.isFrozen(stats),true)
 assert.equal(Object.isFrozen(stats.cases),true)
 const source=readFileSync(new URL('./ifvg-observation-statistics.mjs',import.meta.url),'utf8')
   .replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1')
 for(const re of [/import\s+.*(?:http|https|next|broker|execution)/i,/process\.env/,
   /\bfetch\s*\(/,/\bWebSocket\b/,/\bXMLHttpRequest\b/,/Math\.random\s*\(/,
   /Date\.now\s*\(/,/submitOrder\s*\(/])assert.doesNotMatch(source,re)
})
test('STATS-12: scenario counting does not silently convert source refusals to market absence',()=>{
 const invalid=['UNSETTLED','INCOMPLETE','MISSING_MINUTE']
 assert.equal(stats.bOnly.invalidFixtureCount,invalid.length)
 assert.equal(stats.aPlusB.invalidFixtureCount,invalid.length)
 assert.equal(stats.bOnly.statusCounts.INDETERMINATE,invalid.length)
 assert.equal(stats.aPlusB.statusCounts.INDETERMINATE,invalid.length)
})
