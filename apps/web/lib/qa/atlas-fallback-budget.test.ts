import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ createAdmin: vi.fn(), rates: vi.fn(), resolve: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mock.createAdmin }))
vi.mock('@/lib/cost/rates', () => ({ getRates: mock.rates }))
vi.mock('@/lib/cost/governed-spend', () => ({ resolveGovernedProjectId: mock.resolve }))
import {
  estimateAtlasReserveSek, reserveAtlasFallback, AtlasReserveRefused,
  ATLAS_RESERVE_DAY_SEK, ATLAS_RESERVE_MONTH_SEK,
} from '../media/atlas-fallback-budget'

const ID='11111111-1111-4111-8111-111111111111'
const ctx: any = { project:{projectId:ID},
  execution:{context:'AUTONOMOUS',scope:{kind:'PROJECT',project:{projectId:ID}}},
  operation:'Dream Analysis',agent:'Dream' }
const params = {max_tokens:512,system:'Brief system',
  messages:[{role:'user',content:'Audit these records'}, {role:'assistant',content:'Prior notes'}]}
const rates=async()=>({usd_sek:10.5})
const rpc=vi.fn()
beforeEach(()=>{
  vi.clearAllMocks()
  vi.stubEnv('ATLAS_TEXT_FAILOVER_ENABLED','true')
  vi.stubEnv('H1_SPEND_GATE','1')
  mock.createAdmin.mockReturnValue({rpc})
  mock.rates.mockImplementation(rates)
  mock.resolve.mockResolvedValue({ok:true,projectId:ID})
  rpc.mockResolvedValue({data:{allowed:true,reason:'reserved'},error:null})
})
afterEach(()=>vi.unstubAllEnvs())

describe('shared Atlas fallback allowance: 10 SEK/day and 100 SEK/month',()=>{
  it('uses conservative price rates with a positive minimum, not the cheaper provider price',async()=>{
    const n=await estimateAtlasReserveSek(params,rates)
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThan(ATLAS_RESERVE_DAY_SEK)
    expect(ATLAS_RESERVE_DAY_SEK).toBe(10)
    expect(ATLAS_RESERVE_MONTH_SEK).toBe(100)
    expect(n*100).toBeCloseTo(Math.round(n*100))
  })
  it('refuses unbounded input, empty requests and outsized completion budgets',async()=>{
    await expect(estimateAtlasReserveSek({...params,messages:[{role:'user',content:'a'.repeat(25000)}]},rates))
      .rejects.toMatchObject({reason:'input_too_large'})
    await expect(estimateAtlasReserveSek({...params,max_tokens:8000},rates))
      .rejects.toMatchObject({reason:'invalid_envelope'})
    await expect(estimateAtlasReserveSek({...params,messages:[]},rates))
      .rejects.toMatchObject({reason:'invalid_envelope'})
  })
  it('sends a unique opaque request and project-verified task to the server RPC',async()=>{
    await reserveAtlasFallback(ctx,'dream',params,{requestId:()=> 'a1668fa5-0d19-4289-a7a0-dfe111111111'})
    expect(mock.resolve).toHaveBeenCalledWith({projectId:ID})
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('atlas_fallback_reserve',expect.objectContaining({
      p_request_id:'a1668fa5-0d19-4289-a7a0-dfe111111111',
      p_project_id:ID,p_task_kind:'dream',p_ceiling_sek:expect.any(Number),
    }))
  })
  it('refuses missing hard spend gate without SQL or any paid call',async()=>{
    vi.stubEnv('H1_SPEND_GATE','0')
    await expect(reserveAtlasFallback(ctx,'news',params)).rejects.toMatchObject({reason:'disabled'})
    expect(rpc).not.toHaveBeenCalled()
  })
  it('refuses when feature flag is OFF',async()=>{
    vi.stubEnv('ATLAS_TEXT_FAILOVER_ENABLED','false')
    await expect(reserveAtlasFallback(ctx,'news',params)).rejects.toBeInstanceOf(AtlasReserveRefused)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('refuses every DB budget rejection and unexpected SQL error',async()=>{
    for(const reason of ['daily_limit','monthly_limit','replay','wrong_project']){
      rpc.mockResolvedValueOnce({data:{allowed:false,reason},error:null})
      await expect(reserveAtlasFallback(ctx,'dream',params)).rejects.toMatchObject({reason})
    }
    rpc.mockResolvedValueOnce({data:null,error:{code:'42501'}})
    await expect(reserveAtlasFallback(ctx,'dream',params)).rejects.toMatchObject({reason:'database_unavailable'})
    expect(rpc).toHaveBeenCalledTimes(5)
  })
  it('refuses missing or unknown project even with money available',async()=>{
    mock.resolve.mockResolvedValueOnce({ok:false,reason:'not_found'})
    await expect(reserveAtlasFallback(ctx,'dream',params)).rejects.toMatchObject({reason:'project_unavailable'})
    expect(rpc).not.toHaveBeenCalled()
  })
  it('is conservative when price data is invalid or the single cap is exceeded',async()=>{
    await expect(estimateAtlasReserveSek(params,async()=>({usd_sek:NaN})))
      .rejects.toMatchObject({reason:'price_unavailable'})
    await expect(estimateAtlasReserveSek({...params,max_tokens:4096,
      messages:[{role:'user',content:'x'.repeat(24500)}]},async()=>({usd_sek:100})))
      .rejects.toMatchObject({reason:'single_request_exceeds_day'})
  })
})
