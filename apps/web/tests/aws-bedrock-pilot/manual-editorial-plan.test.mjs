import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  planManualEditorialReview,
  boundNovaMicroPilotGrossUsd,
} from '../../lib/ai/bedrock-pilot/shadow-policy.ts'

const base = {
  environment: 'preview',
  gitRef: 'feat/omnira-bedrock-pilot-20261116',
  enabled: true,
  hardSpendGateEnabled: true,
  operation: 'manual_editorial_quality_review',
  projectId: '00000000-0000-4000-8000-000000000001',
  inputBytes: 999,
  maxOutputTokens: 64,
  sourceUrls: [
    'https://blog.google/products-and-platforms/products/education/ai-learning-era-updates-2026/',
    'https://www.wired.com/story/google-is-forcing-ai-overviews-in-classrooms-schools-are-searching-for-a-way-out/',
  ],
  fxUsdSek: 10.5,
}

test('readiness never authorizes provider dispatch or publication', () => {
  const p = planManualEditorialReview(base)
  assert.equal(p.status, 'review_plan_ready')
  assert.equal(p.canDispatch, false)
  assert.equal(p.provider, 'aws-bedrock')
  assert.equal(p.modelId, 'amazon.nova-micro-v1:0')
  assert.equal(p.requiredGate, 'withGovernedSpend')
  assert.equal(p.requiredExecution, 'OPERATOR_EXECUTION')
  assert.equal(p.sourcesFactChecked, false)
  assert.equal(p.requiresHumanPublicationApproval, true)
  assert.equal(p.sourceReferences, 2)
})
test('ceiling uses full provider input context, not estimated prompt usage', () => {
  const p = planManualEditorialReview(base)
  assert.equal(p.grossUsdCeiling, boundNovaMicroPilotGrossUsd(64))
  assert.ok(p.grossSekCeilingUnrounded > 0.04 && p.grossSekCeilingUnrounded < 0.06)
})
test('no paid calls enabled by default', () => {
  assert.deepEqual(planManualEditorialReview({...base, enabled: false}),
    {status:'refused',reason:'disabled',canDispatch:false})
})
test('production always refused', () => {
  assert.deepEqual(planManualEditorialReview({...base, environment:'production'}),
    {status:'refused',reason:'not_isolated_preview',canDispatch:false})
})
test('other preview branch always refused', () => {
  assert.deepEqual(planManualEditorialReview({...base, gitRef:'main'}),
    {status:'refused',reason:'not_isolated_preview',canDispatch:false})
})
test('missing hard budget stop refuses', () => {
  assert.equal(planManualEditorialReview({...base, hardSpendGateEnabled:false}).reason,'hard_spend_gate_required')
})
test('automatic news and publication paths refused', () => {
  for(const operation of ['Analyze News', 'Generate Script', 'publish', 'cron.daily']){
    assert.equal(planManualEditorialReview({...base,operation}).status,'refused')
  }
})
test('requires source references; does not claim they are fact checked', () => {
  assert.equal(planManualEditorialReview({...base,sourceUrls:[]}).reason,'source_references_required')
  assert.equal(planManualEditorialReview({...base,sourceUrls:[base.sourceUrls[0]]}).reason,'source_references_required')
  assert.equal(planManualEditorialReview({...base,sourceUrls:[base.sourceUrls[0],base.sourceUrls[0]]}).reason,'source_references_required')
  assert.equal(planManualEditorialReview({...base,sourceUrls:['file:///etc/passwd',base.sourceUrls[1]]}).reason,'source_references_required')
})
test('missing or unrealistic FX rejects, no silent fallback', () => {
  for (const fxUsdSek of [0,-1,Infinity,NaN,1001]) {
    assert.equal(planManualEditorialReview({...base,fxUsdSek}).reason,'fx_rate_unverified')
  }
})
test('unbounded output and input refused',()=>{
  assert.equal(planManualEditorialReview({...base,maxOutputTokens:257}).reason,'output_not_bounded')
  assert.equal(planManualEditorialReview({...base,inputBytes:100000}).reason,'input_not_bounded')
})
