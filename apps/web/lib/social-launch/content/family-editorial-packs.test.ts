import {describe,expect,it} from 'vitest'
import {
 FAMILY_PUBLIC_PREVIEW_EVIDENCE,getFamilyPublicEditorialSlot,listFamilyEditorialSources,getFamilyEditorialReadiness,
} from './family-editorial-packs'
import {FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'
const plan='e745041f-ad3a-493f-bd3b-025525d561b2'
const select=(date:string,channel:'facebook'|'instagram'='facebook')=>
 getFamilyPublicEditorialSlot({projectId:FAMILY_WEEKLY_PROJECT_ID,
  planRevisionId:plan,kind:'ordinary',channel,date})

describe('Pinned Familje-Stunden public editorial source packs',()=>{
 it('lists exact verified preview dates and not subscriber release authority',()=>{
  expect(listFamilyEditorialSources()).toEqual([{
   id:'family-public-november-preview-2026-v1',themeMonth:'2026-11',
   eligibleDates:['2026-10-23','2026-10-27','2026-10-30'],
   releaseAuthorized:false,mediaGenerationAllowed:false,canPublish:false,
  }])
  expect(FAMILY_PUBLIC_PREVIEW_EVIDENCE).toMatchObject({
   privateAssetsIncluded:false,month:'2026-11',
   heroSha256:'5789a09f28ad95334d5d1a3a08af3cc3d3201468d28f66f310da860db0815a76',
   activitySha256:'ffd12c414aba2b71e2c39965c22e5c71f1028905eb5ed64217c054893604b31b',
  })
 })
 it('correct date and channel yield stable review-only copy with source hash',()=>{
  for(const date of ['2026-10-23','2026-10-27','2026-10-30']){
   const fb=select(date)!,ig=select(date,'instagram')!
   expect(fb.sourceId).toBe('family-public-november-preview-2026-v1')
   expect(fb.sourceSha256).toMatch(/^[a-f0-9]{64}$/)
   expect(fb).toEqual(select(date))
   expect(ig.sourceSha256).toBe(fb.sourceSha256)
   expect(fb.draft.format).toBe('text')
   expect(ig.draft.format).toBe('image')
   for(const source of [fb,ig]){
    expect(source.draft.text).toContain('Nova och Pling')
    expect(source.draft.text).not.toMatch(/nu ute|k?p nu|tillg?nglig nu/i)
    expect(source.draft.mediaIds).toEqual([])
    expect(source.draft.linkUrl).toBeNull()
   }
   expect(ig.draft.mediaBrief).toContain('novemberillustration')
  }
 })
 it('explains exactly which calendar gaps have source proof and which must be blocked',()=>{
  const input={
   projectId:FAMILY_WEEKLY_PROJECT_ID,planRevisionId:plan,
   slots:[{
    channel:'facebook' as const,kind:'ordinary' as const,
    localMinute:'2026-10-27T17:00',scheduledAt:'2026-10-27T16:00:00.000Z',
    status:'needs_content' as const,postId:null,requiresReleaseEvidence:false,
   },{
    channel:'instagram' as const,kind:'month_release' as const,
    localMinute:'2026-11-01T20:30',scheduledAt:'2026-11-01T19:30:00.000Z',
    status:'needs_content' as const,postId:null,requiresReleaseEvidence:true,
   }],
  }
  const result=getFamilyEditorialReadiness(input)
  expect(result.sourceReady).toBe(1)
  expect(result.sourceMissing).toBe(1)
  expect(result.aiSourceGuessingAllowed).toBe(false)
  expect(result.missing[0]).toMatchObject({
   channel:'facebook',sourceState:'public_preview_ready',
   sourceId:'family-public-november-preview-2026-v1',
   canAutomaticallyPublish:false,
  })
  expect(result.missing[1]).toMatchObject({
   channel:'instagram',sourceState:'approved_public_source_missing',
   sourceId:null,needsOwnerReleaseEvidence:true,canAutomaticallyPublish:false,
  })
  expect(()=>getFamilyEditorialReadiness({...input,projectId:'wrong'})).toThrow()
 })
 it('fails closed on other projects, changed plan, private release and unknown dates',()=>{
  for(const date of ['2026-10-20','2026-11-01','2026-11-03','2026-12-01',
    '2027-01-01','2026-10-31','2026-09-23']){
   expect(select(date)).toBeNull()
  }
  expect(getFamilyPublicEditorialSlot({
   projectId:FAMILY_WEEKLY_PROJECT_ID,planRevisionId:plan,
   kind:'month_release',channel:'facebook',date:'2026-11-01',
  })).toBeNull()
  expect(getFamilyPublicEditorialSlot({
   projectId:'20000000-0000-4000-8000-000000000002',
   planRevisionId:plan,kind:'ordinary',channel:'facebook',date:'2026-10-23',
  })).toBeNull()
  expect(getFamilyPublicEditorialSlot({
   projectId:FAMILY_WEEKLY_PROJECT_ID,
   planRevisionId:'30000000-0000-4000-8000-000000000003',
   kind:'ordinary',channel:'facebook',date:'2026-10-23',
  })).toBeNull()
  expect(getFamilyPublicEditorialSlot({
   projectId:FAMILY_WEEKLY_PROJECT_ID,
   planRevisionId:plan,kind:'ordinary',
   channel:'the-prompt' as 'facebook',date:'2026-10-23',
  })).toBeNull()
 })
})
