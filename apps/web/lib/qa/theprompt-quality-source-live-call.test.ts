import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({create:vi.fn()}))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/media/text-client',()=>({
 getMediaTextClient:()=>({messages:{create:mocks.create}}),
}))
import {scoreScript} from '../media/quality'
import {projectScope} from '../governance/execution-stop'

const execution={
 context:'AUTONOMOUS' as const,
 scope:projectScope({projectSlug:'ai-media-automation'}),
}
const sampleResult={
 hook_strength:9,retention_score:9,visual_relevance:9,
 shareability:9,discussion_potential:9,hallucination_risk:9,
 overall:9,passed:true,verdict:'Verifiable claim within source limitations.',
 weak_spots:[],
}
beforeEach(()=>{
 vi.clearAllMocks()
 mocks.create.mockResolvedValue({
  stop_reason:'end_turn',
  content:[{type:'text',text:JSON.stringify(sampleResult)}],
 })
})
describe('The Prompt final AI QA: source evidence actually delivered',()=>{
 it('passes important late numerical evidence and its caveat to the real model request',async()=>{
  const prefix='Official first-party article introduces the scientific research context.'
  const irrelevant=Array.from({length:11},(_,i)=>'Background '+i+': '+'general surrounding context. '.repeat(30))
  const late='The internal adaptive evaluation measured 54.0% on GPT-6 Astra original safeguards and 0.2% on GPT-6.2 Astra updated safeguards. These are two different model versions, not an equivalent model A/B experiment.'
  const source=[prefix,...irrelevant,late].join('\\n\\n')
  const result=await scoreScript(execution,
   'OpenAI internal test 54.0% vs 0.2%',
   'OpenAI reports a comparison of two different model versions.',
   source)
  expect(result.passed).toBe(true)
  expect(mocks.create).toHaveBeenCalledTimes(1)
  const req=mocks.create.mock.calls[0][0]
  const msg=req.messages[0].content as string
  expect(msg).toContain('SOURCE EXCERPTS')
  expect(msg).toContain('54.0%')
  expect(msg).toContain('0.2%')
  expect(msg).toContain('two different model versions')
  expect(msg).toContain('Official first-party article')
  expect(req.system).toContain('hallucination_risk')
  expect(req.system).toContain('BLOCKS publishing')
 })
 it('refuses to call any model with empty source evidence',async()=>{
  const result=await scoreScript(execution,'Interesting claim','Unverified claim','')
  expect(result.passed).toBe(false)
  expect(result.verdict).toContain('No source evidence')
  expect(mocks.create).not.toHaveBeenCalled()
 })
 it('does not turn invalid model output into an approval',async()=>{
  mocks.create.mockResolvedValue({stop_reason:'end_turn',
   content:[{type:'text',text:'{ definitely-not-a-JSON-score'}]})
  const result=await scoreScript(execution,'Claim','Claim','Official source summary')
  expect(result.passed).toBe(false)
  expect(result.hallucination_risk).toBe(0)
 })
})
