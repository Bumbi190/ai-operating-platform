/**
 * Side-effect-free validation of the four owner-approved The Prompt MP4 source
 * clips. It has no dependency on Supabase, credentials, FFmpeg, or Remotion.
 *
 * No URL, generated model content, or file supplied by a caller is trusted as
 * a canonical asset. This only proves bytes match the locally approved set.
 */
import {readFile,lstat} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'

export const APPROVED_CLIPS=Object.freeze([
  {name:'scene-0.mp4',bytes:1426884,sha256:'49746093ad9b181baa1ba4b03e3a6e9e1f71599a63ef4b2ae67f15149db382fc'},
  {name:'scene-1.mp4',bytes:1131423,sha256:'daaea5052ffbb562f5bfe34395e944578019803fd64ee018c1aba8548e1b573f'},
  {name:'scene-2.mp4',bytes:1116608,sha256:'50bb2b0b057e9524cd2c4b855b83c9241115739219d1e3fbb91d770d886b09ff'},
  {name:'scene-3.mp4',bytes:1388344,sha256:'3df309b86c5bb79e0a7cac9352e674005f01504ee96a9ab0a8bf7e380c0fe7eb'},
])

export class ApprovedClipRefusal extends Error {
  constructor(code){
    super('APPROVED_CLIP_REFUSED')
    this.name='ApprovedClipRefusal'
    this.code=code
  }
}

function boxList(buffer,start=0,end=buffer.length) {
  const boxes=[]
  let offset=start
  for(let n=0;offset+8<=end && n<10000;n++){
    let size=buffer.readUInt32BE(offset)
    let header=8
    if(size===1){
      if(offset+16>end)throw new ApprovedClipRefusal('invalid_mp4')
      const large=buffer.readBigUInt64BE(offset+8)
      if(large>BigInt(Number.MAX_SAFE_INTEGER))throw new ApprovedClipRefusal('invalid_mp4')
      size=Number(large)
      header=16
    }else if(size===0){
      size=end-offset
    }
    if(size<header || offset+size>end)throw new ApprovedClipRefusal('invalid_mp4')
    boxes.push({type:buffer.toString('ascii',offset+4,offset+8),start:offset+header,end:offset+size})
    offset+=size
  }
  if(offset!==end)throw new ApprovedClipRefusal('invalid_mp4')
  return boxes
}

/** Inspect the MP4 container, not full decoded footage. */
export function inspectMp4(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length<100)throw new ApprovedClipRefusal('invalid_mp4')
  const top=boxList(buffer)
  const ftyp=top.find(b=>b.type==='ftyp')
  const moov=top.find(b=>b.type==='moov')
  if(!ftyp||!moov)throw new ApprovedClipRefusal('invalid_mp4')
  const children=boxList(buffer,moov.start,moov.end)
  const mvhd=children.find(b=>b.type==='mvhd')
  if(!mvhd)throw new ApprovedClipRefusal('invalid_mp4')
  const version=buffer[mvhd.start]
  if(version!==0&&version!==1)throw new ApprovedClipRefusal('invalid_mp4')
  const offset=mvhd.start
  if((version===0&&offset+20>mvhd.end)||(version===1&&offset+32>mvhd.end)){
    throw new ApprovedClipRefusal('invalid_mp4')
  }
  const timescale=version===0?buffer.readUInt32BE(offset+12):buffer.readUInt32BE(offset+20)
  const duration=version===0?buffer.readUInt32BE(offset+16):
    Number(buffer.readBigUInt64BE(offset+24))
  if(!timescale||!Number.isSafeInteger(duration))throw new ApprovedClipRefusal('invalid_mp4')

  const tracks=children.filter(b=>b.type==='trak').flatMap(b=>
    boxList(buffer,b.start,b.end).filter(t=>t.type==='tkhd').map(t=>{
      if(t.end-t.start<32)throw new ApprovedClipRefusal('invalid_mp4')
      return {
        width:buffer.readUInt32BE(t.end-8)/65536,
        height:buffer.readUInt32BE(t.end-4)/65536,
      }
    }),
  ).filter(t=>t.width>0&&t.height>0)
  if(tracks.length!==1)throw new ApprovedClipRefusal('video_track_mismatch')
  const {width,height}=tracks[0]
  const durationMs=Math.round(duration*1000/timescale)
  if(width!==720||height!==1280||durationMs!==4042)throw new ApprovedClipRefusal('video_metadata_mismatch')
  return {width,height,durationMs}
}

export function verifyClipBytes(index,bytes){
  const expected=APPROVED_CLIPS[index]
  if(!expected||!Buffer.isBuffer(bytes))throw new ApprovedClipRefusal('invalid_input')
  if(bytes.length!==expected.bytes)throw new ApprovedClipRefusal('size_mismatch')
  const sha256=createHash('sha256').update(bytes).digest('hex')
  if(sha256!==expected.sha256)throw new ApprovedClipRefusal('hash_mismatch')
  const media=inspectMp4(bytes)
  // A deterministic path is safe to retry only after the canonical asset
  // register confirms this content has already been admitted.
  const storagePath='the-prompt/provreel-20261022/'+
    expected.name.replace('.mp4','')+'-'+sha256.slice(0,24)
  return {index,name:expected.name,size:expected.bytes,sha256,storagePath,...media}
}

export async function inspectApprovedClipDirectory(sourceDir){
  if(typeof sourceDir!=='string'||!sourceDir.trim())throw new ApprovedClipRefusal('source_dir_required')
  const root=resolve(sourceDir)
  const results=[]
  for(let i=0;i<APPROVED_CLIPS.length;i++){
    const filename=APPROVED_CLIPS[i].name
    const filepath=join(root,filename)
    let st
    try{st=await lstat(filepath)}catch{throw new ApprovedClipRefusal('missing_file')}
    if(!st.isFile()||st.isSymbolicLink())throw new ApprovedClipRefusal('unsafe_file')
    if(st.size!==APPROVED_CLIPS[i].bytes)throw new ApprovedClipRefusal('size_mismatch')
    let content
    try{content=await readFile(filepath)}catch{throw new ApprovedClipRefusal('read_failed')}
    results.push({...verifyClipBytes(i,content),filepath})
  }
  return results
}
