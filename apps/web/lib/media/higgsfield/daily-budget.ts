import 'server-only'
import {randomUUID} from 'node:crypto'
import {createAdminClient} from '@/lib/supabase/admin'
import {isSpendGateEnforced} from '@/lib/cost/spend-gate-flag'

export const HIGGSFIELD_DAILY_LIMIT_SEK=5
export const HIGGSFIELD_CONSERVATIVE_SEK_PER_CREDIT=1
export const HIGGSFIELD_DAY_TIMEZONE='Europe/Stockholm'

export type HiggsfieldDailyBudgetReason=
 | 'disabled'|'estimate_unavailable'|'invalid_request'|'wrong_project'
 | 'single_request_exceeds_day'|'daily_limit'|'replay'|'database_unavailable'

export class HiggsfieldDailyBudgetRefusal extends Error {
 constructor(readonly reason:HiggsfieldDailyBudgetReason){
  super('HIGGSFIELD_DAILY_BUDGET_REFUSED')
  this.name='HiggsfieldDailyBudgetRefusal'
 }
}

export type BudgetStatus={
 day:string;budgetSek:5;reservedSek:number;reservedCredits:number;remainingSek:number
 // No paid-generation dispatch path exists in Omnira today.
 paidGenerationEnabled:false
}

type Db={rpc:(name:string,args?:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>}
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const uuid=(id:unknown):id is string=>typeof id==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)

/**
 * Conservative authorization envelope. `1 SEK / credit` is a risk buffer,
 * NOT a statement about the Higgsfield subscription invoice or FX.
 * The quote is prevalidated; uncertain billable dispatches remain charged
 * against this allowance until the next Swedish day.
 */
export function ceilingForHiggsfieldCredits(quoteCredits:unknown):number{
 if(typeof quoteCredits!=='number'||!Number.isFinite(quoteCredits)||
  quoteCredits<=0||quoteCredits>HIGGSFIELD_DAILY_LIMIT_SEK/HIGGSFIELD_CONSERVATIVE_SEK_PER_CREDIT){
  throw new HiggsfieldDailyBudgetRefusal('estimate_unavailable')
 }
 const sek=Math.ceil(quoteCredits*HIGGSFIELD_CONSERVATIVE_SEK_PER_CREDIT*100)/100
 if(!Number.isFinite(sek)||sek<=0||sek>HIGGSFIELD_DAILY_LIMIT_SEK){
  throw new HiggsfieldDailyBudgetRefusal('single_request_exceeds_day')
 }
 return sek
}

function parseStatus(value:unknown):BudgetStatus{
 if(!record(value)||typeof value.day!=='string'||
  !/^\d{4}-\d{2}-\d{2}$/.test(value.day)||
  value.budget_sek!==HIGGSFIELD_DAILY_LIMIT_SEK||
  ![value.reserved_sek,value.remaining_sek,value.reserved_credits].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)||
  (value.reserved_sek as number)>HIGGSFIELD_DAILY_LIMIT_SEK||
  (value.remaining_sek as number)>HIGGSFIELD_DAILY_LIMIT_SEK||
  Math.abs((value.reserved_sek as number)+(value.remaining_sek as number)-HIGGSFIELD_DAILY_LIMIT_SEK)>0.001){
  throw new HiggsfieldDailyBudgetRefusal('database_unavailable')
 }
 return {day:value.day,budgetSek:5,reservedSek:value.reserved_sek as number,
  reservedCredits:value.reserved_credits as number,remainingSek:value.remaining_sek as number,
  paidGenerationEnabled:false}
}

/** Operator-only caller. This is a free DB read, not a provider quote. */
export async function readHiggsfieldDailyBudget(
 db:Db=createAdminClient() as unknown as Db,
):Promise<BudgetStatus>{
 try{
  const {data,error}=await db.rpc('higgsfield_daily_budget_status')
  if(error)throw Error()
  return parseStatus(data)
 }catch{
  throw new HiggsfieldDailyBudgetRefusal('database_unavailable')
 }
}

/**
 * Reserved for a FUTURE reviewed paid media adapter. This function by itself
 * never calls generate_video, and has no public HTTP dispatch route.
 * The explicit paid flag AND hard global spend gate must both be enabled;
 * unknown quotes, SQL errors, or replay always refuse, never fall back to
 * advisory mode. A new requestId denotes a new cost, even after failure.
 */
export async function reserveHiggsfieldDailyBudget(
 input:{projectId:string;quoteCredits:number;requestId?:string},
 deps:{db?:Db;requestId?:()=>string}={},
):Promise<{reservationId:string;ceilingSek:number;remainingSek:number}>{
 // Runtime safety switches cannot be overridden by caller-supplied test options.
 if(process.env.HIGGSFIELD_PAID_VIDEO_ENABLED!=='true'||!isSpendGateEnforced()){
  throw new HiggsfieldDailyBudgetRefusal('disabled')
 }
 if(!uuid(input.projectId))throw new HiggsfieldDailyBudgetRefusal('wrong_project')
 const ceilingSek=ceilingForHiggsfieldCredits(input.quoteCredits)
 const requestId=input.requestId??(deps.requestId??randomUUID)()
 if(!uuid(requestId))throw new HiggsfieldDailyBudgetRefusal('invalid_request')
 try{
  const {data,error}=await (deps.db??createAdminClient() as unknown as Db)
   .rpc('higgsfield_daily_budget_reserve',{
    p_request_id:requestId,p_project_id:input.projectId,p_quoted_credits:input.quoteCredits,
   })
  if(error||!record(data))throw new HiggsfieldDailyBudgetRefusal('database_unavailable')
  if(data.allowed!==true){
   const reasons:HiggsfieldDailyBudgetReason[]=['invalid_request','wrong_project',
    'single_request_exceeds_day','daily_limit','replay']
   throw new HiggsfieldDailyBudgetRefusal(
    reasons.includes(data.reason as HiggsfieldDailyBudgetReason)?data.reason as HiggsfieldDailyBudgetReason:'database_unavailable')
  }
  if(data.reason!=='reserved'||typeof data.reserved_sek!=='number'||
    !Number.isFinite(data.reserved_sek)||data.reserved_sek!==ceilingSek||
    typeof data.remaining_sek!=='number'||!Number.isFinite(data.remaining_sek)||
    data.remaining_sek<0||data.remaining_sek>5-ceilingSek){
   // Reservation may already have committed. Fail closed; do not retry.
   throw new HiggsfieldDailyBudgetRefusal('database_unavailable')
  }
  return {reservationId:requestId,ceilingSek,remainingSek:data.remaining_sek}
 }catch(e){
  if(e instanceof HiggsfieldDailyBudgetRefusal)throw e
  throw new HiggsfieldDailyBudgetRefusal('database_unavailable')
 }
}
