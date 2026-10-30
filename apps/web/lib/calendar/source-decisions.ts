import 'server-only';
import {createDecisionLedgerStore,type DecisionLedgerStore} from '../atlas/decision-ledger/store';
import {deriveDecisionState} from '../atlas/decision-ledger/derive';
import type {DecisionRecord} from '../atlas/decision-ledger/types';
import type {CalendarActor,CalendarRange} from './types';
import {parseCalendarRange} from './validate';
import {projectDecisionSummaries,type CalendarDecisionSummary} from './decision-projection';

const MAX_PROJECTS=20,MAX_RECORDS=200,MAX_EVENTS=200;
export async function readCalendarDecisions(actor:CalendarActor,input:CalendarRange,store:Pick<DecisionLedgerStore,'byProject'>=createDecisionLedgerStore()):Promise<{decisions:CalendarDecisionSummary[];available:boolean;truncated:boolean}>{
 const range=parseCalendarRange(input);
 if(actor.projectScopeAvailable===false)return {decisions:[],available:false,truncated:false};
 if(!actor.allowedProjectIds.length)return {decisions:[],available:true,truncated:false};
 const projects=actor.allowedProjectIds.slice(0,MAX_PROJECTS),output:CalendarDecisionSummary[]=[];
 let truncated=actor.allowedProjectIds.length>MAX_PROJECTS,available=true;
 for(const projectId of projects){
  let records:DecisionRecord[];
  try{records=await store.byProject(projectId,MAX_RECORDS);}
  catch{available=false;continue;}
  if(records.length>=MAX_RECORDS){truncated=true;continue;} // Never reconstruct from an incomplete lineage.
  const chains=new Map<string,DecisionRecord[]>();
  for(const record of records){
   if(record.projectId!==projectId)continue;
   chains.set(record.decisionId,[...(chains.get(record.decisionId)??[]),record]);
  }
  for(const records of chains.values()){
   try{
    const state=deriveDecisionState(records.sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)),{at:new Date().toISOString()});
    output.push(...projectDecisionSummaries([state],range,[projectId]));
   }catch{available=false;}
  }
 }
 output.sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.id.localeCompare(b.id));
 return {decisions:output.slice(0,MAX_EVENTS),available,truncated:truncated||output.length>MAX_EVENTS};
}
