import assert from 'node:assert/strict'
import {it} from 'node:test'
import {buildVideoInputProps} from './video-props.ts'

const original = {
  hook: 'A grounded news hook.',
  audioUrl: 'https://media.example.test/voice.mp3',
  timingUrl: '',
  durationMs: 28000,
  images: ['https://media.example.test/still-a.jpg', 'https://media.example.test/still-b.jpg'],
}

it('preserves original image-only Remotion input when no videos were admitted', async () => {
  const result = await buildVideoInputProps(original)
  assert.equal(Object.hasOwn(result, 'sceneVideos'), false)
  assert.deepEqual(result.images, original.images)
  assert.equal(result.audioUrl, original.audioUrl)
  assert.equal(result.durationMs, 28000)
  assert.deepEqual(result.captions, [])
})

it('passes only explicitly supplied aligned video sources to the hybrid renderer', async () => {
  const sceneVideos = [{src:'https://media.example.test/clip-a.mp4',durationFrames:120},null]
  const result = await buildVideoInputProps({...original,sceneVideos})
  assert.deepEqual(result.sceneVideos, sceneVideos)
  assert.deepEqual(result.images, original.images)
  assert.equal(result.hook, original.hook)
  assert.equal(result.audioUrl, original.audioUrl)
})
