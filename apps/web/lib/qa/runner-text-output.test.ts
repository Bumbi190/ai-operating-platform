import {beforeEach,describe,expect,it,vi} from 'vitest'
const sdk=vi.hoisted(()=>({anthropic:vi.fn(),openai:vi.fn(),final:vi.fn()}))
vi.mock('@/lib/ai/anthropic',()=>({getAnthropic:()=>({messages:{create:sdk.anthropic,stream:async()=>({async *[Symbol.asyncIterator](){yield {type:'content_block_delta',delta:{type:'text_delta',text:'streamed'}}},finalMessage:sdk.final})}})}))
vi.mock('@/lib/ai/openai-client',()=>({openAIChatCompletion:sdk.openai,openAIImageEdit:vi.fn(),openAIImageGenerate:vi.fn()}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({})}))
import {runStep} from '@/lib/ai/runner'
import {GLOBAL_ONLY} from '@/lib/governance/execution-stop'
const input={systemPrompt:'Build',userMessage:'A site',execution:{context:'OPERATOR_INTERACTIVE' as const,scope:GLOBAL_ONLY}}
beforeEach(()=>vi.clearAllMocks())
describe('text provider completion metadata',()=>{
 it('keeps all Anthropic text blocks and the actual truncation reason',async()=>{
  sdk.anthropic.mockResolvedValue({content:[{type:'text',text:'first'},{type:'text',text:'second'}],stop_reason:'max_tokens',usage:{input_tokens:10,output_tokens:20}})
  const result=await runStep({...input,model:'claude-sonnet-4-6'})
  expect(result.content).toBe('firstsecond')
  expect(result.stopReason).toBe('max_tokens')
  expect(result.tokensOut).toBe(20)
 })
 it('keeps Anthropic streaming termination after finalMessage',async()=>{
  sdk.final.mockResolvedValue({stop_reason:'max_tokens',usage:{input_tokens:10,output_tokens:20}})
  const result=await runStep({...input,model:'claude-sonnet-4-6'},()=>{})
  expect(result.content).toBe('streamed')
  expect(result.stopReason).toBe('max_tokens')
 })
 it('keeps OpenAI length termination on a non-streamed response',async()=>{
  sdk.openai.mockResolvedValue({choices:[{message:{content:'partial'},finish_reason:'length'}],usage:{prompt_tokens:10,completion_tokens:20}})
  const result=await runStep({...input,model:'gpt-4o'})
  expect(result.content).toBe('partial')
  expect(result.stopReason).toBe('length')
 })
 it('keeps OpenAI termination from the final streaming chunk',async()=>{
  sdk.openai.mockResolvedValue({async *[Symbol.asyncIterator](){yield {choices:[{delta:{content:'partial'},finish_reason:null}]};yield {choices:[{delta:{},finish_reason:'length'}]}}})
  const result=await runStep({...input,model:'gpt-4o'},()=>{})
  expect(result.content).toBe('partial')
  expect(result.stopReason).toBe('length')
 })
})
