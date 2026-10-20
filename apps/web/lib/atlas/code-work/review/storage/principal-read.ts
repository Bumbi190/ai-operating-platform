import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {assertProjectAllowed} from '@/lib/atlas/isolation'
import {createReviewStorageStore} from './store'
import {validateStoredReviewJob} from './prepare'
import {freeze,requireValid} from '../validation'
import type {ReviewOperatorView,ReviewStorageStore,StorageStatus} from './types'
interface ReadDeps{store?:Pick<ReviewStorageStore,'read'>;access?:()=>Promise<{ok:boolean;allowedProjectIds:string[]}>}
export async function readReviewStorageForOperator(projectId:string,workId:string,deps:ReadDeps={}):Promise<{status:StorageStatus;view:ReviewOperatorView|null}>{
 try{
  const access=await(deps.access??resolveProjectAccess)()
  if(!access.ok||!assertProjectAllowed(projectId,access.allowedProjectIds))return{status:'not_permitted',view:null}
  const raw=await(deps.store??createReviewStorageStore()).read(workId)
  if(!raw)return{status:'unavailable',view:null}
  const job=requireValid(validateStoredReviewJob(raw))
  if(job.workId!==workId||job.projectId!==projectId)return{status:'not_permitted',view:null}
  return{status:'ok',view:freeze({workId:job.workId,projectId:job.projectId,jobVersion:job.version,candidates:job.candidates,messages:job.messages.entries})}
 }catch{return{status:'unavailable',view:null}}
}
