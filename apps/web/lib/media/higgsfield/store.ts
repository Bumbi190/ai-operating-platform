import {createAdminClient} from '@/lib/supabase/admin'
import {HiggsfieldError,type SealedPayload} from './types'
type Db=Pick<ReturnType<typeof createAdminClient>,'rpc'>
export interface ConnectionRecord {
 project_id:string; connection_version:number; encrypted_payload:SealedPayload|null
 subject:string|null; identity_verified:boolean; status:'disconnected'|'connected'|'reconnect_required'
}
export interface OAuthAttempt {
 state_hash:string; project_id:string; actor_id:string; connection_version:number
 encrypted_payload:SealedPayload
}
function project(value:string) {if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new HiggsfieldError('access_denied')}
function record(value:unknown):value is Record<string,unknown> {return !!value && typeof value==='object' && !Array.isArray(value)}
export function createHiggsfieldStore(db:Db=createAdminClient()) {
 type RpcName='higgsfield_connection_read'|'higgsfield_oauth_create'|'higgsfield_oauth_peek'|'higgsfield_oauth_consume'|'higgsfield_connection_save'|'higgsfield_refresh_acquire'|'higgsfield_refresh_release'|'higgsfield_reconnect_required'|'higgsfield_connection_disconnect'
 // The pending migration is not in the generated schema yet; keep this port narrow.
 const callRpc=db.rpc.bind(db) as unknown as (name:RpcName,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>
 async function rpc(name:RpcName,args:Record<string,unknown>) {
  try {const {data,error}=await callRpc(name,args);if(error)throw Error();return data as unknown}
  catch {throw new HiggsfieldError('storage_unavailable')}
 }
 return {
  async readConnection(projectId:string):Promise<ConnectionRecord|null> {
   project(projectId);const value=await rpc('higgsfield_connection_read',{p_project:projectId})
   if(value===null)return null
   if(!record(value)||!Number.isSafeInteger(value.connection_version)||value.project_id!==projectId||!['disconnected','connected','reconnect_required'].includes(String(value.status)))throw new HiggsfieldError('storage_unavailable')
   return value as unknown as ConnectionRecord
  },
  async createOAuthAttempt(input:OAuthAttempt) {
   project(input.project_id)
   const ok=await rpc('higgsfield_oauth_create',{p_project:input.project_id,p_actor:input.actor_id,p_state:input.state_hash,p_version:input.connection_version,p_payload:input.encrypted_payload})
   if(ok!==true)throw new HiggsfieldError('connection_changed')
  },
  async peekOAuthAttempt(stateHash:string,actorId:string):Promise<{project_id:string}|null> {
   if(!/^[a-f0-9]{64}$/.test(stateHash))throw new HiggsfieldError('state_invalid')
   const value=await rpc('higgsfield_oauth_peek',{p_state:stateHash,p_actor:actorId})
   return record(value)&&typeof value.project_id==='string'?{project_id:value.project_id}:null
  },
  async consumeOAuthAttempt(stateHash:string,actorId:string):Promise<OAuthAttempt> {
   if(!/^[a-f0-9]{64}$/.test(stateHash))throw new HiggsfieldError('state_invalid')
   const value=await rpc('higgsfield_oauth_consume',{p_state:stateHash,p_actor:actorId})
   if(!record(value)||typeof value.project_id!=='string'||!Number.isSafeInteger(value.connection_version)||!record(value.encrypted_payload))throw new HiggsfieldError('state_invalid')
   return value as unknown as OAuthAttempt
  },
  async saveConnectionCAS(input:{projectId:string;version:number;payload:unknown;subject:string|null;identityVerified:boolean;leaseId?:string}) {
   project(input.projectId)
   const ok=await rpc('higgsfield_connection_save',{p_project:input.projectId,p_version:input.version,p_payload:input.payload,p_subject:input.subject,p_verified:input.identityVerified,p_lease:input.leaseId??null})
   if(ok!==true)throw new HiggsfieldError('connection_changed')
  },
  async acquireRefreshLease(projectId:string,version:number):Promise<string|null> {
   project(projectId);const lease=await rpc('higgsfield_refresh_acquire',{p_project:projectId,p_version:version})
   return typeof lease==='string'?lease:null
  },
  async releaseRefreshLease(projectId:string,leaseId:string) {
   project(projectId);await rpc('higgsfield_refresh_release',{p_project:projectId,p_lease:leaseId})
  },
  async markReconnect(projectId:string,version:number) {
   project(projectId);await rpc('higgsfield_reconnect_required',{p_project:projectId,p_version:version})
  },
  async disconnectConnection(projectId:string) {
   project(projectId);await rpc('higgsfield_connection_disconnect',{p_project:projectId})
  }
 }
}
export type HiggsfieldStore=ReturnType<typeof createHiggsfieldStore>
