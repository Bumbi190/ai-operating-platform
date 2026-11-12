import type {CalendarWeekModel} from './types'
import {stockholmMinute,weekRange} from './time'

const fold=(s:string)=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const clock=/^([01]\d|2[0-3]):[0-5]\d$/
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
export function calendarPostIntent(text:string,previous:string[],calendar:boolean,selected=false) {
 const s=fold(text)
 const subject=/\b(inlagg(?:et|en)?|kalenderpost(?:en)?|linkedin|publicering(?:en)?)\b/
 const editing=/\b(bild(?:en|byte)?|post(?:en)?|titel(?:n)?|kalendern|publicer\w*|schemalagd\w*)\b/
 const clockMention = /\b(?:[01]?\d|2[0-3])[:.][0-5]\d\b/.test(text)
 const mentionedDate = /\b(mandag|tisdag|onsdag|torsdag|fredag|lordag|sondag|klockan|ig[a]?r)\b/.test(s)
 if(calendar&&(selected||/\b(?:den har|denna|oppna) (?:kalender)?posten\b/.test(s))&&
   /\b(?:bilden|bildbyte|skarmen|framme|markerad|markerat|vilken post|vilket inlagg|ser du)\b/.test(s))return true
 if(subject.test(s)&&(editing.test(s)||clockMention||mentionedDate)&&(calendar||/\bkalender\w*/.test(s)))return true
 if(!calendar||!previous.slice(-4).some(t=>subject.test(fold(t))&&editing.test(fold(t))))return false
 return (clockMention||mentionedDate||editing.test(s)||/\b(skarmen|framfor mig|framme|den andra|den forsta)\b/.test(s))&&
   !/\b(statistik|forsaljning|analys|leads|crm|organisatio\w*)\b/.test(s)
}

// Speech recognition occasionally drops a letter in a long compound noun.
function omittedLetter(spoken: string, titleWord: string): boolean {
 if (spoken.length < 6 || titleWord.length !== spoken.length + 1) return false
 let i = 0
 while (i < spoken.length && spoken[i] === titleWord[i]) i++
 return spoken.slice(i) === titleWord.slice(i + 1)
}

export function findCalendarPost(model:CalendarWeekModel,input:Record<string,unknown>){
 const {title,project,channel,localTime,postId}=input
 if ([title,project,channel].some(v=>v!==undefined&&(typeof v!=='string'||v.length>180||!fold(v)))||
     (localTime!==undefined&&(typeof localTime!=='string'||!clock.test(localTime)))||
     (postId!==undefined&&(typeof postId!=='string'||!uuid.test(postId))))
   return {ok:false,code:'INVALID_INPUT'} as const
 if(!model.availability.social||model.truncated.social)return {ok:false,code:'INCOMPLETE_CALENDAR'} as const
 const words=typeof title==='string'?fold(title).split(' ').filter(w=>w.length>2):[]
 const candidates=model.entries.flatMap(e=>{
   if(e.source.kind!=='social'||e.time.kind!=='timed')return []
   const local=stockholmMinute(e.time.startUtc),projectName=model.projects.find(p=>p.id===e.projectId)?.name
   if(local.slice(0,10)<model.range.fromDate||local.slice(0,10)>=model.range.toDateExclusive||
     postId&&postId!==e.source.postId||channel&&fold(String(channel))!==fold(e.channel??'')||
     project&&fold(String(project))!==fold(projectName??'')||localTime&&local.slice(11,16)!==localTime)return []
   const tokens=fold(e.title).split(' ')
   const missing = words.filter(word=>!tokens.some(token=>token.startsWith(word)))
   const approximate = missing.length > 0
   if (approximate && (!(project && channel && localTime) || missing.length !== 1 ||
       !tokens.some(token=>omittedLetter(missing[0], token)))) return []
   return [{approximate,post:{title:e.title,project:projectName,channel:e.channel,local,postId:e.source.postId,projectId:e.source.projectId,
     revisionId:e.source.revisionId,status:e.status,href:'/calendar?week='+weekRange(local.slice(0,10)).fromDate+'&post='+e.source.postId}}]
 })
 const exact = candidates.filter(candidate=>!candidate.approximate)
 const matches = (exact.length ? exact : candidates).map(candidate=>candidate.post)
 if(matches.length!==1)return {ok:false,code:matches.length?'AMBIGUOUS':'NOT_FOUND',candidates:matches.slice(0,5).map(({title,local,channel,project})=>({title,local,channel,project}))} as const
 return {ok:true,post:matches[0]} as const
}
