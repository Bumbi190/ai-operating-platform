import 'server-only';
import {findVendoredDefinition} from '../workflows/definitions';
import type {WorkflowInstance} from '../workflows/types';
import type {CalendarEntry,CalendarWorkflowLink} from './types';
export const CALENDAR_LINKABLE_WORKFLOW='familje-stunden.monthly-release';
const unavailable=():CalendarWorkflowLink=>({instanceId:null,title:'Kopplat flöde',tone:'review',label:'Flödet behöver kontrolleras',planningOnly:true,href:null});
export function workflowLinkSnapshot(row:WorkflowInstance):CalendarWorkflowLink{
 const def=findVendoredDefinition(row.def_key,row.def_version);
 if(row.def_key!==CALENDAR_LINKABLE_WORKFLOW||!def||def.def_hash!==row.def_hash)return unavailable();
 const state=def.spec.states.find(s=>s.id===row.current_state);
 if(!state)return unavailable();
 const base={instanceId:row.id,title:'Familjestunden · '+row.instance_key,planningOnly:true,href:'/releases'};
 if(row.status==='complete')return def.spec.terminal_states.includes(row.current_state)?{...base,tone:'success',label:'Flödet avslutat'}:unavailable();
 if(row.status==='abandoned')return {...base,tone:'neutral',label:'Flödet avslutat utan slutförande'};
 if(row.status!=='active')return unavailable();
 return {...base,tone:state.human_gate.required?'review':'waiting',label:state.human_gate.required?'Granskningssteg i flödet':'Planeringsflöde'};
}
export function projectCalendarWorkflowLinks(entries:CalendarEntry[],rows:WorkflowInstance[],allowedProjectIds:string[]):CalendarEntry[]{
 return entries.map(entry=>{
  const {linkedWorkflow:previous,...clean}=entry;
  const event=entry.manualEvent;
  if(entry.source.kind!=='manual'||event?.kind!=='work_block'||event.responsibility!=='atlas_planned'||!event.workflowInstanceId)return clean;
  const row=allowedProjectIds.includes(entry.projectId??'')?rows.find(r=>r.id===event.workflowInstanceId&&r.project_id===entry.projectId&&allowedProjectIds.includes(r.project_id)):undefined;
  return {...clean,linkedWorkflow:row?workflowLinkSnapshot(row):unavailable()};
 });
}
