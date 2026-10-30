import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { projectScope, GLOBAL_ONLY } from '@/lib/governance/execution-stop'

const mocks = vi.hoisted(() => ({ anthropic: vi.fn(), openai: vi.fn(), reserve: vi.fn() }))
vi.mock('@/lib/ai/anthropic', () => ({ getAnthropic: () => ({ messages: { create: mocks.anthropic } }) }))
vi.mock('@/lib/ai/openai-client', () => ({ openAIChatCompletion: mocks.openai }))
vi.mock('@/lib/media/atlas-fallback-budget', () => ({ reserveAtlasFallback: mocks.reserve }))

import { getMediaTextClient } from '@/lib/media/text-client'
import { canRouteTextFailure, isAutomaticTextFailoverAllowed } from '@/lib/media/model-failover-policy'
const ID = '11111111-1111-4111-8111-111111111111'
const otherID = '22222222-2222-4222-8222-222222222222'
const news = { project: { projectId: ID }, verifiedProjectSlug: 'ai-media-automation',
  execution: { context: 'AUTONOMOUS' as const, scope: projectScope({projectId: ID}) },
  agent: 'News Hunter', operation: 'Analyze News' }
const briefing = { project: {projectSlug:'ai-media-automation'},
  execution: {context:'AUTONOMOUS' as const,scope:GLOBAL_ONLY},
  agent:'CFO Briefing',operation:'Morning Briefing' }
const dream = { project:{projectId:ID},
  execution:{context:'AUTONOMOUS' as const,scope:projectScope({projectId:ID})},
  agent:'Dream',operation:'Dream Analysis' }
const input={model:'claude-sonnet-4-6',max_tokens:512,temperature:0.3,
  system:'Reply with valid JSON',messages:[{role:'user' as const,content:'Summarize report'}]}
const completion={ choices:[{finish_reason:'stop',message:{content:'{"insights":[],"summary":"ok"}',refusal:null}}] }
const rejected=(status:number,type:string,message:string)=>Object.assign(new Error('provider rejected'),{
  status,error:{type:'error',error:{type,message}},
})
const badKey=()=>rejected(401,'authentication_error','invalid x-api-key')
const credits=()=>rejected(400,'invalid_request_error','Your credit balance is too low to access the Anthropic API. Go to billing.')
beforeEach(()=>{
  vi.clearAllMocks()
  vi.stubEnv('ATLAS_TEXT_FAILOVER_ENABLED','true')
  vi.stubEnv('H1_SPEND_GATE','1')
  vi.stubEnv('OPENAI_API_KEY','synthetic')
  vi.stubEnv('ANTHROPIC_API_KEY','synthetic-primary')
  vi.stubEnv('MEDIA_NEWS_ANTHROPIC_AUTH_FALLBACK_ENABLED','false')
  mocks.openai.mockResolvedValue(completion)
  mocks.reserve.mockResolvedValue(undefined)
  vi.spyOn(console,'warn').mockImplementation(()=>{})
})
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks()})

describe('governed Atlas model failover, operator opt-in',()=>{
 it('does not switch if Anthropic succeeded',async()=>{
   const direct={content:[{type:'text',text:'first provider'}],stop_reason:'end_turn'}
   mocks.anthropic.mockResolvedValue(direct)
   expect(await getMediaTextClient(briefing).messages.create(input)).toBe(direct)
   expect(mocks.openai).not.toHaveBeenCalled()
 })
 it.each([
   ['News Hunter',news,badKey],
   ['CFO Briefing',briefing,credits],
   ['Dream',dream,badKey],
 ])('routes confirmed unbilled error in %s to exactly one governed small model',async(_label,ctx,error)=>{
   mocks.anthropic.mockRejectedValue(error())
   const r=await getMediaTextClient(ctx).messages.create(input)
   expect(r.content[0]).toMatchObject({type:'text',text:'{"insights":[],"summary":"ok"}'})
   expect(r.stop_reason).toBe('end_turn')
   expect(mocks.anthropic).toHaveBeenCalledTimes(1)
   expect(mocks.openai).toHaveBeenCalledTimes(1)
   expect(mocks.reserve).toHaveBeenCalledTimes(1)
   expect(mocks.openai).toHaveBeenCalledWith(ctx,expect.objectContaining({
     model:'gpt-5.4-mini',max_completion_tokens:512,reasoning_effort:'none',
   }))
 })
 it('selects the reserve without calling an absent primary key',async()=>{
   vi.stubEnv('ANTHROPIC_API_KEY','')
   const r=await getMediaTextClient(briefing).messages.create(input)
   expect(r.stop_reason).toBe('end_turn')
   expect(mocks.anthropic).not.toHaveBeenCalled()
   expect(mocks.openai).toHaveBeenCalledTimes(1)
 })
 it('does not enable a new Dream or briefing paid fallback before opt-in',async()=>{
   vi.stubEnv('ATLAS_TEXT_FAILOVER_ENABLED','false')
   for(const ctx of [dream,briefing]){
     mocks.anthropic.mockRejectedValueOnce(credits())
     await expect(getMediaTextClient(ctx).messages.create(input)).rejects.toThrow()
   }
   expect(mocks.openai).not.toHaveBeenCalled()
 })
 it.each([
   ['missing hard gate','H1_SPEND_GATE','0'],
   ['feature OFF','ATLAS_TEXT_FAILOVER_ENABLED','false'],
   ['no secondary key','OPENAI_API_KEY',''],
 ])('does not open a new backup if %s',async(_label,key,value)=>{
   vi.stubEnv(key,value)
   mocks.anthropic.mockRejectedValue(badKey())
   await expect(getMediaTextClient(briefing).messages.create(input)).rejects.toThrow()
   expect(mocks.openai).not.toHaveBeenCalled()
 })
 it.each([
   { project:{projectSlug:'familje-stunden'},execution:news.execution,agent:'News Hunter',operation:'Analyze News' },
   { project:news.project,execution:{context:'OPERATOR_EXECUTION' as const,scope:news.execution.scope},agent:'News Hunter',operation:'Analyze News' },
   { project:briefing.project,execution:news.execution,agent:'CFO Briefing',operation:'Morning Briefing' },
   { project:{projectId:ID},execution:{context:'AUTONOMOUS' as const,scope:projectScope({projectId:otherID})},agent:'Dream',operation:'Dream Analysis' },
   { project:{projectId:otherID},verifiedProjectSlug:'ai-media-automation',execution:news.execution,agent:'News Hunter',operation:'Analyze News' },
   { project:{projectId:ID},verifiedProjectSlug:'familje-stunden',execution:news.execution,agent:'News Hunter',operation:'Analyze News' },
   { project:{projectId:ID},execution:news.execution,agent:'News Hunter',operation:'Analyze News' },
   { project:news.project,execution:news.execution,agent:'Script Writer',operation:'Generate Script' },
 ])('refuses nonallowlisted task/scope %j',async ctx=>{
   expect(isAutomaticTextFailoverAllowed(ctx)).toBe(false)
   mocks.anthropic.mockRejectedValue(badKey())
   await expect(getMediaTextClient(ctx).messages.create(input)).rejects.toThrow()
   expect(mocks.openai).not.toHaveBeenCalled()
 })
 it.each([
   new Error('network request may have dispatched'),
   Object.assign(new Error('timeout'),{status:504}),
   Object.assign(new Error('rate limit'),{status:429}),
   Object.assign(new Error('overloaded'),{status:529}),
   rejected(401,'authentication_error','other key issue'),
   rejected(400,'invalid_request_error','malformed input'),
   Object.assign(new Error('budget'),{name:'SpendRefusedError'}),
   Object.assign(new Error('unknown dispatch'),{name:'GovernanceDispatchUnknownError'}),
 ])('never sends a second paid request on uncertain/governance errors',async error=>{
   mocks.anthropic.mockRejectedValue(error)
   expect(canRouteTextFailure(dream,error)).toBe(null)
   await expect(getMediaTextClient(dream).messages.create(input)).rejects.toBe(error)
   expect(mocks.openai).not.toHaveBeenCalled()
 })
 it('refuses paid OpenAI dispatch when the separate Atlas allowance denies',async()=>{
   const budgetDenied=Object.assign(new Error('ATLAS_RESERVE_REFUSED'),{reason:'daily_limit'})
   mocks.anthropic.mockRejectedValue(badKey())
   mocks.reserve.mockRejectedValueOnce(budgetDenied)
   await expect(getMediaTextClient(news).messages.create(input)).rejects.toBe(budgetDenied)
   expect(mocks.reserve).toHaveBeenCalledTimes(1)
   expect(mocks.openai).not.toHaveBeenCalled()
 })
 it('preserves the reserve budget refusal instead of trying a third model',async()=>{
   const refused=Object.assign(new Error('budget exceeded'),{name:'SpendRefusedError'})
   mocks.anthropic.mockRejectedValue(badKey())
   mocks.openai.mockRejectedValue(refused)
   await expect(getMediaTextClient(briefing).messages.create(input)).rejects.toBe(refused)
   expect(mocks.openai).toHaveBeenCalledTimes(1)
 })
 it('never allows truncated or refused reserve content into the workflow',async()=>{
   mocks.anthropic.mockRejectedValue(badKey())
   mocks.openai.mockResolvedValue({choices:[{finish_reason:'length',message:{content:'partial JSON'}}]})
   await expect(getMediaTextClient(briefing).messages.create(input)).rejects.toThrow('MEDIA_TEXT_FALLBACK_INCOMPLETE')
 })
})
