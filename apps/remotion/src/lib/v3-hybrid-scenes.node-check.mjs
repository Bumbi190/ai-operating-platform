import assert from 'node:assert/strict'
import {describe,it} from 'node:test'
import {planPrivateV3HybridShots} from './v3-hybrid-scenes.ts'

const plan={
  schema:'theprompt.v3.private-storyboard.v1',
  projectId:'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52',
  scriptId:'11111111-1111-4111-8111-111111111111',
  referenceSha256:'d23d62737aa04b4203159b0da0f775a88addf50274e16c79d3bfa12e8f092788',
  fps:30, contentFrames:660,outroFrames:75,totalFrames:735,
  safeAudioMilliseconds:22000,captionWordCount:44,
  editorialHold:{required:true,reasons:['operator_editorial_review_required'],overlay:'EDITORIAL HOLD'},
  canGenerate:false,canPublish:false,canSchedule:false,
  shots:Array.from({length:10},(_,index)=>({
    index,imageIndex:index%3,startFrame:index*66,durationFrames:66,
    transitionInFrames:index>0&&index%3===1?10:0,
    zoomFrom:1.03,zoomTo:1.13,panFrom:[0,0],panTo:[-9,-6],
  })),
}
const clip=(index,frames=120)=>({
  src:'https://private-media.example.test/storage/v1/object/sign/the-prompt/clip-'+index+'.mp4?token=signed',
  durationFrames:frames,
})
const run=(videos,override={})=>planPrivateV3HybridShots({
  plan,imageCount:3,sceneVideos:videos,...override,
})
const allStill=(shotCount=10)=>Array(shotCount).fill(null)

describe('The Prompt V3 hybrid PRIVATE shot policy – no spend, no publication',()=>{
  it('does not change existing image-only V3 montage when clips are absent',()=>{
    assert.deepEqual(run(undefined),allStill())
    assert.deepEqual(run([null,null,null]),allStill())
  })

  it('shows exactly one original MP4 per image index, never replaying it for later cuts',()=>{
    const shots=run([clip(0,49),clip(1,120),clip(2,110)])
    assert.equal(shots.length,10)
    assert.deepEqual(shots.map((v,i)=>v?i:null).filter(v=>v!==null),[0,1,2])
    assert.equal(shots[0].src,clip(0,49).src)
    assert.equal(shots[1].src,clip(1).src)
    assert.equal(shots[2].src,clip(2,110).src)
    assert.ok(shots.slice(3).every(v=>v===null))
  })

  it('fits a local 49-frame Wan portrait video into one short V3 shot without loops',()=>{
    const shots=run([clip(0,49),null,null])
    assert.equal(shots[0].startFrame,0)
    assert.equal(shots[0].displayFrames,66)
    assert.equal(shots[0].playbackRate,49/66)
    assert.equal(shots[0].durationFrames,49)
    assert.equal(shots[0].durationFrames/shots[0].playbackRate,66)
    assert.ok(shots.slice(1).every(v=>v===null))
  })

  it('rejects a slot-count mismatch and duplicate video URL across different image slots',()=>{
    assert.deepEqual(run([clip(0)]),allStill())
    assert.deepEqual(run([clip(0),clip(0),null]),allStill())
    assert.deepEqual(run([], {imageCount:6}),allStill())
  })

  it('falls back only the invalid source, refusing local URLs, credentials and fragments',()=>{
    const bad=[
      {src:'file:///C:/users/andre/private.mp4',durationFrames:120},
      {src:'http://private-media.example.test/clip.mp4',durationFrames:120},
      {src:'https://x:y@private-media.example.test/clip.mp4',durationFrames:120},
      {src:'https://private-media.example.test/clip.mp4#bad',durationFrames:120},
    ]
    for(const invalid of bad){
      const out=run([clip(0),invalid,null])
      assert.ok(out[0])
      assert.equal(out[1],null)
    }
  })

  it('does not speed a video beyond 2x or slow below 0.25x and never invents a duration',()=>{
    for(const durationFrames of [0,1,4,600,3601,NaN,Infinity,120.5]){
      const out=run([clip(0,durationFrames),null,null])
      assert.deepEqual(out,allStill())
    }
    assert.ok(run([clip(0,49),null,null])[0])
    assert.ok(run([clip(0,120),null,null])[0])
  })

  it('requires private editorial hold and refuses malformed or non-consecutive shot timelines',()=>{
    const badPlans=[
      {...plan,canPublish:true},
      {...plan,editorialHold:{required:false,reasons:[],overlay:''}},
      {...plan,canGenerate:true},
      {...plan,canSchedule:true},
      {...plan,contentFrames:735,totalFrames:810},
      {...plan,shots:plan.shots.map((s,i)=>i===3?{...s,startFrame:300}:s)},
      {...plan,shots:plan.shots.map((s,i)=>i===3?{...s,transitionInFrames:99}:s)},
    ]
    for(const p of badPlans){
      assert.deepEqual(run([clip(0),null,null],{plan:p}),allStill())
    }
  })

  it('keeps every MP4 entirely inside the narrated region, not the branded outro',()=>{
    const shots=run([clip(0),clip(1),clip(2)])
    assert.ok(shots.filter(Boolean).every(v=>v.startFrame+v.displayFrames<=plan.contentFrames))
    assert.equal(plan.totalFrames-plan.contentFrames,75)
    const invalid={...plan,shots:plan.shots.map((s,i)=>i===9?{...s,durationFrames:142}:s)}
    assert.deepEqual(run([clip(0),clip(1),clip(2)],{plan:invalid}),allStill())
  })
})
