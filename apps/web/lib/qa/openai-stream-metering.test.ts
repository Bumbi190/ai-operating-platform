import {beforeEach,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({create:vi.fn(),settle:vi.fn(),reserve:vi.fn(),release:vi.fn(),insert:vi.fn()}))
vi.mock('server-only',()=>({}))
vi.mock('openai',()=>({default:class {chat={completions:{create:state.create}}}}))
vi.mock('@/lib/cost/rates',()=>({getRates:async()=>({usd_sek:10})}))
vi.mock('@/lib/cost/budget-gate',()=>({reserveSpend:state.reserve,settleSpend:state.settle,releaseSpend:state.release,markSpendDispatchIntent:async()=>true,openOverrideReservation:vi.fn()}))
vi.mock('@/lib/governance/execution-stop',async orig=>({...await orig<typeof import('@/lib/governance/execution-stop')>(),resolveExecutionStopForContract:async()=>({allowed:true,context:'OPERATOR_EXECUTION',scopesEvaluated:[],resolution:'RESOLVED',globalPaused:false,projectPaused:false,reason:null,observed:null})}))
vi.mock('@/lib/governance/execution-signal',async orig=>({...await orig<typeof import('@/lib/governance/execution-signal')>(),admitPhysicalRequest:async()=>{},watchExecutionAuthority:()=>({signal:new AbortController().signal,dispose(){},abortReason:null,authorityUnavailable:false})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>({insert:state.insert})})}))
import {openAIChatCompletion} from '@/lib/ai/openai-client'
import {projectScope} from '@/lib/governance/execution-stop'
const ctx={project:{projectId:'proj-1'},execution:{context:'OPERATOR_EXECUTION' as const,scope:projectScope({projectId:'proj-1'})},agent:'Atlas',operation:'Atlas Studio Chat'}
const params={model:'gpt-4o-mini',max_tokens:100,stream:true as const,messages:[{role:'user' as const,content:'Hej'}]}
beforeEach(()=>{
 vi.clearAllMocks();process.env.OPENAI_API_KEY='test-key'
 state.reserve.mockResolvedValue({allowed:true,wouldAllow:true,reason:'ok',reservationId:'res-1',budgetSek:100,headroomSek:100})
 state.settle.mockResolvedValue({settled:true,result:'settled'})
})
it('holds the reservation through streaming and settles actual usage exactly once',async()=>{
 state.create.mockResolvedValue({async *[Symbol.asyncIterator](){yield {choices:[{delta:{content:'Hej'},finish_reason:'stop'}]};yield {choices:[],usage:{prompt_tokens:100,completion_tokens:20}}}})
 const stream=await openAIChatCompletion(ctx,params)
 expect(state.settle).not.toHaveBeenCalled()
 for await(const _ of stream){}
 await vi.waitFor(()=>expect(state.settle).toHaveBeenCalledTimes(1))
 const settlement=state.settle.mock.calls[0][1]
 expect(settlement.kind).toBe('metered')
 expect(settlement.rows).toHaveLength(1)
 expect(settlement.rows[0]).toMatchObject({provider:'openai',tokens_in:100,tokens_out:20,cost_sek:0.0003})
 expect(state.create.mock.calls[0][0].stream_options).toEqual({include_usage:true})
 expect(state.insert).not.toHaveBeenCalled()
})
it('retains the conservative ceiling when an interrupted stream has no complete usage',async()=>{
 state.create.mockResolvedValue({async *[Symbol.asyncIterator](){yield {choices:[{delta:{content:'partial'}}]};throw Error('socket lost')}})
 const stream=await openAIChatCompletion(ctx,params)
 await expect((async()=>{for await(const _ of stream){}})()).rejects.toThrow('socket lost')
 await vi.waitFor(()=>expect(state.settle).toHaveBeenCalledTimes(1))
 expect(state.settle.mock.calls[0][1]).toMatchObject({kind:'estimate_ambiguous',rows:[]})
 expect(state.release).not.toHaveBeenCalled()
})
it('does not treat missing usage as a free call',async()=>{
 state.create.mockResolvedValue({async *[Symbol.asyncIterator](){yield {choices:[{delta:{content:'ok'},finish_reason:'stop'}]}}})
 const stream=await openAIChatCompletion(ctx,params)
 for await(const _ of stream){}
 await vi.waitFor(()=>expect(state.settle).toHaveBeenCalledTimes(1))
 expect(state.settle.mock.calls[0][1]).toMatchObject({kind:'estimate_unmetered',rows:[]})
})
