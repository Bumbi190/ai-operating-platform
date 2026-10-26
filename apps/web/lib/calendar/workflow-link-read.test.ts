import {beforeEach,it,expect,vi} from 'vitest';
import {readCalendarWeek} from './read';
import {listCalendarEvents} from './store';
import {listInstancesForProjects} from '../workflows/store';
import {findVendoredDefinition} from '../workflows/definitions';
import {weekRange} from './time';
import {calendarProgress} from './progress';
import type {CalendarReadDeps,CalendarEvent} from './types';
import type {WorkflowInstance} from '../workflows/types';
vi.mock('./store',()=>({listCalendarEvents:vi.fn()}));
vi.mock('../workflows/store',()=>({listInstancesForProjects:vi.fn()}));
vi.mock('./source-social',()=>({readCalendarSocial:async()=>({entries:[],truncated:false,available:true})}));
vi.mock('./source-tasks',()=>({readCalendarTasks:async()=>({tasks:[],truncated:false})}));
const def=findVendoredDefinition('familje-stunden.monthly-release',2)!;
const event={id:'event',kind:'work_block',title:'My work',description:'',location:'',projectId:'project',taskId:null,responsibility:'atlas_planned',workflowInstanceId:'flow',workStatus:'done',status:'scheduled',version:1,time:{kind:'timed',startUtc:'2026-10-22T12:00:00.000Z',endUtc:null,timeZone:'Europe/Stockholm'}} as CalendarEvent;
const row={id:'flow',project_id:'project',def_key:def.def_key,def_version:2,def_hash:def.def_hash,current_state:def.spec.initial_state,instance_key:'2026-11',wake_at:null,status:'active'} as WorkflowInstance;
const chain={select(){return this},in(){return this},eq(){return this},order:async()=>({data:[],error:null})};
const deps={sessionDb:{},adminDb:{from:()=>chain}} as unknown as CalendarReadDeps;
const actor={userId:'user',allowedProjectIds:['project']};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(listCalendarEvents).mockResolvedValue({events:[event],truncated:false});vi.mocked(listInstancesForProjects).mockResolvedValue([row]);});
it('exposes owned product instances without wake times and projects their current gate',async()=>{
 const model=await readCalendarWeek(deps,actor,weekRange('2026-10-19'));
 expect(model.workflowOptions).toEqual([{id:'flow',projectId:'project',title:'Familjestunden · 2026-11'}]);
 expect(model.entries).toHaveLength(1);expect(calendarProgress(model.entries[0]).tone).toBe('review');
 expect(listInstancesForProjects).toHaveBeenCalledWith(deps.adminDb,['project'],{limit:501});
});
it('keeps personal entries and marks the link unavailable on source failure',async()=>{
 vi.mocked(listInstancesForProjects).mockRejectedValueOnce(Error('unavailable'));
 const model=await readCalendarWeek(deps,actor,weekRange('2026-10-19'));
 expect(model.availability.manual).toBe(true);expect(model.availability.workflows).toBe(false);expect(model.workflowOptions).toEqual([]);
 expect(calendarProgress(model.entries[0])).toMatchObject({tone:'review',label:'Flödet behöver kontrolleras'});
});
it('does not use a foreign row returned by a defective data source',async()=>{
 vi.mocked(listInstancesForProjects).mockResolvedValueOnce([{...row,project_id:'foreign'}]);
 const model=await readCalendarWeek(deps,actor,weekRange('2026-10-19'));
 expect(model.workflowOptions).toEqual([]);expect(model.entries[0].linkedWorkflow?.instanceId).toBeNull();
});
it('does not query project workflows when the project scope is unavailable',async()=>{
 const model=await readCalendarWeek(deps,{...actor,projectScopeAvailable:false},weekRange('2026-10-19'));
 expect(listInstancesForProjects).not.toHaveBeenCalled();expect(model.workflowOptions).toEqual([]);expect(model.entries[0].linkedWorkflow?.href).toBeNull();
});
