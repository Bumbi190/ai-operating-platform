/**
 * Protected scheduled ENQUEUE (not execution). Inert until both independent
 * feature flags are enabled and the cron bearer secret authenticates the
 * server route. It never fabricates a user, run claim, owner consent or week.
 *
 * The database RPC owns the local-time/consent/owner/single-week transaction.
 * Its UNIQUE(project_id,week_start) ledger is deliberately independent of
 * public.runs.idempotency_key (which MUST be NULL for an unbound run).
 */
import 'server-only'
import {FAMILY_WEEKLY_PROJECT_ID,findWeeklyAutomaticWindow} from './auto-preparation'
import {familyWeeklyRuntimeEnabled} from './enrollment'

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
export function familyWeeklyEnqueueEnabled():boolean{
 return process.env.FAMILY_WEEKLY_ENQUEUE_ENABLED==='true'
}
export type WeeklyEnqueueResult=
 | {status:'disabled'|'not_due'|'blocked'|'unavailable';queued:false}
 | {status:'already_queued';queued:false;weekStart:string}
 | {status:'queued';queued:true;weekStart:string;runId:string;publicationAuthority:false}

export interface WeeklyEnqueuePort {
 /** service_role RPC public.family_weekly_enqueue_once(), NO input args */
 enqueueOnce:()=>Promise<unknown>
}
function block(status:'disabled'|'not_due'|'blocked'|'unavailable'):WeeklyEnqueueResult{
 return {status,queued:false}
}
export async function enqueueFamilyWeeklyRun(
 port:WeeklyEnqueuePort,now:string,
 opts:{runtimeEnabled:boolean;enqueueEnabled:boolean}={
  runtimeEnabled:familyWeeklyRuntimeEnabled(),
  enqueueEnabled:familyWeeklyEnqueueEnabled(),
 }
):Promise<WeeklyEnqueueResult>{
 if(opts.runtimeEnabled!==true||opts.enqueueEnabled!==true)return block('disabled')
 const window=findWeeklyAutomaticWindow(now)
 if(window.status!=='scheduled_window')return block('not_due')
 try{
  const raw=await port.enqueueOnce()
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return block('unavailable')
  const result=raw as Record<string,unknown>
  if(result.status==='already_queued'){
   // Exact status allowed; never assume an old run is safe to requeue.
   if(Object.keys(result).length!==1)return block('unavailable')
   return {status:'already_queued',queued:false,weekStart:window.weekStart}
  }
  if(result.status==='blocked'||result.status==='not_due'){
   if(Object.keys(result).length!==1)return block('unavailable')
   return block(result.status)
  }
  const expected=['status','projectId','weekStart','runId','publicationAuthority'].sort()
  if(Object.keys(result).sort().join('|')!==expected.join('|')||
   result.status!=='queued'||result.projectId!==FAMILY_WEEKLY_PROJECT_ID||
   result.weekStart!==window.weekStart||result.publicationAuthority!==false||
   typeof result.runId!=='string'||!UUID.test(result.runId)){
   return block('unavailable')
  }
  return {status:'queued',queued:true,weekStart:window.weekStart,
   runId:result.runId,publicationAuthority:false}
 }catch{return block('unavailable')}
}
