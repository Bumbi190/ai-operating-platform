import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {planHybridSceneClips} from './hybrid-scenes.ts'

const make = (sceneVideos) => ({
  sceneCount: 4,
  totalFrames: 900,
  outroFrames: 75,
  transitionFrames: 22,
  sceneVideos,
})
const clip = (id = 1, durationFrames = 120) => ({
  src: `https://assets.example.test/the-prompt/clip-${id}.mp4`,
  durationFrames,
})

describe('The Prompt hybrid reel visual selection (no spend)', () => {
  it('keeps the existing four still scenes unchanged without any clip metadata', () => {
    assert.deepEqual(planHybridSceneClips(make(undefined)), [null, null, null, null])
  })

  it('uses all four admitted 4s videos without loops, with bounded slow playback', () => {
    const plan = planHybridSceneClips(make([clip(1), clip(2), clip(3), clip(4)]))
    assert.equal(plan.length, 4)
    assert.ok(plan.every(Boolean))
    assert.ok(plan.every(v => v.playbackRate >= 0.25 && v.playbackRate < 1))
    assert.equal(plan[0].startFrame, 0)
    assert.equal(plan[3].startFrame + plan[3].displayFrames, 825)
    assert.ok(plan.every(v => Math.abs(v.displayFrames * v.playbackRate - 120) < 0.001))
  })

  it('preserves the approved still only where video is missing or unusable', () => {
    const plan = planHybridSceneClips(make([clip(1), null, {src:'http://unsafe.test/clip.mp4',durationFrames:120}, clip(4)]))
    assert.ok(plan[0])
    assert.equal(plan[1], null)
    assert.equal(plan[2], null)
    assert.ok(plan[3])
  })

  it('rejects a misaligned clip array rather than assigning a video to the wrong story scene', () => {
    assert.deepEqual(planHybridSceneClips(make([clip(1)])), [null, null, null, null])
  })

  it('never loops or invents durations for empty, fractional, infinite or huge clips', () => {
    const plan = planHybridSceneClips(make([
      clip(1, 0),clip(2, 120.5),clip(3, Infinity),clip(4, 100000),
    ]))
    assert.deepEqual(plan, [null, null, null, null])
  })

  it('reverts to a still if slow-motion would have to be unacceptably extreme', () => {
    const plan = planHybridSceneClips({
      sceneCount: 1,
      totalFrames: 30 * 45,
      outroFrames: 75,
      transitionFrames: 22,
      sceneVideos: [clip()],
    })
    assert.deepEqual(plan, [null])
  })

  it('refuses malformed source URLs, credentials, fragments and local file paths', () => {
    const plan = planHybridSceneClips(make([
      {src:'file:///C:/private.mp4',durationFrames:120},
      {src:'https://user:pass@assets.example.test/a.mp4',durationFrames:120},
      {src:'https://assets.example.test/a.mp4#fragment',durationFrames:120},
      {src:'not-a-url',durationFrames:120},
    ]))
    assert.deepEqual(plan, [null, null, null, null])
  })

  it('stops the last clip at the content boundary, not at the branded outro', () => {
    // Three image fallbacks and 28-second narration: stretching into the outro
    // formerly slowed the last clip far more than its neighbours.
    const plan = planHybridSceneClips({
      sceneCount: 3,
      totalFrames: 872,
      outroFrames: 75,
      transitionFrames: 22,
      sceneVideos: [clip(1,121),clip(2,121),clip(3,121)],
    })
    assert.ok(plan.every(Boolean))
    assert.equal(plan[2].startFrame + plan[2].displayFrames, 797)
    const rates = plan.map(p => p.playbackRate)
    assert.ok(Math.max(...rates) - Math.min(...rates) < 0.05)
  })

  it('does not generate a scene when image slots are absent or the timeline is inconsistent', () => {
    assert.deepEqual(planHybridSceneClips({sceneCount:0,totalFrames:900,outroFrames:75,transitionFrames:22,sceneVideos:[]}), [])
    assert.deepEqual(planHybridSceneClips({...make([clip(1),clip(2),clip(3),clip(4)]),totalFrames:70}), [null,null,null,null])
  })
})
