import {createHash,randomUUID} from 'node:crypto'
import {CAPTURE_KINDS,type CaptureKind} from './capture-intake'
import {REVIEW_VIEWS,assessVehicleReviewDraft} from './review-dossier'
import type {Vehicle3DReferenceKind} from '../assets/vehicle-3d'

/**
 * NOT WIRED TO A ROUTE OR TO PRODUCTION. This defines the trusted server
 * boundary for recording a *human inspection draft*, never approval.
 *
 * Ports MUST derive reviewer assignment and immutable evidence from an
 * authenticated server-side database; no client JWT metadata, flags or
 * submitted evidence hashes may authorize a reviewer or a publication.
 */
export type ReviewerAccess={
 userId:string
 allowedProjectIds:readonly string[]
}
export type TrustedReviewEvidence={
 projectId:string
 listingId:string
 captureId:string
 assetId:string
 glbSha256:string
 revisionId:string
 photoProof:'pixels_checked_for_human_review'
 originalPhotos:ReadonlyArray<{kind:CaptureKind;sha256:string}>
 renders:ReadonlyArray<{
  kind:Vehicle3DReferenceKind
  originalSha256:string
  renderSha256:string
 }>
}
export type ReviewAuditEvent={
 eventId:string
 reviewerId:string
 projectId:string
 listingId:string
 captureId:string
 assetId:string
 glbSha256:string
 revisionId:string
 evidenceDigest:string
 outcome:'human_review_required'|'revision_required'|'additional_evidence_required'
 differences:readonly string[]
 uncertain:readonly string[]
 reviewerNote:string
 recordedAt:string
 eventDigest:string
}
export type ReviewAuditPorts={
 isAssignedReviewer:(reviewerId:string,projectId:string,listingId:string)=>Promise<boolean>
 loadEvidence:(projectId:string,listingId:string,captureId:string)=>Promise<TrustedReviewEvidence|null>
 /**
  * MUST atomically recheck assigned reviewer, project scope, revision and
  * idempotency eventId before inserting. A SELECT then INSERT is not safe.
  * No client write access or UPDATE/DELETE is permitted.
  */
 appendIfCurrent:(event:ReviewAuditEvent)=>Promise<
  |{stored:true;auditId:string}
  |{stored:false;reason:'stale_revision'|'no_permission'|'duplicate'|'storage_unavailable'}
 >
}
type ReviewAuditResult=
 |{status:'refused';reason:string}
 |{status:'review_recorded_not_approved';auditId:string;eventDigest:string;outcome:ReviewAuditEvent['outcome']}
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const SHA=/^[a-f0-9]{64}$/
const denied=(reason:string):ReviewAuditResult=>({status:'refused',reason})
const record=(v:unknown):Record<string,unknown>|null=>
 v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Version-stable, project-bound evidence digest. A hash is NOT a signature. */
function inspectTrustedEvidence(snapshot:TrustedReviewEvidence):string|null{
 if(![snapshot.projectId,snapshot.listingId,snapshot.captureId,snapshot.revisionId]
   .every(id=>UUID.test(id))||
   !/^vehicle3d:[a-z0-9][a-z0-9-]{2,80}$/.test(snapshot.assetId)||
   !SHA.test(snapshot.glbSha256)||
   snapshot.photoProof!=='pixels_checked_for_human_review'||
   snapshot.originalPhotos.length!==CAPTURE_KINDS.length||
   snapshot.renders.length!==REVIEW_VIEWS.length)return null
 const photos=new Map(snapshot.originalPhotos.map(p=>[p.kind,p.sha256]))
 if(photos.size!==CAPTURE_KINDS.length||
    CAPTURE_KINDS.some(kind=>!SHA.test(photos.get(kind)??''))||
    new Set([...photos.values()]).size!==CAPTURE_KINDS.length)return null
 const renders=new Map(snapshot.renders.map(r=>[r.kind,r]))
 if(renders.size!==REVIEW_VIEWS.length||
    REVIEW_VIEWS.some(kind=>{
     const r=renders.get(kind)
     return !r||!SHA.test(r.renderSha256)||r.originalSha256!==photos.get(kind)
    }))return null
 return digest({
  projectId:snapshot.projectId,listingId:snapshot.listingId,
  captureId:snapshot.captureId,assetId:snapshot.assetId,
  glbSha256:snapshot.glbSha256,revisionId:snapshot.revisionId,
  photoProof:snapshot.photoProof,
  originals:CAPTURE_KINDS.map(kind=>[kind,photos.get(kind)]),
  renders:REVIEW_VIEWS.map(kind=>[kind,renders.get(kind)?.renderSha256])
 })
}

/**
 * A submitted checklist is NEVER proof: cross-check every hash and model
 * revision against server-held evidence and require independent assignment.
 * Even a stored event is NOT a human approval / real-vehicle verification.
 */
export async function recordVehicleInspectionDraft(
 submission:unknown,access:ReviewerAccess,ports:ReviewAuditPorts
):Promise<ReviewAuditResult>{
 const item=record(submission)
 if(!item)return denied('INVALID_REVIEW_DRAFT')
 // Refuse any client attempt to smuggle authorization or final decisions.
 if(['decision','approved','publish','verified','reviewerId','reviewerRole',
   'recordedAt','eventDigest','revisionId'].some(key=>Object.hasOwn(item,key)))
  return denied('FORGED_REVIEW_AUTHORITY')
 const preliminary=assessVehicleReviewDraft(submission)
 if(preliminary.status==='refused')return denied(preliminary.reason)
 const projectId=item.projectId as string,listingId=item.listingId as string
 const captureId=item.captureId as string
 if(!access||!UUID.test(access.userId)||
    !Array.isArray(access.allowedProjectIds)||
    !access.allowedProjectIds.includes(projectId))
  return denied('PROJECT_ACCESS_DENIED')
 let assigned=false
 try{assigned=await ports.isAssignedReviewer(access.userId,projectId,listingId)}
 catch{return denied('REVIEWER_AUTHORITY_UNAVAILABLE')}
 if(!assigned)return denied('REVIEWER_NOT_ASSIGNED')
 let snapshot:TrustedReviewEvidence|null
 try{snapshot=await ports.loadEvidence(projectId,listingId,captureId)}
 catch{return denied('TRUSTED_EVIDENCE_UNAVAILABLE')}
 if(!snapshot)return denied('TRUSTED_EVIDENCE_MISSING')
 let evidenceDigest:string|null
 try{evidenceDigest=inspectTrustedEvidence(snapshot)}
 catch{return denied('STALE_OR_UNBOUND_EVIDENCE')}
 if(!evidenceDigest||
    snapshot.projectId!==projectId||snapshot.listingId!==listingId||
    snapshot.captureId!==captureId||snapshot.assetId!==item.assetId||
    snapshot.glbSha256!==item.glbSha256)
  return denied('STALE_OR_UNBOUND_EVIDENCE')
 const photos=new Map(snapshot.originalPhotos.map(p=>[p.kind,p.sha256]))
 const rows=new Map(snapshot.renders.map(r=>[r.kind,r]))
 const submittedPhotos=item.originalPhotos as Array<{kind:CaptureKind;sha256:string}>
 const submittedRows=item.comparisons as Array<{
  kind:Vehicle3DReferenceKind;originalSha256:string;renderSha256:string
 }>
 if(submittedPhotos.some(p=>p.sha256!==photos.get(p.kind))||
    submittedRows.some(r=>r.renderSha256!==rows.get(r.kind)?.renderSha256||
     r.originalSha256!==rows.get(r.kind)?.originalSha256))
  return denied('SUBMITTED_HASHES_DO_NOT_MATCH_TRUSTED_EVIDENCE')
 const outcome=preliminary.status
 const eventBody={
  eventId:randomUUID(),reviewerId:access.userId,
  projectId,listingId,captureId,assetId:snapshot.assetId,
  glbSha256:snapshot.glbSha256,revisionId:snapshot.revisionId,
  evidenceDigest,outcome,
  differences:outcome==='revision_required'?[...preliminary.differences]:[],
  uncertain:outcome==='revision_required'||outcome==='additional_evidence_required'
   ?[...preliminary.uncertain]:[],
  reviewerNote:item.reviewerNote as string,
  recordedAt:new Date().toISOString()
 }
 const event:ReviewAuditEvent={...eventBody,eventDigest:digest(eventBody)}
 let stored:Awaited<ReturnType<ReviewAuditPorts['appendIfCurrent']>>
 try{stored=await ports.appendIfCurrent(event)}
 catch{return denied('AUDIT_WRITER_UNAVAILABLE')}
 if(!stored||typeof stored!=='object')return denied('INVALID_AUDIT_RECEIPT')
 if(!stored.stored)return denied('AUDIT_'+stored.reason.toUpperCase())
 if(!UUID.test(stored.auditId))return denied('INVALID_AUDIT_RECEIPT')
 return {
  status:'review_recorded_not_approved',
  auditId:stored.auditId,eventDigest:event.eventDigest,outcome
 }
}
