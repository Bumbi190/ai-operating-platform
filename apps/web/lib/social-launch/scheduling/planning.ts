import {monthlyReleaseSlot} from './time'
import type {ScheduleBatchView} from './types'
export function monthlyPlanningSlots(now:string,batches:ScheduleBatchView[]){
 const time=new Date(now),parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit'}).formatToParts(time).map(p=>[p.type,p.value]))
 const start=Date.UTC(Number(parts.year),Number(parts.month)-1,1),slots=[]
 for(let i=0;slots.length<6;i++){
  const month=new Date(start).setUTCMonth(new Date(start).getUTCMonth()+i),releaseMonth=new Date(month).toISOString().slice(0,7),slot=monthlyReleaseSlot(releaseMonth)
  if(Date.parse(slot.scheduledAt)<time.getTime())continue
  const matches=batches.filter(b=>b.status!=='revoked').flatMap(b=>b.manifest.items.filter(item=>item.kind==='month_release'&&item.releaseCondition?.releaseMonth===releaseMonth).map(item=>({batch:b,item})))
  const catalogs=[...new Set(matches.map(m=>m.item.releaseCondition!.catalogSha256))]
  const complete=catalogs.length===1&&['facebook','instagram'].every(c=>matches.some(m=>m.item.channel===c))
  slots.push({...slot,catalogSha256:catalogs.length===1?catalogs[0]:null,status:!matches.length?'unprepared':matches.some(m=>m.batch.reviewCurrent===false)?'needs_review':!complete?'partial':matches.every(m=>m.batch.status==='approved')?'approved':'proposal'})
 }
 return slots
}
