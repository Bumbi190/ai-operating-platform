import type {
  GrowthInput,GrowthOverview,GrowthProject,GrowthState,SocialPlatform,SocialSeries,
  SocialSourceRow,TrafficSeries,GrowthRecommendation,ProjectBrief,CompetitorSummary
} from './growth-types'
import {HANDLARBORSEN_PROJECT_ID} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {COMPETITOR_SITES} from '@/lib/atlas/project-analytics/handlarborsen-competitor-landscape'
import {evaluateCompetitorHistory} from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-core'
const DAY=86_400_000
export const GROWTH_FRESH_MS=26*3_600_000
const platforms:readonly SocialPlatform[]=['instagram','facebook','youtube']
const labels={instagram:'Instagram',facebook:'Facebook',youtube:'YouTube'}
const count=(v:unknown):number|null=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null
const text=(v:unknown,max=1200):string|null=>typeof v==='string'&&v.trim()&&v.trim().length<=max?v.trim():null
const stamp=(v:unknown,now:Date):string|null=>{
  if(typeof v!=='string'||!/\dT\d.*(?:Z|[+-]\d{2}:\d{2})$/.test(v))return null
  const n=Date.parse(v)
  return Number.isFinite(n)&&n<=now.getTime()?new Date(n).toISOString():null
}
const fresh=(at:string,now:Date)=>now.getTime()-Date.parse(at)<=GROWTH_FRESH_MS
const date=(v:unknown):v is string=>{
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false
  const parsed=Date.parse(v+'T00:00:00Z')
  return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===v
}
function identity(row:SocialSourceRow):string|null{
  const value=row.platform==='youtube'?row.youtube_channel_id:
    row.platform==='instagram'?(row.instagram_user_id??row.account_id):row.account_id
  return typeof value==='string'&&/^[\w-]{1,160}$/.test(value)?value:null
}
function socialSeries(p:GrowthProject,platform:SocialPlatform,input:GrowthInput):SocialSeries{
  const initial:SocialSeries={projectId:p.id,projectName:p.name,platform,label:labels[platform],
    state:input.social.state==='complete'?'missing':input.social.state,followers:null,reach:null,
    lifetimeViews:null,observedAt:null,points:[],delta:null,fromDate:null,toDate:null}
  const start=new Date(Date.UTC(input.now.getUTCFullYear(),input.now.getUTCMonth(),input.now.getUTCDate()-input.period+1)).toISOString().slice(0,10)
  let invalid=false
  const rows=input.social.rows.filter(r=>r.project_id===p.id&&r.platform===platform).filter(r=>{
    const ok=date(r.snapshot_date)&&r.snapshot_date>=start&&r.snapshot_date<=input.now.toISOString().slice(0,10)&&!!stamp(r.captured_at,input.now)
    if(!ok)invalid=true
    return ok
  }).sort((a,b)=>a.snapshot_date.localeCompare(b.snapshot_date)||a.captured_at.localeCompare(b.captured_at))
  if(!rows.length)return {...initial,state:invalid?'partial':initial.state}
  const latest=rows[rows.length-1],observedAt=stamp(latest.captured_at,input.now)!
  const followers=count(latest.followers),reach=count(latest.reach)
  if(latest.followers!==null&&followers===null)invalid=true
  if(latest.reach!==null&&reach===null)invalid=true
  if(new Set(rows.map(r=>r.snapshot_date)).size!==rows.length)invalid=true
  let state:GrowthState=input.social.state==='complete'&&!invalid?'ready':input.social.state==='unavailable'?'unavailable':'partial'
  if(state==='ready'&&followers===null&&reach===null)state='waiting'
  if(state==='ready'&&!fresh(observedAt,input.now))state='stale'
  const account=identity(latest)
  let lastBreak=-1
  rows.forEach((r,i)=>{if(identity(r)!==account||count(r.followers)===null)lastBreak=i})
  const points=account?rows.slice(lastBreak+1).map(r=>({date:r.snapshot_date,value:count(r.followers)!})):[]
  const consecutive=points.length>1&&points.every((p,i)=>!i||Date.parse(p.date)-Date.parse(points[i-1].date)===DAY)
  const delta=state==='ready'&&consecutive?points[points.length-1].value-points[0].value:null
  return {...initial,state,followers,reach:platform==='youtube'?null:reach,
    lifetimeViews:platform==='youtube'?reach:null,observedAt,points,delta,
    fromDate:delta===null?null:points[0].date,toDate:delta===null?null:points[points.length-1].date}
}
function trafficSeries(p:GrowthProject,input:GrowthInput):TrafficSeries{
  const source=input.traffic[p.id]
  const out:TrafficSeries={projectId:p.id,projectName:p.name,state:'missing',days:[],
    totalPageviews:null,checkedAt:null,timezone:'UTC',period:input.period}
  if(!source||source.status==='not_connected')return out
  if(source.status==='unavailable')return {...out,state:'unavailable'}
  const at=stamp(source.checkedAt,input.now)
  if(!at)return {...out,state:'unavailable'}
  if(source.status==='waiting_for_events')return {...out,state:'waiting',checkedAt:at}
  const days=source.days
  const end=input.now.toISOString().slice(0,10)
  const start=new Date(Date.parse(end+'T00:00:00Z')-(input.period-1)*DAY).toISOString().slice(0,10)
  if(days.length!==input.period||days.some((d,i)=>!date(d.date)||d.date<start||d.date>end||count(d.pageviews)===null||(i>0&&Date.parse(d.date)-Date.parse(days[i-1].date)!==DAY))||
    days[0]?.date!==start||days[days.length-1]?.date!==end)return {...out,state:'partial',checkedAt:at}
  const total=days.reduce((n,d)=>n+d.pageviews,0)
  if(!Number.isSafeInteger(total)||total!==source.totalPageviews)return {...out,state:'partial',checkedAt:at}
  return {...out,state:fresh(at,input.now)?'ready':'stale',checkedAt:at,totalPageviews:total,
    days:days.map(d=>({date:d.date,value:d.pageviews}))}
}
function briefFor(p:GrowthProject,input:GrowthInput):{brief:ProjectBrief;recommendations:GrowthRecommendation[]}{
  const result=input.briefs[p.id],obj=result?.brief
  const empty:ProjectBrief={projectId:p.id,state:result?.status==='unavailable'?'unavailable':'missing',situation:null,producedAt:null}
  if(!obj||obj.kind!=='executive_brief'||obj.projectId!==p.id||obj.supersededBy!==null||
    obj.body?.scope!=='project'||obj.body.projectId!==p.id)return {brief:empty,recommendations:[]}
  const at=stamp(obj.producedAt,input.now)
  if(!at)return {brief:empty,recommendations:[]}
  const state:GrowthState=fresh(at,input.now)?'ready':'stale'
  const brief={...empty,state,producedAt:at,situation:text(obj.body.situation)}
  if(state!=='ready'||!Array.isArray(obj.body.recommendations))return {brief,recommendations:[]}
  const recommendations:GrowthRecommendation[]=[]
  for(const [i,r] of obj.body.recommendations.slice(0,20).entries()){
    const title=text(r?.summary),counterfactual=text(r?.counterfactual),defeater=text(r?.defeater)
    if(!title||!counterfactual||!defeater||typeof r.confidence!=='number'||!Number.isFinite(r.confidence)||r.confidence<.5||r.confidence>1||!Array.isArray(r.evidence)||!r.evidence.length||r.evidence.length>30)continue
    if(!r.evidence.some(e=>e.sourceKind==='signal'||e.sourceKind==='atlas_intelligence'))continue
    const evidence=r.evidence.map(e=>({label:text(e?.label,300),observedAt:stamp(e?.producedAt,input.now),
      valid:!!text(e?.sourceId,180)&&['signal','atlas_intelligence','memory','config','action'].includes(e?.sourceKind)}))
    if(evidence.some(e=>!e.valid||!e.label||!e.observedAt||!fresh(e.observedAt,input.now)))continue
    recommendations.push({id:obj.id+':'+i,projectId:p.id,projectName:p.name,projectHref:p.href,
      kind:'analysis',title,reason:brief.situation??'Sparad Atlas-bedömning med källunderlag.',
      counterfactual,defeater,confidence:r.confidence,observedAt:at,
      evidence:evidence.map(e=>({label:e.label!,observedAt:e.observedAt!}))})
  }
  return {brief,recommendations}
}
function competitors(input:GrowthInput):CompetitorSummary[]{
  if(!input.projects.some(p=>p.id===HANDLARBORSEN_PROJECT_ID&&p.slug==='handlarborsen'))return []
  const stored=input.competitors
  const history=stored.status==='ok'&&stored.history.status==='ok'
    ?evaluateCompetitorHistory(stored.history.observations,input.now):null
  return COMPETITOR_SITES.map(site=>{
    const rows=history?.status==='ok'?history.observations.filter(r=>r.sourceId===site.id):[]
    const latest=rows[rows.length-1]
    const change=history?.status==='ok'?history.comparisons.find(c=>c.sourceId===site.id&&c.to===latest?.checkedAt&&c.kind==='changed'):null
    const state:GrowthState=!latest?(stored.status==='unavailable'?'unavailable':'missing'):
      latest.status!=='metadata_checked'?'unavailable':fresh(latest.checkedAt,input.now)?'ready':'stale'
    return {projectId:HANDLARBORSEN_PROJECT_ID,sourceId:site.id,name:site.name,url:site.url,state,
      checkedAt:latest?.checkedAt??null,changed:!!change,
      detail:change?'Ändrad sidtitel – granska källan innan du drar slutsatser.':
        latest?.status==='metadata_checked'?'Sparad kontroll av sidtitel.':'Inget verifierat konkurrentunderlag att visa ännu.'}
  })
}
const workLabels:Record<string,string>={queued:'I kö',pending:'Väntar',running:'Arbetar',done:'Klart',
  completed:'Klart',succeeded:'Klart',failed:'Behöver ses över',paused:'Pausat',
  awaiting_approval:'Väntar på godkännande',cancelled:'Avbrutet',canceled:'Avbrutet'}
const activeWork=new Set(['queued','pending','running','paused','awaiting_approval'])
export function deriveGrowthOverview(input:GrowthInput):GrowthOverview{
  const social=input.projects.flatMap(p=>platforms.map(platform=>socialSeries(p,platform,input)))
  const traffic=input.projects.map(p=>trafficSeries(p,input))
  const b=input.projects.map(p=>briefFor(p,input))
  const recommendations=b.flatMap(x=>x.recommendations)
  if(!recommendations.length)for(const p of input.projects){
    const web=traffic.find(t=>t.projectId===p.id)!
    const channels=social.filter(s=>s.projectId===p.id)
    if(web.state==='ready'||channels.some(s=>s.state==='ready'))continue
    recommendations.push({id:'measurement:'+p.id,projectId:p.id,projectName:p.name,projectHref:p.href,
      kind:'measurement',title:'Säkra mätunderlaget för '+p.name,
      reason:'Atlas behöver aktuella observationer för att föreslå nästa tillväxtsteg.',
      counterfactual:null,defeater:null,confidence:null,evidence:[],observedAt:null})
  }
  const projects=new Map(input.projects.map(p=>[p.id,p]))
  const seen=new Set<string>()
  const scopedWork=input.work.rows.filter(r=>projects.has(r.project_id))
  const validWork=scopedWork.filter(r=>!!text(r.id,180)&&
    !!text(r.status,80)&&!!stamp(r.created_at,input.now)&&!seen.has(r.id)&&(seen.add(r.id),true))
  const workState=input.work.state==='complete'&&validWork.length!==scopedWork.length?'partial':input.work.state
  const rows=validWork.sort((a,b)=>Number(activeWork.has(b.status))-Number(activeWork.has(a.status))||b.created_at.localeCompare(a.created_at)).slice(0,12).map(r=>{
      const p=projects.get(r.project_id)!
      return {id:r.id,projectId:p.id,projectName:p.name,href:p.href,status:r.status,
        statusLabel:workLabels[r.status]??'Okänd status',createdAt:new Date(r.created_at).toISOString(),
        title:(r.kind==='website_build'||r.kind==='website.static.build.v1')?'Webbplatsbygge':'Agentjobb',active:activeWork.has(r.status)}
    })
  return {evaluatedAt:input.now.toISOString(),period:input.period,social,traffic,briefs:b.map(x=>x.brief),
    recommendations:recommendations.slice(0,3),competitors:competitors(input),work:{state:workState,rows},
    coverage:{projects:input.projects.length,web:traffic.filter(t=>t.state==='ready').length,
      social:social.filter(s=>s.state==='ready'&&s.followers!==null).length,analyses:b.filter(x=>x.brief.state==='ready').length}}
}
