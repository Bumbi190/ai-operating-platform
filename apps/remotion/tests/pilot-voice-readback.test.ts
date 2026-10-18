import {test} from 'node:test'
import assert from 'node:assert/strict'
import {buildPilotVoiceReceipt} from '../../web/lib/media/pilot-voice-receipt'
import {verifyPilotStoredVoice} from '../../web/lib/media/pilot-voice-verify'

const projectId='11111111-1111-4111-8111-111111111111'
const scriptId='22222222-2222-4222-8222-222222222222'
const origin='https://sandbox.supabase.co/storage/v1/object/public/media-assets/'
const audioPath=`audio/${projectId}/${scriptId}.mp3`
const timingPath=`data/${projectId}/${scriptId}-timing.json`
const transcript='OpenAI tests a new AI agent capability without announcing a product launch.'
const words=Array.from({length:18},(_,i)=>({word:'Victoria',startMs:i*500,endMs:i*500+430}))
const durationMs=12000
const audio=Buffer.from(Array.from({length:800},(_,i)=>i%256))
const receipt=buildPilotVoiceReceipt(transcript,audio,words,durationMs)
const timing=Buffer.from(JSON.stringify({words,durationMs}))
function fixture(originUrl=origin){
  let reads=0
  let fromBucket=''
  const blobs:Record<string,Blob>={
    [audioPath]:new Blob([audio],{type:'audio/mpeg'}),
    [timingPath]:new Blob([timing],{type:'application/json'}),
  }
  const db={
    storage:{
      from(bucket:string){
        fromBucket=bucket
        return{
          getPublicUrl(path:string){return {data:{publicUrl:originUrl+path}}},
          async download(path:string){
            reads++
            return{data:blobs[path]??null,error:blobs[path]?null:{message:'not found'}}
          },
        }
      },
    },
  }
  const run=(args:{url?:string;timingUrl?:string;receipt?:unknown;projectId?:string;scriptId?:string;text?:string}={})=>
    verifyPilotStoredVoice(db,args.projectId??projectId,args.scriptId??scriptId,
      args.url??originUrl+audioPath,args.timingUrl??originUrl+timingPath,args.text??transcript,
      args.receipt===undefined?receipt:args.receipt)
  return {db,blobs,run,get reads(){return reads},get fromBucket(){return fromBucket}}
}
test('readback verifies both real storage paths, MP3 bytes and exact stored word timestamps',async()=>{
  const f=fixture()
  assert.deepEqual(await f.run(),{verified:true,reason:null})
  assert.equal(f.reads,2)
  assert.equal(f.fromBucket,'media-assets')
})
test('legacy content without a receipt must not read any storage bytes',async()=>{
  const f=fixture()
  assert.deepEqual(await f.run({receipt:null}),{verified:false,reason:'no_receipt'})
  assert.equal(f.reads,0)
})
test('media locator must be exact canonical project+script path, not an attacker URL',async()=>{
  const f=fixture()
  assert.equal((await f.run({url:'https://evil.example/file.mp3'})).reason,'invalid_locator')
  assert.equal((await f.run({url:origin+audioPath+'?download=true'})).reason,'invalid_locator')
  assert.equal((await f.run({projectId:'bad'})).reason,'invalid_locator')
  assert.equal((await f.run({scriptId:'99999999-9999-4999-8999-999999999999'})).reason,'invalid_locator')
  assert.equal(f.reads,0)
})
test('audio replacement is detected even when receipt looks valid',async()=>{
  const f=fixture()
  f.blobs[audioPath]=new Blob([Buffer.alloc(800,88)])
  const result=await f.run()
  assert.deepEqual(result,{verified:false,reason:'audio_mismatch'})
})
test('changed timing, word order and duration reject entire verification',async()=>{
  const f=fixture()
  f.blobs[timingPath]=new Blob([JSON.stringify({words:[...words].reverse(),durationMs})])
  assert.equal((await f.run()).reason,'timing_mismatch')
  f.blobs[timingPath]=new Blob([JSON.stringify({words,durationMs:durationMs+1000})])
  assert.equal((await f.run()).reason,'timing_mismatch')
})
test('truncated and oversized files fail without misleading success',async()=>{
  const f=fixture()
  f.blobs[audioPath]=new Blob([new Uint8Array(20)])
  assert.equal((await f.run()).reason,'audio_mismatch')
  f.blobs[audioPath]=new Blob([audio])
  f.blobs[timingPath]=new Blob([new Uint8Array(180001)])
  assert.equal((await f.run()).reason,'audio_mismatch')
})
test('wrong voice and tampered generation transcript never cause a storage read',async()=>{
  const f=fixture()
  assert.equal((await f.run({receipt:{...receipt,voiceId:'Megan'}})).reason,'invalid_receipt')
  assert.equal((await f.run({text:'Replacement text'})).reason,'invalid_receipt')
  assert.equal(f.reads,0)
})
test('unavailable/missing stored object fails closed',async()=>{
  const f=fixture()
  delete f.blobs[audioPath]
  assert.equal((await f.run()).reason,'storage_unavailable')
})

test('HTTP only allowed on a specifically opted-in isolated loopback, never a remote host',async()=>{
  const loop='http://127.0.0.1:56421/storage/v1/object/public/media-assets/'
  const local=fixture(loop)
  const prior=process.env.PILOT_STORAGE_TEST_MODE
  try{
    delete process.env.PILOT_STORAGE_TEST_MODE
    assert.equal((await local.run()).reason,'invalid_locator')
    process.env.PILOT_STORAGE_TEST_MODE='isolated-local'
    assert.deepEqual(await local.run(),{verified:true,reason:null})
    const remote=fixture('http://remote.example.net/storage/v1/object/public/media-assets/')
    assert.equal((await remote.run()).reason,'invalid_locator')
    assert.equal(remote.reads,0)
  }finally{
    if(prior===undefined)delete process.env.PILOT_STORAGE_TEST_MODE
    else process.env.PILOT_STORAGE_TEST_MODE=prior
  }
})

test('readback accepts identical word/timing values after JSON object keys reorder',async()=>{
 const f=fixture()
 f.blobs[timingPath]=new Blob([JSON.stringify({
  durationMs,words:words.map(w=>({endMs:w.endMs,word:w.word,startMs:w.startMs})),
 })])
 assert.deepEqual(await f.run(),{verified:true,reason:null})
})
