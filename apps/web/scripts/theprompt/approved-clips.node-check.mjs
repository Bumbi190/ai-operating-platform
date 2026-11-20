import assert from 'node:assert/strict'
import {describe,it} from 'node:test'
import {inspectMp4,verifyClipBytes,inspectApprovedClipDirectory,ApprovedClipRefusal,APPROVED_CLIPS} from './approved-clips-preflight.mjs'

const box=(type,payload)=>{
 const header=Buffer.alloc(8)
 header.writeUInt32BE(payload.length+8,0)
 header.write(type,4,4,'ascii')
 return Buffer.concat([header,payload])
}
const movie=(width=720,height=1280,duration=4042,tracks=1)=>{
 const mvhd=Buffer.alloc(100)
 mvhd.writeUInt32BE(1000,12)
 mvhd.writeUInt32BE(duration,16)
 const children=[box('mvhd',mvhd)]
 for(let i=0;i<tracks;i++){
  const tkhd=Buffer.alloc(84)
  tkhd.writeUInt32BE(width*65536,76)
  tkhd.writeUInt32BE(height*65536,80)
  children.push(box('trak',box('tkhd',tkhd)))
 }
 return Buffer.concat([
  box('ftyp',Buffer.from('isom0000')),
  box('moov',Buffer.concat(children)),
  box('mdat',Buffer.alloc(10)),
 ])
}
const refusal=(fn,code)=>assert.throws(fn,e=>e instanceof ApprovedClipRefusal&&e.code===code)
describe('The Prompt four-file MP4 preflight (no cost or DB)',()=>{
 it('recognizes the expected vertical four-second MP4 container',()=>{
  assert.deepEqual(inspectMp4(movie()),{width:720,height:1280,durationMs:4042})
 })
 it('rejects landscape frames and wrong duration',()=>{
  refusal(()=>inspectMp4(movie(1280,720)),'video_metadata_mismatch')
  refusal(()=>inspectMp4(movie(720,1280,5000)),'video_metadata_mismatch')
 })
 it('rejects empty, corrupt and ambiguous-track MP4s',()=>{
  refusal(()=>inspectMp4(Buffer.alloc(3)),'invalid_mp4')
  refusal(()=>inspectMp4(movie(720,1280,4042,2)),'video_track_mismatch')
  const truncated=movie().subarray(0,140)
  refusal(()=>inspectMp4(truncated),'invalid_mp4')
 })
 it('refuses any substitution before examining its metadata',()=>{
  assert.equal(APPROVED_CLIPS.length,4)
  refusal(()=>verifyClipBytes(0,Buffer.alloc(3)),'size_mismatch')
  const bytes=Buffer.alloc(APPROVED_CLIPS[0].bytes)
  refusal(()=>verifyClipBytes(0,bytes),'hash_mismatch')
 })
 it('will not invent missing source files',async()=>{
  await assert.rejects(
   inspectApprovedClipDirectory('Z:/a/path/that/does/not/exist'),
   e=>e instanceof ApprovedClipRefusal&&e.code==='missing_file',
  )
 })
})
