import {describe,expect,it} from 'vitest'
import {quoteWebsitePaidStep} from './paid-step-quote'

const step={
 projectId:'11111111-1111-4111-8111-111111111111',sessionId:'22222222-2222-4222-8222-222222222222',
 runId:'33333333-3333-4333-8333-333333333333',claimId:'44444444-4444-4444-8444-444444444444',generation:1,
 operation:'website.artifact.generate',model:'claude-sonnet-4-6',maxTokens:12000,temperature:.7,
 systemPrompt:'system',userMessage:'user',
}
const rates={usd_sek:10.5}
describe('paid website step quote',()=>{
 it('uses the canonical full-window Sonnet ceiling and converts the quantized SEK hold conservatively to USD micros',()=>{
  const q=quoteWebsitePaidStep(step,rates)
  expect(q).toMatchObject({basis:'token_window',ceilingSek:8.19,ceilingUsdMicros:780000,model:'claude-sonnet-4-6',maxTokens:12000})
  expect(q.payloadSha256).toMatch(/^[a-f0-9]{64}$/);expect(q.priceEvidenceSha256).toMatch(/^[a-f0-9]{64}$/)
 })
 it('quotes feedback independently at its smaller output cap',()=>{
  const q=quoteWebsitePaidStep({...step,operation:'website.feedback.interpret',maxTokens:2000},rates)
  expect(q.ceilingSek).toBe(6.6151);expect(q.ceilingUsdMicros).toBe(630010)
 })
 it('binds the payload and price evidence separately',()=>{
  const a=quoteWebsitePaidStep(step,rates),b=quoteWebsitePaidStep({...step,userMessage:'different'},rates),c=quoteWebsitePaidStep(step,{usd_sek:11})
  expect(a.payloadSha256).not.toBe(b.payloadSha256);expect(a.priceEvidenceSha256).toBe(b.priceEvidenceSha256)
  expect(a.priceEvidenceSha256).not.toBe(c.priceEvidenceSha256)
 })
 it('fails closed for an unsupported model, invalid FX, invalid cap or unexpected operation',()=>{
  for(const s of [{...step,model:'unknown'},{...step,maxTokens:0},{...step,operation:'other'}])expect(()=>quoteWebsitePaidStep(s as any,rates)).toThrow()
  for(const fx of [0,-1,NaN,Infinity])expect(()=>quoteWebsitePaidStep(step,{usd_sek:fx})).toThrow()
 })
})
