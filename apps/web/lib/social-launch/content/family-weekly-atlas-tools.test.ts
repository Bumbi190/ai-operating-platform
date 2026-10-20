import {beforeEach,describe,expect,it,vi} from 'vitest'
import {handleSocialContentTool,SOCIAL_CONTENT_TOOL_NAMES,SOCIAL_CONTENT_TOOLS} from './atlas-tools'
import {readSocialContent,proposeSocialContent} from './store'
import {readSchedules} from '../scheduling/store'
import {FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'

vi.mock('./store',()=>({
 readSocialContent:vi.fn(),proposeSocialContent:vi.fn(),
}))
vi.mock('../scheduling/store',()=>({readSchedules:vi.fn()}))
const principal={userId:'10000000-0000-4000-8000-000000000001',
 allowedProjectIds:[FAMILY_WEEKLY_PROJECT_ID]}
const ownerConversation='20000000-0000-4000-8000-000000000002'
const fakeDb={} as any
const planId='e745041f-ad3a-493f-bd3b-025525d561b2'

beforeEach(()=>{
 vi.clearAllMocks()
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
 it('fails closed when schedule read is unavailable instead of inventing gaps',async()=>{
  vi.mocked(readSchedules).mockRejectedValue(new Error('storage unavailable'))
  const value=await handleSocialContentTool('get_family_weekly_content_plan',
   {projectId:FAMILY_WEEKLY_PROJECT_ID},principal,ownerConversation,fakeDb) as any
  expect(value.code).toBe('UNAVAILABLE')
  expect(value.slots).toBeUndefined()
 })
})
