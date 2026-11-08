import {beforeEach,describe,expect,it,vi} from 'vitest'
import {CAPTURE_KINDS} from './capture-intake'
import {REVIEW_FEATURES,REVIEW_VIEWS} from './review-dossier'
import type {ReviewAuditEvent,TrustedReviewEvidence} from './review-audit-contract'
const auth=vi.hoisted(()=>({resolve:vi.fn(),create:vi.fn(),getUser:vi.fn()}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:auth.resolve}))
vi.mock('@/lib/supabase/server',()=>({createClient:auth.create}))
import {recordAuthenticatedVehicleInspectionDraft} from './server-review-audit'
import {makeSessionBoundReviewAuditPorts,type ReviewAuditBackend} from './session-bound-audit-writer'

const projectId='11111111-1111-4111-8111-111111111111'
const listingId='22222222-2222-4222-8222-222222222222'
const captureId='33333333-3333-4333-8333-333333333333'
const revisionId='44444444-4444-4444-8444-444444444444'
const userId='55555555-5555-4555-8555-555555555555'
const auditId='66666666-6666-4666-8666-666666666666'
const otherId='77777777-7777-4777-8777-777777777777'
const sha=(n:number)=>n.toString(16).padStart(2,'0').repeat(32)
const access=()=>({ok:true as const,userId,allowedProjectIds:[projectId]})
function fixture(){
 const originalPhotos=CAPTURE_KINDS.map((kind,i)=>({kind,sha256:sha(i+1)}))
 const renders=REVIEW_VIEWS.map((kind,i)=>({
  kind,originalSha256:originalPhotos[i].sha256,renderSha256:sha(i+7)
 }))
 const snapshot:TrustedReviewEvidence={
  projectId,listingId,captureId,revisionId,assetId:'vehicle3d:session-test',
  glbSha256:sha(20),photoProof:'pixels_checked_for_human_review',originalPhotos,renders
 }
 const submission={
  projectId,listingId,captureId,assetId:snapshot.assetId,glbSha256:snapshot.glbSha256,
  originalPhotos:originalPhotos.map(p=>({...p})),comparisons:renders.map(r=>({...r,
   note:'Synthetic fixture comparison, no actual vehicle',
   findings:Object.fromEntries(REVIEW_FEATURES.map(k=>[k,'matches']))
  })),reviewerNote:"Synthetic note '); DROP TABLE audit; --"
 }
 const queries:Array<{sql:string;values:readonly unknown[]}>=[]
 const backend:ReviewAuditBackend={
  isAssignedReviewer:async(reviewer,project,listing)=>
   reviewer===userId&&project===projectId&&listing===listingId,
  loadEvidence:async(project,listing,capture)=>
   project===projectId&&listing===listingId&&capture===captureId?snapshot:null,
  query:async(sql,values)=>{
   queries.push({sql,values})
   return {rows:[{stored:true,reason:null,audit_id:auditId}]}
  }
 }
 return {submission,snapshot,backend,queries}
}
describe('server session to pending review SQL boundary',()=>{
 beforeEach(()=>{
  vi.resetAllMocks()
  auth.resolve.mockImplementation(async()=>access())
  auth.getUser.mockResolvedValue({data:{user:{id:userId}},error:null})
  auth.create.mockResolvedValue({auth:{getUser:auth.getUser}})
 })
 it('persists the real audit contract with verified reviewer and bound SQL values',async()=>{
  const d=fixture()
  expect(await recordAuthenticatedVehicleInspectionDraft(d.submission,d.backend))
   .toMatchObject({status:'review_recorded_not_approved',auditId,outcome:'human_review_required'})
  expect(d.queries).toHaveLength(1)
  const {sql,values}=d.queries[0]
  expect(sql).toContain('website_review_private.append_pending(')
  expect(sql).toContain('$15::text')
  expect(sql).not.toContain(d.submission.reviewerNote)
  expect(values.slice(1,9)).toEqual([
   userId,projectId,listingId,captureId,revisionId,'vehicle3d:session-test',sha(20),
   expect.stringMatching(/^[a-f0-9]{64}$/)
  ])
  expect(values.slice(11)).toEqual(['human_review_required',[],[],d.submission.reviewerNote])
  expect(values).toHaveLength(15)
 })
 it('requires auth before accepting a supplied backend',async()=>{
  const d=fixture()
  auth.resolve.mockResolvedValue({ok:false})
  expect(await recordAuthenticatedVehicleInspectionDraft(d.submission,d.backend))
   .toEqual({status:'refused',reason:'AUTH_REQUIRED'})
  expect(d.queries).toHaveLength(0)
 })
 it.each([
  {data:{user:null},error:null},
  {data:{user:{id:otherId}},error:null},
  {data:{user:{id:userId}},error:{message:'expired'}}
 ])('refuses missing, changed or errored independent auth verification',async response=>{
  const d=fixture()
  auth.getUser.mockResolvedValue(response)
  expect(await recordAuthenticatedVehicleInspectionDraft(d.submission,d.backend))
   .toEqual({status:'refused',reason:'SESSION_MISMATCH'})
  expect(d.queries).toHaveLength(0)
 })
 it('fails closed when no trusted backend was explicitly configured',async()=>{
  const d=fixture()
  expect(await recordAuthenticatedVehicleInspectionDraft(d.submission))
   .toEqual({status:'refused',reason:'REVIEW_BACKEND_UNCONFIGURED'})
 })
 it('rejects forged client identity and approval through the real contract',async()=>{
  const d=fixture()
  expect(await recordAuthenticatedVehicleInspectionDraft({
   ...d.submission,reviewerId:otherId,approved:true
  },d.backend)).toEqual({status:'refused',reason:'FORGED_REVIEW_AUTHORITY'})
  expect(d.queries).toHaveLength(0)
 })
 it('refuses unowned projects before any evidence lookup',async()=>{
  const d=fixture()
  auth.resolve.mockResolvedValue({...access(),allowedProjectIds:[]})
  d.backend.loadEvidence=async()=>{throw Error('must not load')}
  expect(await recordAuthenticatedVehicleInspectionDraft(d.submission,d.backend))
   .toEqual({status:'refused',reason:'PROJECT_ACCESS_DENIED'})
  expect(d.queries).toHaveLength(0)
 })
 it('refuses ownership revoked during asynchronous evidence loading before append',async()=>{
  const d=fixture()
  d.backend.loadEvidence=async()=>{
   auth.resolve.mockResolvedValue({...access(),allowedProjectIds:[]})
   return d.snapshot
  }
  expect(await recordAuthenticatedVehicleInspectionDraft(d.submission,d.backend))
   .toEqual({status:'refused',reason:'REVIEW_ACCESS_CHANGED'})
  expect(d.queries).toHaveLength(0)
 })
 it('refuses a changed session during evidence loading before append',async()=>{
  const d=fixture()
  d.backend.loadEvidence=async()=>{
   auth.getUser.mockResolvedValue({data:{user:{id:otherId}},error:null})
   return d.snapshot
  }
  expect(await recordAuthenticatedVehicleInspectionDraft(d.submission,d.backend))
   .toEqual({status:'refused',reason:'REVIEW_ACCESS_CHANGED'})
  expect(d.queries).toHaveLength(0)
 })
 it('withholds a receipt after access revocation even when SQL already committed',async()=>{
  const d=fixture()
  d.backend.query=async(sql,values)=>{
   d.queries.push({sql,values})
   auth.resolve.mockResolvedValue({...access(),allowedProjectIds:[]})
   return {rows:[{stored:true,reason:null,audit_id:auditId}]}
  }
  expect(await recordAuthenticatedVehicleInspectionDraft(d.submission,d.backend))
   .toEqual({status:'refused',reason:'REVIEW_RECEIPT_ACCESS_REVOKED'})
  expect(d.queries).toHaveLength(1) // no retry of an already committed write
 })
 it('keeps SQL stale revision, revocation and duplicate outcomes closed',async()=>{
  for(const reason of ['stale_revision','no_permission','duplicate']){
   const d=fixture()
   d.backend.query=async()=>({rows:[{stored:false,reason,audit_id:null}]})
   expect(await recordAuthenticatedVehicleInspectionDraft(d.submission,d.backend))
    .toEqual({status:'refused',reason:'AUDIT_'+reason.toUpperCase()})
  }
 })
 it('does not retry an ambiguous database failure or disclose internal errors',async()=>{
  const d=fixture()
  d.backend.query=async(sql,values)=>{
   d.queries.push({sql,values})
   throw Error('private connection details')
  }
  expect(await recordAuthenticatedVehicleInspectionDraft(d.submission,d.backend))
   .toEqual({status:'refused',reason:'AUDIT_STORAGE_UNAVAILABLE'})
  expect(d.queries).toHaveLength(1)
 })
 it.each([
  [],[{stored:true,reason:null,audit_id:'not-a-uuid'}],
  [{stored:'true',reason:null,audit_id:auditId}],
  [{stored:true,reason:'approved',audit_id:auditId}],
  [{stored:false,reason:'approved',audit_id:null}],
  [{stored:true,reason:null,audit_id:auditId},{stored:true,reason:null,audit_id:otherId}]
 ].map(rows=>({rows})))('rejects malformed or unauthorized SQL acknowledgement %#',async({rows})=>{
  const d=fixture()
  d.backend.query=async()=>({rows})
  expect(await recordAuthenticatedVehicleInspectionDraft(d.submission,d.backend))
   .toEqual({status:'refused',reason:'AUDIT_STORAGE_UNAVAILABLE'})
 })
 it('copies identity and project scope before exposing backend capabilities',async()=>{
  const d=fixture(),scope={userId,allowedProjectIds:[projectId]}
  const ports=makeSessionBoundReviewAuditPorts(scope,d.backend)
  scope.userId=otherId
  scope.allowedProjectIds.length=0
  const result=await ports.appendIfCurrent({
   reviewerId:otherId,projectId,listingId
  } as ReviewAuditEvent)
  expect(result).toEqual({stored:false,reason:'no_permission'})
  expect(d.queries).toHaveLength(0)
 })
 it('checks the written project when caller input changes after the insert',async()=>{
  const d=fixture()
  d.backend.query=async(sql,values)=>{
   d.queries.push({sql,values})
   d.submission.projectId=otherId
   auth.resolve.mockResolvedValue({...access(),allowedProjectIds:[otherId]})
   return {rows:[{stored:true,reason:null,audit_id:auditId}]}
  }
  expect(await recordAuthenticatedVehicleInspectionDraft(d.submission,d.backend))
   .toEqual({status:'refused',reason:'REVIEW_RECEIPT_ACCESS_REVOKED'})
  expect(d.queries).toHaveLength(1)
  expect(d.queries[0].values[2]).toBe(projectId)
 })
 it('does not compare different photo arrays after an awaited assignment lookup',async()=>{
  const d=fixture()
  d.submission.originalPhotos[0].sha256=sha(31)
  d.submission.comparisons[0].originalSha256=sha(31)
  d.backend.isAssignedReviewer=async()=>{
   d.submission.originalPhotos.length=0
   d.submission.comparisons.length=0
   return true
  }
  expect(await recordAuthenticatedVehicleInspectionDraft(d.submission,d.backend))
   .toEqual({status:'refused',reason:'SUBMITTED_HASHES_DO_NOT_MATCH_TRUSTED_EVIDENCE'})
  expect(d.queries).toHaveLength(0)
 })
 it('does not write if the session authority lookup throws',async()=>{
  const d=fixture()
  auth.resolve.mockRejectedValue(Error('session unavailable'))
  expect(await recordAuthenticatedVehicleInspectionDraft(d.submission,d.backend))
   .toEqual({status:'refused',reason:'REVIEW_SESSION_UNAVAILABLE'})
  expect(d.queries).toHaveLength(0)
 })
})
