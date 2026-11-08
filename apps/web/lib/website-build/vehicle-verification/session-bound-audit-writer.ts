import 'server-only'
import type {ReviewerAccess,ReviewAuditEvent,ReviewAuditPorts} from './review-audit-contract'

/** Privileged server composition ONLY. Never accept this object from a route body.
 * query must use a reviewed backend PostgreSQL connection, never public RPC.
 * This module does not create a connection or read any credentials.
 */
export type ReviewAuditBackend={
 isAssignedReviewer:ReviewAuditPorts['isAssignedReviewer']
 loadEvidence:ReviewAuditPorts['loadEvidence']
 query:(sql:string,values:readonly unknown[])=>Promise<{rows:unknown[]}>
}
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const SQL=`select stored,reason,audit_id from website_review_private.append_pending(
 $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,
 $7::text,$8::text,$9::text,$10::text,$11::timestamptz,
 $12::text,$13::text[],$14::text[],$15::text
)`

/** Only recordVehicleInspectionDraft may supply these server-generated events.
 * SQL independently rechecks assignment, listing state, ownership and revision
 * atomically. Service-role authentication is not reviewer authentication.
 */
export function makeSessionBoundReviewAuditPorts(
 access:ReviewerAccess,backend:ReviewAuditBackend
):ReviewAuditPorts{
 const userId=access.userId
 const projects=new Set(access.allowedProjectIds)
 return {
  isAssignedReviewer:async(reviewerId,projectId,listingId)=>
   reviewerId===userId&&projects.has(projectId)&&
   await backend.isAssignedReviewer(userId,projectId,listingId),
  loadEvidence:async(projectId,listingId,captureId)=>
   projects.has(projectId)?backend.loadEvidence(projectId,listingId,captureId):null,
  appendIfCurrent:async(event:ReviewAuditEvent)=>{
   if(!UUID.test(userId)||event.reviewerId!==userId||!projects.has(event.projectId))
    return {stored:false,reason:'no_permission'}
   try{
    const result=await backend.query(SQL,[
     event.eventId,userId,event.projectId,event.listingId,event.captureId,
     event.revisionId,event.assetId,event.glbSha256,event.evidenceDigest,
     event.eventDigest,event.recordedAt,event.outcome,
     [...event.differences],[...event.uncertain],event.reviewerNote
    ])
    if(!result||!Array.isArray(result.rows)||result.rows.length!==1)
     return {stored:false,reason:'storage_unavailable'}
    const row=result.rows[0] as Record<string,unknown>|null
    if(row&&row.stored===true&&row.reason===null&&
       typeof row.audit_id==='string'&&UUID.test(row.audit_id))
     return {stored:true,auditId:row.audit_id}
    if(row&&row.stored===false&&row.audit_id===null&&
       (row.reason==='stale_revision'||row.reason==='no_permission'||row.reason==='duplicate'))
     return {stored:false,reason:row.reason}
   }catch{/* The write may have committed: never retry or reveal DB errors. */}
   return {stored:false,reason:'storage_unavailable'}
  }
 }
}
