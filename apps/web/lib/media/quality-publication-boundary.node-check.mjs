import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const mediaRoute = path => read('app/api/media/' + path + '/route.ts')

test('model score is parsed without a permissive 8/10 fallback', () => {
  const quality = read('lib/media/quality.ts')
  assert.match(quality, /parseQualityScoreResponse\(raw\)/)
  assert.doesNotMatch(quality, /Quality check parse error — proceeding with caution/)
  assert.match(quality, /!score\.passed/)
})

test('every automatic writer validates a rewritten script before approval', () => {
  for (const path of ['cron/step1', 'cron/autonomous', 'pipeline/full']) {
    const source = mediaRoute(path)
    assert.match(source, /qualityScore = await scoreScript/)
    assert.match(source, /shouldRegenerate\(qualityScore\)/)
    assert.match(source, /quality_review_required/)
  }
})

test('breaking content never swallows a quality evaluation failure', () => {
  const source = mediaRoute('breaking')
  assert.doesNotMatch(source, /scoreScript\([^;]*\)\.catch\(\(\) => null\)/s)
  assert.match(source, /if \(shouldRegenerate\(qualityScore\)\) throw/)
})

test('expensive legacy media stages reject unverified quality before spending', () => {
  for (const path of ['cron/step2', 'cron/step3', 'cron/step4']) {
    const source = mediaRoute(path)
    assert.match(source, /quality_score/)
    assert.match(source, /if \(!isApprovedQualityScore\(script\.quality_score\)\)/)
    assert.match(source, /editorial_review_required/)
  }
})

test('Instagram and Facebook publisher skips legacy false approvals', () => {
  const source = mediaRoute('cron/publish')
  assert.match(source, /quality_score,/)
  assert.match(source, /scripts\.find\(candidate => isApprovedQualityScore\(candidate\.quality_score\)\)/)
  assert.match(source, /status: 'editorial_review_required'/)
})

test('YouTube explicit script ID cannot bypass editorial status or quality', () => {
  const source = mediaRoute('cron/youtube')
  const named = source.indexOf('if (scriptIdParam)')
  assert.ok(named > 0)
  assert.ok(source.indexOf(".in('status', ['approved', 'published'])") < named)
  assert.ok(source.indexOf(".eq('video_status', 'ready')") < named)
  assert.match(source, /if \(!isApprovedQualityScore\(script\.quality_score\)\)/)
})
