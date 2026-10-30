import type {CalendarEntry} from './types';
export type CalendarProgress={tone:'waiting'|'review'|'success'|'error'|'neutral';label:string;needsAttention:boolean};
const state=(tone:CalendarProgress['tone'],label:string):CalendarProgress=>({tone,label,needsAttention:tone==='review'||tone==='error'});
export function calendarProgress(entry:CalendarEntry):CalendarProgress{
 if(entry.status==='manually_published'&&entry.manualPublished)return state('success','Manuellt publicerad · bekräftad av dig');
 if(entry.source.kind==='media'){
  const statuses:Record<string,CalendarProgress>={media_published:state('success','Publicerat · sparade kvitton'),media_waiting:state('waiting','Godkänt · väntar'),media_review:state('review','Behöver kontrolleras'),media_error:state('error','Behöver åtgärdas')};
  return statuses[entry.status]??state('review','Status behöver kontrolleras');
 }
 if(entry.status==='cancelled')return state('neutral','Avbokat');
 if(entry.pendingChange)return state('review',entry.status==='queued'?'Schemalagt · ny tid behöver granskas':'Ny tid behöver granskas');
 if(entry.source.kind==='social'&&entry.source.jobId===null)
  return state('review',entry.status==='rejected'?'Innehåll avvisat':'Innehållsförslag · inte schemalagt');
 // The calendar source currently has no authenticated provider receipt field.
 // SQL published alone must not be presented as verified external delivery.
 if(entry.source.kind==='social'&&entry.status==='published')return state('review','Publicering behöver bekräftas');
 if(entry.manualEvent?.kind==='work_block'){
  if(entry.manualEvent.responsibility==='atlas_planned'&&entry.manualEvent.workflowInstanceId){
   const link=entry.linkedWorkflow;
   return link?state(link.tone,link.label):state('review','Flödet behöver kontrolleras');
  }
  const status=entry.manualEvent.workStatus;
  if(status==='done')return state('success','Klart');
  if(status==='in_progress')return state('waiting','Pågår');
  return state('waiting','Planerat');
 }
 const errors:Record<string,string>={failed:'Misslyckades',blocked:'Spärrat',missed:'Missat',rejected:'Avvisat'};
 if(Object.prototype.hasOwnProperty.call(errors,entry.status))return state('error',errors[entry.status]);
 const review:Record<string,string>={needs_review:'Behöver granskas',uncertain:'Utfallet är oklart',content_missing:'Innehåll saknas',proposal:'Tidsförslag'};
 if(Object.prototype.hasOwnProperty.call(review,entry.status))return state('review',review[entry.status]);
 if(entry.source.kind==='workflow'&&entry.status==='complete')return state('success','Klart');
 const waiting:Record<string,string>={scheduled:'Planerat',queued:'Schemalagt',approved:'Godkänt',claimed:'Bearbetas',waiting:'Väntar',active:'Pågår'};
 if(Object.prototype.hasOwnProperty.call(waiting,entry.status))return state('waiting',waiting[entry.status]);
 if(entry.status==='abandoned')return state('neutral','Avslutat');
 return state('neutral','Status okänd');
}
export function calendarResponsibility(entry:CalendarEntry):string|null{
 if(entry.source.kind==='manual'&&entry.manualEvent?.kind==='work_block')return entry.manualEvent.responsibility==='atlas_planned'?'Atlas – planerat':'Du';
 if(entry.source.kind==='workflow')return 'Atlas-flöde';
 if(entry.source.kind==='social'&&entry.source.jobId!==null)return 'Publiceringsflöde';
 return null;
}
export function calendarAttention(entries:CalendarEntry[]):CalendarEntry[]{
 const unique=new Map<string,CalendarEntry>();
 for(const entry of entries)unique.set(entry.id,entry);
 return [...unique.values()].filter(entry=>calendarProgress(entry).needsAttention).sort((a,b)=>Number(calendarProgress(b).tone==='error')-Number(calendarProgress(a).tone==='error')||a.id.localeCompare(b.id));
}
