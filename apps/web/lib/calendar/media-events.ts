import type {CalendarEntry,CalendarUndatedReview,CalendarRange} from './types';
import type {PromptQueueScript,PromptQueueBinding} from './media-queue-types';
import {PROMPT_QUEUE_HREF} from './media-queue-types';
import {projectPromptChannelStates} from './media-queue-projection';
import {addCalendarDays,stockholmDate} from './time';
export function projectPromptCalendar(projectId:string,scripts:PromptQueueScript[],bindings:PromptQueueBinding[]|null,range:CalendarRange,now:string):{entries:CalendarEntry[];undated:CalendarUndatedReview[]}{
 const entries:CalendarEntry[]=[],undated:CalendarUndatedReview[]=[],seen=new Set<string>();
 for(const script of scripts){
  if(script.project_id!==projectId||seen.has(script.id)||!['approved','publishing','published'].includes(script.status))continue;
  seen.add(script.id);
  const source={kind:'media' as const,projectId,scriptId:script.id},id='media:'+projectId+':'+script.id,title=(script.hook??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,150)||'Godkänd nyhetsfilm';
  const channels=projectPromptChannelStates(script,bindings,now);
  let status=channels.every(c=>c.tone==='success'&&!c.bindingWarning)?'media_published':channels.some(c=>c.tone==='error'||c.bindingWarning==='Kontokopplingen är spärrad')?'media_error':channels.some(c=>c.tone==='review'||c.bindingWarning)?'media_review':'media_waiting';
  const receipt=channels.some(c=>c.tone==='success');
  const dateBasis:CalendarEntry['dateBasis']=script.published_at?(receipt?'first_publication':'reported_publication'):script.reviewed_at?'approval':'creation';
  const stamp=script.published_at??script.reviewed_at??script.generated_at;
  if(!stamp||!Number.isFinite(Date.parse(stamp))){undated.push({id,source,title,status:'media_review'});continue;}
  const date=stockholmDate(stamp);if(date<range.fromDate||date>=range.toDateExclusive)continue;
  if(dateBasis==='reported_publication')status='media_review';
  const timed=dateBasis==='first_publication'||dateBasis==='reported_publication';
  entries.push({id,source,title,projectId,status,editable:false,href:PROMPT_QUEUE_HREF,pendingChange:null,dateBasis,displayLabel:dateBasis==='first_publication'?'Första publicering':dateBasis==='reported_publication'?'Rapporterad publicering':'Utan klockslag',time:timed?{kind:'timed',startUtc:new Date(stamp).toISOString(),endUtc:null,timeZone:'Europe/Stockholm'}:{kind:'all_day',startDate:date,endDateExclusive:addCalendarDays(date,1),timeZone:'Europe/Stockholm'}});
 }
 return {entries,undated};
}
