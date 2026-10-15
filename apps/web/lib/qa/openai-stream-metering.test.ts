import { beforeEach, describe, expect, it, vi } from 'vitest'
const sdk=vi.hoisted(()=>({create:vi.fn()}))
vi.mock('openai',()=>({default:class { chat={completions:{create:sdk.create}} }}))
vi.mock('@/lib/cost/rates',()=>({getRates:async()=>({usd_sek:10})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({})}))
vi.mock('@/lib/cost/governed-spend',async original=>{
 const actual=await original<typeof import('../cost/governed-spend')>()
 return {...actual,withGovernedSpend:async(input:any,run:()=>Promise<unknown>)=>{
  const {SpendMeter,runWithSpendMeter}=await import('../cost/spend-meter')
  scope.meter=new SpendMeter(input.rates)
  return runWithSpendMeter(scope.meter,run)
 }}
})
vi.mock('@/lib/governance/execution-signal',async original=>{
 const actual=await original<typeof import('../governance/execution-signal')>()
 return {...actual,admitPhysicalRequest:async()=>{},authorityForRequest:()=>({}),
  watchExecutionAuthority:()=>({signal:new AbortController().signal,dispose:()=>{},authorityUnavailable:false,abortReason:null})}
})
const scope:{meter?:import('../cost/spend-meter').SpendMeter}={}
const ctx={project:{projectId:'11111111-1111-4111-8111-111111111111'},execution:{context:'OPERATOR_INTERACTIVE',scope:{kind:'GLOBAL_ONLY'}},operation:'Atlas Chat'} as any
async function* chunks(...items:unknown[]){ for(const item of items)yield item }
const request={model:'gpt-4o-mini',max_tokens:100,messages:[{role:'user',content:'Hej'}],stream:true,stream_options:{include_usage:true}} as any
beforeEach(()=>{sdk.create.mockReset();scope.meter=undefined})

describe('OpenAI streamed cost stays inside the governed meter',()=>{
 it('keeps settlement open at handle return and meters actual usage at exhaustion',async()=>{
  sdk.create.mockResolvedValue(chunks({choices:[{delta:{content:'Hej'}}]},
   {choices:[],usage:{prompt_tokens:100,completion_tokens:10}}))
  const {openAIChatCompletion}=await import('../ai/openai-client')
  const stream=await openAIChatCompletion(ctx,request)
  expect(scope.meter!.pendingSettlement).not.toBeNull()
  expect(scope.meter!.rows).toHaveLength(0)
  const received=[]
  for await(const chunk of stream)received.push(chunk)
  await scope.meter!.pendingSettlement
  expect(received).toHaveLength(2)
  expect(scope.meter!.rows).toHaveLength(1)
  expect(scope.meter!.rows[0]).toMatchObject({provider:'openai',model:'gpt-4o-mini',tokens_in:100,tokens_out:10,cost_usd:0.000021})
 })
 it('settles lifetime without inventing usage on early consumer break',async()=>{
  sdk.create.mockResolvedValue(chunks({choices:[{delta:{content:'Hej'}}]}))
  const {openAIChatCompletion}=await import('../ai/openai-client')
  const stream=await openAIChatCompletion(ctx,request)
  expect(scope.meter!.pendingSettlement).not.toBeNull()
  for await(const chunk of stream){expect(chunk).toBeTruthy();break}
  await scope.meter!.pendingSettlement
  expect(scope.meter!.rows).toHaveLength(0)
 })
 it('rejects lifetime on a broken stream and preserves its error',async()=>{
  sdk.create.mockResolvedValue((async function*(){yield {choices:[]};throw new Error('broken stream')})())
  const {openAIChatCompletion}=await import('../ai/openai-client')
  const stream=await openAIChatCompletion(ctx,request)
  expect(scope.meter!.pendingSettlement).not.toBeNull()
  const lifetime=scope.meter!.pendingSettlement!.catch(error=>error)
  await expect((async()=>{for await(const chunk of stream){void chunk}})()).rejects.toThrow('broken stream')
  expect(await lifetime).toMatchObject({message:'broken stream'})
  expect(scope.meter!.rows).toHaveLength(0)
 })
 it('does not meter invalid token counts',async()=>{
  sdk.create.mockResolvedValue(chunks({choices:[],usage:{prompt_tokens:-1,completion_tokens:10}}))
  const {openAIChatCompletion}=await import('../ai/openai-client')
  const stream=await openAIChatCompletion(ctx,request)
  for await(const chunk of stream){void chunk}
  await scope.meter!.pendingSettlement
  expect(scope.meter!.rows).toHaveLength(0)
 })
})

describe('Luna estimator refuses unsupported billing modes before reserving',()=>{
 it('covers the full long-context metered amount at the same rate snapshot',async()=>{
  const {estimateOpenAIChatSek}=await import('../ai/openai-client')
  const {calculateCost}=await import('../ai/pricing')
  const rates={usd_sek:10.5}
  const estimate=await estimateOpenAIChatSek({model:'gpt-6-luna',max_completion_tokens:1200,messages:[],
   service_tier:'default',prompt_cache_options:{mode:'explicit'}},rates)
  expect(estimate).toBeGreaterThanOrEqual(calculateCost('gpt-6-luna',1_050_000,1200)*rates.usd_sek)
 })
 it.each([
  {service_tier:'fast',prompt_cache_options:{mode:'explicit'}},
  {service_tier:'default'},
  {service_tier:'default',prompt_cache_options:{mode:'implicit'}},
  {service_tier:'default',prompt_cache_options:{mode:'explicit'},messages:[{prompt_cache_breakpoint:{mode:'explicit'}}]},
 ])('rejects a request whose pricing is outside the pilot contract',async overrides=>{
  const {estimateOpenAIChatSek}=await import('../ai/openai-client')
  await expect(estimateOpenAIChatSek({model:'gpt-6-luna',max_completion_tokens:1200,messages:[],...overrides},{usd_sek:10}))
   .rejects.toMatchObject({reason:'unbounded_spend'})
 })
})
