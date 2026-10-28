/**
 * Paid model attempt admission and atomic editorial save.
 *
 * These are pure structural boundaries around the DRAFT SQL contract in
 * docs/sql/20261028_family_weekly_once_only_model_attempt_proposed.sql.
 * The database proposal is UNAPPLIED. This module cannot run in Production
 * until the SQL and authenticated-run workers receive separate approval.
 *
 * IMPORTANT: One "may-have-incurred-cost" row is inserted BEFORE the model
 * request. A network timeout/refusal/reaper must never claim the same week
 * again. If model succeeds, the only authorized write is native editorial
 * review through the SAME consent lock as an owner revocation event.
 */
import 'server-only'
import {FAMILY_WEEKLY_PROJECT_ID} from './auto-preparation'
import type {WeeklySave} from './service'

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const MONDAY=/^20\d\d-\d\d-\d\d$/
export type PaidAttemptRequest={
 projectId:string;ownerId:string;weekStart:string;conversationId:string
 runId:string;claimId:string;eventId:number
}
export type PaidAttemptReceipt=PaidAttemptRequest&{
 status:'admitted';attemptId:string;publicationAuthority:false
}
export interface PaidAttemptPort{
 /** RPC: family_weekly_admit_once, service-role only. */
 admitOnce:(request:PaidAttemptRequest)=>Promise<unknown>
 /** RPC: family_weekly_save_editorial_if_current, service-role only. */
 saveEditorialAtomically:(request:PaidAttemptRequest,drafts:WeeklySave)=>Promise<unknown>
}

export function isPaidAttemptRequest(value:unknown):value is PaidAttemptRequest{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const r=value as Partial<PaidAttemptRequest>
 return r.projectId===FAMILY_WEEKLY_PROJECT_ID&&
  [r.ownerId,r.conversationId,r.runId,r.claimId].every(x=>typeof x==='string'&&UUID.test(x))&&
  typeof r.weekStart==='string'&&MONDAY.test(r.weekStart)&&
  new Date(r.weekStart+'T12:00:00Z').getUTCDay()===1&&
  new Date(r.weekStart+'T12:00:00Z').toISOString().slice(0,10)===r.weekStart&&
  Number.isSafeInteger(r.eventId)&&(r.eventId??0)>=1
}
export function validatePaidAttemptReceipt(raw:unknown,request:PaidAttemptRequest):PaidAttemptReceipt|null{
 if(!isPaidAttemptRequest(request)||!raw||typeof raw!=='object'||Array.isArray(raw))return null
 const x=raw as Record<string,unknown>
 const expected=['attemptId','claimId','conversationId','eventId','ownerId',
  'projectId','publicationAuthority','runId','status','weekStart']
 if(Object.keys(x).sort().join('|')!==expected.sort().join('|'))return null
 if(x.status!=='admitted'||typeof x.attemptId!=='string'||!UUID.test(x.attemptId)||
 x.publicationAuthority!==false)return null
 for(const key of ['projectId','ownerId','weekStart','conversationId','runId','claimId','eventId'] as const){
  if(x[key]!==request[key])return null
 }
 return x as PaidAttemptReceipt
}

/** Never infer admission from an operation status/return of a fake model. */
export async function acquirePaidAttemptOnce(port:PaidAttemptPort,request:PaidAttemptRequest):
 Promise<PaidAttemptReceipt|null>{
 if(!isPaidAttemptRequest(request))return null
 try{
  return validatePaidAttemptReceipt(await port.admitOnce(request),request)
 }catch{return null}
}

/**
 * Caller has a validated admission, owner opt-in recheck and a verified model
 * output. PostgreSQL re-validates the claim+consent under the shared consent
 * advisory lock in its final review save function, then native weekly-save
 * checks content source hashes and rejects duplicates.
 */
export async function saveEditorialWithFrozenAuthority(
 port:PaidAttemptPort,admission:PaidAttemptReceipt,drafts:WeeklySave
):Promise<unknown>{
 if(!validatePaidAttemptReceipt(admission,admission))throw Error('PAID_ATTEMPT_UNVERIFIED')
 if(drafts.projectId!==admission.projectId||
 drafts.conversationId!==admission.conversationId||
 drafts.weekStart!==admission.weekStart||
 drafts.generation!==1)throw Error('PAID_ATTEMPT_SCOPE_MISMATCH')
 return port.saveEditorialAtomically(admission,drafts)
}
