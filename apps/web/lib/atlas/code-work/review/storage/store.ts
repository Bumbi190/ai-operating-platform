import 'server-only'
import {createAdminClient} from '@/lib/supabase/admin'
import type {ReviewStorageStore} from './types'
export interface ReviewStorageDb {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}
/** No generic DML; the database owns the atomic live proof and append boundary. */
export function createReviewStorageStore(db?:ReviewStorageDb):ReviewStorageStore{
 const client=()=>db??createAdminClient() as unknown as ReviewStorageDb
 async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
  const r=await client().rpc(name,args);if(r.error)throw Error('review_store_unavailable');return r.data as T
 }
 return{
  read:workId=>rpc('atlas_code_review_read',{p_work_id:workId}),
  initialize:(proof,config,roles)=>rpc('atlas_code_review_initialize',{p_work_id:proof.workId,p_parent_proof:proof,p_config:config,p_roles:roles}),
  authenticate:(workId,role,sessionId,tokenHash)=>rpc('atlas_code_review_authenticate_role',{p_work_id:workId,p_role:role,p_session_id:sessionId,p_token_hash:tokenHash}),
  observe:workId=>rpc('atlas_code_review_observe',{p_work_id:workId}),
  apply:a=>rpc('atlas_code_review_apply',{p_work_id:a.workId,p_role:a.role,p_session_id:a.sessionId,p_token_hash:a.tokenHash,p_expected_version:a.expectedVersion,p_command:a.command,p_command_hash:a.commandHash,p_next:a.next,p_new_reviewer:a.newReviewer}),
  readForRole:(workId,role,sessionId,tokenHash)=>rpc('atlas_code_review_read_for_role',{p_work_id:workId,p_role:role,p_session_id:sessionId,p_token_hash:tokenHash}),
  rotate:async(workId,proof,role,sessionId,newHash)=>{await rpc('atlas_code_review_rotate_credential',{p_work_id:workId,p_parent_proof:proof,p_role:role,p_session_id:sessionId,p_new_hash:newHash})},
 }
}
