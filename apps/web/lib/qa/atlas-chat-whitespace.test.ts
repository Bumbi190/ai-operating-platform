import {describe,it,expect} from 'vitest'
import {performance} from 'node:perf_hooks'
import {isActionIntent,isDreamResolutionIntent} from '../atlas/action-intent'
import {classifyStaticConversation} from '../atlas/static-conversation'

describe('chat classification with long whitespace runs',()=>{
 it('keeps action and resolution clauses separate across dash and punctuation boundaries',()=>{
  for(const separator of [' — ',' – ','\t—\t',', ','; ',': ','\n']){
   expect(isActionIntent('Systemet väntar'+separator+'kör workflowet')).toBe(true)
   expect(isDreamResolutionIntent('Systemet väntar'+separator+'markera fyndet som löst')).toBe(true)
  }
  expect(isActionIntent('Systemet väntar—kör workflowet')).toBe(false)
  expect(isActionIntent('Systemet väntar — — kör workflowet')).toBe(false)
  expect(isActionIntent('Hur kör jag workflowet?')).toBe(false)
  expect(isDreamResolutionIntent('Har du löst problemet?')).toBe(false)
 })
 it('normalizes supported punctuation without discarding significant interior text',()=>{
  for(const text of ['“Hej Atlas!”','«Tack»','[hej]','¡Hej!','¿vem är du?','  hej\t\tAtlas  '])
   expect(classifyStaticConversation(text)).toBe('static_conversation')
  for(const text of ['hej [atlas]','hej, atlas','Hej. Kör workflowet!','hej ! x'])
   expect(classifyStaticConversation(text)).toBe('full_path')
 })
 it('handles an unmatched long whitespace run without quadratic retry',()=>{
  const spaces=' '.repeat(60000),tabs='\t'.repeat(60000)
  const start=performance.now()
  expect(isActionIntent('Systemet'+spaces+'väntar')).toBe(false)
  expect(isDreamResolutionIntent('Systemet'+spaces+'väntar')).toBe(false)
  expect(classifyStaticConversation('hej'+tabs+'x')).toBe('full_path')
  // A generous regression budget: the linear implementation takes milliseconds.
  expect(performance.now()-start).toBeLessThan(1500)
 })
})
