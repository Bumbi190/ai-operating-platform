import type {CalendarWeekModel} from './types'
import {stockholmMinute,weekRange} from './time'

const fold=(s:string)=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const clock=/^([01]\d|2[0-3]):[0-5]\d$/
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
export function calendarPostIntent(text:string,previous:string[],calendar:boolean) {
 const s=fold(text)
 const subject=/\b(inlagg(?:et|en)?|kalenderpost(?:en)?|linkedin|publicering(?:en)?)\b/
 const editing=/\b(bild(?:en|byte)?|post(?:en)?|titel(?:n)?|kalendern|publicer\w*|schemalagd\w*)\b/
 const when=/\b(mandag|tisdag|onsdag|torsdag|fredag|lordag|sondag|klockan|ig[a]?r)\b|\b\d{1,2}[:.]\d{2}\b/
 if(subject.test(s)&&(editing.test(s)||when.test(s))&&(calendar||/\bkalender\w*/.test(s)))return true
 if(!calendar||!previous.slice(-4).some(t=>subject.test(fold(t))&&editing.test(fold(t))))return false
 return (when.test(s)||editing.test(s)||/\b(skarmen|framfor mig|framme|den andra|den forsta)\b/.test(s))&&
   !/\b(statistik|forsaljning|analys|leads|crm|organisatio\w*)\b/.test(s)
}

export function findCalendarPost(model:CalendarWeekModel,input:Record<string,unknown>){
 const {title,project,channel,localTime,postId}=input
 if ([title,project,channel].some(v=>v!==undefined&&(typeof v!=='string'||v.length>180||!fold(v)))||
     (localTime!==undefined&&(typeof localTime!=='string'||!clock.test(localTime)))||
     (postId!==undefined&&(typeof postId!=='string'||!uuid.test(postId))))
   return {ok:false,code:'INVALID_INPUT'} as const
 if(!model.availability.social||model.truncated.social)return {ok:false,code:'INCOMPLETE_CALENDAR'} as const
 const words=typeof title==='string'?fold(title).split(' ').filter(w=>w.length>2):[]
 const matches=model.entries.flatMap(e=>{
   if(e.source.kind!=='social'||e.time.kind!=='timed')return []
   const local=stockholmMinute(e.time.startUtc),projectName=model.projects.find(p=>p.id===e.projectId)?.name
   if(local.slice(0,10)<model.range.fromDate||local.slice(0,10)>=model.range.toDateExclusive||
     postId&&postId!==e.source.postId||channel&&fold(String(channel))!==fold(e.channel??'')||
     project&&fold(String(project))!==fold(projectName??'')||localTime&&local.slice(11,16)!==localTime)return []
   const tokens=fold(e.title).split(' ')
   if(words.some(w=>!tokens.includes(w)&&!tokens.some(t=>w.length>=3&&t.startsWith(w))))return []
   return [{title:e.title,project:projectName,channel:e.channel,local,postId:e.source.postId,projectId:e.source.projectId,
     revisionId:e.source.revisionId,status:e.status,href:'/calendar?week='+weekRange(local.slice(0,10)).fromDate+'&post='+e.source.postId}]
 })
 if(matches.length!==1)return {ok:false,code:matches.length?'AMBIGUOUS':'NOT_FOUND',candidates:matches.slice(0,5).map(({title,local,channel,project})=>({title,local,channel,project}))} as const
 return {ok:true,post:matches[0]} as const
}
