/**
 * Existing service-role RPC facade: no table writes, no model authority
 * minted by this adapter. Both SQL functions are PROPOSED and UNAPPLIED.
 */
import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {PaidAttemptPort,PaidAttemptRequest} from './paid-attempt'
import type {WeeklySave} from './service'

type Admin=ReturnType<typeof createAdminClient>
type RpcClient={
 rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>
}
export function weeklyPaidAttemptDbPort(db:Admin):PaidAttemptPort{
 const client=db as unknown as RpcClient
 return {
  async admitOnce(x){
   const {data,error}=await client.rpc('family_weekly_admit_once',{
    p_owner_id:x.ownerId,p_week_start:x.weekStart,
    p_run_id:x.runId,p_claim_id:x.claimId,
    p_consent_event_id:x.eventId,p_conversation_id:x.conversationId,
   })
   if(error)throw Error('PAID_ATTEMPT_ADMISSION_UNAVAILABLE')
   return data
  },
  async saveEditorialAtomically(x:PaidAttemptRequest,drafts:WeeklySave){
   const {data,error}=await client.rpc('family_weekly_save_editorial_if_current',{
    p_owner_id:x.ownerId,p_run_id:x.runId,p_claim_id:x.claimId,
    p_consent_event_id:x.eventId,p_conversation_id:x.conversationId,
    p_input:drafts,
   })
   if(error)throw Error('WEEKLY_EDITORIAL_SAVE_UNAVAILABLE')
   return data
  },
 }
}
