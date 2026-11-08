import {describe,it,expect,vi} from 'vitest'
import {CAPTURE_KINDS} from './capture-intake'
import {REVIEW_VIEWS,REVIEW_FEATURES} from './review-dossier'
import {recordVehicleInspectionDraft,type TrustedReviewEvidence,type ReviewAuditEvent} from './review-audit-contract'

const projectId='11111111-1111-4111-8111-111111111111'
const listingId='22222222-2222-4222-8222-222222222222'
const captureId='33333333-3333-4333-8333-333333333333'
const revisionId='44444444-4444-4444-8444-444444444444'
const userId='55555555-5555-4555-8555-555555555555'
const auditId='66666666-6666-4666-8666-666666666666'
const sha=(n:number)=>n.toString(16).padStart(2,'0').repeat(32)
const access={userId,allowedProjectIds:[projectId]}
function data(){
 const originalPhotos=CAPTURE_KINDS.map((kind,i)=>({kind,sha256:sha(i+1)}))
 const renders=REVIEW_VIEWS.map((kind,i)=>({
  kind,originalSha256:originalPhotos[i].sha256,renderSha256:sha(i+7)
 }))
 const snapshot:TrustedReviewEvidence={
  projectId,listingId,captureId,revisionId,assetId:'vehicle3d:real-vehicle-synthetic',
  glbSha256:sha(20),photoProof:'pixels_checked_for_human_review',
  originalPhotos,renders
 }
 const submission={
  projectId,listingId,captureId,
  assetId:snapshot.assetId,glbSha256:snapshot.glbSha256,
  originalPhotos:originalPhotos.map(p=>({...p})),
  comparisons:renders.map(r=>({...r,
   note:'Manually compare actual body paint wheels trim and lights',
   findings:Object.fromEntries(REVIEW_FEATURES.map(k=>[k,'matches']))
  })),
  reviewerNote:'No real vehicle was reviewed in this synthetic fixture'
 }
 const ports={
  isAssignedReviewer:vi.fn(async()=>true),
  loadEvidence:vi.fn(async()=>snapshot),
  appendIfCurrent:vi.fn(async(_event:ReviewAuditEvent)=>({stored:true as const,auditId}))
 }
 return {snapshot,submission,ports}
}
describe('trusted human review audit preparation (not publication)',()=>{
 it('records only a pending event with server reviewer, revision and event checksum',async()=>{
  const {submission,ports}=data()
  const result=await recordVehicleInspectionDraft(submission,access,ports)
  expect(result).toMatchObject({status:'review_recorded_not_approved',auditId,
   outcome:'human_review_required'})
  expect(ports.isAssignedReviewer).toHaveBeenCalledWith(userId,projectId,listingId)
  expect(ports.loadEvidence).toHaveBeenCalledWith(projectId,listingId,captureId)
  expect(ports.appendIfCurrent).toHaveBeenCalledTimes(1)
  const event=ports.appendIfCurrent.mock.calls[0][0]
  expect(event.reviewerId).toBe(userId)
  expect(event.revisionId).toBe(revisionId)
  expect(event.evidenceDigest).toMatch(/^[a-f0-9]{64}$/)
  expect(event.eventDigest).toMatch(/^[a-f0-9]{64}$/)
  expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/)
  expect(event).not.toHaveProperty('publishable')
  expect(event).not.toHaveProperty('approved')
 })
 it('denies missing owner scope before reviewer lookup or storage',async()=>{
  const d=data()
  expect(await recordVehicleInspectionDraft(d.submission,
   {userId,allowedProjectIds:[]},d.ports)).toMatchObject({
    status:'refused',reason:'PROJECT_ACCESS_DENIED'
   })
  expect(d.ports.isAssignedReviewer).not.toHaveBeenCalled()
  expect(d.ports.loadEvidence).not.toHaveBeenCalled()
 })
 it('rejects the fake approved flag without consulting assignment or persistence',async()=>{
  const d=data()
  const attempt={...d.submission,decision:'approved',reviewerId:userId,publish:true}
  expect(await recordVehicleInspectionDraft(attempt,access,d.ports)).toEqual({
   status:'refused',reason:'FORGED_REVIEW_AUTHORITY'
  })
  expect(d.ports.isAssignedReviewer).not.toHaveBeenCalled()
 })
 it('requires assignment even if the caller owns the project',async()=>{
  const d=data()
  d.ports.isAssignedReviewer.mockResolvedValueOnce(false)
  expect(await recordVehicleInspectionDraft(d.submission,access,d.ports))
   .toEqual({status:'refused',reason:'REVIEWER_NOT_ASSIGNED'})
  expect(d.ports.loadEvidence).not.toHaveBeenCalled()
 })
 it('rejects a changed GLB or stale capture, even with matching client checkboxes',async()=>{
  const a=data()
  a.snapshot.glbSha256=sha(22)
  expect(await recordVehicleInspectionDraft(a.submission,access,a.ports))
   .toEqual({status:'refused',reason:'STALE_OR_UNBOUND_EVIDENCE'})
  expect(a.ports.appendIfCurrent).not.toHaveBeenCalled()
  const b=data()
  b.snapshot.captureId='77777777-7777-4777-8777-777777777777'
  expect(await recordVehicleInspectionDraft(b.submission,access,b.ports))
   .toEqual({status:'refused',reason:'STALE_OR_UNBOUND_EVIDENCE'})
 })
 it('rejects tampered source-photo hashes and render hashes before audit write',async()=>{
  const a=data()
  a.submission.originalPhotos[0].sha256=sha(31)
  a.submission.comparisons[0].originalSha256=sha(31)
  expect(await recordVehicleInspectionDraft(a.submission,access,a.ports))
   .toEqual({status:'refused',reason:'SUBMITTED_HASHES_DO_NOT_MATCH_TRUSTED_EVIDENCE'})
  expect(a.ports.appendIfCurrent).not.toHaveBeenCalled()
  const b=data()
  b.submission.comparisons[1].renderSha256=sha(40)
  expect(await recordVehicleInspectionDraft(b.submission,access,b.ports))
   .toEqual({status:'refused',reason:'SUBMITTED_HASHES_DO_NOT_MATCH_TRUSTED_EVIDENCE'})
 })
 it('refuses unverified/invalid server evidence and never upgrades to approval',async()=>{
  const d=data()
  d.snapshot.photoProof='bytes_checked_for_human_review' as never
  expect(await recordVehicleInspectionDraft(d.submission,access,d.ports))
   .toEqual({status:'refused',reason:'STALE_OR_UNBOUND_EVIDENCE'})
  const b=data()
  b.snapshot.renders=[...b.snapshot.renders.slice(0,3)] // deliberate missing angle
  expect(await recordVehicleInspectionDraft(b.submission,access,b.ports))
   .toEqual({status:'refused',reason:'STALE_OR_UNBOUND_EVIDENCE'})
 })
 it('records a wheel mismatch as revision needed, NEVER verified',async()=>{
  const d=data()
  d.submission.comparisons[2].findings.wheels='differs'
  const result=await recordVehicleInspectionDraft(d.submission,access,d.ports)
  expect(result).toMatchObject({status:'review_recorded_not_approved',outcome:'revision_required'})
  expect(d.ports.appendIfCurrent.mock.calls[0][0].differences).toEqual(['rear_three_quarter:wheels'])
 })
 it('records uncertain paint as more-evidence-needed without approval',async()=>{
  const d=data()
  d.submission.comparisons[0].findings.paint='uncertain'
  const result=await recordVehicleInspectionDraft(d.submission,access,d.ports)
  expect(result).toMatchObject({status:'review_recorded_not_approved',outcome:'additional_evidence_required'})
 })
 it('refuses stale revisions, duplicates and authorization revoked during atomic insert',async()=>{
  for(const reason of ['stale_revision','duplicate','no_permission','storage_unavailable'] as const){
   const d=data()
   d.ports.appendIfCurrent.mockResolvedValueOnce({stored:false,reason} as never)
   expect(await recordVehicleInspectionDraft(d.submission,access,d.ports))
    .toEqual({status:'refused',reason:'AUDIT_'+reason.toUpperCase()})
  }
 })
 it('fails closed on corrupt trusted DB records or invalid audit acknowledgement',async()=>{
  const a=data()
  a.ports.loadEvidence.mockResolvedValueOnce({
   ...a.snapshot,originalPhotos:null
  } as unknown as TrustedReviewEvidence)
  expect(await recordVehicleInspectionDraft(a.submission,access,a.ports))
   .toEqual({status:'refused',reason:'STALE_OR_UNBOUND_EVIDENCE'})
  expect(a.ports.appendIfCurrent).not.toHaveBeenCalled()
  const b=data()
  b.ports.appendIfCurrent.mockResolvedValueOnce({stored:true,auditId:'client-chosen'} as never)
  expect(await recordVehicleInspectionDraft(b.submission,access,b.ports))
   .toEqual({status:'refused',reason:'INVALID_AUDIT_RECEIPT'})
 })
 it('refuses reviewer/evidence/append service failures without client authority',async()=>{
  const a=data()
  a.ports.isAssignedReviewer.mockRejectedValueOnce(Error('db unavailable'))
  expect(await recordVehicleInspectionDraft(a.submission,access,a.ports))
   .toEqual({status:'refused',reason:'REVIEWER_AUTHORITY_UNAVAILABLE'})
  const b=data()
  b.ports.loadEvidence.mockRejectedValueOnce(Error('db unavailable'))
  expect(await recordVehicleInspectionDraft(b.submission,access,b.ports))
   .toEqual({status:'refused',reason:'TRUSTED_EVIDENCE_UNAVAILABLE'})
  const c=data()
  c.ports.appendIfCurrent.mockRejectedValueOnce(Error('write failed'))
  expect(await recordVehicleInspectionDraft(c.submission,access,c.ports))
   .toEqual({status:'refused',reason:'AUDIT_WRITER_UNAVAILABLE'})
 })
})
