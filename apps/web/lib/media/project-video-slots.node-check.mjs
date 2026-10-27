import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {resolveProjectVideoSlots} from './project-video-slots.ts'
import {buildVideoInputProps} from './video-props.ts'

const project = '11111111-1111-4111-8111-111111111111'
const otherProject = '22222222-2222-4222-8222-222222222222'
const firstId = '33333333-3333-4333-8333-333333333333'
const secondId = '44444444-4444-4444-8444-444444444444'
const base = {
  id: firstId, projectId: project, kind: 'video', mimeType: 'video/mp4',
  status: 'active', visibility: 'internal', durationMs: 4000,
  width: 720, height: 1280, byteSize: 1_426_884,
  checksumSha256: 'a'.repeat(64),
  storage: {bucket: 'media-assets-private', path: 'clips/approved-1.mp4'},
}
const src = 'https://storage.example.test/storage/v1/object/sign/media-assets-private/clip.mp4?token=signed'
const make = (override={}) => ({
  projectId: project, imageCount: 2, videoAssetIds: [firstId,null],
  load: async id => ({...base,id}),
  deliver: async () => src,
  ...override,
})
const refused = (promise,code) => assert.rejects(promise, e => e?.code === code)

describe('project-owned clip selector is read-only and preview-only', () => {
  it('keeps still images without any video selection, without storage or DB access', async () => {
    let calls=0
    const out=await resolveProjectVideoSlots(make({
      videoAssetIds: undefined,
      load: async()=>{calls++;throw Error('must not read')},
      deliver:async()=>{calls++;throw Error('must not sign')},
    }))
    assert.deepEqual(out,[null,null])
    assert.equal(calls,0)
  })

  it('resolves one active project-owned MP4 as 120 muted-render frames, preserving other still', async () => {
    let reads=0, signed=0
    const out=await resolveProjectVideoSlots(make({
      load:async id=>{reads++;assert.equal(id,firstId);return base},
      deliver:async asset=>{signed++;assert.equal(asset.id,firstId);return src},
    }))
    assert.deepEqual(out,[{src,durationFrames:120},null])
    assert.equal(reads,1)
    assert.equal(signed,1)
  })

  it('allows one approved id per scene with independent durations', async () => {
    const out=await resolveProjectVideoSlots(make({
      videoAssetIds:[firstId,secondId],
      load:async id=>({...base,id,durationMs:id===firstId?4000:5000}),
    }))
    assert.deepEqual(out,[{src,durationFrames:120},{src,durationFrames:150}])
  })

  it('rejects cross-project ID and does not sign any source', async () => {
    let signed=0
    await refused(resolveProjectVideoSlots(make({
      load:async()=>({...base,projectId:otherProject}),
      deliver:async()=>{signed++;return src},
    })),'project_mismatch')
    assert.equal(signed,0)
  })

  it('rejects missing or substituted asset identities rather than picking a different clip', async () => {
    await refused(resolveProjectVideoSlots(make({load:async()=>null})),'asset_unavailable')
    await refused(resolveProjectVideoSlots(make({
      load:async()=>({...base,id:secondId}),
    })),'invalid_asset')
  })

  it('rejects duplicate clip IDs so one clip cannot loop across scenes', async () => {
    let reads=0
    await refused(resolveProjectVideoSlots(make({
      videoAssetIds:[firstId,firstId],
      load:async()=>{reads++;return base},
    })),'invalid_slots')
    assert.equal(reads,0)
  })

  it('rejects invalid image/video slot counts and malformed uuids without IO', async () => {
    let reads=0
    await refused(resolveProjectVideoSlots(make({
      videoAssetIds:[firstId],
      load:async()=>{reads++;return base},
    })),'invalid_slots')
    await refused(resolveProjectVideoSlots(make({
      videoAssetIds:['https://storage.example.test/raw.mp4',null],
      load:async()=>{reads++;return base},
    })),'invalid_slots')
    assert.equal(reads,0)
  })

  it('rejects wrong type, MIME, visibility/storage mismatch and inactive status', async () => {
    for (const patch of [
      {kind:'image'}, {mimeType:'video/webm'}, {status:'archived'},
      {visibility:'public'}, {storage:{bucket:'random',path:'foo.mp4'}},
      {storage:{bucket:'media-assets-private',path:'../unsafe.mp4'}},
    ]) {
      await refused(resolveProjectVideoSlots(make({
        load:async()=>({...base,...patch}),
      })),'invalid_asset')
    }
  })

  it('rejects missing, implausible or non-9:16 duration and dimensions', async () => {
    for (const patch of [
      {durationMs:null}, {durationMs:0}, {durationMs:Infinity},
      {durationMs:999999}, {width:1920,height:1080},
      {width:0},{height:null},{byteSize:0},{checksumSha256:'invalid'},
    ]) {
      await refused(resolveProjectVideoSlots(make({load:async()=>({...base,...patch})})),'invalid_asset')
    }
  })

  it('rejects unsafe signed source URLs and signer failures without dispatch', async () => {
    for (const url of ['http://storage.example.test/clip.mp4','file:///etc/passwd',
      'https://evil:test@storage.example.test/clip.mp4',
      'https://storage.example.test/clip.mp4#fragment']) {
      await refused(resolveProjectVideoSlots(make({deliver:async()=>url})),'delivery_unavailable')
    }
    await refused(resolveProjectVideoSlots(make({deliver:async()=>{throw Error('secret')}})),'delivery_unavailable')
  })

  it('rejects a later cross-project scene BEFORE signing the earlier valid one', async () => {
    let signed=0
    await refused(resolveProjectVideoSlots(make({
      videoAssetIds:[firstId,secondId],
      load:async id=>({...base,id,projectId:id===secondId?otherProject:project}),
      deliver:async()=>{signed++;return src},
    })),'project_mismatch')
    assert.equal(signed,0)
  })

  it('passes resolved canonical clips to the legacy-safe Remotion props builder', async () => {
    const sceneVideos=await resolveProjectVideoSlots(make())
    const props=await buildVideoInputProps({
      hook:'Verified news',audioUrl:'https://media.example.test/voice.mp3',
      timingUrl:'',durationMs:28000,
      images:['https://media.example.test/a.png','https://media.example.test/b.png'],
      sceneVideos,
    })
    assert.deepEqual(props.sceneVideos,[{src,durationFrames:120},null])
    assert.equal(props.audioUrl,'https://media.example.test/voice.mp3')
    assert.equal(props.images.length,2)
  })

  it('requires a trustworthy project context', async () => {
    await refused(resolveProjectVideoSlots(make({projectId:'not-a-project'})),'invalid_slots')
  })
})
