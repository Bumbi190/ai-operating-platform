import {beforeEach,expect,it,vi} from 'vitest'
const s=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:s.rpc})}))
import {markSpendDispatchIntent} from '@/lib/cost/budget-gate'
beforeEach(()=>{s.rpc.mockReset();s.rpc.mockResolvedValue({data:true,error:null})})
it('passes the pinned provider FX rate to the atomic intent gate',async()=>{
 await markSpendDispatchIntent('reservation','token','token_window',{usd_sek:10.5})
 expect(s.rpc).toHaveBeenCalledWith('budget_mark_dispatch_intent',expect.objectContaining({p_usd_sek:10.5}))
})
it('sends null for unavailable FX; SQL can still allow an uncapped project but must refuse a capped one',async()=>{
 await markSpendDispatchIntent('reservation','token','internal_fixed')
 expect(s.rpc).toHaveBeenCalledWith('budget_mark_dispatch_intent',expect.objectContaining({p_usd_sek:null}))
})
it.each([null,false,'true',{},[]])('does not mistake malformed/refused intent for admission: %j',async(data)=>{
 s.rpc.mockResolvedValue({data,error:null})
 expect(await markSpendDispatchIntent('reservation','token','token_window')).toBe(false)
})
it('does not dispatch after a database error or lost response',async()=>{
 s.rpc.mockRejectedValue(Error('lost'))
 expect(await markSpendDispatchIntent('reservation','token','token_window')).toBe(false)
 s.rpc.mockResolvedValue({data:true,error:{message:'private'}})
 expect(await markSpendDispatchIntent('reservation','token','token_window')).toBe(false)
})
