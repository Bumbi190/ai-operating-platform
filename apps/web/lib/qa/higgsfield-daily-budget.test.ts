import {beforeEach,describe,expect,it,vi} from 'vitest'
vi.mock('../supabase/admin',()=>({createAdminClient:()=>{throw Error('Use injected DB')}}))
vi.mock('../cost/spend-gate-flag',()=>({isSpendGateEnforced:()=>false}))
import {ceilingForHiggsfieldCredits,readHiggsfieldDailyBudget,
 reserveHiggsfieldDailyBudget,HiggsfieldDailyBudgetRefusal,
 HIGGSFIELD_DAILY_LIMIT_SEK,HIGGSFIELD_CONSERVATIVE_SEK_PER_CREDIT,
} from '../media/higgsfield/daily-budget'
const projectId='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const requestId='00000000-0000-4000-8000-000000000001'
const response={allowed:true,reason:'reserved',reserved_sek:4,remaining_sek:1}
const rpc=vi.fn()
const db={rpc}
const enabled={db,paidEnabled:true,hardGate:true}
beforeEach(()=>{vi.clearAllMocks();rpc.mockResolvedValue({data:response,error:null})})

describe('Higgsfield 5 SEK/day conservative admission',()=>{
 it('values the 4-credit quote as 4 SEK with ample upper bound',()=>{
  expect(HIGGSFIELD_DAILY_LIMIT_SEK).toBe(5)
  expect(HIGGSFIELD_CONSERVATIVE_SEK_PER_CREDIT).toBe(1)
  expect(ceilingForHiggsfieldCredits(4)).toBe(4)
  expect(ceilingForHiggsfieldCredits(.125)).toBe(.13)
 })
 it.each([0,-1,6,NaN,Infinity,'4',null,undefined])('refuses unknown or unaffordable credit quote %s',quote=>{
  expect(()=>ceilingForHiggsfieldCredits(quote)).toThrow('HIGGSFIELD_DAILY_BUDGET_REFUSED')
 })
 it('refuses if the paid-video flag is absent even when the global gate is on',async()=>{
  await expect(reserveHiggsfieldDailyBudget({projectId,quoteCredits:4},{db,paidEnabled:false,hardGate:true}))
   .rejects.toMatchObject({reason:'disabled'})
  expect(rpc).not.toHaveBeenCalled()
 })
 it('refuses advisory spend-gate mode even when the provider switch is enabled',async()=>{
  await expect(reserveHiggsfieldDailyBudget({projectId,quoteCredits:4},{db,paidEnabled:true,hardGate:false}))
   .rejects.toMatchObject({reason:'disabled'})
  expect(rpc).not.toHaveBeenCalled()
 })
 it('reserves a unique request against the ONE global SQL RPC, never dispatches media',async()=>{
  expect(await reserveHiggsfieldDailyBudget({projectId,requestId,quoteCredits:4},enabled))
   .toEqual({reservationId:requestId,ceilingSek:4,remainingSek:1})
  expect(rpc).toHaveBeenCalledTimes(1)
  expect(rpc).toHaveBeenCalledWith('higgsfield_daily_budget_reserve',{
   p_request_id:requestId,p_project_id:projectId,p_quoted_credits:4,
  })
 })
 it('refuses non-UUID project or invalid request identity before SQL',async()=>{
  await expect(reserveHiggsfieldDailyBudget({projectId:'bad',quoteCredits:4},enabled))
   .rejects.toMatchObject({reason:'wrong_project'})
  await expect(reserveHiggsfieldDailyBudget({projectId,requestId:'not-uuid',quoteCredits:4},enabled))
   .rejects.toMatchObject({reason:'invalid_request'})
  expect(rpc).not.toHaveBeenCalled()
 })
 it.each(['daily_limit','wrong_project','replay','invalid_request','single_request_exceeds_day'])
 ('never overrides an SQL refusal: %s',async reason=>{
  rpc.mockResolvedValueOnce({data:{allowed:false,reason},error:null})
  await expect(reserveHiggsfieldDailyBudget({projectId,requestId,quoteCredits:4},enabled))
   .rejects.toMatchObject({reason})
 })
 it('fails closed if database errors, unknown responses, or a wrong ceiling appear',async()=>{
  rpc.mockResolvedValueOnce({data:null,error:{message:'secret'}})
  await expect(reserveHiggsfieldDailyBudget({projectId,quoteCredits:4},enabled))
   .rejects.toMatchObject({reason:'database_unavailable'})
  rpc.mockResolvedValueOnce({data:{allowed:true,reason:'reserved',reserved_sek:2,remaining_sek:3},error:null})
  await expect(reserveHiggsfieldDailyBudget({projectId,quoteCredits:4},enabled))
   .rejects.toMatchObject({reason:'database_unavailable'})
 })
 it('exposes only trusted read-only snapshots and refuses corrupt totals',async()=>{
  rpc.mockResolvedValueOnce({data:{day:'2026-10-26',budget_sek:5,reserved_sek:4,reserved_credits:4,remaining_sek:1,
   paid_generation_enabled:false},error:null})
  expect(await readHiggsfieldDailyBudget(db)).toEqual({
   day:'2026-10-26',budgetSek:5,reservedSek:4,reservedCredits:4,remainingSek:1,paidGenerationEnabled:false,
  })
  rpc.mockResolvedValueOnce({data:{day:'2026-10-26',budget_sek:5,reserved_sek:5,reserved_credits:4,remaining_sek:5},error:null})
  await expect(readHiggsfieldDailyBudget(db)).rejects.toBeInstanceOf(HiggsfieldDailyBudgetRefusal)
 })
})
