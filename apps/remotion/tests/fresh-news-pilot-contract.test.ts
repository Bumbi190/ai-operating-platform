import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const hunter=readFileSync(new URL('../../web/lib/media/news-hunter.ts',import.meta.url),'utf8')
const step1=readFileSync(new URL('../../web/app/api/media/cron/step1/route.ts',import.meta.url),'utf8')
const quality=readFileSync(new URL('../../web/lib/media/quality.ts',import.meta.url),'utf8')

test('strict news pilot explicitly gates news hunter before LLM picks',()=>{
  assert.match(hunter,/import \{ filterFreshRelevantNews \} from/)
  assert.match(hunter,/strict \? filterFreshRelevantNews\(fresh\)\.eligible : fresh/)
  assert.match(hunter,/strict && screened\.length === 0/)
  assert.match(hunter,/Do not publish old stories/)
  assert.match(step1,/source_key: process.env.THE_PROMPT_FRESH_NEWS_PILOT/)
  assert.match(step1,/source_published_at: process.env.THE_PROMPT_FRESH_NEWS_PILOT/)
  assert(!step1.includes("source_published_at: new Date().toISOString()"))
  assert.match(hunter,/!pubDate \|\| !Number\.isFinite\(new Date\(pubDate\)\.getTime\(\)\)/)
})

test('strict pilot excludes unverified Hermes fallback rather than inventing dates',()=>{
  assert.match(step1,/THE_PROMPT_FRESH_NEWS_PILOT !== 'true' && isHermesConfigured/)
  assert.match(step1,/candidateSave\.status !== 'saved'/)
  assert.match(step1,/status: duplicateCount > 0 \? 'duplicate_existing_story' : 'no_news'/)
})

test('strict pilot does not turn malformed factual QA output into automatic approval',()=>{
  assert.match(quality,/if \(process\.env\.THE_PROMPT_FRESH_NEWS_PILOT === 'true'\) return \{/)
  assert.match(quality,/hallucination_risk: 0, overall: 0, passed: false/)
  assert.match(step1,/status: 'editorial_review_required'/)
  assert.match(step1,/shouldRegenerate\(qualityScore\) \|\| !qualityScore\.passed/)
  assert.match(step1,/THE_PROMPT_FRESH_NEWS_PILOT !== 'true' && Date\.now\(\) - t0/)
})

test('pilot remains opt-in and never changes default production rendering',()=>{
  assert.match(hunter,/process\.env\.THE_PROMPT_FRESH_NEWS_PILOT === 'true'/)
  assert.match(step1,/voice_status: 'none', video_status: 'none'/)
  const remotionRoot=readFileSync(new URL('../src/Root.tsx',import.meta.url),'utf8')
  assert.match(remotionRoot,/id="SimpleNewsReel"/)
  assert.match(step1,/projectScope/)
})
