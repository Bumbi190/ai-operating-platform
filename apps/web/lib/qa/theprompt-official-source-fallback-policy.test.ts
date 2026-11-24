import {describe,expect,it} from 'vitest'
import {officialArticleFallbackBudgetMs as budget} from '../media/official-source-fallback-policy'

describe('The Prompt optional source fallback — official origin only, bounded',()=>{
 const official='https://openai.com/index/an-article-about-model-safety/'
 it('reads first-party articles only inside the same 28-second enrichment deadline',()=>{
  expect(budget(official,0,false)).toBe(6000)
  expect(budget(official,23000,false)).toBe(5000)
  expect(budget(official,26400,false)).toBe(1600)
  expect(budget(official,27000,false)).toBe(0)
 })
 it('skips when Hermes already returned a substantive source',()=>{
  expect(budget(official,1000,true)).toBe(0)
 })
 it('refuses user-chosen IP and lookalike/third-party source domains',()=>{
  for(const url of [
   'http://127.0.0.1/a','https://localhost/private',
   'https://openai.com.attacker.example/index/article',
   'https://openai.com@evil.example/article',
   'https://example.com/ai/article',
   'file:///C:/Windows/secret','http://openai.com/index/launch',
  ]){
   expect(budget(url,1500,false)).toBe(0)
  }
 })
 it('rejects official bare homepages and directory-category URLs',()=>{
  expect(budget('https://openai.com/',0,false)).toBe(0)
  expect(budget('https://openai.com/news',0,false)).toBe(0)
 })
 it('refuses missing URLs and unavailable time estimates',()=>{
  expect(budget(null,0,false)).toBe(0)
  expect(budget('',0,false)).toBe(0)
  expect(budget(official,Number.NaN,false)).toBe(0)
  expect(budget(official,-1,false)).toBe(0)
 })
 it('accepts supported documented primary publishers only, no generated article edits',()=>{
  expect(budget('https://blog.google/technology/ai/new-release/',500,false)).toBe(6000)
  expect(budget('https://anthropic.com/news/claude-for-productivity',500,false)).toBe(6000)
 })
})
