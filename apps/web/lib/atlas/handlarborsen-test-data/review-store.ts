import 'server-only'
import {createHash} from 'node:crypto'
import {createAdminClient} from '@/lib/supabase/admin'
import {isVerifiedCleanupOperator,type VerifiedCleanupOperator} from './authority'
import {canonicalCleanupJson,decodePackageView,type PackageView} from './contracts'
import {decodeReviewView,type CleanupReviewView} from './stream-effect'
export async function cleanupRpc(name:string,args:Record<string,unknown>):Promise<unknown>{
 const {data,error}=await (createAdminClient() as unknown as {rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>}).rpc(name,args)
 if(error)throw Error('cleanup_unavailable');return data
}
export async function saveCleanupReview(packageView:PackageView,principal:VerifiedCleanupOperator):Promise<CleanupReviewView|null>{
 const pkg=decodePackageView(packageView)
 if(!isVerifiedCleanupOperator(principal)||!pkg||pkg.status!=='prepared'||pkg.projectId!==principal.projectId||pkg.conversationId!==principal.conversationId||pkg.operatorBindingId!==principal.operatorBindingId||!principal.allowedOperations.includes(pkg.operation))return null
 return decodeReviewView(await cleanupRpc('handlarborsen_test_data_save_review',{p_user_id:principal.userId,p_project_id:principal.projectId,p_conversation_id:principal.conversationId,p_package_view:pkg,p_fingerprint:createHash('sha256').update(canonicalCleanupJson(pkg)).digest('hex')}))
}
