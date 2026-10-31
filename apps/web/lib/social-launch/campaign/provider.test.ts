import {beforeEach,expect,it,vi} from 'vitest'
const mock=vi.hoisted(()=>({rates:vi.fn(),estimate:vi.fn(),spend:vi.fn(),admit:vi.fn(),watch:vi.fn(),log:vi.fn(),gate:vi.fn()}))
vi.mock('@/lib/cost/rates',()=>({getRates:mock.rates}))
vi.mock('@/lib/cost/current-image-rates',()=>({getCurrentImageRates:mock.rates}))
vi.mock('@/lib/cost/budget-gate',()=>({estimateImageSek:mock.estimate}))
vi.mock('@/lib/cost/spend-gate-flag',()=>({isSpendGateEnforced:mock.gate}))
vi.mock('@/lib/cost/track',()=>({logImageCost:mock.log}))
vi.mock('@/lib/cost/governed-spend',async original=>({...await original<typeof import('@/lib/cost/governed-spend')>(),withGovernedSpend:mock.spend}))
vi.mock('@/lib/governance/execution-signal',async original=>({...await original<typeof import('@/lib/governance/execution-signal')>(),admitPhysicalRequest:mock.admit,watchExecutionAuthority:mock.watch}))
import {generateIdeogramV3} from '@/lib/media/image-client'
const ctx={project:{projectId:'p'},operation:'campaign',execution:{context:'AUTONOMOUS',scope:{kind:'PROJECT',project:{projectId:'p'}}},authority:{kind:'RUN_BOUND',runId:'r',claimId:'c'}} as const
const limits=()=>({maxEstimatedSek:1,signal:new AbortController().signal,timeoutMs:5000})
let dispose:ReturnType<typeof vi.fn>,controller:AbortController
beforeEach(()=>{
 vi.restoreAllMocks();vi.clearAllMocks();vi.stubEnv('IDEOGRAM_API_KEY','test-only')
 mock.rates.mockResolvedValue({});mock.estimate.mockResolvedValue(0.9);mock.gate.mockReturnValue(true)
 mock.spend.mockImplementation(async(_,fn)=>fn());mock.admit.mockResolvedValue(undefined)
 controller=new AbortController();dispose=vi.fn()
 mock.watch.mockReturnValue({signal:controller.signal,abortReason:null,authorityUnavailable:false,dispose})
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({data:[{url:'https://cdn.example/image.png'}]})))
})
it('fresh internal price above allocated ceiling refuses before reserve or HTTP',async()=>{
 mock.estimate.mockResolvedValue(1.00001)
 await expect(generateIdeogramV3(ctx,{prompt:'dealer'},limits())).rejects.toThrow()
 expect(mock.spend).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
})
it('advisory spend gate or missing run claim cannot reach HTTP',async()=>{
 mock.gate.mockReturnValue(false);await expect(generateIdeogramV3(ctx,{},limits())).rejects.toThrow();expect(fetch).not.toHaveBeenCalled()
 mock.gate.mockReturnValue(true);await expect(generateIdeogramV3({...ctx,authority:undefined},{},limits())).rejects.toThrow();expect(fetch).not.toHaveBeenCalled()
})
it('physical admission is current, signal watched through body and always disposed',async()=>{
 let read=false
 vi.mocked(fetch).mockImplementation(async(_url,init)=>{expect(mock.admit).toHaveBeenCalled();expect(init?.redirect).toBe('error');expect(init?.signal).toBeInstanceOf(AbortSignal);return {ok:true,json:async()=>{expect(dispose).not.toHaveBeenCalled();read=true;return {data:[{url:'https://cdn.example/image.png'}]}}} as Response})
 await expect(generateIdeogramV3(ctx,{},limits())).resolves.toContain('https://')
 expect(read).toBe(true);expect(dispose).toHaveBeenCalledTimes(1)
})
it('abort during successful response body is uncertain, never a safe retry',async()=>{
 vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>{controller.abort();throw new Error('body timeout')}} as unknown as Response)
 await expect(generateIdeogramV3(ctx,{},limits())).rejects.toMatchObject({name:'ProviderDispatchUnknownError'})
 expect(dispose).toHaveBeenCalledTimes(1);expect(fetch).toHaveBeenCalledTimes(1)
})

it('rechecks campaign plan/profile authority at the physical provider boundary',async()=>{
 const beforeDispatch=vi.fn().mockRejectedValue(new Error('profile changed'))
 await expect(generateIdeogramV3(ctx,{}, {...limits(),beforeDispatch})).rejects.toThrow()
 expect(beforeDispatch).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled()
})

it('uses the documented V3 multipart contract only for the constrained campaign path',async()=>{
 await generateIdeogramV3(ctx,{prompt:'A dealer',rendering_speed:'TURBO',num_images:1,aspect_ratio:'1x1'},limits())
 const init=vi.mocked(fetch).mock.calls[0][1]!
 expect(init.body).toBeInstanceOf(FormData)
 expect(new Headers(init.headers).has('Content-Type')).toBe(false)
 expect((init.body as FormData).get('prompt')).toBe('A dealer')
})

it('a live rate increase at physical admission cannot use the earlier cheaper reservation',async()=>{
 mock.rates.mockResolvedValueOnce({price:0.8}).mockResolvedValueOnce({price:0.9})
 mock.estimate.mockImplementation(async(_n,_provider,rates)=>rates.price)
 await expect(generateIdeogramV3(ctx,{prompt:'dealer'},limits())).rejects.toMatchObject({name:'ProviderNotDispatchedError'})
 expect(mock.rates).toHaveBeenCalledTimes(2);expect(fetch).not.toHaveBeenCalled()
})
it('an unreadable physical-boundary price refuses before HTTP even after successful reservation',async()=>{
 mock.rates.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('database unavailable'))
 await expect(generateIdeogramV3(ctx,{prompt:'dealer'},limits())).rejects.toMatchObject({name:'ProviderNotDispatchedError'})
 expect(fetch).not.toHaveBeenCalled()
})
