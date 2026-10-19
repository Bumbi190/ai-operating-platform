import test from 'node:test'
import assert from 'node:assert/strict'
import {runIfvgSyntheticStatistics} from './ifvg-observation-statistics.mjs'
import {
 renderIfvgObservationStatisticsHtml,
 renderIfvgObservationStatisticsCsv
} from './ifvg-observation-report.mjs'

const stats=runIfvgSyntheticStatistics()
test('REPORT-01: generated HTML states exactly 12 AUTHORED scenarios, not live price history',()=>{
 const h=renderIfvgObservationStatisticsHtml()
 assert.match(h,/<html lang="sv">/)
 assert.match(h,/12 avsiktligt konstruerade testscenarier/)
 assert.match(h,/SYNTETISKA SCENARIER/)
 assert.match(h,/EJ VERKLIG BACKTEST/)
 assert.match(h,/Inga lönsamhetsmått ännu/)
 assert.match(h,/inte tillgängliga/)
})
test('REPORT-02: zero external script/style/CDN/data calls and zero order buttons',()=>{
 const h=renderIfvgObservationStatisticsHtml()
 for(const re of [/<script\b/i,/<link[^>]*href=["']https?:/i,
  /<img[^>]*src=["']https?:/i,/<button\b/i,
  /<form\b/i,/\bWebSocket\b/,/\bfetch\s*\(/]){
  assert.doesNotMatch(h,re)
 }
})
test('REPORT-03: observed scenario table contains every case exactly once',()=>{
 const h=renderIfvgObservationStatisticsHtml()
 for(const item of stats.cases){
  const match=h.match(new RegExp('<small>'+item.id+'</small>','g'))||[]
  assert.equal(match.length,1,item.id)
 }
})
test('REPORT-04: B and A+B candidate counts and ambiguity are represented in visible text',()=>{
 const h=renderIfvgObservationStatisticsHtml()
 assert.match(h,/B-only · efter manipulation/)
 assert.match(h,/A\+B · kontrollvariant/)
 assert.match(h,/B filtrerade bort 2 kandidater/)
 assert.match(h,/OKÄND DATA/)
 assert.match(h,/TVETYDIGT/)
})
test('REPORT-05: cannot transform a synthetic report into apparent canonical performance',()=>{
 assert.throws(()=>renderIfvgObservationStatisticsHtml({...stats,tradingPermission:true}),/RESEARCH_ONLY/)
 assert.throws(()=>renderIfvgObservationStatisticsHtml({...stats,gate01Status:'CLOSED'}),/RESEARCH_ONLY/)
 assert.throws(()=>renderIfvgObservationStatisticsHtml({...stats,bOnly:{...stats.bOnly,netProfitUSD:1500}}),/RESEARCH_ONLY/)
})
test('REPORT-06: CSV has 12 data rows plus header and no financial performance columns',()=>{
 const csv=renderIfvgObservationStatisticsCsv()
 const lines=csv.trim().split('\n')
 assert.equal(lines.length,13)
 assert.match(lines[0],/^"case","category","b_status"/)
 assert.doesNotMatch(lines[0],/winrate|profit|pnl|drawdown/i)
 assert.ok(lines[1].includes('"LONG_POST"'))
 assert.ok(lines.at(-1).includes('"MISSING_MINUTE"'))
})
test('REPORT-07: deterministic byte-identical report for same synthetic inputs',()=>{
 assert.equal(renderIfvgObservationStatisticsHtml(),renderIfvgObservationStatisticsHtml(stats))
 assert.equal(renderIfvgObservationStatisticsCsv(),renderIfvgObservationStatisticsCsv(stats))
})
