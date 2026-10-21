import 'server-only';
import {resolveCalendarAccess} from './access';
import {createDecisionLedgerStore} from '../atlas/decision-ledger/store';
import {deriveDecisionState} from '../atlas/decision-ledger/derive';
import {readCalendarDecisions} from './source-decisions';
import {parseCalendarRange} from './validate';
import {CalendarError} from './types';

const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function calendarDecisionApi(request:Request):Promise<Response>{
 try{
  if(request.method!=='GET')return json({ok:false,code:'INVALID_INPUT'},405);
  const access=await resolveCalendarAccess();
  if(!access.ok)return access.response;
  const params=new URL(request.url).searchParams;
  for(const key of params.keys())if(params.getAll(key).length!==1)return json({ok:false,code:'INVALID_INPUT'},400);
  const allowed=new Set(access.actor.allowedProjectIds);
  if(params.has('decisionId')){
   if([...params.keys()].some(k=>k!=='decisionId'))return json({ok:false,code:'INVALID_INPUT'},400);
   if(access.actor.projectScopeAvailable===false)return json({ok:false,code:'UNAVAILABLE'},503);
   const id=params.get('decisionId')??'';
   if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id))return json({ok:false,code:'INVALID_INPUT'},400);
   const lineage=await createDecisionLedgerStore().lineage(id);
   if(!lineage.length||!allowed.has(lineage[0].projectId)||lineage.some(r=>r.projectId!==lineage[0].projectId))
    return json({ok:false,code:'NOT_FOUND'},404);
   const state=deriveDecisionState(lineage,{at:new Date().toISOString()});
   return json({ok:true,decision:{decisionId:state.decisionId,title:state.title,status:state.status,
    statement:state.statement,rationale:state.rationale,expectedImpact:state.expectedImpact,
    outcome:state.outcome,review:state.review,decidedAt:state.decidedAt,lastRecordAt:state.lastRecordAt}});
  }
  if([...params.keys()].some(k=>!['fromDate','toDateExclusive'].includes(k)))return json({ok:false,code:'INVALID_INPUT'},400);
  const range=parseCalendarRange({fromDate:params.get('fromDate'),toDateExclusive:params.get('toDateExclusive'),timeZone:'Europe/Stockholm'});
  const result=await readCalendarDecisions(access.actor,range);
  return json(result);
 }catch(error){
  if(error instanceof CalendarError)return json({ok:false,code:error.code},400);
  return json({ok:false,code:'UNAVAILABLE'},503);
 }
}
