import {describe,expect,it} from 'vitest'
import {selectEditorialQaSourceEvidence as extract} from '../media/quality-source-excerpt'

const intro='Official article introducing an evolving system and explaining its background.'
const irrelevant=Array.from({length:14},(_,i)=>
  `Section ${i}: unrelated garden discussion of flowers and city planning, `
  + 'walking directions and abstract commentary. '.repeat(15))
const late='Specific internal adaptive test found extraction success of 54.0% in Astra original safeguards versus 0.2% in Astra updated safeguards. Different model versions were compared, and this does not demonstrate zero remaining risk.'
const source=[intro,...irrelevant,late].join('\n\n')

describe('The Prompt bounded source-context selection — pure, no model requests',()=>{
 it('keeps an article unchanged when source context fits the cap',()=>{
  const source='Article source.\n\nA documented result is 8.2 units.'
  expect(extract(source,'Result','Reported result',4000)).toBe(source)
 })
 it('retains the source lead AND late claim evidence rather than first 600 characters',()=>{
  expect(source.length).toBeGreaterThan(600)
  const evidence=extract(source,
    'Astra internal test 54.0% vs 0.2%',
    'Astra internal protection test compares original safeguards with updated safeguards.',3800)
  expect(evidence.length).toBeLessThanOrEqual(3800)
  expect(evidence).toContain(intro)
  expect(evidence).toContain('54.0%')
  expect(evidence).toContain('0.2%')
  expect(evidence).toContain('Different model versions were compared')
  expect(evidence).not.toContain('Section 13: unrelated garden')
 })
 it('does not create new figures or words, just select real source spans',()=>{
  const evidence=extract(source,
    'Astra internal test 54.0% vs 0.2%',
    'Astra protection model',3800)
  for(const part of evidence.split('\n\n')){
   expect(source).toContain(part)
  }
  expect(evidence).not.toContain('99.9%')
  expect(evidence).not.toContain('zero risk eliminated')
 })
 it('never promotes an absent source as factual evidence',()=>{
  expect(extract('', 'hook','script')).toBe('')
  expect(extract('   ', 'hook','script')).toBe('')
 })
 it('bounds long unbroken source text and rejects invalid budgets',()=>{
  const huge='abcdefghijklmnopqrstuvwxyz'.repeat(550)
  const evidence=extract(huge,'script','no facts',2500)
  expect(evidence.length).toBeLessThanOrEqual(2500)
  for(const part of evidence.split('\n\n'))expect(huge).toContain(part)
  expect(()=>extract(source,'h','s',300)).toThrow('QUALITY_SOURCE_EVIDENCE_BUDGET_INVALID')
  expect(()=>extract(source,'h','s',10001)).toThrow('QUALITY_SOURCE_EVIDENCE_BUDGET_INVALID')
 })
 it('retains exact source decimals rather than rounding the figures',()=>{
  const paragraph='OpenAI internal test: GPT-6 Astra ASR 54.0%, GPT-6.2 Astra ASR 0.2%; two different model versions and safeguards.'
  const evidence=extract(['Headline. ',...irrelevant,paragraph].join('\n\n'),
    'OpenAI test Astra','ASR 54.0% to 0.2%',2500)
  expect(evidence).toContain('54.0%')
  expect(evidence).toContain('0.2%')
  expect(evidence).toContain('two different model versions')
 })
})
