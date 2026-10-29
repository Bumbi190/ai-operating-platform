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

it('forwards approved V3 private shot plans without refetching inspected word timing', async () => {
  const v3Storyboard = {
    schema:'theprompt.v3.private-storyboard.v1',
    scriptId:'b9271d5b-5254-4ad8-a36c-ce7c66e9c63e',
    projectId:'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52',
    referenceSha256:'d23d62737aa04b4203159b0da0f775a88addf50274e16c79d3bfa12e8f092788',
    fps:30, contentFrames:665, outroFrames:75, totalFrames:740, shots:[],
    safeAudioMilliseconds:22152,captionWordCount:8,
    editorialHold:{required:true,reasons:['source_claim_conflict'],overlay:'EDITORIAL HOLD'},
    canGenerate:false,canPublish:false,canSchedule:false,
  }
  const wordTimings=Array.from({length:8},(_,i)=>({
    word:'word'+i,startMs:i*250,endMs:i*250+230,
  }))
  const result=await buildVideoInputProps({
    ...original,durationMs:22152,
    images:[...original.images,'https://media.example.test/still-c.jpg'],
    timingUrl:'https://invalid.example.test/NEVER_FETCH_THIS',
    wordTimings,v3Storyboard,
  })
  assert.deepEqual(result.v3Storyboard,v3Storyboard)
  assert.equal(result.words.length,8)
  assert.ok(result.captions.length>=1)
  assert.equal(result.audioUrl,original.audioUrl)
  assert.equal(result.sceneVideos,undefined)
})
