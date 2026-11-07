import {beforeEach,it,expect,vi} from 'vitest'
import sharp from 'sharp'
const f=vi.hoisted(()=>({rates:vi.fn(),gate:vi.fn(),sdk:vi.fn()}))
vi.mock('@/lib/cost/rates',()=>({getRates:f.rates}))
vi.mock('@/lib/cost/governed-spend',async original=>({...await original<typeof import('@/lib/cost/governed-spend')>(),withGovernedSpend:f.gate}))
vi.mock('@anthropic-ai/sdk',()=>({default:f.sdk}))
import {prepareAnalysisRequest,quoteAnalysisRequest,runAnalysisProvider} from './provider'
import {ProviderNotDispatchedError,SpendRefusedError} from '@/lib/cost/governed-spend'
beforeEach(()=>{vi.clearAllMocks();f.rates.mockResolvedValue({usd_sek:10.5})})
it('real governed Anthropic factory refuses increased cost before reservation or SDK construction',async()=>{
 const bytes=await sharp({create:{width:12,height:10,channels:3,background:'#112244'}}).webp().toBuffer()
 const prepared=await prepareAnalysisRequest({bindingSha256:'a'.repeat(64),messageText:'Visuell referens',images:[{bytes}]})
 const maximum=await quoteAnalysisRequest(prepared)
 expect(maximum).toBe(2.2613)
 f.rates.mockResolvedValue({usd_sek:100})
 await expect(runAnalysisProvider(prepared,{projectId:'p',analysisId:'job',maximumSek:maximum,signal:new AbortController().signal})).rejects.toBeInstanceOf(ProviderNotDispatchedError)
 expect(f.gate).not.toHaveBeenCalled();expect(f.sdk).not.toHaveBeenCalled()
})
it('real factory propagates project budget refusal without constructing the SDK (budget RPC boundary mocked)',async()=>{
 const bytes=await sharp({create:{width:12,height:10,channels:3,background:'#112244'}}).webp().toBuffer()
 const prepared=await prepareAnalysisRequest({bindingSha256:'a'.repeat(64),messageText:'Visuell referens',images:[{bytes}]})
 f.gate.mockRejectedValue(new SpendRefusedError({reason:'budget_exceeded',provider:'anthropic',operation:'reference-analysis'}))
 await expect(runAnalysisProvider(prepared,{projectId:'p',analysisId:'job',maximumSek:2.2613,signal:new AbortController().signal})).rejects.toBeInstanceOf(SpendRefusedError)
 expect(f.gate).toHaveBeenCalledWith(expect.objectContaining({project:{projectId:'p'},ceilingBasis:'token_window',
  execution:{context:'OPERATOR_EXECUTION',scope:{kind:'PROJECT',project:{projectId:'p'}}}}),expect.any(Function))
 expect(f.sdk).not.toHaveBeenCalled()
})
