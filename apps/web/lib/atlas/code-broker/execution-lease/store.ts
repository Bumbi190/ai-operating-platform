import 'server-only'
import {createAdminClient} from '@/lib/supabase/admin'
import type {ExecutionLeaseStore} from './types'
export function createExecutionLeaseStore():ExecutionLeaseStore{return {
 async read(v){
  const db=createAdminClient() as any
  const{data,error}=await db.rpc('atlas_code_work_execution_lease',{p_work_id:v.workId,p_claim_id:v.claimId,p_fence:v.fence,p_broker_id:v.brokerId,p_broker_host_id:v.brokerHostId,p_broker_token_hash:v.brokerTokenHash})
  if(error)throw Error('execution_lease_unavailable')
  return data
 }
}}
