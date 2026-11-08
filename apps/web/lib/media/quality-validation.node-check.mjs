import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQualityScoreResponse, isApprovedQualityScore, QualityReviewRequired } from './quality-validation.ts'

const base = {
  hook_strength: 9,
  retention_score: 9,
  visual_relevance: 9,
  shareability: 9,
  discussion_potential: 9,
  hallucination_risk: 9,
  overall: 9,
  passed: true,
  verdict: 'All claims appear aligned with the supplied context.',
  weak_spots: [],
}

test('accepts fully verified JSON score', () => {
  const result = parseQualityScoreResponse(JSON.stringify(base))
  assert.equal(result.passed, true)
  assert.equal(result.overall, 9)
  assert.equal(isApprovedQualityScore(result), true)
})

test('accepts a complete fenced JSON response', () => {
  const raw = String.fromCharCode(96).repeat(3) + 'json\n'
    + JSON.stringify(base) + '\n' + String.fromCharCode(96).repeat(3)
  assert.equal(parseQualityScoreResponse(raw).passed, true)
})

test('malformed provider output fails closed', () => {
  assert.throws(() => parseQualityScoreResponse('not JSON'), QualityReviewRequired)
  assert.throws(() => parseQualityScoreResponse('{"passed":true'), QualityReviewRequired)
  assert.equal(isApprovedQualityScore(null), false)
})

test('legacy parse-failure placeholder with passed=true is blocked', () => {
  const legacy = { ...base, verdict: 'Quality check parse error — proceeding with caution.' }
  assert.equal(isApprovedQualityScore(legacy), false)
  assert.throws(() => parseQualityScoreResponse(JSON.stringify(legacy)), QualityReviewRequired)
})

test('provider cannot override factual-risk gate with passed=true', () => {
  const unsafe = parseQualityScoreResponse(JSON.stringify({ ...base, hallucination_risk: 3 }))
  assert.equal(unsafe.passed, false)
  assert.equal(isApprovedQualityScore(unsafe), false)
})

test('provider cannot override weak hook or engagement gate', () => {
  const unsafe = parseQualityScoreResponse(JSON.stringify({
    ...base, hook_strength: 4, overall: 8,
  }))
  assert.equal(unsafe.passed, false)
})

test('provider refusal is not upgraded to approval', () => {
  assert.equal(parseQualityScoreResponse(JSON.stringify({ ...base, passed: false })).passed, false)
})

test('fabricated overall score is rejected', () => {
  assert.throws(() => parseQualityScoreResponse(JSON.stringify({
    ...base, overall: 10, retention_score: 2,
  })), QualityReviewRequired)
})

test('missing, invalid and out-of-range fields never pass', () => {
  for (const bad of [
    { ...base, verdict: '' },
    { ...base, hook_strength: '9' },
    { ...base, hallucination_risk: 11 },
    { ...base, weak_spots: null },
    { ...base, passed: 'true' },
  ]) {
    assert.equal(isApprovedQualityScore(bad), false)
  }
})
