import {beforeEach,expect,it,vi} from 'vitest'
const mock=vi.hoisted(()=>({enabled:vi.fn(),claim:vi.fn(),image:vi.fn(),record:vi.fn(),commit:vi.fn(),mark:vi.fn(),unknown:vi.fn()}))
vi.mock('./store',()=>({requireCampaignEnabled:mock.enabled,claimCampaignItem:mock.claim,recordCampaignAsset:mock.record,commitCampaignItem:mock.commit,markCampaignItem:mock.mark}))
vi.mock('./image',()=>({prepareCampaignImage:mock.image}))
vi.mock('@/lib/governance/run-execution-checkpoint',()=>({recordDispatchUnknown:mock.unknown}))
import {executeCampaignImageRun} from './worker'
import {CampaignError} from './types'
const run={id:'11111111-1111-4111-8111-111111111111',project_id:'22222222-2222-4222-8222-222222222222',kind:'social.campaign.image.v1',input:{campaignId:'33333333-3333-4333-8333-333333333333',itemId:'44444444-4444-4444-8444-444444444444'}}
const claim='55555555-5555-4555-8555-555555555555'
beforeEach(()=>{vi.clearAllMocks();mock.enabled.mockImplementation(()=>{});mock.claim.mockResolvedValue({shouldGenerate:true,item:{state:'generating'}});mock.image.mockResolvedValue('asset');mock.record.mockResolvedValue({});mock.commit.mockResolvedValue({item:{state:'review_ready',revisionId:'saved-revision'}})})
it('saves canonical asset checkpoint before committing content and claims success only after receipt',async()=>{
 const result=await executeCampaignImageRun({} as never,run as never,claim,Date.now()+200000)
 expect(result).toBe('review_ready');expect(mock.record.mock.invocationCallOrder[0]).toBeLessThan(mock.commit.mock.invocationCallOrder[0]);expect(mock.image).toHaveBeenCalledTimes(1)
})
it('resumes admitted bytes through content save without a second paid image',async()=>{mock.claim.mockResolvedValue({shouldGenerate:false,item:{state:'asset_admitted',assetId:'asset'}});await executeCampaignImageRun({} as never,run as never,claim,Date.now()+200000);expect(mock.image).not.toHaveBeenCalled();expect(mock.commit).toHaveBeenCalledTimes(1)})
it('recovered generating/uncertain work records uncertainty and never calls provider',async()=>{mock.claim.mockResolvedValue({shouldGenerate:false,item:{state:'uncertain'}});expect(await executeCampaignImageRun({} as never,run as never,claim,Date.now()+200000)).toBe('uncertain');expect(mock.image).not.toHaveBeenCalled();expect(mock.unknown).toHaveBeenCalled()})
it('provider failure never retries and retains an uncertain result',async()=>{mock.image.mockRejectedValue(new Error('lost response'));expect(await executeCampaignImageRun({} as never,run as never,claim,Date.now()+200000)).toBe('uncertain');expect(mock.image).toHaveBeenCalledTimes(1);expect(mock.commit).not.toHaveBeenCalled();expect(mock.unknown).toHaveBeenCalled()})
it('disabled and short invocation do not acquire generation latch',async()=>{mock.enabled.mockImplementation(()=>{throw new CampaignError('DISABLED')});await expect(executeCampaignImageRun({} as never,run as never,claim,Date.now()+200000)).rejects.toMatchObject({code:'DISABLED'});expect(mock.claim).not.toHaveBeenCalled();mock.enabled.mockImplementation(()=>{});await expect(executeCampaignImageRun({} as never,run as never,claim,Date.now()+10000)).rejects.toMatchObject({code:'STOPPED'});expect(mock.claim).not.toHaveBeenCalled()})
it('cancellation after asset admission cannot become review-ready',async()=>{mock.commit.mockRejectedValue(new CampaignError('CANCELLED'));expect(await executeCampaignImageRun({} as never,run as never,claim,Date.now()+200000)).toBe('uncertain');expect(mock.record).toHaveBeenCalledTimes(1);expect(mock.unknown).toHaveBeenCalled()})

it('a hung non-abortable admission cannot consume the next drainer item deadline',async()=>{
 vi.useFakeTimers()
 try{
  mock.image.mockImplementation(()=>new Promise(()=>{}))
  const job=executeCampaignImageRun({} as never,run as never,claim,Date.now()+200000)
  await vi.advanceTimersByTimeAsync(65001)
  await expect(job).resolves.toBe('uncertain');expect(mock.commit).not.toHaveBeenCalled()
 }finally{vi.useRealTimers()}
},1000)
