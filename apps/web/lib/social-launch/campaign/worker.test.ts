import {beforeEach,expect,it,vi} from 'vitest'
const mock=vi.hoisted(()=>({enabled:vi.fn(),claim:vi.fn(),image:vi.fn(),record:vi.fn(),commit:vi.fn(),mark:vi.fn(),unknown:vi.fn(),final:vi.fn()}))
vi.mock('./store',()=>({requireCampaignEnabled:mock.enabled,claimCampaignItem:mock.claim,recordCampaignAsset:mock.record,commitCampaignItem:mock.commit,markCampaignItem:mock.mark}))
vi.mock('./image',()=>({prepareCampaignImage:mock.image}))
vi.mock('@/lib/governance/run-execution-checkpoint',()=>({recordDispatchUnknown:mock.unknown,finalizeOwnedRunUnlessCancelled:mock.final}))
import {executeCampaignImageRun} from './worker'
import {ProviderNotDispatchedError} from '@/lib/cost/governed-spend'
import {CampaignError} from './types'
const run={id:'11111111-1111-4111-8111-111111111111',project_id:'22222222-2222-4222-8222-222222222222',kind:'social.campaign.image.v1',attempts:1,input:{campaignId:'33333333-3333-4333-8333-333333333333',itemId:'44444444-4444-4444-8444-444444444444'}}
const claim='55555555-5555-4555-8555-555555555555'
const exec=()=>executeCampaignImageRun({} as never,run as never,claim,Date.now()+200000)
beforeEach(()=>{vi.clearAllMocks();mock.enabled.mockImplementation(()=>{});mock.claim.mockResolvedValue({shouldGenerate:true,item:{state:'generating'}});mock.image.mockResolvedValue('asset');mock.record.mockResolvedValue({});mock.commit.mockResolvedValue({item:{state:'review_ready',revisionId:'saved-revision'}});mock.mark.mockImplementation(async(_db,_w,_reason,uncertain)=>({item:{state:uncertain?'uncertain':'blocked'}}));mock.unknown.mockResolvedValue('UNKNOWN_WRITTEN');mock.final.mockResolvedValue({outcome:'SUCCEEDED'})})
it('checkpoints canonical asset before content receipt, finalizing only actual saved work',async()=>{
 expect(await exec()).toBe('review_ready');expect(mock.record.mock.invocationCallOrder[0]).toBeLessThan(mock.commit.mock.invocationCallOrder[0]);expect(mock.image).toHaveBeenCalledTimes(1)
})
it('resumes admitted bytes without a second generation',async()=>{mock.claim.mockResolvedValue({shouldGenerate:false,item:{state:'asset_admitted',assetId:'asset'}});await exec();expect(mock.image).not.toHaveBeenCalled();expect(mock.commit).toHaveBeenCalledTimes(1)})
it('same live claim follower performs no provider or lifecycle write',async()=>{mock.claim.mockResolvedValue({shouldGenerate:false,alreadyRunning:true,item:{state:'generating'}});expect(await exec()).toBe('already_running');expect(mock.image).not.toHaveBeenCalled();expect(mock.unknown).not.toHaveBeenCalled();expect(mock.final).not.toHaveBeenCalled()})
it('known non-dispatch is blocked without inventing an unknown paid image',async()=>{mock.image.mockRejectedValue(new ProviderNotDispatchedError('No HTTP was dispatched'));expect(await exec()).toBe('blocked');expect(mock.unknown).not.toHaveBeenCalled();expect(mock.mark).toHaveBeenCalledWith(expect.anything(),expect.anything(),'provider_refused',false,expect.any(AbortSignal))})
it('known pre-claim context refusal becomes a durable blocked item',async()=>{mock.claim.mockRejectedValue(new CampaignError('REVIEW_REQUIRED'));mock.mark.mockResolvedValue({item:{state:'blocked'}});expect(await exec()).toBe('blocked');expect(mock.mark).toHaveBeenCalled();expect(mock.image).not.toHaveBeenCalled()})
it('disabled worker settles honestly without acquiring a paid latch',async()=>{mock.enabled.mockImplementation(()=>{throw new CampaignError('DISABLED')});expect(await exec()).toBe('blocked');expect(mock.claim).not.toHaveBeenCalled();expect(mock.image).not.toHaveBeenCalled()})
it('short invocation defers untouched work without consuming an attempt',async()=>{expect(await executeCampaignImageRun({} as never,run as never,claim,Date.now()+10000)).toBe('deferred');expect(mock.claim).not.toHaveBeenCalled();expect(mock.mark).not.toHaveBeenCalled();expect(mock.final.mock.calls[0][3]).toMatchObject({status:'pending',attempts:0})})
it('reaped started work and genuinely lost provider response require actual unknown settlement',async()=>{mock.claim.mockResolvedValueOnce({shouldGenerate:false,item:{state:'uncertain'}});expect(await exec()).toBe('uncertain');expect(mock.image).not.toHaveBeenCalled();mock.claim.mockResolvedValue({shouldGenerate:true,item:{state:'generating'}});mock.image.mockRejectedValue(new Error('lost response'));expect(await exec()).toBe('uncertain');expect(mock.image).toHaveBeenCalledTimes(1)})
it('known admitted image with rejected save preserves the image and does not imply provider uncertainty',async()=>{mock.commit.mockRejectedValue(new CampaignError('REVIEW_REQUIRED'));expect(await exec()).toBe('blocked');expect(mock.record).toHaveBeenCalledTimes(1);expect(mock.unknown).not.toHaveBeenCalled();expect(mock.mark).toHaveBeenCalledWith(expect.anything(),expect.anything(),'save_failed',false,expect.any(AbortSignal))})
it('unknown save records save uncertainty, not an unknown image generation',async()=>{mock.commit.mockRejectedValue(new CampaignError('UNAVAILABLE'));expect(await exec()).toBe('uncertain');expect(mock.mark).toHaveBeenCalledWith(expect.anything(),expect.anything(),'save_failed',true,expect.any(AbortSignal))})
it.each([['ERROR','lifecycle_error'],['FENCED','fenced']])('honors native unknown settlement %s',async(value,result)=>{mock.image.mockRejectedValue(new Error('lost'));mock.unknown.mockResolvedValue(value);expect(await exec()).toBe(result)})
it('a failed terminal write is lifecycle_error, never completed or definitively blocked',async()=>{mock.image.mockRejectedValue(new ProviderNotDispatchedError('not sent'));mock.final.mockResolvedValue({outcome:'ERROR'});expect(await exec()).toBe('lifecycle_error')})
it('hung claim or settlement remains within the whole65s item window',async()=>{
 vi.useFakeTimers()
 try{
  mock.claim.mockImplementation(()=>new Promise(()=>{}));const claimJob=exec();await vi.advanceTimersByTimeAsync(65001);expect(await claimJob).toBe('lifecycle_error');expect(mock.image).not.toHaveBeenCalled()
  mock.claim.mockResolvedValue({shouldGenerate:true,item:{state:'generating'}});mock.image.mockRejectedValue(new Error('lost'));mock.unknown.mockImplementation(()=>new Promise(()=>{}));const settleJob=exec();await vi.advanceTimersByTimeAsync(65001);expect(await settleJob).toBe('lifecycle_error')
 }finally{vi.useRealTimers()}
},1000)
