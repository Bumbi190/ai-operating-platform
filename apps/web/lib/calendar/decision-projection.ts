import type {DerivedDecisionState} from '../atlas/decision-ledger/types';
import type {CalendarRange} from './types';
import {stockholmDate} from './time';

/** Read-only, project-scoped summary; callers must obtain authorized decisions first. */
export type CalendarDecisionSummary={
 id:string;sourceSystem:'atlas_decision_ledger';sourceId:string;projectId:string;
 title:string;status:DerivedDecisionState['status'];occurredAt:string;
 decisionAt:string|null;reviewAt:string|null;hasOutcome:boolean;detailKey:string;
};
export function projectDecisionSummaries(decisions:DerivedDecisionState[],range:CalendarRange,allowedProjectIds:readonly string[]):CalendarDecisionSummary[]{
 const allowed=new Set(allowedProjectIds),out:CalendarDecisionSummary[]=[];
 for(const decision of decisions){
  if(!allowed.has(decision.projectId))continue;
  const occurredAt=decision.lastRecordAt;
  if(!Number.isFinite(Date.parse(occurredAt)))continue;
  const date=stockholmDate(occurredAt);
  if(date<range.fromDate||date>=range.toDateExclusive)continue;
  out.push({id:'atlas-decision:'+decision.decisionId+':'+decision.version,sourceSystem:'atlas_decision_ledger',
   sourceId:decision.decisionId,projectId:decision.projectId,title:decision.title,status:decision.status,
   occurredAt,decisionAt:decision.decidedAt,reviewAt:decision.review?.dueAt??null,
   hasOutcome:decision.outcome!==null,detailKey:decision.decisionId});
 }
 return out.sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.id.localeCompare(b.id));
}
