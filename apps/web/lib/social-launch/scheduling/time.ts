import {ScheduleError} from './types'
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
function stockholmMinute(time:number){
 const p=Object.fromEntries(formatter.formatToParts(new Date(time)).map(p=>[p.type,p.value]))
 return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute
}
export function resolveStockholmSchedule(localMinute:string):string{
 if(typeof localMinute!=='string'||!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(localMinute))throw new ScheduleError('INVALID_BODY')
 const naive=Date.parse(localMinute+':00.000Z')
 if(!Number.isFinite(naive)||new Date(naive).toISOString().slice(0,16)!==localMinute)throw new ScheduleError('INVALID_BODY')
 const matches=[60,120].map(offset=>naive-offset*60000).filter(t=>stockholmMinute(t)===localMinute)
 if(matches.length!==1)throw new ScheduleError('INVALID_BODY')
 return new Date(matches[0]).toISOString()
}
export function monthlyReleaseSlot(releaseMonth:string){
 if(typeof releaseMonth!=='string'||!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(releaseMonth))throw new ScheduleError('INVALID_BODY')
 const localMinute=releaseMonth+'-01T20:30'
 return {releaseMonth,localMinute,scheduledAt:resolveStockholmSchedule(localMinute),requiresReleaseEvidence:true as const}
}
export function stockholmWeek(localMinute:string){
 const date=new Date(localMinute.slice(0,10)+'T00:00:00.000Z')
 date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7)
 return date.toISOString().slice(0,10)
}
