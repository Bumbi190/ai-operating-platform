import type {CalendarWeekModel} from './types';
import {stockholmMinute} from './time';
import {adjustWeekProposal} from './week-adjust';
import {proposeCalendarWeek} from './week-proposal';

type Slot={taskId:string;projectId:string;title:string;startUtc:string;endUtc:string};
/** Read-only preflight. It does not authorize writes or guarantee atomicity. */
export function preflightWeekApproval(model:CalendarWeekModel,slots:Slot[]):{ok:true;count:number}|{ok:false;reason:'INCOMPLETE_SOURCES'|'INVALID_PROPOSAL'|'CONFLICT'} {
 if(proposeCalendarWeek(model,{max:0}).blocked)return {ok:false,reason:'INCOMPLETE_SOURCES'};
 if(!slots.length||slots.length>15||new Set(slots.map(s=>s.taskId)).size!==slots.length)return {ok:false,reason:'INVALID_PROPOSAL'};
 const valid=new Set(model.unscheduledTasks.filter(t=>['pending','in_progress'].includes(t.status)&&model.projects.some(p=>p.id===t.projectId)&&!(t.source==='dream'&&t.createdAt&&Date.parse(t.createdAt)<Date.now()-30*86400000)).map(t=>t.id));
 if(slots.some(s=>!valid.has(s.taskId)||!model.unscheduledTasks.some(t=>t.id===s.taskId&&t.projectId===s.projectId&&t.title===s.title)))return {ok:false,reason:'INVALID_PROPOSAL'};
 for(const slot of slots){
  const duration=(Date.parse(slot.endUtc)-Date.parse(slot.startUtc))/60000;
  if(!Number.isInteger(duration)||duration<15||duration>180)return {ok:false,reason:'INVALID_PROPOSAL'};
  const checked=adjustWeekProposal(model,slots,slot.taskId,stockholmMinute(slot.startUtc),duration);
  if(!checked.ok)return {ok:false,reason:checked.reason==='CONFLICT'?'CONFLICT':'INVALID_PROPOSAL'};
  if(checked.proposals.find(p=>p.taskId===slot.taskId)?.endUtc!==slot.endUtc)return {ok:false,reason:'INVALID_PROPOSAL'};
 }
 return {ok:true,count:slots.length};
}
