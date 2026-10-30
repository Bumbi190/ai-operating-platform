import {describe,it,expect} from 'vitest';
import {projectCalendarWorkflowLinks,workflowLinkSnapshot} from './workflow-link';
import {findVendoredDefinition} from '../workflows/definitions';
import {calendarProgress} from './progress';
import type {CalendarEntry} from './types';
import type {WorkflowInstance} from '../workflows/types';
const def=findVendoredDefinition('familje-stunden.monthly-release',2)!;
const row={id:'flow',project_id:'project',def_key:def.def_key,def_version:2,def_hash:def.def_hash,instance_key:'2026-11',status:'active',current_state:def.spec.states.find(s=>!s.human_gate.required)!.id,wake_at:null} as WorkflowInstance;
const entry={id:'manual:event',source:{kind:'manual',eventId:'event',version:1},status:'scheduled',projectId:'project',manualEvent:{kind:'work_block',responsibility:'atlas_planned',workflowInstanceId:'flow',workStatus:'done'}} as CalendarEntry;
describe('calendar workflow link projection',()=>{
 it('uses the current product planning process, without claiming execution',()=>expect(workflowLinkSnapshot(row)).toMatchObject({tone:'waiting',label:'Planeringsflöde',planningOnly:true}));
 it('cannot turn a linked block green from its manual done status',()=>{
  const linked=projectCalendarWorkflowLinks([entry],[row],['project']);
  expect(calendarProgress(linked[0])).toMatchObject({tone:'waiting',label:'Planeringsflöde'});
 });
 it('marks foreign, missing and unreadable links orange without copying foreign details',()=>{
  for(const rows of [[],[{...row,project_id:'foreign'}]]){
   const linked=projectCalendarWorkflowLinks([entry],rows,rows.length?['foreign']:['project']);
   expect(calendarProgress(linked[0])).toMatchObject({tone:'review'});expect(linked[0].linkedWorkflow?.href).toBeNull();
  }
 });
 it('does not trust a definition hash or an unknown state',()=>{
  expect(workflowLinkSnapshot({...row,def_hash:'different'}).tone).toBe('review');
  expect(workflowLinkSnapshot({...row,current_state:'unknown'}).tone).toBe('review');
 });
 it('shows a canonical human gate as review and terminal status as flow completion',()=>{
  const gate=def.spec.states.find(s=>s.human_gate.required)!;
  expect(workflowLinkSnapshot({...row,current_state:gate.id})).toMatchObject({tone:'review',label:'Granskningssteg i flödet'});
  expect(workflowLinkSnapshot({...row,status:'complete',current_state:def.spec.terminal_states[0]})).toMatchObject({tone:'success',label:'Flödet avslutat'});
 });
 it('cancellation wins and own work has no workflow projection',()=>{
  const cancelled=projectCalendarWorkflowLinks([{...entry,status:'cancelled'}],[row],['project'])[0];
  expect(calendarProgress(cancelled).tone).toBe('neutral');
  const own={...entry,manualEvent:{...entry.manualEvent!,responsibility:'self' as const}};
  expect(projectCalendarWorkflowLinks([own],[row],['project'])[0].linkedWorkflow).toBeUndefined();
 });
});
