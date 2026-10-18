import {EVIDENCE} from './handlarborsen-competitors'
import {COMPETITOR_SITES} from './handlarborsen-competitor-landscape'
import {evaluateCompetitorHistory,type HistoryRecord} from './handlarborsen-competitor-history-core'
import {weeklyWatchPeriod,validWatchPeriod} from './handlarborsen-watch-runs-core'

/** Fixed official source links only. Catalogue descriptions are not new weekly evidence. */
export const WEEKLY_REPORT_SOURCES = Object.freeze([
  ...EVIDENCE.map(source=>({id:source.id,name:'Handlarbudet / '+source.label,url:source.url})),
  ...COMPETITOR_SITES.map(source=>({id:source.id,name:source.name,url:source.url})),
])
type Source = typeof WEEKLY_REPORT_SOURCES[number]
type Evidence = Readonly<{checkedAt:string;title:string|null;status:string}>
export type WeeklySource = Source & Readonly<{
  state:'missing'|'unavailable'|'baseline_missing'|'compared'
  latest:HistoryRecord|null
}>
export type WeeklyTitleChange = Readonly<{
  sourceId:Source['id'];name:string;url:string;previous:Evidence;current:Evidence
}>
export type WeeklyReviewSuggestion = Readonly<{
  id:string;kind:'title_review'|'source_gap'|'baseline';sourceId:Source['id'];name:string;url:string
  title:string;meaning:string;action:string;benefit:string;evidence:readonly Evidence[]
  status:'review_only';executionAllowed:false
}>
export type WeeklyCompetitorReport = Readonly<{
  status:'ok';period:Readonly<{start:string;endExclusive:string;asOf:string}>
  observedSources:number;comparableSources:number;titleChangeCount:number|null
  comparisonCount:number;sources:readonly WeeklySource[];changes:readonly WeeklyTitleChange[]
  suggestions:readonly WeeklyReviewSuggestion[];automaticActive:false;executionAllowed:false
}>
export type WeeklyReportResult = WeeklyCompetitorReport | Readonly<{status:'unavailable'}>
const localDate = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'})
const evidence=(row:HistoryRecord):Evidence=>({checkedAt:row.checkedAt,title:row.title,status:row.status})

/**
 * Read-only projection of already authorized, digest-verified stored metadata.
 * Revalidates observations and recomputes comparisons; never trusts supplied aggregates.
 * No I/O, model calls, persistence, scheduling, spend, notifications or execution.
 */
export function buildWeeklyCompetitorReport(input:readonly HistoryRecord[]|null,now:Date):WeeklyReportResult {
  if (!(now instanceof Date)||!Number.isFinite(now.getTime())||!Array.isArray(input)) return {status:'unavailable'}
  const start=weeklyWatchPeriod(now)
  if(!validWatchPeriod(start))return {status:'unavailable'}
  const end=new Date(start+'T12:00:00.000Z');end.setUTCDate(end.getUTCDate()+7)
  const endExclusive=end.toISOString().slice(0,10)
  const history=evaluateCompetitorHistory(input,now)
  if(history.status!=='ok')return {status:'unavailable'}
  const inWeek=(timestamp:string)=>{
    const parts=localDate.formatToParts(new Date(timestamp))
    const get=(key:string)=>parts.find(part=>part.type===key)!.value
    const day=get('year')+'-'+get('month')+'-'+get('day')
    return day>=start&&day<endExclusive
  }
  const sources:WeeklySource[]=WEEKLY_REPORT_SOURCES.map(source=>{
    const current=history.observations.filter(row=>row.sourceId===source.id&&inWeek(row.checkedAt))
    const latest=current[current.length-1]??null
    const comparison=latest?history.comparisons.find(pair=>pair.sourceId===source.id&&pair.to===latest.checkedAt):null
    const state=!latest?'missing':latest.status!=='metadata_checked'?'unavailable'
      :comparison&&(comparison.kind==='changed'||comparison.kind==='unchanged')?'compared':'baseline_missing'
    return {...source,state,latest}
  })
  const pairs=history.comparisons.filter(pair=>inWeek(pair.to)&&(pair.kind==='changed'||pair.kind==='unchanged'))
  const changes:WeeklyTitleChange[]=[]
  for(const pair of pairs) {
    if(pair.kind!=='changed')continue
    const source=WEEKLY_REPORT_SOURCES.find(source=>source.id===pair.sourceId)!
    changes.push({sourceId:source.id,name:source.name,url:source.url,
      previous:{checkedAt:pair.from,title:pair.previousTitle,status:'metadata_checked'},
      current:{checkedAt:pair.to,title:pair.currentTitle,status:'metadata_checked'}})
  }
  changes.sort((a,b)=>b.current.checkedAt.localeCompare(a.current.checkedAt)||a.sourceId.localeCompare(b.sourceId))
  const suggestions:WeeklyReviewSuggestion[]=[]
  const suggested=new Set<string>()
  function add(source:Source,kind:WeeklyReviewSuggestion['kind'],proof:readonly Evidence[]) {
    if(suggestions.length>=3||suggested.has(source.id))return
    suggested.add(source.id)
    const copy=kind==='title_review'?{
      title:'Granska titelskillnaden hos '+source.name,
      meaning:'En ändrad sidtitel kan signalera uppdaterad kommunikation. Den verifierar inte nya priser, erbjudanden eller funktioner.',
      action:'Jämför det officiella sidinnehållet och dokumentera vad som faktiskt har ändrats. Validera sedan relevansen med pilothandlare före en produktåtgärd.',
      benefit:'Undvika att prioritera en produktändring utifrån enbart rubrikmetadata.',
    }:kind==='source_gap'?{
      title:'Utred källuckan för '+source.name,
      meaning:'Den sparade kontrollen misslyckades. Konkurrentens aktuella information är därför okänd i detta underlag.',
      action:'Granska åtkomstvillkor och en tillåten officiell källväg inför en separat godkänd kontroll.',
      benefit:'Få jämförbart underlag utan att tolka ett hämtningsfel som oförändrad verksamhet.',
    }:{
      title:'Komplettera jämförelsen för '+source.name,
      meaning:'En sidtitel är verifierad men en jämförbar föregående kontroll saknas eller misslyckades.',
      action:'Behåll den daterade observationen som utgångspunkt och jämför vid nästa godkända kontroll.',
      benefit:'Skilja en första observation från en verklig förändring.',
    }
    suggestions.push({id:'hb-weekly-report-1:'+start+':'+source.id+':'+kind,kind,sourceId:source.id,name:source.name,url:source.url,
      ...copy,evidence:proof,status:'review_only',executionAllowed:false})
  }
  for(const change of changes)add({id:change.sourceId,name:change.name,url:change.url},'title_review',[change.previous,change.current])
  for(const source of sources)if(source.state==='unavailable'&&source.latest)add(source,'source_gap',[evidence(source.latest)])
  for(const source of sources)if(source.state==='baseline_missing'&&source.latest)add(source,'baseline',[evidence(source.latest)])
  return {status:'ok',period:{start,endExclusive,asOf:now.toISOString()},sources,changes,suggestions,
    observedSources:sources.filter(source=>source.latest!==null).length,
    comparableSources:sources.filter(source=>source.state==='compared').length,
    titleChangeCount:pairs.length?changes.length:null,comparisonCount:pairs.length,
    automaticActive:false,executionAllowed:false}
}
