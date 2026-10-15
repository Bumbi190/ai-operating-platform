import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { calculateCost } from '../ai/pricing'
import { tokenWindowCeiling } from '../cost/spend-ceiling'
import { classifyAtlasProviderError, getAtlasServiceErrorMessage } from '../atlas/provider-errors'
import { OpenAIPilotBudget, createAtlasOpenAIStream, resolveAtlasChatProvider, isAtlasOpenAIReadTool } from '../atlas/openai-chat'

const boundary = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('@/lib/ai/openai-client', () => ({ openAIChatCompletion: boundary.call }))
const ctx = { project: {projectId:'11111111-1111-4111-8111-111111111111'}, execution:{context:'OPERATOR_INTERACTIVE',scope:{kind:'GLOBAL_ONLY'}}, operation:'Atlas Chat' } as any
const params = (overrides: Record<string, unknown> = {}) => ({
 model:'claude-sonnet-4-6', max_tokens:4096, system:'Svara på svenska. [PROJECT RECALL] Godkänd källa.',
 messages:[{role:'user',content:'Hur länge kör testpasset?'}],
 tools:[{name:'navigate',description:'Navigera',input_schema:{type:'object',properties:{id:{type:'string'}},required:['id']}}],
 ...overrides,
}) as Anthropic.MessageStreamParams
async function* chunks(...items: unknown[]) { for (const item of items) yield item }
const textChunk = (content: string, finish_reason: string | null = null) => ({choices:[{index:0,delta:{content},finish_reason}]})
const usage = (input=100, output=10) => ({choices:[], usage:{prompt_tokens:input,completion_tokens:output,total_tokens:input+output}})

beforeEach(() => { boundary.call.mockReset() })

describe('local Atlas OpenAI pilot', () => {
 it('keeps Anthropic as the default and rejects unknown providers', () => {
  expect(resolveAtlasChatProvider({})).toBe('anthropic')
  expect(resolveAtlasChatProvider({ATLAS_CHAT_PROVIDER:'openai'})).toBe('openai')
  expect(() => resolveAtlasChatProvider({ATLAS_CHAT_PROVIDER:'deepseek'})).toThrow()
 })
 it('streams Swedish text through the governed boundary and sends the existing recall unchanged', async () => {
  boundary.call.mockResolvedValue(chunks(textChunk('Testpasset '),textChunk('kör i 30 minuter.','stop'),usage()))
  const client = createAtlasOpenAIStream(ctx, params(), new OpenAIPilotBudget(1))
  const text: string[] = []
  client.on('text', delta => text.push(delta))
  const result = await client.finalMessage()
  expect(text).toEqual(['Testpasset ','kör i 30 minuter.'])
  expect(result).toMatchObject({stop_reason:'end_turn',content:[{type:'text',text:'Testpasset kör i 30 minuter.'}]})
  const [governance, request] = boundary.call.mock.calls[0]
  expect(governance).toBe(ctx)
  expect(request).toMatchObject({model:'gpt-6-luna',reasoning_effort:'none',max_completion_tokens:1200,
    stream:true,stream_options:{include_usage:true},service_tier:'default',store:false,prompt_cache_options:{mode:'explicit'}})
  expect(request.messages[0]).toEqual({role:'developer',content:params().system})
  expect(request.messages[1]).toEqual({role:'user',content:'Hur länge kör testpasset?'})
 })
 it('runs one physical completion when finalMessage is observed twice', async () => {
  boundary.call.mockResolvedValue(chunks(textChunk('Hej','stop'),usage()))
  const stream = createAtlasOpenAIStream(ctx, params(), new OpenAIPilotBudget(1))
  await Promise.all([stream.finalMessage(),stream.finalMessage()])
  expect(boundary.call).toHaveBeenCalledTimes(1)
 })
 it('preserves forced navigation, tool call ids, split arguments and the next tool result', async () => {
  boundary.call.mockResolvedValueOnce(chunks(
   {choices:[{index:0,delta:{tool_calls:[{index:0,id:'call_nav',type:'function',function:{name:'navigate',arguments:'{"id":'}}]},finish_reason:null}]},
   {choices:[{index:0,delta:{tool_calls:[{index:0,function:{arguments:'"approvals"}'}}]},finish_reason:'tool_calls'}]},usage()))
  const first = await createAtlasOpenAIStream(ctx,params({tool_choice:{type:'tool',name:'navigate'}}),new OpenAIPilotBudget(1)).finalMessage()
  expect(first).toEqual({stop_reason:'tool_use',content:[{type:'tool_use',id:'call_nav',name:'navigate',input:{id:'approvals'}}]})
  expect(boundary.call.mock.calls[0][1].tool_choice).toEqual({type:'function',function:{name:'navigate'}})
  boundary.call.mockResolvedValueOnce(chunks(textChunk('Öppnat.','stop'),usage()))
  await createAtlasOpenAIStream(ctx,params({messages:[...params().messages,
   {role:'assistant',content:first.content},{role:'user',content:[{type:'tool_result',tool_use_id:'call_nav',content:'{"ok":true}'}]}]}),
   new OpenAIPilotBudget(1)).finalMessage()
  const sent=boundary.call.mock.calls[1][1].messages
  expect(sent[2]).toMatchObject({role:'assistant',tool_calls:[{id:'call_nav',function:{name:'navigate',arguments:'{"id":"approvals"}'}}]})
  expect(sent[3]).toEqual({role:'tool',tool_call_id:'call_nav',content:'{"ok":true}'})
 })
 it.each(['trigger_workflow','ask_manager','start_website_build','delegate','run_media_step'])('does not offer the paid/action tool %s', async name => {
  expect(isAtlasOpenAIReadTool(name)).toBe(false)
  boundary.call.mockResolvedValue(chunks(textChunk('Läsning.','stop'),usage()))
  await createAtlasOpenAIStream(ctx,params({tools:[...params().tools!,{name,input_schema:{type:'object'}}]}),new OpenAIPilotBudget(1)).finalMessage()
  expect(boundary.call.mock.calls[0][1].tools.map((t:any)=>t.function.name)).toEqual(['navigate'])
 })
 it('refuses unsupported attachments before dispatch instead of dropping them', async () => {
  await expect(createAtlasOpenAIStream(ctx,params({messages:[{role:'user',content:[{type:'image',source:{}}]}]}),
   new OpenAIPilotBudget(1)).finalMessage()).rejects.toThrow()
  expect(boundary.call).not.toHaveBeenCalled()
 })
 it.each(['{"id":','[]'])('refuses malformed tool arguments %s without executing a tool', async argumentsText => {
  boundary.call.mockResolvedValue(chunks({choices:[{index:0,delta:{tool_calls:[{index:0,id:'bad',type:'function',function:{name:'navigate',arguments:argumentsText}}]},finish_reason:'tool_calls'}]},usage()))
  await expect(createAtlasOpenAIStream(ctx,params(),new OpenAIPilotBudget(1)).finalMessage()).rejects.toThrow()
 })
 it('rejects an unadvertised tool, a truncated tool call, or an unfinished stream', async () => {
  for (const source of [
   chunks({choices:[{index:0,delta:{tool_calls:[{index:0,id:'bad',function:{name:'trigger_workflow',arguments:'{}'}}]},finish_reason:'tool_calls'}]},usage()),
   chunks({choices:[{index:0,delta:{tool_calls:[{index:0,id:'cut',function:{name:'navigate',arguments:'{}'}}]},finish_reason:'length'}]},usage()), chunks(textChunk('Ofärdigt'),usage()),
  ]) {
   boundary.call.mockResolvedValueOnce(source)
   await expect(createAtlasOpenAIStream(ctx,params(),new OpenAIPilotBudget(1)).finalMessage()).rejects.toThrow()
  }
 })
 it('finishes capped text normally while preserving max_tokens as the stop reason', async () => {
  boundary.call.mockResolvedValue(chunks(textChunk('Ett begränsat textsvar.','length'),usage()))
  const result=await createAtlasOpenAIStream(ctx,params({max_tokens:150}),new OpenAIPilotBudget(1)).finalMessage()
  expect(result).toMatchObject({stop_reason:'max_tokens',content:[{type:'text',text:'Ett begränsat textsvar.'}]})
 })
 it('passes cancellation through and never falls back to Anthropic', async () => {
  const abort = new AbortController()
  boundary.call.mockRejectedValueOnce(Object.assign(new Error('insufficient_quota'),{status:429,code:'insufficient_quota'}))
  await expect(createAtlasOpenAIStream(ctx,params(),new OpenAIPilotBudget(1),abort.signal).finalMessage()).rejects.toMatchObject({code:'insufficient_quota'})
  expect(boundary.call).toHaveBeenCalledTimes(1)
  expect(boundary.call.mock.calls[0][2].signal).toBe(abort.signal)
 })
})

describe('local pilot budget: process lifetime, shared across requests', () => {
 it('reserves before dispatch, protects concurrent requests and stops at the limit', () => {
  const budget=new OpenAIPilotBudget(1)
  const first=budget.reserve(0.6)
  expect(()=>budget.reserve(0.6)).toThrow()
  first(0.01)
  const second=budget.reserve(0.6)
  second()
  expect(()=>budget.reserve(0.4)).toThrow()
 })
 it('settles once and keeps the ceiling for ambiguous/missing usage', () => {
  const budget=new OpenAIPilotBudget(1), finish=budget.reserve(0.6)
  finish(); finish(0)
  expect(()=>budget.reserve(0.5)).toThrow()
 })
 it.each([0,-1,Number.NaN,Number.POSITIVE_INFINITY])('rejects an invalid limit %s', limit => {
  expect(()=>new OpenAIPilotBudget(limit)).toThrow()
 })
 it('refuses before the API when there is insufficient pilot headroom', async () => {
  await expect(createAtlasOpenAIStream(ctx,params(),new OpenAIPilotBudget(0.001)).finalMessage()).rejects.toMatchObject({code:'ATLAS_PILOT_BUDGET_EXHAUSTED'})
  expect(boundary.call).not.toHaveBeenCalled()
 })
})

describe('Luna pricing and controlled provider errors', () => {
 it('prices short context and the full long-context request at their documented rates', () => {
  expect(calculateCost('gpt-6-luna',10_000,1_000)).toBeCloseTo(0.0015)
  expect(calculateCost('gpt-6-luna',272_000,1_000)).toBeCloseTo(0.0277)
  expect(calculateCost('gpt-6-luna',272_001,1_000)).toBeCloseTo(0.0551502)
  const ceiling=tokenWindowCeiling('gpt-6-luna',1200,{usd_sek:10})
  expect(ceiling.ok).toBe(true)
  if (ceiling.ok) expect(ceiling.sek).toBeCloseTo(2.109, 10)
 })
 it.each([
  [{status:429,code:'insufficient_quota'},'ATLAS_OPENAI_INSUFFICIENT_CREDITS'],
  [{status:429,code:'rate_limit_exceeded'},'ATLAS_PROVIDER_REQUEST_FAILED'],
  [{status:401,message:'Invalid API key'},'ATLAS_PROVIDER_AUTHENTICATION_FAILED'],
  [{code:'ATLAS_PILOT_BUDGET_EXHAUSTED'},'ATLAS_PILOT_BUDGET_EXHAUSTED'],
 ])('classifies OpenAI failure without exposing raw provider text', (error,expected) => {
  expect(classifyAtlasProviderError(error,'openai')).toBe(expected)
  expect(getAtlasServiceErrorMessage(expected as any)).not.toContain('sk-')
 })
})
