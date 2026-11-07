import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createClient} from '@/lib/supabase/server'
import {recordVehicleInspectionDraft,type ReviewerAccess} from './review-audit-contract'
import {makeSessionBoundReviewAuditPorts,type ReviewAuditBackend} from './session-bound-audit-writer'

const refuse=(reason:string)=>({status:'refused' as const,reason})

/**
 * UNROUTED / NOT ACTIVATED. Trusted server composition supplies the reviewed
 * backend transport, assignment lookup and immutable evidence loader.
 * No service key, HTTP endpoint, public RPC or default database connection.
 * Never forward a browser-provided backend object.
 *
 * Owner + separately assigned reviewer only. A stored draft is not approval.
 */
export async function recordAuthenticatedVehicleInspectionDraft(
 submission:unknown,backend?:ReviewAuditBackend
){
 // Own the input before the first await. Caller aliases must not change which
 // photos are compared or which project authorizes the eventual receipt.
 let input:unknown
 try{input=structuredClone(submission)}catch{return refuse('INVALID_REVIEW_DRAFT')}
 try{
  const access=await resolveProjectAccess()
  if(!access.ok)return refuse('AUTH_REQUIRED')
  const client=await createClient()
  const {data:{user},error}=await client.auth.getUser()
  if(error||!user||user.id!==access.userId)return refuse('SESSION_MISMATCH')
  if(!backend)return refuse('REVIEW_BACKEND_UNCONFIGURED')
  const principal:ReviewerAccess=Object.freeze({
   userId:access.userId,allowedProjectIds:Object.freeze([...access.allowedProjectIds])
  })
  const ports=makeSessionBoundReviewAuditPorts(principal,backend)
  async function stillAuthorized(projectId:string){
   const fresh=await resolveProjectAccess()
   if(!fresh.ok||fresh.userId!==principal.userId||
      !fresh.allowedProjectIds.includes(projectId))return false
   const current=await createClient()
   const checked=await current.auth.getUser()
   return !checked.error&&checked.data.user?.id===principal.userId
  }
  let accessChanged=false
  let receiptProjectId:string|null=null
  const result=await recordVehicleInspectionDraft(input,principal,{
   ...ports,
   appendIfCurrent:async event=>{
    const projectId=event.projectId
    let allowed=false
    try{allowed=await stillAuthorized(projectId)}catch{/* fail closed */}
    if(!allowed){
     accessChanged=true
     return {stored:false,reason:'no_permission'}
    }
    receiptProjectId=projectId
    return ports.appendIfCurrent(event)
   }
  })
  if(accessChanged)return refuse('REVIEW_ACCESS_CHANGED')
  if(result.status==='review_recorded_not_approved'){
   // The insert may already have committed. Withholding this receipt is not
   // rollback; callers must not retry an ambiguous write automatically.
   let allowed=false
   try{allowed=receiptProjectId!==null&&await stillAuthorized(receiptProjectId)}
   catch{/* fail closed */}
   if(!allowed)return refuse('REVIEW_RECEIPT_ACCESS_REVOKED')
  }
  return result
 }catch{
  return refuse('REVIEW_SESSION_UNAVAILABLE')
 }
}
