import {beforeEach,expect,it,vi} from 'vitest'
import {PNG} from 'pngjs'
const mock=vi.hoisted(()=>({generate:vi.fn(),admit:vi.fn()}))
vi.mock('@/lib/media/image-client',()=>({generateIdeogramV3:mock.generate}))
vi.mock('@/lib/media/asset/admission',()=>({admitAssetBytes:mock.admit}))
import {prepareCampaignImage} from './image'
const w={projectId:'11111111-1111-4111-8111-111111111111',campaignId:'22222222-2222-4222-8222-222222222222',itemId:'33333333-3333-4333-8333-333333333333',runId:'44444444-4444-4444-8444-444444444444',claimId:'55555555-5555-4555-8555-555555555555'}
const item={id:w.itemId,unitCeilingSek:1,draft:{imagePrompt:'Dealer photograph'}} as never
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('SOCIAL_CAMPAIGN_IMAGE_ORIGINS','https://cdn.vendor.example');mock.generate.mockResolvedValue('https://cdn.vendor.example/generated.png');mock.admit.mockResolvedValue({asset:{id:'canonical'}})})
it('admits real decoded bytes privately with stable provenance and no forwarded token',async()=>{
 const bytes=PNG.sync.write(new PNG({width:512,height:512}))
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Uint8Array(bytes).buffer,{headers:{'content-type':'image/png'}})))
 await expect(prepareCampaignImage(w,item,new AbortController().signal)).resolves.toBe('canonical')
 expect(fetch).toHaveBeenCalledWith('https://cdn.vendor.example/generated.png',expect.objectContaining({redirect:'error',credentials:'omit'}))
 expect(mock.admit.mock.calls[0][0]).toMatchObject({projectId:w.projectId,visibility:'internal',width:512,height:512,mimeType:'image/png',provenance:{source:'generated',provider:'ideogram'}})
})
it.each(['http://cdn.vendor.example/image','https://attacker.example/image','https://cdn.vendor.example@attacker.example/image','https://127.0.0.1/image'])('rejects untrusted provider URL %s before retrieval',async url=>{
 mock.generate.mockResolvedValue(url);vi.stubGlobal('fetch',vi.fn());await expect(prepareCampaignImage(w,item,new AbortController().signal)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();expect(mock.admit).not.toHaveBeenCalled()
})
it('missing origin configuration refuses before a paid provider call',async()=>{vi.stubEnv('SOCIAL_CAMPAIGN_IMAGE_ORIGINS','');await expect(prepareCampaignImage(w,item,new AbortController().signal)).rejects.toThrow();expect(mock.generate).not.toHaveBeenCalled()})
it('refuses oversized response before storage and does not follow redirects',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('bad',{headers:{'content-type':'image/png','content-length':'999999999'}})))
 await expect(prepareCampaignImage(w,item,new AbortController().signal)).rejects.toThrow();expect(mock.admit).not.toHaveBeenCalled()
})
it('rejects HTML pretending to be an image before canonical admission',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>no</html>',{headers:{'content-type':'image/png'}})));await expect(prepareCampaignImage(w,item,new AbortController().signal)).rejects.toThrow();expect(mock.admit).not.toHaveBeenCalled()})
