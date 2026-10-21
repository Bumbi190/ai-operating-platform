import 'server-only'
import {randomUUID} from 'node:crypto'
import {createAdminClient} from '@/lib/supabase/admin'
import {resolveCleanupOperator} from './authority'
import {callHandlarborsenTestData} from './client'
import {decodePackageView,decodeReceiptView,isObject,isUuid,type CleanupScope,type IntegrationResponse} from './contracts'
export async function dispatchApprovedCleanup(packageId:string,scope:CleanupScope):Promise<IntegrationResponse>{return runCleanup(packageId,scope,true)}
export async function reconcileCleanup(packageId:string,scope:CleanupScope):Promise<IntegrationResponse>{return runCleanup(packageId,scope,false)}
async function runCleanup(packageId:string,scope:CleanupScope,dispatch:boolean):Promise<IntegrationResponse>{
 if(!isUuid(packageId))return {status:'denied'}
 if(dispatch&&process.env.ATLAS_TEST_DATA_MUTATIONS_ENABLED!=='true')return {status:'disabled'}
 const auth=await resolveCleanupOperator(scope);if(!auth.ok)return {status:'denied'}
 const principal=auth.principal,claimToken=randomUUID()
 let observedExecutionId:string|null=null
 const db=createAdminClient() as unknown as {rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>}
 try{
  const {data:job,error}=await db.rpc(dispatch?'handlarborsen_test_data_claim':'handlarborsen_test_data_read_job',{p_user_id:principal.userId,p_project_id:scope.projectId,p_conversation_id:scope.conversationId,p_package_id:packageId,...(dispatch?{p_claim_token:claimToken}:{})})
  if(error)return {status:'unavailable'}
  if(job===null)return {status:'needs_new_review'}
  if(!isObject(job)||!isUuid(job.executionId)||!isUuid(job.approvalRef)||!isUuid(job.idempotencyKey)||job.packageId!==packageId||typeof job.dispatch!=='boolean'||(!dispatch&&job.dispatch))return {status:'unavailable'}
  const pkg=decodePackageView(job.packageView)
  if(!pkg||pkg.status!=='prepared'||pkg.packageId!==packageId||pkg.projectId!==scope.projectId||pkg.conversationId!==scope.conversationId||pkg.operatorBindingId!==principal.operatorBindingId)return {status:'unavailable'}
  observedExecutionId=job.executionId
  const unknown:IntegrationResponse={status:'unknown',executionId:job.executionId}
  if(job.state==='not_applied')return ['needs_new_review','denied','disabled'].includes(String(job.rejectionStatus))?{status:job.rejectionStatus as 'needs_new_review'|'denied'|'disabled'}:unknown
  if(job.state==='pending'&&!dispatch&&Date.parse(pkg.expiresAt)<=Date.now())return {status:'needs_new_review'}
  if(job.state==='applied'||job.state==='needs_new_review'){
   const stored=decodeReceiptView(job.receipt)
   if(stored?.executionId===job.executionId&&stored.packageId===packageId&&stored.operation===pkg.operation)return {status:'ok',action:'receipt',data:stored}
   return unknown
  }
  if(!['dispatching','unknown'].includes(String(job.state)))return {status:'unavailable'}
  const result=await callHandlarborsenTestData(job.dispatch?{action:'execute',payload:{packageId,approvalRef:job.approvalRef,executionId:job.executionId,idempotencyKey:job.idempotencyKey,approvedPackage:pkg}}:{action:'receipt',payload:{executionId:job.executionId}},principal)
  if(result.status==='ok'&&(result.action==='execute'||result.action==='receipt')&&result.data&&result.data.executionId===job.executionId&&result.data.packageId===packageId&&result.data.operation===pkg.operation){
   const saved=await db.rpc('handlarborsen_test_data_finish',{p_package_id:packageId,p_execution_id:job.executionId,p_user_id:principal.userId,p_conversation_id:scope.conversationId,p_claim_token:job.dispatch?claimToken:null,p_receipt:result.data})
   return !saved.error&&saved.data===true?result:unknown
  }
  if(job.dispatch&&['needs_new_review','denied','disabled'].includes(result.status)){
   const rejected=await db.rpc('handlarborsen_test_data_reject_execution',{p_package_id:packageId,p_execution_id:job.executionId,p_user_id:principal.userId,p_conversation_id:scope.conversationId,p_claim_token:claimToken,p_status:result.status})
   return !rejected.error&&rejected.data===true?result:unknown
  }
  if(job.dispatch)await db.rpc('handlarborsen_test_data_finish',{p_package_id:packageId,p_execution_id:job.executionId,p_user_id:principal.userId,p_conversation_id:scope.conversationId,p_claim_token:claimToken,p_receipt:null})
  return unknown
 }catch{return observedExecutionId?{status:'unknown',executionId:observedExecutionId}:{status:'unavailable'}}
}
