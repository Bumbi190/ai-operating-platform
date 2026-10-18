import 'server-only'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {resolveProjectAccess,assertProjectAllowed} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {HANDLARBORSEN_PROJECT_ID,isUuid,isObject,exactKeys,type Operation,type CleanupScope} from './contracts'
declare const verifiedCleanupOperator:unique symbol
export type VerifiedCleanupOperator=Readonly<{
 userId:string;operatorBindingId:string;projectId:string;conversationId:string;allowedOperations:readonly Operation[];
 [verifiedCleanupOperator]:true
}>
export type CleanupAuthorityResult={ok:true;principal:VerifiedCleanupOperator}|{ok:false;reason:'unauthenticated'|'forbidden'|'unavailable'}
const verified=new WeakSet<object>()
export function isVerifiedCleanupOperator(value:unknown):value is VerifiedCleanupOperator{return isObject(value)&&verified.has(value)}
export async function resolveCleanupOperator(scope:CleanupScope):Promise<CleanupAuthorityResult>{
 if(scope.projectId!==HANDLARBORSEN_PROJECT_ID||!isUuid(scope.conversationId)||(scope.operation!==undefined&&!['quarantine','restore'].includes(scope.operation)))return {ok:false,reason:'forbidden'}
 try{
  const [operator,access]=await Promise.all([resolvePlatformOperator(),resolveProjectAccess()])
  if(!operator.ok)return {ok:false,reason:operator.reason==='unauthenticated'?'unauthenticated':'forbidden'}
  if(!access.ok||access.userId!==operator.userId||!isUuid(operator.userId)||!assertProjectAllowed(HANDLARBORSEN_PROJECT_ID,access.allowedProjectIds))return {ok:false,reason:'forbidden'}
  const {data,error}=await (createAdminClient() as unknown as {rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{code?:string}|null}>}).rpc('handlarborsen_resolve_test_data_operator',{
   p_user_id:operator.userId,p_project_id:HANDLARBORSEN_PROJECT_ID,p_conversation_id:scope.conversationId,p_operation:scope.operation??null,
  })
  if(error)return {ok:false,reason:error.code==='42501'?'forbidden':'unavailable'}
  if(!isObject(data)||!exactKeys(data,['userId','operatorBindingId','projectId','conversationId','allowedOperations','atlasMode'])||
   data.userId!==operator.userId||data.projectId!==HANDLARBORSEN_PROJECT_ID||data.conversationId!==scope.conversationId||!isUuid(data.operatorBindingId)||
   !['observer','active'].includes(String(data.atlasMode))||!Array.isArray(data.allowedOperations)||data.allowedOperations.length>2||
   data.allowedOperations.some(op=>!['quarantine','restore'].includes(op))||new Set(data.allowedOperations).size!==data.allowedOperations.length||
   (scope.operation!==undefined&&!data.allowedOperations.includes(scope.operation)))return {ok:false,reason:'forbidden'}
  const principal=Object.freeze({userId:operator.userId,operatorBindingId:data.operatorBindingId,projectId:HANDLARBORSEN_PROJECT_ID,conversationId:scope.conversationId,allowedOperations:Object.freeze([...data.allowedOperations] as Operation[])}) as unknown as VerifiedCleanupOperator
  verified.add(principal)
  return {ok:true,principal}
 }catch{return {ok:false,reason:'unavailable'}}
}
