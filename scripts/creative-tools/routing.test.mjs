import test from 'node:test'
import assert from 'node:assert/strict'
import { planCreativeTask } from '../../apps/web/lib/media/creative-routing.ts'

test('Atlas prefers discovered editor only for specific editing tasks', () => {
  const edit = planCreativeTask('image-retouch', ['photocraft'])
  assert.equal(edit.preferred, 'photocraft')
  assert.equal(edit.externalToolRequired, true)
  assert.equal(edit.requiresReview, true)
  assert.equal(planCreativeTask('image-retouch').preferred, 'existing-image-pipeline')
  assert.equal(planCreativeTask('video-timeline-edit', ['filmcraft']).preferred, 'filmcraft')
  assert.equal(planCreativeTask('video-timeline-edit').preferred, 'remotion')
})

test('Atlas preserves established pipelines for data and recurring workflows', () => {
  assert.equal(planCreativeTask('interactive-data-chart', ['photocraft','filmcraft']).preferred, 'react-chart')
  assert.equal(planCreativeTask('new-illustration', ['photocraft']).preferred, 'existing-image-generator')
  assert.equal(planCreativeTask('templated-social-video', ['filmcraft']).preferred, 'remotion')
  assert.equal(planCreativeTask('simple-video-transcode', ['filmcraft']).preferred, 'ffmpeg')
  assert.equal(planCreativeTask('printable-pdf').preferred, 'existing-pdf-pipeline')
})

test('No routing plan grants autonomous execution', () => {
  for (const intent of ['image-retouch','video-timeline-edit','interactive-data-chart']) {
    assert.equal(planCreativeTask(intent).requiresReview, true)
  }
})
