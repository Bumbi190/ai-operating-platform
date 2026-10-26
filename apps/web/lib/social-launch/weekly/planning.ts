import {resolveStockholmSchedule} from '../scheduling/time'
import type {WeeklyOccasion,WeeklyPlan,WeeklySlot} from './types'
const day=86400000
const dateAt=(date:string,offset:number)=>new Date(Date.parse(date+'T12:00:00Z')+offset*day).toISOString().slice(0,10)
const localDate=(stamp:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm'}).format(new Date(stamp))
export function planMarketingWeek(weekStart:string,now:string,occasions:WeeklyOccasion[],monthlyRuleEnabled:boolean):WeeklyPlan{
 const start=Date.parse(weekStart+'T12:00:00Z'),at=Date.parse(now)
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(weekStart)||!Number.isFinite(start)||new Date(start).toISOString().slice(0,10)!==weekStart||new Date(start).getUTCDay()!==1||!Number.isFinite(at)||start>at+366*day||start+7*day<=at||typeof monthlyRuleEnabled!=='boolean')throw Error('INVALID_WEEK')
 const end=dateAt(weekStart,7),merged=new Map<string,WeeklyOccasion>(),missing:string[]=[]
 for(const o of occasions){
  if(!Number.isFinite(Date.parse(o.scheduledAt))||!['ordinary','month_release'].includes(o.kind)||o.channels.some(c=>!['facebook','instagram'].includes(c)))throw Error('INVALID_CONTEXT')
  const d=localDate(o.scheduledAt);if(d<weekStart||d>=end)continue
  const stamp=new Date(o.scheduledAt).toISOString(),prior=merged.get(stamp)
  // Conflicting classifications are not safe vacancies.
  if(prior&&prior.kind!==o.kind)throw Error('CONFLICTING_OCCASION')
  merged.set(stamp,{key:stamp,scheduledAt:stamp,kind:o.kind,channels:[...new Set([...(prior?.channels??[]),...o.channels])],sourcePostIds:[...new Set([...(prior?.sourcePostIds??[]),...o.sourcePostIds])]})
 }
 const existing=[...merged.values()].sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)),slots:WeeklySlot[]=[]
 for(const o of existing)for(const c of ['facebook','instagram'])if(!o.channels.includes(c as 'facebook'|'instagram'))missing.push('existing_channel_missing:'+o.scheduledAt+':'+c)
 const occupied=new Set(existing.map(o=>o.scheduledAt)),slot=(localMinute:string,kind:WeeklySlot['kind']):WeeklySlot=>({key:localMinute+':'+kind,localMinute,scheduledAt:resolveStockholmSchedule(localMinute),kind,releaseMonth:kind==='month_release'?localMinute.slice(0,7):null})
 if(monthlyRuleEnabled){
  for(let i=0;i<7;i++){const d=dateAt(weekStart,i);if(d.endsWith('-01')){const s=slot(d+'T20:30','month_release');if(Date.parse(s.scheduledAt)>at&&!occupied.has(s.scheduledAt)&&existing.length+slots.length<3){slots.push(s);occupied.add(s.scheduledAt)}}}
 }
 const candidates=[slot(dateAt(weekStart,1)+'T17:00','ordinary'),slot(dateAt(weekStart,4)+'T20:30','ordinary')].filter(s=>Date.parse(s.scheduledAt)>at&&!occupied.has(s.scheduledAt)&&Date.parse(s.scheduledAt)<=at+366*day)
 let remaining=Math.max(0,2-existing.filter(o=>o.kind==='ordinary').length)
 while(remaining>0&&candidates.length&&existing.length+slots.length<3){
  const distance=(s:WeeklySlot)=>Math.min(...existing.concat(slots.map(s=>({...s,channels:[],sourcePostIds:[]}))).map(o=>Math.abs(Date.parse(s.scheduledAt)-Date.parse(o.scheduledAt)))),rank=(s:WeeklySlot)=>existing.length+slots.length?distance(s):0
  candidates.sort((a,b)=>rank(b)-rank(a)||a.scheduledAt.localeCompare(b.scheduledAt));const chosen=candidates.shift()!;slots.push(chosen);remaining--
 }
 if(remaining>0)missing.push('ordinary_slots_unavailable:'+remaining)
 return {weekStart,weekEndExclusive:end,existing,slots:slots.sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)),missing}
}
