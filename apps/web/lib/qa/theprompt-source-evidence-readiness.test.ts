import {describe,expect,it} from 'vitest'
import {sourceCandidateMayBeEvaluated,hasEnoughSourceToWrite,composeSourceBackedEditorialContexts} from '../media/source-evidence-readiness'

describe('The Prompt - do not script headline-only news',()=>{
 const weakHn={url:'https://www.theverge.com/ai-artificial-intelligence/1039745/dario-amodei-video-games-ai-joblessness',summary:''}
 it('rejects the exact kind of contentless Hacker News headline that blocked Nov 23 evening recovery',()=>{
  expect(sourceCandidateMayBeEvaluated(weakHn)).toBe(false)
  expect(hasEnoughSourceToWrite('',weakHn.summary)).toBe(false)
 })
 it('chooses a different candidate with original substantive source text',()=>{
  const good={...weakHn,summary:'The publisher describes a documented new feature, its boundaries, and source statements from the released software. Its tests distinguish experimental capability from public availability.'}
  expect(sourceCandidateMayBeEvaluated(good)).toBe(true)
  expect(hasEnoughSourceToWrite('',good.summary)).toBe(true)
 })
 it('allows a first-party URL only on the condition that its real article is subsequently retrieved',()=>{
  const firstParty={url:'https://openai.com/index/technical-safety-report/',summary:''}
  expect(sourceCandidateMayBeEvaluated(firstParty)).toBe(true)
  expect(hasEnoughSourceToWrite('',firstParty.summary)).toBe(false)
  const full=Array.from({length:110},(_,i)=>i%2===0?'published':'details').join(' ')
  expect(hasEnoughSourceToWrite(full,firstParty.summary)).toBe(true)
 })
 it('does not treat a model-generated summary as the original source',()=>{
  const originalSummary=''
  const inventedModelSummary='A synthetic AI summary can make a title sound very confident, but it is not original publisher evidence. '.repeat(3)
  expect(inventedModelSummary.length).toBeGreaterThan(80)
  expect(hasEnoughSourceToWrite('',originalSummary)).toBe(false)
 })
 it('rejects unknown, non-HTTPS, credential-bearing or unsafe URLs',()=>{
  for(const url of [
   null,'','bad-url','http://www.theverge.com/ai/article',
   'https://user:password@theverge.com/ai/story',
   'https://localhost/ai/article',
  ]) {
   expect(sourceCandidateMayBeEvaluated({url,summary:'A'.repeat(100)})).toBe(false)
  }
 })
 it('does not accept minimal summaries or short article bodies',()=>{
  expect(sourceCandidateMayBeEvaluated({url:weakHn.url,summary:'Short lead.'})).toBe(false)
  expect(hasEnoughSourceToWrite('Brief article text.','Short lead.')).toBe(false)
 })
 it('sends original news text, never the analyst model rewritten summary, to writing and quality review',()=>{
  const sourceTitle='Publisher reports independent evaluations of a new research model'
  const sourceSummary='The publisher described a research evaluation in limited testing. Some capabilities remain experimental and are not available for general use. Results are conditional on a specified test setting.'
  const analystRewrite='The model has already replaced every human engineer and delivers unlimited autonomous access.'
  const out=composeSourceBackedEditorialContexts({
    originalTitle:sourceTitle, originalSummary:sourceSummary,fullArticleText:null,
    suggestedAngle:'practical',
  })
  expect(out.scriptContext).toContain(sourceSummary)
  expect(out.sourceContext).toContain(sourceSummary)
  expect(out.scriptContext).toContain(sourceTitle)
  expect(out.sourceContext).not.toContain(analystRewrite)
  expect(out.scriptContext).not.toContain(analystRewrite)
  expect(out.scriptContext).toContain('STYLE ONLY')
  expect(out.sourceContext).not.toContain('practical')
 })
 it('full source article replaces summary when it meets the original length requirement',()=>{
  const article=Array.from({length:140},(_,i)=>'Source detail '+i+'.').join(' ')
  const out=composeSourceBackedEditorialContexts({
    originalTitle:'Official primary source describes the actual model release',
    originalSummary:'This original feed summary is less detailed than the verified article body and should be superseded by its full source.',
    fullArticleText:article,
  })
  expect(out.sourceContext).toContain(article)
  expect(out.sourceContext).not.toContain('This original feed summary')
  expect(out.scriptContext).toContain('FULL SOURCE ARTICLE')
 })
 it('does not create a script or QA basis from a synthetic summary or blank source title',()=>{
  expect(()=>composeSourceBackedEditorialContexts({
    originalTitle:'AI event headline from publisher',originalSummary:null,fullArticleText:null,
  })).toThrow('THE_PROMPT_VERIFIABLE_SOURCE_REQUIRED')
  expect(()=>composeSourceBackedEditorialContexts({
    originalTitle:'',originalSummary:'A'.repeat(120),fullArticleText:'',
  })).toThrow('THE_PROMPT_VERIFIABLE_SOURCE_REQUIRED')
 })
})
