import test from 'node:test'
import assert from 'node:assert/strict'
import { assessInstagramObservationQuality as assess } from '../content-growth/instagram-observation-quality.ts'

const H = 3_600_000
const NOW = Date.UTC(2026, 10, 25, 12)
const scope = { projectId: 'synthetic-project', accountId: 'synthetic-account' }
const policy = { nowMs: NOW, minAgeHours: 48, maxAgeHours: 54, freshnessHours: 168, minimumPosts: 6 }
const row = (postId, patch = {}) => ({
  ...scope, postId, source: 'caller_attested_provider_snapshot',
  publishedAtMs: NOW - 50 * H, observedAtMs: NOW,
  views: 100, reach: 80, saves: 3, shares: 2, ...patch,
})

test('empty input has no descriptive evidence', () => {
  const a = assess(scope, [], policy)
  assert.equal(a.totalPosts, 0)
  assert.equal(a.viewSampleMeetsMinimum, false)
  assert.equal(a.engagementRateSampleMeetsMinimum, false)
})
test('minimum applies separately to views and engagement', () => {
  const rows = Array.from({ length: 6 }, (_, i) => row(String(i), i === 5 ? { shares: null } : {}))
  const a = assess(scope, rows, policy)
  assert.equal(a.viewSampleMeetsMinimum, true)
  assert.equal(a.engagementRateSampleMeetsMinimum, false)
  assert.equal(a.rateIneligibleAtMatchedAge, 1)
})
test('six complete comparable snapshots meet pooled sample minimum only', () => {
  const a = assess(scope, Array.from({ length: 6 }, (_, i) => row(String(i))), policy)
  assert.equal(a.engagementRateSampleMeetsMinimum, true)
  assert.equal(a.viewSampleMeetsMinimum, true)
})
test('48h and 54h are inclusive; adjacent milliseconds excluded', () => {
  const a = assess(scope, [
    row('lo', { publishedAtMs: NOW - 48 * H }),
    row('hi', { publishedAtMs: NOW - 54 * H }),
    row('too-young', { publishedAtMs: NOW - 48 * H + 1 }),
    row('too-old', { publishedAtMs: NOW - 54 * H - 1 }),
  ], policy)
  assert.deepEqual(a.viewSamplePostIds, ['lo', 'hi'])
  assert.equal(a.exclusions.outsideAgeWindow, 2)
})
test('old fixed-age snapshot remains comparable but not fresh', () => {
  const a = assess(scope, [row('old', { observedAtMs: NOW - 200 * H, publishedAtMs: NOW - 250 * H }), row('new')], policy)
  assert.deepEqual(a.freshness, { fresh: 1, stale: 1, unknown: 0 })
  assert.equal(a.matchedAge, 2)
})
test('freshness boundary is per observation, not newest row', () => {
  const a = assess(scope, [
    row('edge', { observedAtMs: NOW - 168 * H, publishedAtMs: NOW - 218 * H }),
    row('past-edge', { observedAtMs: NOW - 168 * H - 1, publishedAtMs: NOW - 218 * H - 1 }),
  ], policy)
  assert.deepEqual(a.freshness, { fresh: 1, stale: 1, unknown: 0 })
})
test('cache timestamp cannot prove snapshot provenance', () => {
  const a = assess(scope, [row('cache', { source: 'cache_only' }), row('bad-source', { source: 'guess' })], policy)
  assert.equal(a.exclusions.unverifiedSource, 2)
  assert.equal(a.matchedAge, 0)
  assert.equal(a.freshness.unknown, 2)
})
test('missing, future, reversed or noninteger timestamps are not comparable', () => {
  const a = assess(scope, [
    row('missing-published', { publishedAtMs: null }),
    row('missing-observed', { observedAtMs: null }),
    row('future', { observedAtMs: NOW + 1 }),
    row('reverse', { publishedAtMs: NOW, observedAtMs: NOW - 1 }),
    row('invalid', { observedAtMs: NaN }),
    row('fractional', { publishedAtMs: NOW - 50 * H + 0.5 }),
    row('string', { observedAtMs: String(NOW) }),
  ], policy)
  assert.equal(a.exclusions.invalidTime, 7)
  assert.equal(a.freshness.unknown, 7)
  assert.equal(a.matchedAge, 0)
})
test('observed zero is different from null; zero reach cannot form rates', () => {
  const a = assess(scope, [
    row('zeros', { views: 0, saves: 0, shares: 0 }),
    row('zero-reach', { reach: 0 }),
    row('null-view', { views: null }),
    row('unknown-engagement', { saves: null }),
  ], policy)
  assert.deepEqual(a.viewSamplePostIds, ['zeros', 'zero-reach', 'unknown-engagement'])
  assert.deepEqual(a.engagementRateSamplePostIds, ['zeros', 'null-view'])
  assert.equal(a.missingViewsAtMatchedAge, 1)
})
test('mixed project or account fails even for unverified observations', () => {
  assert.throws(() => assess(scope, [row('a', { projectId: 'other' })], policy), /Mixed/)
  assert.throws(() => assess(scope, [row('a', { accountId: 'other', source: 'cache_only' })], policy), /Mixed/)
})
test('duplicates and malformed identifiers fail closed', () => {
  assert.throws(() => assess(scope, [row('a'), row('a', { source: 'cache_only' })], policy), /duplicate/)
  assert.throws(() => assess(scope, [row(' ')], policy), /Invalid/)
  assert.throws(() => assess({ ...scope, accountId: '' }, [], policy), /scope/)
})
test('negative, fractional, nonfinite or string counts fail closed', () => {
  for (const views of [-1, 0.5, Infinity, NaN, '10', undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => assess(scope, [row('a', { views })], policy), /metric/)
  }
})
test('invalid policy rejects nonsensical sample and time windows', () => {
  for (const patch of [
    { nowMs: NaN }, { minAgeHours: -1 }, { maxAgeHours: 47 },
    { freshnessHours: Infinity }, { minimumPosts: 0 }, { minimumPosts: 1.5 },
  ]) assert.throws(() => assess(scope, [], { ...policy, ...patch }), /policy/)
})
test('coverage partitions all supplied rows without mutating input', () => {
  const rows = Object.freeze([
    Object.freeze(row('valid')),
    Object.freeze(row('cache', { source: 'cache_only' })),
    Object.freeze(row('badtime', { observedAtMs: null })),
    Object.freeze(row('young', { publishedAtMs: NOW - H })),
  ])
  const a = assess(scope, rows, policy)
  assert.equal(a.matchedAge + Object.values(a.exclusions).reduce((s, n) => s + n, 0), a.totalPosts)
  assert.equal(Object.values(a.freshness).reduce((s, n) => s + n, 0), a.totalPosts)
  assert.deepEqual(a.viewSamplePostIds, ['valid'])
})
test('custom measurement age window works without changing existing A/B policy', () => {
  const a = assess(scope, [
    row('early', { publishedAtMs: NOW - 24 * H }),
    row('usual', { publishedAtMs: NOW - 48 * H }),
  ], { ...policy, minAgeHours: 24, maxAgeHours: 25, minimumPosts: 1 })
  assert.deepEqual(a.viewSamplePostIds, ['early'])
  assert.equal(a.exclusions.outsideAgeWindow, 1)
})
test('invalid engagement metrics fail independently', () => {
  for (const patch of [{ reach: -1 }, { saves: 0.5 }, { shares: '3' }]) {
    assert.throws(() => assess(scope, [row('a', patch)], policy), /metric/)
  }
})
test('pooled coverage is not a variant verdict or winner', () => {
  const a = assess(scope, Array.from({ length: 6 }, (_, i) => row(String(i), { variant: 'A' })), policy)
  assert.equal(a.viewSampleMeetsMinimum, true)
  assert.equal(a.engagementRateSampleMeetsMinimum, true)
  assert.equal('winner' in a, false)
  assert.equal('variantReadiness' in a, false)
})
