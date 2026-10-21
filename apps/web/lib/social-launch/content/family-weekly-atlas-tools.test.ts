import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {handleSocialContentTool,SOCIAL_CONTENT_TOOL_NAMES,SOCIAL_CONTENT_TOOLS} from './atlas-tools'
import {readSocialContent,proposeSocialContent} from './store'
import {readSchedules} from '../scheduling/store'
import {FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'
import {FamilySourceStoreError,listFamilyMonthSourceReviews,proposeFamilyMonthSource,assertFamilyOwnerSourceCurrentBeforeDraft} from './family-month-source-store'
import {resolveFamilyOwnerApprovedPublicSource} from './family-month-source-activation'

vi.mock('./store',()=>({
 readSocialContent:vi.fn(),proposeSocialContent:vi.fn(),
}))
vi.mock('../scheduling/store',()=>({readSchedules:vi.fn()}))
vi.mock('./family-month-source-store',async(importOriginal)=>({...await importOriginal<typeof import('./family-month-source-store')>(),listFamilyMonthSourceReviews:vi.fn(),proposeFamilyMonthSource:vi.fn(),assertFamilyOwnerSourceCurrentBeforeDraft:vi.fn()}))
vi.mock('./family-month-source-activation',()=>({resolveFamilyOwnerApprovedPublicSource:vi.fn()}))
const principal={userId:'10000000-0000-4000-8000-000000000001',
 allowedProjectIds:[FAMILY_WEEKLY_PROJECT_ID]}
const ownerConversation='20000000-0000-4000-8000-000000000002'
const fakeDb={} as any
const planId='e745041f-ad3a-493f-bd3b-025525d561b2'

beforeEach(()=>{
 vi.clearAllMocks()
 vi.stubEnv('FAMILY_MONTH_SOURCE_REVIEW_ENABLED','false')
 vi.stubEnv('FAMILY_PUBLIC_SOURCE_ACTIVATION_ENABLED','false')
 vi.mocked(readSocialContent).mockResolvedValue({
  project:{id:FAMILY_WEEKLY_PROJECT_ID,name:'Familje-Stunden',slug:'familje-stunden'},
  posts:[],assets:[],hasMoreAssets:false,planApproved:true,dispatchEnabled:false,
  publicationReady:false,currentPlanRevisionId:planId,
  workspaceUrl:'/projects/familje-stunden/social#content',
  plannedChannels:[
   {channel:'facebook',format:'text',cadence:'manual',purpose:'Families'},
   {channel:'instagram',format:'image',cadence:'manual',purpose:'Images'},
  ],
 })
 vi.mocked(readSchedules).mockResolvedValue({
  projectId:FAMILY_WEEKLY_PROJECT_ID,batches:[],releaseEvidence:[],
  monthlyRule:{dayOfMonth:1,localTime:'20:30',timeZone:'Europe/Stockholm',
    channels:['facebook','instagram'],enabled:true},
 })
})
afterEach(()=>vi.unstubAllEnvs())
describe('Atlas weekly planning tool permission and side-effect boundary',()=>{
 it('exposes read-only weekly plan under existing owned conversation and tenant',async()=>{
  expect(SOCIAL_CONTENT_TOOL_NAMES).toContain('get_family_weekly_content_plan')
  const tool=SOCIAL_CONTENT_TOOLS.find(t=>t.name==='get_family_weekly_content_plan')
  expect(tool?.description).toContain('Read-only')
  const value=await handleSocialContentTool('get_family_weekly_content_plan',
   {projectId:FAMILY_WEEKLY_PROJECT_ID,daysAhead:14},
   principal,ownerConversation,fakeDb) as any
  expect(value.kind).toBe('family_content_week_coverage_v1')
  expect(value.timeZone).toBe('Europe/Stockholm')
  expect(value.autonomousDraftingEnabled).toBe(false)
  expect(value.automaticPublishingEnabled).toBe(false)
  expect(value.costsIncurredByPlan).toBe(0)
  expect(value.sourceReadiness.aiSourceGuessingAllowed).toBe(false)
  expect(value.sourceReadiness.sourceReady+value.sourceReadiness.sourceMissing)
   .toBe(value.summary.missing)
  expect(readSocialContent).toHaveBeenCalledWith(fakeDb,principal,
   {projectId:FAMILY_WEEKLY_PROJECT_ID,conversationId:ownerConversation})
  expect(readSchedules).toHaveBeenCalledWith(fakeDb,principal,
   {projectId:FAMILY_WEEKLY_PROJECT_ID})
  expect(proposeSocialContent).not.toHaveBeenCalled()
 })
 it('rejects other projects and unknown fields before any db reads',async()=>{
  for(const input of [
   {projectId:'30000000-0000-4000-8000-000000000003'},
   {projectId:FAMILY_WEEKLY_PROJECT_ID,approve:true},
   {projectId:FAMILY_WEEKLY_PROJECT_ID,daysAhead:30},
   {projectId:FAMILY_WEEKLY_PROJECT_ID,daysAhead:'14'},
  ]){
   const result=await handleSocialContentTool('get_family_weekly_content_plan',
    input,principal,ownerConversation,fakeDb) as any
   expect(['NOT_FOUND','INVALID_BODY']).toContain(result.code)
  }
  expect(readSocialContent).not.toHaveBeenCalled()
  expect(readSchedules).not.toHaveBeenCalled()
 })
 it('requires existing user conversation and refuses a cross-tenant content reader',async()=>{
  expect(await handleSocialContentTool('get_family_weekly_content_plan',
   {projectId:FAMILY_WEEKLY_PROJECT_ID},principal,null,fakeDb))
   .toMatchObject({code:'NOT_FOUND'})
  vi.mocked(readSocialContent).mockRejectedValue(new Error('OWNERSHIP_DENIED'))
  const value=await handleSocialContentTool('get_family_weekly_content_plan',
   {projectId:FAMILY_WEEKLY_PROJECT_ID},principal,ownerConversation,fakeDb) as any
  expect(value.code).toBe('UNAVAILABLE')
  expect(readSchedules).not.toHaveBeenCalled()
 })
 it('reads current and future month source status inside the existing scoped conversation',async()=>{
  const tool=SOCIAL_CONTENT_TOOLS.find(x=>x.name==='get_family_month_source_status')
  expect(tool?.description).toContain('Read-only')
  const november=await handleSocialContentTool('get_family_month_source_status',
   {projectId:FAMILY_WEEKLY_PROJECT_ID,month:'2026-11'},
   principal,ownerConversation,fakeDb) as any
  expect(november).toMatchObject({sourceStatus:'pinned_public_preview',
   canPublish:false,canActivateNewSource:false})
  const december=await handleSocialContentTool('get_family_month_source_status',
   {projectId:FAMILY_WEEKLY_PROJECT_ID,month:'2026-12'},
   principal,ownerConversation,fakeDb) as any
  expect(december).toMatchObject({sourceStatus:'owner_source_material_needed',
   publicPreviewDates:[],canPublish:false})
  expect(readSocialContent).toHaveBeenCalledTimes(2)
  expect(readSchedules).not.toHaveBeenCalled()
  expect(listFamilyMonthSourceReviews).not.toHaveBeenCalled()
  expect(proposeSocialContent).not.toHaveBeenCalled()
 })
 it('month status reflects stored owner review and never treats approval as activated or published',async()=>{
  vi.stubEnv('FAMILY_MONTH_SOURCE_REVIEW_ENABLED','true')
  const input={projectId:FAMILY_WEEKLY_PROJECT_ID,month:'2026-12'}
  const cases=[
   {decision:null,sourceStatus:'owner_review_pending',ownerReviewStatus:'needs_owner_review'},
   {decision:{kind:'approve'},sourceStatus:'owner_approved_pending_media_verification',
    ownerReviewStatus:'approved_pending_media_verification'},
   {decision:{kind:'reject'},sourceStatus:'owner_source_material_needed',ownerReviewStatus:'rejected'},
  ]
  for(const item of cases){
   vi.mocked(listFamilyMonthSourceReviews).mockResolvedValue({
    kind:'family-month-source-owner-review-list-v1',month:'2026-12',
    records:[{candidateId:'30000000-0000-4000-8000-000000000003',
     decision:item.decision}],canActivate:false,canPublish:false,
   } as any)
   const result=await handleSocialContentTool('get_family_month_source_status',
    input,principal,ownerConversation,fakeDb) as any
   expect(result).toMatchObject({sourceStatus:item.sourceStatus,
    ownerReviewStatus:item.ownerReviewStatus,canActivateNewSource:false,
    canPublish:false,mediaIntegrityVerified:false})
  }
  expect(readSocialContent).toHaveBeenCalledTimes(3)
  expect(listFamilyMonthSourceReviews).toHaveBeenCalledTimes(3)
  expect(proposeFamilyMonthSource).not.toHaveBeenCalled()
  expect(proposeSocialContent).not.toHaveBeenCalled()
 })
 it('existing pinned preview never implies month release even with an owner decision',async()=>{
  vi.stubEnv('FAMILY_MONTH_SOURCE_REVIEW_ENABLED','true')
  vi.mocked(listFamilyMonthSourceReviews).mockResolvedValue({
   kind:'family-month-source-owner-review-list-v1',month:'2026-11',
   canActivate:false,canPublish:false,records:[{
    candidateId:'30000000-0000-4000-8000-000000000003',
    decision:{kind:'approve'},
   }],
  } as any)
  const result=await handleSocialContentTool('get_family_month_source_status',
   {projectId:FAMILY_WEEKLY_PROJECT_ID,month:'2026-11'},
   principal,ownerConversation,fakeDb) as any
  expect(result).toMatchObject({
   sourceStatus:'pinned_public_preview',
   ownerReviewStatus:'approved_pending_media_verification',
   canActivateNewSource:false,canPublish:false,mediaIntegrityVerified:false,
  })
  expect(listFamilyMonthSourceReviews).toHaveBeenCalledTimes(1)
 })
 it('month-source status fails closed if private history is unreadable or malformed',async()=>{
  vi.stubEnv('FAMILY_MONTH_SOURCE_REVIEW_ENABLED','true')
  vi.mocked(listFamilyMonthSourceReviews).mockRejectedValueOnce(new Error('db unavailable'))
  const request={projectId:FAMILY_WEEKLY_PROJECT_ID,month:'2026-12'}
  expect((await handleSocialContentTool('get_family_month_source_status',
   request,principal,ownerConversation,fakeDb) as any).code).toBe('UNAVAILABLE')
  vi.mocked(listFamilyMonthSourceReviews).mockResolvedValue({
   kind:'wrong',month:'2026-12',records:[],canActivate:false,canPublish:false,
  } as any)
  expect((await handleSocialContentTool('get_family_month_source_status',
   request,principal,ownerConversation,fakeDb) as any).code).toBe('UNAVAILABLE')
  expect(proposeSocialContent).not.toHaveBeenCalled()
 })
 it('rejects unscoped month reviews and malformed months before any source read',async()=>{
  const denied=[
   {projectId:'20000000-0000-4000-8000-000000000002',month:'2026-12'},
   {projectId:FAMILY_WEEKLY_PROJECT_ID,month:'2026-13'},
   {projectId:FAMILY_WEEKLY_PROJECT_ID,month:'2026-12',approve:true},
   {projectId:FAMILY_WEEKLY_PROJECT_ID},
  ]
  for(const value of denied){
   const response=await handleSocialContentTool('get_family_month_source_status',
    value,principal,ownerConversation,fakeDb) as any
   expect(['NOT_FOUND','INVALID_BODY']).toContain(response.code)
  }
  expect(readSocialContent).not.toHaveBeenCalled()
  expect(await handleSocialContentTool('get_family_month_source_status',
   {projectId:FAMILY_WEEKLY_PROJECT_ID,month:'2026-12'},principal,null,fakeDb))
   .toMatchObject({code:'NOT_FOUND'})
  expect(proposeSocialContent).not.toHaveBeenCalled()
 })
 it('Atlas cannot approve month sources and disabled tools do not read the private DB',async()=>{
  expect(SOCIAL_CONTENT_TOOL_NAMES).toContain('get_family_month_source_reviews')
  expect(SOCIAL_CONTENT_TOOL_NAMES).toContain('propose_family_month_source_review')
  expect(SOCIAL_CONTENT_TOOL_NAMES).not.toContain('approve_family_month_source_review')
  const result=await handleSocialContentTool('propose_family_month_source_review',
   {projectId:FAMILY_WEEKLY_PROJECT_ID,proposal:{}},
   principal,ownerConversation,fakeDb) as any
  expect(result.code).toBe('UNAVAILABLE')
  expect(readSocialContent).not.toHaveBeenCalled()
  expect(proposeFamilyMonthSource).not.toHaveBeenCalled()
 })
 it('authorized conversation stores a private unapproved source, never a decision',async()=>{
  vi.stubEnv('FAMILY_MONTH_SOURCE_REVIEW_ENABLED','true')
  const proposal={projectId:FAMILY_WEEKLY_PROJECT_ID,month:'2026-12',
   planRevisionId:planId,title:'December public preview'}
  vi.mocked(proposeFamilyMonthSource).mockResolvedValue({
   candidateId:'candidate',canActivate:false,canPublish:false,
  } as any)
  const result=await handleSocialContentTool('propose_family_month_source_review',
   {projectId:FAMILY_WEEKLY_PROJECT_ID,proposal},
   principal,ownerConversation,fakeDb) as any
  expect(result).toMatchObject({candidateId:'candidate',canActivate:false,canPublish:false})
  expect(readSocialContent).toHaveBeenCalledWith(fakeDb,principal,
   {projectId:FAMILY_WEEKLY_PROJECT_ID,conversationId:ownerConversation})
  expect(proposeFamilyMonthSource).toHaveBeenCalledWith(fakeDb,principal,proposal)
  const blocked=await handleSocialContentTool('propose_family_month_source_review',
   {projectId:FAMILY_WEEKLY_PROJECT_ID,proposal,decision:'approve'},
   principal,ownerConversation,fakeDb) as any
  expect(blocked.code).toBe('INVALID_BODY')
  expect(proposeFamilyMonthSource).toHaveBeenCalledTimes(1)
 })
 it('read-only source-review cards are tenant-scoped and reject extra decision fields',async()=>{
  vi.stubEnv('FAMILY_MONTH_SOURCE_REVIEW_ENABLED','true')
  vi.mocked(listFamilyMonthSourceReviews).mockResolvedValue({
   records:[],canActivate:false,canPublish:false,
  } as any)
  const input={projectId:FAMILY_WEEKLY_PROJECT_ID,month:'2026-12'}
  const result=await handleSocialContentTool('get_family_month_source_reviews',
   input,principal,ownerConversation,fakeDb) as any
  expect(result.canActivate).toBe(false)
  expect(listFamilyMonthSourceReviews).toHaveBeenCalledWith(fakeDb,principal,
   {month:'2026-12'})
  expect((await handleSocialContentTool('get_family_month_source_reviews',
   {...input,decision:'approve'},principal,ownerConversation,fakeDb) as any).code).toBe('INVALID_BODY')
  expect((await handleSocialContentTool('get_family_month_source_reviews',
   input,principal,null,fakeDb) as any).code).toBe('NOT_FOUND')
  expect((await handleSocialContentTool('get_family_month_source_reviews',
   {...input,projectId:'30000000-0000-4000-8000-000000000003'},
   principal,ownerConversation,fakeDb) as any).code).toBe('NOT_FOUND')
 })
 it('private store conflicts are surfaced as review conflicts, not permissions',async()=>{
  vi.stubEnv('FAMILY_MONTH_SOURCE_REVIEW_ENABLED','true')
  vi.mocked(proposeFamilyMonthSource).mockRejectedValue(new FamilySourceStoreError('CONFLICT'))
  const input={projectId:FAMILY_WEEKLY_PROJECT_ID,
   proposal:{projectId:FAMILY_WEEKLY_PROJECT_ID}}
  const result=await handleSocialContentTool('propose_family_month_source_review',
   input,principal,ownerConversation,fakeDb) as any
  expect(result.code).toBe('REVISION_CONFLICT')
 })
 it('stages at most 4 October source-pinned review proposals in user conversation only',async()=>{
  const date=new Date('2026-10-20T18:00:00.000Z')
  vi.useFakeTimers()
  try{
   vi.setSystemTime(date)
   vi.mocked(proposeSocialContent).mockResolvedValue({} as any)
   const tool=SOCIAL_CONTENT_TOOLS.find(t=>t.name==='prepare_family_weekly_review_drafts')
   expect(tool?.description).toContain('operator explicitly asks')
   const output=await handleSocialContentTool('prepare_family_weekly_review_drafts',
    {projectId:FAMILY_WEEKLY_PROJECT_ID},principal,ownerConversation,fakeDb) as any
   expect(output.kind).toBe('family_weekly_review_staging_v1')
   expect(output.created).toBe(4)
   expect(output.canPublish).toBe(false)
   expect(output.aiGenerationCalls).toBe(0)
   expect(output.workspaceUrl).toBe('/projects/familje-stunden/social#content')
   expect(proposeSocialContent).toHaveBeenCalledTimes(4)
   const first=vi.mocked(proposeSocialContent).mock.calls[0]
   expect(first[0]).toBe(fakeDb)
   expect(first[1]).toBe(principal)
   expect(first[2]).toMatchObject({projectId:FAMILY_WEEKLY_PROJECT_ID,
    conversationId:ownerConversation,expectedRevisionId:null})
   expect(first[2].draft.mediaIds).toEqual([])
   expect(first[2].draft.scheduledAt).not.toBe(null)
  }finally{vi.useRealTimers()}
 })
 it('after verified owner approval Atlas can prepare next-month review drafts with one registered image',async()=>{
  vi.stubEnv('FAMILY_PUBLIC_SOURCE_ACTIVATION_ENABLED','true')
  vi.useFakeTimers()
  try{
   vi.setSystemTime(new Date('2026-11-23T18:00:00.000Z'))
   const ownerSource={
    kind:'family-owner-approved-public-source-v1',
    projectId:FAMILY_WEEKLY_PROJECT_ID,sourceMonth:'2026-12',
    candidateId:'30000000-0000-4000-8000-000000000003',
    candidateSha256:'a'.repeat(64),
    decisionId:'40000000-0000-4000-8000-000000000004',
    approvedAt:'2026-11-23T11:00:00Z',sourceIntegrityVerified:true,
    verifiedImageCount:1,
    verifiedImageAssetIds:['50000000-0000-4000-8000-000000000005'],
    templateDates:['2026-11-27'],
    templates:[{date:'2026-11-27',variant:'winter',
     title:'December source verified',text:'An approved public month preview caption.'}],
    canDraftReviewProposals:true,canGenerateMedia:false,
    canOpenMemberContent:false,canSchedule:false,canPublish:false,canSpend:false,
   }
   vi.mocked(resolveFamilyOwnerApprovedPublicSource).mockResolvedValue(ownerSource as any)
   vi.mocked(assertFamilyOwnerSourceCurrentBeforeDraft).mockResolvedValue(undefined)
   vi.mocked(proposeSocialContent).mockResolvedValue({} as any)
   const result=await handleSocialContentTool('prepare_family_weekly_review_drafts',
    {projectId:FAMILY_WEEKLY_PROJECT_ID},principal,ownerConversation,fakeDb) as any
   expect(result).toMatchObject({kind:'family_weekly_review_staging_v1',
    created:2,canPublish:false,canApprove:false,aiGenerationCalls:0,
   })
   expect(resolveFamilyOwnerApprovedPublicSource).toHaveBeenCalledWith(
    fakeDb,principal,'2026-12')
   expect(assertFamilyOwnerSourceCurrentBeforeDraft).toHaveBeenCalledTimes(2)
   expect(assertFamilyOwnerSourceCurrentBeforeDraft).toHaveBeenCalledWith(
    fakeDb,principal,{
     month:'2026-12',candidateId:ownerSource.candidateId,
     candidateSha256:ownerSource.candidateSha256,
     decisionId:ownerSource.decisionId,
     verifiedImageAssetIds:ownerSource.verifiedImageAssetIds,
    },
   )
   expect(proposeSocialContent).toHaveBeenCalledTimes(2)
   const proposals=vi.mocked(proposeSocialContent).mock.calls.map(x=>x[2])
   expect(proposals[0].draft.mediaIds).toEqual([])
   expect(proposals[1].draft.mediaIds).toEqual(ownerSource.verifiedImageAssetIds)
   expect(proposals[1].draft.scheduledAt).toBe('2026-11-27T19:30:00.000Z')
  }finally{vi.useRealTimers()}
 })
 it('a newer source decision blocks all drafts before the write',async()=>{
  vi.stubEnv('FAMILY_PUBLIC_SOURCE_ACTIVATION_ENABLED','true')
  vi.useFakeTimers()
  try{
   vi.setSystemTime(new Date('2026-11-23T18:00:00.000Z'))
   vi.mocked(resolveFamilyOwnerApprovedPublicSource).mockResolvedValue({
    kind:'family-owner-approved-public-source-v1',projectId:FAMILY_WEEKLY_PROJECT_ID,
    sourceMonth:'2026-12',candidateId:'30000000-0000-4000-8000-000000000003',
    candidateSha256:'a'.repeat(64),decisionId:'40000000-0000-4000-8000-000000000004',
    approvedAt:'2026-11-23T11:00:00Z',sourceIntegrityVerified:true,
    verifiedImageCount:1,verifiedImageAssetIds:['50000000-0000-4000-8000-000000000005'],
    templateDates:['2026-11-27'],templates:[{
     date:'2026-11-27',variant:'winter',title:'December',
     text:'A reviewed source for December month.',
    }],canDraftReviewProposals:true,canGenerateMedia:false,
    canOpenMemberContent:false,canSchedule:false,canPublish:false,canSpend:false,
   } as any)
   vi.mocked(assertFamilyOwnerSourceCurrentBeforeDraft).mockRejectedValue(
    new FamilySourceStoreError('CONFLICT'),
   )
   const result=await handleSocialContentTool('prepare_family_weekly_review_drafts',
    {projectId:FAMILY_WEEKLY_PROJECT_ID},principal,ownerConversation,fakeDb) as any
   expect(result.code).toBe('REVISION_CONFLICT')
   expect(proposeSocialContent).not.toHaveBeenCalled()
  }finally{vi.useRealTimers()}
 })
 it('archived or replaced image during Atlas preparation blocks a Facebook draft too',async()=>{
  vi.stubEnv('FAMILY_PUBLIC_SOURCE_ACTIVATION_ENABLED','true')
  vi.useFakeTimers()
  try{
   vi.setSystemTime(new Date('2026-11-23T18:00:00.000Z'))
   const verified={
    kind:'family-owner-approved-public-source-v1',
    projectId:FAMILY_WEEKLY_PROJECT_ID,sourceMonth:'2026-12',
    candidateId:'30000000-0000-4000-8000-000000000003',
    candidateSha256:'a'.repeat(64),
    decisionId:'40000000-0000-4000-8000-000000000004',
    approvedAt:'2026-11-23T11:00:00Z',sourceIntegrityVerified:true,
    verifiedImageCount:1,verifiedImageAssetIds:['50000000-0000-4000-8000-000000000005'],
    templateDates:['2026-11-27'],templates:[{
     date:'2026-11-27',variant:'winter',
     title:'Public winter month',text:'Public teaser for a family month.',
    }],
    canDraftReviewProposals:true,canGenerateMedia:false,
    canOpenMemberContent:false,canSchedule:false,canPublish:false,canSpend:false,
   }
   vi.mocked(resolveFamilyOwnerApprovedPublicSource).mockResolvedValue(verified as any)
   vi.mocked(assertFamilyOwnerSourceCurrentBeforeDraft).mockRejectedValue(
    new FamilySourceStoreError('REVIEW_REQUIRED'),
   )
   const result=await handleSocialContentTool('prepare_family_weekly_review_drafts',
    {projectId:FAMILY_WEEKLY_PROJECT_ID},principal,ownerConversation,fakeDb) as any
   expect(result.code).toBe('REVIEW_REQUIRED')
   expect(assertFamilyOwnerSourceCurrentBeforeDraft).toHaveBeenCalledTimes(1)
   expect(proposeSocialContent).not.toHaveBeenCalled()
  }finally{vi.useRealTimers()}
 })
 it('refuses changed tenant, unsolicited extra settings, or missing owner conversation',async()=>{
  for(const wrong of [
   {projectId:'30000000-0000-4000-8000-000000000003'},
   {projectId:FAMILY_WEEKLY_PROJECT_ID,publish:true},
   {projectId:FAMILY_WEEKLY_PROJECT_ID,budgetUsd:50},
  ]){
   const value=await handleSocialContentTool('prepare_family_weekly_review_drafts',
    wrong,principal,ownerConversation,fakeDb) as any
   expect(['NOT_FOUND','INVALID_BODY']).toContain(value.code)
  }
  expect(await handleSocialContentTool('prepare_family_weekly_review_drafts',
   {projectId:FAMILY_WEEKLY_PROJECT_ID},principal,null,fakeDb))
   .toMatchObject({code:'NOT_FOUND'})
  expect(proposeSocialContent).not.toHaveBeenCalled()
  expect(readSocialContent).not.toHaveBeenCalled()
 })
 it('fails closed when schedule read is unavailable instead of inventing gaps',async()=>{
  vi.mocked(readSchedules).mockRejectedValue(new Error('storage unavailable'))
  const value=await handleSocialContentTool('get_family_weekly_content_plan',
   {projectId:FAMILY_WEEKLY_PROJECT_ID},principal,ownerConversation,fakeDb) as any
  expect(value.code).toBe('UNAVAILABLE')
  expect(value.slots).toBeUndefined()
 })
})
