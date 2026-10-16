import 'server-only'
import {getAllowedProjectIds} from '@/lib/atlas/isolation'
import {projectLifecycleState} from '@/lib/project/lifecycle/list'
import {readExecutiveBriefForPrincipal} from '@/lib/atlas/intelligence/principal-read'
import {loadHandlarborsenTraffic} from '@/lib/atlas/project-analytics/handlarborsen-posthog-traffic'
import type {HistoryServiceResult} from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-service'
import {HANDLARBORSEN_PROJECT_ID,HANDLARBORSEN_PROJECT_SLUG} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {readOverviewPages} from './read-pages'
import {deriveGrowthOverview} from './growth'
import type {GrowthProject,GrowthOverview,SocialSourceRow,WorkSourceRow} from './growth-types'
import type {OverviewPeriod,ReadResult} from './types'
type Request={db:any;userId:string|null|undefined;projects:GrowthProject[];period:OverviewPeriod;now:Date}
export type GrowthReaders={
  brief:typeof readExecutiveBriefForPrincipal
  traffic:typeof loadHandlarborsenTraffic
  competitors:()=>Promise<HistoryServiceResult>
}
type Traffic=Awaited<ReturnType<typeof loadHandlarborsenTraffic>>
const trafficCache=new Map<string,{until:number;value:NonNullable<Traffic>}>()
/** Only the external read is cached. Fresh owner/lifecycle proof precedes every cache lookup. */
async function trafficFor(userId:string,project:GrowthProject,allowedProjectIds:string[],period:OverviewPeriod,now:Date):Promise<Traffic>{
  const key=JSON.stringify([userId,project.id,period,now.toISOString().slice(0,10)])
  const hit=trafficCache.get(key)
  if(hit&&hit.until>now.getTime())return hit.value
  const value=await loadHandlarborsenTraffic(project,{allowedProjectIds},{period,now})
  if(value&&(value.status==='available'||value.status==='waiting_for_events')){
    if(trafficCache.size>=32)trafficCache.delete(trafficCache.keys().next().value!)
    trafficCache.set(key,{until:now.getTime()+60_000,value})
  }
  return value
}
const unavailable=<T>():ReadResult<T>=>({state:'unavailable',rows:[]})
function empty(request:Request):GrowthOverview{
  return deriveGrowthOverview({...request,projects:[],social:unavailable(),work:unavailable(),traffic:{},briefs:{},competitors:{status:'unavailable'}})
}
/** No collector, model generation, mutation or execution. Input project IDs never confer authority. */
export async function loadGrowthOverview(request:Request,custom?:GrowthReaders):Promise<GrowthOverview>{
  const {db,userId,now,period}=request
  if(!userId)return empty(request)
  const [allowed,owned]=await Promise.all([
    getAllowedProjectIds(db,userId),
    readOverviewPages<any>((from,to)=>db.from('projects').select('id,owner_id,name,slug,color,project_lifecycle(state)')
      .eq('owner_id',userId).order('id').range(from,to))
  ])
  if(owned.state!=='complete')return empty(request)
  const authorized=new Map<string,GrowthProject>()
  try{
    for(const p of owned.rows){
      if(p.owner_id!==userId||!allowed.includes(p.id)||projectLifecycleState(p)!=='active')continue
      if(typeof p.name!=='string'||!p.name.trim()||typeof p.slug!=='string'||!p.slug.trim())return empty(request)
      authorized.set(p.id,{id:p.id,name:p.name,slug:p.slug,color:p.color??null,href:'/projects/'+encodeURIComponent(p.slug)})
    }
  }catch{return empty(request)}
  const wanted=[...new Set(request.projects.map(p=>p.id))]
  if(wanted.some(id=>!authorized.has(id)))return empty(request)
  const projects=wanted.map(id=>authorized.get(id)!),ids=projects.map(p=>p.id)
  if(!ids.length)return deriveGrowthOverview({...request,projects:[],social:{state:'complete',rows:[]},work:{state:'complete',rows:[]},traffic:{},briefs:{},competitors:{status:'disabled'}})
  const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-period+1)).toISOString().slice(0,10)
  const end=now.toISOString().slice(0,10)
  const read=<T>(table:string,fields:string,filter:(q:any)=>any)=>
    readOverviewPages<T>((from,to)=>filter(db.from(table).select(fields).in('project_id',ids)).order('id').range(from,to))
  // JSON paths project only account identities; raw provider bodies never cross this boundary.
  const socialRead=read<SocialSourceRow>('account_snapshots',
    'id,project_id,platform,snapshot_date,captured_at,followers,reach,account_id:raw->>id,instagram_user_id:raw->>user_id,youtube_channel_id:raw->items->0->>id',
    q=>q.gte('snapshot_date',start).lte('snapshot_date',end))
  const workRead=(async():Promise<ReadResult<WorkSourceRow>>=>{
    const fields='id,project_id,status,kind,created_at'
    const active=await read<WorkSourceRow>('runs',fields,q=>q.in('status',['pending','queued','running','paused','awaiting_approval']))
    let recent:ReadResult<WorkSourceRow>
    try{
      const result=await db.from('runs').select(fields).in('project_id',ids).gte('created_at',start+'T00:00:00Z')
        .lte('created_at',now.toISOString()).order('created_at',{ascending:false}).order('id').limit(12)
      recent=result.error||!Array.isArray(result.data)?unavailable():{state:'complete',rows:result.data}
    }catch{recent=unavailable()}
    const rows=[...new Map([...active.rows,...recent.rows].map(r=>[r.id,r])).values()]
    return {state:active.state==='complete'&&recent.state==='complete'?'complete':rows.length?'partial':'unavailable',rows}
  })()
  const readBrief=custom?.brief??readExecutiveBriefForPrincipal
  const briefReads=Promise.all(projects.map(async p=>{
    try{return [p.id,await readBrief({db,userId,projectId:p.id})] as const}
    catch{return [p.id,{status:'unavailable' as const,brief:null}] as const}
  }))
  const hb=projects.find(p=>p.id===HANDLARBORSEN_PROJECT_ID&&p.slug===HANDLARBORSEN_PROJECT_SLUG)
  const trafficRead=(async()=>{
    if(!hb)return {}
    try{
      const result=custom?await custom.traffic(hb,{allowedProjectIds:ids},{period,now}):await trafficFor(userId,hb,ids,period,now)
      return result?{[hb.id]:result}:{}
    }catch{return {[hb.id]:{status:'unavailable' as const,days:[] as [],checkedAt:null}}}
  })()
  const competitorsRead=(async()=>{
    if(!hb)return {status:'disabled' as const}
    try{return await (custom?.competitors??(async()=>(await import('@/lib/atlas/project-analytics/handlarborsen-competitor-history-service')).createCompetitorHistoryService().load()))()}
    catch{return {status:'unavailable' as const}}
  })()
  const [social,work,briefs,traffic,competitors]=await Promise.all([socialRead,workRead,briefReads,trafficRead,competitorsRead])
  return deriveGrowthOverview({projects,period,now,social,work,briefs:Object.fromEntries(briefs),traffic,competitors})
}
