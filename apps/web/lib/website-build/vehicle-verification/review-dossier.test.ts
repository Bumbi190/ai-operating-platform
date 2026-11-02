import {describe,expect,it} from 'vitest'
import {CAPTURE_KINDS} from './capture-intake'
import {REVIEW_VIEWS,REVIEW_FEATURES,assessVehicleReviewDraft} from './review-dossier'

const projectId='11111111-1111-4111-8111-111111111111'
const listingId='22222222-2222-4222-8222-222222222222'
const captureId='33333333-3333-4333-8333-333333333333'
const hash=(i:number)=>i.toString(16).repeat(64)
function dossier(){
 const originalPhotos=CAPTURE_KINDS.map((kind,i)=>({kind,sha256:hash(i+1)}))
 const comparisons=REVIEW_VIEWS.map((kind,i)=>({
  kind,originalSha256:originalPhotos[i].sha256,renderSha256:hash(i+7),
  note:'Compare the actual vehicle, not a similar stock model.',
  findings:Object.fromEntries(REVIEW_FEATURES.map(k=>[k,'matches']))
 }))
 return {projectId,listingId,captureId,assetId:'vehicle3d:real-vehicle-test',
  glbSha256:hash(20),originalPhotos,comparisons,reviewerNote:'Synthetic review checklist'}
}
describe('untrusted visual checklist never authorizes a real digital twin',()=>{
 it('never returns approved even if every client checkbox says matches',()=>{
  const result=assessVehicleReviewDraft(dossier())
  expect(result).toMatchObject({status:'human_review_required',comparisonCount:4})
  if(result.status!=='human_review_required')throw Error('review unexpectedly not pending')
  expect(result.remainingAuthority).toContain('trusted_server_attestation')
  expect(result.remainingAuthority).toContain('separate_owner_publication_approval')
  expect(result).not.toHaveProperty('status','real_vehicle_verified')
 })
 it('blocks model revision when wheels differ, even with otherwise matching panels',()=>{
  const value=dossier()
  value.comparisons[2].findings.wheels='differs'
  expect(assessVehicleReviewDraft(value)).toMatchObject({
   status:'revision_required',differences:['rear_three_quarter:wheels']
  })
 })
 it('demands more evidence on an uncertain paint or trim detail',()=>{
  const value=dossier()
  value.comparisons[0].findings.paint='uncertain'
  expect(assessVehicleReviewDraft(value)).toMatchObject({
   status:'additional_evidence_required',uncertain:['front_three_quarter:paint']
  })
 })
 it('refuses claims that mix a foreign listing or an invalid GLB hash',()=>{
  expect(assessVehicleReviewDraft({...dossier(),listingId:'some-other-listing'}))
   .toMatchObject({status:'refused',reason:'INVALID_SCOPE_OR_MODEL'})
  expect(assessVehicleReviewDraft({...dossier(),glbSha256:'hello'}))
   .toMatchObject({status:'refused',reason:'INVALID_SCOPE_OR_MODEL'})
 })
 it('refuses a duplicated image kind or reused source hash',()=>{
  const a=dossier();a.originalPhotos[5]={...a.originalPhotos[5],kind:'side'}
  expect(assessVehicleReviewDraft(a)).toMatchObject({status:'refused'})
  const b=dossier();b.originalPhotos[5]={...b.originalPhotos[5],sha256:b.originalPhotos[0].sha256}
  expect(assessVehicleReviewDraft(b)).toMatchObject({status:'refused'})
 })
 it('refuses a render tied to a different original angle/hash',()=>{
  const a=dossier()
  a.comparisons[0].originalSha256=hash(100)
  expect(assessVehicleReviewDraft(a)).toMatchObject({
   status:'refused',reason:'COMPARISON_BINDING_FAILED'
  })
 })
 it('refuses unknown feature fields or omitted evidence viewpoints',()=>{
  const a=dossier()
  a.comparisons[0].findings.extra='matches'
  expect(assessVehicleReviewDraft(a)).toMatchObject({status:'refused',reason:'INCOMPLETE_FEATURE_CHECKLIST'})
  const b=dossier();b.comparisons.pop()
  expect(assessVehicleReviewDraft(b)).toMatchObject({status:'refused',reason:'FOUR_COMPARISONS_REQUIRED'})
 })
 it('rejects forged approvals and unverifiable notes as authority',()=>{
  const a={...dossier(),decision:'approved',reviewerId:'fake',publish:true}
  expect(assessVehicleReviewDraft(a).status).not.toBe('approved')
  const b={...dossier(),reviewerNote:'x'.repeat(5000)}
  expect(assessVehicleReviewDraft(b)).toMatchObject({status:'refused',reason:'INVALID_REVIEW_NOTES'})
 })
})
