import {describe,it,expect} from 'vitest'
/**
 * Code-work model router and hard per-job SEK caps (docs/superpowers/plans/2026-10-20-model-router-and-first-job.md,
 * approved 2026-10-20 08:38). Reuses MODEL_PRICING and tokenWindowCeiling; nothing here calls a provider.
 */
const router=async()=>await import('@/lib/atlas/code-work/model-routing/model-router') as any
const RATES=Object.freeze({usd_sek:10.5})
const LOCAL={modelId:'qwen2.5-coder:7b',digest:'sha256:'+'a'.repeat(64)}

describe('profiles',()=>{
 it('registers exactly the approved author profiles and reviewer options, frozen, with hard SEK caps',async()=>{
  const r=await router()
  expect(Object.keys(r.AUTHOR_PROFILES)).toEqual(['small','standard','complex'])
  expect(r.AUTHOR_PROFILES.standard).toMatchObject({provider:'openai',family:'openai_gpt',modelId:'gpt-5.4-mini-2026-03-17',capSek:2})
  expect(r.AUTHOR_PROFILES.complex).toMatchObject({provider:'anthropic',family:'anthropic_claude',modelId:'claude-sonnet-5-5',capSek:10})
  expect(r.AUTHOR_PROFILES.small).toMatchObject({provider:'ollama_local',family:'qwen',capSek:0})
  expect(r.REVIEWER_PROFILES.map((p:any)=>[p.family,p.capSek])).toEqual([['openai_gpt',3],['anthropic_claude',3]])
  expect(Object.isFrozen(r.AUTHOR_PROFILES)&&Object.isFrozen(r.AUTHOR_PROFILES.standard)&&Object.isFrozen(r.REVIEWER_PROFILES)).toBe(true)
  expect(()=>{(r.AUTHOR_PROFILES.standard as any).capSek=99}).toThrow()
 })
 it('prices the new Claude models from the verified price book and their 1M windows',async()=>{
  const {MODEL_PRICING}=await import('@/lib/ai/pricing'),{CONTEXT_WINDOW_TOKENS}=await import('@/lib/cost/spend-ceiling')
  expect(MODEL_PRICING['claude-sonnet-5-5']).toMatchObject({inputPer1M:2,outputPer1M:10,provider:'anthropic'})
  expect(MODEL_PRICING['claude-haiku-5-5']).toMatchObject({inputPer1M:0.5,outputPer1M:2.5,provider:'anthropic'})
  expect(CONTEXT_WINDOW_TOKENS['claude-sonnet-5-5']).toBe(1_000_000);expect(CONTEXT_WINDOW_TOKENS['claude-haiku-5-5']).toBe(1_000_000)
 })
})

describe('selection by complexity, verified capability and cost',()=>{
 it('chooses the qualified local model for a small low-risk fix, with a reviewer from another family',async()=>{
  const r=await router(),p=r.proposeProfiles({kind:'ui_fix',filesInScope:1,securitySensitive:false},{localQualified:LOCAL})
  expect(p).toMatchObject({author:'small',authorModel:'qwen2.5-coder:7b',requiresOwnerChoice:false});expect(p.reviewerFamily).not.toBe('qwen')
 })
 it('never silently upgrades when no local model is qualified: it asks the owner',async()=>{
  const r=await router(),p=r.proposeProfiles({kind:'ui_fix',filesInScope:1,securitySensitive:false},{localQualified:null})
  expect(p.author).toBe('standard');expect(p.requiresOwnerChoice).toBe(true);expect(p.reasons.join(' ')).toMatch(/local/i)
 })
 it('does not pick the cheapest model for work it is not verified for',async()=>{
  const r=await router()
  expect(r.proposeProfiles({kind:'bugfix',filesInScope:4,securitySensitive:false},{localQualified:LOCAL}).author).toBe('standard')
  expect(r.proposeProfiles({kind:'feature',filesInScope:7,securitySensitive:false},{localQualified:LOCAL}).author).toBe('complex')
 })
 it('treats security-sensitive work as high risk: complex author, cross-family reviewer, owner choice required',async()=>{
  const r=await router(),p=r.proposeProfiles({kind:'ui_fix',filesInScope:1,securitySensitive:true},{localQualified:LOCAL})
  expect(p).toMatchObject({author:'complex',risk:'high',requiresOwnerChoice:true});expect(p.reviewerFamily).toBe('openai_gpt')
 })
 it('always picks a reviewer from a different model family than the author',async()=>{
  const r=await router()
  expect(r.reviewerFor('qwen').family).toBe('openai_gpt');expect(r.reviewerFor('openai_gpt').family).toBe('anthropic_claude');expect(r.reviewerFor('anthropic_claude').family).toBe('openai_gpt')
 })
 it('rejects malformed requests instead of guessing',async()=>{
  const r=await router()
  for(const bad of [null,{},{kind:'ui_fix',filesInScope:0,securitySensitive:false},{kind:'x',filesInScope:1,securitySensitive:false},{kind:'ui_fix',filesInScope:1.5,securitySensitive:false},{kind:'ui_fix',filesInScope:1,securitySensitive:'no'}])expect(()=>r.proposeProfiles(bad,{localQualified:LOCAL})).toThrow('invalid_code_work_request')
 })
})

describe('hard per-job caps in SEK',()=>{
 it('derives each call ceiling from the canonical token-window ceiling, so an unverified input bound is priced at the full window',async()=>{
  const r=await router(),c=r.callCeilingSek(r.AUTHOR_PROFILES.standard,RATES)
  // 400k input tokens x 0.75 USD/M + 4096 output x 4.50 USD/M, at 10.5 SEK/USD.
  expect(c).toMatchObject({ok:true,basis:'token_window'});expect(c.sek).toBeCloseTo((0.3+4096*4.5/1e6)*10.5,9)
  expect(r.callCeilingSek(r.AUTHOR_PROFILES.small,RATES)).toEqual({ok:true,sek:0,basis:'local_no_api'})
  expect(r.callCeilingSek(r.AUTHOR_PROFILES.standard,{})).toMatchObject({ok:false})
 })
 it('refuses a call whose worst case does not fit the remaining cap, before any dispatch',async()=>{
  const r=await router(),b=r.createJobBudget({authorCapSek:2,reviewerCapSek:3})
  expect(b.admit('author',3.29)).toEqual({ok:false,reason:'budget_exhausted'})
  const t=b.admit('author',1.5);expect(t.ok).toBe(true);expect(b.admit('author',0.6)).toEqual({ok:false,reason:'budget_exhausted'})
 })
 it('counts retries, open reservations and unknown outcomes against the cap',async()=>{
  const r=await router(),b=r.createJobBudget({authorCapSek:2,reviewerCapSek:3})
  const a=b.admit('author',0.8);b.settle(a.ticket,0.3);const c=b.admit('author',0.8);b.settle(c.ticket,'unknown')
  expect(b.committed('author')).toBeCloseTo(1.1,10);expect(b.admit('author',0.95)).toEqual({ok:false,reason:'budget_exhausted'});expect(b.admit('author',0.9).ok).toBe(true)
 })
 it('never settles above the reserved ceiling or twice, and keeps author and reviewer caps separate',async()=>{
  const r=await router(),b=r.createJobBudget({authorCapSek:2,reviewerCapSek:3})
  const a=b.admit('author',1);expect(()=>b.settle(a.ticket,1.01)).toThrow('settlement_above_ceiling');b.settle(a.ticket,0.5);expect(()=>b.settle(a.ticket,0.1)).toThrow('ticket_closed')
  expect(b.admit('reviewer',2.9).ok).toBe(true);expect(b.committed('author')).toBe(0.5)
  expect(()=>b.settle({} as any,0)).toThrow('unknown_ticket')
 })
 it('refuses invalid caps and ceilings and offers no way to raise a cap',async()=>{
  const r=await router()
  for(const caps of [{authorCapSek:-1,reviewerCapSek:3},{authorCapSek:2,reviewerCapSek:Number.NaN},{authorCapSek:11,reviewerCapSek:3},{authorCapSek:2,reviewerCapSek:4}])expect(()=>r.createJobBudget(caps)).toThrow('invalid_job_budget')
  const b=r.createJobBudget({authorCapSek:2,reviewerCapSek:3})
  for(const x of [-1,Number.NaN,Number.POSITIVE_INFINITY])expect(b.admit('author',x)).toEqual({ok:false,reason:'invalid_ceiling'})
  expect(b.admit('worker' as any,0.1)).toEqual({ok:false,reason:'invalid_role'})
  expect(Object.keys(b).sort()).toEqual(['admit','committed','remaining','settle'])
 })
 it('shows that, with the canonical unverified input bound, Standard and the GPT reviewer are refused within the approved caps',async()=>{
  const r=await router(),b=r.createJobBudget({authorCapSek:2,reviewerCapSek:3})
  const author=r.callCeilingSek(r.AUTHOR_PROFILES.standard,RATES),reviewer=r.callCeilingSek(r.REVIEWER_PROFILES[0],RATES)
  expect(b.admit('author',author.sek)).toEqual({ok:false,reason:'budget_exhausted'});expect(b.admit('reviewer',reviewer.sek)).toEqual({ok:false,reason:'budget_exhausted'})
  expect(b.admit('author',r.callCeilingSek(r.AUTHOR_PROFILES.small,RATES).sek).ok).toBe(true)
 })
})
