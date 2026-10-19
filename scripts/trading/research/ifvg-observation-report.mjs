/**
 * OFFLINE/READ-ONLY report for deliberately constructed synthetic iFVG
 * observation counts. This never reports actual historical win rate or PnL.
 */
import {writeFileSync,mkdirSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {runIfvgSyntheticStatistics} from './ifvg-observation-statistics.mjs'

const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;')
const names={
 LONG_POST:'LONG – ny FVG',LONG_OLD:'LONG – äldre FVG',
 SHORT_POST:'SHORT – ny FVG',SHORT_OLD:'SHORT – äldre FVG',
 LONG_SPANNING:'FVG över manipulationen',WICK_ONLY:'Wick utan close',
 TOUCH_ONLY:'Close exakt på gränsen',MULTIPLE_GAPS:'Flera möjliga FVG',
 FLAT_NO_GAP:'Ingen FVG',UNSETTLED:'Ej färdig datakälla',
 INCOMPLETE:'Ofärdig candle',MISSING_MINUTE:'Saknad minut'
}
function indicator(s){
 if(s.status==='INDETERMINATE')return '<b class="ind unknown">OKÄND DATA</b>'
 if(s.ambiguousCandleCount)return '<b class="ind warning">TVETYDIGT</b>'
 if(s.candidateCount)return '<b class="ind green">'+s.candidateCount+' KANDIDAT</b>'
 return '<b class="ind">INGEN KANDIDAT</b>'
}
function card(label,s){
 return '<div class="card"><h2>'+escape(label)+'</h2><strong class="huge">'+s.candidateCount+
 '</strong><p>iFVG-kandidater i konstruerade scenarier</p>'+
 '<div class="minigrid"><span>LONG <b>'+s.longCount+'</b></span>'+
 '<span>SHORT <b>'+s.shortCount+'</b></span>'+
 '<span>Tvetydiga <b>'+s.ambiguousCandleCount+'</b></span>'+
 '<span>Ogiltig data <b>'+s.invalidFixtureCount+'</b></span></div></div>'
}
export function renderIfvgObservationStatisticsHtml(report=runIfvgSyntheticStatistics()){
 if(report?.status!=='SYNTHETIC_RESEARCH_ONLY'||report?.tradingPermission!==false||
    report?.bOnly?.netProfitUSD!==null||report?.gate01Status!=='OPEN')
  throw Error('RESEARCH_ONLY_STATISTICS_REQUIRED')
 const max=Math.max(report.bOnly.candidateCount,report.aPlusB.candidateCount,1)
 const bar=(label,s,cls)=>
  '<div class="barrow"><span>'+label+'</span><div class="track"><div class="fill '+cls+
  '" style="width:'+Math.round(s.candidateCount/max*100)+'%"></div></div>'+
  '<strong>'+s.candidateCount+'</strong></div>'
 const rows=report.cases.map(c=>'<tr><td><b>'+escape(names[c.id]||c.id)+
  '</b><small>'+escape(c.id)+'</small></td><td>'+indicator(c.bOnly)+'</td>'+
  '<td>'+indicator(c.aPlusB)+'</td><td>'+ (c.candidatesRemovedByB?
    '−'+c.candidatesRemovedByB:'—')+'</td></tr>').join('')
 const styles=[
  '*{box-sizing:border-box}',
  ':root{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#e4effe;background:#081220}',
  'body{margin:0;background:radial-gradient(ellipse at 85% 0,#18446770,transparent 55%),#081220}',
  'main{max-width:1080px;margin:auto;padding:26px 20px 65px}',
  'header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}',
  '.brand{font-weight:900;letter-spacing:.13em;color:#85e5d4}',
  '.pill{border-radius:30px;padding:9px 14px;color:#ffdb9b;background:#3a2a16;border:1px solid #a67a39;font-size:11px;font-weight:700}',
  'h1{font-size:clamp(27px,4vw,42px);letter-spacing:-.04em;margin:24px 0 8px}',
  '.intro{color:#aac0d9;line-height:1.7;max-width:950px;font-size:14px}',
  '.warningcard{background:#182d43;border:1px solid #415d77;border-radius:13px;padding:15px;color:#c4d5e9;margin:20px 0;font-size:13px;line-height:1.65}',
  '.warningcard strong{color:#ffdfa2}',
  '.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}',
  '.card{background:#112136;border:1px solid #2c445d;border-radius:14px;padding:18px;margin-bottom:14px}',
  'h2{font-size:16px;margin:0 0 14px}',
  '.huge{font-size:53px;color:#74e5cf;letter-spacing:-.06em;line-height:1}',
  '.card p{color:#9eb3ca;font-size:12px}',
  '.minigrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}',
  '.minigrid span{background:#0e1b2b;border:1px solid #284158;border-radius:9px;padding:10px;color:#99b2ce;font-size:11px}',
  '.minigrid b{display:block;color:#e8f6ff;font-size:20px;margin-top:4px}',
  '.barrow{display:grid;grid-template-columns:90px 1fr 30px;gap:10px;align-items:center;margin:12px 0;font-size:12px}',
  '.track{height:17px;border-radius:5px;background:#1b344a;overflow:hidden}',
  '.fill{height:100%;border-radius:5px}.fill.b{background:#6fddc8}.fill.ab{background:#b1a2f2}',
  '.foot{color:#91aac7;font-size:11px;line-height:1.65}',
  '.tablewrap{overflow:auto}',
  'table{border-collapse:collapse;width:100%;min-width:650px;font-size:12px}',
  'th{text-align:left;color:#9cb6d2;border-bottom:1px solid #334c65;padding:11px}',
  'td{padding:12px 11px;border-bottom:1px solid #263b54}',
  'td small{display:block;color:#91a6be;margin-top:3px}',
  '.ind{display:inline-block;color:#b9c9da;border:1px solid #405a72;border-radius:6px;padding:5px 7px;white-space:nowrap;font-size:10px}',
  '.ind.green{color:#79e4c5;background:#153d3b;border-color:#2a907b}',
  '.ind.warning{color:#ffd08a;background:#3b301b;border-color:#ad8148}',
  '.ind.unknown{color:#bcb3fa;background:#25254b;border-color:#7669bc}',
  '.footline{border-top:1px solid #29435c;margin-top:25px;padding-top:17px;color:#9bafc4;font-size:12px;line-height:1.6}',
  '@media(max-width:650px){main{padding:18px 12px 55px}.grid{grid-template-columns:1fr}.card{padding:13px}}'
 ].join('\n')
 return [
  '<!doctype html><html lang="sv"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<meta name="color-scheme" content="dark">',
  '<title>Omnira · iFVG första statistikrapport</title><style>',styles,'</style></head><body><main>',
  '<header><b class="brand">◈ OMNIRA / ATLAS TRADING LAB</b>',
  '<span class="pill">SYNTETISKA SCENARIER · EJ VERKLIG BACKTEST</span></header>',
  '<h1>Första statistikrundan – iFVG B-only</h1>',
  '<p class="intro">En reproducerbar jämförelse av två iFVG-forskningsfilter på ',
  report.cases.length,
  ' avsiktligt konstruerade testscenarier. B kräver FVG färdig efter manipulationen. Båda kräver en färdig 1m candle-close strikt förbi gapets bortre kant.</p>',
  '<div class="warningcard"><strong>Inga lönsamhetsmått ännu.</strong> Detta är antal <b>forskningskandidater</b>, inte affärer. Ingen verklig NQ/ES-historik har använts. Win rate, expectancy, profit factor, drawdown, PnL och faktiska handelsfrekvenser är <strong>inte tillgängliga</strong>. Försök inte välja en lönsam regel utifrån detta.</div>',
  '<section class="grid">',card('B-only · efter manipulation',report.bOnly),
  card('A+B · kontrollvariant',report.aPlusB),'</section>',
  '<section class="card"><h2>Kandidater per syntetiskt filter</h2>',
  bar('B-only',report.bOnly,'b'),bar('A + B',report.aPlusB,'ab'),
  '<p class="foot">B filtrerade bort ',report.pairwise.candidateReductionOnFixtures,
  ' kandidater i ',report.pairwise.scenariosWithDifferentCandidateCounts,
  ' särskilt konstruerade fall. Det säger inget om hur vanligt detta är på en riktig marknad.</p></section>',
  '<section class="card"><h2>Granskning av samtliga exempel</h2><div class="tablewrap">',
  '<table><thead><tr><th>Fall</th><th>B-only</th><th>A+B</th><th>Skillnad</th></tr></thead><tbody>',
  rows,'</tbody></table></div>',
  '<p class="foot">Okänd data = ej färdig eller felaktig; inte en nollsignal. Tvetydigt = flera möjliga FVG:er samtidigt, ingen automatisk prioritet.</p></section>',
  '<section class="card"><h2>Nästa steg mot riktig statistik</h2>',
  '<p class="intro">Riktig historisk och licensierad NQ/ES-data med rätt kontrakt och sessionskalendrar, godkända iFVG/CISD/SMT-regler, tydlig entry/SL/TP/exit samt realistiska kostnader och oberoende testperioder.</p>',
  '<p class="foot">GATE-01–04 fortfarande OPEN · GATE-08 operativ historikkälla saknas · Ingen handelsautorisering</p></section>',
  '<div class="footline">Research only · Alla observationer är syntetiska · Ingen API-, broker- eller orderkoppling · Omnira Backtest Lab v2-designen påverkas inte.</div>',
  '</main></body></html>'
 ].join('')
}
export function renderIfvgObservationStatisticsCsv(report=runIfvgSyntheticStatistics()){
 if(report?.status!=='SYNTHETIC_RESEARCH_ONLY')throw Error('RESEARCH_ONLY_STATISTICS_REQUIRED')
 const data=[['case','category','b_status','b_candidates','b_long','b_short','b_ambiguities',
  'ab_status','ab_candidates','ab_long','ab_short','ab_ambiguities','removed_by_b']]
 for(const x of report.cases)data.push([x.id,x.category,x.bOnly.status,
  x.bOnly.candidateCount,x.bOnly.longCount,x.bOnly.shortCount,
  x.bOnly.ambiguousCandleCount,x.aPlusB.status,x.aPlusB.candidateCount,
  x.aPlusB.longCount,x.aPlusB.shortCount,x.aPlusB.ambiguousCandleCount,
  x.candidatesRemovedByB])
 return data.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\n')+'\n'
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const folder=process.argv[2]
 if(!folder)throw Error('Usage: node ifvg-observation-report.mjs OUTPUT_DIRECTORY')
 mkdirSync(folder,{recursive:true})
 const r=runIfvgSyntheticStatistics()
 writeFileSync(join(folder,'iFVG_B_Statistik_Syntetisk.html'),renderIfvgObservationStatisticsHtml(r),'utf8')
 writeFileSync(join(folder,'iFVG_B_Statistik_Syntetisk.json'),JSON.stringify(r,null,2)+'\n','utf8')
 writeFileSync(join(folder,'iFVG_B_Statistik_Syntetisk.csv'),renderIfvgObservationStatisticsCsv(r),'utf8')
 console.log(JSON.stringify({status:'SYNTHETIC_REPORTS_WRITTEN',
  cases:r.cases.length,bCandidates:r.bOnly.candidateCount,
  abCandidates:r.aPlusB.candidateCount,folder},null,2))
}
