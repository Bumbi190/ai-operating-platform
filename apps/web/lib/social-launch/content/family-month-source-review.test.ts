import {describe,expect,it} from 'vitest'
import {FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'
import {
 familyMonthSourceStatus,prepareFamilyMonthSourceReview,
 verifyOwnerSourceDecisionShape,type FamilyMonthSourceProposal,
} from './family-month-source-review'
const plan='e745041f-ad3a-493f-bd3b-025525d561b2'
const owner='10000000-0000-4000-8000-000000000001'
function sample():FamilyMonthSourceProposal{
 return {
  projectId:FAMILY_WEEKLY_PROJECT_ID,month:'2026-12',planRevisionId:plan,
  title:'December - family moments preview',publicSummary:'Public previews of December family activities.',
  campaignPurpose:'Show already-reviewed family month activities',
  proof:[{kind:'owner-project-public-evidence',referenceId:'20000000-0000-4000-8000-000000000002',
   sha256:'a'.repeat(64),description:'Canonical campaign hero source',
   privateSubscriberAsset:false}],
  proposedCopy:[{date:'2026-11-27',variant:'winter',
   title:'A coming December adventure',
   text:'Public campaign teaser for family togetherness.'}],
 }
}
describe('Familje-Stunden owner source-review contract',()=>{
 it('makes a short exact-hash review card without activating a new month',()=>{
  const candidate=sample()
  const receipt=prepareFamilyMonthSourceReview(candidate)
  expect(receipt).toMatchObject({
   kind:'familje-stunden-month-source-review-v1',month:'2026-12',
   status:'needs_owner_review',canActivate:false,canPublish:false,canSpend:false,
  })
  expect(receipt.candidateSha256).toMatch(/^[a-f0-9]{64}$/)
  expect(receipt.card.evidenceCount).toBe(1)
  expect(receipt.card.dates).toEqual(['2026-11-27'])
  expect(receipt.card.concerns).toHaveLength(3)
  expect(receipt.card.concerns.every(c=>!c.includes('?'))).toBe(true)
  expect(receipt.card.decisionPrompt).not.toContain('?')
  expect(JSON.stringify(receipt)).not.toContain('Canonical campaign hero source')
  expect(prepareFamilyMonthSourceReview(candidate)).toEqual(receipt)
 })
 it('any change of copy, evidence hash, month or purpose changes approval binding',()=>{
  const original=prepareFamilyMonthSourceReview(sample()).candidateSha256
  for(const edit of [
   (v:FamilyMonthSourceProposal)=>{v.proof[0].sha256='b'.repeat(64)},
   (v:FamilyMonthSourceProposal)=>{v.proposedCopy[0].text+=' Changed'},
   (v:FamilyMonthSourceProposal)=>{v.campaignPurpose+=' revised'},
   (v:FamilyMonthSourceProposal)=>{v.month='2027-01';v.proposedCopy[0].date='2026-12-27'},
  ]){
   const variant=sample();edit(variant)
   expect(prepareFamilyMonthSourceReview(variant).candidateSha256).not.toBe(original)
  }
 })
 it('rejects foreign tenant, private material, missing claims and invalid dates',()=>{
  const edits=[
   (v:FamilyMonthSourceProposal)=>{v.projectId='20000000-0000-4000-8000-000000000002'},
   (v:FamilyMonthSourceProposal)=>{v.planRevisionId='30000000-0000-4000-8000-000000000003'},
   (v:FamilyMonthSourceProposal)=>{v.proof[0].privateSubscriberAsset=true as false},
   (v:FamilyMonthSourceProposal)=>{v.proof[0].sha256='invalid'},
   (v:FamilyMonthSourceProposal)=>{v.proof[0].referenceId='just-a-text-label'},
   (v:FamilyMonthSourceProposal)=>{v.proof=Array.from({length:4},(_,i)=>({
    ...v.proof[0],referenceId:'20000000-0000-4000-8000-'+String(i+20).padStart(12,'0'),
   }))},
   (v:FamilyMonthSourceProposal)=>{v.proof=[]},
   (v:FamilyMonthSourceProposal)=>{v.proposedCopy[0].date='2026-12-01'},
   (v:FamilyMonthSourceProposal)=>{v.proposedCopy[0].date='2026-02-30'},
   (v:FamilyMonthSourceProposal)=>{v.proposedCopy.push({...v.proposedCopy[0]})},
   (v:FamilyMonthSourceProposal)=>{(v as unknown as Record<string,unknown>).publish=true},
  ]
  for(const edit of edits){
   const value=sample();edit(value)
   expect(()=>prepareFamilyMonthSourceReview(value)).toThrow()
  }
 })
 it('distinguishes one existing preview pack from missing next-month evidence',()=>{
  const november=familyMonthSourceStatus('2026-11')
  expect(november).toMatchObject({
   sourceStatus:'pinned_public_preview',canActivateNewSource:false,
   canPublish:false,reviewRequired:true,
  })
  const december=familyMonthSourceStatus('2026-12')
  expect(december).toMatchObject({
   sourceStatus:'owner_source_material_needed',
   sourceReference:null,publicPreviewDates:[],canPublish:false,
  })
  expect(()=>familyMonthSourceStatus('2026-13')).toThrow()
 })
 it('accepts exact owner decision SHAPE but activation remains blocked',()=>{
  const sha=prepareFamilyMonthSourceReview(sample()).candidateSha256
  expect(verifyOwnerSourceDecisionShape({
   projectId:FAMILY_WEEKLY_PROJECT_ID,ownerId:owner,reviewerId:owner,
   reviewedSha256:sha,candidateSha256:sha,decision:'approve',
  })).toEqual({decision:'approve',exactVersion:true,activationAllowed:false})
  expect(verifyOwnerSourceDecisionShape({
   projectId:FAMILY_WEEKLY_PROJECT_ID,ownerId:owner,reviewerId:owner,
   reviewedSha256:sha,candidateSha256:sha,decision:'reject',
  })).toEqual({decision:'reject',exactVersion:true,activationAllowed:false})
 })
 it('forged reviewer, altered SHA and foreign project cannot approve even shape',()=>{
  const sha=prepareFamilyMonthSourceReview(sample()).candidateSha256
  for(const edit of [
   {reviewerId:'20000000-0000-4000-8000-000000000002'},
   {reviewedSha256:'b'.repeat(64)},
   {projectId:'20000000-0000-4000-8000-000000000002'},
   {decision:'publish' as 'approve'},
  ]){
   expect(()=>verifyOwnerSourceDecisionShape({
    projectId:FAMILY_WEEKLY_PROJECT_ID,ownerId:owner,reviewerId:owner,
    reviewedSha256:sha,candidateSha256:sha,decision:'approve',...edit,
   })).toThrow('FAMILY_MONTH_OWNER_DECISION_REQUIRED')
  }
 })
})
